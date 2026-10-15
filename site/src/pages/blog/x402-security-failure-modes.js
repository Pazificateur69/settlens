import { AUTHOR, badge, check, checkRows } from "./_shared.js";

export const meta = {
  path: "/blog/x402-security-failure-modes",
  title: "x402 security: eight failure modes to test",
  heading: "x402 security: the payment failure modes every implementation should test",
  label: "x402 failure modes",
  description:
    "Eight ways x402 payment endpoints fail quietly, from fail-open resources and forged signatures at /verify to drift and weak binding, and how to test each one.",
  lede: "x402 turns HTTP 402 into a real payment. When an implementation is wrong, nothing crashes: content unlocks for free, or money goes to the wrong place. Here is what to test, and how.",
  section: "blog",
  lastmod: "2026-10-13",
  datePublished: "2026-07-31",
  dateModified: "2026-10-13",
  author: AUTHOR,
  tags: ["x402", "Security", "Testing"],
  summary:
    "The eight x402 failure modes to test are: a resource that serves content for an invalid signature, a facilitator /verify that accepts a forged one, weak resource binding, drifting terms, malformed challenges, weak transport, long authorization windows and facilitator coverage gaps.",
  sources: [
    { title: "x402 protocol specification, version 2 (§5 types, §7 facilitator interface, §10 security considerations)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport: headers and error status codes", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "Scheme exact on EVM: EIP-3009 authorization payload and verification", url: "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md", publisher: "x402 Foundation" },
    { title: "EIP-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "CAIP-2: Blockchain ID specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  related: ["/blog/how-to-test-x402-endpoint", "/blog/detecting-x402-payment-drift", "/blog/agentic-payments-what-breaks"],
};

const FLOW_SVG = `<svg viewBox="0 0 720 424" width="720" height="424" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="40" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node d-node--accent" x="280" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="520" y="16" width="160" height="44" rx="10"/>
  <text class="d-title" x="120" y="43" text-anchor="middle">Agent or client</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="600" y="43" text-anchor="middle">Facilitator</text>
  ${badge(700, 38, 8)}
  <path class="d-life" d="M120 60v290M360 60v290M600 60v290"/>
  <path class="d-msg" d="M120 100h236"/><path class="d-head" d="M350 94l8 6-8 6"/>
  <text class="d-label" x="240" y="91" text-anchor="middle">GET /resource</text>
  <path class="d-msg d-msg--accent" d="M360 146H124"/><path class="d-head d-head--accent" d="M130 140l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="240" y="137" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  ${badge(390, 146, 3)}${badge(418, 146, 4)}${badge(446, 146, 5)}${badge(474, 146, 6)}${badge(502, 146, 7)}
  <path class="d-msg" d="M120 200h236"/><path class="d-head" d="M350 194l8 6-8 6"/>
  <text class="d-label" x="240" y="191" text-anchor="middle">retry + PAYMENT-SIGNATURE</text>
  ${badge(390, 200, 1)}
  <path class="d-msg d-msg--blue" d="M360 244h236"/><path class="d-head d-head--blue" d="M590 238l8 6-8 6"/>
  <text class="d-label" x="480" y="235" text-anchor="middle">POST /verify</text>
  ${badge(630, 244, 2)}
  <path class="d-msg" d="M360 286h236"/><path class="d-head" d="M590 280l8 6-8 6"/>
  <text class="d-label" x="480" y="277" text-anchor="middle">POST /settle</text>
  <text class="d-note" x="372" y="308">Settlens never calls /settle</text>
  <path class="d-msg" d="M360 334H124"/><path class="d-head" d="M130 328l-8 6 8 6"/>
  <text class="d-label" x="240" y="325" text-anchor="middle">200 + PAYMENT-RESPONSE</text>
  <text class="d-text" x="40" y="388">1 Fail-open resource · 2 Forged signature accepted · 3 Weak binding · 4 Drift</text>
  <text class="d-text" x="40" y="412">5 Malformed challenge · 6 Transport · 7 Long windows · 8 Coverage gaps</text>
</svg>`;

const BYPASS = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-002" },
  { kind: "out", text: "Settlens x402 assessment eafd7f6a" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "blank", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/bypass" },
  { kind: "out", text: "13 pass · 1 fail · 1 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Invalid payment authorization is denied" },
  { kind: "muted", text: "       The endpoint returned HTTP 200 after an invalid payment authorization." },
  { kind: "warn", text: "  WARN medium   Invalid payment uses a standard failure status" },
  { kind: "muted", text: "       Expected HTTP 400 or 402 for invalid payment, received HTTP 200." },
];

const FORGED = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-accept \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-003" },
  { kind: "out", text: "Settlens x402 assessment 9fa4dcf9" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "blank", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "26 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Facilitator /verify rejects an invalid signature" },
  { kind: "muted", text: "       The facilitator reported isValid=true for an intentionally invalid, all-zero signature." },
];

const DRIFT = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/drift" },
  { kind: "out", text: "Settlens x402 assessment 56c93ec9" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "blank", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/drift" },
  { kind: "out", text: "12 pass · 0 fail · 1 warn · 0 skip" },
  { kind: "warn", text: "  WARN medium   Payment requirements remain stable" },
  { kind: "muted", text: "       Payment terms changed between identical unauthenticated requests." },
];

const MISSING = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/missing-header" },
  { kind: "out", text: "Settlens x402 assessment fe4514e2" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "blank", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/missing-header" },
  { kind: "out", text: "4 pass · 1 fail · 0 warn · 1 skip" },
  { kind: "fail", text: "  FAIL high     PAYMENT-REQUIRED header is present" },
  { kind: "muted", text: "       The response does not include PAYMENT-REQUIRED." },
  { kind: "skip", text: "  SKIP medium   Payment requirements remain stable" },
  { kind: "muted", text: "       Only one successful sample was available." },
];

const COVERAGE = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-empty" },
  { kind: "out", text: "Settlens x402 assessment b92b9c27" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "blank", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "22 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL high     Facilitator covers advertised payment requirements" },
  { kind: "muted", text: "       1 advertised payment choice(s) are absent from facilitator capabilities." },
];

const SUMMARY = [
  { label: "1. Fail-open resource", ids: ["security.invalid_signature_fail_closed", "transport.invalid_payment_status"] },
  { label: "2. Facilitator accepts a forged signature", ids: ["security.facilitator_rejects_invalid_signature", "facilitator.verify_response_schema"] },
  { label: "3. Weak payment-to-resource binding", ids: ["binding.resource_url"] },
  { label: "4. Recipient, asset and price drift", ids: ["stability.payment_requirements", "policy.recipient", "policy.asset", "policy.maximum_amount", "policy.network"] },
  { label: "5. Malformed challenge", ids: ["transport.payment_required_header", "transport.payment_required_encoding", "schema.official_x402_sdk", "schema.payment_required", "schema.payment_requirements", "schema.duplicate_requirements"] },
  { label: "6. Transport weaknesses", ids: ["transport.https", "transport.redirect", "transport.response_body_limit"] },
  { label: "7. Long authorization windows", ids: ["freshness.timeout_window"] },
  { label: "8. Facilitator coverage gaps", ids: ["facilitator.requirement_coverage", "facilitator.signer_coverage"] },
];

export default function render(ctx) {
  const { html, terminal, callout, diagram, table } = ctx;
  const timeout = check("freshness.timeout_window");
  return html`<p>x402 is a payment protocol built on HTTP. A client requests a resource and receives <code>402 Payment Required</code> with a <code>PAYMENT-REQUIRED</code> header that lists the accepted payment options. The client signs one of them and retries with a <code>PAYMENT-SIGNATURE</code> header. The resource server, usually with a facilitator's help, verifies and settles the payment before it serves the content. See <a href="/learn/what-is-x402">what x402 is</a> and <a href="/learn/x402-v2-headers">the three V2 headers</a> for the full picture.</p>
<p>When an x402 implementation is wrong, nothing crashes. The resource unlocks for a signature nobody checked. A recipient address changes between two requests. A facilitator says yes to a forged authorization. The HTTP traffic looks normal, the logs look normal, and the money goes the wrong way or never arrives.</p>
<p>This article walks through eight failure modes we test for, what each one looks like on the wire, and the Settlens check that catches it. Every transcript below is real output from the Settlens CLI against its bundled demo target, a local server with a deliberately broken route for each failure shown. None of these tests needs a wallet or a private key, and none of them calls a facilitator's <code>/settle</code> endpoint.</p>

${diagram({
  svg: FLOW_SVG,
  size: "wide",
  label: "x402 V2 sequence between an agent, a paid resource and a facilitator, annotated with eight failure points: 1 the resource serves content for an invalid signature, 2 the facilitator accepts a forged signature at /verify, 3 to 7 problems in the 402 challenge (weak binding, drift, malformed content, transport, long authorization windows) and 8 facilitator capabilities that do not cover the advertised options. Settlens never calls /settle.",
  caption: "Where an x402 V2 exchange can fail. Points 3 to 7 live in the 402 challenge and are visible to a passive scan; points 1 and 2 need the authorized active probe; point 8 compares the challenge with the facilitator's GET /supported.",
})}

<h2>1. Payment bypass: the resource fails open</h2>
<p>The worst failure is also the simplest. The server checks that a <code>PAYMENT-SIGNATURE</code> header is <em>present</em> and serves the content without verifying it. Anyone who sends arbitrary bytes in that header gets the paid resource for free. It is a fail-open bug and a direct revenue leak, and it often survives code review because the happy path works perfectly: real clients send real signatures, so the missing verification never shows up in normal traffic.</p>
<p>The only reliable way to find it is to send an invalid payment and watch what happens. With the endpoint owner's explicit approval, the Settlens active probe builds one intentionally invalid authorization from the first advertised payment option (for an EVM option, an all-zero 65-byte signature from the zero address) and retries the request with it. If the resource answers with any <code>2xx</code> status, <code>security.invalid_signature_fail_closed</code> fails at critical severity. A separate check, <code>transport.invalid_payment_status</code>, expects the status the HTTP transport defines: <code>400</code> for malformed payment data or <code>402</code> when verification or settlement fails.</p>
${terminal({ title: "Active probe against a fail-open route (demo target)", lines: BYPASS })}
<p>The scan exits with code <code>1</code>, so a CI job stops here. Note the scope line: one active target, zero settlement calls. The probe proves the endpoint refuses a bad payment; it cannot create a good one.</p>
${callout({ tone: "warning", title: "Authorized testing only", body: html`<p>The active probe sends traffic the endpoint owner must approve. Settlens refuses to run it without both <code>--active</code> and <code>--authorized</code> plus an <code>--authorization-ref</code> that names the approval, and it records that reference in the report.</p>` })}

<h2>2. The facilitator accepts a forged signature</h2>
<p>Many resource servers delegate verification to a facilitator: they forward the payment payload to <code>POST /verify</code> and serve the content when the answer says <code>isValid: true</code>. If the facilitator's own verification is broken, every resource server that relies on it inherits a payment bypass, and none of them can see it from their own code.</p>
<p>When you pass <code>--facilitator</code> to an authorized active scan, Settlens sends the same invalid payload to the facilitator's <code>/verify</code>. It expects a conformant VerifyResponse, a JSON object with a boolean <code>isValid</code> (<code>facilitator.verify_response_schema</code>), and it expects that value to be <code>false</code> (<code>security.facilitator_rejects_invalid_signature</code>, critical). The demo target ships a deliberately broken facilitator route that approves everything:</p>
${terminal({ title: "Facilitator that approves an all-zero signature (demo target)", lines: FORGED })}
<p>Test the facilitator directly, not only through the resource. The two can disagree, and the disagreement is exactly where money goes missing. Our guide to <a href="/learn/x402-facilitator-security">x402 facilitator security</a> covers what <code>/verify</code>, <code>/settle</code> and <code>/supported</code> are each expected to do.</p>

<h2>3. Weak payment-to-resource binding</h2>
<p>Every x402 V2 challenge carries a <code>resource</code> object whose <code>url</code> says what is being paid for. When that URL does not match the URL the client requested, the client cannot tell what it is paying for. Common causes are mundane: one shared challenge for every route, a stale host name after a proxy or CDN change, or a query parameter dropped when the challenge is built. The effect is not mundane: a payment can be steered to, or reused for, a different resource than the one the agent asked for.</p>
<p>The check <code>binding.resource_url</code> compares <code>resource.url</code> with the requested URL, path and query included (the fragment is ignored), and fails at high severity when they differ. You can run it on a captured header with the free <a href="/tools/x402-checker">x402 payment request checker</a>: paste the header and the URL you requested. On the server side, the matching control is to verify that the terms in a payment payload are the terms you issued for <em>this</em> resource (amount, recipient, asset and network) rather than accepting any valid signature that pays the right address. A passive scan cannot observe that server-side logic; it can only confirm that the challenge itself is bound correctly.</p>

<h2>4. Recipient, asset and price drift</h2>
<p>The <code>payTo</code>, <code>asset</code> and <code>amount</code> fields decide who gets paid, in which token and how much. If they change between two identical requests, something is wrong: a dynamic pricing bug, two backends behind a load balancer serving different configurations, a recipient rotation nobody reviewed, or tampering. If they drift away from the values you reviewed, funds can be silently redirected or customers overcharged.</p>
<p>Settlens catches drift in two ways. <code>${check("stability.payment_requirements").id}</code> requests the resource several times (two by default) and compares the <code>resource</code>, <code>accepts</code> and <code>extensions</code> it receives, ignoring known ephemeral fields such as a Solana <code>recentBlockhash</code>. A change raises a warning. Local policy checks then pin the values you approved: <code>policy.recipient</code>, <code>policy.asset</code>, <code>policy.network</code>, <code>policy.scheme</code> and <code>policy.maximum_amount</code> fail at high severity when the advertised terms leave the reviewed set. The demo's drift route alternates its price on every request:</p>
${terminal({ title: "Price that changes between identical requests (demo target)", lines: DRIFT })}
<p>A recipient that changes without a deploy is a red flag, not a feature. Our <a href="/blog/detecting-x402-payment-drift">guide to detecting payment drift</a> covers the stability check, policy pins and continuous monitoring in detail.</p>

<h2>5. Malformed or non-standard challenges</h2>
<p>Protocol drift breaks integrations without an obvious error. A server still emitting <code>x402Version: 1</code> where clients expect 2, an amount written as <code>"0.01"</code> instead of an integer string of atomic units, a network written as <code>base</code> instead of the CAIP-2 identifier <code>eip155:8453</code>, a <code>payTo</code> that is not a 20-byte address on an EVM chain, or the same payment option listed twice. The official SDK schema catches some of these, such as a network that is not CAIP-2, but accepts others: a well-formed version-1 object, a decimal amount, a malformed <code>payTo</code> or a duplicate option. Hand-written clients may accept any of them and interpret them differently. To your users, every variant looks like a mysterious payment failure.</p>
<p>A passive scan checks that the <code>PAYMENT-REQUIRED</code> header is present and decodes as Base64 JSON, that the pinned official <code>@x402/core</code> 2.28.0 SDK accepts the object, that the V2 core shape is there, and, with its own rules on top of the SDK, that every payment option is well formed and that no option is duplicated. If you are still moving an implementation off version 1, the <a href="/learn/x402-v1-to-v2-migration">x402 V1 to V2 migration guide</a> lists what changed on the wire. The demo's broken route answers 402 but forgets the header entirely:</p>
${terminal({ title: "402 without a PAYMENT-REQUIRED header (demo target)", lines: MISSING })}
<p>The stability check is skipped here because there was no decodable challenge to compare. A skip is not a pass: it means the prerequisite evidence was missing.</p>

<h2>6. Transport weaknesses</h2>
<p>Payment terms are only as trustworthy as the channel that carries them. Over plaintext HTTP, anyone on the network path can rewrite <code>payTo</code> or <code>amount</code> before the agent signs; <code>transport.https</code> warns about any non-loopback endpoint that is not served over HTTPS. A redirect moves the challenge away from the URL that was assessed, so Settlens never follows one: <code>transport.redirect</code> records the sanitized destination and warns instead. And a 402 response body should be small. Settlens stops reading at 1 MiB (<code>transport.response_body_limit</code>), because a very large challenge body wastes agent bandwidth and can mean the protected content is being sent before payment.</p>

<h2>7. Long authorization windows and replay exposure</h2>
<p>The <code>maxTimeoutSeconds</code> field is the maximum time the server allows for completing a payment. A long value invites long-lived authorizations, and the longer an authorization stays valid, the longer a leaked or intercepted one can be presented again. Settlens warns when any advertised value exceeds ${timeout.verifies.match(/at most (\d+) seconds/)?.[1] ?? "3600"} seconds (<code>${timeout.id}</code>, ${timeout.severity} severity); keep it as short as settlement allows.</p>
<p>For the EVM <code>exact</code> scheme with its default EIP-3009 transfer method, each authorization is a signed message with a <code>validAfter</code>/<code>validBefore</code> window and a nonce, and the token contract refuses a nonce that was already used when the transfer settles. <code>/verify</code> commits no state, so until settlement nothing on-chain has consumed the nonce: a server that serves content after verification alone must make sure the same authorization is not accepted twice. Be precise about what a test can show here: Settlens checks the window of a captured authorization offline with <code>verify-payment</code>, and it checks that the advertised windows are bounded. It does not check whether a nonce was used on-chain and it does not test replay. Our <a href="/learn/eip-3009">EIP-3009 explainer</a> covers the authorization format.</p>

<h2>8. Facilitator coverage gaps</h2>
<p>A resource can advertise a scheme and network that its facilitator does not support. The agent signs a perfectly valid payment that can never be verified or settled, and the failure surfaces as a refused purchase. Settlens reads the facilitator's <code>GET /supported</code> and checks its schema, its x402 V2 capability and its signer metadata, then cross-checks every advertised scheme and network against the supported kinds (<code>facilitator.requirement_coverage</code>) and the published signers (<code>facilitator.signer_coverage</code>). The demo includes a facilitator that only supports Base mainnet while the resource asks for Base Sepolia:</p>
${terminal({ title: "Facilitator that does not cover the advertised network (demo target)", lines: COVERAGE })}

<h2>The failure modes at a glance</h2>
<p>The table is generated from the Settlens check catalog, the same source the CLI, the reports and the <a href="/docs/checks">check reference</a> use. Mode tells you what a check needs: <em>offline</em> checks run on the challenge content alone, <em>passive</em> checks need live unauthenticated requests, <em>active</em> checks need the authorized probe and <em>facilitator</em> checks read <code>GET /supported</code>.</p>
${table({
  caption: "Failure modes and the Settlens checks that cover them",
  head: ["Failure mode", "Checks", "Mode · highest severity"],
  rows: checkRows(ctx, SUMMARY),
  rowHeaders: true,
})}

<h2>What these tests do not tell you</h2>
<p>Each check reports observed behavior during the recorded window. A clean report does not prove that untested application code is free of vulnerabilities, that a real wallet signature will settle, that balances are sufficient or that a nonce is unused on-chain. Settlens does not call <code>/settle</code>, does not broadcast transactions and does not inspect the content you deliver after payment. It is evidence about the payment handshake, not a certification. The <a href="/docs/methodology">assessment methodology</a> spells out what each status and severity means.</p>
<p>Within that boundary, every failure above is deterministic to test and cheap to run on every release. Start with the passive checks, add the facilitator, then run the authorized probe once you have the owner's approval. The <a href="/blog/how-to-test-x402-endpoint">practical testing checklist</a> walks through the commands in order, and <a href="/contact">a pilot</a> runs them against your own endpoints with a report your partners can verify.</p>`;
}
