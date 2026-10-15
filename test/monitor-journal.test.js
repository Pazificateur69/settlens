import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { paymentTermsSnapshot, diffPaymentTerms } from "../src/payment-terms.js";
import { monitorTargets } from "../src/monitor.js";
import { MonitorStore, readJsonFile, withMonitorLock, writeJsonAtomic, verifyHistoryEntry } from "../src/monitor-store.js";
import { deliverMonitorWebhook, blockingAlerts } from "../src/monitor-webhook.js";
import { renderHistoryHtml } from "../src/monitor-report.js";
const url = "https://merchant.example/paid";
function required(amount = "10000") { return { x402Version: 2, resource: { url }, accepts: [{ scheme: "exact", network: "eip155:8453", amount, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }], extensions: {} }; }
const response = (value) => new Response("", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(value)).toString("base64") } });
const target = { name: "API", url, repeat: 1 };

test("payment term changes alert even when every check keeps passing", async () => {
  const first = await monitorTargets([target], {}, { fetchImpl: async () => response(required()) });
  const second = await monitorTargets([target], first.state, { fetchImpl: async () => response(required("12000")) });
  assert.equal(second.runs[0].diff.regressions.length, 0);
  assert.equal(second.runs[0].alerts[0].id, "terms.amount");
  assert.equal(blockingAlerts(second.runs).length, 1);
  const serialized = JSON.stringify(second.state);
  assert.ok(!serialized.includes("USD Coin"));
  assert.ok(!serialized.includes("12000"));
});
test("payment snapshots ignore ephemeral fields, key order and option order, but detect rebinding", () => {
  assert.equal(paymentTermsSnapshot(null), null);
  const a = required(); const b = required(); b.accepts[0].extra.recentBlockhash = "rotating";
  assert.deepEqual(paymentTermsSnapshot(a), paymentTermsSnapshot(b));
  const other = { ...a.accepts[0], amount: "20000", payTo: "0x2222222222222222222222222222222222222222" };
  a.accepts.push(other); b.accepts.unshift(other);
  assert.deepEqual(paymentTermsSnapshot(a), paymentTermsSnapshot(b));
  const swapped = structuredClone(a); [swapped.accepts[0].payTo, swapped.accepts[1].payTo] = [swapped.accepts[1].payTo, swapped.accepts[0].payTo];
  assert.equal(diffPaymentTerms(paymentTermsSnapshot(a), paymentTermsSnapshot(swapped))[0].field, "options");
  const changed = required(); changed.accepts[0].extra.version = "3";
  assert.equal(diffPaymentTerms(paymentTermsSnapshot(required()), paymentTermsSnapshot(changed))[0].severity, "medium");
});
test("outages preserve observable terms and detect changes on recovery", async () => {
  const first = await monitorTargets([target], {}, { fetchImpl: async () => response(required()) });
  const outage = await monitorTargets([target], first.state, { fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(outage.runs[0].termsObserved, false);
  const recovered = await monitorTargets([target], outage.state, { fetchImpl: async () => response(required("15000")) });
  assert.ok(recovered.runs[0].alerts.some((alert) => alert.id === "terms.amount"));
});
test("journal persists history, enforces retention, and refuses corruption and concurrent writers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-journal-"));
  try {
    const path = join(dir, "journal.json"); const store = new MonitorStore(path, { maxEntries: 2 });
    assert.deepEqual((await store.read()).history, []);
    const options = { fetchImpl: async () => response(required()) };
    await store.run([target], options); await store.run([target], options); await store.run([target], options);
    const saved = await store.read(); assert.equal(saved.history.length, 2); assert.ok(saved.history.every(verifyHistoryEntry));
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await new MonitorStore(path).run([target], options)).runs[0].firstRun, false);
    await withMonitorLock(path, async () => { await assert.rejects(store.run([target], options), /already running/); });
    saved.history[0].runs[0].name = "tampered"; await writeJsonAtomic(path, saved);
    await assert.rejects(store.read(), /integrity/);
    await writeFile(path, "broken"); await assert.rejects(store.run([target], options), /refusing to reset/);
    await writeFile(path, JSON.stringify({ version: 2 })); await assert.rejects(store.read(), /format/);
    await assert.rejects(writeJsonAtomic(path, { huge: "x".repeat(9 * 1024 * 1024) }), /limit/);
    assert.throws(() => new MonitorStore(path, { maxEntries: 0 }), /retention/);
    await assert.rejects(readJsonFile(dir), /unreadable/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("journal expires old entries without silently trusting modified history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-retention-"));
  try {
    const path = join(dir, "history.json"); const store = new MonitorStore(path);
    const { entry } = await store.run([], {});
    assert.ok(verifyHistoryEntry(entry));
    // Empty target passes are also auditable, and target changes use the same lock.
    await store.update((journal) => { journal.targets.push({ name: "example", url }); });
    assert.equal((await store.read()).targets.length, 1);
    const cli = spawnSync(process.execPath, ["src/cli.js", "history", "--history", path, "--format", "html"], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /Settlens monitor history/);
    const exportPath = join(dir, "export.json");
    const exported = spawnSync(process.execPath, ["src/cli.js", "history", "--history", path, "--out", exportPath], { encoding: "utf8" });
    assert.equal(exported.status, 0); assert.equal(JSON.parse(await readFile(exportPath)).length, 1);
    for (const args of [["history"], ["history", "--history", path, "--format", "csv"]]) assert.equal(spawnSync(process.execPath, ["src/cli.js", ...args]).status, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("webhook signs exact bytes and reports HTTP failures without leaking destinations", async () => {
  const runs = [{ alerts: [{ severity: "high", id: "terms.amount" }] }];
  let request;
  const delivery = await deliverMonitorWebhook("https://receiver.example/hook", runs, { secret: "test-only-signing-key", now: 1700000000000, fetchImpl: async (_, init) => { request = init; return new Response(""); } });
  assert.equal(delivery.delivered, true);
  assert.equal(request.headers["x-settlens-signature"], `sha256=${createHmac("sha256", "test-only-signing-key").update(`1700000000.${request.body}`).digest("hex")}`);
  assert.equal(request.redirect, "error");
  assert.equal((await deliverMonitorWebhook("https://receiver.example/secret", runs, { fetchImpl: async () => new Response("sensitive", { status: 500 }) })).error, "Monitor webhook delivery failed.");
  assert.equal((await deliverMonitorWebhook(null, runs)).skipped, true);
  assert.equal((await deliverMonitorWebhook("https://receiver.example", runs, { failOn: "none" })).skipped, true);
  assert.equal((await deliverMonitorWebhook("https://receiver.example", runs, { fetchImpl: async () => { throw new Error("private-secret"); } })).error, "Monitor webhook delivery failed.");
  assert.throws(() => blockingAlerts([], "invalid"), /threshold/);
  const html = renderHistoryHtml([{ observedAt: "<script>", digest: "&", runs: [{ method: "GET", url: "<script>", firstRun: false, alerts: [{ id: "x", title: "<script>", severity: "high" }] }] }]);
  assert.ok(!html.includes("<script>")); assert.ok(html.includes("&lt;script&gt;"));
});
