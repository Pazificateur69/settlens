// Single-owner private workspace. Dedicated token, short-lived sessions, no browser storage.
import { createHash, randomBytes, randomUUID, randomInt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeTarget } from "../src/config.js";
import { assertPublicDestination } from "../src/net-guard.js";
import { MonitorStore, verifyHistoryEntry } from "../src/monitor-store.js";
import { nextMonitorHeartbeat } from "../src/monitor-health.js";
import { approveReference, audit, updateIncident, validatePricePolicy } from "../src/monitor-lifecycle.js";
import { drainNotifications, publicDeliveries, retryNotification } from "../src/notification-queue.js";
import { stateKey } from "../src/monitor.js";
import { blockingAlerts, deliverMonitorWebhook } from "../src/monitor-webhook.js";
import { renderHistoryHtml } from "../src/monitor-report.js";
import { sanitizeUrl, stableStringify } from "../src/utils.js";
const COOKIE = "settlens_monitor";
const SESSION_MS = 3600000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = (value) => createHash("sha256").update(value).digest();
function equal(left, right) { return Boolean(left && right) && timingSafeEqual(digest(left), digest(right)); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) throw fail(413, "Request body too large.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch { /* uniform error */ }
  throw fail(400, "Expected a JSON object.");
}
function json(res, status, value, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...headers });
  res.end(JSON.stringify(value));
}
export function createMonitorApi({ token, storePath, origin = "https://settlens.com", intervalMs = 0, webhookUrl, webhookSecret, failOn = "high", clientIp, limited, emailNotifications, emailLogin = false, pilotNotifications, reminderMs = 86400000, fetchImpl = fetch, resolver } = {}) {
  if (token && (token.length < 32 || token === "replace-with-a-long-random-token")) throw new Error("Monitor token must be a dedicated credential of at least 32 characters.");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0 || (intervalMs !== 0 && intervalMs < 60000)) throw new Error("Monitor interval must be zero or at least 60000 ms.");
  blockingAlerts([], failOn);
  if (!Number.isSafeInteger(reminderMs) || reminderMs < 0 || (reminderMs && reminderMs < 3600000) || reminderMs > 30 * 86400000) throw new Error("Reminder interval must be zero or 1 hour–30 days.");
  const store = token && storePath ? new MonitorStore(storePath) : null;
  const sessions = new Map();
  let dashboard;
  async function dashboardPage() {
    if (dashboard) return dashboard;
    const [html, script, style] = await Promise.all([readFile(new URL("./dashboard.html", import.meta.url), "utf8"), readFile(new URL("./assets/monitor.js", import.meta.url)), readFile(new URL("./assets/monitor.css", import.meta.url))]);
    dashboard = html.replace('/assets/monitor.js"', `/assets/monitor.js?v=${digest(script).toString("hex").slice(0, 16)}"`).replace('/assets/monitor.css"', `/assets/monitor.css?v=${digest(style).toString("hex").slice(0, 16)}"`);
    return dashboard;
  }
  let emailCode;
  let lastCodeRequest = 0;
  const cookie = (value, age) => `${COOKIE}=${value}; Path=/api/monitor; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
  function authenticated(req) {
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (equal(bearer, token)) return true;
    const value = String(req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!value) return false;
    const key = digest(value).toString("hex");
    const expires = sessions.get(key);
    if (!expires || expires <= Date.now()) { sessions.delete(key); return false; }
    // Cookie mutations require the fixed allowed origin, even when Origin is absent.
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin) return false;
    return true;
  }
  async function guardedFetch(url, init) {
    await assertPublicDestination(String(url), { resolver });
    return fetchImpl(url, init);
  }
  const notificationKinds = [...(emailNotifications?.monitor ? ["monitor.email"] : []), ...(webhookUrl ? ["monitor.webhook"] : [])];
  async function deliveries() {
    return drainNotifications(store, (job) => {
      if (job.kind === "monitor.email" && emailNotifications?.monitor) return emailNotifications.monitor(job.payload.runs, job.payload.failOn);
      if (job.kind === "monitor.webhook" && webhookUrl) return deliverMonitorWebhook(webhookUrl, job.payload.runs, { secret: webhookSecret, failOn: job.payload.failOn, fetchImpl, eventId: job.id });
      return { delivered: false };
    }, { kinds: notificationKinds });
  }
  let deliveryPromise;
  let running = false;
  async function retryPending({ allowWhileRunning = false } = {}) {
    if (!store || (running && !allowWhileRunning)) return;
    if (deliveryPromise) return deliveryPromise;
    deliveryPromise = deliveries().catch(() => { /* Another writer or unavailable store: retry next tick. */ }).finally(() => { deliveryPromise = undefined; });
    return deliveryPromise;
  }
  async function recordHeartbeat(event, source, runId) {
    return store.update((journal) => {
      journal.heartbeat = nextMonitorHeartbeat(journal.heartbeat, { event, at: Date.now(), intervalMs, source, runId });
    });
  }
  async function run(source = "manual") {
    // Let a pre-existing sender finish its short writes before recording the attempt.
    if (deliveryPromise) await deliveryPromise;
    let result;
    try {
      await recordHeartbeat("attempt", source);
      result = await store.run(undefined, { fetchImpl: guardedFetch, timeoutMs: 8000, repeat: 2, failOn, notificationKinds, reminderMs });
      await recordHeartbeat("completed", source, result.entry.id);
    } catch (error) {
      try { await recordHeartbeat("failed", source); } catch { /* Unwritable journals are caught by the host watchdog. */ }
      throw error;
    }
    await retryPending({ allowWhileRunning: true });
    const journal = await store.read();
    const activeRuns = [{ alerts: journal.incidents.filter((item) => item.status !== "resolved").map((item) => item.finding) }];
    return { entry: result.entry, blocking: blockingAlerts(activeRuns, failOn).length, deliveries: publicDeliveries(journal.outbox), delivery: { queued: true }, email: { queued: Boolean(emailNotifications) } };
  }
  async function scheduledRun() {
    if (running || !store) return;
    running = true;
    try {
      if (!(await store.read()).targets.length) return;
      await run("scheduled");
    } catch { console.error("Settlens scheduled monitor failed; inspect the private workspace and store permissions."); }
    finally { running = false; }
  }
  const timer = store && intervalMs ? setInterval(scheduledRun, intervalMs) : null;
  timer?.unref();
  const deliveryTimer = store ? setInterval(retryPending, 60000) : null;
  deliveryTimer?.unref();
  if (deliveryTimer) retryPending();
  return {
    close() { if (timer) clearInterval(timer); if (deliveryTimer) clearInterval(deliveryTimer); sessions.clear(); },
    async handle(req, res, url) {
      if (url.pathname === "/dashboard") {
        if (!["GET", "HEAD"].includes(req.method)) return json(res, 405, { error: "Method not allowed." }, { allow: "GET, HEAD" });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" });
        return res.end(req.method === "HEAD" ? undefined : await dashboardPage());
      }
      if (!store) return json(res, 503, { error: "Private monitoring is not configured." });
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: "Origin is not allowed." });
      if (limited(clientIp(req), "monitor", 30, 60000)) return json(res, 429, { error: "Rate limit exceeded." });
      if (!["GET", "HEAD", "DELETE"].includes(req.method) && !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) return json(res, 415, { error: "JSON content type required." });
      if (url.pathname === "/api/monitor/session/code" && req.method === "POST") {
        if (req.headers.origin !== origin) return json(res, 403, { error: "Origin is not allowed." });
        if (!emailLogin || !emailNotifications?.access) return json(res, 503, { error: "Email sign-in is not configured." });
        if (Date.now() - lastCodeRequest < 60000 || limited(clientIp(req), "monitor-code", 3, 900000)) return json(res, 429, { error: "Wait before requesting another sign-in code." });
        lastCodeRequest = Date.now();
        const code = String(randomInt(100000, 1000000));
        const pending = { hash: digest(code), expires: Date.now() + 600000, attempts: 0 };
        const delivery = await emailNotifications.access(code);
        if (!delivery.delivered) return json(res, 503, { error: "Sign-in email could not be delivered." });
        emailCode = pending;
        return json(res, 202, { sent: true, expiresIn: 600 });
      }
      if (url.pathname === "/api/monitor/session" && req.method === "POST") {
        if (req.headers.origin !== origin) return json(res, 403, { error: "Origin is not allowed." });
        if (limited(clientIp(req), "monitor-login", 5, 900000)) return json(res, 429, { error: "Too many sign-in attempts." });
        const input = await body(req);
        let codeOk = false;
        if (emailCode && emailCode.expires > Date.now() && emailCode.attempts < 5 && typeof input.token === "string") {
          emailCode.attempts++;
          codeOk = timingSafeEqual(digest(input.token), emailCode.hash);
        }
        if (typeof input.token !== "string" || (!equal(input.token, token) && !codeOk)) return json(res, 401, { error: "Authentication required." });
        if (codeOk) emailCode = undefined;
        for (const [key, expires] of sessions) if (expires <= Date.now()) sessions.delete(key);
        if (sessions.size >= 128) return json(res, 429, { error: "Session limit exceeded." });
        const session = randomBytes(32).toString("hex");
        sessions.set(digest(session).toString("hex"), Date.now() + SESSION_MS);
        return json(res, 200, { authenticated: true, expiresIn: SESSION_MS / 1000 }, { "set-cookie": cookie(session, 3600) });
      }
      if (!authenticated(req)) return json(res, 401, { error: "Authentication required." });
      if (url.pathname === "/api/monitor/session" && req.method === "DELETE") {
        const value = String(req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
        if (value) sessions.delete(digest(value).toString("hex"));
        return json(res, 200, { authenticated: false }, { "set-cookie": cookie("", 0) });
      }
      if (url.pathname === "/api/monitor" && req.method === "GET") {
        const journal = await store.read();
        if (!journal.history.every(verifyHistoryEntry)) throw fail(409, "History integrity check failed.");
        return json(res, 200, { ...journal, outbox: publicDeliveries(journal.outbox), pilotDeliveries: pilotNotifications ? publicDeliveries((await pilotNotifications.read()).outbox) : [], intervalMs, reminderMs, failOn });
      }
      if (url.pathname === "/api/monitor/export" && req.method === "GET") {
        const journal = await store.read();
        const { history } = journal;
        if (!history.every(verifyHistoryEntry)) throw fail(409, "History integrity check failed.");
        if (url.searchParams.get("format") === "journal") {
          const { version, targets, state, references, incidents, audit } = journal;
          // Delivery jobs are intentionally omitted: importing must not replay owner emails.
          return json(res, 200, { version, targets, state, history, references, incidents, audit, outbox: [] }, { "content-disposition": 'attachment; filename="monitor-journal.json"' });
        }
        if (url.searchParams.get("format") === "html") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-disposition": 'attachment; filename="settlens-history.html"', "cache-control": "no-store" });
          return res.end(renderHistoryHtml(history));
        }
        return json(res, 200, history, { "content-disposition": 'attachment; filename="settlens-history.json"' });
      }
      if ((url.pathname === "/api/monitor/targets" && req.method === "POST") || (/^\/api\/monitor\/targets\/[a-f0-9-]{36}$/.test(url.pathname) && req.method === "PUT")) {
        const input = await body(req);
        if (Object.keys(input).some((key) => !["name", "url", "expected", "pricePolicy"].includes(key))) throw fail(400, "Only name, url, expected and pricePolicy are allowed.");
        if (typeof input.url !== "string" || input.url.length > 2048 || typeof input.name !== "string" || !input.name.trim() || input.name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(input.name)) throw fail(400, "Provide a URL and a name of 1–120 characters.");
        // Do not store credential-bearing URLs, even after redaction (they cannot be replayed).
        if (sanitizeUrl(input.url) !== new URL(input.url).toString()) throw fail(400, "Monitoring URLs must not contain credentials or secret query parameters.");
        await assertPublicDestination(input.url, { resolver });
        const normalized = normalizeTarget({ name: input.name, url: input.url, expected: input.expected, method: "GET", repeat: 2 });
        const target = { id: randomUUID(), name: normalized.name, url: normalized.url, expected: normalized.expected, pricePolicy: validatePricePolicy(input.pricePolicy) };
        await store.update((journal) => {
          if (req.method === "PUT") {
            const id = url.pathname.split("/").at(-1);
            const existing = journal.targets.find((entry) => entry.id === id);
            if (!existing) throw fail(404, "Target not found.");
            if (existing.url !== target.url) throw fail(409, "An endpoint URL identifies its history. Add a new endpoint to change the URL.");
            const policyChanged = stableStringify({ expected: existing.expected ?? {}, pricePolicy: existing.pricePolicy ?? { mode: "fixed" } }) !== stableStringify({ expected: target.expected, pricePolicy: target.pricePolicy });
            Object.assign(existing, { name: target.name, expected: target.expected, pricePolicy: target.pricePolicy });
            const observed = journal.state[stateKey("GET", existing.url)];
            if (policyChanged && observed) observed.requiresRescan = true;
            audit(journal, "target.updated", stateKey("GET", existing.url), { pricePolicy: existing.pricePolicy, policyChanged });
            target.id = id;
            return;
          }
          if (journal.targets.length >= 20) throw fail(400, "This workspace supports at most 20 targets.");
          if (journal.targets.some((entry) => entry.url === target.url)) throw fail(409, "This target already exists.");
          journal.targets.push(target);
          audit(journal, "target.created", stateKey("GET", target.url), {});
        });
        return json(res, req.method === "PUT" ? 200 : 201, target);
      }
      const targetId = /^\/api\/monitor\/targets\/([a-f0-9-]{36})$/.exec(url.pathname)?.[1];
      if (targetId && req.method === "DELETE") {
        await store.update((journal) => {
          const target = journal.targets.find((entry) => entry.id === targetId);
          if (!target) throw fail(404, "Target not found.");
          journal.targets = journal.targets.filter((entry) => entry.id !== targetId);
          const key = stateKey("GET", target.url);
          delete journal.state[key]; delete journal.references[key];
          for (const incident of journal.incidents.filter((item) => item.target === key && item.status !== "resolved")) { incident.status = "resolved"; incident.resolvedAt = new Date().toISOString(); incident.resolution = "target.removed"; }
          audit(journal, "target.removed", key, {});
        });
        return json(res, 200, { removed: true });
      }
      const approvalId = /^\/api\/monitor\/targets\/([a-f0-9-]{36})\/approve$/.exec(url.pathname)?.[1];
      if (approvalId && req.method === "POST") {
        const input = await body(req);
        if (Object.keys(input).some((key) => key !== "digest")) throw fail(400, "Only the reviewed observation digest is allowed.");
        const reference = await store.update((journal) => {
          const target = journal.targets.find((entry) => entry.id === approvalId);
          if (!target) throw fail(404, "Target not found.");
          return approveReference(journal, target, input.digest);
        });
        return json(res, 200, reference);
      }
      const incidentId = /^\/api\/monitor\/incidents\/([a-f0-9-]{36})$/.exec(url.pathname)?.[1];
      if (incidentId && req.method === "PATCH") return json(res, 200, await store.update((journal) => body(req).then((input) => updateIncident(journal, incidentId, input))));
      const retryId = /^\/api\/monitor\/deliveries\/(monitor|pilot)\/([a-f0-9-]{36})\/retry$/.exec(url.pathname);
      if (retryId && req.method === "POST") {
        const queue = retryId[1] === "monitor" ? store : pilotNotifications;
        if (!queue) throw fail(404, "Notification queue is not configured.");
        const job = await queue.update((journal) => retryNotification(journal, retryId[2]));
        if (retryId[1] === "monitor") await retryPending();
        return json(res, 202, { id: job.id, queued: true });
      }
      if (url.pathname === "/api/monitor/run" && req.method === "POST") {
        if (limited(clientIp(req), "monitor-run", 1, 60000)) return json(res, 429, { error: "A manual run is allowed once per minute." });
        if (running) return json(res, 409, { error: "A monitor run is already active." });
        running = true;
        try { return json(res, 200, await run()); }
        finally { running = false; }
      }
      return json(res, 405, { error: "Unsupported monitoring route or method." });
    },
  };
}
