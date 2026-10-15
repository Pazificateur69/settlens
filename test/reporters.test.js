import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderConsole,
  renderHtml,
  renderSarif,
  shouldFail,
  writeReports,
} from "../src/reporters.js";
import { sanitizeUrl } from "../src/utils.js";

function sampleReport() {
  return {
    schemaVersion: 1,
    reportId: "test1234",
    product: "Settlens",
    productVersion: "0.2.0",
    generatedAt: "2026-07-30T00:00:00.000Z",
    scope: {
      targetCount: 1,
      activeTargetCount: 0,
      settlementCalls: 0,
      privateKeysUsed: 0,
    },
    summary: { pass: 1, fail: 1, warn: 0, skip: 0 },
    targets: [
      {
        name: "<Unsafe target>",
        target: {
          method: "GET",
          url: "https://example.com/paid",
          requestHeaderNames: ["authorization"],
        },
        mode: "passive",
        summary: { pass: 1, fail: 1, warn: 0, skip: 0 },
        checks: [
          {
            id: "transport.status_402",
            title: "Payment required",
            status: "pass",
            severity: "high",
            message: "HTTP 402 returned.",
          },
          {
            id: "binding.resource_url",
            title: "Resource binding",
            status: "fail",
            severity: "high",
            message: "Mismatch <script>alert(1)</script>",
            recommendation: "Bind the exact URL.",
          },
        ],
      },
    ],
  };
}

test("console and HTML reporters render findings safely", () => {
  const report = sampleReport();
  const consoleOutput = renderConsole(report);
  const html = renderHtml(report);

  assert.match(consoleOutput, /Resource binding/);
  assert.match(html, /Settlens/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.equal(shouldFail(report, "high"), true);
  assert.equal(shouldFail(report, "critical"), false);
  assert.equal(shouldFail(report, "none"), false);
  const sarif = renderSarif(report);
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results.length, 1);
  assert.equal(sarif.runs[0].results[0].ruleId, "binding.resource_url");
});

test("JSON and HTML evidence files are written", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-reports-"));

  try {
    const files = await writeReports(sampleReport(), directory, [
      "json",
      "html",
      "sarif",
    ]);
    assert.equal(files.length, 3);
    await Promise.all(files.map((file) => access(file)));
    const json = JSON.parse(await readFile(files[0], "utf8"));
    assert.equal(json.reportId, "test1234");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("URL sanitizer removes credentials and common secret parameters", () => {
  const sanitized = sanitizeUrl(
    "https://alice:password@example.com/paid?api_key=secret&city=Paris",
  );
  assert.doesNotMatch(sanitized, /alice|password|secret/);
  assert.match(sanitized, /api_key=%5BREDACTED%5D/);
  assert.match(sanitized, /city=Paris/);
});

test("every SARIF result has a physical location GitHub code scanning can keep", async () => {
  const report = sampleReport();
  report.targets.push({
    ...structuredClone(report.targets[0]),
    target: { method: "POST", url: "https://example.com/other", requestHeaderNames: [] },
  });

  const sarif = renderSarif(report);
  const results = sarif.runs[0].results;
  assert.equal(results.length, 2);
  for (const result of results) {
    assert.deepEqual(result.locations, [
      {
        physicalLocation: {
          artifactLocation: { uri: "settlens.config.json", uriBaseId: "%SRCROOT%" },
          region: { startLine: 1 },
        },
      },
    ]);
    assert.match(result.partialFingerprints.primaryLocationLineHash, /^[0-9a-f]{16}:1$/);
  }
  // Same rule on two targets: distinct alerts, not one collapsed location.
  assert.notEqual(
    results[0].partialFingerprints.primaryLocationLineHash,
    results[1].partialFingerprints.primaryLocationLineHash,
  );

  const withConfig = renderSarif(report, { artifactUri: "ci/settlens.config.json" });
  assert.equal(
    withConfig.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,
    "ci/settlens.config.json",
  );

  const directory = await mkdtemp(join(tmpdir(), "settlens-sarif-"));
  try {
    const [file] = await writeReports(report, directory, ["sarif"], {
      artifactUri: "x402/settlens.json",
    });
    const written = JSON.parse(await readFile(file, "utf8"));
    assert.equal(
      written.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri,
      "x402/settlens.json",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
