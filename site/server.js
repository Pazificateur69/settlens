#!/usr/bin/env node
// Production host for the generated site (site/public by default), the pilot intake, the
// authenticated scan API and the MCP endpoint (/mcp). Run `node site/build.js` first. Behind nginx set TRUST_PROXY=1.
// Static files are sent precompressed (file.br / file.gz written by the build) when the client accepts it.

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTarget } from "../src/config.js";
import { createMcpHttpHandler } from "../src/mcp-http.js";
import { assertPublicDestination } from "../src/net-guard.js";
import { createReport, scanTarget } from "../src/scanner.js";
import { site } from "./src/data/site.js";
import { NotificationStore, drainNotifications } from "../src/notification-queue.js";
import { createMonitorApi } from "./monitor-api.js";
import { createEmailNotifications } from "../src/notifications.js";

const DEFAULT_ROOT = fileURLToPath(new URL("./public", import.meta.url));
const MAX_BODY = 32 * 1024;
const MAX_BUCKETS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PILOT_RETENTION_MS = 365 * DAY_MS;
// Above this size new leads are no longer stored (the webhook may still deliver them): a flood of
// submissions cannot fill the host disk, and the daily retention pass reads a bounded file.
const PILOT_STORE_MAX_BYTES = 20 * 1024 * 1024;
const PILOT_FIELD_LIMITS = Object.freeze({ name: 200, email: 320, company: 200, message: 4_000 });
const PLACEHOLDER_TOKEN = "replace-with-a-long-random-token";
const MIN_TOKEN_LENGTH = 32;

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  // site.js writes no HTML: no DOM sink may take a string, and no Trusted Types policy may be created.
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join("; ");

export const SECURITY_HEADERS = Object.freeze({
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-site",
  // Ignored over plain HTTP (RFC 6797 §8.1). Add includeSubDomains/preload only once every subdomain serves HTTPS.
  "strict-transport-security": "max-age=63072000",
});

// URLs of the previous site, mapped to the closest current page.
export const LEGACY_REDIRECTS = Object.freeze({
  "/confidentialite": "/privacy",
  "/mentions-legales": "/legal",
  "/securite-agents-ia": "/mcp",
  "/audit-devsecops": "/product/ci",
  "/exemple-rapport": "/docs/reports",
  "/docs/EVIDENCE.md": "/docs/evidence",
  "/docs/METHODOLOGY.md": "/docs/methodology",
  "/docs/THREAT_MODEL.md": "/docs/security",
  "/docs/SECURITY.md": "/docs/security",
  "/favicon.ico": "/assets/favicon.svg",
});

// Pages of the previous site with no current equivalent: 410 Gone rather than a soft 404 to the home page.
export const GONE = Object.freeze(new Set(["/audit-n8n", "/analyse-n8n", "/checklist-automatisation-ia"]));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".mp4": "video/mp4",
};

const FINGERPRINTED = /\.[a-f0-9]{10}\.(?:css|js|woff2)$/;
// Sent as `Speculation-Rules: "<path>"` with every HTML response; Chrome ignores the file under application/json.
export const SPECULATION_RULES_PATH = "/speculation-rules.json";
// Precompressed siblings written by site/build.js, best first.
const ENCODINGS = [
  ["br", ".br"],
  ["gzip", ".gz"],
];

const SOURCE_PATH = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;

/** Clean-URL normalisation: collapses slashes, drops trailing slash and .html, applies legacy redirects. */
export function redirectFor(pathname) {
  let path = `/${pathname.replace(/\/{2,}/g, "/").replace(/^\/+/, "")}`;
  path = path.replace(/\/+$/, "") || "/";
  path = path.replace(/\/index\.html$/, "") || "/";
  path = path.replace(/\.html$/, "") || "/";
  const target = LEGACY_REDIRECTS[path] ?? path;
  return target === pathname ? null : target;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function redirect(res, status, location, cacheControl = "no-store") {
  res.writeHead(status, { location, "cache-control": cacheControl, "content-length": 0 });
  res.end();
}

function methodNotAllowed(res, allow) {
  sendJson(res, 405, { error: "Method not allowed." }, { allow });
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text) {
  try {
    const value = JSON.parse(text || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // fall through to the uniform error below
  }
  throw httpError(400, "Request body must be a valid JSON object.");
}

// Every destination the scan API reaches must be public (net-guard: literal and resolved addresses).
async function assertPublicUrl(value) {
  try {
    return await assertPublicDestination(value);
  } catch (error) {
    throw httpError(400, error.message);
  }
}

/**
 * Creates (without listening) the site HTTP server. Every option defaults to its environment variable:
 * root (SITE_ROOT), trustProxy (TRUST_PROXY=1), apiToken (SETTLENS_API_TOKEN), pilotStore (PILOT_STORE),
 * pilotWebhookUrl (PILOT_WEBHOOK_URL), pilotWebhookSecret (PILOT_WEBHOOK_SECRET),
 * pilotWebhookDisclosed (PILOT_WEBHOOK_DISCLOSED=1), mcpExtraOrigins (MCP_EXTRA_ORIGINS, comma-separated).
 */
export function createSiteServer(options = {}) {
  const env = process.env;
  const config = {
    root: resolve(options.root ?? env.SITE_ROOT ?? DEFAULT_ROOT),
    trustProxy: options.trustProxy ?? env.TRUST_PROXY === "1",
    apiToken: options.apiToken ?? env.SETTLENS_API_TOKEN,
    pilotStore: options.pilotStore ?? env.PILOT_STORE,
    pilotWebhookUrl: options.pilotWebhookUrl ?? env.PILOT_WEBHOOK_URL,
    pilotWebhookSecret: options.pilotWebhookSecret ?? env.PILOT_WEBHOOK_SECRET,
    pilotWebhookDisclosed: options.pilotWebhookDisclosed ?? env.PILOT_WEBHOOK_DISCLOSED === "1",
    // Never derived from the request's Host: under DNS rebinding the attacker's Origin and Host match.
    mcpExtraOrigins: options.mcpExtraOrigins ?? (env.MCP_EXTRA_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
    rateLimit: options.rateLimit ?? 30,
    rateWindowMs: options.rateWindowMs ?? 60_000,
    pilotRateLimit: options.pilotRateLimit ?? 5,
    pilotWindowMs: options.pilotWindowMs ?? 15 * 60_000,
  };
  // A placeholder or short token would let anyone who read the repository use the network tools.
  if (config.apiToken && (config.apiToken.length < MIN_TOKEN_LENGTH || config.apiToken === PLACEHOLDER_TOKEN)) {
    console.error(`SETTLENS_API_TOKEN is a placeholder or shorter than ${MIN_TOKEN_LENGTH} characters: /api/scan and the MCP network tools are disabled.`);
    config.apiToken = undefined;
  }
  // /privacy says pilot requests are not forwarded to any form, CRM or messaging service: a webhook
  // must not be switched on by a config change alone, only after that notice has been updated.
  if (config.pilotWebhookUrl && !config.pilotWebhookDisclosed) {
    throw new Error("PILOT_WEBHOOK_URL is set but PILOT_WEBHOOK_DISCLOSED=1 is not: update /privacy to disclose the webhook recipient first, then set PILOT_WEBHOOK_DISCLOSED=1.");
  }
  const emailNotifications = options.emailNotifications ?? createEmailNotifications(env);
  const pilotNotifications = config.pilotStore && emailNotifications?.pilot ? new NotificationStore(`${config.pilotStore}.notifications.json`) : null;
  let pilotDelivering = false;
  async function flushPilotNotifications() {
    if (!pilotNotifications || pilotDelivering) return;
    pilotDelivering = true;
    try { await drainNotifications(pilotNotifications, (job) => emailNotifications.pilot(job.payload)); }
    catch { console.error("Settlens pilot notification queue unavailable; pending jobs remain stored."); }
    finally { pilotDelivering = false; }
  }
  const pilotDeliveryTimer = pilotNotifications ? setInterval(flushPilotNotifications, 60000) : null;
  pilotDeliveryTimer?.unref();
  if (pilotNotifications) flushPilotNotifications();
  const buckets = new Map();

  // nginx appends the address it saw as the LAST X-Forwarded-For entry; earlier entries are client-supplied.
  function clientIp(req) {
    if (config.trustProxy) {
      const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((part) => part.trim()).filter(Boolean);
      if (forwarded.length) return forwarded.at(-1);
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  // MCP Streamable HTTP: network tools only with the same bearer token as /api/scan.
  const mcpHandler = createMcpHttpHandler({ apiToken: config.apiToken, clientIp, extraOrigins: config.mcpExtraOrigins });

  function limited(ip, bucket, max = config.rateLimit, windowMs = config.rateWindowMs) {
    const now = Date.now();
    if (buckets.size > MAX_BUCKETS) {
      for (const [key, entry] of buckets) if (now - entry.started > entry.windowMs) buckets.delete(key);
      if (buckets.size > MAX_BUCKETS) buckets.clear(); // bounded memory and work under a flood of distinct clients
    }
    const key = `${bucket}:${ip}`;
    const current = buckets.get(key);
    if (!current || now - current.started > windowMs) {
      buckets.set(key, { started: now, count: 1, windowMs });
      return false;
    }
    current.count += 1;
    return current.count > max;
  }

  function tokenOk(req) {
    const expected = config.apiToken;
    const received = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (!expected || !received) return false;
    // Fixed-length digests: the comparison leaks neither the content nor the length of the token.
    const digest = (value) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(expected), digest(received));
  }

  if (config.apiToken && (options.monitorToken ?? env.SETTLENS_MONITOR_TOKEN) === config.apiToken) throw new Error("Use a separate monitoring token; never reuse the scan API credential in a browser.");
  const monitor = createMonitorApi({
    token: options.monitorToken ?? env.SETTLENS_MONITOR_TOKEN,
    storePath: options.monitorStore ?? env.MONITOR_STORE,
    origin: options.monitorOrigin ?? env.MONITOR_ORIGIN ?? site.origin,
    intervalMs: options.monitorIntervalMs ?? Number(env.MONITOR_INTERVAL_MS ?? 0),
    webhookUrl: options.monitorWebhookUrl ?? env.MONITOR_WEBHOOK_URL,
    webhookSecret: options.monitorWebhookSecret ?? env.MONITOR_WEBHOOK_SECRET,
    failOn: options.monitorFailOn ?? env.MONITOR_FAIL_ON ?? "high",
    fetchImpl: options.monitorFetchImpl,
    resolver: options.monitorResolver,
    clientIp, limited, emailNotifications, pilotNotifications,
    reminderMs: options.monitorReminderMs ?? Number(env.MONITOR_REMINDER_MS ?? 86400000),
    emailLogin: options.monitorEmailLogin ?? env.SETTLENS_EMAIL_LOGIN === "1",
  });

  async function scanApi(req, res) {
    // Limited before the token check, so failed attempts count too.
    if (limited(clientIp(req), "scan")) return sendJson(res, 429, { error: "Rate limit exceeded." });
    if (!tokenOk(req)) return sendJson(res, 401, { error: "Authentication required." });
    const input = parseJson(await readBody(req));
    if (typeof input.url !== "string" || input.url.length > 2048) return sendJson(res, 400, { error: "url is required and must be at most 2048 characters." });
    // String only: the object form would let API callers set facilitator headers and timeouts.
    if (input.facilitator !== undefined && (typeof input.facilitator !== "string" || input.facilitator.length > 2048)) {
      return sendJson(res, 400, { error: "facilitator must be a URL string of at most 2048 characters." });
    }
    await assertPublicUrl(input.url);
    if (input.facilitator) await assertPublicUrl(input.facilitator);
    const target = normalizeTarget({ url: input.url, method: "GET", ...(input.facilitator ? { facilitator: input.facilitator } : {}) });
    const result = await scanTarget(target, { timeoutMs: 8_000, repeat: 2, active: false, authorized: false });
    return sendJson(res, 200, createReport([result], { source: "settlens-web-api" }));
  }

  // Every store write goes through this queue, so the retention rewrite never races an append.
  let storeQueue = Promise.resolve();
  function queued(task) {
    const run = storeQueue.then(task);
    storeQueue = run.catch(() => {});
    return run;
  }

  // Drops entries older than PILOT_RETENTION_MS (temporary file + atomic rename). Runs at startup and
  // daily, off the request path; the store is capped at PILOT_STORE_MAX_BYTES, so reading it whole is bounded.
  function prunePilotStore() {
    return queued(async () => {
      const tmp = `${config.pilotStore}.${randomUUID()}.tmp`;
      try {
        const existing = await readFile(config.pilotStore, "utf8");
        const cutoff = Date.now() - PILOT_RETENTION_MS;
        const kept = existing.split("\n").filter((entry) => {
          if (!entry.trim()) return false;
          try {
            return !(Date.parse(JSON.parse(entry).receivedAt) < cutoff); // unparseable lines and dates are kept
          } catch {
            return true;
          }
        });
        await writeFile(tmp, kept.map((entry) => `${entry}\n`).join(""), { mode: 0o600 });
        await rename(tmp, config.pilotStore);
      } catch (error) {
        await rm(tmp, { force: true }).catch(() => {});
        if (error.code !== "ENOENT") console.error("pilot store retention pass failed", error.message);
      }
    });
  }

  function storePilot(submission) {
    return queued(async () => {
      const size = await stat(config.pilotStore).then((info) => info.size, (error) => (error.code === "ENOENT" ? 0 : Promise.reject(error)));
      if (size > PILOT_STORE_MAX_BYTES) {
        console.error(`ALERT pilot store is over ${PILOT_STORE_MAX_BYTES} bytes: new leads are not stored until it is cleaned.`);
        throw httpError(503, "Pilot store is full.");
      }
      await appendFile(config.pilotStore, `${JSON.stringify(submission)}\n`, { mode: 0o600 });
    });
  }

  let retentionTimer;
  if (config.pilotStore) {
    prunePilotStore();
    retentionTimer = setInterval(prunePilotStore, DAY_MS);
    retentionTimer.unref();
  }

  async function deliverPilot(submission) {
    let delivered = false;
    if (pilotNotifications) {
      // This durable payload is itself a receipt, even if the secondary JSONL append fails.
      // Insert before the append, so a crash between those operations cannot lose its email.
      await pilotNotifications.enqueue({ key: `pilot:${submission.id}`, kind: "pilot.email", payload: submission });
      delivered = true;
    }
    if (config.pilotStore) {
      try {
        await storePilot(submission);
        delivered = true;
      } catch (error) {
        console.error("pilot store failed", error.message);
      }
    }
    if (config.pilotWebhookUrl) {
      try {
        const payload = JSON.stringify(submission);
        const headers = { "content-type": "application/json", "user-agent": "Settlens-site/1.0" };
        if (config.pilotWebhookSecret) headers["x-settlens-signature"] = createHmac("sha256", config.pilotWebhookSecret).update(payload).digest("hex");
        const response = await fetch(config.pilotWebhookUrl, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(5_000), redirect: "error" });
        if (response.ok) delivered = true;
        else console.error(`Pilot webhook returned ${response.status}.`);
      } catch (error) {
        console.error("pilot webhook failed", error.message);
      }
    }
    if (pilotNotifications) await flushPilotNotifications();
    else if (emailNotifications) {
      const delivery = await emailNotifications.pilot(submission);
      if (delivery.delivered) delivered = true;
      else console.error("ALERT Settlens pilot email delivery failed; check SMTP configuration. Stored submissions remain available.");
    }
    return delivered;
  }

  // A browser on another site must not submit leads through its visitors (Origin and Host are set by the
  // browser and kept by nginx; non-browser clients are bounded by the rate limit).
  function crossSite(req) {
    if (req.headers["sec-fetch-site"] === "cross-site") return true;
    const origin = req.headers.origin;
    if (origin === undefined) return false;
    try {
      return new URL(origin).host !== req.headers.host;
    } catch {
      return true; // includes Origin: null
    }
  }

  // JSON clients get JSON; a plain HTML form post (no JS) gets a 303 back to its page with a status anchor.
  async function pilotApi(req, res) {
    const contentType = req.headers["content-type"] ?? "";
    const isForm = /^application\/x-www-form-urlencoded\b/i.test(contentType);
    let source = "/contact";
    const fail = (status, error) => (isForm ? redirect(res, 303, `${source}#pilot-error`) : sendJson(res, status, { error }));
    const accepted = () => (isForm ? redirect(res, 303, `${source}#pilot-sent`) : sendJson(res, 202, { ok: true }));
    if (crossSite(req)) return fail(403, "Cross-site submissions are not accepted.");
    if (!isForm && !/^application\/json\b/i.test(contentType)) return sendJson(res, 415, { error: "Content-Type must be application/json or a form post." });
    if (limited(clientIp(req), "pilot", config.pilotRateLimit, config.pilotWindowMs)) return fail(429, "Too many requests. Try again later.");
    let input;
    try {
      const text = await readBody(req);
      input = isForm ? Object.fromEntries(new URLSearchParams(text)) : parseJson(text);
    } catch (error) {
      return fail(error.status ?? 400, error.message);
    }
    if (typeof input.source === "string" && SOURCE_PATH.test(input.source)) source = input.source;
    // Honeypot field, hidden from people and assistive technology: a filled one is a bot. Answer as if accepted.
    if (typeof input.website === "string" && input.website.trim()) return accepted();
    if (Object.entries(PILOT_FIELD_LIMITS).some(([key, max]) => typeof input[key] !== "string" || !input[key].trim() || input[key].length > max)) return fail(400, "All fields are required and must be valid.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return fail(400, "A valid email is required.");
    if (!config.pilotStore && !config.pilotWebhookUrl) {
      console.warn("Pilot received but neither PILOT_STORE nor PILOT_WEBHOOK_URL is configured");
      return fail(503, "Pilot intake is not configured yet.");
    }
    const submission = {
      id: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim(),
      company: input.company.trim(),
      message: input.message.trim(),
      page: source,
      receivedAt: new Date().toISOString(),
      source: "settlens-site",
    };
    if (!(await deliverPilot(submission))) return fail(502, "Could not record your request. Please email us directly.");
    return accepted();
  }

  async function findFile(path) {
    try {
      const info = await stat(path);
      return info.isFile() ? { path, info } : null;
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    }
  }

  // Maps a decoded URL path to a file under root; dot-segments (incl. "..") never resolve.
  async function resolveFile(decodedPath) {
    const segments = decodedPath.split("/").filter(Boolean);
    if (decodedPath.includes("\0") || segments.some((segment) => segment.startsWith(".") && segment !== ".well-known")) return null;
    const base = resolve(config.root, ...segments);
    if (base !== config.root && !base.startsWith(config.root + sep)) return null;
    return (await findFile(base)) ?? (await findFile(join(base, "index.html")));
  }

  // Content-derived ETags survive a redeploy (every image build rewrites every mtime, not the content).
  // One entry per served path, recomputed when its size or mtime changes.
  const etags = new Map();
  async function etagOf(file) {
    const stamp = `${file.info.size}:${file.info.mtimeMs}`;
    const cached = etags.get(file.path);
    if (cached?.stamp === stamp) return cached.etag;
    const etag = `"${createHash("sha256").update(await readFile(file.path)).digest("base64url").slice(0, 16)}"`;
    etags.set(file.path, { stamp, etag });
    return etag;
  }

  // file.br / file.gz in the client's q-value order (RFC 9110 §12.5.3: q=0 refuses, "*" covers unlisted codings,
  // x-gzip is gzip; ties go to br), otherwise the file itself.
  async function negotiate(req, file) {
    const weights = new Map();
    for (const part of String(req.headers["accept-encoding"] ?? "").toLowerCase().split(",")) {
      const [name, ...params] = part.split(";").map((piece) => piece.trim());
      const q = params.find((param) => param.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      weights.set(name === "x-gzip" ? "gzip" : name, Number.isFinite(weight) ? weight : 1);
    }
    const ranked = ENCODINGS.map(([coding, suffix]) => ({ coding, suffix, q: weights.get(coding) ?? weights.get("*") ?? 0 }))
      .filter(({ q }) => q > 0)
      .sort((a, b) => b.q - a.q); // stable: equal weights keep ENCODINGS order
    for (const { coding, suffix } of ranked) {
      const encoded = await findFile(file.path + suffix);
      if (encoded) return { ...encoded, coding };
    }
    return file;
  }

  // Type and cache policy come from the requested file; body, length and ETag from the negotiated one.
  async function sendFile(req, res, original, status, extraHeaders = {}) {
    const ext = extname(original.path);
    const cacheControl = ext === ".html" ? "no-cache" : FINGERPRINTED.test(basename(original.path)) ? "public, max-age=31536000, immutable" : "public, max-age=86400";
    const file = await negotiate(req, original);
    const etag = await etagOf(file);
    const headers = {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": cacheControl,
      etag,
      vary: [res.getHeader("vary"), "Accept-Encoding"].filter(Boolean).join(", "), // keeps /mcp's Vary: Accept
      ...(file.coding ? { "content-encoding": file.coding } : {}),
      ...(ext === ".html" ? { "speculation-rules": `"${SPECULATION_RULES_PATH}"` } : {}),
      ...extraHeaders,
    };
    const candidates = String(req.headers["if-none-match"] ?? "").split(",").map((tag) => tag.trim().replace(/^W\//, ""));
    if (status === 200 && (candidates.includes(etag) || candidates.includes("*"))) {
      res.writeHead(304, headers);
      return res.end();
    }
    if (req.method === "HEAD") {
      res.writeHead(status, { ...headers, "content-length": file.info.size });
      return res.end();
    }
    const body = await readFile(file.path);
    res.writeHead(status, { ...headers, "content-length": body.length });
    res.end(body);
  }

  async function notFound(req, res, status = 404) {
    const page = await findFile(join(config.root, "404.html"));
    if (page) return sendFile(req, res, page, status);
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
    return res.end(req.method === "HEAD" ? undefined : "Not found.\n");
  }

  // Per-path headers: Markdown alternates point search engines to their HTML page (canonical only: noindex next to a
  // canonical to another URL is a contradictory signal); the llms files are for agents, never search results.
  function pathHeaders(path) {
    if (["/assets/monitor.js", "/assets/monitor.css"].includes(path)) return { "cache-control": "no-cache" };
    if (path === SPECULATION_RULES_PATH) return { "content-type": "application/speculationrules+json", "cache-control": "no-cache" };
    if (path.endsWith(".md")) {
      const canonical = `${site.origin}${path === "/index.md" ? "/" : path.slice(0, -3)}`;
      return { link: `<${canonical}>; rel="canonical"`, "cache-control": "no-cache" };
    }
    if (/^\/llms(?:-full)?\.txt$/.test(path)) return { "x-robots-tag": "noindex" };
    return {};
  }

  async function serveStatic(req, res, url) {
    const target = redirectFor(url.pathname);
    if (target) return redirect(res, 301, `${target}${url.search}`, "public, max-age=3600");
    if (GONE.has(url.pathname)) return notFound(req, res, 410);
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return notFound(req, res);
    }
    // Precompressed siblings are reached through Accept-Encoding only.
    if (/\.(?:br|gz)$/.test(decoded)) return notFound(req, res);
    const file = await resolveFile(decoded);
    return file ? sendFile(req, res, file, 200, pathHeaders(decoded)) : notFound(req, res);
  }

  async function handle(req, res) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    // Concatenate rather than resolve, so "//host/x" stays a path instead of becoming an authority.
    const target = req.url ?? "/";
    let url;
    try {
      url = target.startsWith("/") ? new URL(`http://localhost${target}`) : new URL(target, "http://localhost");
    } catch {
      return sendJson(res, 400, { error: "Bad request." });
    }
    const method = req.method ?? "GET";
    const readable = method === "GET" || method === "HEAD";
    if (url.pathname === "/mcp") {
      // Every non-GET/HEAD request and a GET asking for an event stream (what MCP clients send) go to
      // the MCP transport (405 on GET); any other GET/HEAD, from a browser, crawler or link checker,
      // gets the /mcp documentation page.
      const accept = String(req.headers.accept ?? "");
      res.setHeader("vary", "Accept");
      if (!readable || /\btext\/event-stream\b/i.test(accept)) return mcpHandler(req, res);
    }
    if (url.pathname === "/dashboard" || url.pathname === "/api/monitor" || url.pathname.startsWith("/api/monitor/")) return monitor.handle(req, res, url);
    if (url.pathname === "/health") return readable ? sendJson(res, 200, { ok: true }) : methodNotAllowed(res, "GET, HEAD");
    if (url.pathname === "/api/pilot") return method === "POST" ? pilotApi(req, res) : methodNotAllowed(res, "POST");
    if (url.pathname === "/api/scan") return method === "POST" ? scanApi(req, res) : methodNotAllowed(res, "POST");
    if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Not found." });
    if (!readable) return methodNotAllowed(res, "GET, HEAD");
    return serveStatic(req, res, url);
  }

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error.status ?? (error.code ? 500 : 400);
      if (status >= 500) console.error("request failed", error);
      sendJson(res, status, { error: status >= 500 ? "Internal server error." : error.message });
    }
  });
  server.on("close", () => { clearInterval(retentionTimer); if (pilotDeliveryTimer) clearInterval(pilotDeliveryTimer); monitor.close(); emailNotifications?.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "127.0.0.1";
  const root = resolve(process.env.SITE_ROOT ?? DEFAULT_ROOT);
  if (!existsSync(join(root, "index.html"))) console.warn(`No built site in ${root}. Run: node site/build.js`);
  createSiteServer().listen(port, host, () => console.log(`Settlens site listening on ${host}:${port}`));
}
