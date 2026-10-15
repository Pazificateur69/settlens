import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { listenDemoServer } from "../demo/server.js";
import { diffChecks, monitorTargets, stateKey } from "../src/monitor.js";

let server;
let baseUrl;

before(async () => {
  server = await listenDemoServer(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("diffChecks classifies regressions, improvements, additions and removals", () => {
  const baseline = [
    { id: "a", status: "pass", severity: "high", title: "A" },
    { id: "b", status: "fail", severity: "high", title: "B" },
    { id: "d", status: "pass", severity: "low", title: "D" },
  ];
  const current = [
    { id: "a", status: "fail", severity: "high", title: "A" },
    { id: "b", status: "pass", severity: "high", title: "B" },
    { id: "c", status: "warn", severity: "medium", title: "C" },
  ];

  const diff = diffChecks(baseline, current);
  assert.deepEqual(
    diff.regressions.map((entry) => entry.id),
    ["a"],
  );
  assert.deepEqual(
    diff.improvements.map((entry) => entry.id),
    ["b"],
  );
  assert.deepEqual(
    diff.added.map((entry) => entry.id),
    ["c"],
  );
  assert.deepEqual(diff.removed, [
    { id: "d", status: "pass", severity: "low", title: "D" },
  ]);
});

test("monitor records a baseline then reports no regression on a stable target", async () => {
  const targets = [{ name: "secure", url: `${baseUrl}/secure` }];

  const first = await monitorTargets(targets, {});
  assert.equal(first.runs[0].firstRun, true);
  assert.equal(first.runs[0].alerts.length, 0);

  const second = await monitorTargets(targets, first.state);
  assert.equal(second.runs[0].firstRun, false);
  assert.equal(second.runs[0].diff.regressions.length, 0);
  assert.equal(second.runs[0].alerts.length, 0);
});

test("monitor keys state by method and URL and alerts on removed checks", async () => {
  const url = `${baseUrl}/secure`;
  const first = await monitorTargets([{ name: "secure", url }], {});
  const key = stateKey("get", url);
  assert.equal(key, `GET ${url}`);
  assert.deepEqual(Object.keys(first.state), [key]);
  assert.equal(first.runs[0].method, "GET");

  // A legacy URL-only baseline is read, then migrated to the new key.
  const legacy = structuredClone(first.state[key]);
  legacy.checks.push({
    id: "legacy.coverage",
    status: "pass",
    severity: "high",
    title: "Legacy coverage",
  });
  const second = await monitorTargets([{ name: "secure", url }], { [url]: legacy });
  assert.equal(second.runs[0].firstRun, false);
  assert.deepEqual(second.runs[0].alerts, [
    {
      kind: "removed",
      id: "legacy.coverage",
      status: "pass",
      severity: "high",
      title: "Legacy coverage",
    },
  ]);
  assert.deepEqual(Object.keys(second.state), [key]);
});

test("a legacy URL-only baseline is ignored when several methods share the URL", async () => {
  const url = `${baseUrl}/secure`;
  const targets = [
    { name: "get", url, method: "GET" },
    { name: "post", url, method: "POST" },
  ];
  const baseline = await monitorTargets([{ name: "secure", url }], {});
  const result = await monitorTargets(targets, { [url]: baseline.state[`GET ${url}`] });
  assert.deepEqual(
    result.runs.map(({ firstRun }) => firstRun),
    [true, true],
  );
  assert.deepEqual(Object.keys(result.state).sort(), [`GET ${url}`, `POST ${url}`]);
});
