#!/usr/bin/env node
// Private operator probe: return counts and fixed issue codes, never journal payloads or credentials.
import { MonitorStore } from '../src/monitor-store.js';
import { NotificationStore } from '../src/notification-queue.js';
import { evaluateMonitorHealth } from '../src/monitor-health.js';
const startupAt = process.argv.find(arg => arg.startsWith('--startup-at='))?.slice(13);
try {
  const journal = await new MonitorStore(process.env.MONITOR_STORE ?? '/data/monitor.json').read();
  const pilot = await new NotificationStore(`${process.env.PILOT_STORE ?? '/data/pilot-leads.jsonl'}.notifications.json`).read();
  const health = evaluateMonitorHealth(journal, { now: Date.now(), intervalMs: Number(process.env.MONITOR_INTERVAL_MS ?? 0), ...(startupAt ? { startupAt: Date.parse(startupAt) } : {}), notificationJobs: [...journal.outbox, ...pilot.outbox] });
  console.log(JSON.stringify(health));
} catch {
  console.log(JSON.stringify({ version: 1, healthy: false, state: 'unreadable', issues: ['operations.journal_unreadable'] }));
  process.exitCode = 1;
}
