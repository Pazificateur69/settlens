// /learn/what-is-x402: pillar explainer. Protocol statements follow the x402 V2 specs
// (core + HTTP transport, fetched 2026-10-13); CLI transcripts are real output of the demo target.

import { SOURCES, versionRows } from "./_shared.js";

const CORE = "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md";
const HTTP = "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md";
const HTTP_V1 = "https://github.com/x402-foundation/x402/blob/main/specs/transports-v1/http.md";
const EXACT = "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact.md";
const SCHEMES = "https://github.com/x402-foundation/x402/tree/main/specs/schemes";
const CAIP2 = "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md";
const RFC9110_402 = "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.3";

export const meta = {
  path: "/learn/what-is-x402",
  title: "What is x402? HTTP 402 payments explained",
  heading: "What is x402?",
  label: "What is x402?",
  description:
    "x402 turns HTTP 402 into a machine-readable payment handshake. Learn the roles, the V2 flow step by step, schemes, CAIP-2 networks and common failure modes.",
  lede: "x402 is an open payment standard that lets any HTTP client, including an AI agent, pay for a resource within ordinary HTTP requests. This guide walks through the roles, the V2 handshake, schemes and networks, and where implementations break.",
  summary:
    "x402 is an open payment standard that gives HTTP 402 a meaning: the server answers with machine-readable terms in a PAYMENT-REQUIRED header, the client retries with a signed PAYMENT-SIGNATURE, and a facilitator verifies and settles the payment on a network such as Base or Solana.",
  sources: [SOURCES.x402, SOURCES.x402Http, SOURCES.x402HttpV1, SOURCES.exact, SOURCES.caip2, SOURCES.rfc9110],
  section: "learn",
  order: 1,
  icon: "book",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "Protocol", "Agentic payments"],
  related: ["/learn/x402-v2-headers", "/learn/x402-v1-to-v2-migration", "/learn/x402-security-checklist"],
};

// Sequence diagram geometry: lifeline x positions.
const C = 70;
const R = 310;
const F = 510;
const B = 650;

function arrow(from, to, y, label, tone = "") {
  const right = to > from;
  const end = right ? to - 4 : to + 4;
  const head = right ? `M${to - 10} ${y - 6}l8 6-8 6` : `M${to + 10} ${y - 6}l-8 6 8 6`;
  const msg = tone ? ` d-msg--${tone}` : "";
  const headTone = tone ? ` d-head--${tone}` : "";
  const labelTone = tone === "accent" ? " d-label--accent" : "";
  return `<path class="d-msg${msg}" d="M${from} ${y}H${end}"/><path class="d-head${headTone}" d="${head}"/>
  <text class="d-label${labelTone}" x="${(from + to) / 2}" y="${y - 9}" text-anchor="middle">${label}</text>`;
}

const HANDSHAKE_SVG = `<svg viewBox="0 0 720 556" width="720" height="556" xmlns="http://www.w3.org/2000/svg">
  <title>x402 V2 handshake, authorization flow</title>
  <desc>Sequence between client, resource server, facilitator and blockchain, from the first request to the 200 response with PAYMENT-RESPONSE.</desc>
  <rect class="d-node" x="4" y="16" width="132" height="44" rx="10"/>
  <rect class="d-node d-node--accent" x="236" y="16" width="148" height="44" rx="10"/>
  <rect class="d-node" x="445" y="16" width="130" height="44" rx="10"/>
  <rect class="d-node" x="592" y="16" width="116" height="44" rx="10"/>
  <text class="d-title" x="${C}" y="43" text-anchor="middle">Client or agent</text>
  <text class="d-title" x="${R}" y="43" text-anchor="middle">Resource server</text>
  <text class="d-title" x="${F}" y="43" text-anchor="middle">Facilitator</text>
  <text class="d-title" x="${B}" y="43" text-anchor="middle">Blockchain</text>
  <path class="d-life" d="M${C} 60v484M${R} 60v484M${F} 60v484M${B} 60v484"/>
  ${arrow(C, R, 104, "1. GET /resource")}
  ${arrow(R, C, 148, "2. 402 + PAYMENT-REQUIRED", "accent")}
  <text class="d-note" x="${C + 12}" y="180">3. Choose an accepts entry</text>
  <text class="d-note" x="${C + 28}" y="198">and sign the authorization</text>
  ${arrow(C, R, 236, "4. retry + PAYMENT-SIGNATURE")}
  ${arrow(R, F, 278, "5. POST /verify")}
  ${arrow(F, R, 320, "6. VerifyResponse")}
  <text class="d-note d-note--blue" x="${R + 12}" y="356">7. Resource executes</text>
  ${arrow(R, F, 392, "8. POST /settle")}
  ${arrow(F, B, 432, "9. broadcast tx")}
  ${arrow(F, R, 472, "10. SettleResponse")}
  ${arrow(R, C, 516, "11. 200 + PAYMENT-RESPONSE", "accent")}
</svg>`;

const SCAN_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure --no-write" },
  { kind: "out", text: "Settlens x402 assessment e78d70a9" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "pass", text: "13 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 13 pass · 0 fail · 0 warn · 0 skip" },
];

const BYPASS_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-002 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 54ae4bc7" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/bypass" },
  { kind: "out", text: "13 pass · 1 fail · 1 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Invalid payment authorization is denied" },
  { kind: "muted", text: "       The endpoint returned HTTP 200 after an invalid payment authorization." },
  { kind: "warn", text: "  WARN medium   Invalid payment uses a standard failure status" },
  { kind: "muted", text: "       Expected HTTP 400 or 402 for invalid payment, received HTTP 200." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 13 pass · 1 fail · 1 warn · 0 skip" },
];

export default function render(ctx) {
  const { html, diagram, table, comparisonTable, callout, terminal, faq } = ctx;
  return html`<p>HTTP defines a <code>402 Payment Required</code> status code, but <a href="${RFC9110_402}">RFC 9110</a> still lists it as reserved for future use, with no standard semantics. x402 supplies them: the server answers 402 with machine-readable payment terms, the client pays by signing an authorization and retries, and the server returns the resource once the payment is verified and settled. The <a href="${CORE}">x402 V2 core specification</a> defines the data types and the facilitator API; the <a href="${HTTP}">V2 HTTP transport</a> defines how they travel in headers.</p>
<p>Because the terms are structured data rather than a checkout page, software can read and act on them. That is what makes x402 a fit for <a href="/learn/glossary#agentic-payment">agentic payments</a>, where an AI agent pays per request for an API, a dataset or a tool, with no human filling in a form.</p>

<h2 id="roles">The three roles</h2>
<p>The specification names three components. A single company can play more than one role, for example a resource server that hosts its own facilitator endpoints.</p>
${table({
  caption: "x402 roles",
  head: ["Role", "What it does", "What it exchanges"],
  rows: [
    [html`<a href="/learn/glossary#client">Client</a>`, "Any application or agent that requests a protected resource and pays for it.", html`Reads <code>PAYMENT-REQUIRED</code>, sends <code>PAYMENT-SIGNATURE</code>.`],
    [html`<a href="/learn/glossary#resource-server">Resource server</a>`, "The service that requires payment for an API, content or data.", html`Answers 402, calls the facilitator, returns <code>PAYMENT-RESPONSE</code>.`],
    [html`<a href="/learn/glossary#facilitator">Facilitator</a>`, "Verifies payment authorizations and settles them on a network. Resource servers can delegate this or host the endpoints themselves.", html`<code>POST /verify</code>, <code>POST /settle</code>, <code>GET /supported</code>.`],
  ],
  rowHeaders: true,
})}

<h2 id="handshake">The handshake, step by step</h2>
<p>The default payment flow in V2 is called <code>authorization</code>: the payment is verified before the resource runs and settled after it succeeds. The numbers in the diagram match the list below.</p>
${diagram({
  svg: HANDSHAKE_SVG,
  label: "Sequence diagram of the x402 V2 authorization flow: the client requests the resource and receives 402 with PAYMENT-REQUIRED, signs and retries with PAYMENT-SIGNATURE; the resource server calls the facilitator's /verify, runs the resource, calls /settle, the facilitator broadcasts the transaction, and the server returns 200 with PAYMENT-RESPONSE.",
  caption: "The x402 V2 authorization flow over HTTP. Other flows reorder verify, settle and execution (see the next section).",
  size: "wide",
})}
<ol>
  <li><strong>Request.</strong> The client calls the resource without any payment header.</li>
  <li><strong>Payment required.</strong> The server answers <code>402</code> and puts a Base64-encoded <code>PaymentRequired</code> object in the <a href="/learn/glossary#payment-required"><code>PAYMENT-REQUIRED</code></a> header. It holds <code>x402Version</code>, a <code>resource</code> object describing what is sold, and an <code>accepts</code> array of payment options.</li>
  <li><strong>Choose and sign.</strong> The client picks one entry of <code>accepts</code> (a scheme, network, asset, amount and recipient) and builds the scheme-specific payload. For the <code>exact</code> scheme on EVM chains this is usually an <a href="/learn/eip-3009">EIP-3009</a> authorization signed with EIP-712.</li>
  <li><strong>Retry with payment.</strong> The client repeats the request with a Base64-encoded <code>PaymentPayload</code> in the <code>PAYMENT-SIGNATURE</code> header. The payload echoes the chosen option in its <code>accepted</code> field.</li>
  <li><strong>Verify.</strong> The resource server sends the payload and the payment requirements to the facilitator's <code>POST /verify</code>. Verification is read-only: it must not commit payment state.</li>
  <li><strong>Verification result.</strong> The facilitator answers with a <code>VerifyResponse</code>: <code>isValid</code>, and an <code>invalidReason</code> when it is false (one of the <a href="/learn/x402-error-codes">x402 error codes</a>).</li>
  <li><strong>Execute.</strong> Only after a successful verification does the server run the protected handler.</li>
  <li><strong>Settle.</strong> The server calls <code>POST /settle</code> with a request of the same structure as the <code>/verify</code> call.</li>
  <li><strong>Broadcast.</strong> The facilitator commits the payment, typically by submitting a transaction to the network.</li>
  <li><strong>Settlement result.</strong> The facilitator returns a <code>SettleResponse</code> with <code>success</code>, the <code>transaction</code> hash and the <code>network</code>.</li>
  <li><strong>Deliver.</strong> The server returns the resource with a Base64-encoded settlement response in the <code>PAYMENT-RESPONSE</code> header.</li>
</ol>
<p>The exact header encodings, every field and decoded examples are on the <a href="/learn/x402-v2-headers">x402 V2 headers</a> page.</p>

<h2 id="payment-flows">Payment flows: when the money moves</h2>
<p>V2 separates <em>how</em> value moves (the <a href="/learn/glossary#asset-transfer-method">asset transfer method</a>) from <em>when</em> it moves relative to the handler (the <a href="/learn/glossary#payment-flow">payment flow</a>). A payment option declares its flow in <code>extra.paymentFlow</code>; omitting it means the mechanism's default.</p>
${table({
  caption: "Payment flows defined by the x402 V2 core specification",
  head: ["Flow", "Order", "Effect for the client"],
  rows: [
    [html`<code>authorization</code> (default)`, "verify, resource, settle, respond", "Funds move only after the handler succeeds. Clients should prefer it when a resource offers several flows."],
    [html`<code>upfront</code>`, "settle, resource, respond", "Payment is committed before the handler runs. If the handler fails, the client has paid; the core specification defines no refund for this case."],
    [html`<code>escrow</code>`, "settle, resource, settle, respond", "A first settle commits a deposit or ceiling, a second records the final charge."],
  ],
  rowHeaders: true,
})}
<p>Whatever the flow, the core specification sets one invariant: at least one check, a verify or a settle, must run before the resource executes. Clients must not build a payment for a flow they do not recognize. What the facilitator does at each step, and how it fails, is covered in <a href="/learn/x402-facilitator-security">x402 facilitator security</a>.</p>

<h2 id="schemes-and-networks">Schemes, networks and assets</h2>
<p>Each entry in <code>accepts</code> combines a <strong>scheme</strong>, a <strong>network</strong> and an <strong>asset</strong>:</p>
<ul>
  <li><strong>Scheme</strong> is the payment logic. <a href="${EXACT}"><code>exact</code></a> transfers a specific amount known in advance, for example to read an article or call a tool once. The specification repository also defines <code>upto</code>, <code>batch-settlement</code> and <code>auth-capture</code> under <a href="${SCHEMES}">specs/schemes</a>, each with per-network bindings.</li>
  <li><strong>Network</strong> is a <a href="${CAIP2}">CAIP-2</a> chain identifier, <code>namespace:reference</code>. In V2, <code>eip155:8453</code> is Base mainnet, <code>eip155:84532</code> is Base Sepolia and <code>solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp</code> is Solana mainnet.</li>
  <li><strong>Asset</strong> is the token contract address (or an ISO 4217 code for fiat rails), and <code>amount</code> is an integer string in the asset's <em><a href="/learn/glossary#atomic-units">atomic units</a></em>. For a token with 6 decimals, such as USDC, <code>"10000"</code> means 0.01.</li>
</ul>
<p>Each option also names the recipient (<code>payTo</code>), the maximum time allowed for payment completion (<code>maxTimeoutSeconds</code>) and scheme-specific data in <code>extra</code>. For EIP-3009 tokens, <code>extra.name</code> and <code>extra.version</code> carry the token's EIP-712 domain name and version, which the client needs to sign.</p>

<h2 id="v2-vs-v1">x402 V2 compared with V1</h2>
<p>V2 carries every protocol message in headers, including the payment terms that V1 sent in the response body. It also adopted CAIP-2 network identifiers and separated the resource description from the payment options. The official <code>@x402/core</code> schemas still parse both versions, keyed on <code>x402Version</code>, but the wire formats differ. The table summarizes them from the <a href="${HTTP_V1}">V1</a> and <a href="${HTTP}">V2</a> HTTP transport specifications.</p>
${comparisonTable({
  caption: "Wire-level differences between x402 V1 and V2 (HTTP transport)",
  columns: ["Aspect", "V1", "V2"],
  rows: versionRows(html),
  highlight: 2,
})}
<p>The <a href="/learn/x402-v1-to-v2-migration">V1 to V2 migration guide</a> lists the other differences, such as the facilitator's <code>/supported</code> response and the error codes, with the steps for servers, clients and facilitators.</p>

<h2 id="where-it-goes-wrong">Where x402 implementations go wrong</h2>
<p>Most defects fall into a few families. Each one maps to concrete items in the <a href="/learn/x402-security-checklist">x402 security checklist</a>.</p>
<ul>
  <li><strong>The challenge is not machine-readable.</strong> No 402, terms only in the body (the V1 habit), a header that is not valid Base64 JSON, or an object the official SDK rejects. Agents then cannot pay, or each client interprets the terms differently.</li>
  <li><strong>The terms are not bound to the request.</strong> A <code>resource.url</code> that differs from the requested URL, a redirect, or terms served over plaintext HTTP where a network attacker can rewrite <code>payTo</code> or <code>amount</code> before the client signs.</li>
  <li><strong>The options are malformed or ambiguous.</strong> Decimal amounts, network names instead of CAIP-2, a <code>payTo</code> that is not an address on the advertised chain, duplicate entries, very long <code>maxTimeoutSeconds</code>.</li>
  <li><strong>The terms drift.</strong> Price or recipient changes between identical requests, which can be intentional dynamic pricing or a sign of tampering.</li>
  <li><strong>The resource fails open.</strong> The handler runs, or content is returned, for a payment that was never verified. An invalid signature then unlocks the resource for free.</li>
  <li><strong>The facilitator accepts what it should reject.</strong> A <code>/verify</code> that reports a forged signature as valid, or a facilitator that does not support the scheme and network the server advertises. See <a href="/learn/x402-facilitator-security">x402 facilitator security</a>.</li>
  <li><strong>The agent pays without limits.</strong> No allowlist of recipients, tokens and networks, and no amount cap, so the agent signs whatever the server asks. See the <a href="/learn/agent-spending-policy">agent spending policy guide</a>.</li>
</ul>
<p>For a longer treatment with examples, read <a href="/blog/x402-security-failure-modes">x402 security failure modes</a>.</p>

<h2 id="how-to-test">How to test an x402 endpoint</h2>
<p>Settlens checks these behaviors without paying. A <strong>passive scan</strong> requests the resource without any payment header, decodes <code>PAYMENT-REQUIRED</code>, validates it with the official <code>@x402/core</code> SDK and Settlens' own rules, checks the binding to the requested URL and repeats the request to detect drift. Against the bundled demo target:</p>
${terminal({ title: "Passive scan (demo target)", lines: SCAN_LINES })}
<p>An <strong><a href="/learn/glossary#active-probe">active probe</a></strong> goes one step further, but only with the owner's written approval: it retries once with an intentionally invalid <code>PAYMENT-SIGNATURE</code> and expects the resource to refuse it. The demo's <code>/bypass</code> route is built to unlock anyway, and the probe reports it:</p>
${terminal({ title: "Authorized active probe (demo target)", lines: BYPASS_LINES })}
${callout({
  tone: "warning",
  title: "Active probes need authorization",
  body: html`<p>Run <code>--active --authorized --authorization-ref</code> only against endpoints you own or are approved to test. The probe sends one invalid signature, never calls <code>/settle</code>, never moves funds and needs no wallet or private key.</p>`,
})}
<p>Captured payment authorizations can also be checked offline with <code>verify-payment</code>, explained on the <a href="/learn/eip-3009">EIP-3009 page</a>. Agents can run the same pre-payment checks through the <a href="/mcp">Settlens MCP server</a> before they sign anything. The <a href="/docs/quickstart">quickstart</a> covers installation for pilot participants, and <a href="/product/assess">Assess</a> describes the scan in detail.</p>

<h2 id="faq">Frequently asked questions</h2>
${faq([
  {
    q: "Is x402 a blockchain or a token?",
    a: "No. x402 is a payment protocol; over HTTP its messages travel in headers. Payments settle on existing networks, such as EVM chains or Solana, in existing assets such as USDC. The protocol defines no token of its own.",
  },
  {
    q: "Does every resource server need a third-party facilitator?",
    a: "No. The specification lets resource servers delegate verification and settlement to a facilitator or host the /verify and /settle endpoints themselves.",
  },
  {
    q: "What is the difference between /verify and /settle?",
    a: "/verify is read-only: it checks that a payment authorization is valid for the requirements and must not commit payment state. /settle durably commits the payment, typically by broadcasting a transaction, and returns the transaction hash.",
  },
  {
    q: "What changed between x402 V1 and V2?",
    a: "V2 carries the payment terms in the PAYMENT-REQUIRED header instead of the response body, renames X-PAYMENT to PAYMENT-SIGNATURE and X-PAYMENT-RESPONSE to PAYMENT-RESPONSE, uses CAIP-2 network identifiers, replaces maxAmountRequired with amount, moves the resource description to a top-level object and adds extensions.",
  },
  {
    q: "Can I test an x402 endpoint without paying?",
    a: "Yes. A Settlens passive scan never sends a payment signature. The optional active probe sends one intentionally invalid signature with the owner's authorization. Neither calls /settle or moves funds.",
  },
])}`;
}
