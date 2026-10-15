import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmailNotifications } from "../src/notifications.js";
import { createSiteServer } from "../site/server.js";
const env = { SETTLENS_EMAIL_ENABLED: "1", SMTP_HOST: "smtp.example", SMTP_USER: "contact@settlens.com", SMTP_PASSWORD: "fixture-only-password" };
const submission = { name: "Test visitor", email: "visitor@example.com", company: "Illustrative company", message: "Test request", source: "/contact", receivedAt: "2026-10-14T10:00:00Z" };

test("SMTP notifications are opt-in, enforce TLS, fixed recipient, separate subjects and safe Reply-To", async () => {
  assert.equal(createEmailNotifications({}), null);
  for (const overrides of [{ SMTP_PASSWORD: "" }, { SMTP_PORT: "25" }, { SMTP_FROM: "contact@example.com\r\nBcc: attacker@example.com" }]) assert.throws(() => createEmailNotifications({ ...env, ...overrides }), /require/);
  let options; const messages = [];
  const notifier = createEmailNotifications(env, { transportFactory: (config) => { options = config; return { sendMail: async (message) => { messages.push(message); return { accepted: ["contact@settlens.com"], rejected: [] }; }, close() {} }; } });
  assert.equal(options.secure, true); assert.equal(options.requireTLS, true); assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.debug, false); assert.equal(options.disableFileAccess, true);
  assert.equal((await notifier.pilot(submission)).delivered, true);
  assert.equal(messages[0].subject, "[Settlens][PILOTE] Nouvelle demande"); assert.deepEqual(messages[0].envelope.to, ["contact@settlens.com"]); assert.equal(messages[0].replyTo.address, submission.email);
  assert.ok(messages[0].text.includes(submission.message)); assert.equal(messages[0].html, undefined);
  assert.equal((await notifier.monitor([{ alerts: [] }])).skipped, true);
  await notifier.monitor([{ method: "GET", url: "https://merchant.example/", alerts: [{ id: "terms.amount", severity: "high", title: "Amount changed", recommendation: "Review price." }] }]);
  assert.match(messages[1].subject, /^\[Settlens\]\[ALERTE\]/); assert.ok(!messages[1].replyTo); assert.ok(messages[1].text.includes("Review price."));
  assert.equal((await notifier.test()).delivered, true); assert.match(messages[2].subject, /\[TEST\]/);
  notifier.close();
  let starttls;
  const other = createEmailNotifications({ ...env, SMTP_PORT: "587" }, { transportFactory: (config) => { starttls = config; return { close() {} }; } }); assert.equal(starttls.secure, false); assert.equal(starttls.requireTLS, true); other.close();
});
test("SMTP rejection or exception returns only a generic error", async () => {
  for (const sendMail of [async () => { throw new Error("secret-password smtp detail"); }, async () => ({ accepted: [], rejected: ["contact@settlens.com"] })]) {
    const notifier = createEmailNotifications(env, { transportFactory: () => ({ sendMail, close() {} }) });
    const result = await notifier.pilot({ ...submission, email: "bad\naddress" }); assert.equal(result.delivered, false); assert.ok(!JSON.stringify(result).includes("secret-password")); notifier.close();
  }
});
test("valid pilot intake notifies the owner; honeypots and invalid forms do not send mail", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-mail-test-")); let sent = 0;
  const server = createSiteServer({ pilotStore: join(dir, "pilots.jsonl"), emailNotifications: { pilot: async (value) => { sent++; assert.equal(value.email, submission.email); return { delivered: true }; }, close() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/pilot`;
  const post = (value) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  assert.equal((await post(submission)).status, 202); assert.equal(sent, 1);
  assert.equal((await post({ ...submission, website: "bot" })).status, 202); assert.equal(sent, 1);
  assert.equal((await post({ ...submission, email: "invalid" })).status, 400); assert.equal(sent, 1);
  assert.equal(JSON.parse((await readFile(join(dir, "pilots.jsonl"), "utf8")).trim()).email, submission.email);
});

test("protected SMTP credential encoding preserves punctuation without dotenv interpolation and rejects malformed values", () => {
  const password = "fixture-only-$#'\\quoted-é";
  let settings;
  const mail = createEmailNotifications({ ...env, SMTP_PASSWORD: undefined, SMTP_PASSWORD_B64: Buffer.from(password).toString("base64") }, { transportFactory: (value) => { settings = value; return { close() {} }; } });
  assert.equal(settings.auth.pass, password); assert.equal(settings.logger, false); mail.close();
  for (const encoded of ["", "%%%", "abc", 123, Buffer.from("x\n").toString("base64"), Buffer.from([255]).toString("base64"), "A".repeat(20000)]) assert.throws(() => createEmailNotifications({ ...env, SMTP_PASSWORD_B64: encoded }), /encoding/);
});
