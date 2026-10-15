// Incident lifecycle and explicit owner approvals; no observed change is auto-approved.
import { randomUUID } from "node:crypto";
import { stateKey, diffChecks } from "./monitor.js";
import { diffPaymentTerms } from "./payment-terms.js";
import { SEVERITY_RANK } from "./constants.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
export function initializeLifecycle(journal) {
  journal.references ??= {}; journal.incidents ??= []; journal.audit ??= []; journal.outbox ??= [];
}
export function audit(journal, action, target, detail, now = Date.now()) {
  journal.audit.push({ id: randomUUID(), at: new Date(now).toISOString(), actor: "owner", action, target, detail });
  journal.audit = journal.audit.slice(-500);
}
export { validatePricePolicy } from "./price-policy.js";
function approvedDiff(reference, current, pricePolicy) {
  const changes = diffPaymentTerms(reference.terms, current);
  if (pricePolicy?.mode !== "range" || !current) return changes;
  const within = current.valuesComplete === true && current.values?.length && current.values.every((option) => typeof option.amount === "string" && /^[0-9]{1,80}$/.test(option.amount) && BigInt(option.amount) >= BigInt(pricePolicy.minAmount) && BigInt(option.amount) <= BigInt(pricePolicy.maxAmount));
  if (!within) return [...changes, { kind: "terms", id: "terms.priceRange", field: "priceRange", severity: "high", title: "Advertised price is outside the approved range or cannot be established", recommendation: "Restore a price within the explicit range, or review and update the policy.", before: [pricePolicy], after: current.values ?? [] }];
  return reference.terms.bindingWithoutAmount === current.bindingWithoutAmount ? changes.filter((change) => !["amount", "options"].includes(change.field)) : changes;
}
export function approveReference(journal, target, expectedDigest, now = Date.now()) {
  const key = stateKey(target.method ?? "GET", target.url);
  const observed = journal.state[key];
  if (!observed?.terms || !observed.termsObserved) throw fail(409, "Observe payment terms successfully before approval.");
  if (observed.requiresRescan) throw fail(409, "The monitoring policy changed; run the checks again before approving these terms.");
  if (typeof expectedDigest !== "string" || expectedDigest !== observed.terms.digest) throw fail(409, "Observation changed; refresh and review it before approval.");
  if (observed.checks.some((check) => check.status === "fail" && SEVERITY_RANK[check.severity] >= SEVERITY_RANK.high)) throw fail(409, "Resolve high-severity failures before approving these terms.");
  if (target.pricePolicy?.mode === "range" && approvedDiff({ terms: observed.terms }, observed.terms, target.pricePolicy).length) throw fail(409, "Observed prices must be within the explicit range before approval.");
  journal.references[key] = { terms: structuredClone(observed.terms), checks: structuredClone(observed.checks), approvedAt: new Date(now).toISOString(), actor: "owner" };
  audit(journal, "reference.approved", key, { digest: expectedDigest }, now);
  return journal.references[key];
}
export function reconcileIncidents(journal, runs, targets, { now = Date.now(), reminderMs = 86400000 } = {}) {
  const at = new Date(now).toISOString();
  for (const run of runs) {
    const key = stateKey(run.method, run.url);
    const observed = journal.state[key];
    const reference = journal.references[key];
    const target = targets.find((entry) => stateKey(entry.method ?? "GET", entry.url) === key);
    const findings = observed.checks.filter((check) => ["warn", "fail"].includes(check.status)).map((check) => ({ kind: "finding", ...check }));
    if (run.termsObserved) {
      // Explicit price bounds are a policy, so they apply even before the first approval.
      findings.push(...approvedDiff(reference ?? { terms: observed.terms }, observed.terms, target?.pricePolicy));
      if (reference) findings.push(...diffChecks(reference.checks, observed.checks).removed.map((check) => ({ kind: "removed", ...check })));
    }
    const active = new Map(findings.map((finding) => [finding.id, finding]));
    const events = [];
    for (const [id, finding] of active) {
      let incident = journal.incidents.find((item) => item.target === key && item.checkId === id && item.status !== "resolved");
      if (!incident) {
        if (journal.incidents.filter((item) => item.status !== "resolved").length >= 2000) throw new Error("Incident capacity reached; refusing to discard active incidents.");
        incident = { id: randomUUID(), target: key, checkId: id, status: "open", openedAt: at, lastSeenAt: at, lastNotifiedAt: at, occurrences: 0, comments: [], finding };
        journal.incidents.push(incident); events.push({ ...finding, kind: "opened", incidentId: incident.id });
      } else if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[incident.finding.severity]) {
        incident.status = "open"; incident.lastNotifiedAt = at; events.push({ ...finding, kind: "escalated", incidentId: incident.id });
      } else if (reminderMs && incident.status === "open" && now - Date.parse(incident.lastNotifiedAt) >= reminderMs) {
        incident.lastNotifiedAt = at; events.push({ ...finding, kind: "reminder", incidentId: incident.id });
      }
      incident.lastSeenAt = at; incident.occurrences++; incident.finding = finding;
    }
    for (const incident of journal.incidents.filter((item) => item.target === key && item.status !== "resolved")) {
      // Unknown payment terms cannot establish recovery of a drift incident.
      if (!active.has(incident.checkId) && (incident.checkId.startsWith("terms.") ? run.termsObserved : incident.finding.kind === "removed" ? observed.checks.some((check) => check.id === incident.checkId) : observed.checks.some((check) => check.id === incident.checkId && check.status === "pass"))) {
        incident.status = "resolved"; incident.resolvedAt = at;
        events.push({ ...incident.finding, kind: "resolved", incidentId: incident.id });
      }
    }
    run.events = events;
    run.referenceApproved = Boolean(reference);
    run.referenceDigest = reference?.terms.digest ?? null;
    run.referenceChanges = reference && run.termsObserved ? approvedDiff(reference, observed.terms, target?.pricePolicy) : [];
  }
  const cutoff = now - 90 * 86400000;
  journal.incidents = journal.incidents.filter((item) => item.status !== "resolved" || Date.parse(item.resolvedAt) >= cutoff);
  if (journal.incidents.length > 2500) journal.incidents = [...journal.incidents.filter((item) => item.status !== "resolved"), ...journal.incidents.filter((item) => item.status === "resolved").slice(-500)];
}
export function updateIncident(journal, id, input, now = Date.now()) {
  if (Object.keys(input).some((key) => !["status", "comment"].includes(key)) || (!input.status && !input.comment)) throw fail(400, "Provide a status or a comment.");
  const incident = journal.incidents.find((item) => item.id === id);
  if (!incident) throw fail(404, "Incident not found.");
  if (input.status !== undefined) {
    if (!["open", "acknowledged"].includes(input.status) || incident.status === "resolved") throw fail(409, "Only active incidents can be opened or acknowledged; recovery is established by a scan.");
    incident.status = input.status;
    incident.acknowledgedAt = input.status === "acknowledged" ? new Date(now).toISOString() : null;
  }
  if (input.comment !== undefined) {
    if (typeof input.comment !== "string" || !input.comment.trim() || input.comment.length > 1000 || /[\p{Cc}\p{Cf}]/u.test(input.comment) || incident.comments.length >= 50) throw fail(400, "Comments must contain 1–1000 plain characters; at most 50 per incident.");
    incident.comments.push({ at: new Date(now).toISOString(), actor: "owner", text: input.comment.trim() });
  }
  audit(journal, "incident.updated", incident.target, { incidentId: id, status: incident.status }, now);
  return incident;
}
