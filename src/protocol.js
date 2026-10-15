import {
  MAX_HEADER_LENGTH,
  PROTOCOL_VERSION,
} from "./constants.js";
import { isPlainObject } from "./utils.js";
import { parsePaymentRequired } from "@x402/core/schemas";

const CAIP2_PATTERN = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;
const POSITIVE_INTEGER_PATTERN = /^[0-9]+$/;
const EVM_NETWORK_PATTERN = /^eip155:[0-9]+$/;
export const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeBase64Json(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Header value is empty.");
  }
  if (value.length > MAX_HEADER_LENGTH) {
    throw new Error(`Header exceeds ${MAX_HEADER_LENGTH} characters.`);
  }
  if (!/^[A-Za-z0-9+/_=-]+$/.test(value)) {
    throw new Error("Header contains characters outside Base64/Base64URL.");
  }

  let decoded;
  try {
    decoded = Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new Error("Header is not valid Base64.");
  }

  if (!decoded) {
    throw new Error("Decoded header is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Decoded header is not valid JSON.");
  }
  return assertJsonDepth(parsed);
}

const MAX_JSON_DEPTH = 64;

// Iterative on purpose: server JSON can nest deeper than the call stack, which
// would make the recursive helpers downstream (stableStringify, JSON.stringify)
// throw instead of reporting a finding.
export function assertJsonDepth(value, limit = MAX_JSON_DEPTH) {
  const stack = [[value, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop();
    if (node === null || typeof node !== "object") {
      continue;
    }
    if (depth >= limit) {
      throw new Error(`JSON nesting exceeds ${limit} levels.`);
    }
    for (const child of Object.values(node)) {
      stack.push([child, depth + 1]);
    }
  }
  return value;
}

export function isCaip2(value) {
  return typeof value === "string" && CAIP2_PATTERN.test(value);
}

export function isPositiveAtomicAmount(value) {
  if (typeof value !== "string" || !POSITIVE_INTEGER_PATTERN.test(value)) {
    return false;
  }
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

export function validatePaymentRequiredShape(value) {
  const problems = [];

  if (!isPlainObject(value)) {
    return ["PaymentRequired must be a JSON object."];
  }

  if (value.x402Version !== PROTOCOL_VERSION) {
    problems.push(`x402Version must equal ${PROTOCOL_VERSION}.`);
  }

  if (!isPlainObject(value.resource)) {
    problems.push("resource must be an object.");
  } else {
    if (typeof value.resource.url !== "string") {
      problems.push("resource.url must be a string.");
    } else {
      try {
        const resourceUrl = new URL(value.resource.url);
        if (!["http:", "https:"].includes(resourceUrl.protocol)) {
          problems.push("resource.url must use http or https.");
        }
      } catch {
        problems.push("resource.url must be an absolute URL.");
      }
    }
  }

  if (!Array.isArray(value.accepts) || value.accepts.length === 0) {
    problems.push("accepts must be a non-empty array.");
  }

  return problems;
}

export function validateWithOfficialSdk(value) {
  const result = parsePaymentRequired(value);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => ({
    path: issue.path.join(".") || "$",
    code: issue.code,
    message: issue.message,
  }));
}

export function validateRequirement(requirement, index) {
  const prefix = `accepts[${index}]`;
  const problems = [];

  if (!isPlainObject(requirement)) {
    return [`${prefix} must be an object.`];
  }

  if (typeof requirement.scheme !== "string" || requirement.scheme.length === 0) {
    problems.push(`${prefix}.scheme must be a non-empty string.`);
  }
  if (!isCaip2(requirement.network)) {
    problems.push(`${prefix}.network must be a CAIP-2 identifier.`);
  }
  if (!isPositiveAtomicAmount(requirement.amount)) {
    problems.push(`${prefix}.amount must be a positive integer string.`);
  }
  if (typeof requirement.asset !== "string" || requirement.asset.length === 0) {
    problems.push(`${prefix}.asset must be a non-empty string.`);
  }
  if (typeof requirement.payTo !== "string" || requirement.payTo.length === 0) {
    problems.push(`${prefix}.payTo must be a non-empty string.`);
  }
  if (
    typeof requirement.maxTimeoutSeconds !== "number" ||
    !Number.isFinite(requirement.maxTimeoutSeconds) ||
    requirement.maxTimeoutSeconds <= 0
  ) {
    problems.push(`${prefix}.maxTimeoutSeconds must be a positive number.`);
  }

  if (
    EVM_NETWORK_PATTERN.test(requirement.network ?? "") &&
    !EVM_ADDRESS_PATTERN.test(requirement.payTo ?? "")
  ) {
    problems.push(`${prefix}.payTo must be a 20-byte EVM address.`);
  }

  return problems;
}

export function buildInvalidPaymentPayload(paymentRequired) {
  const accepted = paymentRequired.accepts[0];
  const now = Math.floor(Date.now() / 1000);
  let payload;

  if (EVM_NETWORK_PATTERN.test(accepted?.network)) {
    payload = {
      signature: `0x${"00".repeat(65)}`,
      authorization: {
        from: `0x${"00".repeat(20)}`,
        to: EVM_ADDRESS_PATTERN.test(accepted.payTo)
          ? accepted.payTo
          : `0x${"00".repeat(20)}`,
        value: accepted.amount,
        validAfter: String(now - 60),
        validBefore: String(now + Math.max(60, accepted.maxTimeoutSeconds ?? 60)),
        nonce: `0x${"00".repeat(32)}`,
      },
    };
  } else if (String(accepted?.network).startsWith("solana:")) {
    payload = {
      transaction: Buffer.alloc(64).toString("base64"),
    };
  } else {
    payload = {
      probe: "settlens-intentionally-invalid-authorization",
    };
  }

  return {
    x402Version: PROTOCOL_VERSION,
    resource: paymentRequired.resource,
    accepted,
    payload,
    ...(paymentRequired.extensions
      ? { extensions: paymentRequired.extensions }
      : {}),
  };
}
