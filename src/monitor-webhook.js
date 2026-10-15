import { createHmac } from "node:crypto";
import { SEVERITY_RANK } from "./constants.js";
export function blockingAlerts(runs, failOn = "high") {
  if (!["low", "medium", "high", "critical", "none"].includes(failOn)) throw new Error("Invalid monitor severity threshold.");
  const threshold = failOn === "none" ? Infinity : SEVERITY_RANK[failOn];
  return runs.flatMap((run) => run.alerts.filter((alert) => (SEVERITY_RANK[alert.severity] ?? 2) >= threshold));
}
// A durable caller may retry; receivers must deduplicate x-settlens-event-id.
export async function deliverMonitorWebhook(url, runs, { failOn = "high", secret, fetchImpl = fetch, now = Date.now(), eventId } = {}) {
  const alerting = blockingAlerts(runs, failOn).length;
  if (!url || !alerting) return { delivered: false, skipped: true };
  const timestamp = String(Math.floor(now / 1000));
  const body = JSON.stringify({ product: "Settlens Monitor", alerting, failOn, runs, ...(eventId ? { eventId } : {}) });
  const headers = { "content-type": "application/json", "x-settlens-timestamp": timestamp };
  if (eventId) headers["x-settlens-event-id"] = eventId;
  if (secret) headers["x-settlens-signature"] = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  try {
    const response = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(5000), redirect: "error" });
    await response.body?.cancel();
    if (!response.ok) throw new Error();
    return { delivered: true, skipped: false };
  } catch {
    // Never print a webhook URL, credentials, response or fetch error.
    return { delivered: false, skipped: false, error: "Monitor webhook delivery failed." };
  }
}
