import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { MonitorStore } from "../src/monitor-store.js";
import { approveReference, updateIncident, validatePricePolicy, reconcileIncidents, initializeLifecycle } from "../src/monitor-lifecycle.js";
import { paymentTermsSnapshot } from "../src/payment-terms.js";
import { createSiteServer } from "../site/server.js";
const url = "https://merchant.example/paid";
const target = { id: "11111111-1111-4111-8111-111111111111", name: "API", url, repeat: 1 };
const required = (amount = "10000", payTo = "0x1111111111111111111111111111111111111111") => ({ x402Version: 2, resource: { url }, accepts: [{ scheme: "exact", network: "eip155:8453", amount, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }], extensions: {} });
const response = (value) => new Response("", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(value)).toString("base64") } });
async function fixture(t) { const dir = await mkdtemp(join(tmpdir(), "settlens-lifecycle-")); t.after(() => rm(dir, { recursive: true, force: true })); return { dir, store: new MonitorStore(join(dir, "monitor.json")) }; }
test("approved recipient drift persists across unchanged runs, outages and restart until recovery", async (t) => {
  const { store } = await fixture(t); await store.update((journal) => journal.targets.push(target));
  await store.run(undefined, { fetchImpl: async () => response(required()) });
  let journal = await store.read(); const key = `GET ${url}`;
  assert.equal(Object.keys(journal.references).length, 0);
  await store.update((journal) => approveReference(journal, target, journal.state[key].terms.digest));
  const changed = required("10000", "0x2222222222222222222222222222222222222222");
  const options = { fetchImpl: async () => response(changed), notificationKinds: ["monitor.email"] };
  const drift = await store.run(undefined, options); assert.ok(drift.runs[0].referenceChanges.some((change) => change.id === "terms.payTo"));
  journal = await store.read(); const incident = journal.incidents.find((entry) => entry.checkId === "terms.payTo"); assert.equal(incident.status, "open"); assert.equal(journal.outbox.length, 1);
  await new MonitorStore(store.path).run(undefined, options);
  journal = await store.read(); assert.equal(journal.incidents.find((entry) => entry.id === incident.id).status, "open"); assert.equal(journal.outbox.length, 1);
  await store.run(undefined, { fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal((await store.read()).incidents.find((entry) => entry.id === incident.id).status, "open");
  await store.run(undefined, { fetchImpl: async () => response(required()) });
  assert.equal((await store.read()).incidents.find((entry) => entry.id === incident.id).status, "resolved");
  assert.ok((await store.read()).audit.some((entry) => entry.action === "reference.approved"));
});
test("approval requires current successful observation and rejects stale digests or high failures", async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(store.update((j) => approveReference(j, target, "unknown")), /Observe/);
  await store.run([target], { fetchImpl: async () => response(required()) });
  await assert.rejects(store.update((j) => approveReference(j, target, "stale")), /changed/);
  await store.update((j) => { j.state[`GET ${url}`].checks.push({ id: "unsafe", status: "fail", severity: "high" }); });
  await assert.rejects(store.update((j) => approveReference(j, target, j.state[`GET ${url}`].terms.digest)), /high-severity/);
});
test("explicit price range allows bounded fluctuation but preserves recipient and upper-bound incidents", async (t) => {
  const { store } = await fixture(t); const ranged = { ...target, pricePolicy: { mode: "range", minAmount: "9000", maxAmount: "15000" } };
  await store.update((j) => j.targets.push(ranged)); await store.run(undefined, { fetchImpl: async () => response(required()) });
  await store.update((j) => approveReference(j, ranged, j.state[`GET ${url}`].terms.digest));
  assert.deepEqual((await store.run(undefined, { fetchImpl: async () => response(required("12000")) })).runs[0].referenceChanges, []);
  assert.ok((await store.run(undefined, { fetchImpl: async () => response(required("16000")) })).runs[0].referenceChanges.some((change) => change.field === "amount"));
  assert.ok((await store.run(undefined, { fetchImpl: async () => response(required("12000", "0x2222222222222222222222222222222222222222")) })).runs[0].referenceChanges.some((change) => change.field === "payTo"));
  for (const invalid of [null, { mode: "unknown" }, { mode: "fixed", maxAmount: "2" }, { mode: "range", minAmount: "3", maxAmount: "2" }, { mode: "range", minAmount: "0", maxAmount: "x" }]) assert.throws(() => validatePricePolicy(invalid), /price|Price/);
  assert.deepEqual(validatePricePolicy(), { mode: "fixed" });
});
test("acknowledgement pauses reminders, escalation reopens, comments are bounded and recovery is observed", () => {
  const key = `GET ${url}`; const j = { state: { [key]: { checks: [{ id: "a", title: "Issue", status: "warn", severity: "medium" }] } } }; initializeLifecycle(j);
  const runs = () => [{ method: "GET", url, termsObserved: false }]; const now = 1700000000000;
  const first = runs(); reconcileIncidents(j, first, [target], { now, reminderMs: 3600000 }); const incident = j.incidents[0]; assert.equal(first[0].events[0].kind, "opened");
  const reminder = runs(); reconcileIncidents(j, reminder, [target], { now: now + 3600001, reminderMs: 3600000 }); assert.equal(reminder[0].events[0].kind, "reminder");
  updateIncident(j, incident.id, { status: "acknowledged", comment: "Investigating" }, now); assert.equal(incident.comments.length, 1);
  const acknowledged = runs(); reconcileIncidents(j, acknowledged, [target], { now: now + 7200002, reminderMs: 3600000 }); assert.equal(acknowledged[0].events.length, 0);
  j.state[key].checks[0].severity = "high"; const escalation = runs(); reconcileIncidents(j, escalation, [target], { now: now + 7200003 }); assert.equal(escalation[0].events[0].kind, "escalated"); assert.equal(incident.status, "open");
  updateIncident(j, incident.id, { status: "open" });
  for (const input of [{}, { nope: true }, { status: "resolved" }, { comment: "" }, { comment: "bad\n" }, { comment: "x".repeat(1001) }]) assert.throws(() => updateIncident(j, incident.id, input));
  assert.throws(() => updateIncident(j, "missing", { comment: "x" }), /not found/);
  j.state[key].checks = [{ id: "a", status: "pass" }]; const recovery = runs(); reconcileIncidents(j, recovery, [target], { now: now + 7200004 }); assert.equal(incident.status, "resolved"); assert.equal(recovery[0].events[0].kind, "resolved");
  assert.throws(() => updateIncident(j, incident.id, { status: "open" }), /active/);
  updateIncident(j, incident.id, { comment: "Verified recovery" });
});
test("safe display values never retain arbitrary response metadata or malformed addresses", () => {
  const value = required(); value.accepts[0].extra.secret = "sensitive"; value.accepts[0].payTo = "secret@example.com";
  const snapshot = paymentTermsSnapshot(value, { includeValues: true }); assert.equal(snapshot.values[0].payTo, "[unavailable]"); assert.ok(!JSON.stringify(snapshot).includes("sensitive"));
});
test("private API edits preserve identity/history, stale approval fails, incidents and delivery payloads stay private", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-lifecycle-api-")); let amount = "10000"; const token = "test-monitor-".repeat(4); const origin = "https://settlens.com";
  const server = createSiteServer({ monitorToken: token, monitorStore: join(dir, "monitor.json"), trustProxy: true, monitorResolver: async () => [{ address: "8.8.8.8", family: 4 }], monitorFetchImpl: async () => response(required(amount)), emailNotifications: { monitor: async () => ({ delivered: false }), close() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  let ip = 1;
  const api = async (path = "", method = "GET", input) => { const result = await fetch(`http://127.0.0.1:${server.address().port}/api/monitor${path}`, { method, headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json", "x-forwarded-for": `8.8.4.${ip++}` }, body: input ? JSON.stringify(input) : undefined }); return { status: result.status, value: await result.json() }; };
  const created = await api("/targets", "POST", { name: "Merchant", url, expected: {} }); const id = created.value.id; assert.equal(created.status, 201);
  assert.equal((await api("/run", "POST", {})).status, 200); let journal = (await api()).value; const digest = journal.state[`GET ${url}`].terms.digest;
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest: "stale" })).status, 409);
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest })).status, 200);
  assert.equal((await api(`/targets/${id}`, "PUT", { name: "Renamed", url, expected: {}, pricePolicy: { mode: "fixed" } })).status, 200);
  journal = (await api()).value; assert.equal(journal.targets[0].id, id); assert.equal(journal.history.length, 1); assert.equal(journal.references[`GET ${url}`].terms.digest, digest);
  assert.equal((await api(`/targets/${id}`, "PUT", { name: "Changed", url: `${url}x`, expected: {} })).status, 409);
  amount = "12000"; await api("/run", "POST", {}); journal = (await api()).value;
  const incident = journal.incidents.find((entry) => entry.checkId === "terms.amount"); assert.equal(incident.status, "open"); assert.ok(journal.outbox.length); assert.ok(journal.outbox.every((job) => !job.payload && !job.key && !job.lease));
  assert.equal((await api(`/incidents/${incident.id}`, "PATCH", { status: "acknowledged", comment: "Owner is investigating" })).status, 200);
  assert.equal((await api(`/deliveries/monitor/${journal.outbox[0].id}/retry`, "POST", {})).status, 202);
  assert.equal((await api(`/targets/${id}`, "DELETE")).status, 200); assert.equal((await api()).value.incidents.find((entry) => entry.id === incident.id).resolution, "target.removed");
});
test("CLI exposes reviewable reference, incident updates and delivery status without network credentials", async (t) => {
  const { store } = await fixture(t); await store.run([target], { fetchImpl: async () => response(required()) });
  const invoke = (...args) => spawnSync(process.execPath, ["src/cli.js", ...args], { encoding: "utf8" });
  const digest = (await store.read()).state[`GET ${url}`].terms.digest;
  assert.equal(invoke("reference", "--history", store.path, "--target", url, "--digest", digest).status, 0);
  assert.equal(invoke("incidents", "--history", store.path).status, 0);
  assert.equal(invoke("notifications", "--history", store.path).status, 0);
  for (const args of [["reference"], ["reference", "--history", store.path], ["incidents", "--history", store.path, "--status", "open"]]) assert.equal(invoke(...args).status, 2);
});

test("unchanged price outside a newly configured range fails and cannot be approved", async (t) => {
  const { store } = await fixture(t); await store.update((j) => j.targets.push(target));
  await store.run(undefined, { fetchImpl: async () => response(required()) });
  await store.update((j) => approveReference(j, target, j.state[`GET ${url}`].terms.digest));
  const ranged = { ...target, pricePolicy: { mode: "range", minAmount: "11000", maxAmount: "15000" } };
  await store.update((j) => { j.targets[0] = ranged; });
  const result = await store.run(undefined, { fetchImpl: async () => response(required()) });
  assert.ok(result.runs[0].referenceChanges.some((change) => change.id === "terms.priceRange"));
  await assert.rejects(store.update((j) => approveReference(j, ranged, j.state[`GET ${url}`].terms.digest)), /within/);
});
test("missing or skipped checks cannot resolve protocol incidents during an outage", () => {
  const key = `GET ${url}`; const j = { state: { [key]: { checks: [{ id: "required.valid", title: "Required", status: "fail", severity: "high" }] } } }; initializeLifecycle(j);
  const run = () => [{ method: "GET", url, termsObserved: false }]; reconcileIncidents(j, run(), [target]); const existing = j.incidents[0];
  j.state[key].checks = [{ id: "http.request", title: "Offline", status: "fail", severity: "high" }]; reconcileIncidents(j, run(), [target]); assert.equal(existing.status, "open");
  j.state[key].checks = [{ id: "required.valid", status: "skip" }]; reconcileIncidents(j, run(), [target]); assert.equal(existing.status, "open");
  j.state[key].checks = [{ id: "required.valid", status: "pass" }]; reconcileIncidents(j, run(), [target]); assert.equal(existing.status, "resolved");
});

test("explicit range gates the first observation before an approved reference exists", async (t) => {
  const { store } = await fixture(t);
  const ranged = { ...target, pricePolicy: { mode: "range", minAmount: "11000", maxAmount: "15000" } };
  await store.update((journal) => journal.targets.push(ranged));
  const first = await store.run(undefined, { fetchImpl: async () => response(required()), notificationKinds: ["monitor.email"] });
  assert.equal(first.runs[0].referenceApproved, false);
  assert.ok(first.runs[0].events.some((event) => event.id === "terms.priceRange" && event.severity === "high"));
  assert.equal((await store.read()).incidents.find((incident) => incident.checkId === "terms.priceRange").status, "open");
  assert.equal((await store.read()).outbox.length, 1);
  await store.run(undefined, { fetchImpl: async () => response(required("12000")) });
  assert.equal((await store.read()).incidents.find((incident) => incident.checkId === "terms.priceRange").status, "resolved");
});

test("policy edits require a rescan before approval while name edits preserve freshness and history", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-policy-freshness-"));
  const token = "test-monitor-".repeat(4); const origin = "https://settlens.com";
  const server = createSiteServer({ monitorToken: token, monitorStore: join(dir, "monitor.json"), trustProxy: true, monitorResolver: async () => [{ address: "8.8.8.8", family: 4 }], monitorFetchImpl: async () => response(required()), emailNotifications: { close() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  let ip = 1;
  const api = async (path = "", method = "GET", input) => {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/monitor${path}`, { method, headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json", "x-forwarded-for": `8.8.4.${ip++}` }, body: input ? JSON.stringify(input) : undefined });
    return { status: result.status, value: await result.json() };
  };
  const created = await api("/targets", "POST", { name: "Merchant", url, expected: {} });
  assert.equal(created.status, 201); const id = created.value.id; const key = `GET ${url}`;
  await api("/run", "POST", {}); let journal = (await api()).value; const digest = journal.state[key].terms.digest;
  assert.equal((await api(`/targets/${id}`, "PUT", { name: "Name changed", url, expected: {} })).status, 200);
  assert.equal((await api()).value.state[key].requiresRescan, undefined);
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest })).status, 200);
  const oldReference = (await api()).value.references[key];
  assert.equal((await api(`/targets/${id}`, "PUT", { name: "Name changed", url, expected: { maxAmount: "1" } })).status, 200);
  journal = (await api()).value;
  assert.equal(journal.state[key].requiresRescan, true); assert.equal(journal.state[key].terms.digest, digest);
  assert.equal(journal.history.length, 1); assert.deepEqual(journal.references[key], oldReference);
  const stale = await api(`/targets/${id}/approve`, "POST", { digest }); assert.equal(stale.status, 409); assert.match(stale.value.error, /policy changed/);
  assert.equal((await api("/run", "POST", {})).status, 200);
  const unsafe = await api(`/targets/${id}/approve`, "POST", { digest }); assert.equal(unsafe.status, 409); assert.match(unsafe.value.error, /high-severity/);
  assert.equal((await api(`/targets/${id}`, "PUT", { name: "Name changed", url, expected: { maxAmount: "20000" } })).status, 200);
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest })).status, 409);
  await api("/run", "POST", {});
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest })).status, 200);
  assert.equal((await api(`/targets/${id}`, "PUT", { name: "Name changed", url, expected: { maxAmount: "20000" }, pricePolicy: { mode: "range", minAmount: "9000", maxAmount: "15000" } })).status, 200);
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest })).status, 409);
  await api("/run", "POST", {});
  assert.equal((await api(`/targets/${id}/approve`, "POST", { digest })).status, 200);
  assert.equal((await api()).value.state[key].requiresRescan, undefined);
});


test("observed non-redirect response resolves redirect incident; timeout cannot establish recovery", async (t) => {
  const { store } = await fixture(t);
  await store.run([target], { fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://merchant.example/other" } }) });
  const incident = (await store.read()).incidents.find((item) => item.checkId === "transport.redirect"); assert.equal(incident.status, "open");
  await store.run([target], { fetchImpl: async () => { throw new Error("Synthetic timeout"); } });
  let journal = await store.read(); assert.equal(journal.incidents.find((item) => item.id === incident.id).status, "open");
  assert.ok(!journal.state[`GET ${url}`].checks.some((check) => check.id === "transport.redirect" && check.status === "pass"));
  await store.run([target], { fetchImpl: async () => Response.error() });
  journal = await store.read(); assert.equal(journal.incidents.find((item) => item.id === incident.id).status, "open");
  assert.equal(journal.state[`GET ${url}`].checks.find((check) => check.id === "transport.redirect").status, "skip");
  const recovered = await store.run([target], { fetchImpl: async () => response(required()) });
  journal = await store.read(); assert.equal(journal.incidents.find((item) => item.id === incident.id).status, "resolved");
  assert.equal(journal.state[`GET ${url}`].checks.find((check) => check.id === "transport.redirect").status, "pass");
  assert.ok(recovered.runs[0].events.some((event) => event.incidentId === incident.id && event.kind === "resolved"));
});
