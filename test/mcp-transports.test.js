import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { createMcpServer } from "../src/mcp.js";
import { createMcpHttpHandler } from "../src/mcp-http.js";
import { runStdioServer } from "../src/mcp-stdio.js";
import { encodeBase64Json } from "../src/protocol.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESOURCE = "https://merchant.example/paid";
const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const HEADER = encodeBase64Json({
  x402Version: 2,
  resource: { url: RESOURCE },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      amount: "10000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
  ],
});
const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "settlens-test", version: "1.0.0" },
  },
};
const EVALUATE = {
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "evaluate_payment_requirements",
    arguments: {
      payment_required: HEADER,
      resource_url: RESOURCE,
      policy: {
        pay_to: [PAY_TO],
        assets: ["0x036CbD53842c5426634e7929541eC2318f3dCF7e"],
        networks: ["eip155:84532"],
        max_amount: "10000",
      },
    },
  },
};

/* ---------- stdio ---------- */

function jsonLines(text) {
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("stdio transport answers requests, reports parse errors and ends with stdin", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const error = new PassThrough();
  let written = "";
  output.on("data", (chunk) => {
    written += chunk;
  });
  const done = runStdioServer({
    input,
    output,
    error,
    server: createMcpServer({ mode: "local" }),
  });

  input.write(`${JSON.stringify(INITIALIZE)}\n`);
  input.write("\n");
  input.write("{not json\n");
  input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\r\n`);
  input.end(`${JSON.stringify(EVALUATE)}\n`);
  await done;

  // Requests are handled concurrently, so responses are matched by id.
  const messages = new Map(jsonLines(written).map((message) => [message.id, message]));
  assert.equal(messages.size, 3);
  assert.equal(messages.get(1).result.serverInfo.name, "settlens");
  assert.deepEqual(messages.get(null), {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: "Parse error" },
  });
  assert.equal(messages.get(3).result.structuredContent.decision, "pay");
});

test("stdio transport logs handler failures to stderr and stops when output closes", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const error = new PassThrough();
  let logged = "";
  error.on("data", (chunk) => {
    logged += chunk;
  });
  const done = runStdioServer({
    input,
    output,
    error,
    server: {
      handle: async () => {
        throw new Error("handler exploded");
      },
    },
  });
  input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  output.emit("error", new Error("EPIPE"));
  await done;
  assert.match(logged, /handler exploded/);
  assert.match(logged, /output closed \(EPIPE\)/);
});

test("settlens mcp serves MCP over stdio and exits when stdin closes", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "mcp"], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const responses = new Promise((resolvePromise) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (jsonLines(stdout).length >= 3) {
        resolvePromise();
      }
    });
  });
  const exited = new Promise((resolvePromise) => child.once("close", resolvePromise));

  child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  child.stdin.write(`${JSON.stringify(EVALUATE)}\n`);
  await responses;
  child.stdin.end();
  const code = await exited;

  assert.equal(code, 0, stderr);
  assert.equal(stderr, "");
  const messages = jsonLines(stdout);
  assert.equal(messages.length, 3);
  assert.ok(messages.every((message) => message.jsonrpc === "2.0"));
  const byId = new Map(messages.map((message) => [message.id, message]));
  assert.equal(byId.get(1).result.protocolVersion, "2025-06-18");
  assert.equal(byId.get(2).result.tools.length, 8);
  assert.equal(byId.get(3).result.structuredContent.decision, "pay");
});

/* ---------- Streamable HTTP ---------- */

async function withHttp(options, run) {
  const server = createServer(createMcpHttpHandler({ rateLimit: false, ...options }));
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  try {
    await run(url);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

function post(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function toolNames(url, headers) {
  const response = await post(url, { jsonrpc: "2.0", id: 2, method: "tools/list" }, headers);
  return (await response.json()).result.tools.map(({ name }) => name);
}

test("HTTP transport implements stateless Streamable HTTP with JSON responses", async () => {
  await withHttp({ apiToken: "test-token" }, async (url) => {
    const initialized = await post(url, INITIALIZE);
    assert.equal(initialized.status, 200);
    assert.match(initialized.headers.get("content-type"), /^application\/json/);
    assert.equal(initialized.headers.get("mcp-session-id"), null);
    assert.equal(initialized.headers.get("cache-control"), "no-store");
    assert.equal((await initialized.json()).result.serverInfo.name, "settlens");

    const notification = await post(url, { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), "");
    assert.equal((await post(url, { jsonrpc: "2.0", id: 1, result: {} })).status, 202);

    const evaluated = await post(url, EVALUATE, { "mcp-protocol-version": "2025-06-18" });
    assert.equal(evaluated.status, 200);
    assert.equal((await evaluated.json()).result.structuredContent.decision, "pay");

    const older = await post(url, { jsonrpc: "2.0", id: 4, method: "ping" }, {
      "mcp-protocol-version": "2024-11-05",
      accept: "*/*",
    });
    assert.equal(older.status, 200);

    const unknown = await post(url, { jsonrpc: "2.0", id: 5, method: "nope" });
    assert.equal(unknown.status, 200);
    assert.equal((await unknown.json()).error.code, -32601);
  });
});

test("HTTP transport rejects what the specification forbids", async () => {
  await withHttp({ apiToken: "test-token" }, async (url) => {
    for (const method of ["GET", "DELETE", "PUT"]) {
      const response = await fetch(url, { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "POST");
    }

    assert.equal((await post(url, INITIALIZE, { "content-type": "text/plain" })).status, 415);
    assert.equal((await post(url, INITIALIZE, { accept: "text/event-stream" })).status, 406);

    const version = await post(url, INITIALIZE, { "mcp-protocol-version": "1999-01-01" });
    assert.equal(version.status, 400);
    assert.equal((await version.json()).error.code, -32600);

    const parse = await post(url, "{not json");
    assert.equal(parse.status, 400);
    assert.deepEqual(await parse.json(), {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });

    const batch = await post(url, [INITIALIZE]);
    assert.equal(batch.status, 200);
    assert.equal((await batch.json())[0].result.serverInfo.name, "settlens");
    const notifications = await post(url, [{ jsonrpc: "2.0", method: "notifications/initialized" }]);
    assert.equal(notifications.status, 202);
    assert.equal(await notifications.text(), "");
    const empty = await post(url, []);
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error.code, -32600);
  });
});

test("HTTP transport validates Origin and answers CORS preflights", async () => {
  await withHttp({}, async (url) => {
    const evil = await post(url, INITIALIZE, { origin: "https://evil.example" });
    assert.equal(evil.status, 403);
    assert.equal(evil.headers.get("access-control-allow-origin"), null);

    const allowed = await post(url, INITIALIZE, { origin: "https://claude.ai" });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://claude.ai");
    assert.equal(allowed.headers.get("access-control-expose-headers"), null);

    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: { origin: "https://settlens.com", "access-control-request-method": "POST" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://settlens.com");
    assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.match(preflight.headers.get("access-control-allow-headers"), /mcp-protocol-version/);
  });
});

test("HTTP transport bounds request bodies", async () => {
  await withHttp({ maxBodyBytes: 1024 }, async (url) => {
    const declared = await post(url, { jsonrpc: "2.0", id: 1, method: "ping", pad: "x".repeat(2048) });
    assert.equal(declared.status, 413);

    // Chunked upload without Content-Length: the limit applies while streaming.
    const status = await new Promise((resolvePromise, reject) => {
      const request = httpRequest(url, {
        method: "POST",
        headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
      });
      request.on("response", (response) => {
        response.resume();
        resolvePromise(response.statusCode);
      });
      request.on("error", reject);
      request.write("x".repeat(800));
      request.end("x".repeat(800));
    });
    assert.equal(status, 413);
  });
});

test("network tools require the bearer token and stay passive and public", async () => {
  await withHttp({ apiToken: "test-token" }, async (url) => {
    assert.equal((await toolNames(url)).length, 6);
    assert.equal((await toolNames(url, { authorization: "Bearer wrong-token" })).length, 6);
    assert.equal((await toolNames(url, { authorization: "Basic dGVzdA==" })).length, 6);
    const names = await toolNames(url, { authorization: "Bearer test-token" });
    assert.ok(names.includes("scan_endpoint") && names.includes("scan_facilitator"));

    const scan = {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "scan_endpoint", arguments: { url: "http://127.0.0.1:9/" } },
    };
    const anonymous = await (await post(url, scan)).json();
    assert.equal(anonymous.error.code, -32602);

    const blocked = await (await post(url, scan, { authorization: "bearer test-token" })).json();
    assert.equal(blocked.result.isError, true);
    assert.match(blocked.result.content[0].text, /non-routable/);
  });

  await withHttp({}, async (url) => {
    assert.equal((await toolNames(url, { authorization: "Bearer anything" })).length, 6);
  });
});

test("HTTP transport rate-limits each client", async () => {
  await withHttp(
    { rateLimit: { max: 2, windowMs: 60_000 }, clientIp: () => "203.0.113.5" },
    async (url) => {
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      assert.equal((await post(url, ping)).status, 200);
      assert.equal((await post(url, ping)).status, 200);
      const limited = await post(url, ping);
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
    },
  );
});

test("each entry of a JSON-RPC batch counts against the HTTP rate limit", async () => {
  await withHttp(
    { rateLimit: { max: 4, windowMs: 60_000 }, clientIp: () => "203.0.113.6" },
    async (url) => {
      const ping = (id) => ({ jsonrpc: "2.0", id, method: "ping" });
      assert.equal((await post(url, [ping(1), ping(2), ping(3)])).status, 200); // 3 of 4
      const over = await post(url, [ping(4), ping(5)]); // 5 of 4
      assert.equal(over.status, 429);
      assert.ok(Number(over.headers.get("retry-after")) > 0);
      assert.equal((await post(url, ping(6))).status, 429);
    },
  );
});

test("the rate limiter keeps bounded memory under a flood of distinct clients", async () => {
  let ip = "victim";
  const handler = createMcpHttpHandler({
    rateLimit: { max: 1, windowMs: 60_000 },
    clientIp: () => ip,
  });
  // In-process request: 415 (after the rate limit) without reading a body.
  const status = async () => {
    let code;
    await handler(
      { method: "POST", headers: { "content-type": "text/plain" } },
      { writeHead: (value) => (code = value), end() {} },
    );
    return code;
  };
  assert.equal(await status(), 415);
  assert.equal(await status(), 429);
  for (let index = 0; index <= 10_000; index += 1) {
    ip = `flood-${index}`;
    await status();
  }
  ip = "victim";
  assert.equal(await status(), 415); // buckets were cleared instead of growing
});
