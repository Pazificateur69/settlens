import test from "node:test";
import assert from "node:assert/strict";
import { createSettlensClient } from "../src/client.js";
import { createMcpHttpHandler } from "../src/mcp-http.js";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

test("client rejects malformed structured decisions instead of returning an unsafe pay result", async () => {
  const valid = { decision: "pay", summary: "Within policy", reasons: [], acceptable: [{ scheme: "exact", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", amount: "10000", maxTimeoutSeconds: 60 }], checks: [{ status: "pass", severity: "high" }] };
  const values = ["pay", [], null, { decision: "pay" }, { ...valid, decision: "unknown" }, { ...valid, reasons: [1] }, { ...valid, acceptable: [] }, { ...valid, acceptable: [null] }, { ...valid, acceptable: [{ scheme: "exact" }] }, { ...valid, acceptable: [{ ...valid.acceptable[0], amount: "0" }] }, { ...valid, acceptable: Array(33).fill({}) }, { ...valid, decision: "do_not_pay" }, { ...valid, checks: [] }, { ...valid, checks: [{ status: "fail", severity: "high" }] }, { ...valid, checks: [{ status: "ok", severity: "high" }] }, { ...valid, checks: [{ status: "pass", severity: "unknown" }] }];
  for (const value of values) {
    const client = createSettlensClient({ fetchImpl: async () => json({ jsonrpc: "2.0", id: 1, result: { structuredContent: value } }) });
    await assert.rejects(client.callTool("evaluate_payment_requirements"), /invalid response/);
  }
  for (const [name, value] of [["evaluate_payment_requirements", valid], ["scan_endpoint", { ...valid, issues: [] }], ["evaluate_payment_requirements", { ...valid, decision: "review" }], ["evaluate_payment_requirements", { ...valid, decision: "do_not_pay", acceptable: [], checks: [{ status: "fail", severity: "high" }] }]]) {
    const client = createSettlensClient({ fetchImpl: async () => json({ jsonrpc: "2.0", id: 1, result: { structuredContent: value } }) });
    assert.deepEqual(await client.callTool(name), value);
  }
  await assert.rejects(createSettlensClient({ fetchImpl: async () => json({ jsonrpc: "2.0", id: 1, result: { structuredContent: "not an object" } }) }).callTool("list_checks"), /invalid response/);
});
test("response-stream failures are sanitized even after headers arrive", async () => {
  const fetchImpl = async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("fixture-only-private-diagnostic")); } }), { headers: { "content-type": "application/json" } });
  await assert.rejects(createSettlensClient({ fetchImpl }).callTool("list_checks"), (error) => /could not be read/.test(error.message) && !error.message.includes("fixture-only-private-diagnostic"));
  for (const [ok, type, message] of [[false, "application/json", /HTTP 401/], [true, "text/plain", /Expected a JSON/]]) {
    const response = { ok, status: 401, headers: new Headers({ "content-type": type }), body: { cancel: async () => { throw new Error("fixture-only-private-diagnostic"); } } };
    await assert.rejects(createSettlensClient({ fetchImpl: async () => response }).callTool("list_checks"), (error) => message.test(error.message) && !error.message.includes("fixture-only-private-diagnostic"));
  }
});

test("client calls the real public MCP transport and returns structured content", async (t) => {
  const server = createServer(createMcpHttpHandler({ rateLimit: false }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = createSettlensClient({ url: `http://127.0.0.1:${server.address().port}/mcp` });
  const result = await client.callTool("list_checks"); assert.ok(result.count >= 36); assert.equal(result.checks.length, result.count);
  const option = { scheme: "exact", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", amount: "10000", maxTimeoutSeconds: 60 };
  const resourceUrl = "https://merchant.example/paid";
  const decision = await client.callTool("evaluate_payment_requirements", { payment_required: { x402Version: 2, resource: { url: resourceUrl }, accepts: [option] }, resource_url: resourceUrl, policy: { pay_to: [option.payTo], assets: [option.asset], networks: [option.network], max_amount: option.amount } });
  assert.equal(decision.decision, "pay"); assert.equal(decision.acceptable.length, 1);
  await assert.rejects(client.callTool("scan_endpoint", { url: "https://merchant.example" }), /rejected/);
});
test("client rejects insecure endpoints and malformed, oversized or failing remote responses", async () => {
  for (const url of ["http://merchant.example/mcp", "https://user:pass@merchant.example/mcp", "https://merchant.example/mcp?token=x"]) assert.throws(() => createSettlensClient({ url }), /HTTPS/);
  assert.throws(() => createSettlensClient({ timeoutMs: 1 }), /timeout/);
  const client = createSettlensClient(); await assert.rejects(client.callTool("unknown"), /Unknown/); await assert.rejects(client.callTool("list_checks", []), /object/);
  for (const fetchImpl of [async () => { throw new Error("secret-token"); }, async () => new Response("", { status: 401 }), async () => new Response("not json"), async () => json({ jsonrpc: "2.0", id: 999, result: { structuredContent: {} } }), async () => new Response("invalid", { headers: { "content-type": "application/json" } }), async () => new Response("x".repeat(1024 * 1024 + 1), { headers: { "content-type": "application/json" } })]) {
    await assert.rejects(createSettlensClient({ fetchImpl }).callTool("list_checks"), (error) => !error.message.includes("secret-token"));
  }
  let received;
  const authenticated = createSettlensClient({ apiToken: "fixture-only", fetchImpl: async (_, init) => { received = init; return json({ jsonrpc: "2.0", id: 1, result: { structuredContent: { count: 0 } } }); } });
  assert.deepEqual(await authenticated.callTool("list_checks"), { count: 0 }); assert.equal(received.headers.authorization, "Bearer fixture-only"); assert.equal(received.redirect, "error");
});
test("offline CLI preflight exposes pay/review/do_not_pay and refuses incomplete invocation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-preflight-cli-"));
  try {
    const url = "https://merchant.example/paid"; const payTo = "0x1111111111111111111111111111111111111111"; const asset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const input = join(dir, "required.json"); const policy = join(dir, "policy.json");
    await writeFile(input, JSON.stringify({ x402Version: 2, resource: { url }, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", payTo, asset, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }] }));
    const run = () => spawnSync(process.execPath, ["src/cli.js", "preflight", input, "--policy", policy, "--resource-url", url], { encoding: "utf8" });
    const complete = { payTo: [payTo], assets: [asset], networks: ["eip155:8453"], maxAmount: "10000" };
    await writeFile(policy, JSON.stringify(complete)); let result = run(); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).decision, "pay");
    await writeFile(policy, "{}"); result = run(); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).decision, "review");
    await writeFile(policy, JSON.stringify({ ...complete, maxAmount: "1" })); result = run(); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).decision, "do_not_pay");
    assert.equal(spawnSync(process.execPath, ["src/cli.js", "preflight"]).status, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
