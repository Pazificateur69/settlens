// Home page. Every claim follows the capability truth table in site/src/README.md.
// Check ids, counts and mode descriptions are read from src/catalog.js at build time; the hero
// inspector and the #mcp result come from the real MCP server at build time (pages/mcp.js);
// the terminal transcripts and DEMO_RUN are real CLI output recorded against `npm run demo:server`.

import { CHECK_CATALOG, getCheck } from "../../../src/catalog.js";
import { VERSION } from "../../../src/constants.js";
import { DEMO_OPTION, DEMO_POLICY, DEMO_URL, evaluate } from "./mcp.js";

export const meta = {
  path: "/",
  title: "x402 security and testing for agentic payments",
  description:
    "x402 security and testing for agentic payments: Settlens checks paid APIs and facilitators, gates CI, monitors drift, signs evidence and vets 402s via MCP.",
  section: "home",
  lastmod: "2026-10-13",
  summary:
    "Settlens is a security and conformance tool for x402 agentic payments. It scans paid APIs and facilitators, gates CI, monitors drift, signs evidence and gives AI agents a pay, review or do_not_pay preflight over MCP, without ever paying, settling or holding funds.",
  sources: [
    { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "Model Context Protocol specification (2025-06-18)", url: "https://modelcontextprotocol.io/specification/2025-06-18", publisher: "Model Context Protocol" },
  ],
  priority: 1,
  changefreq: "weekly",
  jsonLd: {
    "@type": "SoftwareApplication",
    "@id": "https://settlens.com/#software",
    name: "Settlens",
    url: "https://settlens.com/product",
    description:
      "Independent security and conformance assurance for x402 agentic payments: passive endpoint and facilitator scans, a CI gate, drift monitoring, offline payment verification, signed evidence and an MCP server for AI agents.",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Any platform with Node.js 20.19 or newer",
    softwareVersion: VERSION,
    publisher: { "@id": "https://settlens.com/#organization" },
    featureList: [
      "Passive x402 V2 endpoint scan",
      "Facilitator /supported scan",
      "Authorized fail-closed probe with one invalid signature",
      "GitHub Action CI gate with SARIF",
      "Baseline drift monitoring",
      "Offline EIP-3009 and Solana signature verification",
      "ed25519-signed evidence attestations",
      "MCP server for agent payment preflight, over stdio or Streamable HTTP",
      "Token-authenticated HTTP API for passive scans",
    ],
    releaseNotes: "https://settlens.com/changelog",
  },
};

// Returns <code>id</code> (with break opportunities after "." and "_" so long ids wrap on phones)
// and fails the build if the id is no longer in the catalog.
function checkId(ctx, id) {
  if (!getCheck(id)) throw new Error(`index.js: unknown check id "${id}" (see src/catalog.js).`);
  return ctx.html`<code>${id.split(/(?<=[._])/).map((part, index) => (index ? ctx.html`<wbr>${part}` : part))}</code>`;
}

// Recorded on 2026-10-13 with Settlens 0.5.0 against `npm run demo:server` (127.0.0.1:4402).
const HERO_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass" },
  { kind: "out", text: "Settlens x402 assessment ac276b3e" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "pass", text: "13 pass · 0 fail · 0 warn · 0 skip" },
  { kind: "out", text: "" },
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
  { kind: "cont", text: "    --facilitator http://127.0.0.1:4402/facilitator \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-APPROVAL-002" },
  { kind: "out", text: "Settlens x402 assessment 19fc4364" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "out", text: "25 pass · 1 fail · 1 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Invalid payment authorization is denied" },
  { kind: "muted", text: "       The endpoint returned HTTP 200 after an invalid payment authorization." },
  { kind: "warn", text: "  WARN medium   Invalid payment uses a standard failure status" },
  { kind: "muted", text: "       Expected HTTP 400 or 402 for invalid payment, received HTTP 200." },
];

const EVIDENCE_LINES = [
  { kind: "cmd", text: "jq -r '.targets[0].checks[] | select(.status != \"pass\")" },
  { kind: "cont", text: "    | \"\\(.status) \\(.severity) \\(.id)\"' reports/settlens-19fc4364.json" },
  { kind: "fail", text: "fail critical security.invalid_signature_fail_closed" },
  { kind: "warn", text: "warn medium transport.invalid_payment_status" },
  { kind: "cmd", text: "jq -c .scope reports/settlens-19fc4364.json" },
  { kind: "out", text: "{\"targetCount\":1,\"activeTargetCount\":1,\"settlementCalls\":0,\"privateKeysUsed\":0}" },
  { kind: "cmd", text: "settlens verify-report reports/settlens-19fc4364.json" },
  { kind: "pass", text: "VALID Report content matches its SHA-256 evidence digest." },
  { kind: "muted", text: "Expected: d5c00c1f2ae0431340a566fb6b6cd6c90645db872f483c0c5efbbb698fdae09d" },
  { kind: "muted", text: "Actual:   d5c00c1f2ae0431340a566fb6b6cd6c90645db872f483c0c5efbbb698fdae09d" },
  { kind: "cmd", text: "settlens evidence keygen --out evidence.key" },
  { kind: "out", text: "Private key written to evidence.key (keep it secret)." },
  { kind: "muted", text: "Public key: 0x3ec0418921368b1b88e90b132699167c594d2e7d36bb6bc0c7a087b21fa708f7" },
  { kind: "cmd", text: "settlens evidence attest reports/settlens-19fc4364.json \\" },
  { kind: "cont", text: "    --key evidence.key --out attestation.json" },
  { kind: "out", text: "Attestation written to attestation.json" },
  { kind: "cmd", text: "settlens evidence verify attestation.json \\" },
  { kind: "cont", text: "    --report reports/settlens-19fc4364.json" },
  { kind: "pass", text: "VALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "muted", text: "Public key:      0x3ec0418921368b1b88e90b132699167c594d2e7d36bb6bc0c7a087b21fa708f7" },
];

// The report of the recorded active run above, as /product shows it. Recorded output: re-record the
// transcripts and these values together, never edit one value. The canonicalization is the 0.5.0 one.
export const DEMO_RUN = Object.freeze({
  recordedOn: "2026-10-13",
  version: "0.5.0",
  reportFile: "settlens-19fc4364.json",
  target: "GET http://127.0.0.1:4402/bypass",
  mode: "active-authorized",
  summary: Object.freeze({ pass: 25, fail: 1, warn: 1, skip: 0 }),
  findings: Object.freeze([
    { id: "security.invalid_signature_fail_closed", message: "The endpoint returned HTTP 200 after an invalid payment authorization." },
    { id: "transport.invalid_payment_status", message: "Expected HTTP 400 or 402 for invalid payment, received HTTP 200." },
  ]),
  scope: "settlementCalls 0 · privateKeysUsed 0",
  digest: "d5c00c1f2ae0431340a566fb6b6cd6c90645db872f483c0c5efbbb698fdae09d",
  canonicalization: "settlens-stable-json-v2",
});
// The build fails if DEMO_RUN and the transcripts stop describing the same run.
{
  const transcript = [...HERO_LINES, ...EVIDENCE_LINES].map((line) => line.text).join("\n");
  const { pass, fail, warn, skip } = DEMO_RUN.summary;
  const expected = [DEMO_RUN.reportFile, DEMO_RUN.digest, `${pass} pass · ${fail} fail · ${warn} warn · ${skip} skip`, ...DEMO_RUN.findings.map((f) => f.id), ...DEMO_RUN.findings.map((f) => f.message)];
  for (const text of expected) if (!transcript.includes(text)) throw new Error(`index.js: DEMO_RUN and the recorded transcripts disagree on "${text}".`);
}

// Build-time preflight: the demo /secure PAYMENT-REQUIRED evaluated for /premium under the complete
// demo policy, by the real MCP server. The hero inspector and the #mcp result both show it.
const PREMIUM_URL = "http://127.0.0.1:4402/premium";
const PREFLIGHT = (await evaluate({ policy: DEMO_POLICY, resourceUrl: PREMIUM_URL, id: 9 })).result;
if (PREFLIGHT.decision !== "do_not_pay") throw new Error("index.js: the /premium preflight no longer answers do_not_pay; update the hero.");
const statusOf = (id) => {
  const check = PREFLIGHT.checks.find((c) => c.id === id);
  if (!check) throw new Error(`index.js: no ${id} in the preflight.`);
  return check.status;
};
const short = (hex) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
const hostPath = (url) => url.replace(/^https?:\/\//, "");
const MCP_RESULT = JSON.stringify({ decision: PREFLIGHT.decision, summary: PREFLIGHT.summary, reasons: PREFLIGHT.reasons, acceptable: PREFLIGHT.acceptable }, null, 2);

const MCP_INSTALL = `# Remote endpoint: the offline tools, no install
claude mcp add --transport http settlens https://settlens.com/mcp

# Local stdio server from your pilot checkout: every tool
claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp`;

const LOOP_SVG = `<svg viewBox="0 0 720 262" width="720" height="262" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="20" y="24" width="140" height="62" rx="10"/>
  <rect class="d-node" x="200" y="24" width="140" height="62" rx="10"/>
  <rect class="d-node" x="380" y="24" width="140" height="62" rx="10"/>
  <rect class="d-node d-node--accent" x="560" y="24" width="140" height="62" rx="10"/>
  <text class="d-title" x="90" y="51" text-anchor="middle">Assess</text>
  <text class="d-title" x="270" y="51" text-anchor="middle">CI gate</text>
  <text class="d-title" x="450" y="51" text-anchor="middle">Monitor</text>
  <text class="d-title" x="630" y="51" text-anchor="middle">Evidence</text>
  <text class="d-label" x="90" y="73" text-anchor="middle">passive scan</text>
  <text class="d-label" x="270" y="73" text-anchor="middle">fail-on gate</text>
  <text class="d-label" x="450" y="73" text-anchor="middle">baseline diff</text>
  <text class="d-label" x="630" y="73" text-anchor="middle">ed25519 attest</text>
  <path class="d-msg" d="M162 55h34"/><path class="d-head" d="M190 49l8 6-8 6"/>
  <path class="d-msg" d="M342 55h34"/><path class="d-head" d="M370 49l8 6-8 6"/>
  <path class="d-msg" d="M522 55h34"/><path class="d-head" d="M550 49l8 6-8 6"/>
  <path class="d-msg d-msg--accent" d="M450 88v30H270v-28"/><path class="d-head d-head--accent" d="M264 98l6-8 6 8"/>
  <text class="d-note" x="360" y="138" text-anchor="middle">the fix for a regression goes back through the gate</text>
  <rect class="d-zone d-zone--blue" x="20" y="158" width="680" height="88" rx="10"/>
  <text class="d-note d-note--blue" x="36" y="182">AI agents, on every HTTP 402, before paying</text>
  <rect class="d-node" x="36" y="194" width="150" height="40" rx="10"/>
  <rect class="d-node d-node--accent" x="250" y="194" width="170" height="40" rx="10"/>
  <text class="d-title" x="111" y="219" text-anchor="middle">Agent</text>
  <text class="d-title" x="335" y="219" text-anchor="middle">MCP preflight</text>
  <path class="d-msg d-msg--blue" d="M188 214h58"/><path class="d-head d-head--blue" d="M240 208l8 6-8 6"/>
  <path class="d-msg d-msg--blue" d="M422 214h40"/><path class="d-head d-head--blue" d="M456 208l8 6-8 6"/>
  <text class="d-label d-label--accent" x="472" y="219">pay · review · do_not_pay</text>
</svg>`;

// The same loop stacked for phones (shown below 40rem instead of LOOP_SVG).
const LOOP_SVG_NARROW = `<svg viewBox="0 0 320 604" width="320" height="604" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="60" y="16" width="200" height="52" rx="10"/>
  <rect class="d-node" x="60" y="96" width="200" height="52" rx="10"/>
  <rect class="d-node" x="60" y="176" width="200" height="52" rx="10"/>
  <rect class="d-node d-node--accent" x="60" y="256" width="200" height="52" rx="10"/>
  <text class="d-title" x="160" y="39" text-anchor="middle">Assess</text>
  <text class="d-title" x="160" y="119" text-anchor="middle">CI gate</text>
  <text class="d-title" x="160" y="199" text-anchor="middle">Monitor</text>
  <text class="d-title" x="160" y="279" text-anchor="middle">Evidence</text>
  <text class="d-label" x="160" y="59" text-anchor="middle">passive scan</text>
  <text class="d-label" x="160" y="139" text-anchor="middle">fail-on gate</text>
  <text class="d-label" x="160" y="219" text-anchor="middle">baseline diff</text>
  <text class="d-label" x="160" y="299" text-anchor="middle">ed25519 attest</text>
  <path class="d-msg" d="M160 70v20M160 150v20M160 230v20"/>
  <path class="d-head" d="M154 84l6 8 6-8M154 164l6 8 6-8M154 244l6 8 6-8"/>
  <path class="d-msg d-msg--accent" d="M58 202H30v-80h22"/><path class="d-head d-head--accent" d="M48 116l8 6-8 6"/>
  <text class="d-note" x="160" y="334" text-anchor="middle">the fix for a regression goes</text>
  <text class="d-note" x="160" y="352" text-anchor="middle">back through the gate</text>
  <rect class="d-zone d-zone--blue" x="8" y="372" width="304" height="220" rx="10"/>
  <text class="d-note d-note--blue" x="24" y="396">AI agents, on every HTTP 402,</text>
  <text class="d-note d-note--blue" x="24" y="414">before paying</text>
  <rect class="d-node" x="70" y="428" width="180" height="40" rx="10"/>
  <rect class="d-node d-node--accent" x="70" y="492" width="180" height="40" rx="10"/>
  <text class="d-title" x="160" y="453" text-anchor="middle">Agent</text>
  <text class="d-title" x="160" y="517" text-anchor="middle">MCP preflight</text>
  <path class="d-msg d-msg--blue" d="M160 470v14"/><path class="d-head d-head--blue" d="M154 478l6 8 6-8"/>
  <path class="d-msg d-msg--blue" d="M160 534v14"/><path class="d-head d-head--blue" d="M154 542l6 8 6-8"/>
  <text class="d-label d-label--accent" x="160" y="572" text-anchor="middle">pay · review · do_not_pay</text>
</svg>`;

// Guides linked from the "Learn x402 security" section, as cards titled with each page's heading.
const LEARN_GUIDES = ["/learn/x402-security-checklist", "/learn/eip-3009", "/learn/what-is-x402"];
function learnCard(ctx, path) {
  const page = ctx.find(path);
  if (!page) throw new Error(`index.js: no page at ${path}.`);
  return { ...ctx.toCard(page), title: page.heading ?? page.title };
}

// The pillar articles, newest first; the build fails if one is renamed or unlisted.
const PILLAR_POSTS = ["/blog/how-to-test-x402-endpoint", "/blog/x402-security-failure-modes", "/blog/agentic-payments-what-breaks"];
function pillarPosts(ctx) {
  const posts = ctx.posts().filter((post) => PILLAR_POSTS.includes(post.path));
  if (posts.length !== PILLAR_POSTS.length) throw new Error("index.js: a pillar blog post is missing (see PILLAR_POSTS).");
  return posts;
}

const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };

const HIGHLIGHTS = [
  "transport.status_402",
  "schema.official_x402_sdk",
  "binding.resource_url",
  "schema.payment_requirements",
  "policy.recipient",
  "policy.asset",
  "policy.maximum_amount",
  "stability.payment_requirements",
  "transport.redirect",
  "facilitator.requirement_coverage",
  "security.invalid_signature_fail_closed",
  "security.facilitator_rejects_invalid_signature",
];

const MODES = [
  { mode: "offline", title: "Offline", icon: "file", body: "Evaluated from the PAYMENT-REQUIRED content alone. Runs in passive scans and in the MCP preflight." },
  { mode: "passive", title: "Passive", icon: "search", body: "Needs a live, unauthenticated request to the paid resource. Never sends a payment." },
  { mode: "facilitator", title: "Facilitator", icon: "layers", body: "Reads the facilitator's GET /supported capabilities: schema, V2 support, signers and coverage of the advertised requirements." },
  { mode: "active", title: "Active, authorized", icon: "shield", body: "Runs only with explicit authorization and sends one invalid PAYMENT-SIGNATURE. /settle is never called." },
];

export default function render(ctx) {
  const { html } = ctx;
  const id = (value) => checkId(ctx, value);
  const countFor = (mode) => CHECK_CATALOG.filter((check) => check.mode === mode).length;

  return html`${ctx.hero({
    title: "Make x402 payments safe to automate.",
    lede: "Settlens brings x402 security to agentic payments by checking all three sides. API sellers show that their paid endpoints advertise the right recipient, price and resource and refuse invalid signatures. Facilitators show that /verify rejects them. AI agents check each HTTP 402 against a spending policy before they pay.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Check a 402 in your browser", href: "/tools/x402-checker" },
    ],
    note: "Passive by default. No wallet, no payment keys, no custody.",
    aside: ctx.inspector({
      title: "evaluate_payment_requirements",
      meta: `${PREFLIGHT.checks.filter((check) => check.status === "pass").length} of ${PREFLIGHT.checks.length} checks pass`,
      request: { label: "Agent requested", call: `GET ${hostPath(PREMIUM_URL)}`, response: "402 PAYMENT-REQUIRED" },
      // The failing row goes last, so the scan animation ends on the catch.
      rows: [
        ["scheme", DEMO_OPTION.scheme, "policy.scheme"],
        ["network", DEMO_OPTION.network, "policy.network"],
        ["amount", DEMO_OPTION.amount, "policy.maximum_amount"],
        ["asset", short(DEMO_OPTION.asset), "policy.asset"],
        ["payTo", short(DEMO_OPTION.payTo), "policy.recipient"],
        ["resource.url", hostPath(DEMO_URL), "binding.resource_url"],
      ].map(([field, value, check]) => ({ field, value, check, status: statusOf(check) })),
      decision: { value: PREFLIGHT.decision, tone: "danger", reason: PREFLIGHT.reasons[0].replace(/^[\w.]+: /, "") },
      caption: html`Scenario: an agent asks for /premium and receives the demo /secure payment request. The checks and the verdict are real output of the <a href="/mcp">Settlens MCP server</a>, computed under a complete spending policy when this page was built.`,
    }),
  })}
${ctx.section({
  id: "problem",
  title: "In agentic payments, the costly failures are silent",
  lede: "With x402, a paid API answers HTTP 402 with machine-readable terms and an agent can pay without a human in the loop. When those terms, or their enforcement, are wrong, nothing crashes. The agent pays, or the content is served, and every log line looks normal.",
  body: ctx.featureGrid(
    [
      {
        icon: "alert",
        title: "A mis-advertised recipient",
        body: html`The <code>payTo</code> address changes through a configuration error or a compromised server, and agents keep paying someone else. Caught by ${id("policy.recipient")} against your allowlist, and by ${id("stability.payment_requirements")} when it changes between requests.`,
      },
      {
        icon: "activity",
        title: "A drifting price",
        body: html`The amount differs between identical requests or rises above what was approved. Caught by ${id("stability.payment_requirements")} and, against your ceiling, by ${id("policy.maximum_amount")}.`,
      },
      {
        icon: "lock",
        title: "A resource that unlocks on an invalid signature",
        body: html`The server checks that a <code>PAYMENT-SIGNATURE</code> is present, not that it is valid, so anyone gets the content for free. Caught by ${id("security.invalid_signature_fail_closed")}.`,
      },
      {
        icon: "x-circle",
        title: "A facilitator that verifies garbage",
        body: html`The facilitator's <code>/verify</code> answers <code>isValid: true</code> for an all-zero signature. Caught by ${id("security.facilitator_rejects_invalid_signature")}.`,
      },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  id: "assurance-loop",
  title: "One set of checks, from first scan to signed evidence",
  lede: "Every stage reuses the same check catalog, so a finding means the same thing in a pilot report, in CI and in production monitoring. Agents run the offline checks from the same catalog as a preflight.",
  tone: "raised",
  body: html`${ctx.diagram({
    svg: LOOP_SVG,
    svgNarrow: LOOP_SVG_NARROW,
    label: "The Settlens assurance loop: Assess, CI gate, Monitor and Evidence in sequence, with the fix for a regression found by Monitor going back through the CI gate. Below, AI agents call the MCP preflight on every HTTP 402 and receive pay, review or do_not_pay.",
    caption: "Four stages for the teams that run x402 endpoints, one preflight for the agents that pay them.",
    size: "wide",
  })}
${ctx.cards(
  [
    { icon: "search", title: "Assess", tag: "Passive by default", href: "/product/assess", body: "Scan the 402 handshake, PAYMENT-REQUIRED and every advertised requirement, plus the facilitator's GET /supported. The fail-closed probe runs only with explicit authorization." },
    { icon: "branch", title: "CI gate", tag: "GitHub Action", href: "/product/ci", body: "Run your target configuration in pull request workflows, fail the job at your fail-on severity and write SARIF for code scanning." },
    { icon: "activity", title: "Monitor", tag: "Scheduled", href: "/product/monitor", body: "Compare each passive scan with a stored baseline, flag regressions, POST an optional webhook alert and exit non-zero at your threshold." },
    { icon: "seal", title: "Evidence", tag: "ed25519", href: "/product/evidence", body: "Sign a report's SHA-256 digest and a timestamp with your own ed25519 key, so a partner or auditor can verify it offline." },
    { icon: "signature", title: "Verify", tag: "Offline, no RPC", href: "/product/verify", body: "Recover the signer of a captured EIP-3009 authorization and check recipient, amount, asset and validity window. Solana transaction signers too." },
    { icon: "chip", title: "MCP preflight", tag: "For AI agents", href: "/mcp", body: "Agents call evaluate_payment_requirements on every HTTP 402 and get pay, review or do_not_pay, with the reasons." },
  ],
  { columns: 3 },
)}`,
  actions: [{ label: "All product capabilities", href: "/product" }],
})}
${ctx.section({
  id: "demo",
  title: "A recorded run: the bypass a passive scan cannot see",
  lede: "The demo server that ships with Settlens includes /bypass, an endpoint that advertises valid x402 V2 terms but serves its content for any PAYMENT-SIGNATURE. The first transcript shows steps 1 and 2; the second picks up from the report.",
  body: html`${ctx.terminal({ title: "Recorded demo run (excerpt): /bypass accepts invalid signatures by design", lines: HERO_LINES })}
${ctx.steps([
      { title: "Passive scan: everything looks right", body: "13 checks pass. The 402 status, the PAYMENT-REQUIRED header, the official SDK schema, the resource binding and the stability of the terms are all correct." },
      { title: "Authorized probe: the bypass appears", body: html`<p>With the owner's authorization and a reference, Settlens sends one intentionally invalid <code>PAYMENT-SIGNATURE</code>. The facilitator's <code>/verify</code> rejects it, yet the resource answers HTTP 200, so ${id("security.invalid_signature_fail_closed")} fails at critical severity.</p>` },
      { title: "The report names every check", body: html`<p>The JSON report lists each result by check id, records <code>settlementCalls: 0</code> and <code>privateKeysUsed: 0</code>, and <code>verify-report</code> recomputes its SHA-256 digest.</p>` },
      { title: "Evidence anyone can verify offline", body: html`<p><code>evidence attest</code> binds the report digest to your ed25519 key and a timestamp. <code>evidence verify</code> checks the signature and that the report is the one attested.</p>` },
    ])}
${ctx.callout({
  tone: "note",
  title: "Recorded example",
  body: html`<p>Captured on October 13, 2026 with Settlens 0.5.0 and <code>npm run demo:server</code> on 127.0.0.1. <code>settlens</code> is the CLI's command name; in a checkout you can run <code>node src/cli.js</code>. Report ids, digests and keys change on every run. Try it yourself with the <a href="/docs/quickstart">quickstart</a>.</p>`,
})}
${ctx.terminal({ title: "Recorded example: report, integrity and evidence", lines: EVIDENCE_LINES })}`,
})}
${ctx.section({
  id: "checks",
  title: "What Settlens checks",
  lede: `${CHECK_CATALOG.length} checks in four modes. Each has a stable id, a default severity, an explanation of why it matters and a documented fix, linked to the x402 V2 specification where one applies.`,
  tone: "raised",
  body: html`${ctx.cards(
    MODES.map(({ mode, title, icon, body }) => ({ icon, title, body, tag: `${countFor(mode)} checks` })),
    { columns: 4 },
  )}
${ctx.table({
  caption: "A selection of checks from the catalog",
  head: ["Check id", "What it verifies", "Mode", "Default severity"],
  rows: HIGHLIGHTS.map((value) => {
    const check = getCheck(value);
    if (!check) throw new Error(`index.js: unknown check id "${value}" (see src/catalog.js).`);
    return [html`<code>${check.id}</code>`, check.title, check.mode, ctx.badge(check.severity, { tone: SEVERITY_TONE[check.severity] })];
  }),
  rowHeaders: true,
})}`,
  actions: [
    { label: "Browse every check", href: "/docs/checks" },
    { label: "Read the methodology", href: "/docs/methodology" },
  ],
})}
${ctx.section({
  id: "principles",
  title: "Security principles built into the tool",
  lede: "Settlens is designed so that running it cannot move money, leak your secrets or overstate what it observed.",
  body: html`${ctx.stats([
    { value: "0", label: "Settlement calls", detail: "Each report records settlementCalls" },
    { value: "0", label: "Private keys used by a scan", detail: "Each report records privateKeysUsed" },
    { value: "1", label: "Invalid signature per active probe", detail: "Only with explicit authorization" },
    { value: "3", label: "Report formats", detail: "JSON, HTML and SARIF" },
  ])}
${ctx.featureGrid(
      [
        { icon: "search", title: "Passive by default", body: "A scan sends ordinary requests with no payment, two by default, follows no redirect and reads at most 1 MiB of each response." },
        { icon: "x-circle", title: "Never pays", body: "Settlens never calls /settle and never sends a real payment. A PAYMENT-SIGNATURE you supply is rejected outright; the active probe only ever sends an invalid one." },
        { icon: "key", title: "No custody", body: "No wallet, no payment key, no funds: the only key is the ed25519 key that signs your evidence. Settlens is not a blockchain and has no token." },
        { icon: "shield-check", title: "Authorized probing only", body: html`The active probe needs <code>--active</code>, <code>--authorized</code> and an <code>--authorization-ref</code>, and that reference is written into the report.` },
        { icon: "lock", title: "Secrets stay out of evidence", body: "Reports keep request header names but not their values, store a digest instead of the response body and redact credentials and secret query parameters in URLs. Custom headers only go to hosts you allowlist." },
        { icon: "seal", title: "Signed, verifiable evidence", body: "Every JSON report carries a deterministic SHA-256 digest. An ed25519 attestation binds it to a signing identity and a time, verifiable offline." },
      ],
      { columns: 3 },
    )}`,
  actions: [
    { label: "Security model", href: "/docs/security" },
    { label: "How we handle security", href: "/security" },
  ],
})}
${ctx.section({
  id: "mcp",
  title: "A preflight check for AI agents",
  lede: "The Settlens MCP server lets Claude and any other MCP client check an x402 payment request before paying. It never signs, never pays and never needs a key.",
  tone: "raised",
  body: html`${ctx.split({
    main: ctx.prose(html`<p>On every HTTP 402, the agent passes the <code>PAYMENT-REQUIRED</code> header, the URL it requested and its spending policy to <code>evaluate_payment_requirements</code>. Settlens validates the request offline with the official <code>@x402/core</code> schema, checks that it is bound to that URL, validates every payment option and applies the policy.</p>
<ul>
  <li><strong>do_not_pay</strong>: a high or critical check failed. The agent must not pay.</li>
  <li><strong>review</strong>: something needs a human, including a policy that does not bound the recipient, the asset, the network and the amount.</li>
  <li><strong>pay</strong>: every protocol check passed and an advertised option fits the policy. The agent pays only with an entry listed in <code>acceptable</code>.</li>
</ul>`),
    aside: ctx.prose(html`<p>The remote endpoint at <code>https://settlens.com/mcp</code> serves the offline tools publicly. The passive network tools, <code>scan_endpoint</code> and <code>scan_facilitator</code>, need a bearer token there and are always available in the local stdio server.</p>
<p>No agent yet? Paste a <code>PAYMENT-REQUIRED</code> header in the <a href="/tools/x402-checker">free x402 checker</a> to run the same evaluation from your browser.</p>
<p>Read the <a href="/docs/mcp">MCP reference</a> for every tool's inputs and outputs, <a href="/learn/agent-spending-policy">how to write an agent spending policy</a>, or <a href="/blog/mcp-verify-before-paying">why agents should verify before paying</a>.</p>`),
  })}
${ctx.codeBlock({ lang: "shell", title: "Add Settlens to Claude Code", code: MCP_INSTALL, wrap: true })}
${ctx.codeBlock({ lang: "json", title: "Result (excerpt): the demo /secure request, evaluated for /premium", code: MCP_RESULT, wrap: true })}`,
  actions: [
    { label: "Set up the MCP server", href: "/mcp", icon: "arrow-right" },
    { label: "Try the free x402 checker", href: "/tools/x402-checker" },
  ],
})}
${ctx.section({
  id: "who",
  title: "Who Settlens is for",
  lede: "Four kinds of teams work with x402 payments. Each needs a different answer from the same checks.",
  body: ctx.cards(
    [
      { icon: "layers", title: "API sellers", href: "/use-cases/api-sellers", body: "Prove your paid endpoints advertise the right terms and fail closed before agents rely on them." },
      { icon: "shield-check", title: "Facilitators", href: "/use-cases/facilitators", body: "Show that /supported is conformant and /verify rejects invalid signatures, with evidence partners can check." },
      { icon: "chip", title: "Agent builders", href: "/use-cases/agent-builders", body: "Give agents a policy-bound preflight on every 402, so a mis-advertised request is stopped or sent to a human before payment." },
      { icon: "search", title: "Security teams", href: "/use-cases/security-teams", body: "Run authorized, reproducible x402 assessments and hand over signed, offline-verifiable reports." },
    ],
    { columns: 4 },
  ),
  actions: [{ label: "All use cases", href: "/use-cases" }],
})}
${ctx.section({
  id: "faq",
  title: "Questions, answered plainly",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    {
      q: "Does Settlens move funds or need a wallet?",
      a: "No. Settlens never calls /settle, never sends a valid payment and needs no wallet or payment key. The only payment data it ever sends is one intentionally invalid signature, and only during an authorized active probe. Every report records zero settlement calls and zero private keys used.",
    },
    {
      q: "Is it safe to run against a production endpoint?",
      a: html`<p>Passive mode sends ordinary requests with no payment, two by default, follows no redirect and reads a bounded response. The active probe runs only with <code>--active</code>, <code>--authorized</code> and an authorization reference from the endpoint owner. Only test endpoints you own or are allowed to assess.</p>`,
    },
    {
      q: "How do AI agents use Settlens?",
      a: html`<p>Through the MCP server. On every HTTP 402 the agent calls <code>evaluate_payment_requirements</code> with the header, the requested URL and its spending policy, and receives <code>pay</code>, <code>review</code> or <code>do_not_pay</code> with the reasons. See <a href="/mcp">the MCP server</a>, or try the same check without an agent in the <a href="/tools/x402-checker">free x402 checker</a>.</p>`,
    },
    {
      q: "What does a passing report prove?",
      a: html`<p>That the sampled endpoint behaved as the checks require during the recorded run. It does not prove the absence of other vulnerabilities, and Settlens does not check on-chain balances, nonce use or settlement. A report is evidence of observed behavior, not a certification or legal advice. <a href="/docs/methodology">Read the methodology</a>.</p>`,
    },
    {
      q: "How do I get Settlens?",
      a: "Settlens lives in a source repository. Pilot participants get the CLI (Node.js 20.19 or newer), the GitHub Action and the Dockerfile. It is not distributed on npm. Request a pilot to get access.",
    },
    {
      q: "Is there a Settlens token?",
      a: "No. Settlens is not a blockchain, has no token and never takes custody of funds.",
    },
  ]),
  actions: [{ label: "All questions", href: "/faq" }],
})}
${ctx.section({
  id: "learn",
  title: "Learn x402 security",
  lede: "How x402 payments work, what to check before agents pay and the failure modes we test for, in guides and articles.",
  body: ctx.split({
    main: ctx.postList(pillarPosts(ctx), { headingLevel: 3 }),
    aside: ctx.cards(LEARN_GUIDES.map((path) => learnCard(ctx, path)), { columns: 1 }),
  }),
  actions: [
    { label: "All x402 security guides", href: "/learn" },
    { label: "All x402 security articles", href: "/blog" },
  ],
})}
${ctx.cta({
  title: "Start with one endpoint, facilitator or agent flow",
  body: "A scoped pilot on one endpoint, facilitator or agent flow, with a report your engineers and partners can verify.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See pricing", href: "/pricing" },
  ],
})}`;
}
