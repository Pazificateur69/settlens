"use strict";
const byId = (id) => document.getElementById(id);
const status = (text) => { byId("status").textContent = text; };
let journal;
let editingId;
let authEpoch = 0;
let viewRevision = 0;
let editRevision = 0;
let signingOut = false;
const requests = new Set();
const actions = new Map();
const CLI_COMMANDS = [
  "npm ci --ignore-scripts",
  "node src/cli.js check --config settlens.config.json",
  "mkdir -p .settlens",
  "# Optional: transfer the separately downloaded, reviewed CLI baseline.",
  "# An existing journal is left untouched; review migration separately.",
  "cp -n monitor-journal.json .settlens/monitor.json",
  "node src/cli.js monitor --config settlens.config.json --history .settlens/monitor.json",
  "node src/cli.js history --history .settlens/monitor.json",
].join("\n");
const CI_WORKFLOW = [
  "name: Settlens private policy gate",
  "on:", "  workflow_dispatch:", "permissions:", "  contents: read", "jobs:", "  assess:",
  "    if: github.event.repository.private == true", "    runs-on: ubuntu-latest", "    steps:",
  "      # The supplied private Settlens source and config must be in this checkout.",
  "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
  "      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  "        with:", '          node-version: "24"', "          package-manager-cache: false",
  "      - run: npm ci --ignore-scripts",
  "      - run: node src/cli.js check --config settlens.config.json",
  "      - name: Keep observed evidence even when the gate fails", "        if: always()",
  "        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  "        with:", "          name: settlens-reports", "          path: reports/", "          if-no-files-found: warn", "          retention-days: 30",
].join("\n");
function missingPolicy(target) {
  const expected = target.expected ?? {};
  const missing = [["payTo", "allowed recipients"], ["assets", "allowed assets"], ["networks", "allowed networks"]].filter(([key]) => !Array.isArray(expected[key]) || !expected[key].length || expected[key].some((value) => typeof value !== "string" || !value.trim())).map(([, label]) => label);
  if (typeof expected.maxAmount !== "string" || !/^\d+$/.test(expected.maxAmount)) missing.push("maximum atomic amount");
  return missing;
}
function configurationForCli(current = journal) {
  if (!current?.targets.length) throw new Error("Add an endpoint before exporting a CLI configuration.");
  if (current.targets.some((target) => missingPolicy(target).length)) throw new Error("Complete each endpoint's recipient, asset, network and maximum amount policy before export.");
  if (!["low", "medium", "high", "critical", "none"].includes(current.failOn)) throw new Error("The CLI threshold must be low, medium, high, critical or none before export.");
  const config = { version: 1, failOn: current.failOn, output: "reports", defaults: { method: "GET", timeoutMs: 8000, repeat: 2 }, targets: current.targets.map((target) => ({
    name: target.name, url: target.url,
    expected: Object.fromEntries(["resourceUrl", "schemes", "networks", "payTo", "assets", "maxAmount"].filter((key) => Object.hasOwn(target.expected, key)).map((key) => [key, Array.isArray(target.expected[key]) ? target.expected[key].slice() : target.expected[key]])),
    pricePolicy: target.pricePolicy?.mode === "range" ? { mode: "range", minAmount: target.pricePolicy.minAmount, maxAmount: target.pricePolicy.maxAmount } : { mode: "fixed" },
  })) };
  if (/\$\{[A-Z_][A-Z0-9_]*\}/.test(JSON.stringify(config))) throw new Error("Use literal endpoint names and policy values before export; CLI environment placeholders are not exported.");
  return config;
}
function atomicAmount(value, decimals) {
  const text = String(value).trim(); const precisionText = String(decimals).trim();
  if (!/^\d{1,2}$/.test(precisionText) || Number(precisionText) > 78) throw new Error("Choose the reviewed asset decimals explicitly: an integer from 0 to 78.");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || text.length > 160) throw new Error("Use a non-negative decimal amount with a dot; signs, commas and exponents are not accepted.");
  const precision = Number(precisionText); const fraction = match[2] ?? "";
  if (fraction.length > precision) throw new Error("The amount has more decimal places than the reviewed asset allows; no rounding is performed.");
  const result = (BigInt(match[1]) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0") || "0")).toString();
  if (result.length > 78) throw new Error("The converted atomic amount exceeds the calculator's 78-digit limit.");
  return result;
}
function drawOnboarding() {
  const targets = journal.targets; const count = targets.length;
  const https = targets.filter((target) => target.url.startsWith("https://")).length;
  const bounded = targets.filter((target) => !missingPolicy(target).length).length;
  const observed = targets.filter((target) => { const key = `GET ${target.url}`; const state = journal.state[key]; return state?.termsObserved && state.terms && !state.requiresRescan && Array.isArray(state.checks) && state.checks.length && !state.checks.some((check) => check.status === "fail" && ["high", "critical"].includes(check.severity)) && !journal.incidents.some((incident) => incident.target === key && incident.status !== "resolved" && ["high", "critical"].includes(incident.finding.severity)); }).length;
  const approved = targets.filter((target) => journal.references[`GET ${target.url}`]?.approvedAt).length;
  let config; let message;
  try { config = configurationForCli(); message = "Configuration ready to review and download. CLI/CI execution has not been verified."; }
  catch (error) { message = error.message; }
  const steps = [
    ["Add a public HTTPS endpoint", count && https === count, count ? `${count} configured; ${https}/${count} use HTTPS.` : "No endpoint yet. Add one to start; no demonstration endpoint is added automatically."],
    ["Bound the spending policy", count && bounded === count, `${bounded}/${count} have explicit recipient, asset, network and maximum amount bounds. Review these values against the intended payment option.`],
    ["Run checks for the current policy", count && observed === count, `${observed}/${count} have reviewable payment terms under the current policy. Resolve high or critical failures; review warnings before approval.`],
    ["Review and explicitly approve references", count && approved === count, `${approved}/${count} owner-approved references recorded. Existing incidents and later term changes still need review; an observation or download never creates approval.`],
  ];
  const list = byId("onboarding-list"); list.replaceChildren();
  for (const [title, done, detail] of steps) { const item = node("li"); item.append(node("strong", `${done ? "Recorded" : "Pending"} — ${title}`), node("p", detail)); item.className = done ? "done" : "pending"; list.append(item); }
  const cli = node("li"); cli.append(node("strong", `${config ? "Available" : "Pending"} — Prepare CLI and private CI`), node("p", "Use the configuration and optional baseline below. Downloading setup files does not verify a CLI run or configure a CI job.")); list.append(cli);
  byId("config-status").textContent = message; byId("download-config").disabled = !config;
  byId("config-preview").textContent = config ? JSON.stringify(config, null, 2) : "";
  byId("cli-command").textContent = CLI_COMMANDS; byId("ci-workflow").textContent = CI_WORKFLOW;
}
function staleRequest() { const error = new Error("Request superseded."); error.name = "AbortError"; return error; }
function clearWorkspace(message) {
  authEpoch++; viewRevision++;
  for (const controller of requests) controller.abort();
  requests.clear();
  for (const [button, operation] of actions) button.disabled = operation.disabled;
  actions.clear(); journal = undefined;
  for (const id of ["targets", "history", "incidents", "deliveries", "audit", "overview", "onboarding-list", "config-preview", "cli-command", "ci-workflow"]) byId(id).replaceChildren();
  byId("download-config").disabled = true; byId("config-status").textContent = "";
  byId("atomic-value").value = ""; byId("atomic-decimals").value = ""; byId("atomic-result").textContent = "";
  byId("schedule").textContent = ""; byId("token").value = ""; cancelEdit();
  byId("filter").value = ""; byId("severity").value = "all"; byId("incident-status").value = "active";
  byId("workspace").hidden = true; byId("login").hidden = false; byId("token").focus(); status(message);
}
function readableChange(alert) {
  const fields = ["scheme", "network", "asset", "payTo", "amount", "maxTimeoutSeconds"];
  if (fields.includes(alert.field) && alert.before && alert.after) return `${alert.field}${alert.field === "amount" ? " (atomic units)" : ""}\nApproved/previous: ${alert.before.map((option) => option[alert.field]).join(", ")}\nObserved: ${alert.after.map((option) => option[alert.field]).join(", ")}`;
  if (alert.field === "priceRange") return `Allowed range: ${JSON.stringify(alert.before[0])}\nObserved amounts: ${alert.after.map((option) => option.amount).join(", ")}`;
  if (alert.field === "options" && alert.before) return `Approved/previous: ${JSON.stringify(alert.before, null, 2)}\nObserved: ${JSON.stringify(alert.after, null, 2)}`;
  return `Fingerprint: ${alert.from} → ${alert.to}`;
}
function node(tag, text) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; }
async function api(path = "", method = "GET", data) {
  const epoch = authEpoch; const controller = new AbortController(); requests.add(controller);
  try {
    const response = await fetch(`/api/monitor${path}`, { method, signal: controller.signal, credentials: "same-origin", headers: data ? { "content-type": "application/json" } : {}, body: data ? JSON.stringify(data) : undefined, cache: "no-store" });
    if (epoch !== authEpoch) throw staleRequest();
    const value = await response.json().catch(() => ({}));
    if (epoch !== authEpoch) throw staleRequest();
    if (response.status === 401) { clearWorkspace(value.error || "Session expired. Sign in again."); throw staleRequest(); }
    if (!response.ok) throw new Error(value.error || "Request failed.");
    return value;
  } catch (error) { if (epoch !== authEpoch) throw staleRequest(); throw error; }
  finally { requests.delete(controller); }
}
function drawHistory() {
  const term = byId("filter").value.toLowerCase();
  const severity = byId("severity").value;
  const container = byId("history"); container.replaceChildren();
  for (const entry of [...(journal?.history ?? [])].reverse()) {
    for (const run of entry.runs) {
      if (severity !== "all" && ![...(run.alerts ?? []), ...(run.events ?? [])].some((alert) => alert.severity === severity)) continue;
      if (term && !JSON.stringify({ url: run.url, name: run.name, alerts: run.alerts }).toLowerCase().includes(term)) continue;
      const article = node("article");
      article.append(node("h3", run.name), node("p", `${entry.observedAt} · ${run.method} ${run.url}`));
      article.append(node("p", `${run.firstRun ? "First observation recorded" : `${run.alerts.length} changes`} · ${run.summary.fail} failures · ${run.summary.warn} warnings`));
      if (!run.termsObserved) article.append(node("p", "Payment terms could not be observed; the last observable terms are retained; no recovery is inferred."));
      const list = node("ul");
      for (const alert of run.alerts) {
        const item = node("li"); item.className = `severity-${alert.severity}`;
        item.append(node("strong", `[${alert.severity}] ${alert.id}: ${alert.title}`));
        if (alert.kind === "terms") {
          item.append(node("p", "Advertised terms changed. Observing a change does not approve it."));
          item.append(node("pre", readableChange(alert)));
        }
        item.append(node("p", alert.recommendation || "Review the endpoint configuration.")); list.append(item);
      }
      for (const improvement of run.diff.improvements) list.append(node("li", `Resolved ${improvement.id}: ${improvement.from} → ${improvement.to}`));
      article.append(list, node("small", `Observation digest: ${entry.digest}`)); container.append(article);
    }
  }
  if (!container.children.length) container.append(node("p", "No matching observations. Add an endpoint and run the checks."));
}
async function refresh() {
  const revision = ++viewRevision; const next = await api();
  if (revision !== viewRevision) throw staleRequest();
  journal = next; byId("login").hidden = true; byId("workspace").hidden = false;
  byId("schedule").textContent = `${journal.intervalMs ? `Scheduled every ${journal.intervalMs / 60000} minutes` : "Manual runs; automatic scheduling is disabled"}. Alert threshold: ${journal.failOn}. History: up to 200 runs / 90 days, subject to the 8 MiB journal limit.`;
  byId("targets").replaceChildren();
  for (const target of journal.targets) {
    const key = `GET ${target.url}`;
    const observed = journal.state[key]; const reference = journal.references[key];
    const card = node("article"); card.append(node("h3", target.name), node("p", target.url), node("pre", JSON.stringify({ expected: target.expected, pricePolicy: target.pricePolicy ?? { mode: "fixed" } }, null, 2)));
    const missing = missingPolicy(target); card.append(node("p", missing.length ? `Policy incomplete: ${missing.join(", ")}.` : "Four spending bounds recorded. Confirm these values against the intended payment option."));
    card.append(node("p", reference ? `Reference approved ${reference.approvedAt}` : "No approved reference. Review the first successful observation."));
    if (observed?.terms) {
      const details = node("details"); details.append(node("summary", "Review observed and approved payment terms"));
      details.append(node("h4", "Latest observable terms"), node("pre", JSON.stringify(observed.terms.values ?? { digest: observed.terms.digest }, null, 2)));
      if (reference) details.append(node("h4", "Approved terms"), node("pre", JSON.stringify(reference.terms.values ?? { digest: reference.terms.digest }, null, 2)));
      details.append(node("p", "Extra metadata is fingerprinted; arbitrary response text is not stored. Approval changes the reference explicitly and is recorded in the owner action history."));
      if (observed.requiresRescan) details.append(node("p", "Policy changed; run checks again before approval."));
      const approve = node("button", "Approve these observed terms"); approve.type = "button"; approve.disabled = !observed.termsObserved || Boolean(observed.requiresRescan);
      approve.addEventListener("click", () => action(approve, async (guard) => { await api(`/targets/${target.id}/approve`, "POST", { digest: observed.terms.digest }); guard(); await refresh(); guard(); status("Reference approved. Run checks to reassess existing incidents against it."); })); details.append(approve); card.append(details);
    }
    const edit = node("button", "Edit name and policy"); edit.type = "button";
    edit.addEventListener("click", () => {
      editRevision++;
      editingId = target.id; byId("name").value = target.name; byId("url").value = target.url; byId("url").readOnly = true;
      for (const [id, field] of [["recipient", "payTo"], ["asset", "assets"], ["network", "networks"]]) byId(id).value = (target.expected[field] ?? []).join(", ");
      byId("amount").value = target.expected.maxAmount ?? "";
      byId("price-mode").value = target.pricePolicy?.mode ?? "fixed"; byId("price-min").value = target.pricePolicy?.minAmount ?? ""; byId("price-max").value = target.pricePolicy?.maxAmount ?? "";
      byId("save-target").textContent = "Save changes"; byId("form-title").textContent = "Edit endpoint"; byId("cancel-edit").hidden = false;
      byId("target-form").parentElement.open = true; byId("name").focus();
    });
    const remove = node("button", "Remove endpoint"); remove.type = "button";
    remove.addEventListener("click", () => action(remove, async (guard) => { await api(`/targets/${target.id}`, "DELETE"); guard(); if (editingId === target.id) cancelEdit(); await refresh(); guard(); status("Endpoint removed. Past observations remain until retention expiry."); })); card.append(edit, remove); byId("targets").append(card);
  }
  if (!journal.targets.length) byId("targets").append(node("p", "No endpoints configured."));
  const active = journal.incidents.filter((incident) => incident.status !== "resolved");
  const pending = [...journal.outbox, ...journal.pilotDeliveries].filter((job) => !["delivered", "cancelled"].includes(job.status));
  byId("overview").replaceChildren(...[`${journal.targets.length} endpoints`, `${active.length} active incidents`, `${Object.keys(journal.references).length} approved references`, `${pending.length} pending or failed notifications`].map((text) => node("p", text)));
  drawIncidents(); drawDeliveries(); drawHistory(); drawOnboarding();
  byId("audit").replaceChildren(...journal.audit.slice(-50).reverse().map((entry) => node("p", `${entry.at} · ${entry.action} · ${entry.target}`)));
}
async function action(button, work) {
  if (button && actions.has(button)) return;
  const operation = { epoch: authEpoch, disabled: button?.disabled };
  const guard = () => { if (operation.epoch !== authEpoch) throw staleRequest(); };
  if (button) { actions.set(button, operation); button.disabled = true; }
  try { await work(guard); guard(); } catch (error) { if (operation.epoch === authEpoch && error.name !== "AbortError") status(error.message); }
  finally { if (button && actions.get(button) === operation) { button.disabled = operation.disabled; actions.delete(button); } }
}
byId("email-code").addEventListener("click", (event) => { if (signingOut) return; return action(event.target, async (guard) => { await api("/session/code", "POST", {}); guard(); status("A code was sent to contact@settlens.com. Enter it within 10 minutes."); }); });
byId("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (signingOut) return status("Sign-out is still pending. Wait before signing in again.");
  if (event.submitter && actions.has(event.submitter)) return;
  const token = byId("token").value; clearWorkspace("Signing in…");
  return action(event.submitter, async (guard) => {
    await api("/session", "POST", { token }); guard(); await refresh(); guard(); status("Signed in.");
  });
});
byId("target-form").addEventListener("submit", (event) => {
  event.preventDefault(); action(event.submitter, async (guard) => {
    const submittedRevision = editRevision;
    const expected = { ...(journal.targets.find((target) => target.id === editingId)?.expected ?? {}) };
    for (const [id, field] of [["recipient", "payTo"], ["asset", "assets"], ["network", "networks"]]) {
      const values = byId(id).value.split(",").map((value) => value.trim()).filter(Boolean); if (values.length) expected[field] = values; else delete expected[field];
    }
    if (byId("amount").value) expected.maxAmount = byId("amount").value; else delete expected.maxAmount;
    const pricePolicy = byId("price-mode").value === "range" ? { mode: "range", minAmount: byId("price-min").value, maxAmount: byId("price-max").value } : { mode: "fixed" };
    await api(editingId ? `/targets/${editingId}` : "/targets", editingId ? "PUT" : "POST", { name: byId("name").value, url: byId("url").value, expected, pricePolicy });
    guard();
    const changed = submittedRevision !== editRevision;
    if (!changed) cancelEdit();
    await refresh(); guard(); status(`Endpoint saved; history and approved terms preserved.${changed ? " Newer edits have not been saved." : ""}`);
  });
});
byId("refresh").addEventListener("click", (event) => action(event.target, refresh));
byId("run").addEventListener("click", (event) => action(event.target, async (guard) => {
  status("Checks running…"); const result = await api("/run", "POST", {}); guard(); await refresh(); guard(); status(`${result.blocking} blocking changes. ${result.delivery.error || "Checks completed."}`);
}));
byId("logout").addEventListener("click", (event) => {
  if (signingOut) return;
  signingOut = true;
  clearWorkspace("Signing out…");
  return action(event.target, async (guard) => { try { await api("/session", "DELETE"); guard(); status("Signed out."); } finally { signingOut = false; } });
});
function cancelEdit() { editRevision++; editingId = undefined; byId("target-form").reset(); byId("target-form").parentElement.open = false; byId("url").readOnly = false; byId("save-target").textContent = "Add endpoint"; byId("form-title").textContent = "Add an endpoint"; byId("cancel-edit").hidden = true; }
for (const event of ["input", "change"]) byId("target-form").addEventListener(event, () => { editRevision++; });
function drawIncidents() {
  const term = byId("filter").value.toLowerCase(); const severity = byId("severity").value; const selected = byId("incident-status").value;
  byId("incidents").replaceChildren();
  for (const incident of [...(journal?.incidents ?? [])].reverse()) {
    if ((selected === "active" && incident.status === "resolved") || (selected !== "active" && selected !== "all" && incident.status !== selected) || (severity !== "all" && incident.finding.severity !== severity) || (term && !JSON.stringify({ target: incident.target, finding: incident.finding }).toLowerCase().includes(term))) continue;
    const card = node("article"); card.className = `severity-${incident.finding.severity}`;
    card.append(node("h3", `[${incident.finding.severity}] ${incident.finding.title}`), node("p", incident.target), node("p", `${incident.status} · opened ${incident.openedAt} · seen ${incident.lastSeenAt} · ${incident.occurrences} observations`), node("p", incident.finding.recommendation ?? "Review this finding against the check catalog and your approved policy."));
    if (incident.finding.kind === "terms") card.append(node("pre", readableChange(incident.finding)));
    if (incident.resolvedAt) card.append(node("p", `Resolved ${incident.resolvedAt}${incident.resolution ? ` (${incident.resolution})` : ""}`));
    for (const comment of incident.comments) card.append(node("p", `${comment.at} · ${comment.text}`));
    if (incident.status !== "resolved") {
      const acknowledge = node("button", incident.status === "open" ? "Acknowledge" : "Reopen"); acknowledge.type = "button";
      acknowledge.addEventListener("click", () => action(acknowledge, async (guard) => { await api(`/incidents/${incident.id}`, "PATCH", { status: incident.status === "open" ? "acknowledged" : "open" }); guard(); await refresh(); guard(); status("Incident updated. Acknowledgement pauses reminders; it does not establish recovery."); })); card.append(acknowledge);
    }
    const form = node("form"); const label = node("label", "Add an owner comment"); const input = node("input"); input.maxLength = 1000; input.required = true; label.append(input); const save = node("button", "Add comment"); form.append(label, save);
    form.addEventListener("submit", (event) => { event.preventDefault(); action(save, async (guard) => { await api(`/incidents/${incident.id}`, "PATCH", { comment: input.value }); guard(); await refresh(); guard(); status("Comment saved."); }); }); card.append(form); byId("incidents").append(card);
  }
  if (!byId("incidents").children.length) byId("incidents").append(node("p", "No incidents match these filters. Missing observations and an unapproved reference do not establish payment safety."));
}
function drawDeliveries() {
  byId("deliveries").replaceChildren();
  for (const [lane, jobs] of [["monitor", journal.outbox], ["pilot", journal.pilotDeliveries]]) {
    for (const job of [...jobs].reverse().slice(0, 30)) {
      const card = node("article"); card.append(node("h3", `${job.kind} · ${job.status}`), node("p", `${job.createdAt} · ${job.attempts} attempt(s)`));
      if (job.deliveredAt) card.append(node("p", `Mail server or webhook acceptance: ${job.deliveredAt}`));
      if (job.error) card.append(node("p", job.error));
      if (job.status === "pending") card.append(node("p", `Next attempt: ${job.nextAttemptAt}`));
      if (["failed", "pending"].includes(job.status)) {
        const retry = node("button", "Retry delivery"); retry.type = "button";
        retry.addEventListener("click", () => action(retry, async (guard) => { await api(`/deliveries/${lane}/${job.id}/retry`, "POST", {}); guard(); await refresh(); guard(); status("Notification queued for another attempt."); })); card.append(retry);
      }
      byId("deliveries").append(card);
    }
  }
  if (!byId("deliveries").children.length) byId("deliveries").append(node("p", "No notifications queued yet."));
}
byId("cancel-edit").addEventListener("click", cancelEdit);
byId("filter").addEventListener("input", () => { drawHistory(); drawIncidents(); });
byId("severity").addEventListener("change", () => { drawHistory(); drawIncidents(); });
byId("incident-status").addEventListener("change", drawIncidents);
byId("onboarding-add").addEventListener("click", () => { byId("target-form").parentElement.open = true; byId("name").focus(); });
byId("download-config").addEventListener("click", (event) => action(event.target, () => {
  const config = configurationForCli();
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: "application/json" }));
  const link = node("a"); link.href = url; link.download = "settlens.config.json"; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status("Configuration downloaded. Review the file; no CLI run, CI job or reference approval was performed.");
}));
byId("atomic-form").addEventListener("submit", (event) => { event.preventDefault(); try { byId("atomic-result").textContent = atomicAmount(byId("atomic-value").value, byId("atomic-decimals").value); } catch (error) { byId("atomic-result").textContent = error.message; } });
for (const event of ["input", "change"]) byId("atomic-form").addEventListener(event, () => { byId("atomic-result").textContent = ""; });
refresh().catch((error) => { if (error.name !== "AbortError") status(error.message); });
