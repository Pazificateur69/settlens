// Operational status only. Endpoint findings are deliberately outside this result.
// All output is fixed identifiers, counts and timestamps; no endpoint or mail content.
const ERROR = "Monitor run did not complete; inspect the private workspace and journal.";
function timestamp(value) { const number = typeof value === "string" ? Date.parse(value) : NaN; return Number.isFinite(number) ? number : null; }
function milliseconds(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 8640000000000000) throw new Error(`Invalid ${name}.`);
  return value;
}
export function nextMonitorHeartbeat(previous = {}, { event, at, intervalMs, source = "scheduled", runId } = {}) {
  milliseconds(at, "heartbeat clock"); milliseconds(intervalMs, "monitor interval");
  if (!["attempt", "completed", "failed"].includes(event) || !["manual", "scheduled"].includes(source)) throw new Error("Invalid heartbeat event.");
  const next = { version: 1, intervalMs, status: event === "attempt" ? "running" : event, source };
  for (const field of ["lastAttemptAt", "lastCompletedAt", "lastErrorAt", "lastRunId"]) if (typeof previous[field] === "string") next[field] = previous[field];
  const iso = new Date(at).toISOString();
  if (event === "attempt") next.lastAttemptAt = iso;
  if (event === "completed") { next.lastCompletedAt = iso; if (typeof runId === "string") next.lastRunId = runId; }
  if (event === "failed") { next.lastErrorAt = iso; next.error = ERROR; }
  return next;
}

export function evaluateMonitorHealth(journal = {}, { now, intervalMs, startupAt, maxRunMs, pendingOverdueMs = 300000, notificationJobs } = {}) {
  milliseconds(now, "health clock"); milliseconds(intervalMs, "monitor interval");
  if (startupAt !== undefined) milliseconds(startupAt, "startup clock");
  const targetCount = Array.isArray(journal.targets) ? journal.targets.length : 0;
  const budget = maxRunMs ?? Math.max(60000, Math.min(400000, targetCount * 16000 + 60000));
  milliseconds(budget, "run budget", 1); milliseconds(pendingOverdueMs, "notification grace", 1);
  const heartbeat = journal.heartbeat ?? {};
  const attempted = timestamp(heartbeat.lastAttemptAt), completed = timestamp(heartbeat.lastCompletedAt);
  const issues = [];
  let state;
  if (intervalMs === 0) state = "disabled";
  else if (targetCount === 0) state = "idle";
  else if (heartbeat.status === "failed") { state = "failed"; issues.push("monitor.run_failed"); }
  else if (heartbeat.status === "running") {
    if (attempted === null || attempted > now + 60000) { state = "stale"; issues.push("monitor.heartbeat_invalid"); }
    else if (now - attempted > budget) { state = "stale"; issues.push("monitor.run_overdue"); }
    else state = "running";
  } else if (completed === null) {
    state = "never_run";
    if (startupAt === undefined || now - startupAt > intervalMs + budget) issues.push("monitor.never_run");
  } else if (completed > now + 60000) { state = "stale"; issues.push("monitor.heartbeat_invalid"); }
  else if (now - completed > intervalMs * 2 + budget) { state = "stale"; issues.push("monitor.schedule_stale"); }
  else state = "healthy";
  const notifications = { pending: 0, overdue: 0, sending: 0, staleSending: 0, failed: 0, invalid: 0 };
  const jobs = notificationJobs ?? journal.outbox ?? [];
  if (!Array.isArray(jobs)) throw new Error("Invalid notification health input.");
  for (const job of jobs) {
    if (!job || !["pending", "sending", "failed", "delivered", "cancelled"].includes(job.status)) { notifications.invalid++; continue; }
    if (job.status === "failed") notifications.failed++;
    if (job.status === "pending") {
      notifications.pending++;
      const due = timestamp(job.nextAttemptAt);
      if (due === null) notifications.invalid++;
      else if (now - due > pendingOverdueMs) notifications.overdue++;
    }
    if (job.status === "sending") {
      notifications.sending++;
      const lease = timestamp(job.leaseUntil);
      if (lease === null) notifications.invalid++;
      else if (now - lease > pendingOverdueMs) notifications.staleSending++;
    }
  }
  if (notifications.failed) issues.push("notifications.failed");
  if (notifications.overdue) issues.push("notifications.overdue");
  if (notifications.staleSending) issues.push("notifications.sender_stale");
  if (notifications.invalid) issues.push("notifications.invalid");
  return {
    version: 1, healthy: issues.length === 0, state, checkedAt: new Date(now).toISOString(), issues,
    scheduler: { intervalMs, targetCount, lastAttemptAt: attempted === null ? null : new Date(attempted).toISOString(), lastCompletedAt: completed === null ? null : new Date(completed).toISOString(), lastErrorAt: timestamp(heartbeat.lastErrorAt) === null ? null : new Date(timestamp(heartbeat.lastErrorAt)).toISOString(), completionAgeMs: completed === null ? null : Math.max(0, now - completed), maxRunMs: budget },
    notifications,
  };
}
