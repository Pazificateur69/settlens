// /product/verify: offline payment verification (verify-payment) and facilitator checks.
// Transcripts are real output; payment.json was signed with a throwaway test key (0x11…11),
// solana-payment.json is a partially signed v0 transaction built with throwaway ed25519 keys.

import { catalogChecks, checkTable, otherStages, SOFTWARE } from "./_stage-kit.js";

const PATH = "/product/verify";
const DESCRIPTION =
  "Verify captured x402 payments offline: EIP-3009 signer recovery, recipient, amount and time-window binding, Solana signer checks and facilitator checks.";

export const meta = {
  path: PATH,
  title: "Verify x402 payments offline: EIP-3009 and Solana",
  label: "Verify",
  description: DESCRIPTION,
  section: "product",
  lastmod: "2026-10-13",
  order: 3,
  icon: "signature",
  summary:
    "Settlens Verify checks a captured x402 payment offline. For the exact EVM scheme it recovers the EIP-3009 / EIP-712 signer and checks recipient, amount, asset and the validity window; for Solana it checks every ed25519 signer slot. It reads no chain state: balances, nonce use and settlement are not checked.",
  sources: [
    { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: "Ethereum Improvement Proposals" },
    { title: "x402 exact scheme on EVM", url: "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md", publisher: "x402 Foundation" },
    { title: "x402 exact scheme on Solana", url: "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md", publisher: "x402 Foundation" },
    { title: "ERC-1271: Standard Signature Validation Method for Contracts", url: "https://eips.ethereum.org/EIPS/eip-1271", publisher: "Ethereum Improvement Proposals" },
  ],
  jsonLd: SOFTWARE,
};

const PAYMENT_JSON = `{
  "requirement": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USDC", "version": "2" }
  },
  "payload": {
    "signature": "0x03d6ea795b1a4d72ac92b359a7794c718f98caa5a57f6de53ab962ac3a63572600c44fb8ffdc405a13b9b7326f0e5891d3858c6a92780af43ad95c70e9e506221b",
    "authorization": {
      "from": "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "10000",
      "validAfter": "1791885175",
      "validBefore": "1791888835",
      "nonce": "0x2222222222222222222222222222222222222222222222222222222222222222"
    }
  }
}`;

const VERIFIED_LINES = [
  { kind: "cmd", text: "settlens verify-payment payment.json --now 2026-10-13T10:00:00Z" },
  { kind: "pass", text: "VERIFIED exact EVM payment authorization" },
  { kind: "out", text: "Recovered signer: 0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a" },
  { kind: "out", text: "Signature valid:  true" },
  { kind: "out", text: "Recipient bound:  true" },
  { kind: "out", text: "Amount bound:     true" },
  { kind: "out", text: "Within window:    true (at 1791885600)" },
];

const TAMPERED_LINES = [
  { kind: "cmd", text: "settlens verify-payment payment-tampered.json --now 2026-10-13T10:00:00Z" },
  { kind: "fail", text: "REJECTED exact EVM payment authorization" },
  { kind: "out", text: "Recovered signer: 0x742f0030214a80ec488d5cf429a3b603ca97d3ba" },
  { kind: "fail", text: "Signature valid:  false" },
  { kind: "out", text: "Recipient bound:  true" },
  { kind: "fail", text: "Amount bound:     false" },
  { kind: "out", text: "Within window:    true (at 1791885600)" },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - Recovered signer 0x742f0030214a80ec488d5cf429a3b603ca97d3ba does not match authorization.from 0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a." },
  { kind: "muted", text: "  - authorization.value does not match requirement.amount." },
];

const SOLANA_LINES = [
  { kind: "cmd", text: "settlens verify-payment solana-payment.json" },
  { kind: "pass", text: "VERIFIED Solana transaction (v0)" },
  { kind: "out", text: "Fee payer:        3EyEVVQ7iRg5KbiArQc83W7yJzjhjJjwUXpyHaisVD58 (signature pending: added by the facilitator at settlement)" },
  { kind: "muted", text: "Signer 0:         3EyEVVQ7iRg5KbiArQc83W7yJzjhjJjwUXpyHaisVD58 pending" },
  { kind: "out", text: "Signer 1:         J2mxWfLWmRqMtDRA5DtwaaW3ZATnijyXvgy9f2XpYWeb valid" },
  { kind: "out", text: "Signatures valid: true" },
];

const SUPPORTED_LINES = [
  { kind: "cmd", text: "settlens facilitator http://127.0.0.1:4402/facilitator --no-write" },
  { kind: "out", text: "Settlens x402 assessment c693475c" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/facilitator/supported" },
  { kind: "pass", text: "8 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 8 pass · 0 fail · 0 warn · 0 skip" },
];

const VERIFY_BYPASS_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-accept \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-003 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 01f41c77" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "26 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Facilitator /verify rejects an invalid signature" },
  { kind: "muted", text: "       The facilitator reported isValid=true for an intentionally invalid, all-zero signature." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 26 pass · 1 fail · 0 warn · 0 skip" },
];

const EVM_SVG = `<svg viewBox="0 0 720 440" width="720" height="440" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="24" y="16" width="430" height="64" rx="10"/>
  <text class="d-title" x="239" y="42" text-anchor="middle">Rebuild the EIP-712 domain</text>
  <text class="d-label" x="239" y="66" text-anchor="middle">extra.name · extra.version · asset · chainId</text>
  <path class="d-line" d="M239 80v20"/><path class="d-head" d="M233 94l6 8 6-8"/>
  <rect class="d-node" x="24" y="104" width="430" height="64" rx="10"/>
  <text class="d-title" x="239" y="130" text-anchor="middle">Hash the authorization</text>
  <text class="d-label" x="239" y="154" text-anchor="middle">TransferWithAuthorization(from, to, value, …)</text>
  <path class="d-line" d="M239 168v20"/><path class="d-head" d="M233 182l6 8 6-8"/>
  <rect class="d-node" x="24" y="192" width="430" height="64" rx="10"/>
  <text class="d-title" x="239" y="218" text-anchor="middle">EIP-712 digest</text>
  <text class="d-label" x="239" y="242" text-anchor="middle">keccak256(0x1901 ‖ domain ‖ struct)</text>
  <path class="d-line" d="M239 256v20"/><path class="d-head" d="M233 270l6 8 6-8"/>
  <rect class="d-node" x="24" y="280" width="430" height="64" rx="10"/>
  <text class="d-title" x="239" y="306" text-anchor="middle">Recover the signer</text>
  <text class="d-label" x="239" y="330" text-anchor="middle">secp256k1 · 65-byte r‖s‖v · low-s only</text>
  <path class="d-line" d="M239 344v20"/><path class="d-head" d="M233 358l6 8 6-8"/>
  <rect class="d-node d-node--accent" x="24" y="368" width="430" height="52" rx="10"/>
  <text class="d-label d-label--accent" x="239" y="399" text-anchor="middle">signer == authorization.from</text>
  <text class="d-note" x="478" y="36">Binding and freshness</text>
  <rect class="d-node" x="478" y="52" width="218" height="52" rx="10"/>
  <text class="d-label" x="587" y="83" text-anchor="middle">to == payTo</text>
  <rect class="d-node" x="478" y="120" width="218" height="52" rx="10"/>
  <text class="d-label" x="587" y="151" text-anchor="middle">value == amount</text>
  <rect class="d-node" x="478" y="188" width="218" height="76" rx="10"/>
  <text class="d-label" x="587" y="220" text-anchor="middle">validAfter &lt; now</text>
  <text class="d-label" x="587" y="244" text-anchor="middle">now &lt; validBefore</text>
  <path class="d-line" d="M587 264v96"/><path class="d-head" d="M581 354l6 8 6-8"/>
  <path class="d-line" d="M454 394h20"/><path class="d-head" d="M468 388l8 6-8 6"/>
  <rect class="d-node d-node--accent" x="478" y="368" width="218" height="52" rx="10"/>
  <text class="d-title" x="587" y="399" text-anchor="middle">VERIFIED if all hold</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  const facilitatorChecks = catalogChecks((check) => check.mode === "facilitator", "the facilitator capability checks");
  const verifyProbeChecks = catalogChecks(
    (check) => check.mode === "active" && /facilitator/.test(check.id),
    "the facilitator /verify probe checks",
  );

  return html`${ctx.hero({
    title: "Verify x402 payments offline, without a node or a key",
    lede: "Give Settlens a captured payment and the requirement it was made for. It recovers the EIP-3009 signer offline and checks that the authorization pays the advertised recipient the advertised amount within its time window. It also checks the facilitator that is supposed to do the same.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Verify from an agent (MCP)", href: "/mcp" },
    ],
    note: "Real output. The payment was signed with a throwaway test key for this page.",
    aside: ctx.terminal({ title: "settlens verify-payment", lines: VERIFIED_LINES }),
  })}
${ctx.section({
  id: "what-it-verifies",
  title: "What Verify proves",
  body: ctx.featureGrid([
    { icon: "signature", title: "Who signed it", body: "For the exact scheme on eip155 networks, the EIP-3009 TransferWithAuthorization signer is recovered and must equal authorization.from." },
    { icon: "lock", title: "What it pays, and to whom", body: "authorization.to must equal payTo and authorization.value must equal amount. The asset is bound too: it is the EIP-712 verifying contract." },
    { icon: "clock", title: "When it is valid", body: "The check time must fall strictly between validAfter and validBefore, as EIP-3009 requires, so expired or not-yet-valid authorizations are rejected." },
    { icon: "key", title: "Solana signers", body: "For solana networks, every signature slot is checked against its account key with ed25519, in legacy and versioned transactions. An empty fee-payer slot is reported as pending: the facilitator signs it at settlement." },
    { icon: "layers", title: "Facilitator capabilities", body: "GET /supported is checked for schema, x402 V2 support, signer metadata and coverage of what your resource advertises." },
    { icon: "shield", title: "Facilitator fails closed", body: "With authorization, Settlens sends /verify an all-zero signature and expects isValid to be false. It never calls /settle." },
  ]),
})}
${ctx.section({
  id: "how-it-works",
  title: "How EVM verification works",
  tone: "raised",
  lede: "Everything Settlens needs is in the requirement and the payload. No RPC call, no block explorer, no key.",
  body: html`${ctx.diagram({
      svg: EVM_SVG,
      size: "wide",
      label: "Verification pipeline. On the left: rebuild the EIP-712 domain from extra.name, extra.version, the asset and the chain id; hash the TransferWithAuthorization; compute the EIP-712 digest; recover the signer from the 65-byte signature, rejecting high-s values; the signer must equal authorization.from. On the right: authorization.to must equal payTo, value must equal amount, and the check time must be strictly between validAfter and validBefore. The payment is verified only if every check holds.",
      caption: "Left: the cryptographic path. Right: the binding checks against the requirement. The result is VERIFIED only when all of them pass.",
    })}
${ctx.steps([
      { title: "Rebuild the domain", body: html`<p>Name and version come from <code>requirement.extra</code>, the chain id from the <code>eip155:&lt;id&gt;</code> network, the verifying contract from <code>requirement.asset</code>. Without <code>extra.name</code> and <code>extra.version</code> the payment is rejected.</p>` },
      { title: "Recover the signer", body: html`<p>The EIP-712 digest of the <code>TransferWithAuthorization</code> is computed and the signer recovered from the 65-byte signature. High-s signatures are refused, as USDC and OpenZeppelin's ECDSA library refuse them.</p>` },
      { title: "Bind and time-check", body: html`<p>Recipient and amount are compared with the requirement, and the window with the check time: the current clock, or the time given with <code>--now</code>. Each result is reported separately.</p>` },
    ])}`,
})}
${ctx.section({
  id: "example",
  title: "Example: a valid payment and a tampered one",
  lede: html`<code>verify-payment</code> reads a JSON file with the requirement and the payload. It also accepts the x402 field names <code>paymentRequirements</code> and <code>paymentPayload</code>.`,
  body: html`${ctx.split({
    main: ctx.codeBlock({ lang: "json", title: "payment.json (test key)", code: PAYMENT_JSON }),
    aside: html`${ctx.prose(html`<p>To build <code>payment-tampered.json</code>, the value was raised from 10000 to 25000 after signing. Two things break at once: the amount no longer matches the requirement, and the signature no longer recovers to the payer, because the signed message changed.</p>`)}
${ctx.terminal({ title: "A tampered amount is caught twice", lines: TAMPERED_LINES })}`,
  })}
${ctx.table({
  caption: "verify-payment exit codes",
  head: ["Code", "Meaning"],
  rows: [
    ["0", "VERIFIED: every check passed."],
    ["1", "REJECTED: at least one check failed. The reasons are listed."],
    ["2", "The file could not be used, for example a network other than eip155 or solana, or a missing requirement or payload."],
  ],
  rowHeaders: true,
})}`,
})}
${ctx.section({
  id: "solana",
  title: "Solana transactions",
  tone: "raised",
  body: ctx.split({
    main: ctx.prose(html`<p>When the requirement's network starts with <code>solana:</code>, <code>verify-payment</code> reads <code>payload.transaction</code>, a Base64 serialized transaction. It detects legacy and versioned (v0) messages and checks each signature slot against the account key at the same position with ed25519. Each signer is printed in base58 with its status: <code>valid</code>, <code>invalid</code> or <code>pending</code>.</p>
<p><strong>Partially signed payloads verify.</strong> In the x402 exact scheme on Solana, the client signs its part and the facilitator, as fee payer, adds its signature at settlement. A <code>PAYMENT-SIGNATURE</code> payload therefore arrives with an empty fee-payer slot. Settlens reports an empty slot as pending, not as a failure. The transaction is VERIFIED when at least one signature is present, every present signature is valid, and the number of slots matches the message header. The example here is such a payload, built with throwaway test keys.</p>
<p>This check proves who signed the transaction. It does not decode instructions, so it does not compare the transfer with <code>payTo</code>, <code>amount</code> or <code>asset</code>.</p>`),
    aside: ctx.terminal({ title: "A client payload before settlement", lines: SOLANA_LINES }),
  }),
})}
${ctx.section({
  id: "facilitator",
  title: "Facilitator checks",
  lede: html`A facilitator verifies and settles payments for resource servers. Settlens checks what it advertises and, with authorization, whether its <code>/verify</code> endpoint rejects a forged payment. Background: <a href="/learn/x402-facilitator-security">x402 facilitator security</a>.`,
  body: html`${ctx.split({
    main: html`${ctx.prose(html`<h3>Capabilities: GET /supported</h3>
<p><code>settlens facilitator &lt;base-url&gt;</code> reads <code>/supported</code> and checks the HTTP status, JSON media type, HTTPS, response size, the SupportedResponse schema, at least one x402 V2 kind and duplicate kinds. Add <code>--facilitator</code> to a scan and Settlens also checks that every scheme and network your resource advertises is covered, with signer metadata for each network.</p>`)}
${ctx.terminal({ title: "Capability scan of the demo facilitator", lines: SUPPORTED_LINES })}`,
    aside: html`${ctx.prose(html`<h3>Fail-closed: POST /verify</h3>
<p>During an <a href="/product/assess#active-probe">authorized active probe</a> with <code>--facilitator</code>, Settlens posts the same deliberately invalid payload to <code>/verify</code>. The answer must be a VerifyResponse with a boolean <code>isValid</code>, and <code>isValid</code> must be false. A facilitator that accepts an all-zero signature is a critical verification bypass.</p>`)}
${ctx.terminal({ title: "A facilitator that accepts a forged payment", lines: VERIFY_BYPASS_LINES })}`,
  })}
${checkTable(ctx, { caption: `Facilitator capability checks (${facilitatorChecks.length})`, checks: facilitatorChecks })}
${checkTable(ctx, { caption: `Facilitator /verify probe, authorized only (${verifyProbeChecks.length})`, checks: verifyProbeChecks })}`,
})}
${ctx.section({
  id: "agents",
  title: "The same checks for AI agents",
  tone: "raised",
  body: ctx.split({
    main: ctx.prose(html`<p>The <a href="/mcp">Settlens MCP server</a> exposes these verifications as offline tools: <code>verify_payment_signature</code> for EVM authorizations and <code>verify_solana_transaction</code> for Solana transactions. Neither needs network access or a key.</p>
<p><code>verify_payment_signature</code> also accepts the raw Base64 <code>PAYMENT-SIGNATURE</code> header and a <code>now</code> time, which lets an auditor check a captured authorization against the moment it was used rather than today.</p>
<p>To verify one payment in the browser, paste the requirement and the payload in the free <a href="/tools/eip-3009-verifier">EIP-3009 signature verifier</a>.</p>`),
    aside: ctx.callout({ tone: "info", title: "Check a capture at the time it was used", body: html`<p>By default <code>verify-payment</code> checks the window against the current clock, so a capture verified after its <code>validBefore</code> is reported as outside its window. Pass <code>--now</code> with Unix seconds or an ISO 8601 time to check it at the moment it was used; the output prints the time it used.</p>` }),
  }),
})}
${ctx.section({
  id: "limitations",
  title: "What Verify does not check",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>No RPC, no chain state.</strong> Settlens does not read balances, so a verified authorization can still fail to settle for lack of funds.</li>
<li><strong>No replay detection.</strong> It does not check whether the EIP-3009 nonce was already used on chain, or whether a Solana transaction was already processed.</li>
<li><strong>No settlement.</strong> It does not prove a transfer happened. Settlens never calls <code>/settle</code> and never broadcasts a transaction.</li>
<li><strong>Not the token contract.</strong> The domain name and version are taken from the requirement; Settlens does not confirm they match the contract deployed at <code>asset</code>.</li>
<li><strong>EOA signatures only.</strong> Only 65-byte ECDSA signatures are recovered. Smart-contract wallet signatures (EIP-1271) are not supported and are rejected.</li>
<li><strong>Solana: signatures only.</strong> Instructions, amounts and recipients are not decoded. A pending slot, such as the fee payer's before settlement, is reported but cannot be checked until it is signed.</li>
<li><strong>EIP-3009 only on EVM.</strong> The exact EVM scheme also defines Permit2 and ERC-7710 payloads; Settlens does not verify them. <code>verify-payment</code> treats every eip155 requirement as EIP-3009 and does not check that its scheme is <code>exact</code>.</li>
<li><strong>One forged payload class.</strong> The <code>/verify</code> probe sends one all-zero payload. Passing it does not prove the facilitator verifies every payment correctly.</li>
</ul>`),
})}
${ctx.section({
  id: "faq",
  title: "Questions about verification",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Does Settlens need an RPC endpoint or an API key?", a: "No. Verification is pure computation on the requirement and the payload: the EIP-712 domain is rebuilt from the requirement, and the signer is recovered locally." },
    { q: "Can it tell me whether a payment settled?", a: "No. It verifies the authorization, not the transfer. Settlement, balances and nonce use live on chain, and Settlens does not read the chain." },
    { q: "Why does a tampered amount also break the signature?", a: "The signature covers the amount. Change it and the recovered address no longer matches authorization.from, so both the signature and the amount checks fail." },
    { q: "Which payment formats are supported?", a: "The exact scheme with EIP-3009 TransferWithAuthorization on eip155 networks, and Solana transactions, fully or partially signed, for the signer checks. Permit2 and ERC-7710 payloads are not supported. Other networks stop with exit code 2." },
    { q: "Does the facilitator probe settle anything?", a: "No. It calls /verify once with a payload that cannot be valid. Settlens never calls /settle." },
  ]),
})}
${ctx.section({
  id: "related",
  title: "Related",
  body: html`${ctx.cards(otherStages(PATH), { columns: 4 })}
${ctx.prose(html`<p>Background: <a href="/learn/eip-3009">EIP-3009 explained</a> · <a href="/tools/eip-3009-verifier">verify one payment in the browser</a> · <a href="/docs/mcp">MCP tool reference</a> · <a href="/use-cases/facilitators">Settlens for facilitators</a> · <a href="/blog/mcp-verify-before-paying">verify before paying</a>.</p>`)}`,
})}
${ctx.cta({
  title: "Check a facilitator or a payment flow",
  body: "In a pilot we run the capability scan, the authorized /verify probe and offline verification on payments you capture.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Use the MCP server", href: "/mcp" },
  ],
})}`;
}
