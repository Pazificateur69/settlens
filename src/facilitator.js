import { performance } from "node:perf_hooks";
import {
  DEFAULT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  VERSION,
} from "./constants.js";
import { makeCheck } from "./checks.js";
import { isCaip2 } from "./protocol.js";
import {
  headerNames,
  isLoopbackUrl,
  isPlainObject,
  newReportId,
  readBoundedResponseBody,
  sanitizeUrl,
  toSerializableError,
} from "./utils.js";

function supportedUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/supported")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/supported`;
  }
  return url.toString();
}

function verifyUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/(supported)?$/, "")}/verify`;
  return url.toString();
}

function summarize(checks) {
  return checks.reduce(
    (result, check) => {
      result[check.status] += 1;
      return result;
    },
    { pass: 0, fail: 0, warn: 0, skip: 0 },
  );
}

async function fetchSupported(facilitator, options = {}) {
  const timeoutMs =
    options.timeoutMs ?? facilitator.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = new Headers({
    accept: "application/json",
    "user-agent": `Settlens/${VERSION} facilitator-capability-check`,
  });
  for (const [name, value] of Object.entries(facilitator.headers ?? {})) {
    if (name.toLowerCase() === "payment-signature") {
      throw new Error("Facilitator headers must not include PAYMENT-SIGNATURE.");
    }
    headers.set(name, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await (options.fetchImpl ?? fetch)(
      supportedUrl(facilitator.url),
      {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      },
    );
    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = await readBoundedResponseBody(response);
    const text = responseBody.buffer.toString("utf8");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return {
      status: response.status,
      durationMs: Math.round(performance.now() - start),
      contentType,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      bodyBytes: Buffer.byteLength(text),
      bodyDigest: responseBody.digest,
      bodyTruncated: responseBody.truncated,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postVerify(facilitator, verifyRequest, options = {}) {
  const timeoutMs =
    options.timeoutMs ?? facilitator.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": `Settlens/${VERSION} facilitator-verify-probe`,
  });
  for (const [name, value] of Object.entries(facilitator.headers ?? {})) {
    if (name.toLowerCase() === "payment-signature") {
      throw new Error("Facilitator headers must not include PAYMENT-SIGNATURE.");
    }
    headers.set(name, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await (options.fetchImpl ?? fetch)(
      verifyUrl(facilitator.url),
      {
        method: "POST",
        headers,
        body: JSON.stringify(verifyRequest),
        redirect: "manual",
        signal: controller.signal,
      },
    );
    const responseBody = await readBoundedResponseBody(response);
    let body;
    try {
      body = JSON.parse(responseBody.buffer.toString("utf8"));
    } catch {
      body = null;
    }
    return {
      status: response.status,
      durationMs: Math.round(performance.now() - start),
      body,
      bodyBytes: responseBody.observedBytes,
      bodyDigest: responseBody.digest,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Sends the intentionally invalid payment payload to the facilitator's /verify
// endpoint. /verify never moves funds, so this stays inside the no-custody
// boundary while proving that verification actually fails closed.
export async function probeFacilitatorVerify(facilitator, verifyRequest, options = {}) {
  const checks = [];
  let probe;
  try {
    probe = await postVerify(facilitator, verifyRequest, options);
  } catch (error) {
    checks.push(
      makeCheck({
        id: "facilitator.verify_reachable",
        title: "Facilitator /verify is reachable",
        status: "warn",
        severity: "medium",
        message: `The verify probe could not complete: ${error.message}`,
        evidence: toSerializableError(error),
        recommendation:
          "Re-run the authorized probe when the facilitator /verify endpoint is reachable.",
      }),
    );
    return { checks };
  }

  const body = probe.body;
  const conformant = isPlainObject(body) && typeof body.isValid === "boolean";

  checks.push(
    makeCheck({
      id: "facilitator.verify_response_schema",
      title: "Facilitator /verify returns a conformant VerifyResponse",
      status: conformant ? "pass" : "fail",
      severity: "high",
      message: conformant
        ? `The facilitator returned a boolean isValid field (HTTP ${probe.status}).`
        : `The /verify response is missing a boolean isValid field (HTTP ${probe.status}).`,
      evidence: {
        status: probe.status,
        isValid: isPlainObject(body) ? (body.isValid ?? null) : null,
        invalidReason: isPlainObject(body) ? (body.invalidReason ?? null) : null,
      },
      recommendation: conformant
        ? undefined
        : "Return the standardized x402 VerifyResponse: { isValid, invalidReason?, payer? }.",
    }),
  );

  if (conformant) {
    const rejected = body.isValid === false;
    checks.push(
      makeCheck({
        id: "security.facilitator_rejects_invalid_signature",
        title: "Facilitator /verify rejects an invalid signature",
        status: rejected ? "pass" : "fail",
        severity: "critical",
        message: rejected
          ? `The facilitator rejected an intentionally invalid payment (invalidReason: ${body.invalidReason ?? "unspecified"}).`
          : "The facilitator reported isValid=true for an intentionally invalid, all-zero signature.",
        evidence: { isValid: body.isValid, invalidReason: body.invalidReason ?? null },
        recommendation: rejected
          ? undefined
          : "Cryptographically verify the payment signature before returning isValid. Treat isValid=true for a zero signature as a critical verification bypass.",
      }),
    );
  }

  return { checks };
}

export function validateSupportedResponse(value) {
  const problems = [];
  if (!isPlainObject(value)) {
    return ["SupportedResponse must be a JSON object."];
  }
  if (!Array.isArray(value.kinds) || value.kinds.length === 0) {
    problems.push("kinds must be a non-empty array.");
  } else {
    value.kinds.forEach((kind, index) => {
      if (!isPlainObject(kind)) {
        problems.push(`kinds[${index}] must be an object.`);
        return;
      }
      if (
        !Number.isInteger(kind.x402Version) ||
        kind.x402Version <= 0
      ) {
        problems.push(
          `kinds[${index}].x402Version must be a positive integer.`,
        );
      }
      if (typeof kind.scheme !== "string" || kind.scheme.length === 0) {
        problems.push(`kinds[${index}].scheme must be a non-empty string.`);
      }
      if (typeof kind.network !== "string" || kind.network.length === 0) {
        problems.push(`kinds[${index}].network must be a non-empty string.`);
      } else if (
        kind.x402Version === PROTOCOL_VERSION &&
        !isCaip2(kind.network)
      ) {
        problems.push(
          `kinds[${index}].network must be CAIP-2 for x402 V2.`,
        );
      }
    });
  }
  if (!Array.isArray(value.extensions)) {
    problems.push("extensions must be an array.");
  } else if (value.extensions.some((entry) => typeof entry !== "string")) {
    problems.push("extensions entries must be strings.");
  }
  if (!isPlainObject(value.signers)) {
    problems.push("signers must be an object.");
  } else {
    for (const [network, signers] of Object.entries(value.signers)) {
      if (!network) {
        problems.push("signers keys must be non-empty strings.");
      }
      if (
        !Array.isArray(signers) ||
        signers.some((signer) => typeof signer !== "string" || !signer)
      ) {
        problems.push(`signers["${network}"] must be a string array.`);
      }
    }
  }
  return problems;
}

export async function scanFacilitator(facilitator, options = {}) {
  const startedAt = new Date().toISOString();
  const checks = [];
  let probe;

  try {
    probe = await fetchSupported(facilitator, options);
  } catch (error) {
    checks.push(
      makeCheck({
        id: "facilitator.reachable",
        title: "Facilitator /supported is reachable",
        status: "fail",
        severity: "high",
        message: `The capability request failed: ${error.message}`,
        evidence: toSerializableError(error),
        recommendation:
          "Confirm the facilitator base URL, authentication and network access.",
      }),
    );
    return facilitatorResult(facilitator, startedAt, checks, null, null);
  }

  checks.push(
    makeCheck({
      id: "facilitator.reachable",
      title: "Facilitator /supported is reachable",
      status: "pass",
      severity: "high",
      message: `Received HTTP ${probe.status} in ${probe.durationMs} ms.`,
      evidence: { status: probe.status, durationMs: probe.durationMs },
    }),
  );
  checks.push(
    makeCheck({
      id: "facilitator.response_body_limit",
      title: "Facilitator capability response fits the evidence limit",
      status: probe.bodyTruncated ? "fail" : "pass",
      severity: "high",
      message: probe.bodyTruncated
        ? "The /supported response exceeded the 1 MiB processing limit."
        : "The complete /supported response was processed within the 1 MiB limit.",
      recommendation: probe.bodyTruncated
        ? "Reduce /supported to the minimum standardized capability metadata."
        : undefined,
    }),
  );
  checks.push(
    makeCheck({
      id: "facilitator.supported_status",
      title: "Facilitator exposes capabilities successfully",
      status: probe.status === 200 ? "pass" : "fail",
      severity: "high",
      message:
        probe.status === 200
          ? "GET /supported returned HTTP 200."
          : `GET /supported returned HTTP ${probe.status}.`,
      recommendation:
        probe.status === 200
          ? undefined
          : "Expose the standardized GET /supported endpoint and return HTTP 200.",
    }),
  );
  const jsonContentType =
    probe.contentType.toLowerCase().includes("application/json") ||
    probe.contentType.toLowerCase().includes("+json");
  checks.push(
    makeCheck({
      id: "facilitator.content_type",
      title: "Facilitator capabilities use a JSON media type",
      status: jsonContentType ? "pass" : "warn",
      severity: "medium",
      message: jsonContentType
        ? `Received ${probe.contentType}.`
        : `Expected a JSON media type, received ${probe.contentType || "no Content-Type"}.`,
      recommendation: jsonContentType
        ? undefined
        : "Return /supported with Content-Type application/json.",
    }),
  );
  const secure =
    new URL(facilitator.url).protocol === "https:" ||
    isLoopbackUrl(facilitator.url);
  checks.push(
    makeCheck({
      id: "facilitator.https",
      title: "Facilitator capability transport is protected",
      status: secure ? "pass" : "warn",
      severity: "medium",
      message: secure
        ? "The facilitator uses HTTPS or local loopback."
        : "The remote facilitator uses plaintext HTTP.",
      recommendation: secure
        ? undefined
        : "Serve facilitator APIs exclusively over HTTPS.",
    }),
  );

  const problems = validateSupportedResponse(probe.body);
  checks.push(
    makeCheck({
      id: "facilitator.supported_schema",
      title: "SupportedResponse matches the x402 core shape",
      status: problems.length === 0 ? "pass" : "fail",
      severity: "high",
      message:
        problems.length === 0
          ? `${probe.body.kinds.length} supported payment kind(s) validated, including backward-compatible versions.`
          : `${problems.length} capability schema problem(s) found.`,
      evidence:
        problems.length === 0
          ? {
              kinds: probe.body.kinds,
              extensions: probe.body.extensions,
              signerPatterns: Object.keys(probe.body.signers),
            }
          : { problems },
      recommendation:
        problems.length === 0
          ? undefined
          : "Return kinds, extensions and signers using the standardized SupportedResponse shape.",
    }),
  );

  if (problems.length === 0) {
    const v2Kinds = probe.body.kinds.filter(
      ({ x402Version }) => x402Version === PROTOCOL_VERSION,
    );
    checks.push(
      makeCheck({
        id: "facilitator.v2_capability",
        title: "Facilitator advertises x402 V2 capabilities",
        status: v2Kinds.length > 0 ? "pass" : "fail",
        severity: "high",
        message:
          v2Kinds.length > 0
            ? `${v2Kinds.length} x402 V2 payment kind(s) advertised.`
            : "No x402 V2 payment kind was advertised.",
        evidence: {
          versions: [
            ...new Set(
              probe.body.kinds.map(({ x402Version }) => x402Version),
            ),
          ],
          v2Kinds: v2Kinds.map(({ scheme, network }) => ({ scheme, network })),
        },
        recommendation:
          v2Kinds.length > 0
            ? undefined
            : "Register at least one x402 V2 scheme/network implementation.",
      }),
    );
    const fingerprints = probe.body.kinds.map(
      ({ x402Version, scheme, network }) =>
        `${x402Version}:${scheme}:${network}`,
    );
    const duplicateCount =
      fingerprints.length - new Set(fingerprints).size;
    checks.push(
      makeCheck({
        id: "facilitator.duplicate_kinds",
        title: "Facilitator capabilities are unambiguous",
        status: duplicateCount === 0 ? "pass" : "warn",
        severity: "low",
        message:
          duplicateCount === 0
            ? "No duplicate scheme/network capability was found."
            : `${duplicateCount} duplicate capability entry or entries found.`,
        recommendation:
          duplicateCount === 0
            ? undefined
            : "Remove duplicate kinds from /supported.",
      }),
    );
  }

  return facilitatorResult(
    facilitator,
    startedAt,
    checks,
    problems.length === 0 ? probe.body : null,
    {
      status: probe.status,
      durationMs: probe.durationMs,
      responseBytes: probe.bodyBytes,
      responseDigest: probe.bodyDigest,
      responseBodyTruncated: probe.bodyTruncated,
      responseHeaderNames: Object.keys(probe.headers).sort(),
    },
  );
}

function facilitatorResult(
  facilitator,
  startedAt,
  checks,
  supported,
  request,
) {
  return {
    id: newReportId(),
    name: facilitator.name ?? new URL(facilitator.url).hostname,
    target: {
      url: sanitizeUrl(supportedUrl(facilitator.url)),
      method: "GET",
      requestHeaderNames: headerNames(facilitator.headers),
    },
    mode: "passive-facilitator",
    startedAt,
    completedAt: new Date().toISOString(),
    summary: summarize(checks),
    request,
    checks,
    supported,
  };
}

export function facilitatorCoverageChecks(paymentRequired, supported) {
  if (!supported) {
    return [
      makeCheck({
        id: "facilitator.requirement_coverage",
        title: "Facilitator covers advertised payment requirements",
        status: "skip",
        severity: "high",
        message:
          "Coverage could not be evaluated because /supported was invalid or unavailable.",
      }),
    ];
  }

  // Entries that are not objects with a string network cannot be matched: findings, never a crash.
  const accepts = Array.isArray(paymentRequired?.accepts) ? paymentRequired.accepts : [];
  const malformed = accepts.flatMap((requirement, index) =>
    isPlainObject(requirement) && typeof requirement.network === "string" ? [] : [index],
  );
  const comparable = accepts.filter((_, index) => !malformed.includes(index));
  const missing = comparable.filter(
    (requirement) =>
      !supported.kinds.some(
        (kind) =>
          kind.x402Version === paymentRequired.x402Version &&
          kind.scheme === requirement.scheme &&
          kind.network === requirement.network,
      ),
  );

  const signerGaps = comparable
    .map((requirement) => requirement.network)
    .filter((network) => {
      const namespace = network.split(":")[0];
      return !(
        supported.signers[network]?.length > 0 ||
        supported.signers[`${namespace}:*`]?.length > 0
      );
    });
  const uncovered = missing.length + malformed.length;

  return [
    makeCheck({
      id: "facilitator.requirement_coverage",
      title: "Facilitator covers advertised payment requirements",
      status: uncovered === 0 ? "pass" : "fail",
      severity: "high",
      message:
        uncovered === 0
          ? "Every advertised scheme/network pair appears in facilitator /supported."
          : `${missing.length} advertised payment choice(s) are absent from facilitator capabilities${
              malformed.length > 0
                ? ` and ${malformed.length} cannot be matched (not an object with a string network)`
                : ""
            }.`,
      evidence: {
        missing: missing.map(({ scheme, network }) => ({ scheme, network })),
        ...(malformed.length > 0 ? { malformedIndexes: malformed } : {}),
      },
      recommendation:
        uncovered === 0
          ? undefined
          : "Remove unsupported requirements or register their scheme/network implementation with the selected facilitator.",
    }),
    makeCheck({
      id: "facilitator.signer_coverage",
      title: "Facilitator publishes signer coverage",
      status: signerGaps.length === 0 ? "pass" : "warn",
      severity: "medium",
      message:
        signerGaps.length === 0
          ? "Signer metadata covers every advertised network."
          : `No exact or namespace signer entry covers: ${signerGaps.join(", ")}.`,
      recommendation:
        signerGaps.length === 0
          ? undefined
          : "Publish signer addresses for every supported network or its CAIP-2 namespace.",
    }),
  ];
}
