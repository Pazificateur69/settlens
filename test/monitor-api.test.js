import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSiteServer } from "../site/server.js";
import { createMonitorApi } from "../site/monitor-api.js";
const token = "test-monitor-".repeat(4);
const origin = "https://settlens.com";
const resolver = async () => [{ address: "8.8.8.8", family: 4 }];
async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "settlens-monitor-api-"));
  await mkdir(join(dir, "assets")); await writeFile(join(dir, "assets/monitor.js"), "// fixture"); await writeFile(join(dir, "assets/monitor.css"), "body{}");
  const server = createSiteServer({ root: dir, monitorToken: token, monitorStore: join(dir, "monitor.json"), monitorResolver: resolver, ...overrides });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path = "", method = "GET", input, extra = {}) => fetch(`${base}${(path.startsWith("/dashboard") || path.startsWith("/assets/")) ? path : `/api/monitor${path}`}`, { method, headers: { ...(input ? { "content-type": "application/json" } : {}), ...extra }, body: input ? JSON.stringify(input) : undefined });
}
const bearer = { authorization: `Bearer ${token}` };

test("private monitoring requires its own token, fixed origin and bounded configuration", () => {
  assert.throws(() => createMonitorApi({ token: "short" }), /credential/);
  assert.throws(() => createMonitorApi({ intervalMs: 10 }), /interval/);
  assert.throws(() => createSiteServer({ apiToken: token, monitorToken: token }), /separate/);
});
test("dashboard reveals no data, API rejects unauthenticated and cross-origin requests", async (t) => {
  const api = await fixture(t);
  const page = await api("/dashboard"); assert.equal(page.status, 200);
  const html = await page.text(); assert.ok(html.includes("Sign in")); assert.ok(!html.includes(token)); assert.ok(html.includes('id="workspace" hidden')); assert.match(html, /monitor\.js\?v=[a-f0-9]{16}/); assert.match(html, /monitor\.css\?v=[a-f0-9]{16}/);
  assert.equal(page.headers.get("cache-control"), "no-store"); assert.equal(page.headers.get("x-robots-tag"), "noindex");
  for (const asset of ["/assets/monitor.js", "/assets/monitor.css"]) { const response = await api(asset); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-cache"); }
  assert.equal((await api()).status, 401);
  assert.equal((await api("", "GET", undefined, { ...bearer, origin: "https://attacker.example" })).status, 403);
  assert.equal((await api("/session", "POST", { token })).status, 403);
  assert.equal((await api("/session", "POST", { token: "wrong" }, { origin })).status, 401);
  const unsupported = await api("/run", "POST", undefined, bearer); assert.equal(unsupported.status, 415);
  assert.equal((await api("/session", "POST", { payload: "x".repeat(34000) }, { origin })).status, 413);
  assert.equal((await api("/dashboard", "POST", {})).status, 405);
});
test("cookie sessions are HttpOnly, expire, require CSRF origin, and logout revokes them", async (t) => {
  const api = await fixture(t);
  const login = await api("/session", "POST", { token }, { origin }); assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie"); assert.match(setCookie, /HttpOnly; Secure; SameSite=Strict; Max-Age=3600/);
  const cookie = setCookie.split(";")[0];
  assert.equal((await api("", "GET", undefined, { cookie })).status, 200);
  assert.equal((await api("/session", "DELETE", undefined, { cookie })).status, 401);
  assert.equal((await api("/session", "DELETE", undefined, { cookie, origin })).status, 200);
  assert.equal((await api("", "GET", undefined, { cookie })).status, 401);
});
test("targets reject SSRF, credential forwarding, duplicates and unknown fields; persistence and exports work", async (t) => {
  const api = await fixture(t, { monitorFetchImpl: async () => { throw new Error("offline"); } });
  for (const url of ["http://127.0.0.1/paid", "http://169.254.169.254/", "https://user:pass@merchant.example/", "https://merchant.example/?token=sensitive"]) {
    assert.equal((await api("/targets", "POST", { name: "API", url }, bearer)).status, 400);
  }
  assert.equal((await api("/targets", "POST", { name: "API", url: "https://merchant.example/", headers: { authorization: "test" } }, bearer)).status, 400);
  assert.equal((await api("/targets", "POST", { name: "", url: "https://merchant.example/" }, bearer)).status, 400);
  const created = await api("/targets", "POST", { name: "API", url: "https://merchant.example/", expected: { maxAmount: "10000" } }, bearer);
  assert.equal(created.status, 201); const target = await created.json();
  assert.equal((await api("/targets", "POST", { name: "API", url: target.url }, bearer)).status, 409);
  const run = await api("/run", "POST", {}, bearer); assert.equal(run.status, 200);
  const result = await run.json(); assert.equal(result.entry.runs[0].firstRun, true);
  const saved = await (await api("", "GET", undefined, bearer)).json(); assert.equal(saved.history.length, 1); assert.equal(saved.targets.length, 1);
  assert.equal((await api("/run", "POST", {}, bearer)).status, 429);
  const html = await api("/export?format=html", "GET", undefined, bearer); assert.match(html.headers.get("content-disposition"), /attachment/); assert.match(await html.text(), /Settlens monitor history/);
  assert.equal((await (await api("/export", "GET", undefined, bearer)).json()).length, 1);
  assert.equal((await api(`/targets/${target.id}`, "DELETE", undefined, bearer)).status, 200);
  assert.equal(Object.keys((await (await api("", "GET", undefined, bearer)).json()).state).length, 0);
  assert.equal((await api(`/targets/${target.id}`, "DELETE", undefined, bearer)).status, 404);
  assert.equal((await api("/unknown", "GET", undefined, bearer)).status, 405);
});
test("DNS is checked on every scan, including after a target was added", async (t) => {
  let publicDns = true; let requests = 0;
  const api = await fixture(t, { monitorResolver: async () => [{ address: publicDns ? "8.8.8.8" : "127.0.0.1", family: 4 }], monitorFetchImpl: async () => { requests++; return new Response(""); } });
  assert.equal((await api("/targets", "POST", { name: "API", url: "https://merchant.example/" }, bearer)).status, 201);
  publicDns = false;
  assert.equal((await api("/run", "POST", {}, bearer)).status, 200);
  assert.equal(requests, 0);
});
test("unconfigured monitoring is disabled and failed logins are rate limited", async (t) => {
  const disabled = await fixture(t, { monitorToken: undefined, monitorStore: undefined });
  assert.equal((await disabled()).status, 503);
  const api = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await api("/session", "POST", { token: "wrong" }, { origin })).status, 401);
  assert.equal((await api("/session", "POST", { token }, { origin })).status, 429);
});


test("email sign-in codes are owner-only, never returned, expire, and work only once", async (t) => {
  let code;
  const api = await fixture(t, { monitorEmailLogin: true, emailNotifications: { access: async (value) => { code = value; return { delivered: true }; }, close() {} } });
  const sent = await api("/session/code", "POST", {}, { origin });
  assert.equal(sent.status, 202); assert.equal((await sent.json()).sent, true); assert.match(code, /^[0-9]{6}$/);
  assert.equal((await api("/session/code", "POST", {}, { origin })).status, 429);
  const login = await api("/session", "POST", { token: code }, { origin }); assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.equal((await api("/session", "POST", { token: code }, { origin })).status, 401);
});
test("email sign-in rejects unavailable email, missing origin, failed delivery and expired codes", async (t) => {
  const disabled = await fixture(t); assert.equal((await disabled("/session/code", "POST", {}, { origin })).status, 503);
  const failed = await fixture(t, { monitorEmailLogin: true, emailNotifications: { access: async () => ({ delivered: false }), close() {} } });
  assert.equal((await failed("/session/code", "POST", {}, { origin })).status, 503);
  assert.equal((await failed("/session/code", "POST", {})).status, 403);
  let code;
  const api = await fixture(t, { monitorEmailLogin: true, emailNotifications: { access: async (value) => { code = value; return { delivered: true }; }, close() {} } });
  assert.equal((await api("/session/code", "POST", {}, { origin })).status, 202);
  const future = Date.now() + 601000; t.mock.method(Date, "now", () => future);
  assert.equal((await api("/session", "POST", { token: code }, { origin })).status, 401);
});
