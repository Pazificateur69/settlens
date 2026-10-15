/* Settlens Evidence — shareable, independently verifiable attestations.
 *
 * A scan report already carries a deterministic SHA-256 integrity digest. An
 * evidence attestation binds that digest to an ed25519 signing identity and a
 * timestamp, producing a compact object a customer, partner or auditor can
 * verify offline with nothing but the attestation (and, optionally, the report).
 * Signing uses node:crypto only; no key custody, HSM or network is required.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { CANONICALIZATION, stableStringify } from "./utils.js";
import { verifyReportIntegrity } from "./scanner.js";
import { verifyEd25519 } from "./signature.js";

function hexToBytes(value) {
  if (typeof value !== "string") {
    throw new Error("Expected a hex string.");
  }
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("Value is not valid hexadecimal.");
  }
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

function rawPublicKey(privateKey) {
  const der = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  return `0x${Buffer.from(der.subarray(-32)).toString("hex")}`;
}

// Normalizes an expected signer key, given as an ed25519 PEM key or as the
// 0x-prefixed hex form printed by keygen and stored in attestations.
export function normalizeEvidencePublicKey(value) {
  const text = String(value ?? "").trim();
  if (text.includes("-----BEGIN")) {
    const key = createPublicKey(text);
    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error("The expected public key must be an ed25519 key.");
    }
    const der = key.export({ type: "spki", format: "der" });
    return `0x${Buffer.from(der.subarray(-32)).toString("hex")}`;
  }
  const bytes = hexToBytes(text);
  if (bytes.length !== 32) {
    throw new Error("The expected public key must be 32 bytes of hex or an ed25519 PEM key.");
  }
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export function generateEvidenceKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: `0x${Buffer.from(
      publicKey.export({ type: "spki", format: "der" }).subarray(-32),
    ).toString("hex")}`,
  };
}

// Produces a signed attestation binding a report's integrity digest to an
// ed25519 public key and a timestamp.
export function attestReport(report, privateKeyPem, options = {}) {
  const privateKey = createPrivateKey(privateKeyPem);
  const payload = {
    kind: "settlens-evidence-attestation",
    version: 1,
    canonicalization: CANONICALIZATION,
    reportId: report?.reportId ?? null,
    productVersion: report?.productVersion ?? null,
    protocolVersion: report?.protocolVersion ?? null,
    subjects: Array.isArray(report?.targets)
      ? report.targets.map((entry) => entry.target?.url ?? entry.name ?? null)
      : [],
    summary: report?.summary ?? null,
    reportDigest: report?.integrity?.digest ?? null,
    attestedAt: options.attestedAt ?? new Date().toISOString(),
    publicKey: rawPublicKey(privateKey),
  };
  const message = Buffer.from(stableStringify(payload, CANONICALIZATION), "utf8");
  const signature = `0x${Buffer.from(sign(null, message, privateKey)).toString("hex")}`;
  return { ...payload, signature };
}

// Verifies an attestation's ed25519 signature and, when a report is supplied,
// that the report is intact and its digest matches the attestation. With
// options.expectedPublicKey, an attestation signed by any other key is invalid:
// the embedded publicKey alone only proves the signer holds *some* key.
export function verifyAttestation(attestation, report, options = {}) {
  const { signature, ...payload } = attestation ?? {};
  const reasons = [];

  let signatureValid = false;
  try {
    signatureValid = verifyEd25519({
      publicKey: hexToBytes(payload.publicKey),
      // Attestations made before canonicalization was recorded used v1.
      message: Buffer.from(
        stableStringify(payload, payload.canonicalization ?? "settlens-stable-json-v1"),
        "utf8",
      ),
      signature: hexToBytes(signature),
    });
  } catch (error) {
    reasons.push(`Signature check failed: ${error.message}`);
  }
  if (!signatureValid && reasons.length === 0) {
    reasons.push("The attestation signature is invalid.");
  }

  let reportMatches = null;
  if (report !== undefined && report !== null) {
    const integrity = verifyReportIntegrity(report);
    if (!integrity.valid) {
      reasons.push("The provided report failed its own integrity check.");
      reportMatches = false;
    } else {
      reportMatches = report.integrity?.digest === payload.reportDigest;
      if (!reportMatches) {
        reasons.push("The attestation does not match the provided report digest.");
      }
    }
  }

  let publicKeyMatches = null;
  if (options.expectedPublicKey !== undefined && options.expectedPublicKey !== null) {
    const expected = normalizeEvidencePublicKey(options.expectedPublicKey);
    publicKeyMatches =
      typeof payload.publicKey === "string" &&
      payload.publicKey.toLowerCase() === expected;
    if (!publicKeyMatches) {
      reasons.push(
        `The attestation is signed by ${payload.publicKey}, not by the expected key ${expected}.`,
      );
    }
  }

  return {
    signatureValid,
    reportMatches,
    publicKeyMatches,
    publicKey: payload.publicKey ?? null,
    attestedAt: payload.attestedAt ?? null,
    valid:
      signatureValid &&
      reportMatches !== false &&
      publicKeyMatches !== false,
    reasons,
  };
}
