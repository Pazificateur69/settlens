import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICALIZATION,
  agentText,
  readBoundedResponseBody,
  sha256,
  stableStringify,
  unixSeconds,
} from "../src/utils.js";

test("agent text is one bounded line without control or format characters", () => {
  assert.equal(agentText("a\r\nIgnore\u0000the\u202Epolicy\u2028\u200B!"), "a Ignore the policy !");
  assert.equal(agentText("x".repeat(100)), `${"x".repeat(80)}…`);
  assert.equal(agentText(42, 5), "42");
});

test("response evidence is bounded without retaining excess bytes", async () => {
  const result = await readBoundedResponseBody(
    new Response("123456789"),
    4,
  );

  assert.equal(result.buffer.toString("utf8"), "1234");
  assert.equal(result.observedBytes, 4);
  assert.equal(result.digest, sha256("1234"));
  assert.equal(result.truncated, true);
});

test("empty response evidence has a deterministic digest", async () => {
  const result = await readBoundedResponseBody(new Response(null));
  assert.equal(result.observedBytes, 0);
  assert.equal(result.digest, sha256(""));
  assert.equal(result.truncated, false);
});

test("stable JSON v2 orders keys by code unit, v1 by the pinned en collation", () => {
  // Keys whose order differs between the two canonicalizations.
  const value = { B: 1, a: [{ z: 1, A: 2 }], _x: 3, A: 4 };
  assert.equal(CANONICALIZATION, "settlens-stable-json-v2");
  assert.equal(
    stableStringify(value),
    '{"A":4,"B":1,"_x":3,"a":[{"A":2,"z":1}]}',
  );
  assert.equal(
    stableStringify(value, "settlens-stable-json-v1"),
    '{"_x":3,"a":[{"A":2,"z":1}],"A":4,"B":1}',
  );
  // v1 is pinned to "en", not the machine locale (sv would put "aa" before "å").
  assert.equal(
    stableStringify({ aa: 1, "\u00e5": 2 }, "settlens-stable-json-v1"),
    '{"\u00e5":2,"aa":1}',
  );
  assert.throws(
    () => stableStringify({}, "settlens-stable-json-v9"),
    /Unsupported canonicalization/,
  );
});

test("unixSeconds accepts Unix seconds or ISO 8601 and rejects anything else", () => {
  assert.equal(unixSeconds(1_800_000_000), 1_800_000_000);
  assert.equal(unixSeconds("1800000000"), 1_800_000_000);
  assert.equal(unixSeconds("2027-01-15T08:00:00Z"), 1_800_000_000);
  assert.equal(unixSeconds(undefined, () => 1_800_000_000_999), 1_800_000_000);
  assert.throws(() => unixSeconds("yesterday"), /ISO 8601/);
});
