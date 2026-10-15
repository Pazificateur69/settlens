import { AUTHOR, check, cliHasFlag } from "./_shared.js";

export const meta = {
  path: "/blog/detecting-x402-payment-drift",
  title: "Detecting x402 payment drift",
  heading: "Detecting x402 payment drift: price, recipient, network and asset changes",
  label: "Detecting payment drift",
  description:
    "How to catch x402 payment terms that change between identical requests or over time, with the Settlens stability check, policy pins and Monitor baselines.",
  lede: "An x402 endpoint that charges a different price, pays a different address or switches chains without anyone deciding it should is drifting. Here is how to see it within one scan and across weeks.",
  section: "blog",
  lastmod: "2026-10-13",
  datePublished: "2026-10-13",
  dateModified: "2026-10-13",
  author: AUTHOR,
  tags: ["x402", "Monitoring", "Drift", "Policy"],
  summary:
    "x402 payment drift is an unapproved change to payTo, amount, asset or network. Settlens catches it within one scan by comparing identical requests, fails at high severity when the terms leave the values pinned in your policy, and alerts on regressions over time by comparing each Monitor run with a stored baseline.",
  sources: [
    { title: "x402 protocol specification, version 2 (§5.1 PaymentRequired schema and PaymentRequirements fields)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
    { title: "EIP-55: Mixed-case checksum address encoding", url: "https://eips.ethereum.org/EIPS/eip-55", publisher: "Ethereum Improvement Proposals" },
  ],
  related: ["/blog/x402-security-failure-modes", "/blog/how-to-test-x402-endpoint", "/blog/signed-evidence-for-payment-assessments"],
};

const TIMESCALES_SVG = `<svg viewBox="0 0 720 300" width="720" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-zone" x="16" y="16" width="334" height="268" rx="10"/>
  <rect class="d-zone d-zone--blue" x="370" y="16" width="334" height="268" rx="10"/>
  <text class="d-title" x="36" y="48">Within one scan</text>
  <text class="d-text" x="36" y="72">identical requests, seconds apart</text>
  <rect class="d-node" x="36" y="92" width="294" height="34" rx="10"/>
  <rect class="d-node d-node--accent" x="36" y="136" width="294" height="34" rx="10"/>
  <rect class="d-node" x="36" y="180" width="294" height="34" rx="10"/>
  <text class="d-label" x="52" y="114">sample 1 · amount 10000</text>
  <text class="d-label d-label--accent" x="52" y="158">sample 2 · amount 25000</text>
  <text class="d-label" x="52" y="202">sample 3 · amount 10000</text>
  <text class="d-note" x="36" y="248">Fingerprints differ: stability WARN</text>
  <text class="d-label" x="36" y="270">stability.payment_requirements</text>
  <text class="d-title" x="390" y="48">Across runs</text>
  <text class="d-text" x="390" y="72">each scheduled scan vs the baseline</text>
  <path class="d-line" d="M432 150h232"/>
  <rect class="d-node" x="392" y="128" width="80" height="44" rx="10"/>
  <rect class="d-node" x="497" y="128" width="80" height="44" rx="10"/>
  <rect class="d-node d-node--accent" x="602" y="128" width="80" height="44" rx="10"/>
  <text class="d-title" x="432" y="155" text-anchor="middle">run 1</text>
  <text class="d-title" x="537" y="155" text-anchor="middle">run 2</text>
  <text class="d-title" x="642" y="155" text-anchor="middle">run 3</text>
  <text class="d-label" x="432" y="196" text-anchor="middle">baseline</text>
  <text class="d-label" x="537" y="196" text-anchor="middle">pass</text>
  <text class="d-label d-label--accent" x="642" y="196" text-anchor="middle">fail</text>
  <text class="d-note d-note--blue" x="390" y="248">Regression: ALERT, exit 1, webhook</text>
  <text class="d-label" x="390" y="270">settlens monitor</text>
</svg>`;

const DRIFT_SCAN = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/drift --max-amount 10000 --repeat 3" },
  { kind: "out", text: "Settlens x402 assessment 8d1c0f0c" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "blank", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/drift" },
  { kind: "out", text: "13 pass · 0 fail · 1 warn · 0 skip" },
  { kind: "warn", text: "  WARN medium   Payment requirements remain stable" },
  { kind: "muted", text: "       Payment terms changed between identical unauthenticated requests." },
  { kind: "blank", text: "" },
  { kind: "out", text: "Total: 13 pass · 0 fail · 1 warn · 0 skip" },
];

const STABILITY_EVIDENCE = `{
  "id": "stability.payment_requirements",
  "title": "Payment requirements remain stable",
  "status": "warn",
  "severity": "medium",
  "message": "Payment terms changed between identical unauthenticated requests.",
  "evidence": {
    "sampleCount": 3,
    "fingerprints": [
      "{\\"accepts\\":[{\\"amount\\":\\"10000\\",\\"asset\\":\\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\\",\\"extra\\":{\\"name\\":\\"USDC\\",\\"version\\":\\"2\\"},\\"maxTimeoutSeconds\\":60,\\"network\\":\\"eip15",
      "{\\"accepts\\":[{\\"amount\\":\\"25000\\",\\"asset\\":\\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\\",\\"extra\\":{\\"name\\":\\"USDC\\",\\"version\\":\\"2\\"},\\"maxTimeoutSeconds\\":60,\\"network\\":\\"eip15",
      "{\\"accepts\\":[{\\"amount\\":\\"10000\\",\\"asset\\":\\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\\",\\"extra\\":{\\"name\\":\\"USDC\\",\\"version\\":\\"2\\"},\\"maxTimeoutSeconds\\":60,\\"network\\":\\"eip15"
    ]
  },
  "recommendation": "Confirm that dynamic pricing or recipient selection is intentional and cryptographically bound to the requested resource."
}`;

const MONITOR_CONFIG = `{
  "version": 1,
  "failOn": "high",
  "targets": [
    {
      "name": "demo-drift",
      "url": "http://127.0.0.1:4402/drift",
      "repeat": 3,
      "expected": {
        "networks": ["eip155:84532"],
        "payTo": ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"],
        "maxAmount": "10000"
      }
    }
  ]
}`;

const MONITOR_RUNS = [
  { kind: "cmd", text: "settlens monitor --config settlens.config.json --state settlens.state.json" },
  { kind: "out", text: "demo-drift (GET http://127.0.0.1:4402/drift)" },
  { kind: "muted", text: "  baseline recorded (first run)" },
  { kind: "out", text: "0 blocking alert(s) at or above high." },
  { kind: "blank", text: "" },
  { kind: "cmd", text: "settlens monitor --config settlens.config.json --state settlens.state.json" },
  { kind: "out", text: "demo-drift (GET http://127.0.0.1:4402/drift)" },
  { kind: "muted", text: "  no regressions" },
  { kind: "pass", text: "  resolved policy.maximum_amount: fail -> pass" },
  { kind: "out", text: "0 blocking alert(s) at or above high." },
  { kind: "blank", text: "" },
  { kind: "cmd", text: "settlens monitor --config settlens.config.json --state settlens.state.json" },
  { kind: "out", text: "demo-drift (GET http://127.0.0.1:4402/drift)" },
  { kind: "fail", text: "  ALERT [high] policy.maximum_amount: pass -> fail — Amounts stay within the approved ceiling" },
  { kind: "out", text: "1 blocking alert(s) at or above high." },
];

const STATE_EXCERPT = `{
  "GET http://127.0.0.1:4402/drift": {
    "checks": [
      …,
      { "id": "policy.maximum_amount", "status": "fail", "severity": "high", "title": "Amounts stay within the approved ceiling" },
      { "id": "stability.payment_requirements", "status": "warn", "severity": "medium", "title": "Payment requirements remain stable" }
    ],
    "summary": { "pass": 14, "fail": 1, "warn": 1, "skip": 0 },
    "observedAt": "2026-10-13T09:43:13.255Z"
  }
}`;

const WEBHOOK = `{
  "product": "Settlens Monitor",
  "alerting": 1,
  "failOn": "high",
  "runs": [
    {
      "method": "GET",
      "url": "http://127.0.0.1:4402/drift",
      "alerts": [
        {
          "kind": "regression",
          "id": "policy.maximum_amount",
          "from": "pass",
          "to": "fail",
          "severity": "high",
          "title": "Amounts stay within the approved ceiling"
        }
      ]
    }
  ]
}`;

export default function render(ctx) {
  const { html, terminal, codeBlock, callout, diagram, table } = ctx;
  const stability = check("stability.payment_requirements");
  return html`<p>An x402 challenge is a promise written by the party that gets paid. The <code>PAYMENT-REQUIRED</code> header tells the client which network to pay on, in which token, to which address and how much. A paying agent has no other source for those values: it signs what the header says.</p>
<p>Payment drift is when that promise changes without anyone deciding it should. The price doubles after a configuration change. A recipient address rotates between two backends. A testnet network ships to production. The asset contract changes during a migration. Each request still returns a perfectly valid 402, so conformance tests stay green, and the problem only shows up in the ledger.</p>
<p>This article explains how to catch drift at two timescales: between identical requests made seconds apart, and between scans made days or weeks apart. Every output below is real, captured from the Settlens CLI against the <code>/drift</code> route of its demo target, which alternates its price on every request.</p>

<h2>What counts as drift</h2>
<p>Four fields carry the money: <code>payTo</code> (who receives it), <code>amount</code> (how much, in atomic units), <code>asset</code> (which token contract or mint) and <code>network</code> (which chain, as a CAIP-2 identifier such as <code>eip155:8453</code>). The <code>resource.url</code> that the payment is bound to and the <code>maxTimeoutSeconds</code> window matter too. Drift is any change to these for the same request, whether it happens:</p>
<ul>
  <li><strong>between identical requests</strong>: two backends with different configurations behind one load balancer, a random recipient rotation, a pricing function with a bug, or someone tampering with responses on the path; or</li>
  <li><strong>over time</strong>: a deploy that changes the price, a new treasury address, a token migration, an environment variable pointing production at a testnet.</li>
</ul>
<p>Some changes are legitimate. A merchant may rotate addresses or adjust prices on purpose. The goal is not to forbid change but to make sure every change to the money fields is visible and was intended.</p>

${diagram({
  svg: TIMESCALES_SVG,
  size: "wide",
  label: "Two timescales of drift detection. Left: within one scan, Settlens sends identical requests seconds apart and compares the payment terms; three samples with amounts 10000, 25000 and 10000 produce a stability warning. Right: across scheduled runs, Monitor compares each scan with a stored baseline; a check that goes from pass to fail is a regression that raises an alert, exits with code 1 and can post a webhook.",
  caption: "Drift within one scan is caught by comparing samples; drift over time is caught by comparing each run with a stored baseline.",
})}

<h2>Within one scan: the stability check</h2>
<p>By default, every passive scan samples the challenge twice. The check behind it is <code>${stability.id}</code>, and the catalog describes it precisely:</p>
<blockquote><p>${stability.verifies}</p></blockquote>
<p>In practice Settlens builds a fingerprint for each sample: the <code>resource</code>, <code>accepts</code> and <code>extensions</code> objects serialized as canonical JSON with sorted keys. Fields that are expected to change on every request, a Solana <code>recentBlockhash</code> or <code>lastValidBlockHeight</code>, are removed first, so a correct Solana challenge does not look unstable. If all fingerprints match, the check passes. If any differs, it warns at ${stability.severity} severity. With a single sample, for example when the second request fails, it is skipped rather than passed.</p>
<p>Use <code>--repeat</code> to take more samples (a configuration file accepts up to 10 per target). Here are three samples against the demo's drifting route, with a price ceiling of 10000:</p>
${terminal({ title: "Three samples of a drifting challenge", lines: DRIFT_SCAN })}
<p>The report keeps the evidence. Each fingerprint is truncated to its first 160 characters, enough to show a changed amount at a glance:</p>
${codeBlock({ lang: "json", title: "Stability check in the JSON report (excerpt)", code: STABILITY_EVIDENCE, wrap: true })}

<h3>Two details that matter</h3>
<p><strong>A warning never fails the build.</strong> The exit code and the CI gate count failing checks only, at or above the <code>--fail-on</code> threshold. Unstable terms are a warning because dynamic pricing can be intentional, so they show up in the JSON, HTML and SARIF reports, but they do not stop a pipeline on their own. If drift should block you, pin the values with a policy (next section): a challenge outside the policy fails at high severity. In Monitor, a stability check that goes from pass to warn is a medium-severity regression, which becomes blocking with <code>--fail-on medium</code>.</p>
<p><strong>Policy checks evaluate the first sample.</strong> Look at the transcript again: the price ceiling was 10000 and the second sample asked for 25000, yet the policy check passed. Policy and content checks run on the first challenge; the later samples feed the stability comparison only. Drift that alternates is therefore reported as instability, not as a policy breach, which is another reason to read warnings rather than just the exit code.</p>

<h3>How many samples are enough?</h3>
<p>Alternating drift like the demo's is caught by any two consecutive samples, as long as no other traffic interleaves. Random drift is probabilistic. If a server picks uniformly at random among <em>N</em> configurations, the chance that <em>k</em> samples all land on the same one is <em>N</em><sup>1−<em>k</em></sup>. With two configurations, two samples miss the drift half the time, five samples about 6% of the time and ten samples about 0.2% of the time. On an endpoint that matters, raise <code>repeat</code>.</p>

<h2>Pin the values you care about</h2>
<p>The stability check answers “did the terms change between requests?”. A policy answers “are these the terms we approved?”. Settlens evaluates a local policy against every advertised payment option, and each constraint fails at high severity when an option falls outside it:</p>
${table({
  caption: "Policy constraints and the checks they drive",
  head: ["Constraint", "CLI flag", "Configuration field", "Check"],
  rows: [
    ["Allowed recipients", html`<code>--expect-pay-to</code>`, html`<code>expected.payTo</code>`, html`<code>${check("policy.recipient").id}</code>`],
    ["Allowed networks (CAIP-2)", html`<code>--expect-network</code>`, html`<code>expected.networks</code>`, html`<code>${check("policy.network").id}</code>`],
    ["Allowed schemes", html`<code>--expect-scheme</code>`, html`<code>expected.schemes</code>`, html`<code>${check("policy.scheme").id}</code>`],
    ["Allowed assets", cliHasFlag("--expect-asset") ? html`<code>--expect-asset</code>` : "Configuration file only", html`<code>expected.assets</code>`, html`<code>${check("policy.asset").id}</code>`],
    ["Maximum atomic amount", html`<code>--max-amount</code>`, html`<code>expected.maxAmount</code>`, html`<code>${check("policy.maximum_amount").id}</code>`],
  ],
  rowHeaders: true,
})}
<p>Recipients and assets on EVM chains are compared case-insensitively, because EIP-55 capitalization is only a checksum; other formats, such as Solana base58 addresses, are compared exactly. Amounts are compared in atomic units, so a ceiling only means something next to an asset allowlist: <code>10000</code> is 0.01 USDC with 6 decimals, but a different quantity entirely in a token with other decimals. Pin the recipient, the asset, the network and the amount for any endpoint where money is at stake.</p>

<h2>Over time: Monitor baselines</h2>
<p>Most drift does not alternate between requests. It arrives with a deploy and then stays perfectly stable, so every individual scan looks consistent. Catching it takes memory. <code>settlens monitor</code> runs the passive scan for each target in a configuration, compares the result with the previous run stored in a state file and reports what changed.</p>
<p>Monitor compares <em>check results</em>, not raw values. A check that moves from pass or skip to warn or fail is a regression; a warning that becomes a failure is a regression; a check that appears for the first time already failing or warning is reported as new; a check that disappears, for example because someone deleted the price ceiling from the configuration, is reported as removed (coverage lost). Each alert is blocking when its severity is at or above <code>--fail-on</code> (the configuration's <code>failOn</code>, high by default) and a note otherwise. Monitoring is always passive: it never runs the active probe and never sends a payment.</p>
<p>Here is a configuration for the demo's drifting route, with recipient, network and price pinned:</p>
${codeBlock({ lang: "json", title: "settlens.config.json", code: MONITOR_CONFIG })}
<p>Three consecutive runs. Because the demo alternates its price on every request, the first sample of each run alternates too, which makes it a convenient way to watch Monitor in both directions:</p>
${terminal({ title: "Three Monitor runs against the drifting route", lines: MONITOR_RUNS })}
<p>The first run records the baseline. The second sees the price back under the ceiling and reports the failure as resolved. The third sees it above the ceiling again: <code>policy.maximum_amount</code> regressed from pass to fail, at high severity, so the process exits with code <code>1</code>. The stability warning was present in every run, so it never regressed and raised nothing new. The state file is plain JSON, keyed by each target's method and URL:</p>
${codeBlock({ lang: "json", title: "settlens.state.json (excerpt)", code: STATE_EXCERPT, wrap: true })}

<h3>Alerting</h3>
<p>Add <code>--webhook &lt;url&gt;</code> and Monitor posts a JSON summary whenever at least one blocking alert fires. This payload was captured from the third run above with a local listener:</p>
${codeBlock({ lang: "json", title: "Webhook payload", code: WEBHOOK })}
<p>The request times out after five seconds and does not follow redirects; a failed webhook is reported on stderr and does not change the exit code. Run Monitor from cron or a scheduled CI job, keep the state file between runs, and route the exit code or the webhook to whoever owns the endpoint.</p>

${callout({ tone: "info", title: "Monitor compares statuses, not values", body: html`<p>A deploy that moves the price from 9000 to 10000 under a 10000 ceiling, or that switches the recipient to another allowed address, produces no status change and therefore no alert. That is by design: those changes are inside what you approved. Tighten the policy if you want to hear about them.</p>` })}

<h2>What each kind of drift looks like</h2>
${table({
  caption: "Drift scenarios and where they surface",
  head: ["Change", "Within one scan", "Across Monitor runs"],
  rows: [
    ["Price alternates between requests", "Stability warning", "Stability regression if the previous run was stable; policy alerts when the first sample crosses the ceiling"],
    ["Price raised above the ceiling at a deploy", "Policy failure (high), if a ceiling is set", "Alert: maximum amount pass to fail"],
    ["Price changed within the ceiling", "Nothing", "Nothing (inside the approved range)"],
    ["Recipient replaced by an unreviewed address", "Policy failure (high), if recipients are pinned", "Alert: recipient pass to fail"],
    ["Recipient rotates among several addresses", "Stability warning (probabilistic)", "Regression if the previous run was stable"],
    ["Network switched, for example testnet to mainnet", "Policy failure (high), if networks are pinned", "Alert: network pass to fail"],
    ["Asset contract changed", "Policy failure (high), if assets are pinned", "Alert: asset pass to fail"],
    ["Challenge no longer bound to the URL", html`<code>binding.resource_url</code> failure`, "Alert: binding pass to fail"],
    ["Header disappears after a migration", html`<code>transport.payment_required_header</code> failure`, "Alert: header pass to fail"],
  ],
  rowHeaders: true,
})}

<h2>When prices are dynamic on purpose</h2>
<p>Dynamic pricing and x402 can coexist, but identical requests should still get identical terms. If the price depends on the request, put the variable in the URL (a path segment or a query parameter) so <code>resource.url</code> binds the payment to exactly what was priced, and each URL is stable on its own. If the price varies with time, expect a stability warning when a change lands between two samples, keep a ceiling that bounds the worst case, and document the behavior so whoever reviews the report knows the warning is intended. The check's own recommendation says it well: confirm that dynamic pricing or recipient selection is intentional and bound to the requested resource.</p>

<h2>Drift from the agent's side</h2>
<p>An agent paying an endpoint sees one challenge at a time, so it cannot compare samples the way a scan does. Its defense is the policy: allowed recipients, assets and networks plus a maximum amount, checked on every 402 before it signs (see our guide to <a href="/learn/agent-spending-policy">agent spending policies</a>). The Settlens <a href="/mcp">MCP server</a> exposes that check to AI agents as <code>evaluate_payment_requirements</code>, which answers pay, review or do not pay, and its passive <code>scan_endpoint</code> tool runs the same two-sample stability check described above. The article on <a href="/blog/mcp-verify-before-paying">verifying before paying with MCP</a> walks through it.</p>

<h2>Putting it together</h2>
<ol>
  <li>Write the reviewed terms into a configuration file: recipients, assets, networks, schemes and a ceiling.</li>
  <li>Scan with enough samples to make random drift unlikely to slip through, and read warnings, not just the exit code.</li>
  <li>Gate releases in CI so a deploy that breaks the policy never ships (see the <a href="/blog/how-to-test-x402-endpoint">testing checklist</a>).</li>
  <li>Schedule <code>settlens monitor</code> with a persistent state file and a webhook so drift after release reaches a person.</li>
</ol>
<p>The <a href="/docs/monitor">Monitor documentation</a> covers scheduling and state files, and the <a href="/product/monitor">Monitor product page</a> explains how it fits with the rest of Settlens. To set this up on your own endpoints, <a href="/contact">request a pilot</a>.</p>`;
}
