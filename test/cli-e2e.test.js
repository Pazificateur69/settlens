import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createPublicKey, generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { createReport } from "../src/scanner.js";
import { eip3009Digest } from "../src/signature.js";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listenDemoServer } from "../demo/server.js";

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

function runCli(argumentsList, { cwd = projectRoot } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [join(projectRoot, "src/cli.js"), ...argumentsList],
      {
        cwd,
        env: {
          ...process.env,
          NO_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolvePromise({ code, signal, stdout, stderr });
    });
  });
}

test("CLI produces verifiable multi-format evidence and detects a bypass", async () => {
  const server = await listenDemoServer(0);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const directory = await mkdtemp(join(tmpdir(), "settlens-cli-e2e-"));
  const secureDirectory = join(directory, "secure");
  const bypassDirectory = join(directory, "bypass");

  try {
    const secure = await runCli([
      "scan",
      `${baseUrl}/secure`,
      "--facilitator",
      `${baseUrl}/facilitator`,
      "--repeat",
      "2",
      "--out",
      secureDirectory,
      "--format",
      "json,html,sarif",
    ]);
    assert.equal(secure.code, 0, secure.stderr || secure.stdout);
    assert.match(secure.stdout, /Reports:/);

    const secureFiles = await readdir(secureDirectory);
    assert.equal(
      secureFiles.filter((name) => /\.(json|html|sarif)$/.test(name)).length,
      3,
    );
    const jsonName = secureFiles.find((name) => name.endsWith(".json"));
    assert.ok(jsonName);
    const jsonPath = join(secureDirectory, jsonName);
    const report = JSON.parse(await readFile(jsonPath, "utf8"));
    assert.equal(report.integrations.officialX402Core, "2.28.0");
    assert.equal(report.scope.settlementCalls, 0);
    assert.equal(report.scope.privateKeysUsed, 0);
    assert.equal(report.integrity.algorithm, "sha256");

    const verification = await runCli(["verify-report", jsonPath]);
    assert.equal(verification.code, 0, verification.stderr);
    assert.match(verification.stdout, /^VALID /);

    const bypass = await runCli([
      "scan",
      `${baseUrl}/bypass`,
      "--active",
      "--authorized",
      "--authorization-ref",
      "CI-DEMO-SCOPE-001",
      "--repeat",
      "1",
      "--out",
      bypassDirectory,
      "--format",
      "json,sarif",
    ]);
    assert.equal(bypass.code, 1, bypass.stderr || bypass.stdout);
    assert.match(bypass.stdout, /Invalid payment authorization is denied/);

    const bypassJsonName = (await readdir(bypassDirectory)).find((name) =>
      name.endsWith(".json"),
    );
    const bypassReport = JSON.parse(
      await readFile(join(bypassDirectory, bypassJsonName), "utf8"),
    );
    const activeCheck = bypassReport.targets[0].checks.find(
      ({ id }) => id === "security.invalid_signature_fail_closed",
    );
    assert.equal(activeCheck.status, "fail");
    assert.equal(activeCheck.severity, "critical");
    assert.deepEqual(bypassReport.targets[0].authorization, {
      confirmed: true,
      reference: "CI-DEMO-SCOPE-001",
    });
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI signs an evidence attestation and verifies it against the report", async () => {
  const server = await listenDemoServer(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), "settlens-evidence-e2e-"));

  try {
    const scanDirectory = join(directory, "scan");
    const scan = await runCli([
      "scan",
      `${baseUrl}/secure`,
      "--repeat",
      "1",
      "--out",
      scanDirectory,
      "--format",
      "json",
    ]);
    assert.equal(scan.code, 0, scan.stderr || scan.stdout);
    const jsonName = (await readdir(scanDirectory)).find((name) =>
      name.endsWith(".json"),
    );
    const reportPath = join(scanDirectory, jsonName);

    const keyPath = join(directory, "evidence.key");
    const keygen = await runCli(["evidence", "keygen", "--out", keyPath]);
    assert.equal(keygen.code, 0, keygen.stderr);
    assert.match(keygen.stdout, /Public key: 0x[0-9a-f]{64}/);

    const attestationPath = join(directory, "attestation.json");
    const attest = await runCli([
      "evidence",
      "attest",
      reportPath,
      "--key",
      keyPath,
      "--out",
      attestationPath,
    ]);
    assert.equal(attest.code, 0, attest.stderr || attest.stdout);

    const verify = await runCli([
      "evidence",
      "verify",
      attestationPath,
      "--report",
      reportPath,
    ]);
    assert.equal(verify.code, 0, verify.stderr || verify.stdout);
    assert.match(verify.stdout, /^VALID /);
    assert.match(verify.stdout, /Report matches:\s+true/);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI monitor records a baseline then reports no regression", async () => {
  const server = await listenDemoServer(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), "settlens-monitor-e2e-"));

  try {
    const configPath = join(directory, "settlens.config.json");
    const statePath = join(directory, "state.json");
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        failOn: "high",
        output: join(directory, "reports"),
        defaults: { method: "GET", timeoutMs: 8000, repeat: 1 },
        targets: [{ name: "secure", url: `${baseUrl}/secure` }],
      }),
    );

    const first = await runCli([
      "monitor",
      "--config",
      configPath,
      "--state",
      statePath,
    ]);
    assert.equal(first.code, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /baseline recorded/);

    const second = await runCli([
      "monitor",
      "--config",
      configPath,
      "--state",
      statePath,
    ]);
    assert.equal(second.code, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /no regressions/);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI accepts --allow-host for custom headers", async () => {
  const server = await listenDemoServer(0);
  const url = `http://127.0.0.1:${server.address().port}/secure`;
  try {
    const args = ["scan", url, "--header", "X-Api-Key: test", "--repeat", "1", "--no-write"];
    const refused = await runCli(args);
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /Add --allow-host for: 127\.0\.0\.1/);

    const allowed = await runCli([...args, "--allow-host", "127.0.0.1"]);
    assert.equal(allowed.code, 0, allowed.stderr || allowed.stdout);
    assert.doesNotMatch(allowed.stderr, /Unknown option/);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
});

function signedEvmPayment() {
  const privateKey = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
  const from = `0x${Buffer.from(
    keccak_256(secp256k1.getPublicKey(privateKey, false).slice(1)),
  )
    .toString("hex")
    .slice(-40)}`;
  const requirement = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: `0x${"ab".repeat(20)}`,
    payTo: `0x${"cd".repeat(20)}`,
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  };
  const authorization = {
    from,
    to: requirement.payTo,
    value: "10000",
    validAfter: "1800000000",
    validBefore: "1800000600",
    nonce: `0x${"22".repeat(32)}`,
  };
  const digest = eip3009Digest(
    { name: "USDC", version: "2", chainId: 84532, verifyingContract: requirement.asset },
    authorization,
  );
  const compact = secp256k1.sign(digest, privateKey, { prehash: false });
  for (const recovery of [0, 1]) {
    const candidate = secp256k1.Signature.fromBytes(compact, "compact").addRecoveryBit(recovery);
    const recovered = `0x${Buffer.from(
      keccak_256(candidate.recoverPublicKey(digest).toBytes(false).slice(1)),
    )
      .toString("hex")
      .slice(-40)}`;
    if (recovered === from) {
      const signature = `0x${Buffer.from(compact).toString("hex")}${(27 + recovery).toString(16)}`;
      return { requirement, payload: { signature, authorization } };
    }
  }
  throw new Error("recovery bit not found");
}

test("CLI verify-payment checks the EVM window at --now and Solana signers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-verify-payment-"));
  try {
    const evmPath = join(directory, "evm.json");
    await writeFile(evmPath, JSON.stringify(signedEvmPayment()));

    const inside = await runCli(["verify-payment", evmPath, "--now", "1800000300"]);
    assert.equal(inside.code, 0, inside.stderr || inside.stdout);
    assert.match(inside.stdout, /^VERIFIED /);
    assert.match(inside.stdout, /Within window:\s+true \(at 1800000300\)/);

    // validBefore itself is already expired (EIP-3009: now < validBefore).
    const edge = await runCli(["verify-payment", evmPath, "--now", "2027-01-15T08:10:00Z"]);
    assert.equal(edge.code, 1, edge.stderr || edge.stdout);
    assert.match(edge.stdout, /Within window:\s+false \(at 1800000600\)/);

    const bad = await runCli(["verify-payment", evmPath, "--now", "soon"]);
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /ISO 8601/);

    const raw = (key) => key.export({ type: "spki", format: "der" }).subarray(-32);
    const feePayer = generateKeyPairSync("ed25519");
    const client = generateKeyPairSync("ed25519");
    const message = Buffer.concat([
      Buffer.from([0x80, 2, 0, 0, 2]),
      raw(feePayer.publicKey),
      raw(client.publicKey),
      Buffer.alloc(32, 7),
      Buffer.from([0, 0]),
    ]);
    const transaction = Buffer.concat([
      Buffer.from([2]),
      Buffer.alloc(64),
      nodeSign(null, message, client.privateKey),
      message,
    ]).toString("base64");
    const solanaPath = join(directory, "solana.json");
    await writeFile(
      solanaPath,
      JSON.stringify({
        requirement: { scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
        payload: { transaction },
      }),
    );
    const solana = await runCli(["verify-payment", solanaPath]);
    assert.equal(solana.code, 0, solana.stderr || solana.stdout);
    assert.match(solana.stdout, /^VERIFIED Solana signatures only \(v0\)/);
    assert.match(solana.stdout, /signature pending: added by the facilitator/);
    assert.match(solana.stdout, /Signer 0:\s+\S+ pending/);
    assert.match(solana.stdout, /Signer 1:\s+\S+ valid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI keygen never overwrites a key and verify enforces --expect-key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-keys-"));
  try {
    const keyPath = join(directory, "evidence.key");
    const keygen = await runCli(["evidence", "keygen", "--out", keyPath]);
    assert.equal(keygen.code, 0, keygen.stderr);
    if (process.platform !== "win32") {
      assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    }
    const original = await readFile(keyPath, "utf8");

    const again = await runCli(["evidence", "keygen", "--out", keyPath]);
    assert.equal(again.code, 2);
    assert.match(again.stderr, /already exists\. Refusing to overwrite/);
    assert.equal(await readFile(keyPath, "utf8"), original);

    const reportPath = join(directory, "report.json");
    await writeFile(reportPath, JSON.stringify(createReport([])));
    const attestationPath = join(directory, "attestation.json");
    const attest = await runCli([
      "evidence", "attest", reportPath, "--key", keyPath, "--out", attestationPath,
    ]);
    assert.equal(attest.code, 0, attest.stderr || attest.stdout);

    const signerPem = join(directory, "signer.pub.pem");
    await writeFile(
      signerPem,
      createPublicKey(original).export({ type: "spki", format: "pem" }),
    );
    const trusted = await runCli([
      "evidence", "verify", attestationPath, "--report", reportPath, "--expect-key", signerPem,
    ]);
    assert.equal(trusted.code, 0, trusted.stderr || trusted.stdout);
    assert.match(trusted.stdout, /Expected signer: true/);

    const otherPem = join(directory, "other.pub.pem");
    await writeFile(
      otherPem,
      generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }),
    );
    const impostor = await runCli(["evidence", "verify", attestationPath, "--expect-key", otherPem]);
    assert.equal(impostor.code, 1, impostor.stderr || impostor.stdout);
    assert.match(impostor.stdout, /^INVALID /);
    assert.match(impostor.stdout, /Expected signer: false/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI monitor rejects an invalid --fail-on and alerts on removed checks", async () => {
  const server = await listenDemoServer(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), "settlens-monitor-removed-"));
  const received = [];
  const webhook = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push(JSON.parse(body));
      response.end("ok");
    });
  });
  await new Promise((resolvePromise) => webhook.listen(0, "127.0.0.1", resolvePromise));

  try {
    const url = `${baseUrl}/secure`;
    const configPath = join(directory, "settlens.config.json");
    const statePath = join(directory, "state.json");
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        failOn: "high",
        output: join(directory, "reports"),
        defaults: { method: "GET", timeoutMs: 8000, repeat: 1 },
        targets: [{ name: "secure", url }],
      }),
    );

    const invalid = await runCli(["monitor", "--config", configPath, "--fail-on", "severe"]);
    assert.equal(invalid.code, 2);
    assert.match(invalid.stderr, /Invalid --fail-on "severe"/);

    const baseline = await runCli(["monitor", "--config", configPath, "--state", statePath]);
    assert.equal(baseline.code, 0, baseline.stderr || baseline.stdout);
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const entry = state[`GET ${url}`];
    assert.ok(entry, Object.keys(state).join(", "));

    // Legacy URL-only key with a check the endpoint no longer reports.
    entry.checks.push(
      { id: "legacy.high", status: "pass", severity: "high", title: "Lost high check" },
      { id: "legacy.low", status: "pass", severity: "low", title: "Lost low check" },
    );
    await writeFile(statePath, JSON.stringify({ [url]: entry }));

    const run = await runCli([
      "monitor", "--config", configPath, "--state", statePath,
      "--webhook", `http://127.0.0.1:${webhook.address().port}/hook`,
    ]);
    assert.equal(run.code, 1, run.stderr || run.stdout);
    assert.match(run.stdout, /secure \(GET http/);
    assert.match(run.stdout, /ALERT \[high\] legacy\.high: removed \(was pass\): coverage lost/);
    assert.match(run.stdout, /note \[low\] legacy\.low: removed \(was pass\): coverage lost/);
    assert.match(run.stdout, /1 blocking alert\(s\) at or above high/);
    assert.deepEqual(Object.keys(JSON.parse(await readFile(statePath, "utf8"))), [`GET ${url}`]);

    assert.equal(received.length, 1);
    assert.equal(received[0].alerting, 1);
    assert.equal(received[0].failOn, "high");
    assert.equal(received[0].runs[0].method, "GET");
    assert.deepEqual(
      received[0].runs[0].alerts.map(({ kind, id }) => `${kind}:${id}`),
      ["removed:legacy.high", "removed:legacy.low"],
    );
  } finally {
    await new Promise((resolvePromise) => webhook.close(resolvePromise));
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI check anchors SARIF results at the config file, relative to the cwd", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settlens-sarif-cli-"));
  try {
    const configDirectory = join(directory, "ci");
    await mkdir(configDirectory);
    await writeFile(
      join(configDirectory, "settlens.json"),
      JSON.stringify({
        version: 1,
        failOn: "none",
        output: "reports",
        defaults: { method: "GET", timeoutMs: 2000, repeat: 1 },
        // Port 9 (discard) refuses connections: one failing transport check.
        targets: [{ name: "down", url: "http://127.0.0.1:9/paid" }],
      }),
    );
    const check = await runCli(
      ["check", "--config", "ci/settlens.json", "--format", "sarif"],
      { cwd: directory },
    );
    assert.equal(check.code, 0, check.stderr || check.stdout);
    const reportDirectory = join(directory, "reports");
    const [sarifName] = await readdir(reportDirectory);
    const sarif = JSON.parse(await readFile(join(reportDirectory, sarifName), "utf8"));
    assert.ok(sarif.runs[0].results.length > 0);
    for (const result of sarif.runs[0].results) {
      assert.equal(
        result.locations[0].physicalLocation.artifactLocation.uri,
        "ci/settlens.json",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
