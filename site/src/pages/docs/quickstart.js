// Quickstart. Every transcript is real output from the bundled demo server (npm run demo:server);
// dependency names come from package.json at build time.

import { VERSION } from "../../../../src/constants.js";
import { repoJson } from "./_shared.js";

const STEPS = [
  ["get-access", "Get access", "Request a pilot to receive the private Settlens repository."],
  ["install", "Install the locked dependencies", "In the repository, run npm ci --ignore-scripts, then node src/cli.js --version."],
  ["start-demo", "Start the demo server", "Run npm run demo:server to serve local x402 endpoints on 127.0.0.1:4402."],
  ["first-scan", "Run a passive scan", "Run settlens scan http://127.0.0.1:4402/secure and read the console summary."],
  ["read-report", "Read the report", "Open the HTML report and look at the JSON report written to the reports directory."],
  ["verify-report", "Verify the report", "Run settlens verify-report on the JSON report to check its SHA-256 digest."],
  ["see-a-finding", "See a finding", "Scan the drifting demo endpoint with a policy to see failing and warning checks."],
];

export const meta = {
  path: "/docs/quickstart",
  title: "Quickstart: your first x402 scan",
  label: "Quickstart",
  heading: "Quickstart",
  lede: "Install the Settlens CLI, scan a local x402 endpoint, read the report and verify its integrity, in about ten minutes and without a wallet.",
  description: "Get started with Settlens: install the CLI, run the local x402 demo server, scan an endpoint passively, read the JSON and HTML reports and verify them.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 2,
  icon: "arrow-right",
  summary: "Install the Settlens CLI (Node.js 20.19 or newer, from the source repository shared with pilot participants), start the bundled demo server and run settlens scan on a local x402 endpoint. It writes JSON, HTML and SARIF reports; verify-report then checks the SHA-256 digest. No wallet is needed.",
  sources: [
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  jsonLd: {
    "@type": "HowTo",
    "@id": "https://settlens.com/docs/quickstart#howto",
    name: "Run your first Settlens x402 scan",
    description: "Install the Settlens CLI, start the local demo server, run a passive scan, read and verify the report.",
    tool: [{ "@type": "HowToTool", name: "Node.js 20.19 or newer" }],
    step: STEPS.map(([id, name, text], index) => ({ "@type": "HowToStep", position: index + 1, name, text, url: `https://settlens.com/docs/quickstart#${id}` })),
  },
};

const t = (kind, text) => ({ kind, text });

export default function render(ctx) {
  const { html, codeBlock, terminal, table, callout, find } = ctx;
  const checker = find("/tools/x402-checker");
  const pkg = repoJson("package.json");
  const runtime = Object.entries(pkg.dependencies ?? {});
  const dev = Object.keys(pkg.devDependencies ?? {});
  const list = (names) => names.map((name, index) => html`${index ? (index === names.length - 1 ? " and " : ", ") : ""}<code>${name}</code>`);

  return html`<p>This guide runs Settlens against a demo server on your own machine. Apart from installing dependencies from npm, nothing leaves <code>127.0.0.1</code>; no wallet or key is involved, and the demo includes endpoints that are deliberately wrong so you can see real findings.</p>
${checker ? callout({ tone: "info", title: "No access yet? Start in the browser", body: html`<p>Paste a <code>PAYMENT-REQUIRED</code> header into the <a href="${checker.path}">x402 payment request checker</a> to run the offline checks with nothing to install. The steps below run the full passive scan on your machine.</p>` }) : ""}

<h2 id="requirements">Requirements</h2>
<ul>
  <li>Node.js ${pkg.engines?.node?.replace(">=", "")} or newer, with npm. Check with <code>node --version</code>.</li>
  <li>A copy of the Settlens repository (see the next step).</li>
  <li>Two terminal windows: one for the demo server, one for the CLI.</li>
</ul>

<h2 id="get-access">1. Get access</h2>
<p>Settlens is developed in a source repository. Pilot participants receive access to it; it is not published on npm. If you do not have access yet, <a href="/contact">request a pilot</a> and describe the endpoints or facilitators you want assessed.</p>

<h2 id="install">2. Install the locked dependencies</h2>
<p>From the repository root:</p>
${codeBlock({ lang: "shell", title: "Install and check the version", code: `npm ci --ignore-scripts
node src/cli.js --version` })}
<p><code>npm ci</code> installs the exact versions from <code>package-lock.json</code>: the runtime dependencies ${list(runtime.map(([name]) => name))}${dev.length ? html`, and ${list(dev)} for the test suite` : ""}. <code>--ignore-scripts</code> stops packages from running install scripts. The version command prints <code>${VERSION}</code>.</p>
<p>The rest of the documentation writes <code>settlens</code> for <code>node src/cli.js</code>. Define an alias so you can paste the examples as they are:</p>
${codeBlock({ lang: "shell", title: "Alias (run from the repository root)", code: `alias settlens="node $PWD/src/cli.js"` })}

<h2 id="start-demo">3. Start the demo server</h2>
<p>In the first terminal:</p>
${terminal({
  title: "npm run demo:server",
  lines: [
    t("cmd", "npm run demo:server"),
    t("out", "Settlens demo server listening on http://127.0.0.1:4402"),
    t("muted", "  secure:         http://127.0.0.1:4402/secure"),
    t("muted", "  missing header: http://127.0.0.1:4402/missing-header"),
    t("muted", "  drifting price: http://127.0.0.1:4402/drift"),
    t("muted", "  bypass:         http://127.0.0.1:4402/bypass"),
    t("muted", "  facilitator:    http://127.0.0.1:4402/facilitator"),
  ],
})}
${table({
  caption: "Demo endpoints",
  head: ["Path", "Behavior", "What it demonstrates"],
  rows: [
    ["/secure", "Answers 402 with a valid PAYMENT-REQUIRED, and 402 again to any payment signature.", "A conformant paid resource: every check passes."],
    ["/missing-header", "Answers 402 without PAYMENT-REQUIRED.", "A failing transport.payment_required_header check."],
    ["/drift", "Alternates the price between 10000 and 25000 atomic units on each request.", "A stability warning and policy failures."],
    ["/bypass", "Answers 200 with content to any PAYMENT-SIGNATURE, valid or not.", "The critical finding of the authorized active probe."],
    ["/facilitator", "Serves GET /supported and rejects every POST /verify.", "A conformant facilitator for scan --facilitator."],
  ],
  rowHeaders: true,
})}
<p>The demo advertises the Base Sepolia test network (<code>eip155:84532</code>). Set <code>SETTLENS_DEMO_PORT</code> to use another port.</p>

<h2 id="first-scan">4. Run your first passive scan</h2>
<p>In the second terminal:</p>
${terminal({
  title: "settlens scan (exit 0; absolute paths shortened)",
  lines: [
    t("cmd", "settlens scan http://127.0.0.1:4402/secure"),
    t("out", "Settlens x402 assessment 8ef6b907"),
    t("muted", "Targets 1 · Active 0 · Settlement calls 0"),
    t("out", ""),
    t("out", "127.0.0.1  GET http://127.0.0.1:4402/secure"),
    t("pass", "13 pass · 0 fail · 0 warn · 0 skip"),
    t("out", ""),
    t("out", "Total: 13 pass · 0 fail · 0 warn · 0 skip"),
    t("out", ""),
    t("out", "Reports:"),
    t("muted", "  …/reports/settlens-8ef6b907.json"),
    t("muted", "  …/reports/settlens-8ef6b907.html"),
    t("muted", "  …/reports/settlens-8ef6b907.sarif"),
  ],
})}
<p>Settlens requested the endpoint twice without any payment header, decoded the <code>PAYMENT-REQUIRED</code> header, validated it with the official x402 SDK and its own rules, checked that the payment terms point at the URL you asked for and stayed the same across both requests, and ran 13 checks in total. <code>Settlement calls 0</code> is literal: Settlens never calls <code>/settle</code>. Your report id will differ.</p>

<h2 id="read-report">5. Read the report</h2>
<p>The scan wrote three files to <code>reports/</code>. Open the <strong>HTML</strong> file in a browser for a readable summary with every check, its message and its evidence. The <strong>JSON</strong> file is the evidence itself; each check looks like this:</p>
${codeBlock({ lang: "json", title: "One check from settlens-8ef6b907.json", code: `{
  "id": "binding.resource_url",
  "title": "Payment requirement is bound to the requested resource",
  "status": "pass",
  "severity": "high",
  "message": "resource.url exactly matches the protected request URL.",
  "evidence": {
    "requested": "http://127.0.0.1:4402/secure",
    "advertised": "http://127.0.0.1:4402/secure"
  }
}`, copy: false })}
<p>Look up any id in the <a href="/docs/checks">check catalog</a>, and every field in <a href="/docs/reports">Reports</a>. The <strong>SARIF</strong> file is for code-scanning tools.</p>

<h2 id="verify-report">6. Verify the report</h2>
<p>The JSON report ends with a SHA-256 digest of its own content. Anyone who receives the file can check it has not been edited:</p>
${terminal({
  title: "settlens verify-report",
  lines: [
    t("cmd", "settlens verify-report reports/settlens-8ef6b907.json"),
    t("pass", "VALID Report content matches its SHA-256 evidence digest."),
    t("muted", "Expected: 646b3d941885b8bf1cb50ff4f55a24b0635b936ba233d24957c235bf1ce4f1ef"),
    t("muted", "Actual:   646b3d941885b8bf1cb50ff4f55a24b0635b936ba233d24957c235bf1ce4f1ef"),
  ],
})}
<p>Change any value in the file and run it again: the result becomes <code>INVALID</code> and the command exits 1. To also prove who produced a report, sign it with <a href="/docs/evidence">Evidence</a>.</p>

<h2 id="see-a-finding">7. See a finding</h2>
<p>Scan the drifting endpoint with a policy that expects Base mainnet and a lower price ceiling:</p>
${terminal({
  title: "settlens scan with a policy (exit 1)",
  lines: [
    t("cmd", "settlens scan http://127.0.0.1:4402/drift \\"),
    t("cont", "    --expect-network eip155:8453 --max-amount 5000"),
    t("out", "Settlens x402 assessment 7093ee3c"),
    t("muted", "Targets 1 · Active 0 · Settlement calls 0"),
    t("out", ""),
    t("out", "127.0.0.1  GET http://127.0.0.1:4402/drift"),
    t("out", "12 pass · 2 fail · 1 warn · 0 skip"),
    t("fail", "  FAIL high     Networks match the local policy"),
    t("muted", "       Unexpected networks: eip155:84532."),
    t("fail", "  FAIL high     Amounts stay within the approved ceiling"),
    t("muted", "       1 payment amount(s) exceed 5000."),
    t("warn", "  WARN medium   Payment requirements remain stable"),
    t("muted", "       Payment terms changed between identical unauthenticated requests."),
    t("out", ""),
    t("out", "Total: 12 pass · 2 fail · 1 warn · 0 skip"),
  ],
})}
<p>Two high-severity failures meet the default <code>--fail-on high</code> threshold, so the command exits 1, which is what fails a CI job. The warning reports that the price changed between two identical requests.</p>

<h2 id="active-probe">8. Optional: the authorized active probe</h2>
<p>The <code>/bypass</code> endpoint serves its content to anyone who sends a <code>PAYMENT-SIGNATURE</code> header, valid or not. The active probe sends one deliberately invalid signature to catch exactly this:</p>
${codeBlock({ lang: "shell", title: "Authorized active probe on the local demo", code: `settlens scan http://127.0.0.1:4402/bypass \\
  --active --authorized --authorization-ref DEMO-APPROVAL-002` })}
<p>It reports <code>FAIL critical Invalid payment authorization is denied</code> and exits 1. Against <code>/secure</code>, the same probe passes.</p>
${callout({ tone: "warning", title: "Only with written authorization", body: "Outside this local demo, run the active probe only on endpoints you own or are allowed in writing to test, and put the approval reference in --authorization-ref." })}

<h2 id="next-steps">Next steps</h2>
<ul>
  <li>List your own endpoints and policy in a <a href="/docs/configuration">configuration file</a> and run <a href="/docs/cli#check"><code>settlens check</code></a>.</li>
  <li>Fail pull requests on findings with the <a href="/docs/github-action">GitHub Action</a>.</li>
  <li>Watch production endpoints for changes with <a href="/docs/monitor">Monitor</a>.</li>
  <li>Let an AI agent check a payment request before paying with the <a href="/docs/mcp">MCP server</a>.</li>
  <li>Read what each mode sends, and what a passing report proves, in the <a href="/docs/methodology">methodology</a>.</li>
</ul>`;
}
