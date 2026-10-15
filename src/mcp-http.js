/* MCP Streamable HTTP transport (2025-06-18), stateless JSON-response mode.
 *
 * One endpoint, POST only, no session ids, no SSE stream. Offline tools are
 * public; passive network tools are listed and callable only with a matching
 * `Authorization: Bearer <apiToken>`, and their destinations are checked by
 * net-guard (remote mode).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { SUPPORTED_PROTOCOL_VERSIONS, createMcpServer } from "./mcp.js";

const ALLOWED_HEADERS = "content-type, accept, authorization, mcp-protocol-version";
const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function bearerMatches(header, apiToken) {
  if (!apiToken || typeof header !== "string") {
    return false;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return false;
  }
  // Fixed-length digests: the comparison leaks neither content nor token length.
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(apiToken), digest(match[1]));
}

function acceptsJson(header) {
  if (header === undefined) {
    return true;
  }
  return header
    .split(",")
    .map((value) => value.split(";")[0].trim().toLowerCase())
    .some((value) => ["application/json", "application/*", "*/*"].includes(value));
}

function createRateLimiter({ max = 60, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  // cost: one per JSON-RPC message, so a batch counts as many requests as it carries.
  return (key, cost = 1) => {
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (now - bucket.started >= windowMs) {
          buckets.delete(bucketKey);
        }
      }
      if (buckets.size > 10_000) {
        buckets.clear(); // bounded memory under a flood of distinct client keys
      }
    }
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.started >= windowMs) {
      buckets.set(key, { started: now, count: cost });
      return cost > max ? Math.ceil(windowMs / 1000) : 0;
    }
    bucket.count += cost;
    return bucket.count > max ? Math.ceil((bucket.started + windowMs - now) / 1000) : 0;
  };
}

function readBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        req.removeAllListeners("data");
        req.resume(); // drain and discard; the 413 response closes the connection
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createMcpHttpHandler({
  apiToken,
  allowedOrigins = ["https://settlens.com", "https://claude.ai"],
  // Added to allowedOrigins, e.g. a local site build calling /mcp (MCP_EXTRA_ORIGINS in site/server.js).
  extraOrigins = [],
  maxBodyBytes = 262_144,
  rateLimit = { max: 60, windowMs: 60_000 },
  clientIp = (req) => req.socket?.remoteAddress ?? "unknown",
  fetchImpl,
  resolver,
} = {}) {
  const publicServer = createMcpServer({ mode: "remote", allowNetworkTools: false, fetchImpl, resolver });
  const networkServer = createMcpServer({ mode: "remote", allowNetworkTools: true, fetchImpl, resolver });
  const limited = rateLimit === false ? () => 0 : createRateLimiter(rateLimit);

  return async function mcpHttpHandler(req, res) {
    const origin = req.headers.origin;
    const originAllowed = origin === undefined || allowedOrigins.includes(origin) || extraOrigins.includes(origin);
    const cors =
      origin && originAllowed ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
    const send = (status, body, headers = {}) => {
      res.writeHead(status, {
        ...SECURITY_HEADERS,
        ...cors,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const rpcFailure = (status, code, message, headers) =>
      send(status, { jsonrpc: "2.0", id: null, error: { code, message } }, headers);

    try {
      // DNS-rebinding protection: a browser Origin must be explicitly allowed.
      if (!originAllowed) {
        return send(403, { error: "Origin not allowed." });
      }
      if (req.method === "OPTIONS") {
        return send(204, undefined, {
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": ALLOWED_HEADERS,
          "access-control-max-age": "600",
        });
      }
      if (req.method !== "POST") {
        return send(405, { error: "Method not allowed. Use POST." }, { allow: "POST" });
      }
      const rateLimited = (retryAfter) =>
        send(429, { error: "Rate limit exceeded." }, { "retry-after": String(retryAfter) });
      const retryAfter = limited(clientIp(req));
      if (retryAfter > 0) {
        return rateLimited(retryAfter);
      }
      const mediaType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (mediaType !== "application/json") {
        return send(415, { error: "Content-Type must be application/json." });
      }
      if (!acceptsJson(req.headers.accept)) {
        return send(406, { error: "Accept must allow application/json." });
      }
      const protocolVersion = req.headers["mcp-protocol-version"];
      if (protocolVersion !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
        return rpcFailure(400, -32600, `Unsupported MCP-Protocol-Version: ${protocolVersion}.`);
      }
      if (Number(req.headers["content-length"]) > maxBodyBytes) {
        return send(413, { error: "Request body is too large." }, { connection: "close" });
      }
      const text = await readBody(req, maxBodyBytes);
      if (text === null) {
        return send(413, { error: "Request body is too large." }, { connection: "close" });
      }
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return rpcFailure(400, -32700, "Parse error");
      }
      // The request itself was counted above; each further batch entry counts as one more request.
      if (Array.isArray(message) && message.length > 1) {
        const batchRetryAfter = limited(clientIp(req), message.length - 1);
        if (batchRetryAfter > 0) {
          return rateLimited(batchRetryAfter);
        }
      }

      const server = bearerMatches(req.headers.authorization, apiToken)
        ? networkServer
        : publicServer;
      const response = await server.handle(message);
      if (response === null) {
        return send(202); // notification or client response: accepted, no body
      }
      // Messages that could not be accepted as a JSON-RPC request carry id null.
      return send(response.error && response.id === null ? 400 : 200, response);
    } catch (error) {
      process.stderr.write(`settlens mcp http error: ${error.message}\n`);
      if (!res.headersSent) {
        return rpcFailure(500, -32603, "Internal error");
      }
      return res.destroy();
    }
  };
}
