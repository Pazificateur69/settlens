import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createMailRelayTransport } from "../src/mail-relay.js";
import { createEmailNotifications } from "../src/notifications.js";

test("mail relay client validates its certificate and sends no recipient-controlled envelope", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "settlens-relay-test-"));
  const key = join(dir, "key.pem"), ca = join(dir, "ca.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", ca], { stdio: "pipe" });
  let received, auth, status = 202;
  const server = createServer({ key: await readFile(key), cert: await readFile(ca) }, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks)); auth = req.headers.authorization;
    res.writeHead(status); res.end(status === 202 ? "" : "rejected");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const env = { SETTLENS_EMAIL_ENABLED: "1", SETTLENS_MAIL_RELAY_URL: `https://127.0.0.1:${server.address().port}/email`, SETTLENS_MAIL_RELAY_TOKEN: "fixture-relay-only-".repeat(3), SETTLENS_MAIL_RELAY_CA: ca };
  const notification = createEmailNotifications(env);
  assert.equal((await notification.test()).delivered, true);
  assert.match(auth, /^Bearer /); assert.ok(received.subject.startsWith("[Settlens][TEST]")); assert.equal(received.to, undefined); assert.equal(received.from, undefined);
  assert.equal((await notification.access("123456")).delivered, true); assert.match(received.subject, /\[ACCES\]/);
  status = 502; assert.equal((await notification.test()).delivered, false);
  notification.close();
  const socketPath = join(dir, "relay.sock");
  const unixServer = createServer({ key: await readFile(key), cert: await readFile(ca) }, (req, res) => { req.resume(); req.on("end", () => { res.writeHead(202); res.end(); }); });
  await new Promise((resolve) => unixServer.listen(socketPath, resolve));
  try {
    const tunneled = createEmailNotifications({ ...env, SETTLENS_MAIL_RELAY_SOCKET: socketPath });
    assert.equal((await tunneled.test()).delivered, true); tunneled.close();
    assert.throws(() => createMailRelayTransport({ ...env, SETTLENS_MAIL_RELAY_SOCKET: "relative.sock" }), /absolute/);
  } finally { await new Promise((resolve) => unixServer.close(resolve)); }
  assert.throws(() => createMailRelayTransport({ ...env, SETTLENS_MAIL_RELAY_URL: "http://127.0.0.1/email" }), /HTTPS/);
  assert.throws(() => createMailRelayTransport({ ...env, SETTLENS_MAIL_RELAY_TOKEN: "short" }), /HTTPS/);
  await assert.rejects(createMailRelayTransport(env).sendMail({ subject: "x", text: "x".repeat(70000) }), /size/);
});
test("relay handler refuses authentication failures, oversized content and arbitrary sender or recipients", () => {
  execFileSync("python3", ["-B", "-c", String.raw`
import importlib.util, threading, http.client, json
from http.server import HTTPServer
spec=importlib.util.spec_from_file_location("relay", "site/mail-relay.py")
relay=importlib.util.module_from_spec(spec);spec.loader.exec_module(relay)
delivered=[]
server=HTTPServer(("127.0.0.1",0),relay.make_handler("fixture-token",lambda message:delivered.append(message)))
thread=threading.Thread(target=server.serve_forever);thread.start()
def send(value, auth="Bearer fixture-token", length=None):
 client=http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=2)
 payload=json.dumps(value).encode()
 headers={"Authorization":auth,"Content-Type":"application/json"}
 if length is not None:headers["Content-Length"]=str(length)
 client.request("POST","/email",body=payload,headers=headers)
 response=client.getresponse();code=response.status;response.read();client.close();return code
try:
 valid={"subject":"[Settlens][TEST] Controlled test","text":"Test body"}
 assert send(valid)==202 and delivered[0]["To"]=="contact@settlens.com"
 assert send(valid,auth="Bearer wrong")==401
 assert send({**valid,"to":"attacker@example.com"})==400
 assert send({**valid,"subject":"Injected\r\nBcc: attacker@example.com"})==400
 assert send({**valid,"replyTo":"bad\r\naddress"})==400
 assert send(valid,length=70000)==413
 assert len(delivered)==1
finally:
 server.shutdown();server.server_close();thread.join()
`], { stdio: "pipe" });
});
