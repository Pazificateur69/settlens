import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createContext, runInContext } from "node:vm";

const flush = () => new Promise(setImmediate);
class Element {
  constructor(tag = "div") {
    this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {};
    this.value = ""; this.disabled = false; this.hidden = false; this.text = undefined;
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)), contains: (name) => classes.has(name) };
    this.parentElement = { open: false };
  }
  get textContent() { return this.text ?? this.children.map((node) => typeof node === "string" ? node : node.textContent).join(""); }
  set textContent(value) { this.text = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = undefined; this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
  fire(type, event = {}) { let result; for (const handler of this.listeners[type] ?? []) result = handler({ preventDefault() {}, target: this, currentTarget: this, ...event }); return result; }
  focus() { this.focused = true; }
  click() { return this.fire("click"); }
  remove() { this.removed = true; }
  find(predicate) { if (predicate(this)) return this; for (const child of this.children) { const found = typeof child !== "string" && child.find(predicate); if (found) return found; } }
}
const journal = () => ({
  targets: [{ id: "fixture-a", name: "Private fixture A", url: "https://a.example", expected: {} }, { id: "fixture-b", name: "Private fixture B", url: "https://b.example", expected: {} }],
  state: { "GET https://a.example": { termsObserved: true, terms: { digest: "illustrative-digest", values: [] } } }, references: {}, history: [], audit: [], intervalMs: 0, failOn: "high",
  incidents: [{ id: "fixture-incident", target: "GET https://a.example", status: "open", openedAt: "2026-10-14", lastSeenAt: "2026-10-14", occurrences: 1, comments: [], finding: { id: "policy.asset", kind: "check", severity: "high", title: "Illustrative asset mismatch" } }],
  outbox: [{ id: "fixture-delivery", kind: "monitor.email", status: "failed", createdAt: "2026-10-14", attempts: 1 }], pilotDeliveries: [],
});
async function monitorBrowser({ initial = journal(), initialize = true } = {}) {
  const ids = ["status", "workspace", "login", "targets", "history", "incidents", "deliveries", "audit", "overview", "schedule", "login-form", "target-form", "save-target", "cancel-edit", "form-title", "name", "url", "recipient", "asset", "network", "amount", "price-mode", "price-min", "price-max", "filter", "severity", "incident-status", "email-code", "token", "refresh", "run", "logout", "onboarding-list", "onboarding-add", "config-status", "download-config", "config-preview", "cli-command", "ci-workflow", "atomic-form", "atomic-value", "atomic-decimals", "atomic-result"];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  elements.severity.value = "all"; elements["incident-status"].value = "active"; elements["price-mode"].value = "fixed";
  const fieldIds = ["name", "url", "recipient", "asset", "network", "amount", "price-min", "price-max"];
  elements["target-form"].reset = () => { for (const id of fieldIds) elements[id].value = ""; elements["price-mode"].value = "fixed"; };
  const requests = [];
  const fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject,
    respond(value = journal(), status = 200) { resolve({ status, ok: status >= 200 && status < 300, json: async () => value }); } }));
  const downloads = []; const timers = [];
  const context = createContext({ document: { getElementById: (id) => elements[id], createElement: (tag) => new Element(tag), body: new Element("body") }, fetch, AbortController, Blob,
    URL: { createObjectURL(blob) { const url = `blob:fixture-${downloads.length}`; downloads.push({ url, blob }); return url; }, revokeObjectURL(url) { downloads.find((file) => file.url === url).revoked = true; } }, setTimeout: (handler) => timers.push(handler) });
  runInContext(await readFile(new URL("../site/assets/monitor.js", import.meta.url), "utf8"), context);
  if (initialize) { requests[0].respond(initial); await flush(); }
  const button = (container, label) => elements[container].find((node) => node.tag === "button" && node.textContent === label);
  const edit = (index) => elements.targets.children[index].find((node) => node.textContent === "Edit name and policy").fire("click");
  return { context, elements, requests, button, edit, downloads, timers, submit: new Element("button") };
}

test("logout clears private data immediately and ignores late authenticated responses, including response bodies", async () => {
  const b = await monitorBrowser(); b.edit(0); b.elements.filter.value = "Private fixture";
  const pending = b.elements.refresh.fire("click"); const request = b.requests.at(-1);
  let finishBody;
  request.resolve({ status: 200, ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) }); await flush();
  const logout = b.elements.logout.fire("click");
  assert.equal(request.options.signal.aborted, true);
  assert.equal(b.elements.workspace.hidden, true);
  for (const id of ["targets", "history", "incidents", "deliveries", "audit", "overview"]) assert.equal(b.elements[id].children.length, 0);
  for (const id of ["name", "url", "recipient", "filter", "token", "schedule"]) assert.equal(b.elements[id].value || b.elements[id].textContent, "");
  assert.equal(b.elements.token.focused, true);
  b.requests.at(-1).respond({ authenticated: false }); await logout;
  finishBody(journal()); await pending;
  assert.equal(b.elements.workspace.hidden, true); assert.equal(b.elements.login.hidden, false);
  assert.equal(b.elements.targets.children.length, 0); assert.equal(b.elements.status.textContent, "Signed out.");
});

test("concurrent refreshes render only the latest requested snapshot", async () => {
  const b = await monitorBrowser();
  const older = b.context.refresh().catch((error) => error); const olderRequest = b.requests.at(-1);
  const newer = b.context.refresh(); const newerRequest = b.requests.at(-1);
  const latest = journal(); latest.targets[0].name = "Latest observed name";
  newerRequest.respond(latest); await newer;
  olderRequest.respond(journal()); assert.equal((await older).name, "AbortError");
  assert.match(b.elements.targets.textContent, /Latest observed name/);
  assert.doesNotMatch(b.elements.targets.textContent, /Private fixture A/);
});

for (const kind of ["run", "approve", "remove", "acknowledge", "comment", "retry", "save"]) test(`logout invalidates the pending ${kind} callback and its status`, async () => {
  const b = await monitorBrowser();
  if (kind === "run") b.elements.run.fire("click");
  if (kind === "approve") b.button("targets", "Approve these observed terms").fire("click");
  if (kind === "remove") b.button("targets", "Remove endpoint").fire("click");
  if (kind === "acknowledge") b.button("incidents", "Acknowledge").fire("click");
  if (kind === "comment") { const form = b.elements.incidents.find((node) => node.tag === "form"); form.find((node) => node.tag === "input").value = "Owner fixture comment"; form.fire("submit"); }
  if (kind === "retry") b.button("deliveries", "Retry delivery").fire("click");
  if (kind === "save") { b.edit(0); b.elements["target-form"].fire("submit", { submitter: b.elements["save-target"] }); }
  const pending = b.requests.at(-1); const logout = b.elements.logout.fire("click");
  b.requests.at(-1).respond({ authenticated: false }); await logout;
  const count = b.requests.length;
  pending.respond({ blocking: 0, delivery: {} }); await flush();
  assert.equal(pending.options.signal.aborted, true);
  assert.equal(b.requests.length, count, "stale callbacks must not launch a fresh private GET");
  assert.equal(b.elements.workspace.hidden, true); assert.equal(b.elements.status.textContent, "Signed out.");
  assert.equal(b.elements["save-target"].disabled, false);
});

test("expired sessions clear the workspace and an older success cannot restore it", async () => {
  const b = await monitorBrowser();
  const earlier = b.context.refresh().catch((error) => error); const old = b.requests.at(-1);
  const expiry = b.elements.refresh.fire("click"); b.requests.at(-1).respond({ error: "Authentication required." }, 401); await expiry;
  old.respond(journal()); assert.equal((await earlier).name, "AbortError");
  assert.equal(b.elements.workspace.hidden, true); assert.equal(b.elements.targets.children.length, 0);
  assert.equal(b.elements.status.textContent, "Authentication required.");
});

test("a new sign-in invalidates the initial unauthenticated GET and its late 401", async () => {
  const b = await monitorBrowser({ initialize: false }); const initial = b.requests[0];
  b.elements.token.value = "illustrative-owner-code";
  const signin = b.elements["login-form"].fire("submit", { submitter: b.submit });
  assert.equal(initial.options.signal.aborted, true); assert.equal(b.elements.token.value, "");
  b.requests.at(-1).respond({ authenticated: true }); await flush(); b.requests.at(-1).respond(journal()); await signin;
  initial.respond({ error: "Authentication required." }, 401); await flush();
  assert.equal(b.elements.workspace.hidden, false); assert.equal(b.elements.status.textContent, "Signed in.");
});

test("sign-in waits for sign-out completion to avoid competing cookie mutations", async () => {
  const b = await monitorBrowser(); const logout = b.elements.logout.fire("click"); const count = b.requests.length;
  b.elements.token.value = "illustrative-owner-code"; b.elements["login-form"].fire("submit", { submitter: b.submit }); b.elements["email-code"].fire("click");
  assert.equal(b.requests.length, count); assert.match(b.elements.status.textContent, /Sign-out is still pending/);
  b.requests.at(-1).respond({ authenticated: false }); await logout; assert.equal(b.elements.status.textContent, "Signed out.");
});

test("failed sign-out keeps private data cleared and reports failure without claiming server logout", async () => {
  const b = await monitorBrowser(); const logout = b.elements.logout.fire("click"); b.requests.at(-1).reject(new Error("Illustrative connection failure")); await logout;
  assert.equal(b.elements.workspace.hidden, true); assert.equal(b.elements.targets.children.length, 0);
  assert.equal(b.elements.status.textContent, "Illustrative connection failure");
});

test("saving A preserves an edit of B started while A is pending", async () => {
  const b = await monitorBrowser(); b.edit(0); b.elements.name.value = "Saved A";
  b.elements["target-form"].fire("submit", { submitter: b.elements["save-target"] }); const save = b.requests.at(-1);
  b.edit(1); b.elements.name.value = "New unsaved B";
  save.respond({}); await flush(); b.requests.at(-1).respond(journal()); await flush();
  assert.equal(save.url, "/api/monitor/targets/fixture-a");
  assert.equal(b.elements.name.value, "New unsaved B"); assert.equal(b.elements.url.value, "https://b.example");
  assert.equal(b.elements["target-form"].parentElement.open, true); assert.match(b.elements.status.textContent, /Newer edits have not been saved/);
});

test("save preserves later changes to the same form and suppresses duplicate submission", async () => {
  const b = await monitorBrowser(); b.edit(0);
  b.elements["target-form"].fire("submit", { submitter: b.elements["save-target"] }); const save = b.requests.at(-1); const count = b.requests.length;
  b.elements["target-form"].fire("submit", { submitter: b.elements["save-target"] }); assert.equal(b.requests.length, count);
  b.elements.name.value = "Unsaved later edit"; b.elements["target-form"].fire("input");
  save.respond({}); await flush(); b.requests.at(-1).respond(journal()); await flush();
  assert.equal(b.elements.name.value, "Unsaved later edit"); assert.equal(b.elements["target-form"].parentElement.open, true);
});

test("successful unchanged saves reset the form and edited policies require a rescan before approval", async () => {
  const initial = journal(); initial.state["GET https://a.example"].requiresRescan = true;
  const b = await monitorBrowser({ initial }); const approve = b.button("targets", "Approve these observed terms");
  assert.equal(approve.disabled, true); assert.match(b.elements.targets.textContent, /Policy changed; run checks again before approval/);
  b.edit(0); b.elements["target-form"].fire("submit", { submitter: b.elements["save-target"] });
  b.requests.at(-1).respond({}); await flush(); b.requests.at(-1).respond(journal()); await flush();
  assert.equal(b.elements.name.value, ""); assert.equal(b.elements["target-form"].parentElement.open, false);
  assert.equal(b.button("targets", "Approve these observed terms").disabled, false);
});

async function pilotBrowser() {
  const values = { name: "Illustrative owner", email: "original@example.com", company: "Fixture", message: "Original scope" };
  const status = new Element(); const submit = new Element("button"); submit.focus();
  const form = new Element("form"); form.action = "/api/pilot"; form.reset = () => { for (const key of Object.keys(values)) values[key] = ""; };
  form.querySelector = (selector) => selector === "[data-form-status]" ? status : selector === 'button[type="submit"]' ? submit : null;
  class FormData { constructor() { this.entries = Object.entries(values); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } }
  const requests = [];
  const context = createContext({ document: { querySelector: () => null, getElementById: () => null, querySelectorAll: (selector) => selector === "[data-pilot-form]" ? [form] : [], createElement: (tag) => new Element(tag), body: new Element("body") }, window: { matchMedia: () => ({ matches: true }), setTimeout }, FormData,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) });
  runInContext(await readFile(new URL("../site/src/assets/site.js", import.meta.url), "utf8"), context);
  return { values, form, submit, status, requests, send: () => form.fire("submit") };
}

test("pilot success preserves fields changed during the POST and marks those edits as unsent", async () => {
  const b = await pilotBrowser(); const sent = b.send();
  b.values.email = "new-unsent@example.com"; b.values.message = "New unsent scope";
  assert.equal(b.submit.disabled, false); assert.equal(b.submit.focused, true);
  b.requests[0].resolve({ ok: true, json: async () => ({ ok: true }) }); await sent;
  assert.equal(JSON.parse(b.requests[0].options.body).email, "original@example.com");
  assert.equal(b.values.email, "new-unsent@example.com"); assert.equal(b.values.message, "New unsent scope");
  assert.match(b.status.textContent, /New edits have not been sent/); assert.equal(b.submit.attributes["aria-disabled"], undefined);
});

test("pilot unchanged success resets fields; pending submissions and failures preserve input", async () => {
  const b = await pilotBrowser(); const sent = b.send(); b.send(); assert.equal(b.requests.length, 1);
  b.requests[0].resolve({ ok: true, json: async () => ({ ok: true }) }); await sent;
  assert.ok(Object.values(b.values).every((value) => value === ""));
  const failed = await pilotBrowser(); const pending = failed.send(); failed.requests[0].resolve({ ok: false, json: async () => ({ error: "Illustrative failure" }) }); await pending;
  assert.equal(failed.values.email, "original@example.com"); assert.match(failed.status.textContent, /Illustrative failure/);
  assert.equal(failed.submit.disabled, false); assert.equal(failed.form.classList.contains("is-busy"), false);
  assert.ok((await readFile(new URL("../site/src/assets/site.js", import.meta.url))).length < 10000, "public script stays within its byte budget");
});

function onboardingJournal() {
  const value = journal(); value.incidents = []; value.outbox = [];
  for (const target of value.targets) {
    target.expected = { payTo: ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"], assets: ["0x036CbD53842c5426634e7929541eC2318f3dCF7e"], networks: ["eip155:84532"], maxAmount: "10000", schemes: ["exact"] };
    value.state[`GET ${target.url}`] = { termsObserved: true, terms: { digest: `illustrative-${target.id}`, values: [] }, checks: [{ id: "binding.resource_url", status: "pass", severity: "high" }] };
  }
  return value;
}

test("empty onboarding remains usable without inventing targets or approval", async () => {
  const empty = { ...journal(), targets: [], state: {}, references: {}, incidents: [], outbox: [] };
  const b = await monitorBrowser({ initial: empty });
  assert.equal(b.elements["onboarding-list"].children.length, 5);
  assert.ok(b.elements["onboarding-list"].children.every((step) => !step.textContent.startsWith("Recorded")));
  assert.match(b.elements["onboarding-list"].textContent, /No endpoint yet/);
  assert.equal(b.elements["download-config"].disabled, true); assert.equal(b.elements["config-preview"].textContent, "");
  b.elements["onboarding-add"].fire("click"); assert.equal(b.elements["target-form"].parentElement.open, true); assert.equal(b.elements.name.focused, true);
  assert.equal(b.requests.length, 1);
  await b.elements["download-config"].fire("click"); assert.equal(b.downloads.length, 0);
});

test("onboarding distinguishes four policy bounds, fresh observations and explicit owner references", async () => {
  const value = onboardingJournal(); delete value.targets[1].expected.assets;
  const b = await monitorBrowser({ initial: value });
  assert.match(b.elements["onboarding-list"].children[1].textContent, /Pending.*Bound the spending policy/);
  assert.match(b.elements.targets.textContent, /Policy incomplete: allowed assets/); assert.equal(b.elements["download-config"].disabled, true);
  value.targets[1].expected.assets = value.targets[0].expected.assets;
  value.state["GET https://b.example"].requiresRescan = true;
  b.elements.refresh.fire("click"); b.requests.at(-1).respond(value); await flush();
  assert.match(b.elements["onboarding-list"].children[1].textContent, /Recorded/);
  assert.match(b.elements["onboarding-list"].children[2].textContent, /Pending/);
  assert.match(b.elements["onboarding-list"].children[3].textContent, /Pending/);
  assert.match(b.elements["onboarding-list"].children[4].textContent, /Available/);
  assert.match(b.elements["onboarding-list"].children[4].textContent, /does not verify/);
  delete value.state["GET https://b.example"].requiresRescan;
  for (const target of value.targets) value.references[`GET ${target.url}`] = { approvedAt: "2026-10-14T00:00:00Z", terms: value.state[`GET ${target.url}`].terms };
  b.elements.refresh.fire("click"); b.requests.at(-1).respond(value); await flush();
  assert.match(b.elements["onboarding-list"].children[2].textContent, /Recorded/);
  assert.match(b.elements["onboarding-list"].children[3].textContent, /Recorded/);
  assert.doesNotMatch(b.elements["onboarding-list"].children[4].textContent, /Recorded/);
  assert.equal(b.requests.filter((request) => request.options.method !== "GET").length, 0, "rendering progress must never approve terms");
});

test("failed or unknown observations and plaintext endpoints remain pending in setup", async () => {
  const value = onboardingJournal(); value.targets[1].url = "http://b.example";
  value.state["GET https://a.example"].checks.push({ id: "policy.asset", status: "fail", severity: "high" });
  const b = await monitorBrowser({ initial: value });
  assert.match(b.elements["onboarding-list"].children[0].textContent, /Pending/);
  assert.match(b.elements["onboarding-list"].children[2].textContent, /Pending/);
  const healthy = onboardingJournal(); healthy.state["GET https://a.example"].termsObserved = false;
  healthy.incidents = [{ target: "GET https://b.example", status: "acknowledged", finding: { severity: "high", title: "Illustrative ongoing issue" }, comments: [] }];
  b.elements.refresh.fire("click"); b.requests.at(-1).respond(healthy); await flush();
  assert.match(b.elements["onboarding-list"].children[2].textContent, /0\/2/);
});

test("downloaded CLI config round-trips through the actual loader without private journal fields", async () => {
  const value = onboardingJournal();
  value.targets[0].pricePolicy = { mode: "range", minAmount: "9000", maxAmount: "10000" };
  value.targets[0].headers = { Authorization: "synthetic-field-that-must-not-be-exported" };
  value.references["GET https://a.example"] = { approvedAt: "2026-10-14", terms: value.state["GET https://a.example"].terms };
  const b = await monitorBrowser({ initial: value }); const count = b.requests.length;
  await b.elements["download-config"].fire("click"); assert.equal(b.downloads.length, 1); assert.equal(b.requests.length, count);
  const text = await b.downloads[0].blob.text(); const config = JSON.parse(text);
  assert.deepEqual(Object.keys(config).sort(), ["defaults", "failOn", "output", "targets", "version"]);
  assert.equal(config.version, 1); assert.equal(config.targets[0].expected.maxAmount, "10000");
  assert.deepEqual(config.targets[0].pricePolicy, { mode: "range", minAmount: "9000", maxAmount: "10000" });
  assert.doesNotMatch(text, /Authorization|synthetic-field|illustrative-digest|references|outbox|approvedAt|fixture-a/);
  assert.ok(b.context.document.body.children.find((link) => link.download === "settlens.config.json" && link.removed));
  b.timers.forEach((handler) => handler()); assert.equal(b.downloads[0].revoked, true);
  const directory = await mkdtemp(join(tmpdir(), "settlens-ui-config-"));
  try { const path = join(directory, "settlens.config.json"); await writeFile(path, text, { mode: 0o600 }); const loaded = await loadConfig(path);
    assert.equal(loaded.targets.length, 2); assert.equal(loaded.targets[0].method, "GET"); assert.equal(loaded.targets[0].repeat, 2);
    assert.equal(loaded.targets[0].timeoutMs, 8000); assert.deepEqual(loaded.targets[0].expected, config.targets[0].expected);
  } finally { await rm(directory, { recursive: true, force: true }); }
  assert.match(b.elements.status.textContent, /no CLI run, CI job or reference approval was performed/);
});

test("export rejects implicit CLI environment expansion and unsupported thresholds", async () => {
  const b = await monitorBrowser({ initial: onboardingJournal() });
  const placeholder = onboardingJournal(); placeholder.targets[0].name = "${SETTLENS_TEST_UNSET_NAME}";
  assert.throws(() => b.context.configurationForCli(placeholder), /literal endpoint names/);
  assert.throws(() => b.context.configurationForCli({ ...onboardingJournal(), failOn: "info" }), /CLI threshold/);
  const incomplete = onboardingJournal(); delete incomplete.targets[0].expected.maxAmount;
  assert.throws(() => b.context.configurationForCli(incomplete), /Complete each endpoint/);
});

test("setup commands stay passive and use a pinned private-repository workflow", async () => {
  const b = await monitorBrowser(); const workflow = b.elements["ci-workflow"].textContent;
  assert.match(workflow, /github\.event\.repository\.private == true/);
  assert.match(workflow, /npm ci --ignore-scripts/); assert.match(workflow, /node src\/cli\.js check --config settlens\.config\.json/);
  assert.doesNotMatch(workflow, /--active|--authorized|SETTLENS_API_TOKEN|secrets\./);
  const existing = await readFile(new URL("../examples/monitor-workflow.yml", import.meta.url), "utf8");
  for (const pin of workflow.match(/actions\/(?:checkout|setup-node|upload-artifact)@[a-f0-9]{40}/g)) assert.ok(existing.includes(pin), pin);
  assert.match(b.elements["cli-command"].textContent, /cp -n monitor-journal\.json \.settlens\/monitor\.json/);
  assert.match(b.elements["cli-command"].textContent, /monitor --config settlens\.config\.json --history \.settlens\/monitor\.json/);
  const shell = await readFile(new URL("../site/dashboard.html", import.meta.url), "utf8");
  assert.match(shell, /id="download-baseline" href="\/api\/monitor\/export\?format=journal"/);
  assert.match(shell, /it does not carry approved-reference drift or a persistent journal/);
  assert.doesNotMatch(shell, /<script[^>]*>[^<]+<\/script>|style=| on(?:click|submit)=/);
});

test("atomic conversion uses explicitly chosen decimals and preserves precision beyond IEEE754", async () => {
  const b = await monitorBrowser(); const convert = b.context.atomicAmount;
  assert.equal(convert("0.01", "6"), "10000"); assert.equal(convert("9007199254740993.000001", "6"), "9007199254740993000001");
  assert.equal(convert("1", "0"), "1"); assert.equal(convert("0", "78"), "0"); assert.equal(convert("9".repeat(78), "0"), "9".repeat(78));
  for (const [amount, decimals] of [["0.01", ""], ["1", "79"], ["1", "6.5"], ["1.234", "2"], ["1e3", "6"], ["-1", "6"], ["1,5", "6"], ["9".repeat(78), "1"]]) assert.throws(() => convert(amount, decimals));
});

test("the calculator does not set policy or send requests and removes superseded results", async () => {
  const b = await monitorBrowser(); b.elements.amount.value = "777"; b.elements["atomic-value"].value = "0.01";
  b.elements["atomic-form"].fire("submit"); assert.match(b.elements["atomic-result"].textContent, /Choose the reviewed asset decimals explicitly/);
  b.elements["atomic-decimals"].value = "6"; b.elements["atomic-form"].fire("submit"); assert.equal(b.elements["atomic-result"].textContent, "10000");
  assert.equal(b.elements.amount.value, "777"); assert.equal(b.requests.length, 1);
  b.elements["atomic-value"].value = "0.02"; b.elements["atomic-form"].fire("input"); assert.equal(b.elements["atomic-result"].textContent, "");
  b.elements["atomic-form"].fire("submit"); const logout = b.elements.logout.fire("click");
  for (const id of ["atomic-value", "atomic-decimals", "atomic-result", "config-preview", "onboarding-list"]) assert.equal(b.elements[id].value || b.elements[id].textContent, "");
  assert.equal(b.elements["download-config"].disabled, true);
  b.requests.at(-1).respond({ authenticated: false }); await logout;
});
