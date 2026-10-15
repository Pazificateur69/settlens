// /learn/x402-v1-to-v2-migration: wire-level V1 → V2 diff and migration steps per role. Protocol
// facts follow the V1 and V2 specifications (checked on CHECKED_ON); the V1 verdict is computed at
// build time by the real MCP server; CLI transcripts are real output against npm run demo:server.

import { encodeBase64Json } from "../../../../src/protocol.js";
import { evaluate, expectDecision, DEMO_POLICY } from "../mcp.js";
import { CHECKED_ON, SOURCES, ifPage, versionRows } from "./_shared.js";

export const meta = {
  path: "/learn/x402-v1-to-v2-migration",
  title: "x402 V1 to V2 migration: what changed on the wire",
  heading: "Migrating from x402 V1 to V2",
  label: "V1 to V2 migration",
  description:
    "Migrate an x402 integration from V1 to V2: the new PAYMENT-REQUIRED, PAYMENT-SIGNATURE and PAYMENT-RESPONSE headers, CAIP-2 networks, amount and steps.",
  lede: "x402 V2 keeps the same handshake but changes almost every name on the wire. This guide lists the differences from the specifications, then the steps for resource servers, clients and facilitators, and how to confirm an endpoint really speaks V2.",
  summary:
    "x402 V2 moves the payment terms from the 402 response body into a Base64 PAYMENT-REQUIRED header, renames X-PAYMENT to PAYMENT-SIGNATURE and X-PAYMENT-RESPONSE to PAYMENT-RESPONSE, replaces maxAmountRequired with amount and identifies networks in CAIP-2 form, such as eip155:84532.",
  sources: [SOURCES.x402, SOURCES.x402V1, SOURCES.x402Http, SOURCES.x402HttpV1, SOURCES.caip2],
  section: "learn",
  order: 3,
  icon: "branch",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "Migration", "V2"],
  related: ["/learn/x402-v2-headers", "/learn/what-is-x402", "/learn/x402-error-codes"],
};

// The 402 body example of the V1 HTTP transport specification.
const V1_BODY = {
  x402Version: 1,
  error: "Payment required to access this resource",
  accepts: [
    {
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "10000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      resource: "https://api.example.com/premium-data",
      description: "Access to premium market data",
      mimeType: "application/json",
      outputSchema: null,
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
  ],
};

// The decoded PAYMENT-REQUIRED example of the V2 HTTP transport specification: the same offer.
const V2_HEADER = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: { url: "https://api.example.com/premium-data", description: "Access to premium market data", mimeType: "application/json" },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      amount: "10000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
  ],
};

// V1 network names and their CAIP-2 form (chain ids from the V1 specification, section 11.1).
const NETWORKS = [
  ["base-sepolia", "eip155:84532", "Base Sepolia"],
  ["base", "eip155:8453", "Base mainnet"],
  ["avalanche-fuji", "eip155:43113", "Avalanche Fuji"],
  ["avalanche", "eip155:43114", "Avalanche mainnet"],
];

// The V1 offer, Base64-encoded as if it were sent in a V2 header, through the real MCP tool.
const V1_VERDICT = expectDecision(
  await evaluate({ paymentRequired: encodeBase64Json(V1_BODY), policy: DEMO_POLICY, id: 40 }),
  "do_not_pay",
  "/learn/x402-v1-to-v2-migration (V1 object)",
);
const V1_FAILS = V1_VERDICT.result.checks.filter((entry) => entry.status === "fail").map((entry) => entry.id);
if (!V1_FAILS.includes("schema.payment_required")) throw new Error("/learn/x402-v1-to-v2-migration: a V1 object no longer fails schema.payment_required; update the copy.");

const V1_SCAN = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/missing-header --no-write" },
  { kind: "out", text: "Settlens x402 assessment fa65d786" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/missing-header" },
  { kind: "out", text: "4 pass · 1 fail · 0 warn · 1 skip" },
  { kind: "fail", text: "  FAIL high     PAYMENT-REQUIRED header is present" },
  { kind: "muted", text: "       The response does not include PAYMENT-REQUIRED." },
  { kind: "skip", text: "  SKIP medium   Payment requirements remain stable" },
  { kind: "muted", text: "       Only one successful sample was available." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 4 pass · 1 fail · 0 warn · 1 skip" },
];

const V2_SCAN = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure --no-write" },
  { kind: "out", text: "Settlens x402 assessment 11984f96" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "pass", text: "13 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 13 pass · 0 fail · 0 warn · 0 skip" },
];

export default function render(ctx) {
  const { html, comparisonTable, table, codeBlock, callout, terminal, faq, formatDate } = ctx;
  const pretty = (value) => JSON.stringify(value, null, 2);
  return html`<p>The <a href="${SOURCES.x402.url}">x402 V2 core specification</a> dates protocol version 2 to December 9, 2025. The payment still happens in one HTTP round trip: the server answers 402 with its terms, the client signs and retries, a facilitator verifies and settles. What changed is where each message travels and what its fields are called, so a V1 client and a V2 server do not understand each other. If the flow itself is new to you, read <a href="/learn/what-is-x402">What is x402?</a> first.</p>
${callout({
  tone: "note",
  title: `Checked on ${formatDate(CHECKED_ON)}`,
  body: html`<p>The differences below come from the <a href="${SOURCES.x402V1.url}">V1</a> and <a href="${SOURCES.x402.url}">V2</a> core specifications and their HTTP transports in the x402-foundation/x402 repository. SDK and facilitator support for V1 changes faster than the specifications: check your vendor's documentation for dates.</p>`,
})}

<h2 id="what-changed">What changed on the wire</h2>
${comparisonTable({
  caption: "Wire-level differences between x402 V1 and V2 (HTTP transport)",
  columns: ["Aspect", "V1", "V2"],
  rows: versionRows(html),
  highlight: 2,
})}
<h3 id="beyond-the-headers">Beyond the headers</h3>
${table({
  caption: "Other differences between the V1 and V2 core specifications",
  head: ["Area", "V1", "V2"],
  rows: [
    [html`<code>error</code> in the 402 terms`, "Required", "Optional"],
    ["Resource metadata", "Description required, MIME type and output schema optional, in each requirement", html`One <code>ResourceInfo</code> object: URL required; description, MIME type, service name, tags and icon optional`],
    [html`Reserved <code>extra</code> keys`, "None", html`<code>assetTransferMethod</code> and <code>paymentFlow</code>`],
    [html`Facilitator <code>GET /supported</code>`, html`<code>kinds</code> only`, html`<code>kinds</code>, <code>extensions</code> and <code>signers</code>, all required`],
    [html`<code>SettleResponse</code>`, html`<code>payer</code> required`, html`<code>payer</code> optional, <code>amount</code> and <code>extensions</code> added`],
  ],
  rowHeaders: true,
})}
<p>The error codes changed too. The V1 code for a wrong amount, <code>invalid_exact_evm_payload_authorization_value</code>, meant "amount insufficient"; V2 replaces it with <code>invalid_exact_evm_payload_authorization_value_mismatch</code>, "amount not an exact match". V2 also adds <code>settlement_pending</code>, the only code the specification marks non-terminal. The full list, with fixes, is in the <a href="/learn/x402-error-codes">x402 error codes reference</a>.</p>

<h2 id="side-by-side">The same offer in V1 and V2</h2>
<p>Both examples come from the HTTP transport specifications and describe the same payment: 10000 atomic units of the token at <code>0x036C…CF7e</code> on Base Sepolia, to <code>0x2096…287C</code>, within 60 seconds. In V1 the client reads it from the response body:</p>
${codeBlock({ lang: "json", title: "V1: body of the 402 response", code: pretty(V1_BODY) })}
<p>In V2 the body is left to the server, and the client Base64-decodes the <code>PAYMENT-REQUIRED</code> header instead:</p>
${codeBlock({ lang: "json", title: "V2: PAYMENT-REQUIRED header, decoded", code: pretty(V2_HEADER) })}
<p>Every field is explained on the <a href="/learn/x402-v2-headers">x402 V2 headers</a> page.</p>

<h2 id="resource-servers">Migration steps for resource servers</h2>
<ol>
  <li><strong>Send the terms in the PAYMENT-REQUIRED header.</strong> Answer 402 with a Base64-encoded <code>PaymentRequired</code> object, <code>x402Version</code> 2, in <code>PAYMENT-REQUIRED</code>. The V2 transport treats the response body as a server implementation concern, so clients must not need it.</li>
  <li><strong>Move the resource out of each requirement.</strong> Replace the per-requirement <code>resource</code>, <code>description</code> and <code>mimeType</code> with one top-level <code>resource</code> object, and set its <code>url</code> to the exact URL the client requested.</li>
  <li><strong>Rename the amount and convert the networks.</strong> <code>maxAmountRequired</code> becomes <code>amount</code>, still an integer string in <a href="/learn/glossary#atomic-units">atomic units</a>. Network names become <a href="/learn/glossary#caip-2">CAIP-2</a> identifiers (table below).</li>
  <li><strong>Read PAYMENT-SIGNATURE instead of X-PAYMENT.</strong> The payload now carries the chosen requirement in <code>accepted</code>. Match it against your own <code>accepts</code> entries and send your own requirement, with <code>x402Version</code> 2, to <code>/verify</code> and <code>/settle</code>.</li>
  <li><strong>Return PAYMENT-RESPONSE instead of X-PAYMENT-RESPONSE.</strong> HTTP 200 with the settlement result on success, HTTP 402 with <code>success: false</code> when settlement fails.</li>
  <li><strong>Declare and enforce the payment flow.</strong> When an option settles before the handler runs (<code>upfront</code> or <code>escrow</code>), V2 requires <code>extra.paymentFlow</code> in it. Servers must reject transfer method and payment flow combinations they do not support.</li>
</ol>
${table({
  caption: "V1 network names and their CAIP-2 identifiers",
  head: ["V1 name", "V2 (CAIP-2)", "Network"],
  rows: NETWORKS.map(([v1, v2, name]) => [html`<code>${v1}</code>`, html`<code>${v2}</code>`, name]),
  rowHeaders: true,
})}

<h2 id="clients-and-agents">Migration steps for clients and agents</h2>
<ul>
  <li><strong>Read the header, not the body.</strong> Match <code>PAYMENT-REQUIRED</code> case-insensitively, Base64-decode it and parse the JSON.</li>
  <li><strong>Check the binding.</strong> <code>resource.url</code> should equal the URL you requested.</li>
  <li><strong>Echo the whole requirement.</strong> Put the chosen <code>accepts</code> entry in <code>accepted</code>, the signed data in <code>payload</code>, and send it in <code>PAYMENT-SIGNATURE</code>. Echo any <code>extensions</code> you received: you may add information but not remove it.</li>
  <li><strong>Skip what you do not recognize.</strong> Clients must not build a payment for a <code>paymentFlow</code> they do not recognize, and should prefer <code>authorization</code> when a resource also offers <code>upfront</code> or <code>escrow</code>.</li>
  <li><strong>Update your spending policy.</strong> Allowlists keyed on V1 network names must switch to CAIP-2, and amount caps now compare against <code>amount</code>. The <a href="/learn/agent-spending-policy">agent spending policy guide</a> covers the full set of limits.</li>
  <li><strong>Read the outcome from PAYMENT-RESPONSE.</strong> Treat <code>settlement_pending</code> as unresolved: reconcile on chain with the returned hash before paying again.</li>
</ul>

<h2 id="facilitators">Migration steps for facilitators</h2>
<ul>
  <li>List V2 kinds in <code>GET /supported</code>: <code>x402Version</code> 2 with CAIP-2 networks. A facilitator can list V1 and V2 kinds side by side, since each kind carries its own <code>x402Version</code>.</li>
  <li>Add the now-required <code>extensions</code> array and <code>signers</code> map, which pairs CAIP-2 patterns such as <code>eip155:*</code> with your public signer addresses.</li>
  <li>Keep <code>/verify</code> read-only: the V2 specification states it must not commit payment state or write on chain.</li>
  <li>Return <code>settlement_pending</code>, with a non-empty <code>transaction</code> and <code>network</code>, when a broadcast transaction cannot be confirmed in time. The <a href="/learn/x402-facilitator-security">facilitator security guide</a> explains why.</li>
</ul>

<h2 id="verify-the-migration">Verify the migration</h2>
<p>Settlens tests x402 V2 only, which makes it a direct way to confirm a migration from the outside. A passive scan sends no payment. Against an endpoint that still answers the V1 way, with the terms in the body, the header check fails. The bundled demo's <code>/missing-header</code> route answers 402 without the header, and a V1 server gives the same result:</p>
${terminal({ title: "Passive scan of a V1-style endpoint (demo target)", lines: V1_SCAN })}
<p>Once the server sends a valid V2 header, every passive check passes:</p>
${terminal({ title: "Passive scan of a V2 endpoint (demo target)", lines: V2_SCAN })}
<p>Two more signals help during the transition:</p>
<ul>
  <li>A V1 object Base64-encoded into a V2 header is rejected too. Passed to the MCP tool <code>evaluate_payment_requirements</code> when this page was built, the V1 example above got the decision <code>${V1_VERDICT.result.decision}</code>, with ${V1_FAILS.map((id, index) => html`${index ? (index === V1_FAILS.length - 1 ? " and " : ", ") : ""}<code>${id}</code>`)} failing.</li>
  <li>A facilitator scan (<code>settlens facilitator</code>) fails <code>facilitator.supported_schema</code> while <code>/supported</code> still has the V1 shape, without <code>extensions</code> and <code>signers</code>, and <code>facilitator.v2_capability</code> when it lists no <code>x402Version</code> 2 kind.</li>
</ul>
${ifPage(ctx, "/tools/x402-checker", html`<p>To check one header by hand, paste it into the <a href="/tools/x402-checker">x402 payment request checker</a>.</p>`)}
<p>To gate every deploy on these checks, see <a href="/product/ci">CI gating</a>; the <a href="/docs/checks">check reference</a> lists each check with its fix.</p>

<h2 id="compatibility">Compatibility during the transition</h2>
<p>The official <code>@x402/core</code> schemas parse both versions, keyed on <code>x402Version</code>, but the two wire formats do not mix: a V1 client looks for the terms in a response body that V2 leaves to the server, and a V2 client finds no <code>PAYMENT-REQUIRED</code> header on a V1 response. Facilitators differ in which versions they still accept, and <code>/supported</code> is where each one says so, kind by kind. The specifications set no end-of-life date for V1; this page does not guess one.</p>

<h2 id="faq">Frequently asked questions</h2>
${faq([
  {
    q: "Is x402 V2 backward compatible with V1?",
    a: "Not on the wire. V2 moves the payment terms into the PAYMENT-REQUIRED header and renames the client and settlement headers, so each side must speak the same version. A server or facilitator can support both by branching on x402Version.",
  },
  {
    q: "What replaces maxAmountRequired in x402 V2?",
    a: "The amount field. It is still an integer string in the asset's atomic units. For the exact scheme it is the exact amount to pay; for the upto scheme it is the maximum authorized at verification time.",
  },
  {
    q: "Does Settlens test x402 V1 endpoints?",
    a: "No. Settlens checks x402 V2 only. A V1 endpoint fails the PAYMENT-REQUIRED header check, which is how a scan confirms that a migration has not shipped yet.",
  },
])}`;
}
