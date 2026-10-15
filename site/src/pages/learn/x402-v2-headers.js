// /learn/x402-v2-headers: field-level reference for the three x402 V2 HTTP headers.
// Examples are the official HTTP transport examples, re-encoded at build time with Settlens'
// own encoder (the output matches the specification byte for byte). The pitfalls table is
// computed at build time by running the pinned @x402/core schema and Settlens' offline checks.

import { getCheck } from "../../../../src/catalog.js";
import { MAX_HEADER_LENGTH, OFFICIAL_X402_CORE_VERSION } from "../../../../src/constants.js";
import { evaluatePaymentRequired } from "../../../../src/preflight.js";
import { encodeBase64Json, validateWithOfficialSdk } from "../../../../src/protocol.js";
import { SOURCES, ifPage } from "./_shared.js";

const CORE = "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md";
const HTTP = "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md";
const EXACT_EVM = "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md";
const RFC9110_FIELDS = "https://www.rfc-editor.org/rfc/rfc9110#section-5.1";

export const meta = {
  path: "/learn/x402-v2-headers",
  title: "PAYMENT-REQUIRED and x402 V2 headers explained",
  heading: "x402 V2 headers: PAYMENT-REQUIRED, PAYMENT-SIGNATURE and PAYMENT-RESPONSE",
  // Display-only H1 (meta.h1): non-breaking hyphens (U+2011) keep each header name on one line.
  h1: "x402 V2 headers: PAYMENT\u2011REQUIRED, PAYMENT\u2011SIGNATURE and PAYMENT\u2011RESPONSE",
  label: "x402 V2 headers",
  description:
    "Field-by-field guide to the x402 V2 headers: Base64 JSON encoding, PaymentRequired, PaymentPayload and SettleResponse, decoded examples and validation pitfalls.",
  lede: "x402 V2 carries every protocol message in three HTTP headers. This reference covers their encoding, every field, decoded examples from the specification and the mistakes that make a payment request unsafe to pay.",
  summary:
    "x402 V2 uses three HTTP headers, each a Base64-encoded JSON object: PAYMENT-REQUIRED (sent with 402, the PaymentRequired terms), PAYMENT-SIGNATURE (the client's PaymentPayload on the retry) and PAYMENT-RESPONSE (the settlement result). All protocol data travels in headers, not in the body.",
  sources: [SOURCES.x402Http, SOURCES.x402, SOURCES.exactEvm, SOURCES.rfc9110],
  section: "learn",
  order: 2,
  icon: "file",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "HTTP", "Reference"],
  related: ["/learn/what-is-x402", "/learn/x402-v1-to-v2-migration", "/learn/eip-3009"],
};

const RESOURCE_URL = "https://api.example.com/premium-data";
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const REQUIREMENT = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "10000",
  asset: ASSET,
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
};

// The PaymentRequired example of the V2 HTTP transport specification.
const PAYMENT_REQUIRED = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: { url: RESOURCE_URL, description: "Access to premium market data", mimeType: "application/json" },
  accepts: [REQUIREMENT],
};

// The PaymentPayload example of the same specification (a valid EIP-3009 signature, see /learn/eip-3009).
const PAYMENT_PAYLOAD = {
  x402Version: 2,
  resource: { url: RESOURCE_URL, description: "Access to premium market data", mimeType: "application/json" },
  accepted: REQUIREMENT,
  payload: {
    signature:
      "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    authorization: {
      from: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      to: PAY_TO,
      value: "10000",
      validAfter: "1740672089",
      validBefore: "1740672154",
      nonce: "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    },
  },
};

const SETTLE_OK = {
  success: true,
  transaction: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  network: "eip155:84532",
  payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
};

const SETTLE_FAIL = {
  success: false,
  errorReason: "insufficient_funds",
  transaction: "",
  network: "eip155:84532",
  payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
};

const pretty = (value) => JSON.stringify(value, null, 2);

// Variants of the example that implementations commonly get wrong.
function variant(change) {
  const copy = structuredClone(PAYMENT_REQUIRED);
  change(copy);
  return copy;
}

const PITFALLS = [
  ["Decimal amount", "amount: \"0.01\"", variant((o) => (o.accepts[0].amount = "0.01"))],
  ["Zero amount", "amount: \"0\"", variant((o) => (o.accepts[0].amount = "0"))],
  ["V1 network name", "network: \"base-sepolia\"", variant((o) => (o.accepts[0].network = "base-sepolia"))],
  ["Number as a string", "maxTimeoutSeconds: \"60\"", variant((o) => (o.accepts[0].maxTimeoutSeconds = "60"))],
  ["Role constant as recipient on EVM", "payTo: \"merchant\"", variant((o) => (o.accepts[0].payTo = "merchant"))],
  ["Relative resource URL", "resource.url: \"/premium-data\"", variant((o) => (o.resource.url = "/premium-data"))],
  ["Resource URL of another endpoint", "resource.url: \".../other-data\"", variant((o) => (o.resource.url = "https://api.example.com/other-data"))],
  ["Duplicate payment option", "accepts: [A, A]", variant((o) => o.accepts.push(structuredClone(o.accepts[0])))],
  ["One-day payment window", "maxTimeoutSeconds: 86400", variant((o) => (o.accepts[0].maxTimeoutSeconds = 86400))],
  ["V1 object in a V2 header", "x402Version: 1", { x402Version: 1, accepts: [{ scheme: "exact", network: "base-sepolia", maxAmountRequired: "10000", resource: RESOURCE_URL, description: "", payTo: PAY_TO, maxTimeoutSeconds: 60, asset: ASSET }] }],
  ["No EIP-712 domain hints", "extra omitted", variant((o) => delete o.accepts[0].extra)],
].map(([label, example, object]) => {
  const sdkAccepts = validateWithOfficialSdk(object).length === 0;
  // Protocol checks only: policy.* results depend on the caller's spending policy.
  const flagged = evaluatePaymentRequired({ paymentRequired: object, resourceUrl: RESOURCE_URL })
    .checks.filter((check) => check.status !== "pass" && !check.id.startsWith("policy."))
    .map((check) => ({ id: check.id, status: check.status }));
  return { label, example, sdkAccepts, flagged };
});

// Checks that read each header, rendered from the catalog so wording cannot drift.
const REQUIRED_CHECKS = [
  "transport.status_402",
  "transport.payment_required_header",
  "transport.payment_required_encoding",
  "schema.official_x402_sdk",
  "schema.payment_required",
  "binding.resource_url",
  "schema.payment_requirements",
  "schema.duplicate_requirements",
  "freshness.timeout_window",
  "stability.payment_requirements",
];
const SIGNATURE_CHECKS = ["security.invalid_signature_fail_closed", "transport.invalid_payment_status", "security.facilitator_rejects_invalid_signature"];

function check(id) {
  const entry = getCheck(id);
  if (!entry) throw new Error(`/learn/x402-v2-headers references unknown check id ${id}`);
  return entry;
}

const HEADERS_SVG = `<svg viewBox="0 0 720 280" width="720" height="280" xmlns="http://www.w3.org/2000/svg">
  <title>The three x402 V2 headers</title>
  <desc>The resource server sends PAYMENT-REQUIRED with a 402, the client retries with PAYMENT-SIGNATURE, and the server answers with PAYMENT-RESPONSE.</desc>
  <rect class="d-node" x="20" y="16" width="200" height="44" rx="10"/>
  <rect class="d-node d-node--accent" x="500" y="16" width="200" height="44" rx="10"/>
  <text class="d-title" x="120" y="43" text-anchor="middle">Client or agent</text>
  <text class="d-title" x="600" y="43" text-anchor="middle">Resource server</text>
  <path class="d-life" d="M120 60v208M600 60v208"/>
  <path class="d-msg d-msg--accent" d="M600 108H124"/><path class="d-head d-head--accent" d="M130 102l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="360" y="98" text-anchor="middle">HTTP 402 + PAYMENT-REQUIRED</text>
  <text class="d-text" x="360" y="128" text-anchor="middle">Base64 of PaymentRequired</text>
  <path class="d-msg" d="M120 172H596"/><path class="d-head" d="M590 166l8 6-8 6"/>
  <text class="d-label" x="360" y="162" text-anchor="middle">retry + PAYMENT-SIGNATURE</text>
  <text class="d-text" x="360" y="192" text-anchor="middle">Base64 of PaymentPayload</text>
  <path class="d-msg d-msg--accent" d="M600 236H124"/><path class="d-head d-head--accent" d="M130 230l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="360" y="226" text-anchor="middle">HTTP 200 + PAYMENT-RESPONSE</text>
  <text class="d-text" x="360" y="256" text-anchor="middle">Base64 of SettlementResponse</text>
</svg>`;

export default function render(ctx) {
  const { html, table, codeBlock, callout, diagram } = ctx;
  const headerValue = encodeBase64Json(PAYMENT_REQUIRED);
  return html`<p>The <a href="${HTTP}">x402 V2 HTTP transport</a> moves all protocol data into headers: the response body is left to the server. Each header value is a Base64-encoded JSON object. The object types themselves are defined in the <a href="${CORE}">V2 core specification</a>. If you are new to the flow, start with <a href="/learn/what-is-x402">What is x402?</a>.</p>

<h2 id="at-a-glance">The three headers at a glance</h2>
${table({
  caption: "x402 V2 HTTP headers",
  head: ["Header", "Direction", "Carries", "Sent with"],
  rows: [
    [html`<code>PAYMENT-REQUIRED</code>`, "Server to client", html`<code>PaymentRequired</code>`, "HTTP 402 when no valid payment is attached"],
    [html`<code>PAYMENT-SIGNATURE</code>`, "Client to server", html`<code>PaymentPayload</code>`, "The retried request"],
    [html`<code>PAYMENT-RESPONSE</code>`, "Server to client", html`<code>SettlementResponse</code>`, "The final response: 200 on success, 402 when settlement fails"],
  ],
  rowHeaders: true,
})}
${diagram({
  svg: HEADERS_SVG,
  label: "Diagram of the three x402 V2 headers between a client and a resource server: 402 with PAYMENT-REQUIRED, the retried request with PAYMENT-SIGNATURE, and the final response with PAYMENT-RESPONSE, each carrying a Base64-encoded JSON object.",
  caption: "Each header carries one Base64-encoded JSON object. The facilitator calls happen behind the resource server and use plain JSON bodies.",
})}

<h2 id="encoding">Encoding: Base64 JSON</h2>
<p>To read a header, Base64-decode the value and parse the result as UTF-8 JSON. To write one, serialize the object and Base64-encode it. A few practical points:</p>
<ul>
  <li>Header names are case-insensitive in HTTP (<a href="${RFC9110_FIELDS}">RFC 9110, section 5.1</a>). Some servers emit <code>payment-required</code> in lower case (the Settlens demo target does), so clients must match names case-insensitively.</li>
  <li>The specification examples use standard Base64 with padding. Settlens' decoder accepts the standard and URL-safe alphabets and refuses values longer than ${MAX_HEADER_LENGTH.toLocaleString("en-US")} characters.</li>
  <li>Do not rely on the response body. The transport says bodies are a server implementation concern; a V2 client reads the terms from the header.</li>
  <li>Large values can hit proxy and server header-size limits, so keep descriptions and extensions short.</li>
</ul>

<h2 id="payment-required">PAYMENT-REQUIRED</h2>
<p>Sent with HTTP 402 when a request carries no valid payment. It tells the client what the resource is and every way it can be paid.</p>
<h3 id="payment-required-fields">PaymentRequired fields</h3>
${table({
  caption: "PaymentRequired (x402 V2 core specification, section 5.1)",
  head: ["Field", "Type", "Required", "Meaning"],
  rows: [
    [html`<code>x402Version</code>`, "number", "Yes", "Protocol version. Must be 2."],
    [html`<code>error</code>`, "string", "No", "Human-readable reason payment is required."],
    [html`<code>resource</code>`, "object", "Yes", html`A <code>ResourceInfo</code> object describing the protected resource.`],
    [html`<code>accepts</code>`, "array", "Yes", "The payment options the server accepts. Each entry is a PaymentRequirements object."],
    [html`<code>extensions</code>`, "object", "No", html`Extension data keyed by extension identifier, each with <code>info</code> and <code>schema</code>.`],
  ],
  rowHeaders: true,
})}
<h3 id="accepts-fields">Payment requirements: each accepts entry</h3>
${table({
  caption: "PaymentRequirements (x402 V2 core specification, section 5.1.2)",
  head: ["Field", "Type", "Meaning"],
  rows: [
    [html`<code>scheme</code>`, "string", html`Payment scheme, for example <code>exact</code>.`],
    [html`<code>network</code>`, "string", html`<a href="/learn/glossary#caip-2">CAIP-2</a> network, <code>namespace:reference</code>, for example <code>eip155:84532</code>.`],
    [html`<code>amount</code>`, "string", html`Amount in the asset's <a href="/learn/glossary#atomic-units">atomic units</a>, as an integer string.`],
    [html`<code>asset</code>`, "string", "Token contract address, or an ISO 4217 currency code for fiat rails."],
    [html`<code>payTo</code>`, "string", "Recipient address, or a role constant such as \"merchant\"."],
    [html`<code>maxTimeoutSeconds</code>`, "number", "Maximum time allowed for payment completion."],
    [html`<code>extra</code>`, "object, optional", html`Scheme data. <code>assetTransferMethod</code> and <code>paymentFlow</code> are reserved protocol keys; for EIP-3009 tokens, <code>name</code> and <code>version</code> give the token's EIP-712 domain.`],
  ],
  rowHeaders: true,
})}
<h3 id="resource-info">ResourceInfo</h3>
<p><code>url</code> is required: it identifies the protected resource the payment is for. The optional fields are <code>description</code>, <code>mimeType</code>, <code>serviceName</code> (printable ASCII, at most 32 characters), <code>tags</code> (at most 5, each at most 32 characters) and <code>iconUrl</code> (absolute http or https URL, at most 2048 characters).</p>
<h3 id="payment-required-example">Decoded example</h3>
<p>The response below is the example from the HTTP transport specification. The header value was produced at build time by encoding the decoded object underneath; it matches the specification byte for byte.</p>
${codeBlock({ lang: "http", title: "402 response", code: `HTTP/1.1 402 Payment Required\nContent-Type: application/json\nPAYMENT-REQUIRED: ${headerValue}\n\n{}`, wrap: true })}
${codeBlock({ lang: "json", title: "PAYMENT-REQUIRED, decoded", code: pretty(PAYMENT_REQUIRED) })}
<p>Read it as: pay 10000 atomic units of the token at <code>0x036C…CF7e</code> on Base Sepolia (<code>eip155:84532</code>), whose EIP-712 domain name is USDC, to <code>0x2096…287C</code>, within 60 seconds, for <code>${RESOURCE_URL}</code>. With 6 decimals, as USDC has, that is 0.01.</p>
<h3 id="extensions">Extensions</h3>
<p>Servers advertise optional features in <code>extensions</code>, and clients echo them in their payload. A client must include at least the info it received: it may append information but cannot delete or overwrite it.</p>

<h2 id="payment-signature">PAYMENT-SIGNATURE</h2>
<p>Sent by the client on the retried request. It carries the payment authorization for exactly one of the advertised options.</p>
<h3 id="payment-payload-fields">PaymentPayload fields</h3>
${table({
  caption: "PaymentPayload (x402 V2 core specification, section 5.2)",
  head: ["Field", "Required", "Meaning"],
  rows: [
    [html`<code>x402Version</code>`, "Yes", "Protocol version."],
    [html`<code>resource</code>`, "No", html`The <code>ResourceInfo</code> of the resource being accessed.`],
    [html`<code>accepted</code>`, "Yes", html`The PaymentRequirements object the client chose from <code>accepts</code>.`],
    [html`<code>payload</code>`, "Yes", "Scheme-specific payment data."],
    [html`<code>extensions</code>`, "No", "Extension data echoed from the server."],
  ],
  rowHeaders: true,
})}
<p>For the <a href="${EXACT_EVM}"><code>exact</code> scheme on EVM chains</a> with the default EIP-3009 transfer method, <code>payload</code> holds a 65-byte EIP-712 <code>signature</code> and the <code>authorization</code> it signs: <code>from</code>, <code>to</code>, <code>value</code>, <code>validAfter</code>, <code>validBefore</code> and a 32-byte <code>nonce</code>. The <a href="/learn/eip-3009">EIP-3009 guide</a> explains each field and how the signature is built. Other transfer methods, such as Permit2, use a different payload shape.</p>
${codeBlock({ lang: "json", title: "PAYMENT-SIGNATURE, decoded", code: pretty(PAYMENT_PAYLOAD) })}
${callout({
  tone: "note",
  title: "Verify against your own terms",
  body: html`<p><code>accepted</code> is a copy written by the client. A resource server should check it against one of its own <code>accepts</code> entries and send <em>its own</em> requirement to the facilitator, so a client cannot lower the amount or change the recipient by editing the copy.</p>`,
})}

<h2 id="payment-response">PAYMENT-RESPONSE</h2>
<p>Sent by the server with the final response, after settlement. It carries a settlement response.</p>
${table({
  caption: "SettleResponse (x402 V2 core specification, section 5.3)",
  head: ["Field", "Required", "Meaning"],
  rows: [
    [html`<code>success</code>`, "Yes", "Whether settlement succeeded."],
    [html`<code>errorReason</code>`, "No", "Why settlement failed. Omitted on success."],
    [html`<code>payer</code>`, "No", "The payer's address."],
    [html`<code>transaction</code>`, "Yes", html`Transaction hash, or an empty string when nothing was broadcast. Must be non-empty with <code>settlement_pending</code>.`],
    [html`<code>network</code>`, "Yes", "CAIP-2 network of the settlement."],
    [html`<code>amount</code>`, "No", "Amount actually settled, in atomic units, when applicable."],
    [html`<code>extensions</code>`, "No", "Extension data."],
  ],
  rowHeaders: true,
})}
${codeBlock({ lang: "json", title: "PAYMENT-RESPONSE with HTTP 200, decoded", code: pretty(SETTLE_OK) })}
${codeBlock({ lang: "json", title: "PAYMENT-RESPONSE with HTTP 402, decoded", code: pretty(SETTLE_FAIL) })}
<p><a href="/learn/glossary#settlement-pending"><code>settlement_pending</code></a> is the one non-terminal error: the transaction was broadcast but its confirmation could not be established. The caller should reconcile on chain with the returned hash before deciding whether to retry. Every value of <code>errorReason</code> is listed in the <a href="/learn/x402-error-codes">x402 error codes reference</a>.</p>

<h2 id="status-codes">Status codes</h2>
${table({
  caption: "x402 errors mapped to HTTP status codes (V2 HTTP transport)",
  head: ["Situation", "HTTP status"],
  rows: [
    ["Payment required", "402"],
    ["Invalid payment: malformed payload or requirements", "400"],
    ["Payment failed: verification or settlement failed", "402"],
    ["Server error during payment processing", "500"],
    ["Payment verified and settled", "200"],
  ],
  rowHeaders: true,
  numeric: [1],
})}

<h2 id="validation-pitfalls">Validation pitfalls</h2>
<p>The official schema in <code>@x402/core</code> ${OFFICIAL_X402_CORE_VERSION} checks types and required fields, and is permissive about values. The table below was computed when this page was built: each row changes one field of the example above (the V1 row replaces the whole object), then runs the pinned SDK schema and Settlens' offline checks against it, with <code>${RESOURCE_URL}</code> as the requested URL.</p>
${table({
  caption: `Malformed PAYMENT-REQUIRED variants: @x402/core ${OFFICIAL_X402_CORE_VERSION} schema versus Settlens protocol checks`,
  head: ["Pitfall", "SDK schema", "Settlens checks that fail or warn"],
  rows: PITFALLS.map((row) => [
    html`${row.label}<br><code>${row.example}</code>`,
    row.sdkAccepts ? "Accepts" : "Rejects",
    row.flagged.length ? html`${row.flagged.map((entry, index) => html`${index ? html`<br>` : ""}<code>${entry.id}</code> ${entry.status}`)}` : "None",
  ]),
  rowHeaders: true,
})}
<p>Three rows deserve a comment:</p>
<ul>
  <li><strong>Role constants.</strong> The core specification allows <code>payTo</code> to be a role constant such as "merchant". On <code>eip155</code> networks Settlens requires a 20-byte address, because the <code>to</code> field of an EIP-3009 authorization is an address.</li>
  <li><strong>V1 objects.</strong> The SDK schema accepts both protocol versions, so a V1 object passes it. A V2 header must carry <code>x402Version: 2</code>, which Settlens checks separately. The <a href="/learn/x402-v1-to-v2-migration">V1 to V2 migration guide</a> maps every renamed field.</li>
  <li><strong>Missing <code>extra</code>.</strong> No scan check fails, yet the <a href="${EXACT_EVM}">exact EVM specification</a> makes <code>extra.name</code> and <code>extra.version</code> required for EIP-3009: a client cannot build the signature without the token's EIP-712 name and version, and Settlens' offline <code>verify-payment</code> refuses to verify without them.</li>
</ul>

<h2 id="how-settlens-checks">How Settlens checks each header</h2>
<h3 id="checks-payment-required">PAYMENT-REQUIRED</h3>
<p>A passive scan sends the request without any payment header and runs these checks on the answer. The same content checks run offline when an agent passes the header to the MCP tool <code>evaluate_payment_requirements</code>.</p>
${table({
  caption: "Settlens checks that read PAYMENT-REQUIRED",
  head: ["Check id", "What it verifies"],
  rows: REQUIRED_CHECKS.map((id) => [html`<code>${id}</code>`, check(id).verifies]),
})}
<h3 id="checks-payment-signature">PAYMENT-SIGNATURE</h3>
<p>Passive scans never send this header, and Settlens refuses a user-supplied one. With the endpoint owner's authorization, the <a href="/learn/glossary#active-probe">active probe</a> sends one intentionally invalid value:</p>
${table({
  caption: "Settlens checks behind the authorized active probe",
  head: ["Check id", "What it verifies"],
  rows: SIGNATURE_CHECKS.map((id) => [html`<code>${id}</code>`, check(id).verifies]),
})}
<p>Separately, a captured authorization can be verified offline: the CLI's <code>verify-payment</code> reads a JSON file with the requirement and the payload (the same <code>paymentRequirements</code> and <code>paymentPayload</code> pair a server sends to <code>/verify</code> also works), and the MCP tool <code>verify_payment_signature</code> accepts the raw header value.</p>
<h3 id="checks-payment-response">PAYMENT-RESPONSE</h3>
<p>Settlens does not inspect <code>PAYMENT-RESPONSE</code>. It never completes a payment and never calls <code>/settle</code>, so an endpoint that behaves correctly never sends one to a scan.</p>
<p>Every check id, with its severity and remediation, is listed in the <a href="/docs/checks">check reference</a>. To run them against your own endpoint, see <a href="/product/assess">Assess</a> or the <a href="/docs/cli">CLI reference</a>.${ifPage(ctx, "/tools/x402-checker", html` To decode and check a single header in your browser, paste it into the <a href="/tools/x402-checker">x402 payment request checker</a>.`)}</p>`;
}
