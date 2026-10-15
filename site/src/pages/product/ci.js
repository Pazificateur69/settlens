// /product/ci: the GitHub composite Action. Inputs, outputs, steps and the example workflow are
// read from action.yml and examples/github-workflow.yml at build time so the page cannot drift.

import { SEVERITY_RANK } from "../../../../src/constants.js";
import { actionBlock, catalogChecks, otherStages, repoFile, severityBadge, SOFTWARE } from "./_stage-kit.js";

const PATH = "/product/ci";
const DESCRIPTION =
  "Run Settlens in GitHub Actions: block merges on high-severity x402 findings and keep JSON, HTML and SARIF reports as build evidence for every run.";

export const meta = {
  path: PATH,
  title: "x402 CI gate: GitHub Action with SARIF",
  label: "CI gate",
  description: DESCRIPTION,
  section: "product",
  lastmod: "2026-10-13",
  order: 2,
  icon: "branch",
  summary:
    "The Settlens GitHub Action runs the passive x402 checks of your configuration in pull request workflows. It fails the job when a failing check reaches the fail-on severity, high by default, and writes JSON, HTML and SARIF reports that the example workflow uploads to code scanning.",
  sources: [
    { title: "Static Analysis Results Interchange Format (SARIF) Version 2.1.0", url: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html", publisher: "OASIS" },
    { title: "Uploading a SARIF file to GitHub", url: "https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file", publisher: "GitHub Docs" },
  ],
  jsonLd: SOFTWARE,
};

const FAILING_LINES = [
  { kind: "cmd", text: "settlens check --config settlens.config.json" },
  { kind: "out", text: "Settlens x402 assessment c7bbc707" },
  { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "paid-api  GET http://127.0.0.1:4402/secure" },
  { kind: "out", text: "26 pass · 1 fail · 0 warn · 0 skip" },
  { kind: "fail", text: "  FAIL high     Facilitator covers advertised payment requirements" },
  { kind: "muted", text: "       1 advertised payment choice(s) are absent from facilitator capabilities." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 26 pass · 1 fail · 0 warn · 0 skip" },
];

const HOSTS_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: '    --header "Authorization: Bearer test"' },
  { kind: "fail", text: "Settlens error: Custom headers require an explicit allowed host. Add --allow-host for: 127.0.0.1" },
  { kind: "cmd", text: "SETTLENS_ALLOWED_HOSTS=127.0.0.1 settlens scan http://127.0.0.1:4402/secure \\" },
  { kind: "cont", text: '    --header "Authorization: Bearer test" --no-write' },
  { kind: "muted", text: "…" },
  { kind: "pass", text: "Total: 13 pass · 0 fail · 0 warn · 0 skip" },
];

// Real SARIF from the demo /bypass route (settlens scan … --active --authorized --format sarif).
const SARIF_EXCERPT = `{
  "ruleId": "security.invalid_signature_fail_closed",
  "level": "error",
  "message": {
    "text": "The endpoint returned HTTP 200 after an invalid payment authorization. Target: GET http://127.0.0.1:4402/bypass"
  },
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": { "uri": "settlens.config.json", "uriBaseId": "%SRCROOT%" },
        "region": { "startLine": 1 }
      }
    }
  ],
  "partialFingerprints": { "primaryLocationLineHash": "aee170b410d68e01:1" },
  "properties": {
    "status": "fail",
    "severity": "critical",
    "target": "http://127.0.0.1:4402/bypass",
    "recommendation": "Block resource execution unless cryptographic verification and settlement succeed. Treat this as a potential payment bypass.",
    "reportId": "d2145529"
  }
}`;

const HEADERS_CONFIG = `{
  "version": 1,
  "failOn": "high",
  "targets": [
    {
      "name": "paid-api",
      "url": "https://merchant.example/api/data",
      "headers": { "Authorization": "Bearer \${ASSESSMENT_TOKEN}" },
      "expected": { "networks": ["eip155:8453"], "maxAmount": "10000" }
    }
  ]
}`;

const FAIL_ON = [
  ["critical", "A check fails with critical severity."],
  ["high", "A check fails with high or critical severity. The default."],
  ["medium", "A check fails with medium severity or above."],
  ["low", "A check fails with low severity or above."],
  ["none", "Never. Reports are still written."],
];

export default function render(ctx) {
  const { html } = ctx;
  const actionYml = repoFile("action.yml");
  const workflow = repoFile("examples/github-workflow.yml");
  const inputs = actionBlock(actionYml, "inputs");
  const outputs = actionBlock(actionYml, "outputs");
  const nodeVersion = /node-version:\s*"?(\d+)"?/.exec(actionYml)?.[1];
  const setupNode = /uses: actions\/setup-node@([0-9a-f]{40})/.exec(actionYml)?.[1];
  const stepNames = [...actionYml.matchAll(/^ {4}- name: (.+)$/gm)].map((match) => match[1]);
  if (!nodeVersion || !setupNode || stepNames.length !== 3 || !actionYml.includes(" check \\")) {
    throw new Error("action.yml changed shape: update the steps described on /product/ci.");
  }
  if (!workflow.includes("upload-sarif") || !workflow.includes("upload-artifact")) {
    throw new Error("examples/github-workflow.yml no longer uploads SARIF and evidence: update /product/ci.");
  }

  // The Action runs `settlens check`: passive, offline and facilitator checks, never the active probe.
  const gateChecks = catalogChecks((check) => check.mode !== "active", "the checks the Action can run");
  const blocking = (level) => gateChecks.filter((check) => SEVERITY_RANK[check.severity] >= SEVERITY_RANK[level]).length;

  return html`${ctx.hero({
    title: "Block merges that break x402 payments",
    lede: "The Settlens GitHub Action runs the passive Settlens checks on every pull request. It fails the job when a finding reaches your severity threshold and writes JSON, HTML and SARIF reports as evidence.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "GitHub Action docs", href: "/docs/github-action" },
    ],
    note: "Real output against the demo target, with a policy and a facilitator configured. The facilitator does not support the advertised network, so the job fails with exit code 1.",
    aside: ctx.terminal({ title: "settlens check (what the Action runs)", lines: FAILING_LINES }),
  })}
${ctx.section({
  id: "what-it-does",
  title: "What the Action does",
  body: ctx.featureGrid([
    { icon: "search", title: "The same checks as Assess", body: "It runs settlens check on your configuration: the 402 handshake, schema, binding, drift, your policy and, when configured, facilitator coverage.", href: "/product/assess", linkLabel: "What Assess checks" },
    { icon: "alert", title: "A severity threshold", body: "fail-on decides which failures block the job. The default, high, blocks on high and critical findings." },
    { icon: "file", title: "SARIF, JSON and HTML", body: "One run writes all three formats to the output directory, with a SHA-256 integrity digest in the JSON report." },
    { icon: "lock", title: "Secrets go only to approved hosts", body: "Custom headers are only sent to hosts listed in allowed-hosts, an input kept outside the configuration file." },
    { icon: "layers", title: "Pinned and minimal", body: html`Node.js ${nodeVersion} through a commit-pinned setup action, then a locked production install with install scripts disabled.` },
    { icon: "shield", title: "Passive only", body: "The Action never sends a payment signature. The authorized active probe is a manual, approved step." },
  ]),
})}
${ctx.section({
  id: "how-it-works",
  title: "How it works",
  tone: "raised",
  lede: "The composite Action has three steps, read here from action.yml.",
  body: ctx.steps([
    { title: stepNames[0], body: html`<p><code>actions/setup-node</code> pinned to commit <code>${setupNode.slice(0, 12)}</code>, Node.js ${nodeVersion}, with the package-manager cache disabled.</p>` },
    { title: stepNames[1], body: html`<p><code>npm ci --omit=dev --ignore-scripts</code> installs exactly the locked runtime dependencies and runs no install scripts.</p>` },
    { title: stepNames[2], body: html`<p>Runs <code>settlens check --config … --out … --format … --fail-on …</code> with your inputs, exports <code>allowed-hosts</code> as <code>SETTLENS_ALLOWED_HOSTS</code>, and returns the CLI exit code as the step result. The <code>report-directory</code> output is set on every run, passing or failing.</p>` },
  ]),
})}
${ctx.section({
  id: "inputs",
  title: "Inputs and outputs",
  body: html`${ctx.table({
    caption: "Inputs (from action.yml)",
    head: ["Input", "Default", "Description"],
    rows: inputs.map((input) => [html`<code>${input.name}</code>`, input.default ? html`<code>${input.default}</code>` : "(empty)", input.description]),
    rowHeaders: true,
  })}
${ctx.table({
  caption: "Outputs (from action.yml)",
  head: ["Output", "Description"],
  rows: outputs.map((output) => [html`<code>${output.name}</code>`, output.description]),
  rowHeaders: true,
})}`,
})}
${ctx.section({
  id: "workflow",
  title: "Example workflow",
  tone: "raised",
  lede: "This is the workflow shipped in examples/github-workflow.yml, shown unchanged.",
  body: ctx.split({
    main: ctx.codeBlock({ lang: "yaml", title: ".github/workflows/settlens.yml", code: workflow }),
    aside: ctx.prose(html`<h3>What to notice</h3>
<ul>
<li><strong>Permissions.</strong> <code>contents: read</code> to check out, <code>security-events: write</code> to upload SARIF. Nothing else.</li>
<li><strong>Pinned actions.</strong> Third-party actions are referenced by commit SHA, not by a movable tag.</li>
<li><strong><code>uses: ./</code></strong> runs the composite Action from the Settlens checkout itself.</li>
<li><strong>SARIF upload</strong> runs even when the gate fails, but is skipped for pull requests from forks, which cannot write security events. See <a href="#sarif">SARIF and code scanning</a>.</li>
<li><strong>Evidence</strong> (JSON, HTML and SARIF) is uploaded as an artifact on every run and kept for 30 days; the step fails if no report was written.</li>
<li><strong><code>allowed-hosts</code></strong> comes from a repository variable, so a pull request that edits the configuration cannot add a host.</li>
</ul>`),
  }),
})}
${ctx.section({
  id: "fail-on",
  title: "Choose the threshold",
  lede: "Only failing checks count. Warnings, such as drift between requests or a plain-HTTP remote endpoint, are reported in every format but never fail the job. Today every medium- and low-severity check the Action runs reports a warning, not a failure, so fail-on: low or fail-on: medium blocks exactly the same findings as fail-on: high.",
  body: ctx.split({
    main: ctx.table({
      caption: "fail-on values",
      head: ["fail-on", "The job fails when", "Checks at or above this severity"],
      rows: FAIL_ON.map(([level, meaning]) => [
        html`<code>${level}</code>`,
        level !== "none" && blocking(level) === 0 ? `${meaning} No check the Action runs is critical by default: critical findings come from the authorized active probe.` : meaning,
        level === "none" ? "0" : String(blocking(level)),
      ]),
      rowHeaders: true,
      numeric: [2],
    }),
    aside: ctx.table({
      caption: "Exit codes",
      head: ["Code", "Meaning"],
      rows: [
        ["0", "No failing check at or above the threshold."],
        ["1", "At least one failing check at or above the threshold."],
        ["2", "CLI or configuration error, for example an unknown fail-on value or a custom header without an allowed host."],
      ],
      rowHeaders: true,
    }),
  }),
})}
${ctx.section({
  id: "sarif",
  title: "SARIF output",
  tone: "raised",
  lede: "Each failing or warning check becomes one SARIF result whose rule id is the Settlens check id. Passing and skipped checks are left out.",
  body: ctx.split({
    main: html`${ctx.table({
      caption: "How results map to SARIF",
      head: ["Settlens result", "SARIF level", "security-severity"],
      rows: [
        ["fail, critical", html`<code>error</code>`, "9.5"],
        ["fail, high", html`<code>error</code>`, "8.0"],
        ["fail, medium", html`<code>warning</code>`, "5.0"],
        ["fail, low", html`<code>warning</code>`, "2.0"],
        ["warn, any severity", html`<code>warning</code>`, "From the severity, as above"],
      ],
      rowHeaders: true,
    })}
${ctx.prose(html`<p>Every rule carries the tags <code>security</code>, <code>x402</code> and <code>agentic-payments</code>, and the run records the JSON report's integrity digest so a SARIF result can be traced back to the exact <a href="/product/evidence">evidence</a>.</p>`)}
${ctx.prose(html`<p>The results describe HTTP endpoints, not source lines, so each one is anchored at line 1 of the configuration file that declared the target, the <code>config</code> input of the Action. Code scanning shows Settlens findings as alerts on that file, with the endpoint in the message, and each target keeps its own fingerprint.</p>`)}
${ctx.callout({ tone: "info", title: "Code scanning on private repositories", body: html`<p>On private repositories, code scanning requires GitHub Code Security; without it the upload step fails. GitHub's documented upload workflow also grants <code>actions: read</code> there, which the example above leaves out. The gate decision comes from the Settlens step's exit code, not from the upload, so add <code>continue-on-error: true</code> to the upload step if it should never fail the job on its own.</p>` })}`,
    aside: ctx.codeBlock({ lang: "json", title: "One SARIF result (demo bypass)", code: SARIF_EXCERPT }),
  }),
})}
${ctx.section({
  id: "secrets",
  title: "Authenticated endpoints without leaking secrets",
  lede: "Configuration values can reference environment variables. Any target with custom headers must have its host allowlisted separately, so an edited configuration cannot forward a CI secret to a new host.",
  body: ctx.split({
    main: html`${ctx.codeBlock({ lang: "json", title: "settlens.config.json", code: HEADERS_CONFIG })}
${ctx.codeBlock({ lang: "yaml", title: "Workflow step", code: `- name: Assess x402 endpoints
  uses: ./
  env:
    ASSESSMENT_TOKEN: \${{ secrets.ASSESSMENT_TOKEN }}
  with:
    config: settlens.config.json
    allowed-hosts: merchant.example` })}`,
    aside: html`${ctx.terminal({ title: "The allowlist is enforced before any request", lines: HOSTS_LINES, replay: false })}
${ctx.prose(html`<ul>
<li><code>\${ASSESSMENT_TOKEN}</code> is expanded at run time; a missing variable stops the run.</li>
<li>Reports keep request header <em>names</em> only, never values.</li>
<li>A <code>PAYMENT-SIGNATURE</code> header in the configuration is refused outright.</li>
<li>Outside the Action, set <code>SETTLENS_ALLOWED_HOSTS</code> to a comma-separated list of exact hostnames, as above.</li>
</ul>`)}`,
  }),
})}
${ctx.section({
  id: "container",
  title: "Outside GitHub: the container",
  body: ctx.split({
    main: ctx.prose(html`<p>The same CLI ships as a container image for other CI systems and isolated hosts. The base image is pinned by digest, dependencies are installed from the lockfile with install scripts disabled, npm is removed from the runtime image and the process runs as the unprivileged <code>node</code> user. The working directory is <code>/workspace</code>.</p>
<p>Mount the configuration read-only and a reports directory writable by UID 1000. The container exits with the same codes as the CLI, so any CI system can gate on it.</p>`),
    aside: ctx.codeBlock({ lang: "shell", title: "Build and run", code: `docker build -t settlens:local .
docker run --rm settlens:local --version
docker run --rm \\
  -v "$PWD/config:/workspace/config:ro" \\
  -v "$PWD/evidence:/workspace/reports" \\
  settlens:local check --config config/settlens.config.json` }),
  }),
})}
${ctx.section({
  id: "checks",
  title: "Checks the gate can run",
  tone: "raised",
  lede: html`Rendered from the check catalog. Facilitator checks run only for targets with a <code>facilitator</code>; policy checks only when their field is set. See the <a href="/docs/checks">check reference</a> for fixes.`,
  body: ctx.table({
    caption: `${gateChecks.length} checks the Action can report`,
    head: ["Check", "Default severity", "Blocks at fail-on high"],
    rows: gateChecks.map((check) => [html`<code>${check.id}</code><br>${check.title}`, severityBadge(ctx, check.severity), SEVERITY_RANK[check.severity] >= SEVERITY_RANK.high ? "Yes, when it fails" : "No"]),
    rowHeaders: true,
  }),
})}
${ctx.section({
  id: "limitations",
  title: "What the CI gate does not do",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>No active probe.</strong> The Action runs passive checks only. Prove fail-closed behavior with an <a href="/product/assess#active-probe">authorized probe</a>, run deliberately.</li>
<li><strong>Not on the Marketplace.</strong> The Action ships in the private Settlens repository given to pilot participants and runs from that checkout.</li>
<li><strong>Network access required.</strong> The runner must reach your endpoints. Staging behind a VPN needs a runner inside it.</li>
<li><strong>Warnings never block.</strong> Drift, redirects, plain HTTP and other warnings appear in the reports but do not fail the job.</li>
<li><strong>Not signed automatically.</strong> Reports carry an integrity digest; sign them with <a href="/product/evidence">evidence attestations</a> when they leave your team.</li>
<li><strong>A green build is a sample.</strong> It shows the endpoint passed at build time. Use <a href="/product/monitor">Monitor</a> to keep watching it in production.</li>
</ul>`),
})}
${ctx.section({
  id: "faq",
  title: "Questions about the CI gate",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Which findings fail the job by default?", a: "Failing checks with high or critical severity. Set fail-on to critical, medium, low or none to change that. Warnings never fail the job." },
    { q: "Does the Action send payments or need a wallet?", a: "No. It runs passive checks with ordinary unauthenticated requests. It never sends a payment signature, never calls /settle and needs no key." },
    { q: "Can I use it in GitLab CI, Jenkins or another system?", a: "Yes, through the CLI or the container image: run settlens check and gate on the exit code (0 pass, 1 findings at the threshold, 2 error)." },
    { q: "Where do the reports go?", a: "To the output directory (reports by default), which every run, passing or failing, also exposes as the report-directory output. The example workflow uploads them as a build artifact kept for 30 days." },
    { q: "Why is allowed-hosts separate from the configuration?", a: "So that a pull request that changes the configuration cannot redirect a CI secret to a host you did not approve. The allowlist lives in a repository variable instead." },
  ]),
})}
${ctx.section({
  id: "related",
  title: "Related",
  body: html`${ctx.cards(otherStages(PATH), { columns: 4 })}
${ctx.prose(html`<p>Reference: <a href="/docs/github-action">GitHub Action guide</a> · <a href="/docs/configuration">configuration file</a> · <a href="/docs/reports">report formats</a> · <a href="/docs/cli">CLI exit codes</a> · <a href="/use-cases/api-sellers">Settlens for API sellers</a> · <a href="/learn/x402-security-checklist">the x402 security checklist</a> · <a href="/learn/x402-v1-to-v2-migration">gate an x402 V1 to V2 migration</a>.</p>`)}`,
})}
${ctx.cta({
  title: "Put one endpoint behind the gate",
  body: "Pilot participants get the repository, the Action and help writing the first policy for their endpoint.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See how Assess works", href: "/product/assess" },
  ],
})}`;
}
