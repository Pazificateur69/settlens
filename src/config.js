import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validatePricePolicy } from "./price-policy.js";
import { isPlainObject } from "./utils.js";

const FAIL_LEVELS = new Set(["low", "medium", "high", "critical", "none"]);
const TARGET_KEYS = new Set([
  "name",
  "url",
  "method",
  "headers",
  "body",
  "timeoutMs",
  "repeat",
  "expected",
  "pricePolicy",
  "facilitator",
]);
const DEFAULT_KEYS = new Set(
  [...TARGET_KEYS].filter((key) => !["name", "url"].includes(key)),
);
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported field(s): ${unknown.join(", ")}.`);
  }
}

function validatePositiveInteger(value, label, maximum) {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    (maximum !== undefined && value > maximum)
  ) {
    throw new Error(
      `${label} must be an integer between 1 and ${maximum ?? Number.MAX_SAFE_INTEGER}.`,
    );
  }
}

function validateHeaders(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const entries = Object.entries(value);
  if (entries.length > 64) {
    throw new Error(`${label} must contain at most 64 entries.`);
  }
  for (const [name, headerValue] of entries) {
    if (!HEADER_NAME.test(name)) {
      throw new Error(`${label} contains an invalid HTTP header name.`);
    }
    if (typeof headerValue !== "string") {
      throw new Error(`${label}.${name} must be a string.`);
    }
    if (/[\r\n]/.test(headerValue) || headerValue.length > 65_536) {
      throw new Error(`${label}.${name} is unsafe or exceeds 65536 characters.`);
    }
  }
}

export function validateExpected(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertAllowedKeys(
    value,
    new Set(["resourceUrl", "schemes", "networks", "payTo", "assets", "maxAmount"]),
    label,
  );
  if (value.resourceUrl !== undefined) {
    validateHttpUrl(value.resourceUrl, `${label}.resourceUrl`);
  }
  for (const key of ["schemes", "networks", "payTo", "assets"]) {
    if (value[key] === undefined) {
      continue;
    }
    if (
      !Array.isArray(value[key]) ||
      value[key].length === 0 ||
      value[key].length > 32 ||
      value[key].some((entry) => typeof entry !== "string" || !entry)
    ) {
      throw new Error(`${label}.${key} must contain 1 to 32 non-empty strings.`);
    }
  }
  if (
    value.maxAmount !== undefined &&
    (typeof value.maxAmount !== "string" || !/^[0-9]+$/.test(value.maxAmount))
  ) {
    throw new Error(`${label}.maxAmount must be an integer string.`);
  }
}

function validateHttpUrl(value, label) {
  if (typeof value !== "string" || value.length > 8_192) {
    throw new Error(`${label} must be an HTTP(S) URL of at most 8192 characters.`);
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} credentials are forbidden; use reviewed headers.`);
  }
  return url;
}

function expandEnvironment(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => expandEnvironment(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        expandEnvironment(entry),
      ]),
    );
  }
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    const environmentValue = process.env[name];
    if (environmentValue === undefined) {
      throw new Error(`Environment variable ${name} is required by the config.`);
    }
    return environmentValue;
  });
}

export async function loadConfig(filePath) {
  const absolutePath = resolve(filePath);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read config ${absolutePath}: ${error.message}`);
  }

  const config = expandEnvironment(parsed);
  if (!isPlainObject(config)) {
    throw new Error("Config must be a JSON object.");
  }
  assertAllowedKeys(
    config,
    new Set(["version", "failOn", "output", "defaults", "targets"]),
    "Config",
  );
  if (config.version !== 1) {
    throw new Error("Config version must equal 1.");
  }
  if (
    !Array.isArray(config.targets) ||
    config.targets.length === 0 ||
    config.targets.length > 100
  ) {
    throw new Error("Config must contain between 1 and 100 targets.");
  }
  if (config.failOn !== undefined && !FAIL_LEVELS.has(config.failOn)) {
    throw new Error("Config failOn must be low, medium, high, critical or none.");
  }
  if (
    config.output !== undefined &&
    (typeof config.output !== "string" || !config.output.trim())
  ) {
    throw new Error("Config output must be a non-empty string.");
  }

  if (config.defaults !== undefined && !isPlainObject(config.defaults)) {
    throw new Error("Config defaults must be an object.");
  }
  const defaults = config.defaults ?? {};
  assertAllowedKeys(defaults, DEFAULT_KEYS, "Config defaults");
  const targets = config.targets.map((entry, index) =>
    normalizeTarget({ ...defaults, ...entry }, index),
  );

  return {
    path: absolutePath,
    targets,
    failOn: config.failOn ?? defaults.failOn ?? "high",
    output: config.output ?? defaults.output ?? "reports",
  };
}

export function normalizeTarget(target, index = 0) {
  if (!isPlainObject(target)) {
    throw new Error(`Target ${index} must be an object.`);
  }
  assertAllowedKeys(target, TARGET_KEYS, `Target ${index}`);
  if (typeof target.url !== "string") {
    throw new Error(`Target ${index} requires a url.`);
  }
  try {
    validateHttpUrl(target.url, `Target ${index} URL`);
  } catch (error) {
    throw new Error(`Target ${index} has an invalid URL: ${error.message}`);
  }

  // A non-string such as true would otherwise become "TRUE"; the schema requires a string.
  if (target.method !== undefined && typeof target.method !== "string") {
    throw new Error(`Target ${index} method must be a string.`);
  }
  const method = (target.method ?? "GET").toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw new Error(`Target ${index} method must contain only letters.`);
  }
  const headers = target.headers ?? {};
  validateHeaders(headers, `Target ${index} headers`);
  if (
    Object.keys(headers).some(
      (name) => name.toLowerCase() === "payment-signature",
    )
  ) {
    throw new Error(
      `Target ${index} must not provide PAYMENT-SIGNATURE. Settlens never sends real payment authorizations.`,
    );
  }
  if (target.name !== undefined && (typeof target.name !== "string" || !target.name)) {
    throw new Error(`Target ${index} name must be a non-empty string.`);
  }
  if (
    target.body !== undefined &&
    (typeof target.body !== "string" || target.body.length > 1_048_576)
  ) {
    throw new Error(
      `Target ${index} body must be a string of at most 1048576 characters.`,
    );
  }
  if (["GET", "HEAD"].includes(method) && target.body !== undefined) {
    throw new Error(`Target ${index} must not provide a body for ${method}.`);
  }
  if (target.timeoutMs !== undefined) {
    validatePositiveInteger(target.timeoutMs, `Target ${index} timeoutMs`, 300_000);
  }
  if (target.repeat !== undefined) {
    validatePositiveInteger(target.repeat, `Target ${index} repeat`, 10);
  }
  const expected = target.expected ?? {};
  validateExpected(expected, `Target ${index} expected`);
  if (target.pricePolicy !== undefined) validatePricePolicy(target.pricePolicy);

  return {
    ...target,
    method,
    headers,
    expected,
    ...(target.facilitator
      ? { facilitator: normalizeFacilitator(target.facilitator, index) }
      : {}),
  };
}

export function normalizeFacilitator(value, index = 0) {
  const facilitator =
    typeof value === "string" ? { url: value } : value;
  if (!isPlainObject(facilitator) || typeof facilitator.url !== "string") {
    throw new Error(`Target ${index} facilitator must provide a url.`);
  }
  assertAllowedKeys(
    facilitator,
    new Set(["name", "url", "timeoutMs", "headers"]),
    `Target ${index} facilitator`,
  );
  try {
    validateHttpUrl(
      facilitator.url,
      `Target ${index} facilitator URL`,
    );
  } catch (error) {
    throw new Error(`Target ${index} has an invalid facilitator URL: ${error.message}`);
  }
  if (
    facilitator.name !== undefined &&
    (typeof facilitator.name !== "string" || !facilitator.name)
  ) {
    throw new Error(`Target ${index} facilitator name must be a non-empty string.`);
  }
  if (facilitator.timeoutMs !== undefined) {
    validatePositiveInteger(
      facilitator.timeoutMs,
      `Target ${index} facilitator timeoutMs`,
      300_000,
    );
  }
  const headers = facilitator.headers ?? {};
  validateHeaders(headers, `Target ${index} facilitator headers`);
  if (
    Object.keys(headers).some(
      (name) => name.toLowerCase() === "payment-signature",
    )
  ) {
    throw new Error(
      `Target ${index} facilitator must not provide PAYMENT-SIGNATURE.`,
    );
  }
  return { ...facilitator, headers };
}

export function assertCredentialHosts(targets, allowedHosts = []) {
  const allowed = new Set(
    allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean),
  );
  const protectedDestinations = [];

  for (const target of targets) {
    if (Object.keys(target.headers ?? {}).length > 0) {
      protectedDestinations.push({
        label: target.name ?? target.url,
        host: new URL(target.url).hostname.toLowerCase(),
      });
    }
    if (
      target.facilitator &&
      Object.keys(target.facilitator.headers ?? {}).length > 0
    ) {
      protectedDestinations.push({
        label: `${target.name ?? target.url} facilitator`,
        host: new URL(target.facilitator.url).hostname.toLowerCase(),
      });
    }
  }

  const rejected = protectedDestinations.filter(
    ({ host }) => !allowed.has(host),
  );
  if (rejected.length > 0) {
    throw new Error(
      `Custom headers require an explicit allowed host. Add --allow-host for: ${[
        ...new Set(rejected.map(({ host }) => host)),
      ].join(", ")}`,
    );
  }
}
