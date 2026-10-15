// Persona page: operators of x402 facilitators (/supported, /verify, /settle).
// Terminal transcripts are real CLI output against the bundled demo target (npm run demo:server).

import { CHECK_CATALOG } from "../../../../src/catalog.js";
import { assertValidConfig, checkTable, prettyJson, SOFTWARE } from "./_shared.js";

export const meta = {
  path: "/use-cases/facilitators",
  title: "x402 facilitator testing: /supported and /verify",
  description:
    "Check that your x402 facilitator advertises valid V2 capabilities and signers, covers the terms resources advertise, and rejects forged signatures at /verify.",
  section: "use-cases",
  label: "Facilitators",
  icon: "layers",
  order: 2,
  lastmod: "2026-10-13",
  summary:
    "Settlens tests an x402 facilitator without moving funds: it checks the GET /supported response, cross-checks it against the terms resources advertise and, with the operator's authorization, confirms that POST /verify rejects an intentionally invalid signature. It never calls /settle and needs no wallet or payment key.",
  sources: [
    { title: "x402 protocol specification, version 2 (§5.4 VerifyResponse, §7 facilitator interface)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "Scheme exact on EVM: EIP-3009 authorization payload and verification", url: "https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md", publisher: "x402 Foundation" },
    { title: "EIP-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: "Ethereum Improvement Proposals" },
    { title: "CAIP-2: Blockchain ID specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  changefreq: "monthly",
  jsonLd: SOFTWARE,
};

// Every facilitator check in the catalog, plus the critical /verify finding (category "security").
const FACILITATOR_CHECKS = CHECK_CATALOG.filter(
  (check) => check.category === "facilitator" || check.id === "security.facilitator_rejects_invalid_signature",
).map((check) => check.id);

const CONFIG = assertValidConfig({
  version: 1,
  failOn: "high",
  targets: [
    {
      name: "reference-resource",
      url: "https://api.staging.example.com/v1/forecast",
      facilitator: {
        name: "staging-facilitator",
        url: "https://facilitator.staging.example.com",
        timeoutMs: 8000,
        headers: { Authorization: "Bearer ${FACILITATOR_TOKEN}" },
      },
    },
  ],
});

const VERIFY_FAIL_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-accept \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref PILOT-FAC-001 --no-write" },
  { kind: "out", text: "Settlens x402 assessment f6968418" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "26 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Facilitator /verify rejects an invalid signature" },
  { kind: "muted", text: "       The facilitator reported isValid=true for an intentionally invalid, all-zero signature." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 26 pass · 1 fail · 0 warn · 0 skip" },
];

const SUPPORTED_LINES = [
  { kind: "cmd", text: "settlens facilitator http://127.0.0.1:4402/facilitator --no-write" },
  { kind: "out", text: "Settlens x402 assessment 41fa3ca8" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/facilitator/supported" },
  { kind: "pass", text: "8 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "pass", text: "Total: 8 pass · 0 fail · 0 warn · 0 skip" },
];

const COVERAGE_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator-empty --no-write" },
  { kind: "out", text: "Settlens x402 assessment 7047aa73" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "22 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL high     Facilitator covers advertised payment requirements" },
  { kind: "muted", text: "       1 advertised payment choice(s) are absent from facilitator capabilities." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 22 pass · 1 fail · 0 warn · 0 skip" },
];

const VERIFY_PAYMENT_LINES = [
  { kind: "cmd", text: "settlens verify-payment payment.json --now 2026-10-13T10:00:00Z" },
  { kind: "fail", text: "REJECTED exact EVM payment authorization" },
  { kind: "out", text: "Signature valid:  false" },
  { kind: "out", text: "Recipient bound:  true" },
  { kind: "out", text: "Amount bound:     true" },
  { kind: "out", text: "Within window:    true (at 1791885600)" },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - Signature verification failed: invalid signature r: out of range 1..Point.Fn.ORDER" },
];

const PROBE_SVG = `<svg viewBox="0 0 720 420" width="720" height="420" xmlns="http://www.w3.org/2000/svg">
  <title>What Settlens sends to a resource and its facilitator</title>
  <desc>Passive requests read the 402 challenge and GET /supported. With authorization, one invalid signature goes to the resource and to POST /verify, and both must refuse it. /settle is never called.</desc>
  <rect class="d-zone" x="24" y="76" width="672" height="152" rx="10"/>
  <rect class="d-zone d-zone--blue" x="24" y="240" width="672" height="140" rx="10"/>
  <rect class="d-node d-node--accent" x="20" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="280" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="540" y="16" width="160" height="44" rx="10"/>
  <text class="d-title" x="100" y="43" text-anchor="middle">Settlens</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="620" y="43" text-anchor="middle">Facilitator</text>
  <path class="d-life" d="M100 60v340M360 60v340M620 60v340"/>
  <text class="d-note" x="688" y="96" text-anchor="end">Passive</text>
  <path class="d-msg" d="M100 110h256"/><path class="d-head" d="M350 104l8 6-8 6"/>
  <text class="d-label" x="230" y="101" text-anchor="middle">GET, no payment</text>
  <path class="d-msg d-msg--accent" d="M360 146H104"/><path class="d-head d-head--accent" d="M110 140l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="230" y="137" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <path class="d-msg" d="M100 182h516"/><path class="d-head" d="M610 176l8 6-8 6"/>
  <text class="d-label" x="380" y="173">GET /supported</text>
  <path class="d-msg d-msg--accent" d="M620 214H104"/><path class="d-head d-head--accent" d="M110 208l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="380" y="205">kinds · extensions · signers</text>
  <text class="d-note d-note--blue" x="490" y="262" text-anchor="middle">Authorized only</text>
  <path class="d-msg d-msg--blue" d="M100 278h256"/><path class="d-head d-head--blue" d="M350 272l8 6-8 6"/>
  <text class="d-label" x="230" y="269" text-anchor="middle">invalid PAYMENT-SIGNATURE</text>
  <path class="d-msg" d="M360 310H104"/><path class="d-head" d="M110 304l-8 6 8 6"/>
  <text class="d-label" x="230" y="301" text-anchor="middle">must not be 2xx</text>
  <path class="d-msg d-msg--blue" d="M100 342h516"/><path class="d-head d-head--blue" d="M610 336l8 6-8 6"/>
  <text class="d-label" x="380" y="333">POST /verify, invalid</text>
  <path class="d-msg" d="M620 370H104"/><path class="d-head" d="M110 364l-8 6 8 6"/>
  <text class="d-label" x="380" y="361">isValid must be false</text>
  <text class="d-text" x="360" y="412" text-anchor="middle">/settle is never called · no wallet · no payment key</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  return html`${ctx.hero({
    title: "Test your x402 facilitator without moving funds",
    lede: "For operators of x402 facilitators. Settlens reads GET /supported, checks it against the terms resources actually advertise and, with your authorization, confirms that /verify rejects an invalid signature. It never calls /settle.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "See what Settlens sends", href: "#what-settlens-sends" },
    ],
    note: "Real output from the bundled demo, whose /facilitator-accept route is built to accept any signature.",
    aside: ctx.terminal({ title: "Authorized /verify probe", lines: VERIFY_FAIL_LINES }),
  })}
${ctx.section({
  id: "who",
  title: "Who this is for",
  width: "narrow",
  body: ctx.prose(html`<p>You operate the service that x402 resource servers call to check and execute payments: <code>GET /supported</code> advertises the kinds, extensions and signers you handle, <code>POST /verify</code> says whether a payment payload is valid, and <code>POST /settle</code> executes it on chain.</p>
<p>Resource servers serve paid content based on your <code>isValid</code> answer. One verification bug becomes a payment bypass for every merchant that relies on you, and those merchants need a way to check your behavior without taking your word for it. Our guide to <a href="/learn/x402-facilitator-security">x402 facilitator security</a> covers what each endpoint must and must not do.</p>`),
})}
${ctx.section({
  id: "failure-modes",
  title: "What goes wrong on a facilitator",
  lede: "Each failure mode maps to a check Settlens runs. The tag on each card is the check id you will see in reports.",
  tone: "raised",
  body: ctx.cards(
    [
      { icon: "x-circle", title: "/verify accepts a forged signature", body: "During an authorized probe, Settlens posts an intentionally invalid payload to /verify (an all-zero signature on EVM networks). isValid=true is a critical verification bypass.", tag: "security.facilitator_rejects_invalid_signature" },
      { icon: "file", title: "/verify answers in a non-standard shape", body: "Resource servers decide from isValid. An answer without a boolean isValid field risks being misread as success.", tag: "facilitator.verify_response_schema" },
      { icon: "layers", title: "/supported breaks the core shape", body: "kinds must be a non-empty array with x402Version, scheme and network (CAIP-2 for V2 kinds), extensions an array of strings, and signers a map of networks to address lists.", tag: "facilitator.supported_schema" },
      { icon: "alert", title: "No x402 V2 capability", body: "A facilitator without at least one kind with x402Version 2 cannot verify or settle V2 payments, whatever else it advertises.", tag: "facilitator.v2_capability" },
      { icon: "branch", title: "Resources advertise what you cannot settle", body: "Every scheme and network pair a resource advertises must appear in your kinds for the same x402Version, or clients sign payments that can never be verified.", tag: "facilitator.requirement_coverage" },
      { icon: "signature", title: "Signer metadata is missing", body: "Each advertised network needs a non-empty signer list, for the exact network or its namespace wildcard such as eip155:*.", tag: "facilitator.signer_coverage" },
      { icon: "lock", title: "Capabilities over weak transport", body: "Settlens flags plain HTTP outside loopback, a non-JSON media type, duplicate kinds and responses above the 1 MiB evidence limit.", tag: "facilitator.https" },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  id: "what-settlens-sends",
  title: "What Settlens sends, and what it never sends",
  lede: "The passive part reads public metadata. The active part is opt-in, needs an authorization reference and sends one invalid payload built from the resource's first advertised requirement.",
  body: ctx.diagram({
    svg: PROBE_SVG,
    label: "Sequence between Settlens, a paid resource and a facilitator. Passive: Settlens sends a GET without payment to the resource and receives 402 with PAYMENT-REQUIRED, then sends GET /supported to the facilitator and receives kinds, extensions and signers. Authorized only: Settlens sends an invalid PAYMENT-SIGNATURE to the resource, which must not answer 2xx, and posts the invalid payload to /verify, which must answer isValid false. /settle is never called.",
    caption: "For EVM networks the invalid payload carries an all-zero signature; for Solana, an all-zero transaction. The probe needs no wallet or payment key.",
    size: "wide",
  }),
})}
${ctx.section({
  id: "workflow",
  title: "The Settlens workflow for facilitators",
  lede: "Start with your public capabilities, then cross-check them against a resource that uses you, then prove /verify fails closed.",
  tone: "raised",
  body: html`${ctx.steps([
    { title: "Scan GET /supported", body: html`<p><code>settlens facilitator https://facilitator.example.com</code> checks reachability, HTTP 200, the JSON media type, HTTPS, the response size, the SupportedResponse schema, V2 capability and duplicate kinds.</p>` },
    { title: "Cross-check a resource that uses you", body: html`<p><code>settlens scan &lt;resource-url&gt; --facilitator &lt;base-url&gt;</code> adds coverage: every advertised scheme and network must be in your kinds, and every advertised network needs signers.</p>` },
    { title: "Prove /verify fails closed", body: html`<p>Add <code>--active --authorized --authorization-ref &lt;ticket&gt;</code>. Settlens posts one invalid payload to <code>/verify</code> and checks that <code>isValid</code> is a boolean and is <code>false</code>.</p>` },
    { title: "Gate releases and publish evidence", body: html`<p>Run the same configuration in CI on every change, then sign the report with an ed25519 key so integrators can verify it offline. See <a href="/docs/evidence">evidence</a>.</p>` },
  ])}
${ctx.split({
  main: ctx.codeBlock({ lang: "json", title: "settlens.config.json (illustrative values)", code: prettyJson(CONFIG) }),
  aside: html`${ctx.codeBlock({
    lang: "shell",
    title: "CI run with the authorized probe",
    code: `settlens check --config settlens.config.json \\
  --allow-host facilitator.staging.example.com \\
  --active --authorized --authorization-ref CHG-2291`,
  })}
${ctx.callout({ tone: "info", title: "Secrets stay out of reports", body: html`<p><code>\${FACILITATOR_TOKEN}</code> is expanded from the environment when the configuration loads and is never written to a report. Custom headers are refused unless their host is allowlisted with <code>--allow-host</code> or the Action's <code>allowed-hosts</code> input.</p>` })}`,
})}`,
})}
${ctx.section({
  id: "examples",
  title: "What the findings look like",
  lede: "Real output from the bundled demo. One facilitator covers the resource, one advertises only Base mainnet while the resource asks for Base Sepolia, and the offline verifier gives a second opinion on the all-zero signature.",
  body: html`${ctx.split({
    main: ctx.terminal({ title: "GET /supported only", lines: SUPPORTED_LINES }),
    aside: ctx.terminal({ title: "Coverage gap", lines: COVERAGE_LINES }),
  })}
${ctx.split({
  main: ctx.prose(html`<h3>A second opinion on your verifier</h3>
<p><code>settlens verify-payment payment.json</code> takes a requirement and a captured payload. For EIP-3009 authorizations of the <code>exact</code> EVM scheme it rebuilds the EIP-712 domain from the requirement, recovers the EIP-3009 signer and checks recipient, amount and the validity window, with no RPC. For Solana it checks the ed25519 signature in every signer slot and reports your fee-payer slot as pending until you sign it at settlement.</p>
<p>Run it on payloads your <code>/verify</code> accepted or rejected and compare the answers. Here it rejects the same all-zero signature the active probe sends. See <a href="/product/verify">Verify</a>, and the <a href="/learn/eip-3009">EIP-3009 explainer</a> for how the authorization and its EIP-712 domain are built.</p>`),
  aside: ctx.terminal({ title: "Offline signature check of the invalid payload", lines: VERIFY_PAYMENT_LINES }),
})}`,
})}
${ctx.section({
  id: "checks",
  title: "Facilitator checks",
  lede: "Generated from the Settlens check catalog. Coverage and signer checks need a resource target; /verify checks need the authorized active probe.",
  tone: "raised",
  body: html`${checkTable(ctx, FACILITATOR_CHECKS, "Checks on an x402 facilitator")}
${ctx.prose(html`<p>See the <a href="/docs/checks#facilitator-checks">facilitator checks in the check reference</a> for why each check matters and how to fix it, and the <a href="/docs/methodology">methodology</a> for what a result proves.</p>`)}`,
})}
${ctx.section({
  id: "deliverables",
  title: "What you get",
  body: ctx.featureGrid(
    [
      { icon: "file", title: "Capability reports", body: "JSON with a SHA-256 integrity block, HTML and SARIF for every /supported scan. settlens facilitator keeps the validated /supported response, signer addresses included; a resource scan keeps the kinds, extensions and signer networks.", href: "/docs/reports", linkLabel: "Report format" },
      { icon: "shield-check", title: "Fail-closed evidence", body: "A report in active-authorized mode that records your authorization reference, zero settlement calls and zero private keys used.", href: "/product/assess", linkLabel: "Assess" },
      { icon: "branch", title: "A release gate", body: "Run the same configuration on every change to your facilitator and fail the build on a high or critical finding.", href: "/product/ci", linkLabel: "CI gate" },
      { icon: "seal", title: "Evidence for integrators", body: "Signed attestations that merchants and auditors can verify offline, without trusting your infrastructure.", href: "/use-cases/security-teams", linkLabel: "How auditors use it" },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  id: "limits",
  title: "Limits to keep in mind",
  width: "narrow",
  tone: "raised",
  body: html`${ctx.callout({
    tone: "warning",
    title: "Settlement is out of scope",
    body: "Settlens never calls /settle, never submits or broadcasts a transaction and never moves funds. It does not test on-chain execution, gas handling, nonce use or replay protection.",
  })}
${ctx.prose(html`<ul>
<li>The <code>/verify</code> probe sends one class of invalid payload. It shows that your facilitator refuses an all-zero signature, not that it handles every malformed or malicious payload.</li>
<li>The probe is built from a resource's advertised requirement, so it needs a resource target that names your facilitator.</li>
<li>Signer coverage checks that signer lists are published, not that the addresses are yours or funded.</li>
<li><code>verify-payment</code> checks signatures and binding offline. It does not check balances, on-chain nonce use or settlement, and it covers EIP-3009 authorizations of the <code>exact</code> EVM scheme (not Permit2 or ERC-7710 payloads) and Solana transaction signatures.</li>
</ul>`)}`,
})}
${ctx.section({
  id: "faq",
  title: "Questions from facilitator operators",
  width: "narrow",
  body: ctx.faq([
    { q: "Does Settlens ever call /settle?", a: "No. No Settlens command or MCP tool calls /settle. Reports record the number of settlement calls, which is always zero." },
    { q: "Do you need our keys or a funded wallet?", a: "No. The passive scan reads public metadata and the active probe sends an invalid payload that needs no signing key. Settlens never holds wallets, payment keys or funds." },
    { q: "Can we test /supported without a resource server?", a: "Yes. settlens facilitator <base-url> checks /supported on its own. Coverage, signer and /verify checks need a resource that advertises requirements, such as your own test resource." },
    { q: "Is the /verify probe safe to run against production?", a: "It sends a single payload that a correct facilitator rejects, and it only runs with --active, --authorized and an authorization reference. Run it with the operator's explicit approval, and start on staging." },
    { q: "Which networks are covered?", a: "Schema and coverage checks work on any CAIP-2 network. Offline signature verification covers EIP-3009 authorizations of the exact scheme on eip155 networks and the signers of Solana transactions." },
  ]),
})}
${ctx.cta({
  title: "Show integrators your facilitator fails closed",
  body: "A pilot covers your /supported endpoint, one reference resource and an authorized /verify probe, and ends with signed evidence.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Read the security model", href: "/docs/security" },
  ],
})}`;
}
