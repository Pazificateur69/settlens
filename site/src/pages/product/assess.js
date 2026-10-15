// /product/assess: passive x402 conformance and policy scan, plus the authorized active probe.
// Transcripts are real output of node src/cli.js against the demo target (npm run demo:server).

import { validateExpected } from "../../../../src/config.js";
import { catalogChecks, checkTable, otherStages, repoFile, SOFTWARE } from "./_stage-kit.js";

const PATH = "/product/assess";
const DESCRIPTION =
  "x402 testing for paid APIs: scan for x402 V2 conformance, resource binding, drift and your payment policy, then check it fails closed with an authorized probe.";

export const meta = {
  path: PATH,
  title: "x402 endpoint testing: passive scan and probe",
  label: "Assess",
  description: DESCRIPTION,
  section: "product",
  lastmod: "2026-10-13",
  order: 1,
  icon: "search",
  summary:
    "Settlens Assess tests an x402 V2 paid endpoint from the client's side: the HTTP 402 handshake, PAYMENT-REQUIRED validated with the official @x402/core SDK, the resource binding, every payment option, drift and your policy. With the owner's written approval, one invalid signature checks that it fails closed.",
  sources: [
    { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  jsonLd: SOFTWARE,
};

// The policy snippet shown on the page; validated with the CLI's own config validator at build time.
const EXPECTED = {
  resourceUrl: "https://merchant.example/api/data",
  schemes: ["exact"],
  networks: ["eip155:8453"],
  payTo: ["0xYourReviewedRecipient"],
  assets: ["0xYourReviewedTokenContract"],
  maxAmount: "10000",
};

const PASSIVE_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure" },
  { kind: "out", text: "Settlens x402 assessment 86148897" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "pass", text: "13 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 13 pass · 0 fail · 0 warn · 0 skip" },
];

const POLICY_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --expect-scheme exact --expect-network eip155:8453 \\" },
  { kind: "cont", text: "    --expect-pay-to 0x209693Bc6afc0C5328bA36FaF03C514EF312287C \\" },
  { kind: "cont", text: "    --max-amount 5000 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 3f9a8296" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "15 pass · 2 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL high     Networks match the local policy" },
  { kind: "muted", text: "       Unexpected networks: eip155:84532." },
  { kind: "fail", text: "  FAIL high     Amounts stay within the approved ceiling" },
  { kind: "muted", text: "       1 payment amount(s) exceed 5000." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 15 pass · 2 fail · 0 warn · 0 skip" },
];

const GATE_LINES = [
  { kind: "cmd", text: "settlens scan https://merchant.example/api/data --active" },
  { kind: "fail", text: "Settlens error: Active testing requires --authorized to confirm explicit owner approval." },
  { kind: "cmd", text: "settlens scan https://merchant.example/api/data --active --authorized" },
  { kind: "fail", text: "Settlens error: Active testing requires --authorization-ref with a traceable owner approval reference." },
];

const BYPASS_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-002 --no-write" },
  { kind: "out", text: "Settlens x402 assessment bc909b8c" },
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

const ACTIVE_REPORT_EXCERPT = `{
  "scope": {
    "targetCount": 1,
    "activeTargetCount": 1,
    "settlementCalls": 0,
    "privateKeysUsed": 0
  },
  "targets": [
    {
      "mode": "active-authorized",
      "authorization": {
        "confirmed": true,
        "reference": "DEMO-APPROVAL-001"
      },
      "checks": [
        {
          "id": "security.invalid_signature_fail_closed",
          "status": "pass",
          "severity": "critical",
          "message": "The intentionally invalid payment was denied with HTTP 402.",
          "evidence": { "status": 402, "responseBytes": 47 }
        }
      ]
    }
  ]
}`;

const SEQUENCE_SVG = `<svg viewBox="0 0 720 480" width="720" height="480" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-zone" x="12" y="74" width="696" height="172" rx="10"/>
  <rect class="d-zone d-zone--blue" x="12" y="258" width="696" height="180" rx="10"/>
  <rect class="d-node d-node--accent" x="25" y="16" width="170" height="44" rx="10"/>
  <rect class="d-node" x="275" y="16" width="170" height="44" rx="10"/>
  <rect class="d-node" x="525" y="16" width="170" height="44" rx="10"/>
  <text class="d-title" x="110" y="43" text-anchor="middle">Settlens CLI</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="610" y="43" text-anchor="middle">Facilitator</text>
  <path class="d-life" d="M110 60v390M360 60v390M610 60v390"/>
  <text class="d-note" x="24" y="94">Passive (default)</text>
  <path class="d-msg" d="M110 126h246"/><path class="d-head" d="M350 120l8 6-8 6"/>
  <text class="d-label" x="235" y="117" text-anchor="middle">GET, no payment header</text>
  <path class="d-msg d-msg--accent" d="M360 162H114"/><path class="d-head d-head--accent" d="M120 156l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="235" y="153" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <path class="d-msg" d="M110 198h246"/><path class="d-head" d="M350 192l8 6-8 6"/>
  <text class="d-label" x="235" y="189" text-anchor="middle">same GET again (drift)</text>
  <path class="d-msg" d="M110 232h496"/><path class="d-head" d="M600 226l8 6-8 6"/>
  <text class="d-label" x="485" y="223" text-anchor="middle">GET /supported (optional)</text>
  <text class="d-note d-note--blue" x="24" y="278">Active: authorized probe only</text>
  <path class="d-msg d-msg--blue" d="M110 314h246"/><path class="d-head d-head--blue" d="M350 308l8 6-8 6"/>
  <text class="d-label" x="235" y="305" text-anchor="middle">one invalid PAYMENT-SIGNATURE</text>
  <path class="d-msg" d="M360 350H114"/><path class="d-head" d="M120 344l-8 6 8 6"/>
  <text class="d-label" x="235" y="341" text-anchor="middle">must not be 2xx</text>
  <path class="d-msg d-msg--blue" d="M110 386h496"/><path class="d-head d-head--blue" d="M600 380l8 6-8 6"/>
  <text class="d-label" x="485" y="377" text-anchor="middle">POST /verify, same payload</text>
  <path class="d-msg" d="M610 420H114"/><path class="d-head" d="M120 414l-8 6 8 6"/>
  <text class="d-label" x="485" y="411" text-anchor="middle">isValid: false</text>
  <text class="d-text" x="360" y="470" text-anchor="middle">Settlens never calls /settle, signs no payment and holds no payment keys.</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  validateExpected(EXPECTED, "Assess page policy example");
  // CLI flags are looked up in the CLI's option list, so a flag added or removed there updates the table.
  const cliSource = repoFile("src/cli.js");
  const flag = (name) => (cliSource.includes(`"${name.slice(2)}"`) ? html`<code>${name}</code>` : "Configuration only");

  const contentChecks = catalogChecks(
    (check) => ["passive", "offline"].includes(check.mode) && check.category !== "policy",
    "the passive content checks",
  );
  const policyChecks = catalogChecks((check) => check.category === "policy", "the policy checks");
  const activeChecks = catalogChecks((check) => check.mode === "active", "the active probe checks");

  return html`${ctx.hero({
    title: "Assess an x402 endpoint before agents pay it",
    lede: "Settlens runs x402 testing from the client's side: it requests your paid resource, decodes PAYMENT-REQUIRED, validates it with the official @x402/core SDK, checks that it is bound to the URL you requested and compares every advertised option with your recipient, network, asset and price policy. Passive by default. With the owner's written approval, one deliberately invalid payment checks that the resource fails closed.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Read the CLI reference", href: "/docs/cli" },
    ],
    note: "Real output from the bundled demo target (npm run demo:server).",
    aside: ctx.terminal({ title: "settlens scan (demo target)", lines: PASSIVE_LINES }),
  })}
${ctx.section({
  id: "what-it-checks",
  title: "What a passive scan checks",
  lede: "A passive scan sends ordinary unauthenticated requests. It never sends a payment signature, and it refuses one if you try to add it as a custom header.",
  body: ctx.featureGrid([
    { icon: "terminal", title: "The 402 handshake", body: "The unauthenticated request must return HTTP 402 with a PAYMENT-REQUIRED header that decodes as Base64 JSON." },
    { icon: "check-circle", title: "Official SDK and V2 shape", body: "The decoded object must pass the schema of the pinned @x402/core 2.28.0 SDK and carry x402Version 2, a resource and a non-empty accepts list." },
    { icon: "lock", title: "Resource binding", body: "resource.url must equal the URL you scanned, path and query included, so a payment cannot be steered to another resource." },
    { icon: "layers", title: "Every payment option", body: "Scheme, CAIP-2 network, positive atomic amount, asset, payTo and maxTimeoutSeconds are validated. Duplicates and windows over one hour are flagged." },
    { icon: "clock", title: "Drift between requests", body: "Identical requests (two by default) must return the same resource, options and extensions, so silent price or recipient changes surface." },
    { icon: "shield", title: "Transport hygiene", body: "HTTPS outside loopback, redirects reported and never followed, response bodies read up to 1 MiB and never copied into the report." },
    { icon: "key", title: "Your payment policy", body: "Allowed schemes, networks, recipients, assets and a maximum amount. In a scan, every advertised option must comply." },
    { icon: "search", title: "Facilitator coverage", body: "With --facilitator, Settlens reads GET /supported and checks that each advertised scheme and network is covered, with signer metadata.", href: "/product/verify#facilitator", linkLabel: "Facilitator checks" },
  ], { columns: 4 }),
})}
${ctx.section({
  id: "how-it-works",
  title: "How a scan runs",
  tone: "raised",
  body: ctx.steps([
    { title: "Request the resource without payment", body: "Settlens sends the configured method (GET by default) with no payment header, an 8-second timeout and redirects disabled. Custom headers are only sent to hosts you allowlist." },
    { title: "Decode and validate PAYMENT-REQUIRED", body: "The header is size-checked, Base64-decoded and parsed as JSON, then validated twice: by the official @x402/core 2.28.0 schema and by Settlens' own V2 core-shape checks." },
    { title: "Check binding and each option", body: "resource.url is compared with the URL under test, and every accepts entry is validated field by field." },
    { title: "Repeat to detect drift", body: html`<p>The same request is sent again (<code>--repeat</code>, two samples by default) and the terms are compared, ignoring known ephemeral fields.</p>` },
    { title: "Apply your policy", body: "Every advertised option is compared with the allowed schemes, networks, recipients, assets and maximum amount you set." },
    { title: "Write the evidence", body: html`<p>The CLI prints a summary and writes JSON, HTML and SARIF reports. The JSON report carries a SHA-256 integrity digest you can check with <code>verify-report</code> or sign as <a href="/product/evidence">evidence</a>.</p>` },
  ]),
})}
${ctx.section({
  id: "passive-and-active",
  title: "Passive scan and authorized probe",
  lede: "Both modes run the same passive checks first. The active probe adds exactly one request to the resource and, when a facilitator is configured, one call to its /verify endpoint.",
  body: html`${ctx.diagram({
    svg: SEQUENCE_SVG,
    size: "wide",
    label: "Sequence between the Settlens CLI, the paid resource and the facilitator. Passive mode: an unauthenticated GET, a 402 response with PAYMENT-REQUIRED, the same GET again for drift, and an optional GET /supported to the facilitator. Active mode, authorized only: one invalid PAYMENT-SIGNATURE that must not get a 2xx response, then POST /verify with the same payload, which must return isValid false. Settlens never calls /settle.",
    caption: "Passive requests run on every scan. The blue exchanges run only with --active --authorized --authorization-ref.",
  })}
${ctx.comparisonTable({
  caption: "What each mode sends",
  columns: ["Behavior", "Passive scan", "Authorized active probe"],
  rows: [
    { label: "Unauthenticated requests to the resource", values: ["2 by default", "2 by default"] },
    { label: "Sends a PAYMENT-SIGNATURE", values: [false, "One, deliberately invalid"] },
    { label: "Calls facilitator /verify", values: [false, "Once, with --facilitator"] },
    { label: "Calls facilitator /settle", values: [false, false] },
    { label: "Needs a wallet or private key", values: [false, false] },
    { label: "Requires the owner's approval reference", values: [false, true] },
  ],
})}`,
})}
${ctx.section({
  id: "example",
  title: "Example: a mainnet policy against a testnet endpoint",
  tone: "raised",
  lede: "The demo endpoint advertises 10000 atomic units of a token on Base Sepolia (eip155:84532). A policy written for Base mainnet with a lower ceiling catches both differences.",
  body: ctx.split({
    main: ctx.terminal({ title: "settlens scan with a local policy", lines: POLICY_LINES }),
    aside: ctx.prose(html`<p>Both failures are <strong>high</strong> severity, so the run exits with code <code>1</code> at the default <code>--fail-on high</code> threshold. That is the same signal the <a href="/product/ci">CI gate</a> uses to block a merge.</p>
<p>The recipient matched, so <code>policy.recipient</code> passed. EVM addresses are compared case-insensitively; other formats, such as Solana base58 addresses, must match exactly.</p>
<p>Without a policy the same endpoint passes all 13 checks, as in the transcript at the top of this page.</p>`),
  }),
})}
${ctx.section({
  id: "policy",
  title: "Write the policy once",
  lede: "Flags cover one-off scans; the configuration file keeps the policy reviewed and versioned next to the endpoint it describes.",
  body: ctx.split({
    main: ctx.table({
      caption: "Policy fields",
      head: ["Configuration field", "CLI flag", "Check"],
      rows: [
        [html`<code>expected.schemes</code>`, flag("--expect-scheme"), html`<code>policy.scheme</code>`],
        [html`<code>expected.networks</code>`, flag("--expect-network"), html`<code>policy.network</code>`],
        [html`<code>expected.payTo</code>`, flag("--expect-pay-to"), html`<code>policy.recipient</code>`],
        [html`<code>expected.assets</code>`, flag("--expect-asset"), html`<code>policy.asset</code>`],
        [html`<code>expected.maxAmount</code>`, flag("--max-amount"), html`<code>policy.maximum_amount</code>`],
        [html`<code>expected.resourceUrl</code>`, "Configuration only", html`<code>binding.resource_url</code>`],
      ],
      rowHeaders: true,
    }),
    aside: html`${ctx.codeBlock({ lang: "json", title: "settlens.config.json (excerpt)", code: JSON.stringify({ expected: EXPECTED }, null, 2) })}
${ctx.callout({ tone: "note", title: "A scan is stricter than an agent", body: html`<p>An agent pays with one option, so its <a href="/mcp">MCP preflight</a> only needs one acceptable option. A scan tests the server, so <em>every</em> advertised option must be within policy. Amounts are atomic units: pair <code>maxAmount</code> with an asset allowlist. See <a href="/learn/agent-spending-policy">how to write an agent spending policy</a>.</p>` })}`,
  }),
})}
${ctx.section({
  id: "active-probe",
  title: "The authorized active probe",
  tone: "raised",
  lede: "A passive scan shows what the resource advertises. Only an invalid payment shows what it does with one. Settlens sends exactly one, and only when you prove you are allowed to.",
  body: html`${ctx.split({
    main: ctx.prose(html`<h3>Three safety gates</h3>
<p><code>--active</code> alone is refused. The CLI also requires <code>--authorized</code>, your confirmation that the endpoint owner approved the test, and <code>--authorization-ref</code>, the ticket, email or scope identifier of that approval. Missing either one stops the run with exit code <code>2</code> before any request is sent. The configuration file has no field that turns active mode on, so a changed config cannot enable it.</p>
<h3>What the probe sends</h3>
<p>Settlens builds a payment payload from the first advertised option and makes it unusable: on EVM networks a 65-byte all-zero signature from the zero address with a zero nonce, on Solana 64 zero bytes in place of a transaction, on other networks a placeholder string. It sends that payload once as <code>PAYMENT-SIGNATURE</code>. The probe needs a decodable V2 <code>PAYMENT-REQUIRED</code> with at least one option first; otherwise it is skipped.</p>
<h3>What must happen</h3>
<ul>
<li>The resource must not answer with a 2xx status. A 2xx is a <strong>critical</strong> payment bypass.</li>
<li>It should answer 400 or 402, as the x402 HTTP transport specifies.</li>
<li>With <code>--facilitator</code>, Settlens posts the same payload to <code>/verify</code>, which must return a VerifyResponse with <code>isValid: false</code>.</li>
</ul>
<p>The approval reference is recorded in the report. The report scope also declares zero settlement calls and zero private keys used: Settlens has no code path that settles or signs a payment, so these are fixed values, not measurements.</p>`),
    aside: html`${ctx.terminal({ title: "Safety gates (no request is sent)", lines: GATE_LINES, replay: false })}
${ctx.terminal({ title: "Bypass detected on the demo target", lines: BYPASS_LINES })}`,
  })}
${ctx.callout({ tone: "warning", title: "Authorized testing only", body: "Run the active probe only against endpoints you own or have written permission to test. The demo target's /bypass route is built to unlock with any signature, which is exactly what the probe exists to catch." })}
${ctx.codeBlock({ lang: "json", title: "Report excerpt: authorized probe against the demo /secure route", code: ACTIVE_REPORT_EXCERPT })}`,
})}
${ctx.section({
  id: "checks",
  title: "Checks in this stage",
  lede: html`Rendered from the same catalog the CLI and the MCP server use. Severities are defaults; the <a href="/docs/checks">check reference</a> explains why each one matters and how to fix it.`,
  body: html`${checkTable(ctx, { caption: `Handshake, schema, binding and stability (${contentChecks.length} checks)`, checks: contentChecks })}
${checkTable(ctx, { caption: `Policy (${policyChecks.length} checks, each evaluated only when its field is set)`, checks: policyChecks })}
${checkTable(ctx, { caption: `Authorized active probe (${activeChecks.length} checks)`, checks: activeChecks })}`,
})}
${ctx.section({
  id: "limitations",
  title: "What Assess does not do",
  tone: "raised",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>No settlement, no funds.</strong> Settlens never calls <code>/settle</code>, never creates a valid payment and never holds a wallet or payment key.</li>
<li><strong>No route discovery.</strong> You name the URLs. Settlens does not crawl or guess paid routes.</li>
<li><strong>Sampled behavior.</strong> A scan sees a few requests in a short window. It cannot prove every server-side code path, rate limit or tenant behaves the same.</li>
<li><strong>One invalid payload class.</strong> The active probe proves an obviously forged payment is refused. It is not a full test of your signature verification; use <a href="/product/verify">offline verification</a> to check captured authorizations.</li>
<li><strong>No on-chain view.</strong> Assess does not read balances, nonces, token contracts or transactions.</li>
<li><strong>Redirects stop the scan's view.</strong> A 3xx is reported and not followed; scan the canonical URL instead.</li>
<li><strong>Not a certification.</strong> A report is evidence of observed behavior, not a security audit or legal opinion. See the <a href="/docs/methodology">methodology</a>.</li>
</ul>`),
})}
${ctx.section({
  id: "faq",
  title: "Questions about assessments",
  width: "narrow",
  body: ctx.faq([
    { q: "Does a passive scan send a payment?", a: "No. It sends ordinary requests without any payment header. If you add a PAYMENT-SIGNATURE header yourself, the CLI refuses to run (exit code 2)." },
    { q: "How many requests does a scan make?", a: "Two to the resource by default (set with --repeat). With --facilitator, one more GET to /supported. The authorized probe adds one request to the resource and, with a facilitator, one POST to /verify." },
    { q: "Can I enable the active probe from the configuration file?", a: "No. Active mode exists only as command-line flags, and it needs --active, --authorized and --authorization-ref together. If --active comes without the other two, the CLI stops before sending any request." },
    { q: "Can a valid payment ever be sent by mistake?", a: "No. The probe payload carries an all-zero signature, zero bytes or a placeholder instead of a real authorization, Settlens has no payment key to sign with, and it never calls /settle." },
    { q: "Does a passing scan mean my endpoint is secure?", a: "It means the endpoint behaved correctly for every property tested during the scan. It does not cover untested code paths, on-chain behavior or your wider application." },
    { q: "Which x402 version is supported?", a: html`<p>x402 V2 over HTTP: the <code>PAYMENT-REQUIRED</code> and <code>PAYMENT-SIGNATURE</code> headers, validated with the official <code>@x402/core</code> 2.28.0 SDK. Responses without a V2 <code>PAYMENT-REQUIRED</code> header, including x402 V1 responses, fail these checks. See the <a href="/learn/x402-v1-to-v2-migration">x402 V1 to V2 migration guide</a>.</p>` },
  ]),
})}
${ctx.section({
  id: "related",
  title: "Related",
  tone: "raised",
  body: html`${ctx.cards(otherStages(PATH), { columns: 4 })}
${ctx.prose(html`<p>Reference: <a href="/docs/cli">CLI options and exit codes</a> · <a href="/docs/configuration">configuration file</a> · <a href="/docs/checks">every check</a> · <a href="/learn/x402-v2-headers">the x402 V2 headers</a> · <a href="/blog/how-to-test-x402-endpoint">how to test an x402 endpoint</a> · <a href="/tools/x402-checker">check one PAYMENT-REQUIRED header in your browser</a>.</p>`)}`,
})}
${ctx.cta({
  title: "Assess one paid endpoint first",
  body: "A scoped pilot on one endpoint, with your policy, an authorized probe if you approve it, and a report your team can verify.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Check payments from an agent (MCP)", href: "/mcp" },
  ],
})}`;
}
