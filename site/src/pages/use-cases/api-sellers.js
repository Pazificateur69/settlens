// Persona page: teams selling API access through x402 resource servers.
// Terminal transcripts are real CLI output against the bundled demo target (npm run demo:server).

import { assertValidConfig, checkTable, prettyJson, SOFTWARE } from "./_shared.js";

export const meta = {
  path: "/use-cases/api-sellers",
  title: "x402 API sellers: test your paid endpoints",
  description:
    "Check that your x402 paid API returns a valid 402 challenge, binds each payment to the right URL, recipient and price, fails closed and stays that way.",
  section: "use-cases",
  label: "API sellers",
  icon: "lock",
  order: 1,
  lastmod: "2026-10-13",
  summary:
    "Settlens checks an x402 paid API the way a paying client sees it: a valid 402 challenge, payments bound to the requested URL, terms that match your approved recipient, asset, network and price, and, with your authorization, a resource that refuses an invalid payment. It runs before launch, in CI and on a schedule.",
  sources: [
    { title: "x402 protocol specification, version 2 (§5.1 PaymentRequired schema)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport: headers and error status codes", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  changefreq: "monthly",
  jsonLd: SOFTWARE,
};

const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const CONFIG = assertValidConfig({
  version: 1,
  failOn: "high",
  output: "reports",
  defaults: {
    timeoutMs: 8000,
    repeat: 2,
    facilitator: "https://facilitator.example.com",
    expected: {
      schemes: ["exact"],
      networks: ["eip155:8453"],
      payTo: [PAY_TO],
      assets: [USDC_BASE],
      maxAmount: "10000",
    },
  },
  targets: [
    { name: "forecast", url: "https://api.example.com/v1/forecast" },
    { name: "history", url: "https://api.example.com/v1/history" },
  ],
});

const SCAN_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: "    --expect-scheme exact --expect-network eip155:84532 \\" },
  { kind: "cont", text: `    --expect-pay-to ${PAY_TO} \\` },
  { kind: "cont", text: "    --max-amount 10000 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 8ac68b3f" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/secure" },
  { kind: "pass", text: "17 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "pass", text: "Total: 17 pass · 0 fail · 0 warn · 0 skip" },
];

const DRIFT_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/drift \\" },
  { kind: "cont", text: `    --expect-pay-to ${PAY_TO} --max-amount 10000 --no-write` },
  { kind: "out", text: "Settlens x402 assessment 3b27af01" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/drift" },
  { kind: "out", text: "14 pass · 0 fail · 1 warn · 0 skip" },
  { kind: "warn", text: "  WARN medium   Payment requirements remain stable" },
  { kind: "muted", text: "       Payment terms changed between identical unauthenticated requests." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 14 pass · 0 fail · 1 warn · 0 skip" },
];

const BYPASS_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref AUDIT-2026-014 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 8701a0bc" },
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

const MONITOR_LINES = [
  { kind: "cmd", text: "settlens monitor --config settlens.config.json --state settlens.state.json" },
  { kind: "out", text: "" },
  { kind: "out", text: "demo-secure (GET http://127.0.0.1:4402/secure)" },
  { kind: "fail", text: "  ALERT [high] policy.maximum_amount: pass -> fail — Amounts stay within the approved ceiling" },
  { kind: "out", text: "" },
  { kind: "out", text: "1 blocking alert(s) at or above high." },
];

const ENDPOINT_CHECKS = [
  "transport.reachable",
  "transport.status_402",
  "transport.payment_required_header",
  "transport.payment_required_encoding",
  "schema.official_x402_sdk",
  "schema.payment_required",
  "binding.resource_url",
  "schema.payment_requirements",
  "schema.duplicate_requirements",
  "freshness.timeout_window",
  "policy.scheme",
  "policy.network",
  "policy.recipient",
  "policy.asset",
  "policy.maximum_amount",
  "stability.payment_requirements",
  "transport.https",
  "transport.redirect",
  "transport.response_body_limit",
  "security.invalid_signature_fail_closed",
  "transport.invalid_payment_status",
  "facilitator.requirement_coverage",
];

export default function render(ctx) {
  const { html } = ctx;
  return html`${ctx.hero({
    title: "Prove your x402 API charges the right terms",
    lede: "For teams that sell API access through an x402 resource server. Settlens checks the 402 challenge your endpoint returns, the terms it advertises and what it does with an invalid payment: before launch, on every pull request and in production.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "See what can go wrong", href: "#failure-modes" },
    ],
    note: "Real output from the bundled demo target, which advertises 0.01 USDC (10000 atomic units) on Base Sepolia.",
    aside: ctx.terminal({ title: "Passive scan with expected terms", lines: SCAN_LINES }),
  })}
${ctx.section({
  id: "who",
  title: "Who this is for",
  width: "narrow",
  body: ctx.prose(html`<p>You run an HTTP API, data feed or content endpoint and charge per request with <a href="/learn/what-is-x402">x402</a>. A request without payment gets HTTP 402 and a <code>PAYMENT-REQUIRED</code> header; the client (a script, an app or an AI agent) signs a payment and retries with a <code>PAYMENT-SIGNATURE</code> header. Your middleware then asks a facilitator to verify and settle it.</p>
<p>Between a request and your revenue sit your payment middleware, your pricing configuration, your proxies and your facilitator. Any of them can change what you advertise or what you serve without anyone noticing. Settlens checks that chain from the outside, the way a paying client sees it.</p>
<p>Settlens assesses x402 V2. If your middleware still uses the V1 <code>X-PAYMENT</code> flow, the <a href="/learn/x402-v1-to-v2-migration">V1 to V2 migration guide</a> lists what changes. To look at one challenge right away, paste your <code>PAYMENT-REQUIRED</code> header into the free <a href="/tools/x402-checker">x402 payment request checker</a>.</p>`),
})}
${ctx.section({
  id: "failure-modes",
  title: "What goes wrong on a paid endpoint",
  lede: "Each failure mode maps to a check Settlens runs. The tag on each card is the check id you will see in reports.",
  tone: "raised",
  body: ctx.cards(
    [
      { icon: "x-circle", title: "Content is served for an invalid payment", body: "Middleware that trusts the presence of a PAYMENT-SIGNATURE header instead of a verified one gives the resource away. The authorized active probe sends one invalid signature and fails critical on any 2xx answer.", tag: "security.invalid_signature_fail_closed" },
      { icon: "file", title: "The challenge cannot be parsed", body: "A missing header, a value that is not Base64 JSON or an object the official @x402/core SDK rejects leaves paying clients unable to read your terms.", tag: "schema.official_x402_sdk" },
      { icon: "branch", title: "Payment is bound to another resource", body: "A proxy, a rewritten host or a staging URL in production makes resource.url differ from the URL that was requested, so a payment can be steered to or reused for another resource.", tag: "binding.resource_url" },
      { icon: "activity", title: "Terms change between identical requests", body: "Two identical unauthenticated requests should return the same resource, accepts and extensions. A price or recipient that moves between them is flagged.", tag: "stability.payment_requirements" },
      { icon: "key", title: "Advertised terms leave your policy", body: "A deploy that changes the recipient, the token, the network or the scheme, or lifts the amount above your ceiling, fails the matching policy check. In a scan, every advertised option must fit the policy.", tag: "policy.recipient" },
      { icon: "lock", title: "Transport weakens the challenge", body: "Plain HTTP lets a network attacker rewrite payTo or the amount. A redirect moves the challenge away from the assessed URL; Settlens never follows it and flags it.", tag: "transport.https" },
      { icon: "clock", title: "Authorization windows are too long", body: "maxTimeoutSeconds above 3600 keeps a signed payment usable for longer than settlement needs, which widens replay and misuse exposure.", tag: "freshness.timeout_window" },
      { icon: "layers", title: "Your facilitator cannot settle what you sell", body: "When you name a facilitator, every scheme and network you advertise must appear in its GET /supported kinds, or clients sign payments that can never be verified.", tag: "facilitator.requirement_coverage" },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  id: "workflow",
  title: "The Settlens workflow for API sellers",
  lede: "Four stages reuse the same checks. Start with a passive scan; add the others as the endpoint moves toward production.",
  body: html`${ctx.steps([
    { title: "Scan the terms you mean to advertise", body: html`<p>List the schemes, CAIP-2 networks, recipients (<code>payTo</code>), token <code>assets</code> and maximum atomic amount in a <a href="/docs/configuration">configuration file</a>. <code>settlens check</code> sends two unauthenticated requests per target by default, follows no redirect and fails a policy check whenever an advertised option falls outside it.</p>` },
    { title: "Prove it fails closed on staging", body: html`<p>With your approval reference, <code>--active --authorized --authorization-ref</code> sends one intentionally invalid <code>PAYMENT-SIGNATURE</code>, and the same payload to your facilitator's <code>/verify</code> when one is configured. Settlens never calls <code>/settle</code>.</p>` },
    { title: "Gate every pull request", body: html`<p>The GitHub composite Action runs the same configuration, fails the job at your <code>fail-on</code> threshold (default <code>high</code>) and writes JSON, HTML and SARIF reports. See the <a href="/product/ci">x402 CI gate</a> and the <a href="/docs/github-action">GitHub Action guide</a>.</p>` },
    { title: "Monitor and share evidence", body: html`<p><code>settlens monitor</code> compares each passive scan with the previous run, saved in a state file, and can alert a webhook. It alerts once, on the run where a check gets worse or disappears. <code>settlens evidence attest</code> signs a report that partners can verify offline. See <a href="/product/monitor">Monitor</a>.</p>` },
  ])}
${ctx.split({
  main: ctx.codeBlock({ lang: "json", title: "settlens.config.json (illustrative values)", code: prettyJson(CONFIG) }),
  aside: html`${ctx.codeBlock({
    lang: "shell",
    title: "Run it locally, on staging and on a schedule",
    code: `settlens check --config settlens.config.json

settlens scan https://staging.api.example.com/v1/forecast \\
  --facilitator https://facilitator.example.com \\
  --active --authorized --authorization-ref CHG-1234

settlens monitor --config settlens.config.json \\
  --state settlens.state.json \\
  --webhook https://hooks.example.com/settlens`,
  })}
${ctx.callout({ tone: "info", title: "Values in the example", body: html`<p><code>10000</code> atomic units is 0.01 USDC, which has 6 decimals. The asset is the USDC contract on Base (<code>eip155:8453</code>). Replace every value with the terms you actually advertise.</p>` })}`,
})}`,
})}
${ctx.section({
  id: "examples",
  title: "What the findings look like",
  lede: "Real output from the bundled demo target. One endpoint changes its price between requests, one unlocks for any signature, and one run tightens the ceiling below the advertised price.",
  tone: "raised",
  body: html`${ctx.split({
    main: ctx.terminal({ title: "Drift between identical requests", lines: DRIFT_LINES }),
    aside: ctx.terminal({ title: "Payment bypass (authorized probe)", lines: BYPASS_LINES }),
  })}
${ctx.terminal({ title: "Monitor: regression since the previous run", lines: MONITOR_LINES })}
${ctx.prose(html`<p>In the monitor run, the configuration's <code>maxAmount</code> was lowered from <code>10000</code> to <code>5000</code> after the first run recorded the baseline, which has the same effect as a price rising above the approved ceiling. The scan exit code is <code>1</code> when a failing check meets <code>--fail-on</code> and <code>2</code> for a CLI or configuration error; a drift warning alone does not fail the default <code>high</code> threshold.</p>`)}`,
})}
${ctx.section({
  id: "checks",
  title: "Checks that run on your endpoint",
  lede: "Generated from the Settlens check catalog. Policy checks run only for the fields you configure; active and facilitator checks run only when you enable them.",
  body: html`${checkTable(ctx, ENDPOINT_CHECKS, "Checks relevant to an x402 resource server")}
${ctx.prose(html`<p>The <a href="/docs/checks">full check reference</a> also explains why each check matters and how to fix a failure.</p>`)}`,
})}
${ctx.section({
  id: "deliverables",
  title: "What you get",
  tone: "raised",
  body: ctx.featureGrid(
    [
      { icon: "file", title: "Reports in three formats", body: "JSON with a deterministic SHA-256 integrity block, a self-contained HTML report and SARIF. Request header values and response bodies are left out.", href: "/docs/reports", linkLabel: "Report format" },
      { icon: "branch", title: "A CI gate", body: "A failing check at or above your threshold fails the build, and the JSON, HTML and SARIF reports of that run record why.", href: "/product/ci", linkLabel: "CI gate" },
      { icon: "activity", title: "Regression alerts", body: "Monitor flags a check whose status gets worse since the previous run, for example pass to fail, a new check that fails or warns, and a check that disappears. It can notify a webhook.", href: "/product/monitor", linkLabel: "Monitor" },
      { icon: "seal", title: "Evidence buyers can verify", body: "An ed25519 attestation binds the report digest to your signing key and a timestamp; anyone can check it offline.", href: "/product/evidence", linkLabel: "Signed evidence" },
      { icon: "chip", title: "The agent's view of your terms", body: "Agents using the Settlens MCP server run the same content checks on your 402 challenge before paying, so a challenge that fails your scan can also hold up their payment.", href: "/use-cases/agent-builders", linkLabel: "For agent builders" },
      { icon: "shield", title: "Guardrails on every run", body: "Passive mode never sends PAYMENT-SIGNATURE, and custom headers only go to hosts you allowlist separately from the configuration.", href: "/docs/security", linkLabel: "Security model" },
    ],
    { columns: 3 },
  ),
})}
${ctx.section({
  id: "limits",
  title: "Limits to keep in mind",
  width: "narrow",
  body: html`${ctx.callout({
    tone: "warning",
    title: "Settlens observes your endpoint from outside",
    body: "A passing report means the sampled endpoint behaved consistently with the tested properties during the recorded window. It is evidence of observed behavior, not a certification.",
  })}
${ctx.prose(html`<ul>
<li>Passive scans take two samples by default. The active probe sends one class of invalid payload. Neither reviews your application code or exercises every code path.</li>
<li>Settlens never sends a valid payment and never calls <code>/settle</code>, so it does not confirm on-chain settlement or that content is delivered after a real payment.</li>
<li>Policy checks compare what you advertise with what you configured. Whether the configured recipient is the right one is your review.</li>
<li>Rate limiting, uptime and pricing strategy are out of scope.</li>
<li>Run the active probe only on endpoints you own or are authorized to test, preferably on staging with testnet assets.</li>
</ul>`)}`,
})}
${ctx.section({
  id: "faq",
  title: "Questions from API teams",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Does a scan send a payment to my endpoint?", a: "No. Passive mode sends ordinary requests without any payment header, and Settlens refuses a user-supplied PAYMENT-SIGNATURE in flags or configuration. Only the authorized active probe sends a signature, and it is intentionally invalid." },
    { q: "Our endpoint also needs an API key. Can Settlens send it?", a: html`<p>Yes. Add it as a header, for example <code>--header "Authorization: Bearer \${ASSESSMENT_TOKEN}"</code>, and allow that exact host with <code>--allow-host</code> (or the Action's <code>allowed-hosts</code> input). Header values are never written to reports.</p>` },
    { q: "What does the drift warning mean?", a: "Two identical unauthenticated requests returned a different resource, accepts list or extensions. Known ephemeral Solana fields (recentBlockhash, lastValidBlockHeight) are ignored. If your pricing is intentionally dynamic, confirm it is bound to the requested resource." },
    { q: "Can I run the active probe against production?", a: "Only with the endpoint owner's explicit approval, recorded with --authorization-ref. The probe sends one invalid signature and never calls /settle, but we recommend staging and testnet assets first." },
    { q: "How do I get the CLI?", a: html`<p>Settlens is in a source repository. Pilot participants receive the CLI, which runs on Node.js 20.19 or newer, and the GitHub Action. <a href="/contact">Request a pilot</a> to get access.</p>` },
  ]),
})}
${ctx.cta({
  title: "Assess one paid endpoint first",
  body: "Send us the endpoint and the terms you expect it to advertise. The pilot report shows exactly what a paying client sees.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See a sample assessment", href: "/product/assess" },
  ],
})}`;
}
