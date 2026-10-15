import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import {
  CHECK_CATALOG,
  CHECK_CATEGORIES,
  CHECK_MODES,
  checkMarkdown,
  getCheck,
} from "../src/catalog.js";

const SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);

// Every `id: "<category>.<name>"` literal in src/ (except the catalog itself),
// with the title written right after it.
async function emittedChecks() {
  const directory = new URL("../src/", import.meta.url);
  const files = (await readdir(directory)).filter(
    (name) => name.endsWith(".js") && name !== "catalog.js",
  );
  const emitted = new Map();
  for (const name of files) {
    const source = await readFile(new URL(name, directory), "utf8");
    for (const match of source.matchAll(
      /\bid:\s*"([a-z0-9_]+\.[a-z0-9_.]+)",\s*title:\s*"([^"]+)"/g,
    )) {
      emitted.set(match[1], match[2]);
    }
    for (const match of source.matchAll(/\bid:\s*"([a-z0-9_]+\.[a-z0-9_.]+)"/g)) {
      assert.ok(emitted.has(match[1]), `${name}: ${match[1]} must be followed by its title`);
    }
  }
  return emitted;
}

test("the catalog lists exactly the check ids emitted in src/", async () => {
  const emitted = await emittedChecks();
  const catalogued = CHECK_CATALOG.map(({ id }) => id);

  assert.equal(new Set(catalogued).size, catalogued.length, "duplicate catalog id");
  assert.deepEqual([...catalogued].sort(), [...emitted.keys()].sort());
  for (const check of CHECK_CATALOG) {
    assert.equal(check.title, emitted.get(check.id), `${check.id} title drifted`);
  }
});

test("catalog entries are frozen plain-string records", () => {
  assert.ok(Object.isFrozen(CHECK_CATALOG));
  for (const check of CHECK_CATALOG) {
    assert.ok(Object.isFrozen(check));
    for (const value of Object.values(check)) {
      assert.equal(typeof value, "string");
    }
    for (const key of ["title", "verifies", "why", "fix"]) {
      assert.ok(check[key].length > 0, `${check.id}.${key} is empty`);
    }
    assert.ok(Object.hasOwn(CHECK_MODES, check.mode), `${check.id} mode`);
    assert.ok(SEVERITIES.has(check.severity), `${check.id} severity`);
    assert.equal(check.category, check.id.split(".")[0]);
    assert.equal(Boolean(check.spec), Boolean(check.specUrl));
  }
  assert.ok(CHECK_CATEGORIES.includes("policy"));
});

test("a check renders as markdown with its specification link", () => {
  const markdown = checkMarkdown(getCheck("transport.status_402"));
  assert.match(markdown, /^# Unauthenticated request requires payment/);
  assert.match(markdown, /## How to fix/);
  assert.match(markdown, /\[x402 V2 HTTP transport\]\(https:/);
  assert.doesNotMatch(checkMarkdown(getCheck("transport.https")), /## Specification/);
  assert.equal(getCheck("unknown.check"), null);
});
