import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { CASES } from "../site/src/pages/tools/_policy-demo.js";
import { runTool } from "../site/src/pages/tools/_shared.js";

const fixtures = JSON.parse(await readFile(new URL("../site/assets/x402-policy-cases.json", import.meta.url), "utf8"));
const runner = await readFile(new URL("../site/assets/x402-policy-regression.cjs", import.meta.url), "utf8");
async function execute(cases, transport) {
  const process = { argv: ["node", "runner", "cases.json"], exitCode: 0 };
  const output = [];
  await runInNewContext(runner, {
    require: () => ({ readFile: async () => JSON.stringify(cases) }),
    process, AbortSignal, fetch: transport,
    console: { log: (line) => output.push(line), error: (line) => output.push(line) },
  });
  return { process, output };
}
const evaluate = async (url, request) => {
  assert.equal(url, "https://settlens.com/mcp");
  assert.equal(request.redirect, "error");
  const { params } = JSON.parse(request.body);
  assert.equal(params.name, "evaluate_payment_requirements");
  return { ok: true, json: async () => ({ result: { structuredContent: await runTool(params.name, params.arguments) } }) };
};

test("downloadable public fixtures and runner reproduce the real checker decisions", async () => {
  assert.deepEqual(fixtures, CASES);
  const result = await execute(fixtures, evaluate);
  assert.equal(result.process.exitCode, 0);
  assert.equal(result.output.length, fixtures.length);
  assert.ok(result.output.includes("Recipient changes: do_not_pay"));
});

test("public regression job fails on a changed expectation or unavailable evaluator", async () => {
  const wrong = structuredClone(fixtures);
  wrong[1].expected = "pay";
  assert.equal((await execute(wrong, evaluate)).process.exitCode, 1);
  for (const response of [
    async () => { throw new Error("Request timed out"); },
    async () => ({ ok: false, status: 429 }),
    async () => ({ ok: true, json: async () => ({ result: { isError: true } }) }),
    async () => ({ ok: true, json: async () => { throw new Error("Invalid JSON"); } }),
  ]) assert.equal((await execute(fixtures, response)).process.exitCode, 1);
});
