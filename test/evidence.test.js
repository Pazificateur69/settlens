import test from "node:test";
import assert from "node:assert/strict";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { createReport } from "../src/scanner.js";
import { stableStringify } from "../src/utils.js";
import {
  attestReport,
  generateEvidenceKeypair,
  verifyAttestation,
} from "../src/evidence.js";

test("an evidence attestation verifies with its own signature", () => {
  const report = createReport([]);
  const { privateKeyPem } = generateEvidenceKeypair();
  const attestation = attestReport(report, privateKeyPem, {
    attestedAt: "2026-07-31T00:00:00.000Z",
  });

  const result = verifyAttestation(attestation);
  assert.equal(result.signatureValid, true);
  assert.equal(result.valid, true);
  assert.equal(attestation.reportDigest, report.integrity.digest);
});

test("an attestation matches the report it was made from", () => {
  const report = createReport([]);
  const { privateKeyPem } = generateEvidenceKeypair();
  const attestation = attestReport(report, privateKeyPem);

  const result = verifyAttestation(attestation, report);
  assert.equal(result.reportMatches, true);
  assert.equal(result.valid, true);
});

test("a tampered attestation fails signature verification", () => {
  const report = createReport([]);
  const { privateKeyPem } = generateEvidenceKeypair();
  const attestation = attestReport(report, privateKeyPem);
  const tampered = { ...attestation, reportDigest: "0".repeat(64) };

  const result = verifyAttestation(tampered);
  assert.equal(result.signatureValid, false);
  assert.equal(result.valid, false);
});

test("an attestation does not match a different report", () => {
  const report = createReport([]);
  const other = createReport([]);
  const { privateKeyPem } = generateEvidenceKeypair();
  const attestation = attestReport(report, privateKeyPem);

  const result = verifyAttestation(attestation, other);
  assert.equal(result.reportMatches, false);
  assert.equal(result.valid, false);
});

test("attestations record stable JSON v2; legacy v1 attestations still verify", () => {
  const report = createReport([]);
  const { privateKeyPem } = generateEvidenceKeypair();
  const attestation = attestReport(report, privateKeyPem);
  assert.equal(attestation.canonicalization, "settlens-stable-json-v2");
  assert.equal(verifyAttestation(attestation, report).valid, true);

  // A pre-v2 attestation: no canonicalization field, signed over v1 JSON.
  const { signature, canonicalization, ...legacyPayload } = attestation;
  const legacy = {
    ...legacyPayload,
    signature: `0x${sign(
      null,
      Buffer.from(stableStringify(legacyPayload, "settlens-stable-json-v1")),
      createPrivateKey(privateKeyPem),
    ).toString("hex")}`,
  };
  assert.equal(verifyAttestation(legacy, report).valid, true);

  // The canonicalization is signed: changing it breaks the signature.
  const relabeled = { ...attestation, canonicalization: "settlens-stable-json-v1" };
  assert.equal(verifyAttestation(relabeled).signatureValid, false);
  const unknown = verifyAttestation({ ...attestation, canonicalization: "x" });
  assert.match(unknown.reasons.join(" "), /Unsupported canonicalization/);
});

test("an expected public key rejects an attestation signed by another key", () => {
  const report = createReport([]);
  const signer = generateEvidenceKeypair();
  const other = generateEvidenceKeypair();
  const attestation = attestReport(report, signer.privateKeyPem);
  const signerPem = createPublicKey(signer.privateKeyPem)
    .export({ type: "spki", format: "pem" })
    .toString();

  const byPem = verifyAttestation(attestation, report, { expectedPublicKey: signerPem });
  assert.equal(byPem.publicKeyMatches, true);
  assert.equal(byPem.valid, true);
  const byHex = verifyAttestation(attestation, undefined, {
    expectedPublicKey: `${signer.publicKey.toUpperCase().replace("0X", "0x")}\n`,
  });
  assert.equal(byHex.valid, true);
  assert.equal(verifyAttestation(attestation).publicKeyMatches, null);

  const wrong = verifyAttestation(attestation, report, {
    expectedPublicKey: other.publicKey,
  });
  assert.equal(wrong.signatureValid, true);
  assert.equal(wrong.publicKeyMatches, false);
  assert.equal(wrong.valid, false);
  assert.match(wrong.reasons.join(" "), /not by the expected key/);

  assert.throws(
    () => verifyAttestation(attestation, report, { expectedPublicKey: "0x1234" }),
    /32 bytes/,
  );
  const x25519Pem = generateKeyPairSync("x25519")
    .publicKey.export({ type: "spki", format: "pem" })
    .toString();
  assert.throws(
    () => verifyAttestation(attestation, report, { expectedPublicKey: x25519Pem }),
    /must be an ed25519 key/,
  );
});
