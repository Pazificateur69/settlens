import { performance } from "node:perf_hooks";
import {
  DEFAULT_REPEAT,
  DEFAULT_TIMEOUT_MS,
  OFFICIAL_X402_CORE_VERSION,
  PROTOCOL_VERSION,
  VERSION,
} from "./constants.js";
import {
  activeProbeChecks,
  driftCheck,
  makeCheck,
  paymentRequiredChecks,
  paymentRequiredEncodingCheck,
  transportChecks,
} from "./checks.js";
import {
  buildInvalidPaymentPayload,
  decodeBase64Json,
  encodeBase64Json,
} from "./protocol.js";
import {
  CANONICALIZATION,
  headerNames,
  isSupportedCanonicalization,
  newReportId,
  readBoundedResponseBody,
  sanitizeUrl,
  sha256,
  stableStringify,
  toSerializableError,
} from "./utils.js";
import {
  facilitatorCoverageChecks,
  probeFacilitatorVerify,
  scanFacilitator,
} from "./facilitator.js";

async function requestTarget(target, options = {}) {
  const timeoutMs = options.timeoutMs ?? target.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = new Headers({
    accept: "application/json",
    "user-agent": `Settlens/${VERSION} authorized-security-assessment`,
  });

  for (const [name, value] of Object.entries(target.headers ?? {})) {
    if (name.toLowerCase() === "payment-signature") {
      throw new Error(
        "Refusing a user-supplied PAYMENT-SIGNATURE. Settlens never sends real payment authorizations.",
      );
    }
    headers.set(name, String(value));
  }
  if (options.paymentSignature) {
    headers.set("payment-signature", options.paymentSignature);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await (options.fetchImpl ?? fetch)(target.url, {
      method: target.method ?? "GET",
      headers,
      body: target.body,
      redirect: "manual",
      signal: controller.signal,
    });
    const body = await readBoundedResponseBody(response);
    return {
      status: response.status,
      durationMs: Math.round(performance.now() - start),
      headers: Object.fromEntries(response.headers.entries()),
      bodyBytes: body.observedBytes,
      bodyDigest: body.digest,
      bodyTruncated: body.truncated,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeChecks(checks) {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );
}

export async function scanTarget(target, options = {}) {
  const startedAt = new Date().toISOString();
  const checks = [];
  const samples = [];
  const repeat = Math.max(1, options.repeat ?? target.repeat ?? DEFAULT_REPEAT);
  let firstProbe;
  let paymentRequired;
  let facilitatorIntegration = null;

  try {
    firstProbe = await requestTarget(target, options);
  } catch (error) {
    checks.push(
      makeCheck({
        id: "transport.reachable",
        title: "Endpoint is reachable",
        status: "fail",
        severity: "high",
        message: `The request failed: ${error.message}`,
        evidence: toSerializableError(error),
        recommendation:
          "Confirm DNS, TLS, firewall rules and the configured endpoint URL.",
      }),
    );
    return finalizeTargetResult({
      target,
      startedAt,
      checks,
      active: false,
      requestMetadata: null,
    });
  }

  const paymentRequiredHeader = firstProbe.headers["payment-required"];
  checks.push(
    ...transportChecks({
      target,
      probe: firstProbe,
      paymentRequiredHeader,
    }),
  );

  if (paymentRequiredHeader) {
    try {
      paymentRequired = decodeBase64Json(paymentRequiredHeader);
      checks.push(paymentRequiredEncodingCheck());
      checks.push(
        ...paymentRequiredChecks({
          paymentRequired,
          target,
          expected: target.expected,
        }),
      );
      if (
        paymentRequired &&
        typeof paymentRequired === "object" &&
        Array.isArray(paymentRequired.accepts)
      ) {
        samples.push(paymentRequired);
      }
    } catch (error) {
      checks.push(paymentRequiredEncodingCheck(error));
    }
  }

  for (let index = 1; index < repeat && paymentRequired; index += 1) {
    try {
      const probe = await requestTarget(target, options);
      const header = probe.headers["payment-required"];
      if (probe.status === 402 && header) {
        samples.push(decodeBase64Json(header));
      }
    } catch {
      // The reachability check already captures the first request. Drift degrades to
      // a skipped result when later samples cannot be collected.
    }
  }
  options.onPaymentRequired?.(paymentRequired);
  checks.push(driftCheck(samples));

  if (target.facilitator) {
    facilitatorIntegration = await scanFacilitator(target.facilitator, options);
    checks.push(...facilitatorIntegration.checks);
    if (Array.isArray(paymentRequired?.accepts)) {
      checks.push(
        ...facilitatorCoverageChecks(
          paymentRequired,
          facilitatorIntegration.supported,
        ),
      );
    }
  }

  const activeRequested = options.active ?? target.active ?? false;
  const authorized = options.authorized ?? target.authorized ?? false;
  const authorizationRef =
    options.authorizationRef ?? target.authorizationRef ?? "";
  let activeExecuted = false;

  if (activeRequested && (!authorized || !authorizationRef.trim())) {
    checks.push(
      makeCheck({
        id: "safety.active_authorization",
        title: "Active probe has explicit authorization",
        status: "fail",
        severity: "high",
        message: !authorized
          ? "The active probe was requested without authorization confirmation."
          : "The active probe requires a traceable authorization reference.",
        recommendation:
          "Supply --authorized and --authorization-ref with the owner-approved ticket, email or scope identifier.",
      }),
    );
  } else if (
    activeRequested &&
    authorized &&
    authorizationRef.trim() &&
    paymentRequired?.x402Version === PROTOCOL_VERSION &&
    Array.isArray(paymentRequired.accepts) &&
    paymentRequired.accepts.length > 0
  ) {
    const invalidPayload = buildInvalidPaymentPayload(paymentRequired);
    try {
      const activeProbe = await requestTarget(target, {
        ...options,
        paymentSignature: encodeBase64Json(invalidPayload),
      });
      checks.push(...activeProbeChecks(activeProbe));
      activeExecuted = true;
      if (target.facilitator) {
        const verifyProbe = await probeFacilitatorVerify(
          target.facilitator,
          {
            x402Version: PROTOCOL_VERSION,
            paymentPayload: invalidPayload,
            paymentRequirements: invalidPayload.accepted,
          },
          options,
        );
        checks.push(...verifyProbe.checks);
      }
    } catch (error) {
      checks.push(
        makeCheck({
          id: "security.invalid_signature_fail_closed",
          title: "Invalid payment authorization is denied",
          status: "warn",
          severity: "medium",
          message: `The active probe could not complete: ${error.message}`,
          evidence: toSerializableError(error),
          recommendation:
            "Re-run the authorized probe when the endpoint is reachable.",
        }),
      );
    }
  } else if (activeRequested && authorized) {
    checks.push(
      makeCheck({
        id: "security.invalid_signature_fail_closed",
        title: "Invalid payment authorization is denied",
        status: "skip",
        severity: "critical",
        message:
          "A valid V2 PaymentRequired object is needed before constructing the safe invalid-signature probe.",
      }),
    );
  }

  return finalizeTargetResult({
    target,
    startedAt,
    checks,
    active: activeExecuted,
    requestMetadata: {
      status: firstProbe.status,
      durationMs: firstProbe.durationMs,
      responseBytes: firstProbe.bodyBytes,
      responseDigest: firstProbe.bodyDigest,
      responseBodyTruncated: firstProbe.bodyTruncated,
      responseHeaderNames: Object.keys(firstProbe.headers).sort(),
    },
    integrations: facilitatorIntegration
      ? {
          facilitator: {
            url: facilitatorIntegration.target.url,
            supportedKinds:
              facilitatorIntegration.supported?.kinds.length ?? 0,
          },
        }
      : undefined,
    authorization:
      activeExecuted
        ? {
            confirmed: true,
            reference: authorizationRef.trim(),
          }
        : undefined,
  });
}

function finalizeTargetResult({
  target,
  startedAt,
  checks,
  active,
  requestMetadata,
  integrations,
  authorization,
}) {
  return {
    id: newReportId(),
    name: target.name ?? new URL(target.url).hostname,
    target: {
      url: sanitizeUrl(target.url),
      method: target.method ?? "GET",
      requestHeaderNames: headerNames(target.headers),
    },
    mode: active ? "active-authorized" : "passive",
    startedAt,
    completedAt: new Date().toISOString(),
    summary: summarizeChecks(checks),
    request: requestMetadata,
    ...(integrations ? { integrations } : {}),
    ...(authorization ? { authorization } : {}),
    checks,
  };
}

export function createReport(results, metadata = {}) {
  const allChecks = results.flatMap((result) => result.checks);
  const report = {
    schemaVersion: 1,
    reportId: newReportId(),
    product: "Settlens",
    productVersion: VERSION,
    protocol: "x402",
    protocolVersion: PROTOCOL_VERSION,
    integrations: {
      officialX402Core: OFFICIAL_X402_CORE_VERSION,
    },
    generatedAt: new Date().toISOString(),
    scope: {
      targetCount: results.length,
      activeTargetCount: results.filter(
        ({ mode }) => mode === "active-authorized",
      ).length,
      settlementCalls: 0,
      privateKeysUsed: 0,
    },
    metadata,
    summary: summarizeChecks(allChecks),
    targets: results,
  };
  return {
    ...report,
    integrity: {
      algorithm: "sha256",
      canonicalization: CANONICALIZATION,
      digest: sha256(stableStringify(report, CANONICALIZATION)),
    },
  };
}

export function verifyReportIntegrity(report) {
  if (
    !report ||
    report.integrity?.algorithm !== "sha256" ||
    !isSupportedCanonicalization(report.integrity?.canonicalization) ||
    typeof report.integrity?.digest !== "string"
  ) {
    return {
      valid: false,
      expected: null,
      actual: null,
      reason: "Report does not contain a supported Settlens integrity block.",
    };
  }

  const { integrity, ...unsignedReport } = report;
  // v1 reports keep verifying: the digest is recomputed with the recorded canonicalization.
  const actual = sha256(stableStringify(unsignedReport, integrity.canonicalization));
  return {
    valid: actual === integrity.digest,
    expected: integrity.digest,
    actual,
    reason:
      actual === integrity.digest
        ? "Report content matches its SHA-256 evidence digest."
        : "Report content was modified after the evidence digest was created.",
  };
}
