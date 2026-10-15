/* Settlens Monitor — continuous assurance.
 *
 * Runs the passive scan on a schedule (cron/CI or a loop) and compares each run
 * with the previous one stored per target ("METHOD url"), so drift is detected
 * on the first run after a production payment endpoint starts behaving
 * differently. Alerts: a check that regresses (pass/skip -> warn/fail, warn ->
 * fail), a new failing or warning check, or a check that disappeared (removed
 * coverage). It never sends payments and stays entirely within the passive,
 * no-custody boundary.
 */
import { scanTarget } from "./scanner.js";
import { sanitizeUrl } from "./utils.js";
import { paymentTermsSnapshot, diffPaymentTerms } from "./payment-terms.js";
import { getCheck } from "./catalog.js";

const STATUS_RANK = { pass: 0, skip: 0, warn: 1, fail: 2 };

// Pure diff between a baseline set of checks and the current set, keyed by id.
export function diffChecks(baselineChecks = [], currentChecks = []) {
  const baseline = new Map(baselineChecks.map((check) => [check.id, check]));
  const current = new Map(currentChecks.map((check) => [check.id, check]));

  const regressions = [];
  const improvements = [];
  const added = [];
  const removed = [];

  for (const check of currentChecks) {
    const previous = baseline.get(check.id);
    if (!previous) {
      if (check.status === "fail" || check.status === "warn") {
        added.push({
          id: check.id,
          status: check.status,
          severity: check.severity,
          title: check.title,
        });
      }
      continue;
    }
    const delta = STATUS_RANK[check.status] - STATUS_RANK[previous.status];
    if (delta > 0) {
      regressions.push({
        id: check.id,
        from: previous.status,
        to: check.status,
        severity: check.severity,
        title: check.title,
      });
    } else if (delta < 0) {
      improvements.push({ id: check.id, from: previous.status, to: check.status });
    }
  }

  for (const check of baselineChecks) {
    if (!current.has(check.id)) {
      removed.push({
        id: check.id,
        status: check.status,
        severity: check.severity,
        title: check.title,
      });
    }
  }

  return { regressions, improvements, added, removed };
}

function compactChecks(checks) {
  return checks.map(({ id, status, severity, title }) => ({
    id,
    status,
    severity,
    title,
    ...(getCheck(id) ? { recommendation: getCheck(id).fix } : {}),
  }));
}

// State key of a target: "<METHOD> <url>", so GET and POST on one URL keep
// separate baselines. Older state files keyed targets by the bare URL.
export function stateKey(method, url) {
  return `${String(method ?? "GET").toUpperCase()} ${url}`;
}

// Runs one monitoring pass over the targets and returns per-target diffs plus
// the next state to persist. `state` maps stateKey(method, url) to the last
// observed checks; a legacy URL-only entry is read once, then migrated.
// Alerts are the regressions, the newly failing checks and the removed checks
// (coverage loss). Each alert carries the check's severity; the caller decides
// which ones block (see the monitor command in cli.js).
export async function monitorTargets(targets, state = {}, options = {}) {
  const runs = [];
  const nextState = { ...state };
  const urlCounts = new Map();
  for (const target of targets) {
    const url = sanitizeUrl(target.url);
    urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
  }

  for (const target of targets) {
    let terms = null;
    const result = await scanTarget(target, {
      active: false,
      authorized: false,
      timeoutMs: options.timeoutMs,
      repeat: options.repeat,
      fetchImpl: options.fetchImpl,
      onPaymentRequired: (required) => { terms = paymentTermsSnapshot(required, { includeValues: options.includeTermsValues === true }); },
    });
    const url = result.target.url;
    const key = stateKey(result.target.method, url);
    // A legacy URL-only baseline is ambiguous when several methods share the URL.
    const baseline =
      state[key] ?? (urlCounts.get(url) === 1 ? state[url] : undefined);
    delete nextState[url];
    const diff = baseline
      ? diffChecks(baseline.checks, result.checks)
      : { regressions: [], improvements: [], added: [], removed: [] };

    nextState[key] = {
      checks: compactChecks(result.checks),
      summary: result.summary,
      termsObserved: Boolean(terms),
      observedAt: result.completedAt,
      // Keep last observable terms through outages; recovery still compares with them.
      terms: terms ?? baseline?.terms ?? null,
    };

    runs.push({
      name: result.name,
      method: result.target.method,
      url,
      firstRun: !baseline,
      observedAt: result.completedAt,
      termsObserved: Boolean(terms),
      summary: result.summary,
      diff,
      alerts: [
        ...diff.regressions.map((entry) => ({ kind: "regression", ...entry })),
        ...diff.added.map((entry) => ({ kind: "new", ...entry })),
        ...diff.removed.map((entry) => ({ kind: "removed", ...entry })),
        ...diffPaymentTerms(baseline?.terms, terms),
      ],
    });
    for (const alert of runs.at(-1).alerts) {
      const check = getCheck(alert.id);
      if (check) alert.recommendation = check.fix;
    }
  }

  return { runs, state: nextState };
}
