// GitHub Action reference. Inputs, outputs and pins are read from action.yml at build time.

import { actionBlock } from "../product/_stage-kit.js";
import { repoFile } from "./_shared.js";

export const meta = {
  path: "/docs/github-action",
  title: "GitHub Action: gate x402 endpoints in CI",
  label: "GitHub Action",
  heading: "GitHub Action",
  lede: "Run Settlens checks on every pull request or on a schedule, fail the job at your severity threshold and keep the reports as build artifacts.",
  description: "Use the Settlens composite GitHub Action: inputs and outputs, complete workflows, secrets and allowed hosts, SARIF, permissions and pinning advice.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 5,
  icon: "branch",
  summary: "The Settlens composite GitHub Action runs settlens check against a configuration file, fails the job when a failing check reaches the fail-on severity (default high) and leaves JSON, HTML and SARIF reports for later steps. It runs passive checks only, from a checkout of the private Settlens repository.",
  sources: [
    { title: "Creating a composite action", url: "https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action", publisher: "GitHub Docs" },
    { title: "Secure use reference (pin actions to a full-length commit SHA)", url: "https://docs.github.com/en/actions/reference/security/secure-use", publisher: "GitHub Docs" },
    { title: "SARIF support for code scanning", url: "https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support", publisher: "GitHub Docs" },
  ],
};

// How each input reaches the CLI (see the env block and run step of action.yml).
const MAPS_TO = {
  config: "--config",
  output: "--out",
  formats: "--format",
  "fail-on": "--fail-on",
  "allowed-hosts": "SETTLENS_ALLOWED_HOSTS",
};

const CHECKOUT = "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd";
const UPLOAD_ARTIFACT = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
const UPLOAD_SARIF = "github/codeql-action/upload-sarif@7188fc363630916deb702c7fdcf4e481b751f97a";

const OWN_REPO_WORKFLOW = `name: Settlens

on:
  pull_request:
  schedule:
    - cron: "17 6 * * 1-5" # weekdays, 06:17 UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  x402-assessment:
    runs-on: ubuntu-latest
    steps:
      - name: Check out this repository
        uses: ${CHECKOUT}

      - name: Check out Settlens
        uses: ${CHECKOUT}
        with:
          repository: OWNER/SETTLENS-REPOSITORY # the repository shared with your pilot
          ref: FULL-40-CHARACTER-COMMIT-SHA # a Settlens commit you reviewed
          path: .settlens
          token: \${{ secrets.SETTLENS_REPO_TOKEN }} # read-only access to that repository
          persist-credentials: false

      - name: Assess x402 endpoints
        uses: ./.settlens
        with:
          config: settlens.config.json
          output: reports
          fail-on: high
          allowed-hosts: staging.merchant.example
        env:
          ASSESSMENT_TOKEN: \${{ secrets.ASSESSMENT_TOKEN }} # read by \${ASSESSMENT_TOKEN} in the config

      - name: Upload evidence
        if: always()
        uses: ${UPLOAD_ARTIFACT}
        with:
          name: settlens-reports
          path: reports/
          if-no-files-found: error
          retention-days: 30`;

const SETTLENS_REPO_WORKFLOW = `name: Settlens

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  x402-assessment:
    runs-on: ubuntu-latest
    steps:
      - uses: ${CHECKOUT}

      - name: Assess x402 endpoints
        uses: ./
        with:
          config: settlens.config.json
          fail-on: high
          allowed-hosts: \${{ vars.SETTLENS_ALLOWED_HOSTS }}

      - name: Upload evidence
        if: always()
        uses: ${UPLOAD_ARTIFACT}
        with:
          name: settlens-reports
          path: reports/
          if-no-files-found: error
          retention-days: 30`;

const SARIF_STEP = `# Add to the job: permissions: { contents: read, security-events: write }
      - name: Upload SARIF
        if: >-
          always() &&
          hashFiles('reports/**/*.sarif') != '' &&
          (github.event_name != 'pull_request' ||
          github.event.pull_request.head.repo.full_name == github.repository)
        uses: ${UPLOAD_SARIF}
        with:
          sarif_file: reports`;

const PIPELINE_SVG = `<svg viewBox="0 0 720 220" width="720" height="220" xmlns="http://www.w3.org/2000/svg">
  <title>Settlens in a GitHub workflow</title>
  <desc>A pull request triggers checkout, then the Settlens Action runs settlens check; the job fails at the fail-on threshold, and the reports directory is uploaded as an artifact.</desc>
  <rect class="d-node" x="16" y="30" width="130" height="60" rx="10"/>
  <rect class="d-node" x="176" y="30" width="150" height="60" rx="10"/>
  <rect class="d-node d-node--accent" x="356" y="30" width="170" height="60" rx="10"/>
  <rect class="d-node" x="556" y="30" width="148" height="60" rx="10"/>
  <rect class="d-node" x="356" y="140" width="170" height="60" rx="10"/>
  <rect class="d-node" x="556" y="140" width="148" height="60" rx="10"/>
  <text class="d-title" x="81" y="56" text-anchor="middle">Pull request</text>
  <text class="d-label" x="81" y="77" text-anchor="middle">or schedule</text>
  <text class="d-title" x="251" y="56" text-anchor="middle">Checkout</text>
  <text class="d-label" x="251" y="77" text-anchor="middle">code + Settlens</text>
  <text class="d-title" x="441" y="56" text-anchor="middle">Settlens Action</text>
  <text class="d-label d-label--accent" x="441" y="77" text-anchor="middle">settlens check</text>
  <text class="d-title" x="630" y="56" text-anchor="middle">Job status</text>
  <text class="d-label" x="630" y="77" text-anchor="middle">fails at fail-on</text>
  <text class="d-title" x="441" y="166" text-anchor="middle">reports/</text>
  <text class="d-label" x="441" y="187" text-anchor="middle">JSON · HTML · SARIF</text>
  <text class="d-title" x="630" y="166" text-anchor="middle">upload-artifact</text>
  <text class="d-label" x="630" y="187" text-anchor="middle">evidence kept</text>
  <path class="d-msg" d="M146 60h28"/><path class="d-head" d="M168 54l8 6-8 6"/>
  <path class="d-msg" d="M326 60h28"/><path class="d-head" d="M348 54l8 6-8 6"/>
  <path class="d-msg d-msg--accent" d="M526 60h28"/><path class="d-head d-head--accent" d="M548 54l8 6-8 6"/>
  <path class="d-msg" d="M441 90v48"/><path class="d-head" d="M435 132l6 8 6-8"/>
  <path class="d-msg" d="M526 170h28"/><path class="d-head" d="M548 164l8 6-8 6"/>
  <text class="d-note" x="16" y="130">if: always()</text>
  <text class="d-note" x="16" y="150">keeps reports when the gate fails</text>
</svg>`;

export default function render(ctx) {
  const { html, codeBlock, table, callout, diagram } = ctx;
  const yaml = repoFile("action.yml");
  const inputs = actionBlock(yaml, "inputs");
  const outputs = actionBlock(yaml, "outputs");
  const setupNode = /uses: (actions\/setup-node@[0-9a-f]{40})/.exec(yaml)?.[1];
  const nodeVersion = /node-version: "?(\d+)"?/.exec(yaml)?.[1];
  const install = /run: (npm ci [^\n]+)/.exec(yaml)?.[1];
  if (!setupNode || !nodeVersion || !install) throw new Error("action.yml: setup-node pin, node-version or npm ci step not found.");

  return html`<p>The repository includes a composite GitHub Action (<code>action.yml</code> at its root). It installs Node.js ${nodeVersion}, installs Settlens' production dependencies from the lockfile, then runs <a href="/docs/cli#check"><code>settlens check</code></a> against your <a href="/docs/configuration">configuration file</a>. The job fails when a failing check reaches the <code>fail-on</code> severity, and the JSON, HTML and SARIF reports are left in the output directory for later steps.</p>
<p>The Action is not on the GitHub Marketplace: Settlens lives in a source repository that pilot participants receive, so workflows run the Action from a copy of that repository. It runs passive checks only; it has no input for the active probe.</p>
${diagram({ svg: PIPELINE_SVG, label: "A pull request or schedule triggers the workflow: checkout of your code and of Settlens, then the Settlens Action runs settlens check. The job status fails at the fail-on threshold, and the reports directory with JSON, HTML and SARIF files is uploaded with upload-artifact, even when the gate fails.", caption: "Where the Action sits in a workflow.", size: "wide" })}

<h2 id="inputs">Inputs</h2>
<p>Read from <code>action.yml</code>. Every input is optional.</p>
${table({
  caption: "Action inputs",
  head: ["Input", "Default", "Passed to the CLI as", "Description"],
  rows: inputs.map((input) => [input.name, input.default === "" ? "(empty)" : input.default ?? "", MAPS_TO[input.name] ?? "", input.description]),
  rowHeaders: true,
})}
<ul>
  <li><strong>fail-on</strong> takes <code>low</code>, <code>medium</code>, <code>high</code>, <code>critical</code> or <code>none</code>. Only failing checks count; warnings never fail the job.</li>
  <li><strong>allowed-hosts</strong> is the allowlist for custom headers in the config. It is deliberately separate from the config file: a pull request that edits the config cannot add a new destination for your secrets without also changing the workflow.</li>
  <li><strong>config</strong> and <strong>output</strong> are paths relative to the workspace root.</li>
</ul>

<h2 id="outputs">Outputs</h2>
${table({
  caption: "Action outputs",
  head: ["Output", "Description"],
  rows: outputs.map((output) => [output.name, output.description]),
  rowHeaders: true,
})}
<p><code>report-directory</code> is set on every run, including when the gate fails: the step records the exit status of <code>settlens check</code>, writes the output, then exits with that status. The workflows below pass the literal <code>output</code> path to their upload steps.</p>

<h2 id="workflow-your-repository">Workflow in your own repository</h2>
<p>Check out the Settlens repository next to your code, pinned to a commit you reviewed, and run the Action from that path. <code>SETTLENS_REPO_TOKEN</code> is a token with read access to the Settlens repository only, such as a fine-grained personal access token or a GitHub App token; the default <code>GITHUB_TOKEN</code> cannot read another source repository.</p>
${codeBlock({ lang: "yaml", title: ".github/workflows/settlens.yml", code: OWN_REPO_WORKFLOW })}
<p>The schedule turns the same job into a recurring check of production endpoints. To compare each run with the previous one and alert only on changes, use <a href="/docs/monitor">Monitor</a> instead.</p>

<h2 id="workflow-settlens-repository">Workflow in the Settlens repository</h2>
<p>When the workflow lives in the repository that contains Settlens at its root, the Action is simply <code>uses: ./</code>. This is the shape of the example shipped in the repository (<code>examples/github-workflow.yml</code>), where the allowlist comes from a repository variable:</p>
${codeBlock({ lang: "yaml", title: ".github/workflows/settlens.yml", code: SETTLENS_REPO_WORKFLOW })}

<h2 id="secrets">Secrets and custom headers</h2>
<p>When a target needs authentication, reference the secret from the config as <code>\${NAME}</code>, provide it to the step as an environment variable, and list the target's hostname in <code>allowed-hosts</code>. Settlens refuses to send any custom header to a host that is not on that list, and it never writes header values to reports. See <a href="/docs/configuration#headers">Headers and secrets</a>.</p>
<p>Workflows triggered by <code>pull_request</code> from a fork do not receive repository secrets, so targets that need them cannot be assessed on fork pull requests.</p>

<h2 id="sarif">SARIF and code scanning</h2>
<p>The SARIF file lists failing and warning checks, one rule per check id (format details in <a href="/docs/reports#sarif">Reports</a>).</p>
<p>Settlens findings concern a URL, not a line of code, but <a href="https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support">code scanning</a> only displays results that have a location. Each result is therefore anchored at line 1 of the file named by the <code>config</code> input, so the alerts appear on your configuration file, with the target URL in the message. Each target gets its own fingerprint, so the same check failing on two endpoints stays two alerts.</p>
${callout({ tone: "info", title: "Code scanning on private repositories", body: html`<p>On private repositories, code scanning requires GitHub Code Security; without it the upload fails. The findings are also in the job status, the console summary and the uploaded JSON and HTML reports.</p>` })}
<p>To upload the file, the job needs the <code>security-events: write</code> permission, and the condition below skips fork pull requests, whose token cannot write security events:</p>
${codeBlock({ lang: "yaml", title: "Optional SARIF upload step", code: SARIF_STEP })}

<h2 id="permissions">Permissions</h2>
<ul>
  <li><code>contents: read</code> is enough to run the Action and upload artifacts.</li>
  <li>Add <code>security-events: write</code> only to the job that uploads SARIF.</li>
  <li>The Action needs no wallet, no private key and no write access. Settlens itself contacts only the targets and facilitators in your config; installing its dependencies contacts the npm registry.</li>
</ul>

<h2 id="pinning">Pinning</h2>
<ul>
  <li>Pin the Settlens checkout to a full commit SHA (<code>ref:</code>), never a branch, so a change to the repository cannot change what runs in your CI without a review.</li>
  <li>Pin every third-party action to a full 40-character commit SHA. <code>action.yml</code> itself pins <code>${setupNode}</code> and Node.js ${nodeVersion}.</li>
  <li>Dependencies come from the lockfile with <code>${install}</code>: exact versions, no development dependencies and no install scripts.</li>
  <li>Keep <code>allowed-hosts</code> in the workflow or in a repository variable, never in the config file it protects.</li>
</ul>
<p>Next: tune the <a href="/docs/configuration">configuration</a>, look up findings in the <a href="/docs/checks">check catalog</a>, or <a href="/contact">request a pilot</a> to get access to the repository.</p>`;
}
