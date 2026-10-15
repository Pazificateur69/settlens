import { createHash, randomUUID } from "node:crypto";
import {
  EPHEMERAL_REQUIREMENT_KEYS,
  MAX_RESPONSE_BODY_BYTES,
  SENSITIVE_QUERY_KEYS,
} from "./constants.js";

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function sanitizeUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl, baseUrl);
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[unparseable URL]";
  }
}

export function headerNames(headers = {}) {
  return Object.keys(headers).map((name) => name.toLowerCase()).sort();
}

// Object key orderings, by canonicalization name. The name is recorded in each
// report integrity block and attestation, so verification uses the same one.
const KEY_ORDERS = {
  // v1 sorted with the machine's default locale; pinned to "en" so reports
  // written under it verify on any machine regardless of its locale.
  "settlens-stable-json-v1": (left, right) => left.localeCompare(right, "en"),
  // v2: UTF-16 code-unit order (Array.prototype.sort default), locale-free.
  "settlens-stable-json-v2": (left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
};

export const CANONICALIZATION = "settlens-stable-json-v2";

export function isSupportedCanonicalization(name) {
  return Object.hasOwn(KEY_ORDERS, name);
}

export function stableStringify(value, canonicalization = CANONICALIZATION) {
  const compare = KEY_ORDERS[canonicalization];
  if (!isSupportedCanonicalization(canonicalization)) {
    throw new Error(`Unsupported canonicalization "${canonicalization}".`);
  }
  const serialize = (entry) => {
    if (Array.isArray(entry)) {
      return `[${entry.map(serialize).join(",")}]`;
    }
    if (isPlainObject(entry)) {
      const members = Object.entries(entry)
        .sort(([left], [right]) => compare(left, right))
        .map(([key, child]) => `${JSON.stringify(key)}:${serialize(child)}`);
      return `{${members.join(",")}}`;
    }
    return JSON.stringify(entry);
  };
  return serialize(value);
}

export function withoutEphemeralFields(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutEphemeralFields(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !EPHEMERAL_REQUIREMENT_KEYS.has(key))
        .map(([key, entry]) => [key, withoutEphemeralFields(entry)]),
    );
  }

  return value;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function readBoundedResponseBody(
  response,
  maxBytes = MAX_RESPONSE_BODY_BYTES,
) {
  const hash = createHash("sha256");
  const chunks = [];
  let observedBytes = 0;
  let truncated = false;

  if (!response.body) {
    return {
      buffer: Buffer.alloc(0),
      observedBytes,
      digest: hash.digest("hex"),
      truncated,
    };
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const remaining = maxBytes - observedBytes;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel("Settlens response evidence limit reached.");
        break;
      }
      const chunk = Buffer.from(value);
      const retained = chunk.subarray(0, remaining);
      hash.update(retained);
      chunks.push(retained);
      observedBytes += retained.byteLength;
      if (retained.byteLength < chunk.byteLength) {
        truncated = true;
        await reader.cancel("Settlens response evidence limit reached.");
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    buffer: Buffer.concat(chunks),
    observedBytes,
    digest: hash.digest("hex"),
    truncated,
  };
}

export function newReportId() {
  return randomUUID().split("-")[0];
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function truncate(value, maxLength = 500) {
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

// Text shown to an AI agent: one line without control, format (zero-width,
// bidi) or line-separator characters, bounded, to shrink the prompt-injection
// surface of server-controlled values.
export function agentText(value, maxLength = 80) {
  return truncate(
    String(value).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ").trim(),
    maxLength,
  );
}

export function isLoopbackUrl(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function canonicalResourceUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.toString();
}

export function toSerializableError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.cause ? { cause: String(error.cause) } : {}),
    };
  }
  return { name: "Error", message: String(error) };
}

// A verification time given as Unix seconds (number or digit string) or an
// ISO 8601 date; defaults to the clock (milliseconds, like Date.now).
export function unixSeconds(now, clock = Date.now) {
  if (now === undefined) {
    return Math.floor(clock() / 1000);
  }
  if (typeof now === "number" || /^[0-9]+$/.test(now)) {
    return Number(now);
  }
  const parsed = Date.parse(now);
  if (Number.isNaN(parsed)) {
    throw new Error("now must be an ISO 8601 date or Unix seconds.");
  }
  return Math.floor(parsed / 1000);
}
