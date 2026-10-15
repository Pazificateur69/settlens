// /tools/eip-3009-verifier: free browser verifier for an x402 exact EVM payment (EIP-3009, EIP-712). tools.js
// sends the form to verify_payment_signature on the same-origin /mcp. The sample pays the x402 checker's
// sample request; it was signed once with the public throwaway test key 0x11…11 (never a real wallet), and
// the build re-verifies it and the example answers with src/, so a stale sample fails the build.

import { MAX_HEADER_LENGTH } from "../../../../src/constants.js";
import { encodeBase64Json } from "../../../../src/protocol.js";
import { curlCommand, field, resultArea, runTool, toolForm, webApplication } from "./_shared.js";
import { SAMPLE_OPTION, SAMPLE_RESOURCE } from "./x402-checker.js";

const PATH = "/tools/eip-3009-verifier";
const DESCRIPTION =
  "Free EIP-3009 signature verifier for x402: recover the signer of a PAYMENT-SIGNATURE and check its recipient, amount and time window offline. No RPC, no wallet.";

const CHECK_AT = "2026-10-13T10:00:00Z";
const AUTHORIZATION = Object.freeze({
  from: "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a",
  to: SAMPLE_OPTION.payTo,
  value: SAMPLE_OPTION.amount,
  validAfter: "1791885570",
  validBefore: "1791885630",
  nonce: "0xaf4e5ec1828f3f4bde1bd708e9cfa238f4336b2f95736111a4b591ea3c916d07",
});
const SIGNATURE =
  "0x891a819dc49005e71effabe634613e1369899c3560b2c8528f6683e3ec8720fa28978b59ff09405aa6ca9a89712b7cb02d171443a755027d8d2a66dab29be3b61b";
// A PaymentPayload as the x402 V2 HTTP transport carries it in PAYMENT-SIGNATURE (Base64 JSON).
const PAYMENT_PAYLOAD = { x402Version: 2, resource: SAMPLE_RESOURCE, accepted: SAMPLE_OPTION, payload: { signature: SIGNATURE, authorization: AUTHORIZATION } };
const SAMPLE_HEADER = encodeBase64Json(PAYMENT_PAYLOAD);
const REQUIREMENT_JSON = JSON.stringify(SAMPLE_OPTION, null, 2);
const verify = (requirement, payload, now) => runTool("verify_payment_signature", { requirement, payload, now });

// Real answers; the copy describes them, so the build fails if one changes.
const iso = (seconds) => new Date(seconds * 1000).toISOString().replace(".000", "");
const EXAMPLES = [
  { when: `The sample, checked at ${CHECK_AT}`, expect: true, result: await verify(SAMPLE_OPTION, SAMPLE_HEADER, CHECK_AT) },
  { when: "The same payment one minute after validBefore", expect: false, result: await verify(SAMPLE_OPTION, SAMPLE_HEADER, iso(Number(AUTHORIZATION.validBefore) + 60)) },
  { when: "The value raised to 25000 after signing", expect: false, result: await verify(SAMPLE_OPTION, { signature: SIGNATURE, authorization: { ...AUTHORIZATION, value: "25000" } }, CHECK_AT) },
  { when: "Checked against a requirement with another payTo", expect: false, result: await verify({ ...SAMPLE_OPTION, payTo: "0x000000000000000000000000000000000000dEaD" }, SAMPLE_HEADER, CHECK_AT) },
];
for (const example of EXAMPLES) {
  if (example.result.verified !== example.expect) throw new Error(`${PATH}: "${example.when}" now gives verified=${example.result.verified}. Update the sample or the page copy.`);
}
if (EXAMPLES[0].result.recovered !== AUTHORIZATION.from) throw new Error(`${PATH}: the sample no longer recovers to ${AUTHORIZATION.from}.`);
// The copy says raising the value breaks both the signer recovery and the amount binding.
if (EXAMPLES[2].result.signatureValid || EXAMPLES[2].result.amountBound) throw new Error(`${PATH}: the raised-value example no longer fails both checks. Update the page copy.`);

export const meta = {
  path: PATH,
  title: "EIP-3009 signature verifier for x402 (free)",
  heading: "Verify an EIP-3009 payment signature",
  label: "EIP-3009 verifier",
  description: DESCRIPTION,
  section: "tools",
  order: 2,
  icon: "signature",
  lastmod: "2026-10-13",
  priority: 0.7,
  scripts: ["tools"],
  summary:
    "The Settlens EIP-3009 verifier is a free browser tool for x402 exact EVM payments: paste the payment requirement and the PAYMENT-SIGNATURE payload, and it rebuilds the EIP-712 domain, recovers the signer and checks the recipient, amount and validAfter/validBefore window. Offline: no RPC, no wallet.",
  sources: [
    { title: "EIP-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-2: Homestead hard-fork changes (low-s signatures)", url: "https://eips.ethereum.org/EIPS/eip-2", publisher: "Ethereum Improvement Proposals" },
    { title: "x402 exact scheme on EVM", url: "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  jsonLd: [{ "@id": "https://settlens.com/#software" }, webApplication({
    path: PATH,
    name: "Settlens EIP-3009 signature verifier",
    description: DESCRIPTION,
    featureList: [
      "Rebuilds the EIP-712 domain from the x402 payment requirement",
      "Recovers the EIP-3009 TransferWithAuthorization signer",
      "Checks the recipient and amount against payTo and amount",
      "Checks the validAfter and validBefore window at a chosen time",
    ],
  })],
};

export default function render(ctx) {
  const { html } = ctx;
  const code = (text) => html`<code>${text}</code>`;

  const form = toolForm(ctx, {
    tool: "verify_payment_signature",
    id: "ev",
    submitLabel: "Verify the signature",
    sample: { requirement: REQUIREMENT_JSON, payload: SAMPLE_HEADER, now: CHECK_AT },
    fields: html`${field(ctx, { id: "ev-requirement", label: "Payment requirement (JSON)", arg: "requirement", kind: "json", multiline: true, rows: 8, required: true, hint: "The accepts entry the payment was made for: scheme, network, amount, asset, payTo, maxTimeoutSeconds and extra with name and version." })}
${field(ctx, { id: "ev-payload", label: "PAYMENT-SIGNATURE payload", arg: "payload", kind: "header", multiline: true, rows: 6, required: true, maxlength: MAX_HEADER_LENGTH, hint: "The header value (Base64), the decoded PaymentPayload, or an object with signature and authorization." })}
${field(ctx, { id: "ev-now", label: "Check time (optional)", arg: "now", kind: "time", maxlength: 64, hint: "ISO 8601 or Unix seconds. Empty: the current time, so a captured payment is usually reported as outside its window." })}`,
  });

  return html`${ctx.hero({
    title: meta.heading,
    lede: "Paste an x402 payment requirement and the PAYMENT-SIGNATURE that answers it. Settlens rebuilds the EIP-712 domain, recovers the signer and checks that the authorization pays the advertised recipient the advertised amount inside its time window.",
    actions: [
      { label: "Verify a payment signature", href: "#verifier", icon: "arrow-right" },
      { label: "How EIP-3009 works", href: "/learn/eip-3009" },
    ],
    note: "Free and offline: no RPC, no wallet, no payment key.",
  })}
${ctx.section({
  id: "verifier",
  title: "Verify a payment signature",
  lede: html`The sample pays the example request of the <a href="/tools/x402-checker">x402 checker</a>. It was signed with a public test key, never a real wallet, for a 60-second window; the sample sets the check time inside it.`,
  body: html`${ctx.split({
    main: form,
    aside: ctx.prose(html`<h3>Where to find the values</h3>
<p>The requirement is one entry of ${code("accepts")} in the resource's ${code("PAYMENT-REQUIRED")} header. The payload is the ${code("PAYMENT-SIGNATURE")} header the client sent with its retry. Check the requirement the server advertised, not the copy in the payload's ${code("accepted")} field.</p>
<h3>What happens to what you paste</h3>
<p>Your browser sends it to the Settlens MCP endpoint, which runs the offline ${code("verify_payment_signature")} tool in memory and keeps no copy. A signed authorization can be submitted on chain by anyone who holds it until ${code("validBefore")}, so prefer expired captures. Pilot participants can run the same check locally with ${code("settlens verify-payment")}. Details in the <a href="/privacy#mcp-endpoint">privacy notice</a>.</p>`),
  })}
${resultArea(ctx, "ev", "The verdict, the recovered signer and each binding and time check appear here.")}`,
})}
${ctx.section({
  id: "how-it-works",
  title: "How the signature is checked",
  tone: "raised",
  lede: "Everything needed is in the requirement and the payload: no RPC call, no block explorer and no private key.",
  body: html`${ctx.table({
      caption: "Where each EIP-712 domain field comes from",
      head: ["Domain field", "Taken from", "In the sample"],
      rows: [
        [code("name"), code("requirement.extra.name"), code(SAMPLE_OPTION.extra.name)],
        [code("version"), code("requirement.extra.version"), code(SAMPLE_OPTION.extra.version)],
        [code("chainId"), html`The number in ${code("eip155:<id>")}`, code(SAMPLE_OPTION.network.split(":")[1])],
        [code("verifyingContract"), code("requirement.asset"), code(SAMPLE_OPTION.asset)],
      ],
      rowHeaders: true,
    })}
${ctx.steps([
  { title: "Recover the signer", body: html`<p>The EIP-712 digest of the ${code("TransferWithAuthorization")} message is computed and the signer recovered from the 65-byte signature. A high-s signature is refused (see EIP-2). The signer must equal ${code("authorization.from")}.</p>` },
  { title: "Check the binding", body: html`<p>${code("authorization.to")} must equal ${code("payTo")} and ${code("authorization.value")} must equal ${code("amount")}. The asset is bound through the domain: a signature for another token does not recover to the payer.</p>` },
  { title: "Check the time window", body: html`<p>The check time must be strictly after ${code("validAfter")} and strictly before ${code("validBefore")}, as the EIP-3009 reference implementation requires.</p>` },
])}
${ctx.split({
  main: ctx.codeBlock({ lang: "json", title: "The sample PAYMENT-SIGNATURE, decoded", code: JSON.stringify(PAYMENT_PAYLOAD, null, 2), wrap: true }),
  aside: ctx.prose(html`<p>${code("payload.authorization")} holds the signed ${code("TransferWithAuthorization")} fields and ${code("payload.signature")} the 65-byte ${code("r || s || v")} signature over them. ${code("accepted")} is the client's copy of the requirement it chose; the verifier checks against the requirement you paste.</p>
<p>The ${code("nonce")} is 32 random bytes. The token contract records it when the authorization is used, which is how replays fail on chain.</p>`),
})}`,
})}
${ctx.section({
  id: "examples",
  title: "What a rejection looks like",
  lede: "Each check is reported on its own, so the reasons say what to fix: an expired window, a changed amount or the wrong recipient.",
  body: ctx.split({
    main: ctx.verdicts({
      title: "verify_payment_signature",
      meta: "the sample, four inputs",
      items: EXAMPLES.map(({ when, result }) => ({ decision: result.verified ? "verified" : "rejected", tone: result.verified ? "success" : "danger", when, detail: result.reasons.join(" ") || `Recovered ${result.recovered}: every check passed.` })),
      caption: "Real answers computed with the Settlens server code when this page was built.",
    }),
    aside: ctx.prose(html`<p>Raising the value after signing breaks two checks at once: the amount no longer matches the requirement, and the signature no longer recovers to the payer because the signed message changed.</p>
<p>The same verification runs in the <a href="/product/verify">Verify stage</a> of a Settlens assessment, which also checks Solana signers and facilitators.</p>`),
  }),
})}
${ctx.section({
  id: "limits",
  title: "What the verifier does not check",
  tone: "raised",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>No chain state.</strong> No balances, so a verified authorization can still fail to settle for lack of funds.</li>
<li><strong>No replay detection.</strong> It does not check whether the nonce was already used on chain (${code("authorizationState")}).</li>
<li><strong>No settlement.</strong> A verified signature does not prove a transfer happened.</li>
<li><strong>Not the token contract.</strong> The domain name and version come from the requirement; Settlens does not confirm they match the contract deployed at ${code("asset")}.</li>
<li><strong>EOA signatures only.</strong> Only 65-byte ECDSA signatures are recovered. Smart contract wallet signatures (EIP-1271) are rejected.</li>
<li><strong>EIP-3009 only.</strong> Permit2 payloads of the exact EVM scheme are not verified, and the requirement's scheme is not checked to be ${code("exact")}.</li>
<li><strong>EVM only here.</strong> Solana transactions are checked by the ${code("verify_solana_transaction")} MCP tool.</li>
</ul>`),
})}
${ctx.section({
  id: "from-your-agent",
  title: "Use it from your agent or a terminal",
  lede: "The verifier is a page in front of a public MCP tool. An auditor or an agent can call it directly.",
  body: ctx.split({
    main: html`${ctx.codeBlock({ lang: "shell", title: "curl, with the sample", code: curlCommand("verify_payment_signature", { requirement: SAMPLE_OPTION, payload: PAYMENT_PAYLOAD.payload, now: CHECK_AT }), wrap: true })}
${ctx.codeBlock({ lang: "shell", title: "Claude Code", code: "claude mcp add --transport http settlens https://settlens.com/mcp", wrap: true })}`,
    aside: html`${ctx.prose(html`<p>Every argument and output field is in the <a href="/docs/mcp#verify_payment_signature">verify_payment_signature reference</a>. Pilot participants run the same check offline with ${code("settlens verify-payment")}, documented in the <a href="/docs/cli">CLI reference</a>.</p>`)}
${ctx.callout({ tone: "note", title: "Check the request first", body: html`<p>Before a payment is signed, the <a href="/tools/x402-checker">x402 checker</a> decides whether the request should be paid at all.</p>` })}`,
  }),
})}
${ctx.section({
  id: "faq",
  title: "Questions about the EIP-3009 verifier",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Does the verifier need my private key or an RPC node?", a: "No. It recovers the signer from the signature and the signed fields alone. It never asks for a key, never connects to a chain and never pays or settles anything." },
    { q: "Why is the signature valid but the payment rejected?", a: "The signature only proves who signed. The payment is verified when the authorization also pays the requirement's payTo the exact amount and the check time is inside the validAfter to validBefore window. Without a check time, the current time is used, so an old capture is outside its window." },
    { q: "Does a verified result mean the payment settled?", a: "No. It means the authorization is correctly signed and bound to the requirement at the check time. Balances, nonce reuse and settlement are decided on chain." },
    { q: "Are smart contract wallets and Permit2 supported?", a: "No. Only 65-byte ECDSA signatures from externally owned accounts and EIP-3009 TransferWithAuthorization payloads are verified. EIP-1271 signatures and Permit2 payloads are rejected or out of scope." },
  ]),
})}
${ctx.cta({
  title: "Verify payments as part of an assessment",
  body: "A pilot checks one paid endpoint or facilitator end to end, including how its facilitator handles a forged signature, with evidence your partners can verify.",
  actions: [
    { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
    { label: "See offline verification", href: "/product/verify" },
  ],
})}`;
}
