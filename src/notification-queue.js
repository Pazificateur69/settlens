// Durable at-least-once delivery. Queue insertion shares the observation transaction.
import { randomUUID } from "node:crypto";
import { withMonitorLock, readJsonFile, writeJsonAtomic } from "./monitor-store.js";
export function enqueueNotification(journal, { key, kind, payload }, now = Date.now()) {
  journal.outbox ??= [];
  const existing = journal.outbox.find((job) => job.key === key);
  if (existing) return existing;
  const pending = journal.outbox.filter((job) => !["delivered", "cancelled"].includes(job.status));
  if (pending.length >= 200) throw new Error("Notification queue is full; refusing to discard pending notifications.");
  journal.outbox = [...pending, ...journal.outbox.filter((job) => ["delivered", "cancelled"].includes(job.status)).slice(-200)];
  if (Buffer.byteLength(JSON.stringify(payload)) > 32000) throw new Error("Notification payload exceeds the 32 KiB bound; refusing to discard it.");
  const job = { id: randomUUID(), key, kind, payload, status: "pending", attempts: 0, createdAt: new Date(now).toISOString(), nextAttemptAt: new Date(now).toISOString() };
  journal.outbox.push(job); return job;
}
export function pruneOutbox(journal, { now = Date.now(), retentionDays = 90 } = {}) {
  const cutoff = now - retentionDays * 86400000;
  for (const job of journal.outbox) if (Date.parse(job.createdAt) < cutoff && job.payload) {
    job.status = "cancelled"; job.error = "Payload expired under the data retention policy."; delete job.payload; delete job.lease; delete job.leaseUntil;
  }
  journal.outbox = journal.outbox.filter((job) => !["delivered", "cancelled"].includes(job.status) || Date.parse(job.deliveredAt ?? job.createdAt) >= cutoff).slice(-500);
}
export class NotificationStore {
  constructor(path) { this.path = path; }
  async read() {
    const value = await readJsonFile(this.path, { version: 1, outbox: [] });
    if (value?.version !== 1 || !Array.isArray(value.outbox)) throw new Error("Invalid notification queue; refusing to reset it.");
    const before = JSON.stringify(value.outbox);
    pruneOutbox(value, { retentionDays: 365 });
    Object.defineProperty(value, "needsPrune", { value: before !== JSON.stringify(value.outbox), enumerable: false });
    return value;
  }
  async update(task) {
    return withMonitorLock(this.path, async () => { const value = await this.read(); const result = await task(value); await writeJsonAtomic(this.path, value); return result; });
  }
  async expire() { if ((await this.read()).needsPrune) await this.update(() => {}); }
  async enqueue(job) { return this.update((journal) => enqueueNotification(journal, job)); }
}
export function publicDeliveries(jobs = []) {
  return jobs.map(({ payload, lease, key, ...summary }) => summary);
}
export function retryNotification(journal, id, now = Date.now()) {
  const job = journal.outbox.find((entry) => entry.id === id);
  if (!job) throw Object.assign(new Error("Notification not found."), { status: 404 });
  if (!["failed", "pending"].includes(job.status)) throw Object.assign(new Error("Only failed or pending notifications can be retried."), { status: 409 });
  job.status = "pending"; job.attempts = 0; job.nextAttemptAt = new Date(now).toISOString(); delete job.error;
  return job;
}
export async function drainNotifications(store, deliver, { now = Date.now, limit = 10, leaseMs = 120000, kinds } = {}) {
  await store.expire?.();
  const results = [];
  for (let index = 0; index < limit; index++) {
    const started = now(); const lease = randomUUID();
    const eligible = (item) => (!kinds || kinds.includes(item.kind)) && ((item.status === "pending" && Date.parse(item.nextAttemptAt) <= started) || (item.status === "sending" && Date.parse(item.leaseUntil) <= started));
    if (!(await store.read()).outbox.some(eligible)) break;
    const job = await store.update((journal) => {
      const entry = journal.outbox.find(eligible);
      if (!entry) return null;
      entry.status = "sending"; entry.lease = lease; entry.leaseUntil = new Date(started + leaseMs).toISOString(); entry.attempts++;
      return structuredClone(entry);
    });
    if (!job) break;
    let outcome;
    try { outcome = await deliver(job); } catch { outcome = { delivered: false }; }
    const completed = now();
    const result = await store.update((journal) => {
      const entry = journal.outbox.find((item) => item.id === job.id);
      if (!entry || entry.lease !== lease) return null;
      delete entry.lease; delete entry.leaseUntil;
      if (outcome?.delivered) {
        entry.status = "delivered"; entry.deliveredAt = new Date(completed).toISOString(); delete entry.error; delete entry.payload;
      } else {
        entry.status = entry.attempts >= 8 ? "failed" : "pending";
        entry.error = "Delivery was not confirmed; a retry can cause a duplicate if the previous response was lost.";
        entry.nextAttemptAt = new Date(completed + Math.min(60000 * 2 ** (entry.attempts - 1), 3600000)).toISOString();
      }
      return { id: entry.id, status: entry.status, attempts: entry.attempts };
    });
    if (result) results.push(result);
  }
  return results;
}
