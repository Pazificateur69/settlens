import { PROTOCOL_VERSION } from "./constants.js";
import {
  EVM_ADDRESS_PATTERN,
  isPositiveAtomicAmount,
  validatePaymentRequiredShape,
  validateRequirement,
  validateWithOfficialSdk,
} from "./protocol.js";
import {
  canonicalResourceUrl,
  isLoopbackUrl,
  sanitizeUrl,
  stableStringify,
  withoutEphemeralFields,
} from "./utils.js";

export function makeCheck({
  id,
  title,
  status,
  severity,
  message,
  evidence,
  recommendation,
}) {
  return {
    id,
    title,
    status,
    severity,
    message,
    ...(evidence === undefined ? {} : { evidence }),
    ...(recommendation ? { recommendation } : {}),
  };
}

function includesCaseInsensitive(values, candidate) {
  return values.some(
    (value) => String(value).toLowerCase() === String(candidate).toLowerCase(),
  );
}

// Recipients (payTo) and assets (token contracts / mints): EVM hex addresses
// compare case-insensitively (EIP-55 case is only a checksum). Other formats,
// such as Solana base58, are case-sensitive: a case variant is another address.
function includesRecipient(allowed, candidate) {
  return allowed.some(
    (value) =>
      value === candidate ||
      (EVM_ADDRESS_PATTERN.test(value) &&
        EVM_ADDRESS_PATTERN.test(String(candidate)) &&
        value.toLowerCase() === String(candidate).toLowerCase()),
  );
}

export function transportChecks({ target, probe, paymentRequiredHeader }) {
  const checks = [];

  checks.push(
    makeCheck({
      id: "transport.reachable",
      title: "Endpoint is reachable",
      status: "pass",
      severity: "high",
      message: `Received an HTTP response in ${probe.durationMs} ms.`,
      evidence: { status: probe.status, durationMs: probe.durationMs },
    }),
  );

  checks.push(
    makeCheck({
      id: "transport.status_402",
      title: "Unauthenticated request requires payment",
      status: probe.status === 402 ? "pass" : "fail",
      severity: "high",
      message:
        probe.status === 402
          ? "The endpoint returned HTTP 402 Payment Required."
          : `Expected HTTP 402 but received HTTP ${probe.status}.`,
      evidence: { expected: 402, actual: probe.status },
      recommendation:
        probe.status === 402
          ? undefined
          : "Protect the resource before executing business logic and return HTTP 402 when no valid payment is attached.",
    }),
  );

  checks.push(
    makeCheck({
      id: "transport.payment_required_header",
      title: "PAYMENT-REQUIRED header is present",
      status: paymentRequiredHeader ? "pass" : "fail",
      severity: "high",
      message: paymentRequiredHeader
        ? "The canonical x402 V2 payment header is present."
        : "The response does not include PAYMENT-REQUIRED.",
      recommendation: paymentRequiredHeader
        ? undefined
        : "Return the Base64-encoded PaymentRequired object in the PAYMENT-REQUIRED header.",
    }),
  );

  checks.push(
    makeCheck({
      id: "transport.response_body_limit",
      title: "Response body stays within the evidence limit",
      status: probe.bodyTruncated ? "warn" : "pass",
      severity: "medium",
      message: probe.bodyTruncated
        ? "The response body exceeded 1 MiB and evidence collection stopped at the limit."
        : "The response body was processed within the 1 MiB evidence limit.",
      evidence: {
        observedBytes: probe.bodyBytes,
        truncated: probe.bodyTruncated,
      },
      recommendation: probe.bodyTruncated
        ? "Keep payment challenge responses small and return protected content only after verified payment."
        : undefined,
    }),
  );

  const targetUrl = new URL(target.url);
  const secureTransport =
    targetUrl.protocol === "https:" || isLoopbackUrl(target.url);
  checks.push(
    makeCheck({
      id: "transport.https",
      title: "Transport protects payment metadata",
      status: secureTransport ? "pass" : "warn",
      severity: "medium",
      message: secureTransport
        ? targetUrl.protocol === "https:"
          ? "The endpoint uses HTTPS."
          : "Loopback HTTP is acceptable for local testing."
        : "A remote x402 endpoint is using plaintext HTTP.",
      recommendation: secureTransport
        ? undefined
        : "Serve production payment endpoints exclusively over HTTPS.",
    }),
  );

  const redirected = probe.status >= 300 && probe.status < 400;
  const observableStatus = Number.isInteger(probe.status) && probe.status >= 100 && probe.status <= 599;
  checks.push(
    makeCheck({
      id: "transport.redirect",
      title: "Payment endpoint does not redirect unexpectedly",
      status: redirected ? "warn" : observableStatus ? "pass" : "skip",
      severity: "medium",
      message: redirected
        ? "The endpoint returned a redirect; Settlens did not follow it."
        : observableStatus
          ? "The observed HTTP response did not redirect."
          : "No observable HTTP status was available to establish whether the endpoint redirected.",
      evidence: {
        status: probe.status,
        location: redirected && probe.headers.location
          ? sanitizeUrl(probe.headers.location, target.url)
          : null,
      },
      recommendation: redirected
        ? "Expose the canonical paid resource directly or explicitly include the redirected URL in the assessment scope."
        : undefined,
    }),
  );

  return checks;
}

export function paymentRequiredEncodingCheck(error) {
  return makeCheck({
    id: "transport.payment_required_encoding",
    title: "PAYMENT-REQUIRED decodes as Base64 JSON",
    status: error ? "fail" : "pass",
    severity: "high",
    message: error ? error.message : "The canonical header decoded successfully.",
    recommendation: error
      ? "Base64-encode a valid PaymentRequired JSON object in the PAYMENT-REQUIRED header."
      : undefined,
  });
}

export function paymentRequiredChecks({
  paymentRequired,
  target,
  expected = {},
}) {
  const checks = [];
  const shapeProblems = validatePaymentRequiredShape(paymentRequired);
  const officialSdkProblems = validateWithOfficialSdk(paymentRequired);

  checks.push(
    makeCheck({
      id: "schema.official_x402_sdk",
      title: "Official x402 SDK accepts PaymentRequired",
      status: officialSdkProblems.length === 0 ? "pass" : "fail",
      severity: "high",
      message:
        officialSdkProblems.length === 0
          ? "The header passes @x402/core 2.28.0 schema validation."
          : `The official SDK reported ${officialSdkProblems.length} schema problem(s).`,
      evidence:
        officialSdkProblems.length === 0
          ? { package: "@x402/core", version: "2.28.0" }
          : { problems: officialSdkProblems },
      recommendation:
        officialSdkProblems.length === 0
          ? undefined
          : "Align the emitted object with the current official @x402/core V2 schema.",
    }),
  );

  checks.push(
    makeCheck({
      id: "schema.payment_required",
      title: "PaymentRequired matches the x402 V2 core shape",
      status: shapeProblems.length === 0 ? "pass" : "fail",
      severity: "high",
      message:
        shapeProblems.length === 0
          ? "The decoded header contains the required V2 fields."
          : `${shapeProblems.length} core schema problem(s) found.`,
      evidence:
        shapeProblems.length === 0
          ? { x402Version: paymentRequired.x402Version }
          : { problems: shapeProblems },
      recommendation:
        shapeProblems.length === 0
          ? undefined
          : `Emit x402Version ${PROTOCOL_VERSION}, a valid resource object and at least one accepted payment requirement.`,
    }),
  );

  if (shapeProblems.length > 0) {
    return checks;
  }

  let resourceMatches = false;
  try {
    const advertised = canonicalResourceUrl(paymentRequired.resource.url);
    const expectedUrl = canonicalResourceUrl(
      expected.resourceUrl ?? target.url,
    );
    resourceMatches = advertised === expectedUrl;
  } catch {
    resourceMatches = false;
  }

  checks.push(
    makeCheck({
      id: "binding.resource_url",
      title: "Payment requirement is bound to the requested resource",
      status: resourceMatches ? "pass" : "fail",
      severity: "high",
      message: resourceMatches
        ? "resource.url exactly matches the protected request URL."
        : "resource.url does not match the URL being assessed.",
      evidence: {
        requested: sanitizeUrl(expected.resourceUrl ?? target.url),
        advertised: sanitizeUrl(paymentRequired.resource.url),
      },
      recommendation: resourceMatches
        ? undefined
        : "Bind the payment requirement to the exact canonical resource URL, including its path and relevant query.",
    }),
  );

  const requirementProblems = paymentRequired.accepts.flatMap((requirement, index) =>
    validateRequirement(requirement, index),
  );
  checks.push(
    makeCheck({
      id: "schema.payment_requirements",
      title: "Accepted payment requirements are well formed",
      status: requirementProblems.length === 0 ? "pass" : "fail",
      severity: "high",
      message:
        requirementProblems.length === 0
          ? `${paymentRequired.accepts.length} payment requirement(s) use valid core fields.`
          : `${requirementProblems.length} requirement problem(s) found.`,
      evidence:
        requirementProblems.length === 0
          ? {
              count: paymentRequired.accepts.length,
              schemes: paymentRequired.accepts.map(({ scheme }) => scheme),
              networks: paymentRequired.accepts.map(({ network }) => network),
            }
          : { problems: requirementProblems },
      recommendation:
        requirementProblems.length === 0
          ? undefined
          : "Correct invalid scheme, network, amount, asset, payTo or timeout fields before accepting payments.",
    }),
  );

  const duplicateCount =
    paymentRequired.accepts.length -
    new Set(paymentRequired.accepts.map((entry) => stableStringify(entry))).size;
  checks.push(
    makeCheck({
      id: "schema.duplicate_requirements",
      title: "Payment choices are unambiguous",
      status: duplicateCount === 0 ? "pass" : "warn",
      severity: "low",
      message:
        duplicateCount === 0
          ? "No duplicate accepted requirements were found."
          : `${duplicateCount} duplicate requirement(s) were advertised.`,
      recommendation:
        duplicateCount === 0
          ? undefined
          : "Remove duplicate payment choices to avoid inconsistent client selection.",
    }),
  );

  const excessiveTimeouts = paymentRequired.accepts
    .map((entry, index) => ({ index, value: entry?.maxTimeoutSeconds }))
    .filter(({ value }) => typeof value === "number" && value > 3_600);
  checks.push(
    makeCheck({
      id: "freshness.timeout_window",
      title: "Authorization windows are reasonably bounded",
      status: excessiveTimeouts.length === 0 ? "pass" : "warn",
      severity: "medium",
      message:
        excessiveTimeouts.length === 0
          ? "All advertised maxTimeoutSeconds values are at most one hour."
          : "One or more authorization windows exceed one hour.",
      evidence:
        excessiveTimeouts.length === 0
          ? undefined
          : { excessiveTimeouts },
      recommendation:
        excessiveTimeouts.length === 0
          ? undefined
          : "Use the shortest authorization window compatible with settlement to reduce replay exposure.",
    }),
  );

  checks.push(...policyChecks(paymentRequired.accepts, expected));
  return checks;
}

export function policyChecks(requirements, expected) {
  const checks = [];
  const policies = [
    {
      key: "schemes",
      field: "scheme",
      id: "policy.scheme",
      title: "Schemes match the local policy",
    },
    {
      key: "networks",
      field: "network",
      id: "policy.network",
      title: "Networks match the local policy",
    },
    {
      key: "payTo",
      field: "payTo",
      id: "policy.recipient",
      title: "Recipients match the local policy",
      address: true,
    },
    {
      key: "assets",
      field: "asset",
      id: "policy.asset",
      title: "Assets match the local policy",
      address: true,
    },
  ];

  for (const policy of policies) {
    const allowed = expected[policy.key];
    if (!Array.isArray(allowed) || allowed.length === 0) {
      continue;
    }

    const observed = requirements.map((entry) => entry?.[policy.field]);
    const unexpected = observed.filter((value) =>
      policy.address
        ? !includesRecipient(allowed, value)
        : !includesCaseInsensitive(allowed, value),
    );
    checks.push(
      makeCheck({
        id: policy.id,
        title: policy.title,
        status: unexpected.length === 0 ? "pass" : "fail",
        severity: "high",
        message:
          unexpected.length === 0
            ? `All advertised ${policy.key} are allowed.`
            : `Unexpected ${policy.key}: ${unexpected.join(", ")}.`,
        evidence: { allowed, observed },
        recommendation:
          unexpected.length === 0
            ? undefined
            : `Restore the approved ${policy.key} or update the reviewed Settlens policy intentionally.`,
      }),
    );
  }

  if (expected.maxAmount !== undefined) {
    let maximum;
    try {
      maximum = BigInt(String(expected.maxAmount));
    } catch {
      maximum = null;
    }

    const excessive = requirements
      .map((entry, index) => ({ index, amount: entry?.amount }))
      .filter(
        ({ amount }) =>
          maximum !== null &&
          isPositiveAtomicAmount(amount) &&
          BigInt(amount) > maximum,
      );
    checks.push(
      makeCheck({
        id: "policy.maximum_amount",
        title: "Amounts stay within the approved ceiling",
        status: maximum !== null && excessive.length === 0 ? "pass" : "fail",
        severity: "high",
        message:
          maximum === null
            ? "The configured maxAmount is not an integer."
            : excessive.length === 0
              ? `All atomic amounts are at or below ${maximum}.`
              : `${excessive.length} payment amount(s) exceed ${maximum}.`,
        evidence: {
          configuredMaximum: String(expected.maxAmount),
          observed: requirements.map((entry) => entry?.amount),
        },
        recommendation:
          maximum !== null && excessive.length === 0
            ? undefined
            : "Correct the advertised price or intentionally review and update the approved ceiling.",
      }),
    );
  }

  return checks;
}

export function driftCheck(samples) {
  if (samples.length < 2) {
    return makeCheck({
      id: "stability.payment_requirements",
      title: "Payment requirements remain stable",
      status: "skip",
      severity: "medium",
      message: "Only one successful sample was available.",
    });
  }

  // Later samples are any decoded JSON (a server can send `null`): drift, never a crash.
  const fingerprints = samples.map((sample) =>
    stableStringify(
      withoutEphemeralFields({
        resource: sample?.resource,
        accepts: sample?.accepts,
        extensions: sample?.extensions ?? {},
      }),
    ),
  );
  const stable = new Set(fingerprints).size === 1;

  return makeCheck({
    id: "stability.payment_requirements",
    title: "Payment requirements remain stable",
    status: stable ? "pass" : "warn",
    severity: "medium",
    message: stable
      ? `The payment terms were identical across ${samples.length} requests, excluding known ephemeral fields.`
      : "Payment terms changed between identical unauthenticated requests.",
    evidence: {
      sampleCount: samples.length,
      fingerprints: fingerprints.map((value) => value.slice(0, 160)),
    },
    recommendation: stable
      ? undefined
      : "Confirm that dynamic pricing or recipient selection is intentional and cryptographically bound to the requested resource.",
  });
}

export function activeProbeChecks(probe) {
  const denied = probe.status < 200 || probe.status >= 300;
  const conformingStatus = probe.status === 400 || probe.status === 402;

  return [
    makeCheck({
      id: "security.invalid_signature_fail_closed",
      title: "Invalid payment authorization is denied",
      status: denied ? "pass" : "fail",
      severity: "critical",
      message: denied
        ? `The intentionally invalid payment was denied with HTTP ${probe.status}.`
        : `The endpoint returned HTTP ${probe.status} after an invalid payment authorization.`,
      evidence: { status: probe.status, responseBytes: probe.bodyBytes },
      recommendation: denied
        ? undefined
        : "Block resource execution unless cryptographic verification and settlement succeed. Treat this as a potential payment bypass.",
    }),
    makeCheck({
      id: "transport.invalid_payment_status",
      title: "Invalid payment uses a standard failure status",
      status: conformingStatus ? "pass" : "warn",
      severity: "medium",
      message: conformingStatus
        ? `HTTP ${probe.status} matches the x402 transport error mapping.`
        : `Expected HTTP 400 or 402 for invalid payment, received HTTP ${probe.status}.`,
      recommendation: conformingStatus
        ? undefined
        : "Return HTTP 400 for malformed payment data or HTTP 402 when verification/settlement fails.",
    }),
  ];
}
