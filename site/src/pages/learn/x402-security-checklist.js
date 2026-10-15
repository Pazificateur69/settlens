// /learn/x402-security-checklist: printable controls for resource servers, facilitators and
// agent clients. Check ids, modes and mode descriptions are read from src/catalog.js at build
// time; an unknown id fails the build so the checklist cannot drift from the scanner.

import { CHECK_MODES, getCheck } from "../../../../src/catalog.js";
import { SOURCES } from "./_shared.js";

const CORE = "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md";
const HTTP = "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md";
const EXACT = "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact.md";
const EXACT_EVM = "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md";

export const meta = {
  path: "/learn/x402-security-checklist",
  title: "x402 security checklist for servers and agents",
  heading: "x402 security checklist",
  label: "Security checklist",
  description:
    "A printable x402 security checklist for resource servers, facilitators and AI agent clients, with the Settlens check that tests each control where one exists.",
  lede: "Concrete controls for the three parties of an x402 payment, grounded in the V2 specifications. Each control lists the Settlens check that tests it, or says plainly when no automated check exists.",
  summary:
    "A checklist of x402 security controls for resource servers, facilitators and agent clients, grounded in the V2 specifications. Each control names the Settlens check that tests it and the mode it needs (passive, offline, active or facilitator), or says plainly that it needs manual review.",
  sources: [SOURCES.x402, SOURCES.x402Http, SOURCES.exact, SOURCES.exactEvm],
  section: "learn",
  order: 5,
  icon: "shield-check",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "Security", "Checklist"],
  related: ["/learn/agent-spending-policy", "/learn/x402-facilitator-security", "/docs/checks"],
};

function checksFor(ids) {
  return ids.map((id) => {
    const check = getCheck(id);
    if (!check) throw new Error(`/learn/x402-security-checklist references unknown check id ${id}`);
    return check;
  });
}

export default function render(ctx) {
  const { html, table, callout } = ctx;

  const SECTIONS = [
    {
      id: "resource-servers",
      title: "Resource servers",
      prefix: "RS",
      intro: html`<p>The service that sells the resource. Most of these controls are visible from outside, so a passive scan tests them without paying.</p>`,
      items: [
        { text: "Answer HTTP 402 to every request that carries no valid payment, before any business logic runs.", ids: ["transport.status_402"] },
        { text: html`Send the terms in the <a href="/learn/glossary#payment-required"><code>PAYMENT-REQUIRED</code></a> header as Base64-encoded JSON. Do not rely on the response body.`, ids: ["transport.payment_required_header", "transport.payment_required_encoding"] },
        { text: html`Emit a V2 object (<code>x402Version</code> 2, a <code>resource</code> object, a non-empty <code>accepts</code> array) that the official <code>@x402/core</code> schema accepts.`, ids: ["schema.payment_required", "schema.official_x402_sdk"] },
        { text: html`Set <code>resource.url</code> to the exact URL the client requested, including path and query.`, ids: ["binding.resource_url"] },
        { text: html`Make every <code>accepts</code> entry complete: scheme, <a href="/learn/glossary#caip-2">CAIP-2</a> network, positive integer amount in <a href="/learn/glossary#atomic-units">atomic units</a>, asset, <code>payTo</code> (a 20-byte address on <code>eip155</code> networks) and a positive <code>maxTimeoutSeconds</code>.`, ids: ["schema.payment_requirements"] },
        { text: html`For EIP-3009 tokens, publish the token's real EIP-712 name and version in <code>extra.name</code> and <code>extra.version</code>.`, ids: [], other: "Not scanned. verify-payment uses them to rebuild the EIP-712 domain." },
        { text: "Advertise each payment option once.", ids: ["schema.duplicate_requirements"] },
        { text: html`Keep <code>maxTimeoutSeconds</code> as short as settlement allows.`, ids: ["freshness.timeout_window"] },
        { text: "Serve paid resources over HTTPS only.", ids: ["transport.https"] },
        { text: "Serve the paid resource at its canonical URL, without redirects.", ids: ["transport.redirect"] },
        { text: "Keep the 402 response small and never put protected content in it.", ids: ["transport.response_body_limit"], other: "Size only: a scan cannot tell whether the body holds protected content." },
        { text: "Return the same terms for identical requests, or bind any dynamic pricing to the request on purpose.", ids: ["stability.payment_requirements"] },
        { text: html`<a href="/learn/glossary#fail-closed">Fail closed</a>: run the handler only after the payment is verified (or settled, under the <code>upfront</code> and <code>escrow</code> flows), never on a missing, malformed or invalid signature.`, ids: ["security.invalid_signature_fail_closed"] },
        { text: "Answer 400 to a malformed payment and 402 to a payment that fails verification or settlement.", ids: ["transport.invalid_payment_status"] },
        { text: html`Match the client's <code>accepted</code> object against your own <code>accepts</code> entries, and send your own requirement to <code>/verify</code> and <code>/settle</code>.`, ids: [] },
        { text: html`Reject transfer methods and payment flows you do not support (<code>extra.assetTransferMethod</code>, <code>extra.paymentFlow</code>).`, ids: [] },
        { text: html`When settlement fails, do not deliver: answer 402 with a <code>PAYMENT-RESPONSE</code> whose <code>success</code> is false. Treat <a href="/learn/x402-error-codes#settlement-pending"><code>settlement_pending</code></a> as unresolved and reconcile on chain before retrying.`, ids: [], other: "Not covered: Settlens never calls /settle." },
        { text: "Re-test after every deploy and on a schedule, so a regression is caught before agents pay into it.", ids: [], other: "settlens monitor and the GitHub Action re-run the passive checks." },
      ],
    },
    {
      id: "facilitators",
      title: "Facilitators",
      prefix: "FA",
      intro: html`<p>The service that verifies and settles payments. Its capability endpoint can be scanned passively; its <code>/verify</code> behavior is tested only during an authorized <a href="/learn/glossary#active-probe">active probe</a>. The <a href="/learn/x402-facilitator-security">facilitator security guide</a> explains the risks behind these controls.</p>`,
      items: [
        { text: html`Serve <code>GET /supported</code> with HTTP 200 and a JSON content type.`, ids: ["facilitator.reachable", "facilitator.supported_status", "facilitator.content_type"] },
        { text: html`Return the standard <code>SupportedResponse</code>: <code>kinds</code>, <code>extensions</code> and <code>signers</code>.`, ids: ["facilitator.supported_schema"] },
        { text: html`List at least one <code>x402Version</code> 2 kind.`, ids: ["facilitator.v2_capability"] },
        { text: "List each version, scheme and network combination once.", ids: ["facilitator.duplicate_kinds"] },
        { text: html`Publish signer addresses for every network you settle on, or for its CAIP-2 namespace wildcard such as <code>eip155:*</code>.`, ids: ["facilitator.signer_coverage"] },
        { text: "Support every scheme and network that the resource servers you serve advertise.", ids: ["facilitator.requirement_coverage"] },
        { text: "Serve the facilitator API over HTTPS only.", ids: ["facilitator.https"] },
        { text: html`Keep <code>/supported</code> small.`, ids: ["facilitator.response_body_limit"] },
        { text: html`Answer <code>/verify</code> with a standard <code>VerifyResponse</code> carrying a boolean <code>isValid</code>.`, ids: ["facilitator.verify_reachable", "facilitator.verify_response_schema"] },
        { text: html`Verify the signature cryptographically before answering <code>isValid: true</code>. A forged or all-zero signature must be rejected.`, ids: ["security.facilitator_rejects_invalid_signature"] },
        { text: html`Keep <code>/verify</code> read-only: it must not commit payment state or write on chain.`, ids: [] },
        { text: html`For EIP-3009, check that the signer is <code>authorization.from</code> and never the zero address, the balance, the exact amount, the validity window, the token and the network, then simulate <code>transferWithAuthorization</code>.`, ids: [], other: "verify-payment checks signer, recipient, amount and window offline; balance and simulation need the chain." },
        { text: html`Make settlement produce exactly one transfer of <code>amount</code> of <code>asset</code> to <code>payTo</code>, and return a failure, never a success, when the authorization's nonce is already used.`, ids: [], other: "Not covered: Settlens never calls /settle." },
        { text: html`Return <code>settlement_pending</code> with the broadcast transaction hash when confirmation cannot be established.`, ids: [], other: "Not covered: Settlens never calls /settle." },
      ],
    },
    {
      id: "agent-clients",
      title: "Agent clients",
      prefix: "AG",
      intro: html`<p>The software that pays, often an AI agent with a wallet. These controls decide whether to sign at all. The policy checks run offline in the <a href="/mcp">Settlens MCP server</a>, so an agent can apply them to every 402 before paying. How to write the policy is covered in the <a href="/learn/agent-spending-policy">agent spending policy guide</a>.</p>`,
      items: [
        { text: html`Read the terms from <code>PAYMENT-REQUIRED</code> and validate them before signing: Base64 JSON, V2 shape, the official schema and well-formed options.`, ids: ["transport.payment_required_encoding", "schema.official_x402_sdk", "schema.payment_required", "schema.payment_requirements"] },
        { text: html`Check that <code>resource.url</code> equals the URL you requested.`, ids: ["binding.resource_url"] },
        { text: "Pay only over HTTPS.", ids: ["transport.https"] },
        { text: html`Allowlist recipients (<code>payTo</code>).`, ids: ["policy.recipient"] },
        { text: "Allowlist assets: token contract addresses or mints.", ids: ["policy.asset"] },
        { text: "Cap the amount in atomic units and pair the cap with an asset allowlist: a ceiling means nothing without the asset, because tokens have different decimals.", ids: ["policy.maximum_amount"] },
        { text: "Restrict networks and schemes to the ones you can verify.", ids: ["policy.network", "policy.scheme"] },
        { text: "Pay only with an option that satisfies every constraint at once; when none does, do not pay.", ids: ["policy.acceptable_option"] },
        { text: html`Skip options whose <code>paymentFlow</code> you do not recognize, and prefer <code>authorization</code> when a resource also offers <code>upfront</code> or <code>escrow</code>.`, ids: [] },
        { text: html`Sign exactly the advertised amount to the advertised <code>payTo</code>, with a short <code>validBefore</code> and a random 32-byte <a href="/learn/glossary#nonce">nonce</a>.`, ids: [], other: "verify-payment checks the signed authorization offline." },
        { text: "Treat terms that change between identical requests as a reason to stop and review.", ids: ["stability.payment_requirements"] },
      ],
    },
  ];

  const all = SECTIONS.flatMap((section) => section.items);
  const mapped = all.filter((item) => item.ids.length).length;
  const coverage = (item) => {
    const checks = checksFor(item.ids);
    const label = checks.length ? "Settlens" : "Coverage";
    const ids = checks.map((check, index) => html`${index ? ", " : ""}<code>${check.id}</code> (${check.mode})`);
    const rest = item.other ?? (checks.length ? "" : "No automated check: review manually.");
    return html`<small><strong>${label}:</strong> ${ids}${checks.length && rest ? ". " : ""}${rest}</small>`;
  };

  return html`<p>This checklist turns the <a href="${CORE}">x402 V2 core</a>, <a href="${HTTP}">HTTP transport</a> and <a href="${EXACT}">exact scheme</a> specifications into ${all.length} controls: ${SECTIONS.map((section, index) => html`${index ? (index === SECTIONS.length - 1 ? " and " : ", ") : ""}${section.items.length} for ${section.title.toLowerCase()}`)}. ${mapped} of them map to at least one automated Settlens check. For the others, the coverage line says what helps, or that the control needs your own review.</p>
<p>Use the identifiers (RS-01, FA-01, AG-01) to track findings. The page is printable: navigation, footer and the table of contents are hidden in the print view.</p>
${callout({
  tone: "info",
  title: "How to read the coverage line",
  body: html`<p>Under each control, a check id names the Settlens check that tests it, followed by the mode the check needs; see <a href="#check-modes">check modes</a> below. Full definitions, severities and remediation are in the <a href="/docs/checks">check reference</a>.</p>`,
})}
${SECTIONS.map(
  (section) => html`<h2 id="${section.id}">${section.title}</h2>
${section.intro}
${table({
  caption: `${section.title}: x402 security controls`,
  head: ["ID", "Control and coverage"],
  rows: section.items.map((item, index) => [`${section.prefix}-${String(index + 1).padStart(2, "0")}`, html`${item.text}<br>${coverage(item)}`]),
  rowHeaders: true,
})}`,
)}

<h2 id="check-modes">Check modes</h2>
<p>Each Settlens check runs in one mode. The descriptions below come from the check catalog.</p>
${table({
  caption: "Settlens check modes",
  head: ["Mode", "What it needs"],
  rows: Object.entries(CHECK_MODES).map(([mode, text]) => [mode, text]),
  rowHeaders: true,
})}
${callout({
  tone: "warning",
  title: "Active checks need written authorization",
  body: html`<p>Checks in the active mode run only with <code>--active --authorized --authorization-ref</code> and the endpoint owner's approval. They send one intentionally invalid <code>PAYMENT-SIGNATURE</code>, never call <code>/settle</code>, never move funds and need no wallet or private key.</p>`,
})}

<h2 id="what-the-checklist-does-not-cover">What this checklist does not cover</h2>
<p>It covers the x402 exchange itself. It does not replace an application security review, smart contract audits of the tokens you accept, key management for the wallets that sign or settle, or legal and regulatory advice. A Settlens report is evidence of observed behavior, not a certification.</p>
<p>To understand the protocol behind each control, read <a href="/learn/what-is-x402">What is x402?</a>, the <a href="/learn/x402-v2-headers">V2 headers reference</a> and the <a href="/learn/eip-3009">EIP-3009 guide</a>, with terms defined in the <a href="/learn/glossary">glossary</a>. To see these controls fail in practice, read <a href="/blog/x402-security-failure-modes">x402 security failure modes</a>. For signature-level details of the EVM flow, see the <a href="${EXACT_EVM}">exact EVM scheme specification</a>.</p>`;
}
