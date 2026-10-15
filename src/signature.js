/* Real cryptographic verification for x402 payment authorizations.
 *
 * EVM `exact` scheme: independently verifies the EIP-3009
 * TransferWithAuthorization signature (EIP-712) and checks that the authorized
 * transfer is bound to the advertised recipient, amount and time window. The
 * EIP-712 domain is reconstructed offline from the payment requirement itself
 * (extra.name / extra.version, chainId from the eip155 network, verifyingContract
 * from the asset), so no RPC, wallet or private key is ever needed.
 *
 * Solana: verifies every present ed25519 signature of a (possibly partially
 * signed) transaction against its signer key, using node:crypto only. Optional
 * reviewed requirements enable bounded offline instruction inspection; this
 * cannot prove an executed payment outcome.
 *
 * This module only READS signatures. It never signs, settles or moves funds.
 */
import { createPublicKey, verify as nodeVerify } from "node:crypto";
import { inspectSolanaPayment } from "./solana-payment.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const DOMAIN_TYPEHASH = keccak_256(
  utf8(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
  ),
);
const TRANSFER_TYPEHASH = keccak_256(
  utf8(
    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
  ),
);
// SPKI DER prefix for a raw 32-byte ed25519 public key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function utf8(value) {
  return new TextEncoder().encode(value);
}

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

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

function uint256(value) {
  let n = BigInt(value);
  if (n < 0n) {
    throw new Error("uint256 cannot be negative.");
  }
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n !== 0n) {
    throw new Error("uint256 value overflows 32 bytes.");
  }
  return out;
}

function addressWord(value) {
  const bytes = hexToBytes(value);
  if (bytes.length !== 20) {
    throw new Error("Address must be 20 bytes.");
  }
  const out = new Uint8Array(32);
  out.set(bytes, 12);
  return out;
}

function bytes32(value) {
  const bytes = hexToBytes(value);
  if (bytes.length !== 32) {
    throw new Error("Value must be exactly 32 bytes.");
  }
  return bytes;
}

function toEvmAddress(uncompressedPublicKey) {
  const digest = keccak_256(uncompressedPublicKey.slice(1));
  return `0x${Buffer.from(digest).toString("hex").slice(-40)}`;
}

export function domainSeparator({ name, version, chainId, verifyingContract }) {
  return keccak_256(
    concatBytes(
      DOMAIN_TYPEHASH,
      keccak_256(utf8(String(name))),
      keccak_256(utf8(String(version))),
      uint256(chainId),
      addressWord(verifyingContract),
    ),
  );
}

export function transferWithAuthorizationHash(authorization) {
  return keccak_256(
    concatBytes(
      TRANSFER_TYPEHASH,
      addressWord(authorization.from),
      addressWord(authorization.to),
      uint256(authorization.value),
      uint256(authorization.validAfter),
      uint256(authorization.validBefore),
      bytes32(authorization.nonce),
    ),
  );
}

// EIP-712 digest: keccak256(0x1901 || domainSeparator || hashStruct(message)).
export function eip3009Digest(domain, authorization) {
  return keccak_256(
    concatBytes(
      Uint8Array.from([0x19, 0x01]),
      domainSeparator(domain),
      transferWithAuthorizationHash(authorization),
    ),
  );
}

// Recovers the Ethereum signer address from a 32-byte digest and a 65-byte
// r||s||v signature. Throws on a malformed signature.
export function recoverEvmSigner(digest, signatureHex) {
  const bytes = hexToBytes(signatureHex);
  if (bytes.length !== 65) {
    throw new Error("EVM signature must be 65 bytes (r || s || v).");
  }
  const compact = bytes.slice(0, 64);
  const v = bytes[64];
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) {
    throw new Error("Signature recovery byte must be 0, 1, 27 or 28.");
  }
  const signature = secp256k1.Signature.fromBytes(compact, "compact").addRecoveryBit(
    recovery,
  );
  // USDC (FiatToken ECRecover) and OpenZeppelin ECDSA revert on high-s (EIP-2).
  if (signature.hasHighS()) {
    throw new Error("EVM signature s value is not canonical (high-s, EIP-2).");
  }
  const publicKey = signature.recoverPublicKey(digest).toBytes(false);
  return toEvmAddress(publicKey);
}

function addressesEqual(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

// Independently verifies an x402 `exact` EVM payment authorization against the
// advertised payment requirement. Returns a structured, deterministic result.
export function verifyExactEvmPayment({ requirement, payload, now }) {
  const reasons = [];
  const currentTime = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  const authorization = payload?.authorization;
  const signature = payload?.signature;

  if (!authorization || typeof signature !== "string") {
    return {
      scheme: "exact",
      verified: false,
      signatureValid: false,
      recovered: null,
      reasons: ["payload.authorization and payload.signature are required."],
    };
  }

  const network = String(requirement.network ?? "");
  const chainMatch = /^eip155:(\d+)$/.exec(network);
  const extra = requirement.extra ?? {};
  if (!chainMatch) {
    reasons.push("requirement.network is not an eip155 chain.");
  }
  if (!extra.name || !extra.version) {
    reasons.push(
      "requirement.extra.name/version are required to rebuild the EIP-712 domain.",
    );
  }

  let recovered = null;
  let signatureValid = false;
  if (chainMatch && extra.name && extra.version) {
    try {
      const digest = eip3009Digest(
        {
          name: extra.name,
          version: extra.version,
          chainId: Number(chainMatch[1]),
          verifyingContract: requirement.asset,
        },
        authorization,
      );
      recovered = recoverEvmSigner(digest, signature);
      signatureValid = addressesEqual(recovered, authorization.from);
      if (!signatureValid) {
        reasons.push(
          `Recovered signer ${recovered} does not match authorization.from ${authorization.from}.`,
        );
      }
    } catch (error) {
      reasons.push(`Signature verification failed: ${error.message}`);
    }
  }

  const recipientBound = addressesEqual(authorization.to, requirement.payTo);
  if (!recipientBound) {
    reasons.push("authorization.to does not match requirement.payTo.");
  }
  const amountBound = String(authorization.value) === String(requirement.amount);
  if (!amountBound) {
    reasons.push("authorization.value does not match requirement.amount.");
  }
  const validAfter = Number(authorization.validAfter);
  const validBefore = Number(authorization.validBefore);
  // Strict on both ends, as the EIP-3009 reference implementation:
  // require(now > validAfter) and require(now < validBefore).
  const fresh =
    Number.isFinite(validAfter) &&
    Number.isFinite(validBefore) &&
    validAfter < currentTime &&
    currentTime < validBefore;
  if (!fresh) {
    reasons.push(
      "authorization is outside its validAfter/validBefore window (EIP-3009 requires validAfter < now < validBefore).",
    );
  }

  return {
    scheme: "exact",
    recovered,
    signatureValid,
    recipientBound,
    amountBound,
    fresh,
    verified: signatureValid && recipientBound && amountBound && fresh,
    reasons,
  };
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Bitcoin/Solana base58 encoding of a byte array.
export function base58Encode(bytes) {
  const digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte === 0) {
      out += "1";
    } else {
      break;
    }
  }
  for (let k = digits.length - 1; k >= 0; k -= 1) {
    out += BASE58_ALPHABET[digits[k]];
  }
  return out;
}

const SOLANA_MAX_TRANSACTION_BYTES = 1232; // PACKET_DATA_SIZE: 1280-byte IPv6 MTU minus 48 bytes of headers

// Solana compact-u16 (shortvec) length decoder.
function decodeShortvec(bytes, offset) {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  for (;;) {
    const byte = bytes[offset + bytesRead];
    if (byte === undefined) {
      throw new Error("Truncated shortvec length.");
    }
    value |= (byte & 0x7f) << shift;
    bytesRead += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
    if (shift > 21) {
      throw new Error("shortvec length is out of range.");
    }
  }
  return { value: value >>> 0, bytesRead };
}

// Verifies the signatures of a base64-encoded Solana transaction (legacy or
// versioned). The signed message is every byte after the signature array, and
// signature slot i belongs to static account key i (the first
// numRequiredSignatures keys; the fee payer is key 0). An x402 `exact` SVM
// payload is partially signed: the client signs its slots and the facilitator
// adds the fee-payer signature at settlement, so an all-zero slot is reported
// as pending, not as invalid. Address-table lookups are not resolved because
// signers are always static keys.
export function verifySolanaTransaction(base64Transaction, requirement, policy = {}) {
  const bytes = Uint8Array.from(Buffer.from(String(base64Transaction), "base64"));
  // Solana's packet size bounds a transaction (and so its signer count, about 12) and the work per call.
  if (bytes.length > SOLANA_MAX_TRANSACTION_BYTES) {
    throw new Error(`A Solana transaction is at most ${SOLANA_MAX_TRANSACTION_BYTES} bytes (got ${bytes.length}).`);
  }
  let offset = 0;
  const signatureCountInfo = decodeShortvec(bytes, offset);
  offset += signatureCountInfo.bytesRead;
  const signatureCount = signatureCountInfo.value;
  if (signatureCount < 1) {
    const result = {
      scheme: "exact-solana",
      verified: false,
      signatureValid: false,
      feePayer: null,
      reasons: ["The transaction carries no signatures."],
    };
    if (requirement !== undefined) result.payment = inspectSolanaPayment(bytes.slice(offset), result, requirement, policy, base58Encode);
    return result;
  }

  const signatures = bytes.slice(offset, offset + signatureCount * 64);
  if (signatures.length !== signatureCount * 64) {
    throw new Error("Truncated signature array.");
  }
  const message = bytes.slice(offset + signatureCount * 64);

  let cursor = 0;
  let version = "legacy";
  if (message[0] !== undefined && (message[0] & 0x80) !== 0) {
    version = `v${message[0] & 0x7f}`;
    cursor += 1;
  }
  const requiredSignatures = message[cursor];
  cursor += 3; // message header
  const accountKeys = decodeShortvec(message, cursor);
  cursor += accountKeys.bytesRead;
  if (accountKeys.value < signatureCount) {
    throw new Error("The transaction message has fewer account keys than signatures.");
  }
  if (message.length < cursor + signatureCount * 32) {
    throw new Error("Truncated signer public keys.");
  }

  const reasons = [];
  if (requiredSignatures !== signatureCount) {
    reasons.push(
      `The message requires ${requiredSignatures} signature(s) but the transaction carries ${signatureCount} slot(s).`,
    );
  }
  const signers = [];
  for (let index = 0; index < signatureCount; index += 1) {
    const publicKey = message.slice(cursor + index * 32, cursor + (index + 1) * 32);
    const signature = signatures.slice(index * 64, (index + 1) * 64);
    const signer = base58Encode(publicKey);
    if (signature.every((byte) => byte === 0)) {
      signers.push({ publicKey: signer, status: "pending" });
      continue;
    }
    let valid = false;
    try {
      valid = verifyEd25519({ publicKey, message, signature });
      if (!valid) {
        reasons.push(`Signature ${index} (${signer}) is invalid for the message.`);
      }
    } catch (error) {
      reasons.push(`Signature ${index} (${signer}) could not be checked: ${error.message}`);
    }
    signers.push({ publicKey: signer, status: valid ? "valid" : "invalid" });
  }

  const present = signers.filter(({ status }) => status !== "pending");
  if (present.length === 0) {
    reasons.push("Every signature slot is empty: nothing was signed.");
  }
  const signatureValid =
    present.length > 0 && present.every(({ status }) => status === "valid");

  const result = {
    scheme: "exact-solana",
    version,
    signatureCount,
    feePayer: signers[0].publicKey,
    feePayerPending: signers[0].status === "pending",
    signers,
    pendingSigners: signers
      .filter(({ status }) => status === "pending")
      .map(({ publicKey }) => publicKey),
    signatureValid,
    verified: signatureValid && requiredSignatures === signatureCount,
    reasons,
  };
  if (requirement !== undefined) result.payment = inspectSolanaPayment(message, result, requirement, policy, base58Encode);
  return result;
}

// Verifies a raw ed25519 signature (Solana signers) using node:crypto only.
export function verifyEd25519({ publicKey, message, signature }) {
  const key = publicKey instanceof Uint8Array ? publicKey : hexToBytes(publicKey);
  if (key.length !== 32) {
    throw new Error("ed25519 public key must be 32 bytes.");
  }
  const sig = signature instanceof Uint8Array ? signature : hexToBytes(signature);
  if (sig.length !== 64) {
    throw new Error("ed25519 signature must be 64 bytes.");
  }
  const keyObject = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(key)]),
    format: "der",
    type: "spki",
  });
  const msg = message instanceof Uint8Array ? message : Buffer.from(message);
  return nodeVerify(null, Buffer.from(msg), keyObject, Buffer.from(sig));
}
