import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  base58Encode,
  eip3009Digest,
  recoverEvmSigner,
  verifyEd25519,
  verifyExactEvmPayment,
  verifySolanaTransaction,
} from "../src/signature.js";

const NOW = 1_800_000_000;
const ASSET = `0x${"ab".repeat(20)}`;
const PAY_TO = `0x${"cd".repeat(20)}`;
const DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: 84532,
  verifyingContract: ASSET,
};

function evmAddress(privateKey) {
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  return `0x${Buffer.from(keccak_256(publicKey.slice(1))).toString("hex").slice(-40)}`;
}

// Test-only EIP-712 signer: produces an Ethereum r||s||v signature over a digest.
function ethSign(digest, privateKey) {
  const compact = secp256k1.sign(digest, privateKey, { prehash: false });
  const signer = evmAddress(privateKey).toLowerCase();
  for (const recovery of [0, 1]) {
    const signature = secp256k1.Signature.fromBytes(compact, "compact").addRecoveryBit(
      recovery,
    );
    const address = `0x${Buffer.from(
      keccak_256(signature.recoverPublicKey(digest).toBytes(false).slice(1)),
    )
      .toString("hex")
      .slice(-40)}`;
    if (address.toLowerCase() === signer) {
      return `0x${Buffer.from(compact).toString("hex")}${(27 + recovery)
        .toString(16)
        .padStart(2, "0")}`;
    }
  }
  throw new Error("recovery bit not found");
}

const PRIVATE_KEY = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const FROM = evmAddress(PRIVATE_KEY);

function validPayment() {
  const authorization = {
    from: FROM,
    to: PAY_TO,
    value: "10000",
    validAfter: String(NOW - 60),
    validBefore: String(NOW + 300),
    nonce: `0x${"22".repeat(32)}`,
  };
  const digest = eip3009Digest(DOMAIN, authorization);
  const signature = ethSign(digest, PRIVATE_KEY);
  const requirement = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "10000",
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  };
  return { authorization, signature, requirement };
}

test("recoverEvmSigner rejects a malformed signature", () => {
  assert.throws(() => recoverEvmSigner(new Uint8Array(32), "0x1234"));
});

test("a genuine EIP-3009 authorization verifies end to end", () => {
  const { authorization, signature, requirement } = validPayment();
  const result = verifyExactEvmPayment({
    requirement,
    payload: { signature, authorization },
    now: NOW,
  });

  assert.equal(result.signatureValid, true);
  assert.equal(result.recovered.toLowerCase(), FROM.toLowerCase());
  assert.equal(result.recipientBound, true);
  assert.equal(result.amountBound, true);
  assert.equal(result.fresh, true);
  assert.equal(result.verified, true);
  assert.deepEqual(result.reasons, []);
});

test("a malleated high-s signature is not accepted (token contracts revert on it)", () => {
  const { authorization, signature, requirement } = validPayment();
  const n = secp256k1.Point.CURVE().n;
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = Number.parseInt(signature.slice(130), 16);
  const malleated = `${signature.slice(0, 66)}${(n - s).toString(16).padStart(64, "0")}${(55 - v).toString(16)}`; // 27 <-> 28
  const result = verifyExactEvmPayment({
    requirement,
    payload: { signature: malleated, authorization },
    now: NOW,
  });

  assert.equal(result.signatureValid, false);
  assert.equal(result.verified, false);
  assert.match(result.reasons.join(" "), /high-s/);
});

test("a tampered authorization amount breaks the signature", () => {
  const { authorization, signature, requirement } = validPayment();
  const result = verifyExactEvmPayment({
    requirement,
    payload: { signature, authorization: { ...authorization, value: "999999" } },
    now: NOW,
  });

  assert.equal(result.signatureValid, false);
  assert.equal(result.verified, false);
});

test("a price mismatch with the requirement is flagged", () => {
  const { authorization, signature, requirement } = validPayment();
  const result = verifyExactEvmPayment({
    requirement: { ...requirement, amount: "50000" },
    payload: { signature, authorization },
    now: NOW,
  });

  assert.equal(result.signatureValid, true);
  assert.equal(result.amountBound, false);
  assert.equal(result.verified, false);
});

test("an expired authorization window is not fresh", () => {
  const { authorization, signature, requirement } = validPayment();
  const result = verifyExactEvmPayment({
    requirement,
    payload: { signature, authorization },
    now: NOW + 100_000,
  });

  assert.equal(result.fresh, false);
  assert.equal(result.verified, false);
});

test("a missing domain in the requirement is reported, not thrown", () => {
  const { authorization, signature, requirement } = validPayment();
  const result = verifyExactEvmPayment({
    requirement: { ...requirement, extra: {} },
    payload: { signature, authorization },
    now: NOW,
  });

  assert.equal(result.signatureValid, false);
  assert.equal(result.verified, false);
  assert.ok(result.reasons.some((reason) => reason.includes("EIP-712 domain")));
});

test("a missing payload returns an unverified result", () => {
  const result = verifyExactEvmPayment({
    requirement: validPayment().requirement,
    payload: {},
    now: NOW,
  });

  assert.equal(result.verified, false);
  assert.equal(result.recovered, null);
});

test("base58 encodes 32 zero bytes to the System Program address", () => {
  assert.equal(base58Encode(new Uint8Array(32)), "1".repeat(32));
});

function buildLegacySolanaTransaction(privateKey, rawPublicKey) {
  const header = Buffer.from([1, 0, 0]);
  const accountKeys = Buffer.concat([Buffer.from([1]), Buffer.from(rawPublicKey)]);
  const blockhash = Buffer.alloc(32, 7);
  const instructions = Buffer.from([0]);
  const message = Buffer.concat([header, accountKeys, blockhash, instructions]);
  const signature = nodeSign(null, message, privateKey);
  const tx = Buffer.concat([Buffer.from([1]), signature, message]);
  return tx.toString("base64");
}

test("a genuine Solana transaction verifies its fee-payer signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const base64Tx = buildLegacySolanaTransaction(privateKey, rawPublicKey);

  const result = verifySolanaTransaction(base64Tx);
  assert.equal(result.verified, true);
  assert.equal(result.signatureValid, true);
  assert.equal(result.feePayer, base58Encode(rawPublicKey));
  assert.equal(result.signatureCount, 1);
});

test("a tampered Solana transaction fails fee-payer verification", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const bytes = Buffer.from(
    buildLegacySolanaTransaction(privateKey, rawPublicKey),
    "base64",
  );
  bytes[bytes.length - 1] ^= 0xff; // corrupt the message tail

  const result = verifySolanaTransaction(bytes.toString("base64"));
  assert.equal(result.verified, false);
  assert.equal(result.signatureValid, false);
});

test("ed25519 signatures verify and reject tampering", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const message = Buffer.from("settlens solana authorization");
  const signature = nodeSign(null, message, privateKey);

  assert.equal(
    verifyEd25519({ publicKey: rawPublicKey, message, signature }),
    true,
  );

  const tampered = Buffer.from(message);
  tampered[0] ^= 0xff;
  assert.equal(
    verifyEd25519({ publicKey: rawPublicKey, message: tampered, signature }),
    false,
  );
});

test("the EIP-3009 window is strict on both ends (validAfter < now < validBefore)", () => {
  const { authorization, signature, requirement } = validPayment();
  const at = (now) =>
    verifyExactEvmPayment({ requirement, payload: { signature, authorization }, now });

  assert.equal(at(NOW - 60).fresh, false); // now == validAfter
  assert.equal(at(NOW - 59).fresh, true);
  assert.equal(at(NOW + 299).fresh, true);
  assert.equal(at(NOW + 300).fresh, false); // now == validBefore
  assert.match(at(NOW + 300).reasons.join(" "), /validAfter < now < validBefore/);
});

function solanaKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    raw: publicKey.export({ type: "spki", format: "der" }).subarray(-32),
  };
}

// Serializes a Solana transaction whose signer slot i belongs to keys[i]. A
// signer listed in `unsigned` keeps an all-zero (pending) slot.
function buildSolanaTransaction(keys, options = {}) {
  const header = Buffer.from([options.required ?? keys.length, 0, 0]);
  const message = Buffer.concat([
    options.versioned ? Buffer.from([0x80]) : Buffer.alloc(0),
    header,
    Buffer.from([keys.length]),
    ...keys.map(({ raw }) => raw),
    Buffer.alloc(32, 7), // recent blockhash
    Buffer.from([0]), // no instructions
    options.versioned ? Buffer.from([0]) : Buffer.alloc(0), // no lookup tables
  ]);
  const signatures = keys.map((key) =>
    (options.unsigned ?? []).includes(key)
      ? Buffer.alloc(64)
      : nodeSign(null, message, key.privateKey),
  );
  return Buffer.concat([Buffer.from([keys.length]), ...signatures, message]);
}

test("a partially signed x402 SVM payload verifies with the fee payer pending", () => {
  const feePayer = solanaKeypair();
  const client = solanaKeypair();
  const tx = buildSolanaTransaction([feePayer, client], {
    versioned: true,
    unsigned: [feePayer],
  });

  const result = verifySolanaTransaction(tx.toString("base64"));
  assert.equal(result.version, "v0");
  assert.equal(result.verified, true);
  assert.equal(result.signatureValid, true);
  assert.equal(result.feePayer, base58Encode(feePayer.raw));
  assert.equal(result.feePayerPending, true);
  assert.deepEqual(result.pendingSigners, [base58Encode(feePayer.raw)]);
  assert.deepEqual(
    result.signers.map(({ status }) => status),
    ["pending", "valid"],
  );
});

test("every Solana signer slot is verified, not only the fee payer", () => {
  const feePayer = solanaKeypair();
  const client = solanaKeypair();
  const full = buildSolanaTransaction([feePayer, client]);
  const ok = verifySolanaTransaction(full.toString("base64"));
  assert.equal(ok.verified, true);
  assert.equal(ok.feePayerPending, false);
  assert.deepEqual(ok.pendingSigners, []);

  // Corrupt the client's signature (slot 1): the fee payer alone is not enough.
  const forged = Buffer.from(full);
  forged[1 + 64 + 5] ^= 0xff;
  const bad = verifySolanaTransaction(forged.toString("base64"));
  assert.equal(bad.verified, false);
  assert.equal(bad.signatureValid, false);
  assert.deepEqual(bad.signers.map(({ status }) => status), ["valid", "invalid"]);
  assert.match(bad.reasons.join(" "), /Signature 1 .* is invalid/);

  const empty = verifySolanaTransaction(
    buildSolanaTransaction([feePayer, client], { unsigned: [feePayer, client] }).toString(
      "base64",
    ),
  );
  assert.equal(empty.verified, false);
  assert.deepEqual(empty.pendingSigners.length, 2);
  assert.match(empty.reasons.join(" "), /nothing was signed/);
});

test("a Solana signature count that disagrees with the message header is rejected", () => {
  const feePayer = solanaKeypair();
  const extra = solanaKeypair();
  const tx = buildSolanaTransaction([feePayer, extra], { required: 1 });
  const result = verifySolanaTransaction(tx.toString("base64"));
  assert.equal(result.signatureValid, true);
  assert.equal(result.verified, false);
  assert.match(result.reasons.join(" "), /requires 1 signature/);

  // Two signature slots but a single account key cannot be parsed.
  const short = Buffer.concat([Buffer.from([2]), Buffer.alloc(128), Buffer.from([1, 0, 0, 1]), feePayer.raw]);
  assert.throws(() => verifySolanaTransaction(short.toString("base64")), /fewer account keys/);
  assert.throws(
    () => verifySolanaTransaction(Buffer.from([2, 1, 2]).toString("base64")),
    /Truncated signature array/,
  );
  const cut = buildSolanaTransaction([feePayer]).subarray(0, 1 + 64 + 4 + 10);
  assert.throws(() => verifySolanaTransaction(cut.toString("base64")), /Truncated signer public keys/);
  // Larger than a Solana packet: refused before any signature is checked.
  const oversized = Buffer.concat([buildSolanaTransaction([feePayer]), Buffer.alloc(1200)]);
  assert.throws(() => verifySolanaTransaction(oversized.toString("base64")), /at most 1232 bytes/);
});
