import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMonitorHealth, nextMonitorHeartbeat } from "../src/monitor-health.js";
const NOW = 1800000000000;
const intervalMs = 60000;
const iso = (time) => new Date(time).toISOString();
const journal = (heartbeat, outbox = []) => ({ targets: [{ name: "private-owner-name", url: "https://private.example/?sensitive" }], heartbeat, outbox });
const health = (value, options = {}) => evaluateMonitorHealth(value, { now: NOW, intervalMs, ...options });

test("operational health is deterministic and distinguishes disabled, idle, startup grace and missed runs", () => {
  assert.equal(health({}, { intervalMs: 0 }).state, "disabled");
  assert.equal(health({}).state, "idle");
  const never = health(journal()); assert.equal(never.state, "never_run"); assert.deepEqual(never.issues, ["monitor.never_run"]);
  const grace = health(journal(), { startupAt: NOW - 50000 }); assert.equal(grace.state, "never_run"); assert.equal(grace.healthy, true);
  assert.equal(health(journal(), { startupAt: NOW - 300000 }).healthy, false);
  assert.deepEqual(health(journal()), health(journal()));
});

test("heartbeat transitions preserve observation clocks and sanitize operational failures", () => {
  const attempted = nextMonitorHeartbeat({}, { event: "attempt", at: NOW - 10000, intervalMs, source: "scheduled" });
  assert.equal(attempted.status, "running"); assert.equal(health(journal(attempted)).state, "running");
  const done = nextMonitorHeartbeat(attempted, { event: "completed", at: NOW - 5000, intervalMs, source: "scheduled", runId: "fixture-run" });
  assert.equal(done.lastAttemptAt, attempted.lastAttemptAt); assert.equal(done.lastRunId, "fixture-run"); assert.equal(health(journal(done)).healthy, true);
  const failed = nextMonitorHeartbeat(done, { event: "failed", at: NOW - 1000, intervalMs, source: "manual" });
  assert.equal(failed.lastCompletedAt, done.lastCompletedAt); assert.deepEqual(health(journal(failed)).issues, ["monitor.run_failed"]);
  assert.match(failed.error, /^Monitor run did not complete/);
  const retry = nextMonitorHeartbeat(failed, { event: "attempt", at: NOW, intervalMs }); assert.equal(retry.error, undefined);
  assert.equal(nextMonitorHeartbeat(retry, { event: "completed", at: NOW, intervalMs }).error, undefined);
  assert.throws(() => nextMonitorHeartbeat({}, { event: "unexpected", at: NOW, intervalMs }), /event/);
  assert.throws(() => nextMonitorHeartbeat({}, { event: "attempt", at: NOW, intervalMs, source: "remote-payload" }), /event/);
});

test("stale schedules and stuck runners fail independently of endpoint safety findings", () => {
  const completed = { status: "completed", lastCompletedAt: iso(NOW - 300000) };
  assert.deepEqual(health(journal(completed)).issues, ["monitor.schedule_stale"]);
  assert.deepEqual(health(journal({ status: "running", lastAttemptAt: iso(NOW - 90000) }), { maxRunMs: 80000 }).issues, ["monitor.run_overdue"]);
  for (const heartbeat of [{ status: "running" }, { status: "running", lastAttemptAt: iso(NOW + 70000) }, { status: "completed", lastCompletedAt: iso(NOW + 70000) }]) assert.deepEqual(health(journal(heartbeat)).issues, ["monitor.heartbeat_invalid"]);
  const observedFailures = { ...journal({ status: "completed", lastCompletedAt: iso(NOW) }), incidents: [{ status: "open", finding: { severity: "critical" } }] };
  assert.equal(health(observedFailures).state, "healthy"); // Scheduling health does not approve endpoint safety.
});

test("delivery health respects next retry time and exposes counts without owner content", () => {
  const outbox = [
    { status: "pending", nextAttemptAt: iso(NOW + 3600000), payload: { message: "secret-payload" } },
    { status: "pending", nextAttemptAt: iso(NOW - 301000) },
    { status: "sending", leaseUntil: iso(NOW - 301000) },
    { status: "sending", leaseUntil: iso(NOW + 1000) },
    { status: "failed", error: "secret-SMTP-error" }, { status: "delivered" }, { status: "cancelled" },
  ];
  const result = health(journal(undefined, outbox), { intervalMs: 0 });
  assert.equal(result.state, "disabled"); assert.equal(result.healthy, false);
  assert.deepEqual(result.notifications, { pending: 2, overdue: 1, sending: 2, staleSending: 1, failed: 1, invalid: 0 });
  assert.deepEqual(result.issues, ["notifications.failed", "notifications.overdue", "notifications.sender_stale"]);
  assert.ok(!JSON.stringify(result).includes("secret")); assert.ok(!JSON.stringify(result).includes("private"));
  assert.equal(health({}, { notificationJobs: [{ status: "failed" }] }).notifications.failed, 1);
  assert.equal(health(journal(undefined, [null, { status: "unknown" }, { status: "pending" }, { status: "sending" }])).notifications.invalid, 4);
  assert.throws(() => health({}, { notificationJobs: {} }), /notification/);
});

test("health clocks and budgets must be explicitly bounded", () => {
  for (const options of [{ now: undefined }, { intervalMs: -1 }, { now: NaN }, { startupAt: -1 }, { maxRunMs: 0 }, { pendingOverdueMs: 0 }]) assert.throws(() => health({}, options), /Invalid/);
});
