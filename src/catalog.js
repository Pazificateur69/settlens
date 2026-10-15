/* Catalog of every check id Settlens can emit.
 *
 * Plain strings only: the website renders /docs/checks from this module and the
 * MCP server serves it as settlens://checks. test/catalog.test.js fails when an
 * id emitted anywhere in src/ is missing here, or when an entry here is never
 * emitted.
 */

const X402_CORE = "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md";
const X402_HTTP = "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md";

const CORE = { spec: "x402 V2 core specification", specUrl: X402_CORE };
const HTTP = { spec: "x402 V2 HTTP transport", specUrl: X402_HTTP };
const NONE = { spec: "", specUrl: "" };

export const CHECK_MODES = Object.freeze({
  passive:
    "Needs a live, unauthenticated request to the paid resource (settlens scan, settlens monitor, MCP scan_endpoint). Never sends a payment.",
  offline:
    "Evaluated from the PaymentRequired content alone: runs offline in the MCP tool evaluate_payment_requirements and in every passive scan (policy.acceptable_option only in the agent tools).",
  active:
    "Runs only with --active --authorized --authorization-ref: one intentionally invalid PAYMENT-SIGNATURE is sent. /settle is never called and no wallet or key is used.",
  facilitator:
    "Reads a facilitator's GET /supported capabilities (settlens facilitator, scan --facilitator, MCP scan_facilitator).",
});

function entry(id, mode, severity, title, verifies, why, fix, reference = NONE) {
  return Object.freeze({
    id,
    title,
    category: id.split(".")[0],
    mode,
    severity,
    verifies,
    why,
    fix,
    spec: reference.spec,
    specUrl: reference.specUrl,
  });
}

export const CHECK_CATALOG = Object.freeze([
  entry(
    "transport.reachable",
    "passive",
    "high",
    "Endpoint is reachable",
    "Settlens received an HTTP response from the target URL within the timeout (8000 ms by default). Redirects are not followed.",
    "Every other passive check depends on observing the real response. A failure usually means a DNS, TLS, firewall or URL problem, or an endpoint that is down while agents try to pay it.",
    "Confirm DNS, TLS, firewall rules and the configured endpoint URL.",
  ),
  entry(
    "transport.status_402",
    "passive",
    "high",
    "Unauthenticated request requires payment",
    "A request without any payment header returns HTTP 402 Payment Required.",
    "x402 signals that payment is needed with HTTP 402. Any other status means the resource is either served for free or not speaking x402, so a paying agent cannot trust the challenge.",
    "Protect the resource before executing business logic and return HTTP 402 when no valid payment is attached.",
    HTTP,
  ),
  entry(
    "transport.payment_required_header",
    "passive",
    "high",
    "PAYMENT-REQUIRED header is present",
    "The 402 response carries the PAYMENT-REQUIRED header defined by the x402 V2 HTTP transport.",
    "Clients read the payment terms from this header. Without it an agent has no machine-readable terms to evaluate.",
    "Return the Base64-encoded PaymentRequired object in the PAYMENT-REQUIRED header.",
    HTTP,
  ),
  entry(
    "transport.payment_required_encoding",
    "offline",
    "high",
    "PAYMENT-REQUIRED decodes as Base64 JSON",
    "The PAYMENT-REQUIRED value is at most 131072 characters, uses only Base64 or Base64URL characters and decodes to valid JSON nested at most 64 levels deep.",
    "A value that cannot be decoded cannot be validated or bound to a payment; clients either fail or interpret it inconsistently.",
    "Base64-encode a valid PaymentRequired JSON object in the PAYMENT-REQUIRED header.",
    HTTP,
  ),
  entry(
    "transport.response_body_limit",
    "passive",
    "medium",
    "Response body stays within the evidence limit",
    "The 402 response body fits within the 1 MiB processing limit. Settlens stops reading at the limit.",
    "Payment challenges should be small. A very large challenge body wastes agent bandwidth and can mean protected content is returned before payment.",
    "Keep payment challenge responses small and return protected content only after verified payment.",
  ),
  entry(
    "transport.https",
    "passive",
    "medium",
    "Transport protects payment metadata",
    "The endpoint URL uses HTTPS. Plain HTTP is accepted only for loopback hosts (localhost, 127.0.0.1, ::1) used in local testing.",
    "Over plaintext HTTP a network attacker can rewrite the payment terms, for example the payTo recipient or the amount, before the agent signs.",
    "Serve production payment endpoints exclusively over HTTPS.",
  ),
  entry(
    "transport.redirect",
    "passive",
    "medium",
    "Payment endpoint does not redirect unexpectedly",
    "Reported as a warning when the endpoint answers with a 3xx redirect. Settlens never follows redirects and records the sanitized Location instead.",
    "A redirect moves the payment challenge away from the URL that was assessed, which weakens the binding between the payment and the resource.",
    "Expose the canonical paid resource directly or explicitly include the redirected URL in the assessment scope.",
  ),
  entry(
    "schema.official_x402_sdk",
    "offline",
    "high",
    "Official x402 SDK accepts PaymentRequired",
    "The decoded PaymentRequired object passes the parsePaymentRequired schema of the pinned official @x402/core 2.28.0 SDK.",
    "Clients built on the official SDK reject objects that fail this schema, so agents either cannot pay or disagree about the terms.",
    "Align the emitted object with the current official @x402/core V2 schema.",
    CORE,
  ),
  entry(
    "schema.payment_required",
    "offline",
    "high",
    "PaymentRequired matches the x402 V2 core shape",
    "x402Version equals 2, resource is an object whose url is an absolute http(s) URL, and accepts is a non-empty array.",
    "These are the fields every V2 client needs to bind a payment to a resource and to choose a payment option. When they are missing, the remaining content checks cannot run.",
    "Emit x402Version 2, a valid resource object and at least one accepted payment requirement.",
    CORE,
  ),
  entry(
    "binding.resource_url",
    "offline",
    "high",
    "Payment requirement is bound to the requested resource",
    "resource.url equals the URL that was requested, including path and query (the fragment is ignored). In evaluate_payment_requirements this check is a warning when no resource URL is supplied, because the binding cannot be confirmed.",
    "When the advertised resource differs from the requested one, a payment can be steered to, or reused for, a different resource than the one the agent asked for.",
    "Bind the payment requirement to the exact canonical resource URL, including its path and relevant query.",
    CORE,
  ),
  entry(
    "schema.payment_requirements",
    "offline",
    "high",
    "Accepted payment requirements are well formed",
    "Every accepts entry has a non-empty scheme, a CAIP-2 network, a positive integer atomic amount, a non-empty asset and payTo, and a positive maxTimeoutSeconds. On eip155 networks payTo must be a 20-byte hex address.",
    "Malformed amounts, networks or recipients make it impossible to know what is being paid, to whom and on which chain.",
    "Correct invalid scheme, network, amount, asset, payTo or timeout fields before accepting payments.",
    CORE,
  ),
  entry(
    "schema.duplicate_requirements",
    "offline",
    "low",
    "Payment choices are unambiguous",
    "No two accepts entries are identical.",
    "Duplicate choices make client selection non-deterministic and usually reveal a configuration error.",
    "Remove duplicate payment choices to avoid inconsistent client selection.",
  ),
  entry(
    "freshness.timeout_window",
    "offline",
    "medium",
    "Authorization windows are reasonably bounded",
    "Every maxTimeoutSeconds value is at most 3600 seconds (one hour).",
    "A long authorization window keeps a signed payment usable for longer, which increases replay and misuse exposure.",
    "Use the shortest authorization window compatible with settlement to reduce replay exposure.",
    CORE,
  ),
  entry(
    "policy.scheme",
    "offline",
    "high",
    "Schemes match the local policy",
    "Every advertised scheme is in the policy's allowed schemes (case-insensitive). Evaluated only when a scheme policy is set. In the agent tools (evaluate_payment_requirements, scan_endpoint) it summarizes the options instead: pass when every option complies, warn when some do not, fail when none does; the decision then rests on policy.acceptable_option.",
    "Restricting schemes keeps the agent on payment flows it knows how to verify.",
    "Restore the approved schemes or update the reviewed Settlens policy intentionally.",
  ),
  entry(
    "policy.network",
    "offline",
    "high",
    "Networks match the local policy",
    "Every advertised CAIP-2 network is in the policy's allowed networks (case-insensitive). Evaluated only when a network policy is set. In the agent tools (evaluate_payment_requirements, scan_endpoint) it summarizes the options instead: pass when every option complies, warn when some do not, fail when none does; the decision then rests on policy.acceptable_option.",
    "Paying on an unexpected chain, for example a testnet instead of mainnet, means paying with the wrong funds or to a merchant that cannot receive them.",
    "Restore the approved networks or update the reviewed Settlens policy intentionally.",
  ),
  entry(
    "policy.recipient",
    "offline",
    "high",
    "Recipients match the local policy",
    "Every advertised payTo is in the policy's allowed recipients (EVM hex addresses case-insensitively, other formats such as Solana base58 exactly). Evaluated only when a recipient policy is set. In the agent tools (evaluate_payment_requirements, scan_endpoint) it summarizes the options instead: pass when every option complies, warn when some do not, fail when none does; the decision then rests on policy.acceptable_option.",
    "A changed recipient is the most direct way to divert payments. An allowlist keeps the agent paying only reviewed merchants.",
    "Restore the approved payTo or update the reviewed Settlens policy intentionally.",
  ),
  entry(
    "policy.asset",
    "offline",
    "high",
    "Assets match the local policy",
    "Every advertised asset (token contract address or mint) is in the policy's allowed assets (EVM hex addresses case-insensitively, other formats such as Solana mints exactly). Evaluated only when an asset policy is set. In the agent tools (evaluate_payment_requirements, scan_endpoint) it summarizes the options instead: pass when every option complies, warn when some do not, fail when none does; the decision then rests on policy.acceptable_option.",
    "The amount is counted in the asset's atomic units: without an asset allowlist, a ceiling meant for USDC can be spent in another token, and a look-alike token can be substituted for the one you reviewed.",
    "Restore the approved assets or update the reviewed Settlens policy intentionally.",
  ),
  entry(
    "policy.maximum_amount",
    "offline",
    "high",
    "Amounts stay within the approved ceiling",
    "Every advertised atomic amount is at most the policy's maxAmount. Amounts are compared in atomic units, so pair maxAmount with an asset policy. Evaluated only when maxAmount is set. In the agent tools (evaluate_payment_requirements, scan_endpoint) it summarizes the options instead: pass when every option complies, warn when some do not, fail when none does; the decision then rests on policy.acceptable_option.",
    "A spending ceiling bounds what an agent can lose to a price change, a misconfiguration or a malicious server.",
    "Correct the advertised price or intentionally review and update the approved ceiling.",
  ),
  entry(
    "policy.acceptable_option",
    "offline",
    "high",
    "At least one payment option satisfies the policy",
    "Agent tools only (evaluate_payment_requirements, scan_endpoint): at least one advertised payment option is well formed and satisfies every policy constraint provided (schemes, networks, pay_to, assets, max_amount). The message counts the rejected options by constraint. The options that pass are returned as acceptable.",
    "An agent pays with one option. One option outside the policy must not block the others, but when none is acceptable the agent has nothing safe to pay with.",
    "Do not pay. Ask the merchant for terms within your policy or change the policy deliberately.",
  ),
  entry(
    "stability.payment_requirements",
    "passive",
    "medium",
    "Payment requirements remain stable",
    "Repeated identical unauthenticated requests (2 by default) return the same resource, accepts and extensions, ignoring the known ephemeral fields recentBlockhash and lastValidBlockHeight. Skipped when only one sample is available.",
    "Terms that change between identical requests can reveal unintended dynamic pricing, recipient rotation or tampering.",
    "Confirm that dynamic pricing or recipient selection is intentional and cryptographically bound to the requested resource.",
  ),
  entry(
    "security.invalid_signature_fail_closed",
    "active",
    "critical",
    "Invalid payment authorization is denied",
    "With explicit authorization, Settlens sends one intentionally invalid PAYMENT-SIGNATURE (for example an all-zero EVM signature) and expects the resource not to answer with a 2xx status.",
    "A resource that serves content for an invalid signature is a payment bypass: anyone can obtain it without paying.",
    "Block resource execution unless cryptographic verification and settlement succeed. Treat this as a potential payment bypass.",
    HTTP,
  ),
  entry(
    "transport.invalid_payment_status",
    "active",
    "medium",
    "Invalid payment uses a standard failure status",
    "The response to the intentionally invalid payment is HTTP 400 or 402.",
    "Clients rely on the x402 error mapping to tell malformed payment data (400) from failed verification or settlement (402).",
    "Return HTTP 400 for malformed payment data or HTTP 402 when verification/settlement fails.",
    HTTP,
  ),
  entry(
    "safety.active_authorization",
    "active",
    "high",
    "Active probe has explicit authorization",
    "An active probe was requested together with the owner-authorization confirmation and a non-empty authorization reference. Otherwise no probe is sent and this check fails.",
    "Active testing sends traffic the endpoint owner must approve. Settlens refuses to probe without a traceable approval.",
    "Supply --authorized and --authorization-ref with the owner-approved ticket, email or scope identifier.",
  ),
  entry(
    "facilitator.reachable",
    "facilitator",
    "high",
    "Facilitator /supported is reachable",
    "GET <facilitator>/supported returned an HTTP response within the timeout. Redirects are not followed.",
    "If the facilitator cannot be reached, payments cannot be verified or settled.",
    "Confirm the facilitator base URL, authentication and network access.",
  ),
  entry(
    "facilitator.response_body_limit",
    "facilitator",
    "high",
    "Facilitator capability response fits the evidence limit",
    "The /supported response is at most 1 MiB.",
    "Capability metadata should be small; an oversized response is truncated and cannot be validated.",
    "Reduce /supported to the minimum standardized capability metadata.",
  ),
  entry(
    "facilitator.supported_status",
    "facilitator",
    "high",
    "Facilitator exposes capabilities successfully",
    "GET /supported returned HTTP 200.",
    "Resource servers and clients use /supported to discover which schemes and networks a facilitator can verify and settle.",
    "Expose the standardized GET /supported endpoint and return HTTP 200.",
    CORE,
  ),
  entry(
    "facilitator.content_type",
    "facilitator",
    "medium",
    "Facilitator capabilities use a JSON media type",
    "The /supported Content-Type is application/json or another +json media type.",
    "Strict clients refuse to parse capability data served with a non-JSON media type.",
    "Return /supported with Content-Type application/json.",
  ),
  entry(
    "facilitator.https",
    "facilitator",
    "medium",
    "Facilitator capability transport is protected",
    "The facilitator URL uses HTTPS, or loopback HTTP for local testing.",
    "Facilitator traffic carries payment payloads and verification results; over plaintext a network attacker can forge them.",
    "Serve facilitator APIs exclusively over HTTPS.",
  ),
  entry(
    "facilitator.supported_schema",
    "facilitator",
    "high",
    "SupportedResponse matches the x402 core shape",
    "The body has a non-empty kinds array (each with a positive integer x402Version, a scheme and a network, CAIP-2 for V2 kinds), an extensions array of strings and a signers object mapping networks to string arrays.",
    "Malformed capability data makes coverage and signer checks impossible and breaks clients that rely on it.",
    "Return kinds, extensions and signers using the standardized SupportedResponse shape.",
    CORE,
  ),
  entry(
    "facilitator.v2_capability",
    "facilitator",
    "high",
    "Facilitator advertises x402 V2 capabilities",
    "At least one supported kind has x402Version 2.",
    "A facilitator without V2 kinds cannot verify or settle x402 V2 payments.",
    "Register at least one x402 V2 scheme/network implementation.",
    CORE,
  ),
  entry(
    "facilitator.duplicate_kinds",
    "facilitator",
    "low",
    "Facilitator capabilities are unambiguous",
    "No x402Version, scheme and network combination appears twice in kinds.",
    "Duplicate capability entries usually reveal a configuration error and make capability discovery ambiguous.",
    "Remove duplicate kinds from /supported.",
  ),
  entry(
    "facilitator.requirement_coverage",
    "facilitator",
    "high",
    "Facilitator covers advertised payment requirements",
    "Every scheme/network pair advertised by the resource appears in the facilitator's /supported kinds for the same x402Version. Skipped when /supported is invalid or unavailable.",
    "If the facilitator does not support an advertised option, an agent may sign a payment that can never be verified or settled.",
    "Remove unsupported requirements or register their scheme/network implementation with the selected facilitator.",
  ),
  entry(
    "facilitator.signer_coverage",
    "facilitator",
    "medium",
    "Facilitator publishes signer coverage",
    "Every advertised network has a non-empty signer list in /supported, either for the exact network or for its namespace wildcard (for example eip155:*).",
    "Signer metadata tells clients and auditors which addresses settle payments on each network.",
    "Publish signer addresses for every supported network or its CAIP-2 namespace.",
  ),
  entry(
    "facilitator.verify_reachable",
    "active",
    "medium",
    "Facilitator /verify is reachable",
    "During an authorized active probe, POST <facilitator>/verify with the intentionally invalid payload completed. Reported as a warning only when it could not complete.",
    "Without a /verify answer, Settlens cannot show that the facilitator rejects invalid signatures.",
    "Re-run the authorized probe when the facilitator /verify endpoint is reachable.",
  ),
  entry(
    "facilitator.verify_response_schema",
    "active",
    "high",
    "Facilitator /verify returns a conformant VerifyResponse",
    "The /verify answer to the intentionally invalid payload is a JSON object with a boolean isValid field.",
    "Resource servers decide whether to serve content from isValid; a non-standard answer risks being misread as success.",
    "Return the standardized x402 VerifyResponse: { isValid, invalidReason?, payer? }.",
    CORE,
  ),
  entry(
    "security.facilitator_rejects_invalid_signature",
    "active",
    "critical",
    "Facilitator /verify rejects an invalid signature",
    "/verify returns isValid=false for the intentionally invalid, all-zero signature. Settlens never calls /settle.",
    "A facilitator that accepts a forged signature lets anyone obtain paid resources without paying: a critical verification bypass.",
    "Cryptographically verify the payment signature before returning isValid. Treat isValid=true for a zero signature as a critical verification bypass.",
    CORE,
  ),
]);

const BY_ID = new Map(CHECK_CATALOG.map((check) => [check.id, check]));

export const CHECK_CATEGORIES = Object.freeze([
  ...new Set(CHECK_CATALOG.map(({ category }) => category)),
]);

export function getCheck(id) {
  return BY_ID.get(id) ?? null;
}

export function checkMarkdown(check) {
  const lines = [
    `# ${check.title}`,
    "",
    `\`${check.id}\` · category ${check.category} · mode ${check.mode} · default severity ${check.severity}`,
    "",
    "## What it verifies",
    "",
    check.verifies,
    "",
    "## Why it matters",
    "",
    check.why,
    "",
    "## How to fix",
    "",
    check.fix,
  ];
  if (check.specUrl) {
    lines.push("", "## Specification", "", `[${check.spec}](${check.specUrl})`);
  }
  return `${lines.join("\n")}\n`;
}
