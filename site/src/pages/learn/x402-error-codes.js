// /learn/x402-error-codes: every error code of the x402 V2 core specification, section 9, listed
// exactly as specified (checked on CHECKED_ON), with fixes and the Settlens check where one really
// exists. The verify-payment rows are computed at build time with src/signature.js.

import { getCheck } from "../../../../src/catalog.js";
import { verifyExactEvmPayment } from "../../../../src/signature.js";
import { CHECKED_ON, SOURCES } from "./_shared.js";

export const meta = {
  path: "/learn/x402-error-codes",
  title: "x402 error codes: meanings and fixes",
  heading: "x402 error codes reference",
  label: "Error codes",
  description:
    "Every x402 V2 error code with its meaning, the fix and the Settlens check that detects it where one exists, including the non-terminal settlement_pending.",
  lede: "The x402 V2 specification defines a short list of error codes that facilitators and resource servers return when a payment fails. This reference gives each code's meaning as specified, what to do about it, and the Settlens check that catches the cause in advance, where one exists.",
  summary:
    "The x402 V2 specification defines 16 error codes, returned in invalidReason (verify) or errorReason (settle). Signature, amount, recipient and time-window codes point at the payer's authorization; settlement_pending is the only one marked non-terminal: reconcile on chain with the returned hash before retrying.",
  sources: [SOURCES.x402, SOURCES.x402V1, SOURCES.exactEvm, SOURCES.x402Http],
  section: "learn",
  order: 8,
  icon: "alert",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "Errors", "Reference"],
  related: ["/learn/x402-facilitator-security", "/learn/eip-3009", "/learn/x402-v2-headers"],
};

const VERIFY = "verify-payment";

// Section 9 of the x402 V2 core specification, in its order. `settlens` names a real check or
// verify-payment field that detects the cause; leave it out when nothing does.
const CODES = [
  { code: "insufficient_funds", group: "funds", meaning: "Client does not have enough tokens to complete the payment.", fix: "Fund the payer's wallet with the advertised asset on the advertised network, or choose another accepts entry.", why: "balances are chain state, which Settlens never reads." },
  { code: "invalid_exact_evm_payload_authorization_valid_after", group: "authorization", meaning: "Payment authorization is not yet valid (before validAfter timestamp).", fix: "Set validAfter in the past when signing, and check the signer's clock.", settlens: { label: "fresh", tool: VERIFY } },
  { code: "invalid_exact_evm_payload_authorization_valid_before", group: "authorization", meaning: "Payment authorization has expired (after validBefore timestamp).", fix: "Sign a new authorization with a later validBefore, and submit it promptly.", settlens: { label: "fresh", tool: VERIFY } },
  { code: "invalid_exact_evm_payload_authorization_value_mismatch", group: "authorization", meaning: "Payment amount does not exactly match the required amount.", fix: "Sign value equal to the requirement's amount, in atomic units.", settlens: { label: "amountBound", tool: VERIFY } },
  { code: "invalid_exact_evm_payload_signature", group: "authorization", meaning: "Payment authorization signature is invalid or improperly signed.", fix: "Rebuild the EIP-712 domain from extra.name, extra.version, the chain id and the asset, and sign with the from address.", settlens: { label: "signatureValid", tool: VERIFY } },
  { code: "invalid_exact_evm_payload_recipient_mismatch", group: "authorization", meaning: "Recipient address does not match payment requirements.", fix: "Sign to equal to the requirement's payTo.", settlens: { label: "recipientBound", tool: VERIFY } },
  { code: "invalid_network", group: "request", meaning: "Specified blockchain network is not supported.", fix: "Use a CAIP-2 network that the facilitator lists in GET /supported.", settlens: { check: "facilitator.requirement_coverage" } },
  { code: "invalid_payload", group: "request", meaning: "Payment payload is malformed or contains invalid data.", fix: "Send a PaymentPayload with x402Version, accepted and the scheme's payload, Base64 JSON encoded.", why: "passive scans never send a payload. verify-payment does refuse an exact EVM payload without authorization and signature." },
  { code: "invalid_payment_requirements", group: "request", meaning: "Payment requirements object is invalid or malformed.", fix: "Fix the server's accepts entry: CAIP-2 network, positive integer amount, asset, payTo and maxTimeoutSeconds.", settlens: { check: "schema.payment_requirements" } },
  { code: "invalid_scheme", group: "request", meaning: "Specified payment scheme is not supported.", fix: "Use a scheme that the facilitator lists in GET /supported for that network.", settlens: { check: "facilitator.requirement_coverage" } },
  { code: "unsupported_scheme", group: "request", meaning: "Payment scheme is not supported by the facilitator.", fix: "Point the resource at a facilitator that supports the scheme, or stop advertising it.", settlens: { check: "facilitator.requirement_coverage" } },
  { code: "invalid_x402_version", group: "request", meaning: "Protocol version is not supported.", fix: "Send x402Version 2 end to end, or use a facilitator that lists your version in GET /supported.", settlens: { check: "facilitator.v2_capability" } },
  { code: "invalid_transaction_state", group: "funds", meaning: "Blockchain transaction failed or was rejected.", fix: "Inspect the transaction on chain (nonce already used, reverted call, gas) before trying again.", why: "the transaction only exists at settlement, which Settlens never performs." },
  { code: "unexpected_verify_error", group: "unexpected", meaning: "Unexpected error occurred during payment verification.", fix: "Retry later; if it persists, read the facilitator's logs. /verify must not commit payment state, so nothing should have been charged.", why: "a facilitator's internal failures are not observable from outside." },
  { code: "unexpected_settle_error", group: "unexpected", meaning: "Unexpected error occurred during payment settlement.", fix: "Check on chain whether a transaction was broadcast before retrying.", why: "Settlens never calls /settle." },
  { code: "settlement_pending", group: "funds", meaning: "The settlement transaction was broadcast but its confirmation could not be established. Non-terminal: the transaction may still confirm. The response must carry a non-empty transaction and the network.", fix: "Reconcile the returned transaction hash on chain; retry only once it has failed or been dropped.", why: "Settlens never calls /settle." },
];
// meta.summary says 16: update it with the list. Codes without a check explain why.
for (const entry of CODES) if (!entry.settlens && !entry.why) throw new Error(`/learn/x402-error-codes: ${entry.code} needs a check or a why.`);
if (CODES.length !== 16) throw new Error(`/learn/x402-error-codes: ${CODES.length} codes listed, the summary says 16.`);
for (const entry of CODES) if (entry.settlens?.check && !getCheck(entry.settlens.check)) throw new Error(`/learn/x402-error-codes: unknown check id ${entry.settlens.check}`);

const GROUPS = [
  { id: "authorization", title: "Authorization errors (exact scheme on EVM)", intro: "The payer's signed EIP-3009 authorization does not match the requirement or its time window. They come from the facilitator's checks on the payload." },
  { id: "request", title: "Request and support errors", intro: "The payload or the requirement is malformed, or names a version, scheme or network the facilitator does not support." },
  { id: "funds", title: "Funds and settlement errors", intro: "The problem lies with the payer's balance or the settlement transaction. insufficient_funds can come from /verify or /settle: the specification's examples show both." },
  { id: "unexpected", title: "Unexpected errors", intro: "The facilitator failed for a reason outside the payment." },
];

// The specification's example payment, then one field changed at a time, through verify-payment.
const REQUIREMENT = { scheme: "exact", network: "eip155:84532", amount: "10000", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } };
const PAYLOAD = {
  signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
  authorization: { from: "0x857b06519E91e3A54538791bDbb0E22373e36b66", to: REQUIREMENT.payTo, value: "10000", validAfter: "1740672089", validBefore: "1740672154", nonce: "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480" },
};
const INSIDE = 1740672100;
const LABELS = {
  invalid_exact_evm_payload_recipient_mismatch: "Recipient mismatch",
  invalid_exact_evm_payload_authorization_value_mismatch: "Value mismatch",
  invalid_exact_evm_payload_authorization_valid_after: "Not yet valid",
  invalid_exact_evm_payload_authorization_valid_before: "Expired",
  invalid_exact_evm_payload_signature: "Invalid signature",
};
const FIELDS = ["signatureValid", "recipientBound", "amountBound", "fresh"];
const TAMPERED = [
  ["Specification example, inside its window", REQUIREMENT, INSIDE, null],
  ["Requirement payTo changed", { ...REQUIREMENT, payTo: "0x000000000000000000000000000000000000dEaD" }, INSIDE, "invalid_exact_evm_payload_recipient_mismatch"],
  ["Requirement amount changed to 20000", { ...REQUIREMENT, amount: "20000" }, INSIDE, "invalid_exact_evm_payload_authorization_value_mismatch"],
  ["Checked before validAfter", REQUIREMENT, 1740672000, "invalid_exact_evm_payload_authorization_valid_after"],
  ["Checked after validBefore", REQUIREMENT, 1740672200, "invalid_exact_evm_payload_authorization_valid_before"],
  ["Network changed to eip155:8453", { ...REQUIREMENT, network: "eip155:8453" }, INSIDE, "invalid_exact_evm_payload_signature"],
].map(([label, requirement, now, code]) => {
  const result = verifyExactEvmPayment({ requirement, payload: PAYLOAD, now });
  return { label, code, result, failed: FIELDS.filter((field) => result[field] === false) };
});
if (TAMPERED[0].failed.length || TAMPERED.slice(1).some((row) => row.failed.length !== 1)) {
  throw new Error("/learn/x402-error-codes: verify-payment no longer isolates one field per tampered row; review the table.");
}

export default function render(ctx) {
  const { html, table, callout, faq, formatDate } = ctx;
  const settlensLine = (entry) => {
    if (!entry.settlens) return `None: ${entry.why}`;
    if (entry.settlens.check) {
      const check = getCheck(entry.settlens.check);
      return html`<code>${check.id}</code> (${check.mode}): ${check.verifies}`;
    }
    return html`<code>${entry.settlens.tool}</code> reports <code>${entry.settlens.label}: false</code> for the same condition, offline.`;
  };
  const mapped = CODES.filter((entry) => entry.settlens).length;
  return html`<p>Section 9 of the <a href="${SOURCES.x402.url}">x402 V2 core specification</a> lists ${CODES.length} standard error codes "that may be returned by facilitators or resource servers". A facilitator returns them in <code>invalidReason</code> of a <code>VerifyResponse</code> or <code>errorReason</code> of a <code>SettleResponse</code>; over HTTP, a failed settlement reaches the client in the <a href="/learn/x402-v2-headers#payment-response"><code>PAYMENT-RESPONSE</code></a> header of a 402 response. Each code below is spelled exactly as in the specification, with its meaning, a fix and, for ${mapped} of them, the Settlens check or <code>verify-payment</code> field that detects the cause before payment. For the others, the entry says why no check applies: usually the cause lies in chain state or settlement, which Settlens never touches.</p>
${callout({
  tone: "note",
  title: `Checked on ${formatDate(CHECKED_ON)}`,
  body: html`<p>The list matches section 9 of the V2 core specification in the x402-foundation/x402 repository on that date. Codes are added as the specification evolves: <code>settlement_pending</code> is new in V2, for example.</p>`,
})}
${GROUPS.map(
  (group) => html`<h2 id="${group.id}">${group.title}</h2>
<p>${group.intro}</p>
${CODES.filter((entry) => entry.group === group.id).map(
  (entry) => html`<h3 id="${entry.code}"><code>${entry.code}</code></h3>
<p>${entry.meaning}</p>
<p><strong>Fix:</strong> ${entry.fix}</p>
<p><strong>Settlens:</strong> ${settlensLine(entry)}</p>`,
)}`,
)}

<h2 id="settlement-pending">settlement_pending in detail</h2>
<p><a href="/learn/glossary#settlement-pending"><code>settlement_pending</code></a> is the only code the specification marks as non-terminal. A facilitator may return it when it broadcast the settlement transaction but could not establish its confirmation, for example after a node error or a timeout while waiting for the receipt. The <code>SettleResponse</code> must then carry the non-empty <code>transaction</code> hash and the <code>network</code>.</p>
<ul>
  <li><strong>Resource servers</strong> should not treat it as a failure to retry with a new authorization: that authorization has a new nonce and can settle on top of the first one.</li>
  <li><strong>Clients</strong> should reconcile the hash on chain before paying again.</li>
  <li><strong>Facilitators</strong> should return it rather than a generic error whenever a transaction may still confirm. The <a href="/learn/x402-facilitator-security">facilitator security guide</a> covers the other settlement risks.</li>
</ul>

<h2 id="verify-payment">Authorization errors you can reproduce offline</h2>
<p>The five authorization codes describe properties of the signed payload, which Settlens' offline <code>verify-payment</code> (and the MCP tool <code>verify_payment_signature</code>) check without a node. The table was computed when this page was built: the specification's example payment, then one value changed at a time. Each change turns exactly one field false, the one that matches the code a facilitator would return.</p>
${table({
  caption: "verify-payment on the specification example with one field changed",
  head: ["Change", "Fields that turn false", "Matching code"],
  rows: TAMPERED.map((row) => [row.label, row.failed.length ? html`${row.failed.map((field, index) => html`${index ? ", " : ""}<code>${field}</code>`)}` : "None: verified", row.code ? html`<a href="#${row.code}">${LABELS[row.code]}</a>` : "None"]),
  rowHeaders: true,
})}
<p>Changing the network changes the EIP-712 domain, so the signature recovers a different address: that is a signature error, not a network error. The <a href="/learn/eip-3009">EIP-3009 guide</a> explains why, and <a href="/product/verify">Verify</a> describes the offline check.</p>

<h2 id="other-codes">Codes outside section 9</h2>
<ul>
  <li><strong>Scheme-specific codes.</strong> The <a href="${SOURCES.exactEvm.url}">exact EVM scheme</a> defines <code>PERMIT2_ALLOWANCE_REQUIRED</code>, returned with HTTP 412 Precondition Failed when the payer's ERC-20 allowance to the Permit2 contract does not cover the amount and no gas-sponsoring extension applies.</li>
  <li><strong>V1.</strong> The <a href="${SOURCES.x402V1.url}">V1 specification</a> used <code>invalid_exact_evm_payload_authorization_value</code> ("Payment amount is insufficient for the required payment") where V2 has <code>invalid_exact_evm_payload_authorization_value_mismatch</code>, and had no <code>settlement_pending</code>. See the <a href="/learn/x402-v1-to-v2-migration">V1 to V2 migration guide</a>.</li>
  <li><strong>HTTP status.</strong> The <a href="${SOURCES.x402Http.url}">HTTP transport</a> maps categories, not codes: 400 for a malformed payment, 402 when verification or settlement fails, 500 for a server error during payment processing.</li>
</ul>

<h2 id="faq">Frequently asked questions</h2>
${faq([
  {
    q: "What does settlement_pending mean in x402?",
    a: "The facilitator broadcast the settlement transaction but could not confirm it. The code is non-terminal: the response carries the transaction hash and network, and the caller should check that transaction on chain before deciding whether to retry.",
  },
  {
    q: "What is the difference between invalid_scheme and unsupported_scheme?",
    a: "The specification defines invalid_scheme as a scheme that is not supported and unsupported_scheme as a scheme the facilitator does not support. Both mean the same fix: choose a scheme the facilitator lists in GET /supported.",
  },
  {
    q: "Which HTTP status code comes with an x402 error?",
    a: "The HTTP transport maps categories: 400 for an invalid payment, 402 when verification or settlement fails, 500 for a server error. The specific code travels in invalidReason or errorReason.",
  },
])}`;
}
