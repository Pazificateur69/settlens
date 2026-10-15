import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { SCENARIOS } from "../site/src/pages/tools/x402-checker.js";
import { runTool } from "../site/src/pages/tools/_shared.js";

for (const scenario of SCENARIOS) test(`public checker scenario: ${scenario.label}`, async () => {
  const s = scenario.sample;
  const policy = Object.fromEntries(["pay_to", "assets", "networks", "schemes"].filter((k) => s[k]).map((k) => [k, [s[k]]]));
  policy.max_amount = s.max_amount;
  const result = await runTool("evaluate_payment_requirements", { payment_required: s.payment_required, resource_url: s.resource_url, policy });
  assert.equal(result.decision, scenario.expect);
  assert.equal(result.checks.find((c) => c.id === "schema.official_x402_sdk").status, "pass", "a valid schema alone must not authorize changed payment terms");
  if (scenario.expect === "do_not_pay") assert.deepEqual(result.acceptable, []);
});

// Run the shipped browser script with a tiny DOM and deferred transport. These tests
// exercise UI state only; scenario tests above use the real policy evaluator.
class Node {
  constructor(tag = "div") { this.tag = tag; this.childNodes = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  append(...nodes) { this.childNodes.push(...nodes); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  cloneNode() { const n = new Node(this.tag); n.childNodes = [...this.childNodes]; return n; }
  get textContent() { return this.text ?? this.childNodes.map((n) => typeof n === "string" ? n : n.textContent).join(""); }
  set textContent(text) { this.text = text; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  focus() {}
  querySelector(tag) {
    for (const child of this.childNodes) if (child instanceof Node) {
      if (child.tag === tag) return child;
      const found = child.querySelector(tag); if (found) return found;
    }
    return null;
  }
}
async function browser(tool = "evaluate_payment_requirements", answer = { decision: "pay", summary: "Within policy", reasons: [], checks: [], acceptable: [] }) {
  const form = new Node(), result = new Node(), status = new Node(), submit = new Node("button"), sample = new Node("button");
  const field = new Node("textarea"); field.value = "{}"; field.dataset = { arg: "payment_required", type: "header" }; field.labels = [{ textContent: "Header" }];
  submit.textContent = "Check the request";
  sample.dataset = { sample: JSON.stringify({ payment_required: '{"changed":true}' }) };
  form.dataset = { tool, result: "result" }; form.elements = { payment_required: field };
  const classes = new Set(); form.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  form.querySelector = (s) => s === "[data-tool-status]" ? status : submit;
  form.querySelectorAll = (s) => s === "[data-arg]" ? [field] : s === "[data-tool-sample]" ? [sample] : [sample, submit];
  const requests = [];
  const document = { querySelectorAll: () => [form], getElementById: () => result, createElement: (tag) => new Node(tag) };
  const source = await readFile(new URL("../site/src/assets/tools.js", import.meta.url), "utf8");
  runInNewContext(source, { document, AbortController, fetch: (_url, options) => new Promise((resolve) => requests.push({ resolve, options })) });
  const finish = () => requests.at(-1).resolve({ status: 200, json: async () => ({ result: { structuredContent: answer } }) });
  const send = () => form.listeners.submit({ preventDefault() {} });
  return { form, result, status, sample, field, requests, finish, send };
}
test("editing input or loading a sample removes an earlier pay verdict", async () => {
  const b = await browser(); let pending = b.send(); b.finish(); await pending;
  assert.match(b.result.textContent, /Decision pay/);
  b.field.value = '{"edited":true}'; b.form.listeners.input();
  assert.doesNotMatch(b.result.textContent, /Decision pay/);
  assert.match(b.status.textContent, /Inputs changed/);
  pending = b.send(); b.finish(); await pending;
  b.sample.listeners.click({ currentTarget: b.sample });
  assert.doesNotMatch(b.result.textContent, /Decision pay/);
  assert.match(b.status.textContent, /Sample loaded/);
});
test("a late response to superseded input cannot restore a pay verdict", async () => {
  const b = await browser(); const pending = b.send();
  b.field.value = '{"edited":true}'; b.form.listeners.input();
  assert.equal(b.requests[0].options.signal.aborted, true);
  b.finish(); await pending; // Deliberately simulate a transport that ignores cancellation.
  assert.doesNotMatch(b.result.textContent, /Decision pay/);
  assert.match(b.status.textContent, /Inputs changed/);
  assert.equal(b.form.classList.contains("is-busy"), false);
});
test("an input change without an event is also rejected when the response arrives", async () => {
  const b = await browser(); const pending = b.send();
  b.field.value = '{"edited":true}'; b.finish(); await pending;
  assert.doesNotMatch(b.result.textContent, /Decision pay/);
  assert.match(b.status.textContent, /Inputs changed/);
});
test("signature results remain readable when a check timestamp exceeds the calendar range", async () => {
  const b = await browser("verify_payment_signature", { verified: false, signatureValid: false, recovered: null, reasons: ["Expired authorization"], checkedAt: Number.MAX_SAFE_INTEGER });
  const pending = b.send(); b.finish(); await pending;
  assert.match(b.result.textContent, /Expired authorization/);
  assert.match(b.result.textContent, /9007199254740991 Unix seconds \(outside the calendar range\)/);
  assert.doesNotMatch(b.status.textContent, /Invalid time value/);
});
