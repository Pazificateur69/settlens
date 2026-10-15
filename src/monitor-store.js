// Bounded journal, atomic replacement and a process-safe fail-fast writer lock.
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { randomUUID } from "node:crypto";
import { monitorTargets } from "./monitor.js";
import { initializeLifecycle, reconcileIncidents } from "./monitor-lifecycle.js";
import { enqueueNotification, pruneOutbox } from "./notification-queue.js";
import { blockingAlerts } from "./monitor-webhook.js";
import { sha256, stableStringify } from "./utils.js";
export const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const emptyJournal = () => ({ version: 1, targets: [], state: {}, history: [] });
export async function readJsonFile(path, fallback) {
  try {
    if ((await stat(path)).size > MAX_JOURNAL_BYTES) throw new Error("Monitor file exceeds the 8 MiB limit.");
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error("Monitor file is unreadable or invalid; refusing to reset the baseline.");
  }
}
export async function writeJsonAtomic(path, value) {
  const text = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(text) > MAX_JOURNAL_BYTES) throw new Error("Monitor journal exceeds the 8 MiB limit.");
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temporary, { force: true }); }
}
export async function withMonitorLock(path, task) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let release;
  try { release = await lockfile.lock(path, { realpath: false, stale: 30000, update: 10000, retries: 0 }); }
  catch (error) {
    if (error.code !== "ELOCKED") throw error;
    throw Object.assign(new Error("A monitor writer is already running; retry later. A crashed writer's stale lock recovers after 30 seconds."), { status: 409 });
  }
  try { return await task(); } finally { await release(); }
}
export class MonitorStore {
  constructor(path, { maxEntries = 200, retentionDays = 90 } = {}) {
    if (!path) throw new Error("Monitor store path is required.");
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 200 || !Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error("Invalid monitor retention.");
    this.path = path; this.maxEntries = maxEntries; this.retentionDays = retentionDays;
  }
  async read() {
    const journal = await readJsonFile(this.path, emptyJournal());
    if (journal?.version !== 1 || !Array.isArray(journal.history) || !Array.isArray(journal.targets) || !journal.state || typeof journal.state !== "object" || Array.isArray(journal.state)) throw new Error("Invalid monitor journal format.");
    if (!journal.history.every(verifyHistoryEntry)) throw new Error("Monitor history integrity check failed.");
    initializeLifecycle(journal);
    if (!Array.isArray(journal.incidents) || !Array.isArray(journal.audit) || !Array.isArray(journal.outbox) || !journal.references || typeof journal.references !== "object" || Array.isArray(journal.references)) throw new Error("Invalid monitor journal format.");
    const beforeOutbox = JSON.stringify(journal.outbox);
    pruneOutbox(journal);
    Object.defineProperty(journal, "needsPrune", { value: beforeOutbox !== JSON.stringify(journal.outbox), enumerable: false });
    const cutoff = Date.now() - this.retentionDays * 86400000;
    journal.history = journal.history.filter((entry) => Date.parse(entry.observedAt) >= cutoff).slice(-this.maxEntries);
    return journal;
  }
  async update(task) {
    return withMonitorLock(this.path, async () => {
      const journal = await this.read();
      const result = await task(journal);
      while (Buffer.byteLength(JSON.stringify(journal)) > MAX_JOURNAL_BYTES && journal.history.length > 1) journal.history.shift();
      await writeJsonAtomic(this.path, journal);
      return result;
    });
  }
  async expire() { if ((await this.read()).needsPrune) await this.update(() => {}); }
  async run(targets, options = {}) {
    return this.update(async (journal) => {
      const selected = targets ?? journal.targets;
      const result = await monitorTargets(selected, journal.state, { ...options, includeTermsValues: true });
      journal.state = result.state;
      reconcileIncidents(journal, result.runs, selected, options);
      const entry = { id: randomUUID(), observedAt: new Date().toISOString(), runs: result.runs };
      entry.digest = sha256(stableStringify(entry));
      const notifying = result.runs.map((run) => ({ name: run.name, method: run.method, url: run.url, alerts: (run.events ?? []).filter((event) => event.kind !== "resolved").map(({ id, kind, severity, title, recommendation, incidentId }) => ({ id, kind, severity, title, recommendation, incidentId })) }));
      if (blockingAlerts(notifying, options.failOn ?? "high").length) {
        for (const [index, run] of notifying.entries()) if (blockingAlerts([run], options.failOn ?? "high").length) {
          for (const kind of options.notificationKinds ?? []) enqueueNotification(journal, { key: `${entry.id}:${index}:${kind}`, kind, payload: { runs: [run], failOn: options.failOn ?? "high" } });
        }
      }
      journal.history.push(entry);
      journal.history = journal.history.slice(-this.maxEntries);
      return { ...result, entry };
    });
  }
}
export function verifyHistoryEntry(entry) {
  const { digest, ...content } = entry;
  return digest === sha256(stableStringify(content));
}
