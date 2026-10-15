// /learn/x402-facilitator-security: the facilitator's role, its risks and what can be tested from
// outside. Protocol facts follow the x402 V2 specification (checked on CHECKED_ON); the check table
// is read from src/catalog.js; transcripts are real output against npm run demo:server (2026-10-13).

import { CHECK_CATALOG } from "../../../../src/catalog.js";
import { CHECKED_ON, SOURCES } from "./_shared.js";

export const meta = {
  path: "/learn/x402-facilitator-security",
  title: "x402 facilitator security: /verify and /settle",
  heading: "x402 facilitator security",
  label: "Facilitator security",
  description:
    "How x402 facilitators verify and settle payments, the risks at /verify, /settle and /supported, and which of them Settlens can test without moving funds.",
  lede: "The facilitator is the part of x402 that turns a signature into a payment. This guide covers its three endpoints, the payment flows that decide when they run, the ways they fail, and what an outside test can and cannot prove.",
  summary:
    "An x402 facilitator checks payments with a read-only POST /verify, commits them with POST /settle and lists what it supports at GET /supported. Risks include a /verify that accepts forged signatures, capabilities that drift from what servers advertise, and pending settlements retried unreconciled.",
  sources: [SOURCES.x402, SOURCES.exactEvm, SOURCES.eip3009],
  section: "learn",
  order: 7,
  icon: "seal",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "Facilitators", "Security"],
  related: ["/use-cases/facilitators", "/learn/x402-error-codes", "/learn/x402-security-checklist"],
};

// Checks that read a facilitator: the passive capability scan, then the authorized active probe.
const FACILITATOR_CHECKS = CHECK_CATALOG.filter((check) => check.mode === "facilitator" || (check.mode === "active" && /facilitator/.test(check.id)));
if (!FACILITATOR_CHECKS.some((check) => check.id === "security.facilitator_rejects_invalid_signature")) {
  throw new Error("/learn/x402-facilitator-security: security.facilitator_rejects_invalid_signature is missing from the catalog.");
}

const COVERAGE_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-empty --no-write" },
  { kind: "out", text: "Settlens x402 assessment 96327c63" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "22 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL high     Facilitator covers advertised payment requirements" },
  { kind: "muted", text: "       1 advertised payment choice(s) are absent from facilitator capabilities." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 22 pass · 1 fail · 0 warn · 0 skip" },
];

const VERIFY_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-accept \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-003 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 513cfb74" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "26 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Facilitator /verify rejects an invalid signature" },
  { kind: "muted", text: "       The facilitator reported isValid=true for an intentionally invalid, all-zero signature." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 26 pass · 1 fail · 0 warn · 0 skip" },
];

export default function render(ctx) {
  const { html, table, callout, terminal, faq, formatDate } = ctx;
  return html`<p>In x402, the resource server decides whether a request is paid, but it rarely checks signatures or talks to a blockchain itself. It hands the client's payment to a <a href="/learn/glossary#facilitator">facilitator</a>: a service that verifies the authorization and settles it on a network. The <a href="${SOURCES.x402.url}">x402 V2 core specification</a> lets a resource server delegate this to a third party or host the endpoints itself. Either way, a facilitator error decides whether paid content leaks for free or a client pays twice.</p>
${callout({
  tone: "note",
  title: `Checked on ${formatDate(CHECKED_ON)}`,
  body: html`<p>Protocol statements on this page follow section 7 (facilitator interface), section 9 (error handling) and section 10 (security considerations) of the V2 core specification, and the <a href="${SOURCES.exactEvm.url}">exact EVM scheme</a>. The scheme catalog evolves; re-read the specification before relying on a detail.</p>`,
})}

<h2 id="endpoints">The three facilitator endpoints</h2>
${table({
  caption: "x402 V2 facilitator interface",
  head: ["Endpoint", "What it does", "Answer"],
  rows: [
    [html`<code>POST /verify</code>`, "Checks a payment authorization against the payment requirements without executing it. It is read-only: it must not commit payment state or write on chain.", html`<code>VerifyResponse</code>: <code>isValid</code>, and <code>invalidReason</code> when it is false.`],
    [html`<code>POST /settle</code>`, "Durably commits the payment, typically by broadcasting a transaction. It can be called more than once for one payment, as in the escrow flow.", html`<code>SettleResponse</code>: <code>success</code>, <code>transaction</code>, <code>network</code>, and <code>errorReason</code> on failure.`],
    [html`<code>GET /supported</code>`, "Lists what the facilitator can process.", html`<code>kinds</code> (version, scheme, network), <code>extensions</code> and <code>signers</code> per CAIP-2 pattern.`],
  ],
  rowHeaders: true,
})}
<p>Both <code>POST</code> endpoints take the same body: <code>x402Version</code>, the client's <code>paymentPayload</code> and the <code>paymentRequirements</code> it should satisfy. The resource server should send its own requirement there, not the copy the client echoed in <code>accepted</code>.</p>

<h2 id="payment-flows">When /verify runs: payment flows</h2>
<p>The <a href="/learn/glossary#payment-flow">payment flow</a> decides which endpoints run, and in which order, around the resource handler:</p>
${table({
  caption: "Facilitator calls by payment flow (x402 V2 core specification, section 6.1)",
  head: ["Flow", "Order", "Pre-handler check"],
  rows: [
    [html`<code>authorization</code> (default)`, "verify, resource, settle, respond", html`<code>/verify</code>`],
    [html`<code>upfront</code>`, "settle, resource, respond", html`<code>/settle</code>; <code>/verify</code> is not part of this flow`],
    [html`<code>escrow</code>`, "settle, resource, settle, respond", html`The first <code>/settle</code>, which commits a deposit or ceiling`],
  ],
  rowHeaders: true,
})}
<p>The specification's invariant: a verify or a settle must run before the resource executes. Under the default flow, that makes <code>/verify</code> the only thing standing between a forged signature and the protected handler.</p>

<h2 id="threats">What goes wrong</h2>
<p>These are risks to look for in any facilitator, with the control the specifications imply for each.</p>
${table({
  caption: "x402 facilitator risks and controls",
  head: ["Risk", "Effect", "Control"],
  rows: [
    ["/verify accepts a forged signature", "Under the authorization flow the resource runs for a payment that can never settle: the content leaks for free.", html`Recover the signer from the EIP-712 digest and require it to equal <code>authorization.from</code>; reject the zero address. See the <a href="/learn/eip-3009">EIP-3009 guide</a>.`],
    ["/verify writes state", "Funds or nonces are committed before the handler runs, although the authorization flow promises funds move only after it succeeds.", html`Keep <code>/verify</code> free of on-chain writes; commit only in <code>/settle</code>.`],
    ["Capability drift", "A resource advertises a scheme or network that the facilitator does not list, so payments fail at verification.", html`Keep each resource's <code>accepts</code> within the facilitator's <code>/supported</code> kinds, for the same <code>x402Version</code>.`],
    ["Missing signers", html`A network with no entry in <code>signers</code> leaves integrators without the address that signs for it.`, html`Publish signer addresses for every network, or for a namespace wildcard such as <code>eip155:*</code>.`],
    [html`<code>settlement_pending</code> retried blindly`, "A new authorization carries a new nonce, so it can settle on top of the first transaction: the client pays twice.", html`Return the broadcast hash and network, and reconcile on chain before any retry. See the <a href="/learn/x402-error-codes">error codes reference</a>.`],
    ["Replay of an authorization", "A captured signature is submitted again or on another chain.", "EIP-3009 nonces are single-use on chain, validBefore limits the lifetime, and the EIP-712 domain binds the signature to one chain and token."],
  ],
  rowHeaders: true,
})}
<p>One thing a facilitator cannot do on the EVM <code>exact</code> scheme is change the amount or the destination: both are inside the payer's signed message, and the scheme specification limits the facilitator to broadcasting the transaction.</p>

<h2 id="what-settlens-tests">What Settlens tests</h2>
<p>A facilitator scan reads <code>GET /supported</code> passively. The <code>/verify</code> checks run only during an <a href="/learn/glossary#active-probe">active probe</a> that the endpoint owner authorized in writing. The table is generated from the Settlens check catalog.</p>
${table({
  caption: "Settlens checks that read a facilitator",
  head: ["Check id", "What it verifies"],
  rows: FACILITATOR_CHECKS.map((check) => [html`<code>${check.id}</code>`, html`${check.verifies}<br><small>Mode: ${check.mode} · severity: ${check.severity}</small>`]),
  rowHeaders: true,
})}
<p>Two runs against the bundled demo target show the checks that matter most. Here the facilitator does not list the Base Sepolia kind that the resource advertises:</p>
${terminal({ title: "Capability drift (demo target)", lines: COVERAGE_LINES })}
<p>Here the facilitator's <code>/verify</code> answers <code>isValid: true</code> to an all-zero signature. The probe sends that one invalid payload and never calls <code>/settle</code>:</p>
${terminal({ title: "Authorized active probe of /verify (demo target)", lines: VERIFY_LINES })}

<h2 id="what-settlens-cannot-test">What an outside test cannot prove</h2>
<ul>
  <li><strong>Settlement.</strong> Settlens never calls <code>/settle</code> and never moves funds, so it cannot show that a facilitator settles the right amount once, or handles <code>settlement_pending</code> correctly.</li>
  <li><strong>Chain state.</strong> Balance checks, nonce use and transaction simulation need an RPC node; Settlens works without one.</li>
  <li><strong>Read-only <code>/verify</code>.</strong> A single invalid probe cannot observe whether <code>/verify</code> writes state for valid payloads.</li>
  <li><strong>Valid payments.</strong> The probe proves that one forged signature is rejected, not that every valid payment is accepted.</li>
</ul>
<p>For these, review the facilitator's code and settlement records. The <a href="/learn/x402-security-checklist#facilitators">facilitator section of the x402 security checklist</a> lists every control, and <a href="/use-cases/facilitators">Settlens for facilitators</a> describes how operators use the scans. Check ids and fixes are in the <a href="/docs/checks">check reference</a>.</p>

<h2 id="faq">Frequently asked questions</h2>
${faq([
  {
    q: "Is the x402 facilitator /verify endpoint allowed to change state?",
    a: "No. The x402 V2 specification defines /verify as read-only: it must not commit payment state or write on chain. Only /settle commits the payment.",
  },
  {
    q: "Can an x402 facilitator change the amount or the recipient?",
    a: "Not on the EVM exact scheme. The amount and recipient are part of what the payer signs (an EIP-3009 authorization by default), and the scheme specification limits the facilitator to broadcasting the transaction.",
  },
  {
    q: "Can Settlens test a facilitator without moving funds?",
    a: "Yes. It reads GET /supported passively and, with the owner's written authorization, sends one intentionally invalid payload to /verify. It never calls /settle, holds no funds and needs no wallet.",
  },
])}`;
}
