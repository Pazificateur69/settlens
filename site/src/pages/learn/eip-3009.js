// /learn/eip-3009: EIP-3009 + EIP-712 as used by the x402 exact EVM scheme.
// Hashes and the verification result of the specification's example are computed at build time
// with src/signature.js; CLI transcripts are real `settlens verify-payment` output (2026-10-13).

import { domainSeparator, eip3009Digest, transferWithAuthorizationHash, verifyExactEvmPayment } from "../../../../src/signature.js";
import { SOURCES, ifPage } from "./_shared.js";

const EIP3009 = "https://eips.ethereum.org/EIPS/eip-3009";
const EIP712 = "https://eips.ethereum.org/EIPS/eip-712";
const EIP2612 = "https://eips.ethereum.org/EIPS/eip-2612";
const EIP2 = "https://eips.ethereum.org/EIPS/eip-2";
const EIP155 = "https://eips.ethereum.org/EIPS/eip-155";
const EXACT_EVM = "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md";
const CORE = "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md";

export const meta = {
  path: "/learn/eip-3009",
  title: "EIP-3009 transferWithAuthorization for x402",
  heading: "EIP-3009 and EIP-712 in x402 payments",
  label: "EIP-3009",
  description:
    "How EIP-3009 transferWithAuthorization and the EIP-712 domain power x402 exact EVM payments, field by field, and what can be verified offline versus on chain.",
  lede: "On EVM chains, the x402 exact scheme uses EIP-3009 authorizations by default: the payer signs an EIP-712 message off chain and the facilitator submits it. This guide explains every signed field, how the x402 exact scheme fills them in, and what a signature does and does not prove.",
  summary:
    "By default, x402's exact scheme on EVM chains has the payer sign an EIP-3009 transferWithAuthorization with EIP-712: from, to, value, a validity window and a random nonce, bound to one token and chain. The facilitator submits it and cannot change amount or recipient; balance and nonce use need chain state.",
  sources: [SOURCES.eip3009, SOURCES.eip712, SOURCES.eip155, SOURCES.eip2, SOURCES.eip2612, SOURCES.exactEvm, SOURCES.x402],
  section: "learn",
  order: 4,
  icon: "signature",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["EIP-3009", "EIP-712", "x402", "Signatures"],
  related: ["/learn/x402-v2-headers", "/product/verify", "/learn/x402-security-checklist"],
};

// The PAYMENT-SIGNATURE example of the x402 V2 HTTP transport specification.
const REQUIREMENT = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "10000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
};
const AUTHORIZATION = {
  from: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  value: "10000",
  validAfter: "1740672089",
  validBefore: "1740672154",
  nonce: "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
};
const SIGNATURE =
  "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c";
const DOMAIN = { name: "USDC", version: "2", chainId: 84532, verifyingContract: REQUIREMENT.asset };
const SIGNED_AT = 1740672100; // inside the example's validAfter/validBefore window

const hex = (bytes) => `0x${Buffer.from(bytes).toString("hex")}`;

const MAPPING_SVG = `<svg viewBox="0 0 720 356" width="720" height="356" xmlns="http://www.w3.org/2000/svg">
  <title>How an x402 exact EVM payment becomes an EIP-712 digest</title>
  <desc>The EIP-712 domain is rebuilt from the payment requirement, the TransferWithAuthorization message comes from the payload, both are hashed into a digest, and the signer recovered from the signature must equal authorization.from.</desc>
  <rect class="d-zone" x="16" y="36" width="688" height="100" rx="10"/>
  <text class="d-title" x="32" y="60">EIP-712 domain, rebuilt from the payment requirement</text>
  <rect class="d-node" x="32" y="72" width="150" height="52" rx="10"/>
  <rect class="d-node" x="202" y="72" width="150" height="52" rx="10"/>
  <rect class="d-node" x="372" y="72" width="150" height="52" rx="10"/>
  <rect class="d-node" x="542" y="72" width="150" height="52" rx="10"/>
  <text class="d-label d-label--accent" x="107" y="94" text-anchor="middle">name</text>
  <text class="d-text" x="107" y="114" text-anchor="middle">= extra.name</text>
  <text class="d-label d-label--accent" x="277" y="94" text-anchor="middle">version</text>
  <text class="d-text" x="277" y="114" text-anchor="middle">= extra.version</text>
  <text class="d-label d-label--accent" x="447" y="94" text-anchor="middle">chainId</text>
  <text class="d-text" x="447" y="114" text-anchor="middle">= eip155:&lt;chainId&gt;</text>
  <text class="d-label d-label--accent" x="617" y="94" text-anchor="middle">verifyingContract</text>
  <text class="d-text" x="617" y="114" text-anchor="middle">= asset</text>
  <rect class="d-zone d-zone--blue" x="16" y="150" width="688" height="100" rx="10"/>
  <text class="d-title" x="32" y="174">TransferWithAuthorization message, from the payload</text>
  <rect class="d-node" x="32" y="186" width="100" height="52" rx="10"/>
  <rect class="d-node" x="144" y="186" width="100" height="52" rx="10"/>
  <rect class="d-node" x="256" y="186" width="100" height="52" rx="10"/>
  <rect class="d-node" x="368" y="186" width="100" height="52" rx="10"/>
  <rect class="d-node" x="480" y="186" width="100" height="52" rx="10"/>
  <rect class="d-node" x="592" y="186" width="100" height="52" rx="10"/>
  <text class="d-label" x="82" y="208" text-anchor="middle">from</text>
  <text class="d-text" x="82" y="228" text-anchor="middle">the signer</text>
  <text class="d-label" x="194" y="208" text-anchor="middle">to</text>
  <text class="d-text" x="194" y="228" text-anchor="middle">= payTo</text>
  <text class="d-label" x="306" y="208" text-anchor="middle">value</text>
  <text class="d-text" x="306" y="228" text-anchor="middle">= amount</text>
  <text class="d-label" x="418" y="208" text-anchor="middle">validAfter</text>
  <text class="d-text" x="418" y="228" text-anchor="middle">in the past</text>
  <text class="d-label" x="530" y="208" text-anchor="middle">validBefore</text>
  <text class="d-text" x="530" y="228" text-anchor="middle">in the future</text>
  <text class="d-label" x="642" y="208" text-anchor="middle">nonce</text>
  <text class="d-text" x="642" y="228" text-anchor="middle">random</text>
  <path class="d-msg" d="M166 250V278"/><path class="d-head" d="M160 272l6 8 6-8"/>
  <text class="d-note" x="178" y="270">hash domain and message</text>
  <rect class="d-node" x="16" y="284" width="300" height="56" rx="10"/>
  <text class="d-title" x="166" y="306" text-anchor="middle">EIP-712 digest</text>
  <text class="d-label" x="166" y="328" text-anchor="middle">keccak256(0x1901 ‖ domain ‖ msg)</text>
  <path class="d-msg" d="M316 312H350"/><path class="d-head" d="M344 306l8 6-8 6"/>
  <rect class="d-node" x="356" y="284" width="168" height="56" rx="10"/>
  <text class="d-title" x="440" y="306" text-anchor="middle">ecrecover</text>
  <text class="d-label" x="440" y="328" text-anchor="middle">(v, r, s) → signer</text>
  <path class="d-msg" d="M524 312H550"/><path class="d-head" d="M544 306l8 6-8 6"/>
  <rect class="d-node d-node--accent" x="556" y="284" width="148" height="56" rx="10"/>
  <text class="d-title" x="630" y="306" text-anchor="middle">Valid when</text>
  <text class="d-label d-label--accent" x="630" y="328" text-anchor="middle">signer == from</text>
</svg>`;

const EXPIRED_LINES = [
  { kind: "cmd", text: "settlens verify-payment payment.json --now 2026-10-13T10:00:00Z" },
  { kind: "fail", text: "REJECTED exact EVM payment authorization" },
  { kind: "out", text: "Recovered signer: 0x857b06519e91e3a54538791bdbb0e22373e36b66" },
  { kind: "out", text: "Signature valid:  true" },
  { kind: "out", text: "Recipient bound:  true" },
  { kind: "out", text: "Amount bound:     true" },
  { kind: "out", text: "Within window:    false (at 1791885600)" },
  { kind: "muted", text: "Reasons:" },
  { kind: "muted", text: "  - authorization is outside its validAfter/validBefore window (EIP-3009 requires validAfter < now < validBefore)." },
];

const OTHER_CHAIN_LINES = [
  { kind: "cmd", text: "settlens verify-payment payment-base-mainnet.json --now 2026-10-13T10:00:00Z" },
  { kind: "fail", text: "REJECTED exact EVM payment authorization" },
  { kind: "out", text: "Recovered signer: 0x46e5af7a18131f1bc0947cf44151ee84b58c92a9" },
  { kind: "out", text: "Signature valid:  false" },
  { kind: "out", text: "Recipient bound:  true" },
  { kind: "out", text: "Amount bound:     true" },
  { kind: "out", text: "Within window:    false (at 1791885600)" },
  { kind: "muted", text: "Reasons:" },
  { kind: "muted", text: "  - Recovered signer 0x46e5af7a18131f1bc0947cf44151ee84b58c92a9 does not match authorization.from 0x857b06519E91e3A54538791bDbb0E22373e36b66." },
  { kind: "muted", text: "  - authorization is outside its validAfter/validBefore window (EIP-3009 requires validAfter < now < validBefore)." },
];

export default function render(ctx) {
  const { html, table, comparisonTable, codeBlock, callout, diagram, terminal, faq } = ctx;
  const atSigning = { ...verifyExactEvmPayment({ requirement: REQUIREMENT, payload: { signature: SIGNATURE, authorization: AUTHORIZATION }, now: SIGNED_AT }), checkedAt: SIGNED_AT };
  if (!atSigning.verified) throw new Error("/learn/eip-3009: the specification example no longer verifies; review the page.");
  return html`<p><a href="${EIP3009}">EIP-3009</a>, "Transfer With Authorization", is a draft ERC created in 2020. It adds functions to an ERC-20 token so a holder can authorize a transfer by signing a typed message, and anyone holding that signature can submit it on chain. The signer never sends a transaction or pays gas. The signature itself follows <a href="${EIP712}">EIP-712</a>, the standard for hashing and signing typed structured data.</p>
<p>In x402, EIP-3009 is the default <a href="/learn/glossary#asset-transfer-method">asset transfer method</a> of the <a href="${EXACT_EVM}"><code>exact</code> scheme on EVM chains</a>, recommended for tokens that implement <code>transferWithAuthorization</code> natively, with USDC as the specification's example. Tokens without it use <a href="/learn/glossary#permit2">Permit2</a>, and smart accounts can use ERC-7710 delegation; both have a different payload and are out of scope here.</p>

<h2 id="transfer-with-authorization">What transferWithAuthorization does</h2>
<p>The token contract exposes this function. It checks the authorization and the signature, marks the <a href="/learn/glossary#nonce">nonce</a> as used and moves <code>value</code> from <code>from</code> to <code>to</code>:</p>
${codeBlock({ lang: "text", title: "EIP-3009 interface (excerpt)", code: `function transferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;

function authorizationState(address authorizer, bytes32 nonce)
    external view returns (bool);

event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);` })}
<p>The EIP also defines <code>receiveWithAuthorization</code>, which additionally requires the caller to be the payee, and an optional <code>cancelAuthorization</code> that lets the payer cancel an authorization before it is used.</p>

<h2 id="authorization-fields">The authorization fields</h2>
<p>These six values are what the payer signs. In an x402 payload they travel as strings in <code>payload.authorization</code>, next to the 65-byte <code>signature</code>.</p>
${table({
  caption: "TransferWithAuthorization fields and what the EIP-3009 reference implementation enforces",
  head: ["Field", "Type", "Meaning", "Enforced on chain"],
  rows: [
    [html`<code>from</code>`, "address", "The payer, who signs.", "The recovered signer must equal from."],
    [html`<code>to</code>`, "address", "The payee.", "Funds go here and nowhere else."],
    [html`<code>value</code>`, "uint256", "Amount in the token's atomic units.", "Exactly this amount is transferred."],
    [html`<code>validAfter</code>`, "uint256", "Unix time after which the authorization is valid.", html`<code>now &gt; validAfter</code>`],
    [html`<code>validBefore</code>`, "uint256", "Unix time before which it is valid.", html`<code>now &lt; validBefore</code>`],
    [html`<code>nonce</code>`, "bytes32", "A random 32-byte value chosen by the payer.", "Must be unused for this payer, then marked used."],
  ],
  rowHeaders: true,
})}
<p>The nonces are random rather than sequential, one of the two differences the EIP lists against <a href="${EIP2612}">EIP-2612</a> permits; the other is that tokens move directly, without the ERC-20 allowance step. With sequential nonces, pending authorizations fail when they are submitted out of order; random nonces let a payer create many authorizations in parallel without that risk. Anyone can ask <code>authorizationState(from, nonce)</code> whether a nonce has been used.</p>

<h2 id="eip-712-domain">The EIP-712 domain</h2>
<p>EIP-712 signs a hash of typed data inside a <em>domain</em>, so a signature made for one contract on one chain cannot be replayed elsewhere. EIP-3009 uses four domain fields:</p>
<ul>
  <li><code>name</code>: the human-readable name of the signing domain, here the token's EIP-712 name.</li>
  <li><code>version</code>: the current major version of the domain. Signatures from different versions are not compatible.</li>
  <li><code>chainId</code>: the <a href="${EIP155}">EIP-155</a> chain id.</li>
  <li><code>verifyingContract</code>: the contract that verifies the signature, here the token itself.</li>
</ul>
<p>The digest the payer signs combines the <a href="/learn/glossary#domain-separator">domain separator</a> with the hash of the message:</p>
${codeBlock({ lang: "text", title: "EIP-712 digest for TransferWithAuthorization", code: `domainSeparator = keccak256(abi.encode(
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    keccak256(name), keccak256(version), chainId, verifyingContract))

structHash = keccak256(abi.encode(
    TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
    from, to, value, validAfter, validBefore, nonce))

digest = keccak256(0x1901 ‖ domainSeparator ‖ structHash)

TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
  keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
  = 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267` })}
<p>Wallets produce this signature with <code>eth_signTypedData_v4</code>, given the domain, the type definitions and the message.</p>

<h2 id="x402-exact-evm">How the x402 exact EVM scheme uses it</h2>
<p>An x402 payment requirement carries everything needed to rebuild the domain, and the payload carries the message. The <a href="/learn/glossary#facilitator">facilitator</a>, which submits the transaction and pays the gas, cannot change the amount or the destination: both are inside the signed message.</p>
${diagram({
  svg: MAPPING_SVG,
  label: "Diagram: the EIP-712 domain fields name, version, chainId and verifyingContract come from the requirement's extra.name, extra.version, eip155 network and asset; the message fields from, to, value, validAfter, validBefore and nonce come from the payload, with to equal to payTo and value equal to amount; both are hashed into the EIP-712 digest, ecrecover returns the signer, and the payment is valid when the signer equals from.",
  caption: "Where each signed value comes from in an x402 exact EVM payment.",
  size: "wide",
})}
${table({
  caption: "x402 requirement fields and their role in the EIP-3009 signature",
  head: ["x402 field", "Role in the signature"],
  rows: [
    [html`<code>extra.name</code>`, html`Signed as the domain <code>name</code>. Required for EIP-3009: a wrong name produces a signature the token rejects.`],
    [html`<code>extra.version</code>`, html`Signed as the domain <code>version</code>. Required for EIP-3009, for the same reason.`],
    [html`<code>network</code>`, html`Its reference is the domain <code>chainId</code>: <code>eip155:84532</code> signs chain 84532. Binds the signature to one chain.`],
    [html`<code>asset</code>`, html`Signed as the domain <code>verifyingContract</code>. Binds the signature to one token contract.`],
    [html`<code>payTo</code>`, html`Must equal the message's <code>to</code>, or the payment goes elsewhere.`],
    [html`<code>amount</code>`, html`Must equal the message's <code>value</code>. The core specification lists <code>invalid_exact_evm_payload_authorization_value_mismatch</code> for this case (see the <a href="/learn/x402-error-codes">x402 error codes</a>).`],
    [html`<code>maxTimeoutSeconds</code>`, "Not signed. It is the maximum time allowed for payment completion; keep the authorization window short as well."],
  ],
  rowHeaders: true,
})}
<p>According to the <a href="${EXACT_EVM}">exact EVM specification</a>, a facilitator verifying an EIP-3009 payment checks that the signature recovers to <code>authorization.from</code>, that the payer has enough balance, that the amount and validity window meet the requirement, that the token and network match, and then simulates <code>transferWithAuthorization</code>. Settlement calls that function with the signature and the authorization. The <a href="${CORE}">core specification</a> adds that EIP-3009 contracts prevent nonce reuse on chain, which is what stops a replayed authorization.</p>

<h2 id="worked-example">Worked example: the specification's own payment</h2>
<p>The <code>PAYMENT-SIGNATURE</code> example in the x402 V2 HTTP transport specification is a real signature. Settlens' verifier, run when this page was built, rebuilds the domain from the example requirement and recovers the payer:</p>
${table({
  caption: "Values computed at build time from the specification example",
  head: ["Value", "Result"],
  rows: [
    ["Domain", html`<code>name "USDC", version "2", chainId 84532, verifyingContract ${REQUIREMENT.asset}</code>`],
    ["Domain separator", html`<code>${hex(domainSeparator(DOMAIN))}</code>`],
    ["Struct hash", html`<code>${hex(transferWithAuthorizationHash(AUTHORIZATION))}</code>`],
    ["Digest", html`<code>${hex(eip3009Digest(DOMAIN, AUTHORIZATION))}</code>`],
    ["Recovered signer", html`<code>${atSigning.recovered}</code>, equal to <code>authorization.from</code>`],
  ],
  rowHeaders: true,
})}
<p>The authorization was valid for 65 seconds on February 27, 2025, between <code>validAfter</code> 1740672089 and <code>validBefore</code> 1740672154. Checked at a time inside that window, for example with the MCP tool <code>verify_payment_signature</code> and its <code>now</code> argument, every property holds:</p>
${codeBlock({ lang: "json", title: "verify_payment_signature result with now = 1740672100", code: JSON.stringify(atSigning, null, 2) })}
<p>Checked with the CLI at a time on October 13, 2026 (<code>--now</code>; without it the CLI uses its clock), long after the window closed, the same file is rejected for that reason alone:</p>
${terminal({ title: "settlens verify-payment (window expired)", lines: EXPIRED_LINES })}
<p>Change only the network in the requirement to Base mainnet (<code>eip155:8453</code>) and the rebuilt domain has a different <code>chainId</code>. The digest changes, so the signature recovers a different, meaningless address. This is the cross-chain replay protection EIP-712 provides:</p>
${terminal({ title: "settlens verify-payment (same signature, other chain)", lines: OTHER_CHAIN_LINES })}

<h2 id="offline-vs-onchain">What can be verified offline, and what needs the chain</h2>
<p>A signature check proves that the payer agreed to specific terms. It does not prove the payment will settle. The split matters when you decide what an offline verification, such as Settlens' <code>verify-payment</code>, can tell you.</p>
${comparisonTable({
  caption: "Properties of an EIP-3009 payment authorization by where they can be checked",
  columns: ["Property", "Offline, no RPC", "Needs chain state"],
  rows: [
    { label: "Signature recovers to authorization.from", values: [true, false] },
    { label: "to equals the advertised payTo", values: [true, false] },
    { label: "value equals the advertised amount", values: [true, false] },
    { label: "Bound to the advertised token and chain", values: ["Yes, through the domain", false] },
    { label: "Inside validAfter and validBefore", values: ["Yes, against a clock", false] },
    { label: "extra.name and extra.version are the token's real domain", values: [false, true] },
    { label: "Payer balance covers value", values: [false, true] },
    { label: "Nonce not used yet (authorizationState)", values: [false, true] },
    { label: "Token implements transferWithAuthorization", values: [false, true] },
    { label: "Transfer settled", values: [false, true] },
  ],
  highlight: 1,
})}
<p>Settlens' <code>verify-payment</code> covers the first five rows and stops there by design: it needs no RPC, wallet or key, and it never checks balances, nonce use or settlement. Read more on the <a href="/product/verify">Verify product page</a> or in the <a href="/docs/cli">CLI reference</a>.${ifPage(ctx, "/tools/eip-3009-verifier", html` To check one payment without installing anything, use the <a href="/tools/eip-3009-verifier">EIP-3009 signature verifier</a>.`)}</p>

<h2 id="security-notes">Security notes for implementers</h2>
<ul>
  <li><strong>Reject the zero address.</strong> <code>ecrecover</code> returns the zero address for a malformed signature; EIP-3009 requires rejecting it, otherwise funds of the zero address could be "authorized".</li>
  <li><strong>Prefer canonical signatures.</strong> <a href="${EIP2}">EIP-2</a> made transaction signatures with an <code>s</code> value above <code>secp256k1n/2</code> invalid, but the <code>ecrecover</code> precompile still accepts them, so each signature has a malleable twin. Settlens rejects high-s signatures.</li>
  <li><strong>Use short windows and random nonces.</strong> Anyone who obtains a signed authorization can submit it until <code>validBefore</code>, even if the resource was never delivered. Generate each nonce randomly.</li>
  <li><strong>Check the domain hints.</strong> An offline check compares the signature with the domain the server advertised. If <code>extra.name</code> or <code>extra.version</code> are wrong, the signature verifies offline and still fails on chain.</li>
  <li><strong>Contracts should receive, not transfer.</strong> EIP-3009 warns that a contract wrapping <code>transferWithAuthorization</code> can be front-run from the mempool, and recommends <code>receiveWithAuthorization</code>, which checks that the caller is the payee.</li>
</ul>
${callout({
  tone: "info",
  title: "Checklist",
  body: html`<p>These points, and the server and facilitator behaviors around them, are part of the <a href="/learn/x402-security-checklist">x402 security checklist</a>.</p>`,
})}

<h2 id="faq">Frequently asked questions</h2>
${faq([
  {
    q: "How is EIP-3009 different from an EIP-2612 permit?",
    a: "An EIP-2612 permit approves an allowance with a sequential nonce, and a second transaction spends it with transferFrom. EIP-3009 moves the tokens directly in one call and uses random 32-byte nonces, so several authorizations can be pending at once.",
  },
  {
    q: "Can the facilitator change the amount or the recipient?",
    a: "No. to and value are part of the signed message. Changing either changes the digest, so the signature no longer recovers to the payer and the token rejects the transfer.",
  },
  {
    q: "Does a valid signature mean the payment will settle?",
    a: "No. Settlement also needs enough balance, an unused nonce, a token that implements EIP-3009 with the advertised domain, and a successful transaction. Those depend on chain state.",
  },
  {
    q: "Why does x402 put the token name and version in extra?",
    a: "They are part of the EIP-712 domain. Without them the client cannot build the digest to sign, and a verifier cannot rebuild it to check the signature without calling the chain.",
  },
])}`;
}
