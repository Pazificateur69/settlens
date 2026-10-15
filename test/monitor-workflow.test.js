import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSiteServer } from "../site/server.js";
import { createEmailNotifications } from "../src/notifications.js";
import { MonitorStore, verifyHistoryEntry } from "../src/monitor-store.js";
import { evaluateMonitorHealth } from "../src/monitor-health.js";
const origin = "https://settlens.com";
const token = "workflow-fixture-token-".repeat(3);
const url = "https://merchant.example/paid";
const required = (amount) => ({ x402Version: 2, resource: { url }, accepts: [{ scheme: "exact", network: "eip155:8453", amount, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }] });

test("owner HTTP workflow preserves approval and queued alerts through restart, delivery, recovery, export and logout", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-owner-workflow-")); const path = join(dir, "monitor.json");
  const sent = []; let amount = "10000", acceptMail = false, server, base, cookie, ip = 1;
  const start = async () => {
    const email = createEmailNotifications({ SETTLENS_EMAIL_ENABLED: "1", SMTP_HOST: "smtp.fixture.invalid", SMTP_USER: "contact@settlens.com", SMTP_PASSWORD: "fixture-only", SMTP_PORT: "465" }, { transportFactory: () => ({ sendMail: async (message) => { sent.push(message); if (!acceptMail) throw new Error("Synthetic SMTP rejection"); return { accepted: ["contact@settlens.com"], rejected: [] }; }, close() {} }) });
    server = createSiteServer({ root: dir, monitorToken: token, monitorStore: path, trustProxy: true, monitorResolver: async () => [{ address: "8.8.8.8", family: 4 }], monitorFetchImpl: async () => new Response("", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(required(amount))).toString("base64") } }), emailNotifications: email });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { if (server) { await new Promise((resolve) => server.close(resolve)); server = undefined; } };
  t.after(async () => { await stop(); await rm(dir, { recursive: true, force: true }); });
  const request = (route = "", method = "GET", data, headers = {}) => fetch(`${base}/api/monitor${route}`, { method, headers: { ...(cookie ? { cookie } : {}), origin, "x-forwarded-for": `8.8.4.${ip++}`, ...(data ? { "content-type": "application/json" } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined });
  const login = async () => { const response = await request("/session", "POST", { token }); assert.equal(response.status, 200); cookie = response.headers.get("set-cookie").split(";")[0]; };
  const value = async () => (await request()).json();
  await start(); assert.equal((await request()).status, 401); await login(); assert.equal((await request()).status, 200);
  const expected = { payTo: [required(amount).accepts[0].payTo], assets: [required(amount).accepts[0].asset], networks: ["eip155:8453"], maxAmount: "20000" };
  assert.equal((await request("/targets", "POST", { name: "Synthetic endpoint", url, expected }, { origin: "https://attacker.example" })).status, 403);
  const added = await request("/targets", "POST", { name: "Synthetic endpoint", url, expected }); assert.equal(added.status, 201); const target = await added.json();
  const initial = await request("/run", "POST", {}); assert.equal(initial.status, 200); assert.equal((await initial.json()).blocking, 0);
  let journal = await value(); const key = `GET ${url}`, digest = journal.state[key].terms.digest;
  assert.equal((await request(`/targets/${target.id}/approve`, "POST", { digest })).status, 200);
  amount = "12000";
  const changed = await request("/run", "POST", {}); assert.equal(changed.status, 200); assert.equal((await changed.json()).blocking, 1);
  journal = await value(); const incident = journal.incidents.find((item) => item.checkId === "terms.amount"), job = journal.outbox[0];
  assert.equal(incident.status, "open"); assert.equal(job.status, "pending"); assert.equal(job.attempts, 1);
  assert.equal(sent.length, 1); assert.match(sent[0].subject, /^\[Settlens\]\[ALERTE\]/); assert.equal(sent[0].envelope.to[0], "contact@settlens.com");
  assert.ok(journal.outbox.every((item) => !item.payload && !item.key && !item.lease));
  const beforeRestart = JSON.parse(await readFile(path, "utf8")); assert.ok(beforeRestart.outbox[0].payload); assert.equal(beforeRestart.heartbeat.status, "completed");
  await stop(); acceptMail = true; await start();
  assert.equal((await request()).status, 401); await login(); journal = await value();
  assert.equal(journal.references[key].terms.digest, digest); assert.equal(journal.incidents.find((item) => item.id === incident.id).status, "open");
  assert.equal((await request(`/deliveries/monitor/${job.id}/retry`, "POST", {})).status, 202);
  journal = await value(); assert.equal(journal.outbox[0].status, "delivered"); assert.equal(sent.length, 2);
  assert.equal(JSON.parse(await readFile(path, "utf8")).outbox[0].payload, undefined);
  amount = "10000";
  const recovered = await request("/run", "POST", {}); assert.equal(recovered.status, 200); assert.equal((await recovered.json()).blocking, 0);
  journal = await value(); assert.equal(journal.incidents.find((item) => item.id === incident.id).status, "resolved"); assert.equal(sent.length, 2);
  const history = await (await request("/export?format=json")).json(); assert.equal(history.length, 3); assert.ok(history.every(verifyHistoryEntry));
  const exported = await request("/export?format=journal"); assert.equal(exported.status, 200); assert.match(exported.headers.get("content-disposition"), /monitor-journal\.json/);
  const baseline = await exported.json(); assert.equal(baseline.references[key].terms.digest, digest); assert.deepEqual(baseline.outbox, []);
  const baselinePath = join(dir, "cli-baseline.json"); await writeFile(baselinePath, JSON.stringify(baseline), { mode: 0o600 });
  const imported = await new MonitorStore(baselinePath).read(); assert.equal(imported.references[key].terms.digest, digest); assert.ok(imported.history.every(verifyHistoryEntry)); assert.equal(imported.history.length, 3);
  assert.equal(evaluateMonitorHealth(journal, { now: Date.now(), intervalMs: 0 }).healthy, true);
  assert.equal((await request("/session", "DELETE")).status, 200); assert.equal((await request()).status, 401);
});

test("scheduled heartbeat persists completion and sanitized infrastructure errors without clearing safety findings", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-scheduled-heartbeat-")); const path = join(dir, "monitor.json"), store = new MonitorStore(path);
  await store.update((journal) => { journal.targets.push({ id: "11111111-1111-4111-8111-111111111111", name: "Synthetic endpoint", url, expected: {}, pricePolicy: { mode: "fixed" } }); });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const server = createSiteServer({ root: dir, monitorToken: token, monitorStore: path, monitorIntervalMs: 60000, monitorResolver: async () => [{ address: "8.8.8.8", family: 4 }], monitorFetchImpl: async () => { throw new Error("Synthetic unavailable endpoint"); }, emailNotifications: { close() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const waitFor = async (status, advanceScheduler = false) => {
    for (let i = 0; i < 200; i++) {
      const journal = await store.read(); if (journal.heartbeat?.status === status) return journal;
      // The completed marker commits before the previous callback finishes its read.
      // Advance a subsequent tick only after yielding for those asynchronous writes.
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (advanceScheduler) t.mock.timers.tick(60000);
    }
    assert.fail(`Heartbeat did not reach ${status}`);
  };
  t.mock.timers.tick(60000);
  const completed = await waitFor("completed");
  assert.equal(completed.heartbeat.source, "scheduled"); assert.equal(completed.heartbeat.intervalMs, 60000); assert.equal(completed.heartbeat.lastRunId, completed.history[0].id);
  assert.ok(completed.incidents.some((incident) => incident.checkId === "transport.reachable" && incident.status === "open"));
  assert.equal(evaluateMonitorHealth(completed, { now: Date.now(), intervalMs: 60000 }).state, "healthy");
  t.mock.method(MonitorStore.prototype, "run", async () => { throw new Error("Synthetic sensitive infrastructure details https://private.example/?password=fixture-only"); });
  t.mock.timers.tick(60000);
  const failed = await waitFor("failed", true);
  assert.equal(failed.heartbeat.lastCompletedAt, completed.heartbeat.lastCompletedAt); assert.ok(!JSON.stringify(failed.heartbeat).includes("password"));
  assert.ok(failed.incidents.some((incident) => incident.checkId === "transport.reachable" && incident.status === "open"));
  assert.equal(failed.history.length, 1); assert.deepEqual(evaluateMonitorHealth(failed, { now: Date.now(), intervalMs: 60000 }).issues, ["monitor.run_failed"]);
});
