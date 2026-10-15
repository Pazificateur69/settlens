import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { createReport } from "../src/scanner.js";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("published JSON schemas compile and accept canonical artifacts", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const configSchema = await readJson(
    "../schemas/settlens-config.schema.json",
  );
  const reportSchema = await readJson(
    "../schemas/settlens-report.schema.json",
  );
  const config = await readJson("../settlens.config.example.json");

  const validateConfig = ajv.compile(configSchema);
  assert.equal(
    validateConfig(config),
    true,
    JSON.stringify(validateConfig.errors),
  );

  const report = createReport([
    {
      id: "target01",
      name: "fixture",
      target: {
        url: "https://example.com/paid",
        method: "GET",
        requestHeaderNames: [],
      },
      mode: "passive",
      startedAt: "2026-07-30T00:00:00.000Z",
      completedAt: "2026-07-30T00:00:01.000Z",
      summary: { pass: 1, fail: 0, warn: 0, skip: 0 },
      request: null,
      checks: [
        {
          id: "schema.fixture",
          title: "Fixture",
          status: "pass",
          severity: "info",
          message: "Schema fixture.",
        },
      ],
    },
  ]);
  const validateReport = ajv.compile(reportSchema);
  assert.equal(
    validateReport(report),
    true,
    JSON.stringify(validateReport.errors),
  );
});
