import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { listenDemoServer } from "../demo/server.js";
import {
  probeFacilitatorVerify,
  validateSupportedResponse,
} from "../src/facilitator.js";
import {
  createReport,
  scanTarget,
  verifyReportIntegrity,
} from "../src/scanner.js";
import { encodeBase64Json } from "../src/protocol.js";
import { shouldFail } from "../src/reporters.js";
import { sha256, stableStringify } from "../src/utils.js";

let server;
let baseUrl;

before(async () => {
  server = await listenDemoServer(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function check(result, id) {
  return result.checks.find((entry) => entry.id === id);
}

test("facilitator shape permits backward-compatible V1 kinds and empty families", () => {
  const problems = validateSupportedResponse({
    kinds: [
      { x402Version: 1, scheme: "exact", network: "base" },
      { x402Version: 2, scheme: "exact", network: "eip155:8453" },
    ],
    extensions: [],
    signers: {
      "eip155:*": ["0x1234567890abcdef1234567890abcdef12345678"],
      "xrpl:*": [],
    },
  });
  assert.deepEqual(problems, []);
});

test("secure endpoint passes passive V2 checks", async () => {
  const result = await scanTarget({
    name: "secure",
    url: `${baseUrl}/secure`,
    expected: {
      schemes: ["exact"],
      networks: ["eip155:84532"],
      payTo: ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"],
      maxAmount: "10000",
    },
  });

  assert.equal(check(result, "transport.status_402").status, "pass");
  assert.equal(check(result, "schema.payment_required").status, "pass");
  assert.equal(check(result, "schema.official_x402_sdk").status, "pass");
  assert.equal(check(result, "binding.resource_url").status, "pass");
  assert.equal(check(result, "policy.maximum_amount").status, "pass");
  assert.equal(shouldFail(createReport([result]), "high"), false);
});

test("resource requirements are cross-checked with facilitator capabilities", async () => {
  const result = await scanTarget({
    name: "integrated",
    url: `${baseUrl}/secure`,
    facilitator: { url: `${baseUrl}/facilitator`, headers: {} },
  });

  assert.equal(
    check(result, "facilitator.supported_schema").status,
    "pass",
  );
  assert.equal(
    check(result, "facilitator.requirement_coverage").status,
    "pass",
  );
});

test("malformed accepts entries are facilitator findings, never a crash", async () => {
  const valid = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
  };
  const header = encodeBase64Json({
    x402Version: 2,
    resource: { url: "https://paid.example/data" },
    accepts: [null, "text", { scheme: "exact", network: 7 }, valid],
  });
  const fetchImpl = async (url) =>
    String(url).endsWith("/supported")
      ? Response.json({
          kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
          extensions: [],
          signers: { "eip155:*": ["0x1234567890abcdef1234567890abcdef12345678"] },
        })
      : String(url).endsWith("/verify")
        ? Response.json({ isValid: false, invalidReason: "invalid_signature" })
        : new Response("{}", { status: 402, headers: { "payment-required": header } });

  const result = await scanTarget(
    {
      url: "https://paid.example/data",
      facilitator: { url: "https://facilitator.example", headers: {} },
    },
    // The active probe builds its payload from accepts[0], here null.
    { repeat: 1, active: true, authorized: true, authorizationRef: "TICKET-1", fetchImpl },
  );

  const coverage = check(result, "facilitator.requirement_coverage");
  assert.equal(coverage.status, "fail");
  assert.equal(
    coverage.message,
    "0 advertised payment choice(s) are absent from facilitator capabilities and 3 cannot be matched (not an object with a string network).",
  );
  assert.deepEqual(coverage.evidence.malformedIndexes, [0, 1, 2]);
  assert.equal(check(result, "facilitator.signer_coverage").status, "pass");
  assert.equal(check(result, "schema.payment_requirements").status, "fail");
  assert.equal(check(result, "security.invalid_signature_fail_closed").status, "pass");

  const notArray = encodeBase64Json({ x402Version: 2, resource: { url: "https://paid.example/data" }, accepts: "all" });
  const skipped = await scanTarget(
    { url: "https://paid.example/data", facilitator: { url: "https://facilitator.example", headers: {} } },
    {
      repeat: 1,
      fetchImpl: async (url) =>
        String(url).endsWith("/supported")
          ? fetchImpl(url)
          : new Response("{}", { status: 402, headers: { "payment-required": notArray } }),
    },
  );
  assert.equal(check(skipped, "facilitator.requirement_coverage"), undefined);
  assert.equal(check(skipped, "schema.payment_required").status, "fail");
});

test("a later sample that decodes to null is drift, never a crash", async () => {
  const headers = [
    encodeBase64Json({ x402Version: 2, resource: { url: "https://paid.example/data" }, accepts: [{}] }),
    Buffer.from("null").toString("base64"),
  ];
  let calls = 0;
  const result = await scanTarget(
    { url: "https://paid.example/data" },
    {
      repeat: 2,
      fetchImpl: async () =>
        new Response("{}", { status: 402, headers: { "payment-required": headers[calls++] } }),
    },
  );
  assert.equal(calls, 2);
  assert.equal(check(result, "stability.payment_requirements").status, "warn");
});

test("unsupported facilitator requirement is a high failure", async () => {
  const result = await scanTarget({
    name: "unsupported",
    url: `${baseUrl}/secure`,
    facilitator: { url: `${baseUrl}/facilitator-empty`, headers: {} },
  });

  assert.equal(
    check(result, "facilitator.requirement_coverage").status,
    "fail",
  );
  assert.equal(shouldFail(createReport([result]), "high"), true);
});

test("missing PAYMENT-REQUIRED is a high-severity failure", async () => {
  const result = await scanTarget({
    name: "missing",
    url: `${baseUrl}/missing-header`,
  });

  assert.equal(
    check(result, "transport.payment_required_header").status,
    "fail",
  );
  assert.equal(shouldFail(createReport([result]), "high"), true);
});

test("terms changing between identical requests produce a warning", async () => {
  const result = await scanTarget(
    { name: "drift", url: `${baseUrl}/drift` },
    { repeat: 2 },
  );

  assert.equal(check(result, "stability.payment_requirements").status, "warn");
});

test("authorized active probe is rejected by a secure endpoint", async () => {
  const result = await scanTarget(
    { name: "secure-active", url: `${baseUrl}/secure` },
    {
      active: true,
      authorized: true,
      authorizationRef: "DEMO-APPROVAL-001",
    },
  );

  assert.equal(result.mode, "active-authorized");
  assert.equal(
    check(result, "security.invalid_signature_fail_closed").status,
    "pass",
  );
});

test("authorized active probe detects payment bypass", async () => {
  const result = await scanTarget(
    { name: "bypass", url: `${baseUrl}/bypass` },
    {
      active: true,
      authorized: true,
      authorizationRef: "DEMO-APPROVAL-002",
    },
  );

  const bypass = check(result, "security.invalid_signature_fail_closed");
  assert.equal(bypass.status, "fail");
  assert.equal(bypass.severity, "critical");
  assert.equal(shouldFail(createReport([result]), "high"), true);
});

test("authorized probe confirms facilitator /verify rejects an invalid signature", async () => {
  const result = await scanTarget(
    {
      name: "secure-verify",
      url: `${baseUrl}/secure`,
      facilitator: { url: `${baseUrl}/facilitator`, headers: {} },
    },
    { active: true, authorized: true, authorizationRef: "DEMO-APPROVAL-003" },
  );

  assert.equal(
    check(result, "facilitator.verify_response_schema").status,
    "pass",
  );
  assert.equal(
    check(result, "security.facilitator_rejects_invalid_signature").status,
    "pass",
  );
});

test("facilitator that accepts an invalid signature is a critical failure", async () => {
  const result = await scanTarget(
    {
      name: "accept-verify",
      url: `${baseUrl}/secure`,
      facilitator: { url: `${baseUrl}/facilitator-accept`, headers: {} },
    },
    { active: true, authorized: true, authorizationRef: "DEMO-APPROVAL-004" },
  );

  const verify = check(result, "security.facilitator_rejects_invalid_signature");
  assert.equal(verify.status, "fail");
  assert.equal(verify.severity, "critical");
  assert.equal(shouldFail(createReport([result]), "high"), true);
});

test("verify probe flags a non-conformant /verify response as a schema failure", async () => {
  const { checks } = await probeFacilitatorVerify(
    { url: "https://facilitator.example", headers: {} },
    { x402Version: 2, paymentPayload: {}, paymentRequirements: {} },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    },
  );

  const schema = checks.find(
    (entry) => entry.id === "facilitator.verify_response_schema",
  );
  assert.equal(schema.status, "fail");
  assert.equal(
    checks.some(
      (entry) => entry.id === "security.facilitator_rejects_invalid_signature",
    ),
    false,
  );
});

test("verify probe degrades to a warning when /verify is unreachable", async () => {
  const { checks } = await probeFacilitatorVerify(
    { url: "https://facilitator.example", headers: {} },
    { x402Version: 2, paymentPayload: {}, paymentRequirements: {} },
    {
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    },
  );

  const reach = checks.find(
    (entry) => entry.id === "facilitator.verify_reachable",
  );
  assert.equal(reach.status, "warn");
});

test("active mode does not execute without authorization", async () => {
  const result = await scanTarget(
    { name: "unauthorized", url: `${baseUrl}/secure` },
    {
      active: true,
      authorized: false,
      authorizationRef: "NOT-AUTHORIZED",
    },
  );

  assert.equal(check(result, "safety.active_authorization").status, "fail");
  assert.equal(result.mode, "passive");
});

test("active mode requires a traceable authorization reference", async () => {
  const result = await scanTarget(
    { name: "missing-reference", url: `${baseUrl}/secure` },
    { active: true, authorized: true },
  );

  assert.equal(check(result, "safety.active_authorization").status, "fail");
  assert.equal(result.mode, "passive");
});

test("evidence digest detects report tampering", async () => {
  const result = await scanTarget({
    name: "integrity",
    url: `${baseUrl}/secure`,
  });
  const report = createReport([result]);
  assert.equal(verifyReportIntegrity(report).valid, true);

  report.targets[0].checks[0].message = "tampered";
  assert.equal(verifyReportIntegrity(report).valid, false);
});

test("new reports use stable JSON v2 and v1 reports still verify", () => {
  // Metadata keys whose v1 and v2 orders differ, so the digests differ.
  const report = createReport([], { B: 1, a: 2, _x: 3 });
  assert.equal(report.integrity.canonicalization, "settlens-stable-json-v2");
  assert.equal(verifyReportIntegrity(report).valid, true);

  const { integrity, ...unsigned } = report;
  const v1 = {
    ...unsigned,
    integrity: {
      algorithm: "sha256",
      canonicalization: "settlens-stable-json-v1",
      digest: sha256(stableStringify(unsigned, "settlens-stable-json-v1")),
    },
  };
  assert.notEqual(v1.integrity.digest, integrity.digest);
  assert.equal(verifyReportIntegrity(v1).valid, true);

  // The digest is checked with the recorded canonicalization, not the other one.
  const relabeled = {
    ...v1,
    integrity: { ...v1.integrity, canonicalization: "settlens-stable-json-v2" },
  };
  assert.equal(verifyReportIntegrity(relabeled).valid, false);
  const unknown = {
    ...v1,
    integrity: { ...v1.integrity, canonicalization: "settlens-stable-json-v9" },
  };
  assert.match(verifyReportIntegrity(unknown).reason, /supported Settlens integrity/);
});
