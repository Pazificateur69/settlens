import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, utimes } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createEmailNotifications } from "../src/notifications.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotificationStore, enqueueNotification, drainNotifications, retryNotification, publicDeliveries } from "../src/notification-queue.js";
import { MonitorStore } from "../src/monitor-store.js";
import { createSiteServer } from "../site/server.js";
const newJob = (key = "event") => ({ key, kind: "pilot.email", payload: { name: "Test", email: "test@example.com" } });
async function fixture(t) { const dir = await mkdtemp(join(tmpdir(), "settlens-outbox-")); t.after(() => rm(dir, { recursive: true, force: true })); return { dir, store: new NotificationStore(join(dir, "notifications.json")) }; }
test("durable queue survives restart, deduplicates events, backs off and removes delivered content", async (t) => {
  const { store } = await fixture(t); const job = await store.enqueue(newJob()); assert.equal((await store.enqueue(newJob())).id, job.id);
  let time = Date.now(); const now = () => time; let calls = 0;
  let result = await drainNotifications(new NotificationStore(store.path), async () => { calls++; throw new Error("secret SMTP details"); }, { now }); assert.equal(result[0].status, "pending");
  await drainNotifications(store, async () => { calls++; return { delivered: true }; }, { now }); assert.equal(calls, 1);
  assert.ok(!JSON.stringify(await store.read()).includes("secret SMTP")); time += 60001;
  result = await drainNotifications(store, async () => { calls++; return { delivered: true }; }, { now }); assert.equal(result[0].status, "delivered"); assert.equal(calls, 2);
  const delivered = (await store.read()).outbox[0]; assert.equal(delivered.payload, undefined); assert.equal(publicDeliveries([delivered])[0].key, undefined);
  await store.update((j) => { assert.throws(() => retryNotification(j, job.id), /Only/); });
});
test("expired delivery lease can recover after crash and exhausted jobs require explicit retry", async (t) => {
  const { store } = await fixture(t); const job = await store.enqueue(newJob()); let time = Date.now();
  await store.update((j) => { Object.assign(j.outbox[0], { status: "sending", lease: "crashed-process", leaseUntil: new Date(time - 1).toISOString() }); });
  for (let i = 0; i < 8; i++) { await drainNotifications(store, async () => ({ delivered: false }), { now: () => time }); time += 3600001; }
  assert.equal((await store.read()).outbox[0].status, "failed");
  await store.update((j) => { assert.throws(() => retryNotification(j, "unknown"), /not found/); retryNotification(j, job.id, time); });
  await drainNotifications(store, async () => ({ delivered: true }), { now: () => time }); assert.equal((await store.read()).outbox[0].status, "delivered");
});
test("queue bounds retain pending jobs, corruption fails closed and observation commits roll back on queue overflow", async (t) => {
  const { store, dir } = await fixture(t); const j = { outbox: [] };
  for (let i = 0; i < 200; i++) enqueueNotification(j, newJob(`pending${i}`)); assert.throws(() => enqueueNotification(j, newJob("overflow")), /full/);
  const monitor = new MonitorStore(join(dir, "journal.json")); await monitor.update((journal) => { journal.outbox = j.outbox; });
  await assert.rejects(monitor.update((journal) => { journal.state.bad = true; enqueueNotification(journal, newJob("overflow")); }), /full/); assert.equal((await monitor.read()).state.bad, undefined);
  const completed = { outbox: Array.from({ length: 205 }, (_, i) => ({ id: String(i), key: String(i), status: "delivered" })) }; enqueueNotification(completed, newJob()); assert.equal(completed.outbox.length, 201);
  await writeFile(store.path, JSON.stringify({ version: 1, outbox: false })); await assert.rejects(store.read(), /Invalid/);
});
test("one lease prevents double delivery, and stale workers cannot overwrite a newer lease", async (t) => {
  const { store } = await fixture(t); await store.enqueue(newJob()); let sends = 0;
  await drainNotifications(store, async (job) => {
    sends++; assert.deepEqual(await drainNotifications(store, async () => { sends++; return { delivered: true }; }), []);
    await store.update((journal) => { journal.outbox[0].lease = "new-worker"; });
    return { delivered: true };
  });
  assert.equal(sends, 1); assert.equal((await store.read()).outbox[0].status, "sending");
});
test("pilot is durably queued before mail failure and visible only as owner delivery metadata", async (t) => {
  const { dir } = await fixture(t); const path = join(dir, "pilot.jsonl"); let deliveries = 0;
  const server = createSiteServer({ pilotStore: path, emailNotifications: { pilot: async () => { deliveries++; return { delivered: false }; }, close() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await fetch(`http://127.0.0.1:${server.address().port}/api/pilot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Test pilot", company: "Fixture", email: "test@example.com", message: "Synthetic request" }) });
  assert.equal(result.status, 202); assert.equal(deliveries, 1);
  const queue = new NotificationStore(`${path}.notifications.json`); const journal = await queue.read(); assert.equal(journal.outbox[0].status, "pending"); assert.equal(journal.outbox[0].payload.company, "Fixture");
  assert.equal(publicDeliveries(journal.outbox)[0].payload, undefined);
});

test("read-only CLI delivery inspection does not consume retries without a configured channel", async (t) => {
  const { dir } = await fixture(t); const monitor = new MonitorStore(join(dir, "monitor.json"));
  await monitor.update((journal) => enqueueNotification(journal, { key: "monitor-event", kind: "monitor.email", payload: { runs: [] } }));
  const result = spawnSync(process.execPath, ["src/cli.js", "notifications", "--history", monitor.path], { encoding: "utf8", env: { ...process.env, SETTLENS_EMAIL_ENABLED: "0" } });
  assert.equal(result.status, 0, result.stderr); assert.equal((await monitor.read()).outbox[0].attempts, 0); assert.equal((await monitor.read()).outbox[0].status, "pending");
});
test("expired pilot payloads are purged from disk even if no deliveries remain due", async (t) => {
  const { store } = await fixture(t); await store.enqueue(newJob());
  await store.update((journal) => { journal.outbox[0].createdAt = new Date(Date.now() - 366 * 86400000).toISOString(); });
  await drainNotifications(store, async () => { throw new Error("Expired content must not be sent"); });
  assert.ok(!JSON.parse(await readFile(store.path, "utf8")).outbox.some((job) => job.payload));
});
test("a killed writer's stale heartbeat lock recovers without resetting its journal", async (t) => {
  const { dir } = await fixture(t); const monitor = new MonitorStore(join(dir, "monitor.json")); await monitor.update((journal) => { journal.state.marker = "retained"; });
  const child = spawn(process.execPath, ["--input-type=module", "-e", `import { withMonitorLock } from './src/monitor-store.js'; await withMonitorLock(process.argv[1], async()=>{ console.log('locked'); await new Promise(()=>{setInterval(()=>{},1000);}); });`, monitor.path], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill("SIGKILL")); await once(child.stdout, "data"); const closed = once(child, "close"); child.kill("SIGKILL"); await closed;
  const stale = new Date(Date.now() - 40000); await utimes(`${monitor.path}.lock`, stale, stale);
  await monitor.update((journal) => { journal.state.recovered = true; }); assert.equal((await monitor.read()).state.marker, "retained"); assert.equal((await monitor.read()).state.recovered, true);
});
test("oversized notification content is bounded before the owner mail relay", async () => {
  let sent;
  const mail = createEmailNotifications({ SETTLENS_EMAIL_ENABLED: "1", SETTLENS_MAIL_RELAY_URL: "https://relay.example/email" }, { relayTransportFactory: () => ({ sendMail: async (value) => { sent = value; return { accepted: ["contact@settlens.com"], rejected: [] }; }, close() {} }) });
  const alerts = Array.from({ length: 200 }, (_, id) => ({ id: String(id), severity: "high", title: "É".repeat(300), recommendation: "修".repeat(300) }));
  assert.equal((await mail.monitor([{ method: "GET", url: "https://merchant.example/", alerts }])).delivered, true);
  assert.ok(Buffer.byteLength(sent.text) < 40000); assert.match(sent.text, /abrégé/); mail.close();
});
