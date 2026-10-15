import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conformanceMain, runConformance } from "../scripts/conformance.mjs";

const report = await runConformance();

test("labelled x402 conformance corpus detects malformed integrations without flagging valid variations", () => {
  assert.equal(report.summary.failed, 0, JSON.stringify(report.results.filter(({ passed }) => !passed)));
  assert.ok(report.corpus.namedCases >= 40);
  assert.equal(report.corpus.generatedCases, 32);
  assert.equal(report.transport.externalRequests, 0);
  assert.equal(report.transport.unsafeAttempts, 0);
  assert.ok(report.results.every(({ scan }) => scan.requests <= 2));
  for (const metrics of [report.summary.scan, report.summary.preflight]) {
    assert.equal(metrics.falsePositive, 0);
    assert.equal(metrics.falseNegative, 0);
    assert.equal(metrics.detectionRate, 1);
    assert.equal(metrics.falsePositiveRate, 0);
    assert.ok(metrics.labelledPositive > 0 && metrics.labelledNegative > 0);
  }
});

test("compatibility records the pinned parser separately from binding and policy safety", () => {
  assert.deepEqual(report.environment.sdk, { package: "@x402/core", version: "2.28.0", surface: "parsePaymentRequired" });
  const bound = report.results.find(({ id }) => id === "wrong-resource-binding");
  assert.equal(bound.sdkAccepted, true);
  assert.equal(bound.preflight.decision, "do_not_pay");
  const transport = report.results.find(({ id }) => id === "resource-unprotected");
  assert.equal(transport.preflight.decision, "pay");
  assert.equal(transport.scan.flagged, true);
  const mixed = report.results.find(({ id }) => id === "mixed-options-select-safe-one");
  assert.equal(mixed.preflight.decision, "pay");
  assert.equal(mixed.preflight.acceptableCount, 1);
  assert.equal(mixed.scan.flagged, true);
  const v1 = report.results.find(({ id }) => id === "canonical-v1-sdk-only");
  assert.equal(v1.sdkAccepted, true);
  assert.equal(v1.preflight.decision, "do_not_pay");
});

test("seeded adversarial cases and complete evidence are deterministic", async () => {
  assert.deepEqual(await runConformance(), report);
  const changed = await runConformance({ seed: 403, mutationCount: 4 });
  assert.equal(changed.summary.failed, 0);
  assert.notEqual(changed.corpus.generatedSha256, report.corpus.generatedSha256);
  assert.deepEqual(await runConformance({ seed: 0, mutationCount: 0 }), await runConformance({ seed: 0, mutationCount: 0 }));
  assert.equal((await runConformance({ seed: 0xffffffff, mutationCount: 1 })).summary.failed, 0);
  for (const options of [{ seed: -1 }, { seed: 2 ** 32 }, { seed: 1.5 }, { mutationCount: -1 }, { mutationCount: 1001 }]) {
    await assert.rejects(runConformance(options), /must be/);
  }
});

test("conformance CLI separates JSON evidence from summary and refuses overwrite", async () => {
  let output = "";
  let diagnostics = "";
  const io = { stdout: { write(text) { output += text; } }, stderr: { write(text) { diagnostics += text; } } };
  assert.equal(await conformanceMain([], io), 0);
  assert.deepEqual(JSON.parse(output), report);
  assert.match(diagnostics, /Corpus-only metrics/);
  const directory = await mkdtemp(join(tmpdir(), "settlens-conformance-"));
  try {
    const path = join(directory, "report.json");
    assert.equal(await conformanceMain(["--seed", "403", "--mutations", "0", "--out", path], io), 0);
    assert.equal(JSON.parse(await readFile(path)).corpus.seed, 403);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(await conformanceMain(["--out", path], io), 2);
    assert.match(diagnostics, /output already exists/);
    assert.equal(JSON.parse(await readFile(path)).corpus.seed, 403);
    for (const args of [["--unknown", "1"], ["--seed"], ["--seed", "nan"], ["--mutations", "2.5"]]) {
      assert.equal(await conformanceMain(args, io), 2);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
