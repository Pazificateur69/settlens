// /product/monitor: scheduled passive scans compared with a stored baseline.
// Transcripts and the webhook body are real: three monitor runs against the demo /drift route,
// whose price alternates between 10000 and 25000 on each request, with a local webhook receiver.

import { CHECK_CATEGORIES } from "../../../../src/catalog.js";
import { catalogChecks, otherStages, repoFile, SOFTWARE } from "./_stage-kit.js";

const PATH = "/product/monitor";
const DESCRIPTION =
  "Schedule passive x402 scans, compare each run with a stored baseline and get a webhook alert when a check regresses, such as a price above your ceiling.";

export const meta = {
  path: PATH,
  title: "x402 endpoint monitoring and drift alerts",
  label: "Monitor",
  description: DESCRIPTION,
  section: "product",
  lastmod: "2026-10-13",
  order: 4,
  icon: "activity",
  summary:
    "Settlens Monitor reruns the passive x402 scan on your schedule and compares every check with a stored baseline per method and URL. Regressions, new failing or warning checks and removed checks become alerts; blocking alerts exit non-zero and can POST a JSON webhook. It never sends a payment.",
  jsonLd: SOFTWARE,
};

const CONFIG = `{
  "version": 1,
  "failOn": "high",
  "targets": [
    {
      "name": "priced-api",
      "url": "http://127.0.0.1:4402/drift",
      "repeat": 1,
      "expected": {
        "networks": ["eip155:84532"],
        "payTo": ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"],
        "maxAmount": "10000"
      }
    }
  ]
}`;

const COMMAND = [
  { kind: "cmd", text: "settlens monitor --config settlens.config.json \\" },
  { kind: "cont", text: "    --state settlens.state.json --webhook http://127.0.0.1:4517/settlens" },
];

const RUN_1 = [
  ...COMMAND,
  { kind: "out", text: "" },
  { kind: "out", text: "priced-api (GET http://127.0.0.1:4402/drift)" },
  { kind: "muted", text: "  baseline recorded (first run)" },
  { kind: "out", text: "" },
  { kind: "out", text: "0 blocking alert(s) at or above high." },
];

const RUN_2 = [
  ...COMMAND,
  { kind: "out", text: "" },
  { kind: "out", text: "priced-api (GET http://127.0.0.1:4402/drift)" },
  { kind: "fail", text: "  ALERT [high] policy.maximum_amount: pass -> fail — Amounts stay within the approved ceiling" },
  { kind: "out", text: "" },
  { kind: "fail", text: "1 blocking alert(s) at or above high." },
];

const RUN_3 = [
  ...COMMAND,
  { kind: "out", text: "" },
  { kind: "out", text: "priced-api (GET http://127.0.0.1:4402/drift)" },
  { kind: "muted", text: "  no regressions" },
  { kind: "pass", text: "  resolved policy.maximum_amount: fail -> pass" },
  { kind: "out", text: "" },
  { kind: "out", text: "0 blocking alert(s) at or above high." },
];

const WEBHOOK_BODY = JSON.stringify(
  {
    product: "Settlens Monitor",
    alerting: 1,
    failOn: "high",
    runs: [
      {
        method: "GET",
        url: "http://127.0.0.1:4402/drift",
        alerts: [{ kind: "regression", id: "policy.maximum_amount", from: "pass", to: "fail", severity: "high", title: "Amounts stay within the approved ceiling" }],
      },
    ],
  },
  null,
  2,
);

const STATE_EXCERPT = `{
  "GET http://127.0.0.1:4402/drift": {
    "checks": [
      {
        "id": "transport.reachable",
        "status": "pass",
        "severity": "high",
        "title": "Endpoint is reachable"
      },
      …
      {
        "id": "policy.maximum_amount",
        "status": "pass",
        "severity": "high",
        "title": "Amounts stay within the approved ceiling"
      }
    ],
    "summary": { "pass": 15, "fail": 0, "warn": 0, "skip": 1 },
    "observedAt": "2026-10-13T11:16:44.404Z"
  }
}`;

const CRON = `# crontab: every 15 minutes, Monday to Friday
SETTLENS_WEBHOOK_URL=https://hooks.example.com/settlens
*/15 * * * 1-5 cd /opt/settlens && node src/cli.js monitor --config /etc/settlens/settlens.config.json --state /var/lib/settlens/settlens.state.json --webhook "$SETTLENS_WEBHOOK_URL" >> /var/log/settlens-monitor.log 2>&1`;

const TIMELINE_SVG = `<svg viewBox="0 0 720 300" width="720" height="300" xmlns="http://www.w3.org/2000/svg">
  <text class="d-text" x="24" y="24">Watched check: policy.maximum_amount (advertised price at most 10000)</text>
  <rect class="d-node" x="24" y="44" width="192" height="104" rx="10"/>
  <rect class="d-node d-node--accent" x="264" y="44" width="192" height="104" rx="10"/>
  <rect class="d-node" x="504" y="44" width="192" height="104" rx="10"/>
  <text class="d-title" x="120" y="72" text-anchor="middle">Run 1 · baseline</text>
  <text class="d-label" x="120" y="100" text-anchor="middle">price 10000: pass</text>
  <text class="d-text" x="120" y="128" text-anchor="middle">exit 0</text>
  <text class="d-title" x="360" y="72" text-anchor="middle">Run 2 · regression</text>
  <text class="d-label d-label--accent" x="360" y="100" text-anchor="middle">25000: pass → fail</text>
  <text class="d-text" x="360" y="128" text-anchor="middle">exit 1 · webhook POST</text>
  <text class="d-title" x="600" y="72" text-anchor="middle">Run 3 · recovery</text>
  <text class="d-label" x="600" y="100" text-anchor="middle">10000: fail → pass</text>
  <text class="d-text" x="600" y="128" text-anchor="middle">exit 0 · resolved</text>
  <path class="d-line" d="M216 96h40"/><path class="d-head" d="M250 90l8 6-8 6"/>
  <path class="d-line" d="M456 96h40"/><path class="d-head" d="M490 90l8 6-8 6"/>
  <rect class="d-zone d-zone--blue" x="24" y="216" width="672" height="60" rx="10"/>
  <text class="d-title" x="360" y="242" text-anchor="middle">settlens.state.json</text>
  <text class="d-text" x="360" y="264" text-anchor="middle">last observed status of every check, per method and URL, overwritten by each run</text>
  <path class="d-msg d-msg--blue" d="M100 212v-60M140 152v60M340 212v-60M380 152v60M580 212v-60M620 152v60"/>
  <path class="d-head d-head--blue" d="M94 160l6-8 6 8M134 204l6 8 6-8M334 160l6-8 6 8M374 204l6 8 6-8M574 160l6-8 6 8M614 204l6 8 6-8"/>
  <text class="d-note d-note--blue" x="148" y="186">read, write</text>
  <text class="d-note d-note--blue" x="388" y="186">read, write</text>
  <text class="d-note d-note--blue" x="628" y="186">read, write</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  const actionYml = repoFile("action.yml");
  const exampleWorkflow = repoFile("examples/github-workflow.yml");
  const setupNode = /uses: (actions\/setup-node@[0-9a-f]{40})/.exec(actionYml)?.[1];
  const checkout = /uses: (actions\/checkout@[0-9a-f]{40})/.exec(exampleWorkflow)?.[1];
  if (!setupNode || !checkout) throw new Error("Pinned checkout/setup-node references not found for the /product/monitor workflow example.");

  const scheduled = `name: Settlens monitor

on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: ${checkout}
      - uses: ${setupNode}
        with:
          node-version: "24"
          package-manager-cache: false
      - run: npm ci --omit=dev --ignore-scripts

      - name: Restore the previous baseline
        uses: actions/cache/restore@v4 # pin to a reviewed commit SHA
        with:
          path: settlens.state.json
          key: settlens-state-\${{ github.run_id }}
          restore-keys: settlens-state-

      - name: Compare with the baseline
        env:
          SETTLENS_WEBHOOK_URL: \${{ secrets.SETTLENS_WEBHOOK_URL }}
        run: >-
          node src/cli.js monitor
          --config settlens.config.json
          --state settlens.state.json
          --webhook "$SETTLENS_WEBHOOK_URL"

      - name: Save the new baseline
        if: always()
        uses: actions/cache/save@v4 # pin to a reviewed commit SHA
        with:
          path: settlens.state.json
          key: settlens-state-\${{ github.run_id }}`;

  // Monitor runs scanTarget passively: never the active probe.
  const monitored = catalogChecks((check) => check.mode !== "active", "the checks a monitor run can report");
  const byCategory = CHECK_CATEGORIES.map((category) => ({ category, checks: monitored.filter((check) => check.category === category) })).filter(
    (group) => group.checks.length,
  );

  return html`${ctx.hero({
    title: "Know when an x402 endpoint changes its terms",
    lede: "Settlens Monitor reruns the passive scan on your schedule and compares it with the last run. When a check that passed starts failing, such as a price above your ceiling or a recipient outside your allowlist, it exits non-zero and can post an alert to your webhook.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Monitor docs", href: "/docs/monitor" },
    ],
    note: "Real output: the demo /drift route alternates its price between requests.",
    aside: ctx.terminal({ title: "settlens monitor (second run)", lines: RUN_2 }),
  })}
${ctx.section({
  id: "what-it-does",
  title: "What Monitor does",
  body: ctx.featureGrid([
    { icon: "search", title: "A passive scan every run", body: "Each run requests your endpoints exactly like Assess in passive mode. It never sends a payment signature, even if the active flags are given." },
    { icon: "file", title: "A baseline per endpoint", body: "The state file stores the last observed status of every check, keyed by method and URL. The first run records it and alerts on nothing." },
    { icon: "alert", title: "Regressions, not noise", body: "A check that gets worse, a new check that fails or warns, or a check that disappears (lost coverage) is an alert. A check that stays failing is not repeated on every run." },
    { icon: "activity", title: "Your severity threshold", body: "Alerts at or above fail-on (high by default) are blocking: they set exit code 1 and trigger the webhook. Lower ones are printed as notes." },
    { icon: "mail", title: "A webhook alert", body: "With --webhook, a blocking alert sends one JSON POST with the threshold and every run's method, URL and alerts, which a relay such as n8n or an internal service can forward to chat or incident tools." },
    { icon: "clock", title: "Bring your scheduler", body: "Monitor is one command that exits. Cron, a systemd timer or a scheduled GitHub workflow decides how often it runs." },
  ]),
})}
${ctx.section({
  id: "how-it-works",
  title: "How a run works",
  tone: "raised",
  body: html`${ctx.steps([
    { title: "Load the configuration and the baseline", body: html`<p>Targets and policy come from the same configuration file as <code>settlens check</code>. The baseline comes from <code>--state</code>; a missing file means a first run; unreadable or corrupt files fail closed. Without <code>--state</code>, every run is a first run and nothing is compared.</p>` },
    { title: "Scan every target passively", body: "Handshake, schema, binding, drift and policy checks run for each URL, plus facilitator checks for targets that name a facilitator." },
    { title: "Compare with the baseline", body: "Each check is compared by id with its previous status. Regressions, new failures and removed checks become alerts; improvements are listed as resolved." },
    { title: "Save, report, alert", body: html`<p>The new results replace the baseline in the state file. If any alert reaches the threshold, the webhook is called and the command exits with <code>1</code>.</p>` },
  ])}
${ctx.diagram({
  svg: TIMELINE_SVG,
  size: "wide",
  label: "Timeline of three monitor runs watching policy.maximum_amount. Run 1 sees a price of 10000, records the baseline and exits 0. Run 2 sees 25000, reports pass to fail, exits 1 and posts the webhook. Run 3 sees 10000 again, reports the check as resolved and exits 0. Every run reads the state file, then overwrites it with its own results.",
  caption: "Each run compares with the state the previous run left behind, then overwrites it.",
})}`,
})}
${ctx.section({
  id: "rules",
  title: "What counts as a regression",
  body: ctx.split({
    main: ctx.table({
      caption: "Status changes between the baseline and the current run",
      head: ["Baseline", "Current", "Reported as"],
      rows: [
        ["pass or skip", "warn or fail", "Alert: regression"],
        ["warn", "fail", "Alert: regression"],
        ["(not present)", "warn or fail", "Alert: new check"],
        ["fail or warn", "a better status", "Resolved"],
        ["any", "the same status", "Nothing"],
        ["present", "(not present)", "Alert: removed (coverage lost)"],
        ["(no baseline)", "any", "Baseline recorded"],
      ],
    }),
    aside: ctx.prose(html`<p>An alert is <strong>blocking</strong> when the check's severity is at or above <code>--fail-on</code>, or <code>failOn</code> in the configuration. Blocking alerts print as <code>ALERT</code>, count toward the exit code and trigger the webhook. The others print as <code>note</code>.</p>
<p>A skip ranks like a pass, so a check moving between pass and skip, for example drift with a single sample, never raises an alert. A removed check keeps the severity it had in the baseline, so removing a high-severity check, such as the price ceiling, blocks at the default threshold.</p>`),
  }),
})}
${ctx.section({
  id: "example",
  title: "Example: a price that changes between runs",
  tone: "raised",
  lede: html`The demo <code>/drift</code> route alternates its price between 10000 and 25000 atomic units on each request. With <code>repeat</code> set to 1, each run sees one price, so the change shows up between runs.`,
  body: html`${ctx.split({
    main: ctx.codeBlock({ lang: "json", title: "settlens.config.json", code: CONFIG }),
    aside: html`${ctx.terminal({ title: "Run 1: baseline", lines: RUN_1, replay: false })}
${ctx.terminal({ title: "Run 3: back to the approved price", lines: RUN_3, replay: false })}`,
  })}
${ctx.split({
  main: ctx.prose(html`<h3>The webhook body</h3>
<p>Run 2 had one blocking alert, so Settlens sent this JSON as a <code>POST</code> with <code>content-type: application/json</code> to the local test receiver. The request times out after 5 seconds and refuses redirects. A webhook failure is printed on stderr and does not change the exit code.</p>`),
  aside: ctx.codeBlock({ lang: "json", title: "POST body (run 2)", code: WEBHOOK_BODY }),
})}`,
})}
${ctx.section({
  id: "schedule",
  title: "Schedule it",
  lede: "Run Monitor wherever your endpoints are reachable from. Keep the state file somewhere that survives between runs.",
  body: html`${ctx.codeBlock({ lang: "shell", title: "cron on a host with a Settlens checkout", code: CRON })}
${ctx.split({
  main: ctx.codeBlock({ lang: "yaml", title: ".github/workflows/settlens-monitor.yml", code: scheduled }),
  aside: ctx.prose(html`<h3>On GitHub Actions</h3>
<p>This workflow runs in the Settlens repository, like the <a href="/product/ci">CI gate</a>. The checkout and setup-node pins are the ones the repository already uses.</p>
<ul>
<li>The baseline lives in the Actions cache: each run restores the most recent <code>settlens-state-</code> entry and saves a new one, even when the comparison fails.</li>
<li>The webhook URL is a secret passed through an environment variable, not interpolated into the command.</li>
<li>GitHub runs schedules in UTC and can delay them under load; use a host scheduler when timing matters.</li>
<li>Pin <code>actions/cache</code> to a commit SHA you have reviewed before using this in production.</li>
</ul>`),
})}`,
})}
${ctx.section({
  id: "state",
  title: "The state file",
  tone: "raised",
  body: ctx.split({
    main: ctx.prose(html`<p>The state file is plain JSON keyed by each target's method and URL, such as <code>GET https://api.example.com/paid</code>. For each target it keeps the id, status, severity and title of every check, the summary counts and the time of the run. It holds no header values, response bodies or keys.</p>
<p>The private workspace supports explicitly approved references, bounded price ranges, persistent incidents, acknowledgement, comments, daily reminders and durable notification delivery. Endpoint name and policy editing retains history. Solana profile checks remain offline and cannot establish settlement.</p><p>Because the key is the method and URL, changing an endpoint URL starts a new baseline; renaming it retains its method/URL identity, while a GET and a POST target on one URL keep separate ones. State files from Settlens 0.4.0, keyed by URL only, are migrated on the next run. Deleting the file resets every baseline; the next run records fresh ones without alerting.</p>
<p>Monitor prints its comparison but does not write report files. For a report you can archive or sign, run <code>settlens check</code> with the same configuration and attest it as <a href="/product/evidence">evidence</a>.</p>`),
    aside: ctx.codeBlock({ lang: "json", title: "settlens.state.json after run 1 (excerpt)", code: STATE_EXCERPT }),
  }),
})}
${ctx.section({
  id: "checks",
  title: "What each run re-checks",
  lede: html`Every passive, content and facilitator check from the catalog. Policy checks run when their field is set, facilitator checks when the target names a facilitator. Details in the <a href="/docs/checks">check reference</a>.`,
  body: ctx.table({
    caption: `${monitored.length} checks by category`,
    head: ["Category", "Checks"],
    rows: byCategory.map((group) => [group.category, html`${group.checks.map((check, index) => html`${index ? ", " : ""}<code>${check.id}</code>`)}`]),
    rowHeaders: true,
  }),
})}
${ctx.section({
  id: "limitations",
  title: "What Monitor does not do",
  tone: "raised",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>Legacy state mode alerts on changes.</strong> The baseline moves forward on every run, so a check that keeps failing alerts once, on the run where it changed. Journal mode retains active incidents and gates persistent findings; <a href="/product/ci">settlens check</a> also provides an absolute pass or fail.</li>
<li><strong>No active probe.</strong> Monitor is passive only. The fail-closed probe stays a deliberate, authorized step.</li>
<li><strong>No scheduler and no history.</strong> It runs once and keeps only the latest state. Retention and dashboards are up to the system that runs it.</li>
<li><strong>A simple webhook.</strong> One attempt, a 5-second timeout, no retries and no signature or authentication header. Point it at an endpoint that can accept unauthenticated JSON, such as an internal relay.</li>
<li><strong>Not uptime monitoring.</strong> Reachability is one check among many, sampled when the run happens.</li>
<li><strong>Repeat comes from the configuration.</strong> The number of samples per run is set by <code>repeat</code> in the configuration file (two by default).</li>
</ul>`),
})}
${ctx.section({
  id: "faq",
  title: "Questions about monitoring",
  width: "narrow",
  body: ctx.faq([
    { q: "Does Monitor ever send a payment?", a: "No. Every run is a passive scan with ordinary unauthenticated requests. It never sends a payment signature and never calls /settle." },
    { q: "How often should it run?", a: "As often as a change would matter to you and your endpoints can tolerate: every 15 or 30 minutes is common. Each run makes a few requests per target (two by default, plus one per facilitator)." },
    { q: "Why did a failing check stop alerting?", a: "Monitor alerts when a status changes. After the run that reported it, the failure is part of the new baseline. Use settlens check in CI for an absolute gate." },
    { q: "What does the first run do?", a: "It records the baseline for each target and exits 0, whatever it finds. Read its output or run settlens check first if you want to start from a known-good state." },
    { q: "What happens if I remove a check from the configuration?", a: "The next run reports each check that disappeared as an alert of kind removed, printed as coverage lost, with the severity it had before. That is deliberate: deleting a price ceiling or a recipient allowlist should not go unnoticed. The run after that uses the new configuration as its baseline." },
    { q: "Can I monitor a facilitator?", a: "Yes, through a target that names a facilitator: each run also reads its GET /supported and compares those checks with the baseline." },
  ]),
})}
${ctx.section({
  id: "related",
  title: "Related",
  tone: "raised",
  body: html`${ctx.cards(otherStages(PATH), { columns: 4 })}
${ctx.prose(html`<p>Reference: <a href="/docs/monitor">Monitor guide</a> · <a href="/docs/configuration">configuration file</a> · <a href="/blog/detecting-x402-payment-drift">detecting x402 payment drift</a> · <a href="/learn/x402-security-checklist">the x402 security checklist</a> · <a href="/use-cases/api-sellers">Settlens for API sellers</a>.</p>`)}`,
})}
${ctx.cta({
  title: "Watch one production endpoint",
  body: "In a pilot we write the policy with you, set up the schedule and route alerts to the tool your team already reads.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See the CI gate", href: "/product/ci" },
  ],
})}`;
}
