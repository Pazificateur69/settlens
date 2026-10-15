export const PRODUCT_NAME = "Settlens";
export const VERSION = "0.5.0";
export const PROTOCOL_VERSION = 2;
export const OFFICIAL_X402_CORE_VERSION = "2.28.0";
export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_REPEAT = 2;
export const MAX_HEADER_LENGTH = 128 * 1024;
export const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;

export const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

export const STATUS_ORDER = Object.freeze({
  fail: 0,
  warn: 1,
  pass: 2,
  skip: 3,
});

export const SENSITIVE_QUERY_KEYS =
  /^(api[-_]?key|access[-_]?token|token|key|secret|signature|authorization|auth)$/i;

export const EPHEMERAL_REQUIREMENT_KEYS = new Set([
  "recentBlockhash",
  "lastValidBlockHeight",
]);
