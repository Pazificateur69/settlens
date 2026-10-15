import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCredentialHosts,
  loadConfig,
  normalizeTarget,
} from "../src/config.js";

test("config loads targets, defaults and environment references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-config-"));
  const file = join(directory, "settlens.json");
  const previous = process.env.SETTLENS_TEST_TOKEN;
  process.env.SETTLENS_TEST_TOKEN = "secret-runtime-value";

  try {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        failOn: "critical",
        output: "evidence",
        defaults: { timeoutMs: 1234 },
        targets: [
          {
            name: "example",
            url: "https://example.com/paid",
            headers: { Authorization: "Bearer ${SETTLENS_TEST_TOKEN}" },
          },
        ],
      }),
    );

    const config = await loadConfig(file);
    assert.equal(config.targets[0].timeoutMs, 1234);
    assert.equal(
      config.targets[0].headers.Authorization,
      "Bearer secret-runtime-value",
    );
    assert.equal(config.failOn, "critical");
    assert.equal(config.output, "evidence");
  } finally {
    if (previous === undefined) {
      delete process.env.SETTLENS_TEST_TOKEN;
    } else {
      process.env.SETTLENS_TEST_TOKEN = previous;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("config rejects missing environment variables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-config-"));
  const file = join(directory, "settlens.json");
  delete process.env.SETTLENS_MISSING_TOKEN;

  try {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        targets: [
          {
            url: "https://example.com/paid",
            headers: { Authorization: "${SETTLENS_MISSING_TOKEN}" },
          },
        ],
      }),
    );

    await assert.rejects(
      () => loadConfig(file),
      /Environment variable SETTLENS_MISSING_TOKEN is required/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("custom headers require an out-of-config host allowlist", () => {
  const target = normalizeTarget({
    url: "https://merchant.example/paid",
    headers: { Authorization: "Bearer secret" },
  });
  assert.throws(
    () => assertCredentialHosts([target], []),
    /--allow-host.*merchant\.example/,
  );
  assert.doesNotThrow(() =>
    assertCredentialHosts([target], ["merchant.example"]),
  );
});

test("runtime validation rejects unsafe or unbounded target input", () => {
  assert.throws(
    () =>
      normalizeTarget({
        url: "https://example.com/paid",
        unexpected: true,
      }),
    /unsupported field/,
  );
  assert.throws(
    () =>
      normalizeTarget({
        url: "https://example.com/paid",
        repeat: 11,
      }),
    /between 1 and 10/,
  );
  assert.throws(
    () => normalizeTarget({ url: "https://example.com/paid", method: true }),
    /method must be a string/,
  );
  assert.throws(
    () =>
      normalizeTarget({
        url: "https://example.com/paid",
        headers: { Authorization: "safe\r\nInjected: yes" },
      }),
    /unsafe/,
  );
  assert.throws(
    () =>
      normalizeTarget({
        url: "https://example.com/paid",
        method: "GET",
        body: "{}",
      }),
    /must not provide a body/,
  );
});
