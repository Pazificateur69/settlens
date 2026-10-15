// /product: platform overview. Counts, versions, Action inputs and MCP tool names are read
// from the repository at build time; claims follow the truth table in site/src/README.md.

import { CHECK_CATALOG, getCheck } from "../../../../src/catalog.js";
import { OFFICIAL_X402_CORE_VERSION } from "../../../../src/constants.js";
import { TOOL_NAMES } from "../../../../src/mcp.js";
import { DEMO_RUN, meta as homeMeta } from "../index.js";
import { actionBlock, repoFile } from "./_stage-kit.js";

export const meta = {
  path: "/product",
  title: "x402 assurance platform: CLI, CI, monitor and MCP",
  label: "Product",
  description:
    "How Settlens assesses x402 endpoints, gates CI, monitors drift and signs evidence, and the surfaces that run it: CLI, GitHub Action, container, API and MCP.",
  section: "product",
  schemaType: "CollectionPage",
  lastmod: "2026-10-13",
  summary:
    "Settlens runs one catalog of deterministic x402 checks in four stages, Assess, CI gate, Monitor and Evidence, through a CLI, a GitHub Action, a container image, an HTTP API and an MCP server. It never settles or sends a valid payment and holds no wallet.",
  sources: [
    { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "Static Analysis Results Interchange Format (SARIF) Version 2.1.0", url: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html", publisher: "OASIS" },
    { title: "Model Context Protocol specification (2025-06-18)", url: "https://modelcontextprotocol.io/specification/2025-06-18", publisher: "Model Context Protocol" },
  ],
  priority: 0.9,
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Product", path: "/product" },
  ],
  // Same #software node as the home page, so the shared @id never carries two descriptions.
  jsonLd: homeMeta.jsonLd,
};

const NETWORK_TOOLS = ["scan_endpoint", "scan_facilitator"];
for (const name of NETWORK_TOOLS) {
  if (!TOOL_NAMES.includes(name)) throw new Error(`product/index.js: MCP tool "${name}" is no longer defined in src/mcp.js.`);
}
const OFFLINE_TOOL_COUNT = TOOL_NAMES.length - NETWORK_TOOLS.length;
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const words = (n) => NUMBER_WORDS[n] ?? String(n);

// Five surfaces on top, one engine with four stages, three things it touches below. No ids, no inline styles.
const ARCHITECTURE_SVG = `<svg viewBox="0 0 720 432" width="720" height="432" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="16" y="16" width="128" height="56" rx="10"/>
  <rect class="d-node" x="154" y="16" width="128" height="56" rx="10"/>
  <rect class="d-node" x="292" y="16" width="128" height="56" rx="10"/>
  <rect class="d-node" x="430" y="16" width="128" height="56" rx="10"/>
  <rect class="d-node d-node--accent" x="568" y="16" width="136" height="56" rx="10"/>
  <text class="d-title" x="80" y="40" text-anchor="middle">CLI</text>
  <text class="d-title" x="218" y="40" text-anchor="middle">GitHub Action</text>
  <text class="d-title" x="356" y="40" text-anchor="middle">Container</text>
  <text class="d-title" x="494" y="40" text-anchor="middle">HTTP API</text>
  <text class="d-title" x="636" y="40" text-anchor="middle">MCP server</text>
  <text class="d-label" x="80" y="61" text-anchor="middle">settlens scan</text>
  <text class="d-label" x="218" y="61" text-anchor="middle">pull requests</text>
  <text class="d-label" x="356" y="61" text-anchor="middle">non-root</text>
  <text class="d-label" x="494" y="61" text-anchor="middle">bearer token</text>
  <text class="d-label d-label--accent" x="636" y="61" text-anchor="middle">stdio · /mcp</text>
  <path class="d-line" d="M80 74v26M218 74v26M356 74v26M494 74v26"/>
  <path class="d-head" d="M74 94l6 8 6-8M212 94l6 8 6-8M350 94l6 8 6-8M488 94l6 8 6-8"/>
  <path class="d-line d-accent" d="M636 74v26"/><path class="d-head d-head--accent" d="M630 94l6 8 6-8"/>
  <rect class="d-zone" x="16" y="108" width="688" height="170" rx="10"/>
  <text class="d-note" x="32" y="130">Settlens engine: the same checks in every stage</text>
  <rect class="d-node" x="32" y="144" width="138" height="56" rx="10"/>
  <rect class="d-node" x="202" y="144" width="138" height="56" rx="10"/>
  <rect class="d-node" x="372" y="144" width="138" height="56" rx="10"/>
  <rect class="d-node d-node--accent" x="542" y="144" width="146" height="56" rx="10"/>
  <text class="d-title" x="101" y="168" text-anchor="middle">Assess</text>
  <text class="d-title" x="271" y="168" text-anchor="middle">CI gate</text>
  <text class="d-title" x="441" y="168" text-anchor="middle">Monitor</text>
  <text class="d-title" x="615" y="168" text-anchor="middle">Evidence</text>
  <text class="d-label" x="101" y="189" text-anchor="middle">passive scan</text>
  <text class="d-label" x="271" y="189" text-anchor="middle">fail-on gate</text>
  <text class="d-label" x="441" y="189" text-anchor="middle">baseline diff</text>
  <text class="d-label" x="615" y="189" text-anchor="middle">ed25519 attest</text>
  <path class="d-msg" d="M172 172h24M342 172h24M512 172h24"/>
  <path class="d-head" d="M192 166l8 6-8 6M362 166l8 6-8 6M532 166l8 6-8 6"/>
  <rect class="d-node" x="32" y="216" width="656" height="46" rx="10"/>
  <text class="d-label" x="360" y="244" text-anchor="middle">${CHECK_CATALOG.length} checks · official @x402/core ${OFFICIAL_X402_CORE_VERSION} schema · offline signature verification</text>
  <path class="d-line" d="M132 280v28M360 280v28M584 280v28"/>
  <path class="d-head" d="M126 302l6 8 6-8M354 302l6 8 6-8M578 302l6 8 6-8"/>
  <text class="d-label" x="142" y="299">request, no payment</text>
  <text class="d-label" x="370" y="299">GET /supported</text>
  <text class="d-label" x="594" y="299">writes</text>
  <rect class="d-node" x="32" y="312" width="200" height="56" rx="10"/>
  <rect class="d-node" x="260" y="312" width="200" height="56" rx="10"/>
  <rect class="d-node" x="488" y="312" width="200" height="56" rx="10"/>
  <text class="d-title" x="132" y="336" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="360" y="336" text-anchor="middle">Facilitator</text>
  <text class="d-title" x="588" y="336" text-anchor="middle">Reports</text>
  <text class="d-label" x="132" y="357" text-anchor="middle">x402 V2 endpoint</text>
  <text class="d-label" x="360" y="357" text-anchor="middle">/supported · /verify</text>
  <text class="d-label" x="588" y="357" text-anchor="middle">JSON · HTML · SARIF</text>
  <text class="d-note d-note--blue" x="32" y="396">Active probe, CLI only and authorized: one invalid PAYMENT-SIGNATURE to the resource and /verify.</text>
  <text class="d-note" x="32" y="418">/settle is never called. No wallet, no payment key, no custody.</text>
</svg>`;

// The same architecture stacked for phones (shown below 40rem instead of ARCHITECTURE_SVG).
const ARCHITECTURE_SVG_NARROW = `<svg viewBox="0 0 320 936" width="320" height="936" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="16" y="16" width="140" height="52" rx="10"/>
  <rect class="d-node" x="164" y="16" width="140" height="52" rx="10"/>
  <rect class="d-node" x="16" y="76" width="140" height="52" rx="10"/>
  <rect class="d-node" x="164" y="76" width="140" height="52" rx="10"/>
  <rect class="d-node d-node--accent" x="16" y="136" width="288" height="52" rx="10"/>
  <text class="d-title" x="86" y="38" text-anchor="middle">CLI</text>
  <text class="d-title" x="234" y="38" text-anchor="middle">GitHub Action</text>
  <text class="d-title" x="86" y="98" text-anchor="middle">Container</text>
  <text class="d-title" x="234" y="98" text-anchor="middle">HTTP API</text>
  <text class="d-title" x="160" y="158" text-anchor="middle">MCP server</text>
  <text class="d-label" x="86" y="58" text-anchor="middle">settlens scan</text>
  <text class="d-label" x="234" y="58" text-anchor="middle">pull requests</text>
  <text class="d-label" x="86" y="118" text-anchor="middle">non-root</text>
  <text class="d-label" x="234" y="118" text-anchor="middle">bearer token</text>
  <text class="d-label d-label--accent" x="160" y="178" text-anchor="middle">stdio · /mcp</text>
  <path class="d-line" d="M160 190v20"/><path class="d-head" d="M154 204l6 8 6-8"/>
  <rect class="d-zone" x="8" y="216" width="304" height="332" rx="10"/>
  <text class="d-note" x="20" y="238">Settlens engine: same checks, every stage</text>
  <rect class="d-node" x="20" y="252" width="280" height="40" rx="10"/>
  <rect class="d-node" x="20" y="308" width="280" height="40" rx="10"/>
  <rect class="d-node" x="20" y="364" width="280" height="40" rx="10"/>
  <rect class="d-node d-node--accent" x="20" y="420" width="280" height="40" rx="10"/>
  <text class="d-title" x="36" y="277">Assess</text>
  <text class="d-title" x="36" y="333">CI gate</text>
  <text class="d-title" x="36" y="389">Monitor</text>
  <text class="d-title" x="36" y="445">Evidence</text>
  <text class="d-label" x="284" y="277" text-anchor="end">passive scan</text>
  <text class="d-label" x="284" y="333" text-anchor="end">fail-on gate</text>
  <text class="d-label" x="284" y="389" text-anchor="end">baseline diff</text>
  <text class="d-label" x="284" y="445" text-anchor="end">ed25519 attest</text>
  <path class="d-msg" d="M160 294v8M160 350v8M160 406v8"/>
  <path class="d-head" d="M156 298l4 5 4-5M156 354l4 5 4-5M156 410l4 5 4-5"/>
  <rect class="d-node" x="20" y="476" width="280" height="60" rx="10"/>
  <text class="d-label" x="160" y="501" text-anchor="middle">${CHECK_CATALOG.length} checks · @x402/core ${OFFICIAL_X402_CORE_VERSION}</text>
  <text class="d-label" x="160" y="522" text-anchor="middle">schema · offline signatures</text>
  <path class="d-line" d="M36 550V786M36 610h16M36 698h16M36 786h16"/>
  <path class="d-head" d="M48 604l8 6-8 6M48 692l8 6-8 6M48 780l8 6-8 6"/>
  <text class="d-label" x="60" y="574">request, no payment</text>
  <rect class="d-node" x="60" y="582" width="244" height="56" rx="10"/>
  <text class="d-title" x="182" y="606" text-anchor="middle">Paid resource</text>
  <text class="d-label" x="182" y="627" text-anchor="middle">x402 V2 endpoint</text>
  <text class="d-label" x="60" y="662">GET /supported</text>
  <rect class="d-node" x="60" y="670" width="244" height="56" rx="10"/>
  <text class="d-title" x="182" y="694" text-anchor="middle">Facilitator</text>
  <text class="d-label" x="182" y="715" text-anchor="middle">/supported · /verify</text>
  <text class="d-label" x="60" y="750">writes</text>
  <rect class="d-node" x="60" y="758" width="244" height="56" rx="10"/>
  <text class="d-title" x="182" y="782" text-anchor="middle">Reports</text>
  <text class="d-label" x="182" y="803" text-anchor="middle">JSON · HTML · SARIF</text>
  <text class="d-note d-note--blue" x="16" y="846">Active probe, CLI only and authorized:</text>
  <text class="d-note d-note--blue" x="16" y="864">one invalid PAYMENT-SIGNATURE to the</text>
  <text class="d-note d-note--blue" x="16" y="882">resource and /verify.</text>
  <text class="d-note" x="16" y="908">/settle is never called. No wallet,</text>
  <text class="d-note" x="16" y="926">no payment key, no custody.</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  const actionInputs = actionBlock(repoFile("action.yml"), "inputs").map((input) => input.name);
  const productPages = ctx.children("/product").map(ctx.toCard);
  const docsLabel = new Map(ctx.site.footer.find((column) => column.title === "Docs").links.map((link) => [link.path, link.label]));

  return html`${ctx.hero({
    title: "One engine for x402 assurance, five ways to run it.",
    lede: "Settlens runs one catalog of deterministic checks across four stages, Assess, CI, Monitor and Evidence, and reaches your engineers, pipelines and AI agents through a CLI, a GitHub Action, a container image, an HTTP API and an MCP server.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Try the free MCP tools", href: "/mcp" },
    ],
    aside: ctx.reportPreview({
      file: DEMO_RUN.reportFile,
      meta: "Recorded example",
      mode: DEMO_RUN.mode,
      target: DEMO_RUN.target,
      summary: DEMO_RUN.summary,
      findings: DEMO_RUN.findings.map((finding) => {
        const check = getCheck(finding.id);
        if (!check) throw new Error(`product/index.js: unknown check ${finding.id}.`);
        return { ...finding, severity: check.severity };
      }),
      facts: [
        { term: "scope", value: DEMO_RUN.scope },
        // U+2060 (word joiner) after the ellipsis: on phones the short digest wraps whole, never at "…".
        { term: "sha256", value: html`${ctx.icon("check-circle", { label: "Valid" })} verify-report · ${DEMO_RUN.digest.slice(0, 8)}…${"⁠"}${DEMO_RUN.digest.slice(-8)}` },
        { term: "canonical", value: DEMO_RUN.canonicalization },
        { term: "ed25519", value: html`${ctx.icon("check-circle", { label: "Valid" })} signature valid · report matches` },
      ],
      caption: html`Recorded example: the demo /bypass endpoint with the authorized probe, ${ctx.formatDate(DEMO_RUN.recordedOn)}, Settlens ${DEMO_RUN.version}. Report ids and digests change on every run. <a href="/docs/reports">Read the report format</a>.`,
    }),
  })}
${ctx.section({
  id: "architecture",
  title: "How the platform fits together",
  lede: "Every surface calls the same engine. By default the engine only reads: it requests the paid resource and the facilitator's capabilities, then writes reports you can verify.",
  body: ctx.diagram({
    svg: ARCHITECTURE_SVG,
    svgNarrow: ARCHITECTURE_SVG_NARROW,
    label: `Settlens architecture. Five integration surfaces, the CLI, the GitHub Action, the container image, the token-authenticated HTTP API and the MCP server over stdio or HTTP, call one engine. The engine runs four stages, Assess, CI gate, Monitor and Evidence, on one catalog of ${CHECK_CATALOG.length} checks with the official @x402/core ${OFFICIAL_X402_CORE_VERSION} schema. It requests the paid resource without paying, reads the facilitator's GET /supported and writes JSON, HTML and SARIF reports. Only the authorized CLI active probe sends one invalid payment signature; /settle is never called.`,
    caption: "Surfaces on top, the engine in the middle, what it touches below. Nothing in the engine pays, signs a payment or holds funds.",
    size: "wide",
  }),
})}
${ctx.section({
  id: "stages",
  title: "Stage by stage",
  lede: "What each stage does, where it runs and what it leaves behind. Verify and the agent preflight reuse the same engine outside the four-stage loop.",
  tone: "raised",
  body: ctx.table({
    caption: "Settlens stages and supporting capabilities",
    head: ["Stage", "What it does", "Runs from", "Output"],
    rowHeaders: true,
    rows: [
      [
        html`<a href="/product/assess">Assess</a>`,
        "Passive scan of the 402 handshake, PAYMENT-REQUIRED, every advertised requirement, the resource binding, drift and your policy. Optional facilitator scan and authorized fail-closed probe.",
        html`<code>settlens scan</code>, <code>facilitator</code> and <code>check</code>; the container; the HTTP API and MCP <code>scan_endpoint</code> (passive only)`,
        "JSON, HTML and SARIF reports with a SHA-256 integrity block",
      ],
      [
        html`<a href="/product/ci">CI gate</a>`,
        "Runs your configured targets on pull requests and fails the job when a check fails at or above the fail-on severity.",
        html`GitHub composite Action (<code>settlens check</code>)`,
        "Exit code 1 at the threshold, SARIF for code scanning, report artifacts",
      ],
      [
        html`<a href="/product/monitor">Monitor</a>`,
        "Compares each passive scan with the stored baseline and alerts on checks that get worse (pass or skip to warn or fail, warn to fail), on new failing or warning checks and on checks that disappear (coverage lost).",
        html`<code>settlens monitor</code> on a schedule (cron or CI)`,
        "Regression list, optional webhook POST, non-zero exit at the threshold",
      ],
      [
        html`<a href="/product/evidence">Evidence</a>`,
        "Binds a report's SHA-256 digest to an ed25519 signing identity and a timestamp.",
        html`<code>settlens evidence keygen</code>, <code>attest</code> and <code>verify</code>; MCP <code>verify_attestation</code>`,
        "Attestation JSON anyone can verify offline",
      ],
      [
        html`<a href="/product/verify">Verify</a>`,
        "Recovers the EIP-3009 / EIP-712 signer of a captured exact EVM authorization and checks recipient, amount, asset and validity window, with no RPC. Checks every signer of a Solana transaction.",
        html`<code>settlens verify-payment</code>; MCP <code>verify_payment_signature</code> and <code>verify_solana_transaction</code>`,
        "Verified or not, with the reasons",
      ],
      [
        html`<a href="/mcp">Agent preflight</a>`,
        "Evaluates a PAYMENT-REQUIRED header against the URL the agent requested and its spending policy, option by option.",
        html`MCP <code>evaluate_payment_requirements</code>, local or remote; the free <a href="/tools/x402-checker">x402 checker</a> in a browser`,
        "pay, review or do_not_pay, the reasons and the acceptable options",
      ],
    ],
  }),
})}
${ctx.section({
  id: "surfaces",
  title: "Integration surfaces",
  lede: "Pick the surface that matches who is asking: an engineer, a pipeline, an isolated host, a service or an AI agent.",
  body: html`${ctx.cards(
    [
      {
        icon: "terminal",
        title: "CLI",
        tag: "Node.js 20+",
        href: "/docs/cli",
        body: "scan, facilitator, check, monitor, verify-payment, verify-report, evidence and mcp. Exit code 1 when a finding meets the fail-on threshold, 2 on a usage or configuration error.",
      },
      {
        icon: "branch",
        title: "GitHub Action",
        tag: "Composite",
        href: "/docs/github-action",
        body: `Inputs: ${actionInputs.join(", ")}. Writes JSON, HTML and SARIF to a report directory and exposes it as an output.`,
      },
      {
        icon: "layers",
        title: "Container image",
        tag: "Non-root",
        body: "The Dockerfile pins node:24-alpine by digest, installs the locked production dependencies without install scripts and runs the CLI as the unprivileged node user.",
      },
      {
        icon: "key",
        title: "HTTP API",
        tag: "Bearer token",
        href: "/docs/api",
        body: "POST /api/scan runs a passive scan of a public URL, optionally with its facilitator, and returns the JSON report. Private and loopback destinations are refused.",
      },
      {
        icon: "chip",
        title: "MCP server",
        tag: "stdio + HTTP",
        href: "/mcp",
        body: `settlens mcp serves all ${words(TOOL_NAMES.length)} tools over stdio. The remote endpoint at settlens.com/mcp serves the ${words(OFFLINE_TOOL_COUNT)} offline tools publicly; the two network tools need a bearer token.`,
      },
    ],
    { columns: 2 },
  )}
${ctx.callout({
  tone: "info",
  title: "Availability",
  body: html`<p>Settlens lives in a source repository and is not distributed on npm. Pilot participants get the CLI, the GitHub Action and the Dockerfile; the HTTP API and the remote MCP network tools need a bearer token. <a href="/contact">Request a pilot</a> to get access, or see <a href="/pricing">pricing</a>.</p>`,
})}`,
})}
${ctx.section({
  id: "independent",
  title: "Self-testing vs independent assurance",
  lede: "Your own tests prove the paths you expected. Independent assurance applies fixed, published criteria and produces evidence that someone else can check.",
  tone: "raised",
  body: html`${ctx.comparisonTable({
    caption: "What typical in-house tests and Settlens each cover",
    columns: ["Question", "Typical in-house tests", "Settlens"],
    highlight: 2,
    rows: [
      { label: "Validates the 402 challenge with the official @x402/core schema", values: ["When someone wires it in", true] },
      { label: "Checks the resource binding and, against your policy, the recipient, asset, amount and network of every option", values: ["Usually the happy path", true] },
      { label: "Sends an invalid signature to check that the resource fails closed", values: ["Rarely: fixtures use valid payments", "One, with explicit authorization"] },
      { label: "Asks the facilitator to verify an invalid signature", values: ["Rarely", "During the authorized probe"] },
      { label: "Detects drift between identical requests", values: ["Rarely", true] },
      { label: "Same criteria in a pilot, in CI and in production monitoring", values: ["Often separate suites", true] },
      { label: "Tamper-evident, signed result a partner can verify offline", values: [false, true] },
      { label: "Knows your business logic and edge cases", values: [true, false] },
    ],
  })}
${ctx.prose(html`<p>Settlens does not replace your test suite. It adds an outside view with stable check ids from a <a href="/docs/checks">published catalog</a>, and a report records what was observed during the run. It is not a certification, a full security audit or legal advice; the <a href="/docs/methodology">methodology</a> explains what each result proves.</p>`)}`,
})}
${ctx.section({
  id: "deployment",
  title: "Deployment and security model",
  lede: "Settlens runs where you run it. The hosted surfaces add authentication, destination checks and rate limits.",
  body: html`${ctx.featureGrid([
    { icon: "terminal", title: "Runs in your environment", body: "The CLI, the Action and the container run on your machine or CI runner. A scan contacts only the targets and facilitators you configure, and the monitor adds only your optional webhook. Reports stay in your output directory." },
    { icon: "shield", title: "Passive unless authorized", body: html`Scans and monitoring never send a payment signature. The active probe needs <code>--active</code>, <code>--authorized</code> and an authorization reference, and is never offered by the HTTP API or MCP.` },
    { icon: "lock", title: "Secrets go only where you allow", body: "Custom headers are sent only to hosts on a separate allowlist (--allow-host, SETTLENS_ALLOWED_HOSTS or the Action's allowed-hosts), and their values never reach the report." },
    { icon: "key", title: "Hosted endpoints are gated", body: "POST /api/scan and the remote MCP network tools need a bearer token, refuse private and loopback destinations, never follow redirects and are rate limited per IP." },
    { icon: "layers", title: "Pinned supply chain", body: "Exact dependency versions with a lockfile, install scripts ignored, third-party GitHub actions pinned by commit SHA, container base image pinned by digest, non-root runtime." },
    { icon: "seal", title: "Your evidence key, no custody", body: "Evidence keys are generated locally with node:crypto and stay with you. Settlens holds no wallet, signs no payment and takes custody of nothing." },
  ])}
${ctx.callout({
  tone: "note",
  title: "What a report does not prove",
  body: html`<p>A passing report means the sampled endpoint behaved as the checks require during the recorded window. Settlens does not check on-chain balances, nonce use, replay or settlement, and a report does not prove the absence of other vulnerabilities. Read the <a href="/docs/security">security model</a> and the <a href="/security">security policy</a>.</p>`,
})}`,
})}
${ctx.section({
  id: "explore",
  title: "Explore the platform",
  lede: html`Each stage has its own page with real commands and output, the <a href="/tools">free x402 tools</a> run the public offline checks from your browser, and the documentation has the full reference.`,
  tone: "raised",
  body: html`${ctx.cards(
    [...productPages, { icon: "chip", title: "MCP server", href: "/mcp", body: "Give AI agents a preflight check on every HTTP 402, locally over stdio or remotely." }],
    { columns: 3 },
  )}
${ctx.table({
  caption: "Documentation by topic",
  head: ["Topic", "Pages"],
  rowHeaders: true,
  rows: ctx.site.docsNav.map((group) => [
    group.title,
    html`${group.paths.map((path, index) => html`${index ? ", " : ""}<a href="${path}">${docsLabel.get(path) ?? path}</a>`)}`,
  ]),
})}`,
})}
${ctx.cta({
  title: "Assess one paid endpoint first",
  body: "Start with a scoped pilot on one endpoint or facilitator, and get a report your engineers and partners can verify.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Connect the MCP server", href: "/mcp" },
  ],
})}`;
}
