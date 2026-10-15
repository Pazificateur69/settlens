// Monitor documentation. Behavior follows src/monitor.js and the monitor branch of src/cli.js;
// transcripts, state file and webhook payload are real output against the demo server.

export const meta = {
  path: "/docs/monitor",
  title: "Monitor: detect x402 payment regressions",
  label: "Monitor",
  heading: "Monitor",
  lede: "Scan production payment endpoints on a schedule, compare each run with the previous one and alert when a check regresses.",
  description: "Settlens Monitor: scheduled passive scans compared with the previous run, regression rules, the state file, webhook payload, exit codes and scheduling.",
  section: "docs",
  lastmod: "2026-10-14",
  order: 6,
  icon: "activity",
  summary: "settlens monitor runs a passive scan of every configured target, compares each check with the previous run stored in a state file and alerts on regressions, new findings and removed checks. It exits 1, and can POST a JSON webhook, when an alert's check severity reaches the fail-on threshold (high by default).",
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

const STATE = `{
  "GET http://127.0.0.1:4402/drift": {
    "checks": [
      { "id": "transport.reachable", "status": "pass", "severity": "high", "title": "Endpoint is reachable" },
      { "id": "transport.status_402", "status": "pass", "severity": "high", "title": "Unauthenticated request requires payment" },
      { "id": "policy.maximum_amount", "status": "fail", "severity": "high", "title": "Amounts stay within the approved ceiling" }
    ],
    "summary": { "pass": 14, "fail": 1, "warn": 0, "skip": 1 },
    "observedAt": "2026-10-13T11:02:43.812Z"
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

const FLOW_SVG = `<svg viewBox="0 0 720 250" width="720" height="250" xmlns="http://www.w3.org/2000/svg">
  <title>One monitor run</title>
  <desc>Each run scans every target passively, compares the checks with the state file from the previous run, raises alerts for regressions, new findings and removed checks, exits 1 and calls the webhook when an alert reaches fail-on, and rewrites the state file.</desc>
  <rect class="d-node" x="16" y="40" width="150" height="60" rx="10"/>
  <rect class="d-node d-node--accent" x="206" y="40" width="150" height="60" rx="10"/>
  <rect class="d-node" x="396" y="40" width="140" height="60" rx="10"/>
  <rect class="d-node" x="570" y="40" width="140" height="60" rx="10"/>
  <rect class="d-node" x="206" y="168" width="150" height="60" rx="10"/>
  <text class="d-title" x="91" y="66" text-anchor="middle">Passive scan</text>
  <text class="d-label" x="91" y="87" text-anchor="middle">every target</text>
  <text class="d-title" x="281" y="66" text-anchor="middle">Compare</text>
  <text class="d-label d-label--accent" x="281" y="87" text-anchor="middle">by check id</text>
  <text class="d-title" x="466" y="66" text-anchor="middle">Alerts</text>
  <text class="d-label" x="466" y="87" text-anchor="middle">worse, new, gone</text>
  <text class="d-title" x="640" y="66" text-anchor="middle">Notify</text>
  <text class="d-label" x="640" y="87" text-anchor="middle">exit 1, webhook</text>
  <text class="d-title" x="281" y="194" text-anchor="middle">State file</text>
  <text class="d-label" x="281" y="215" text-anchor="middle">previous run</text>
  <path class="d-msg" d="M166 70h38"/><path class="d-head" d="M198 64l8 6-8 6"/>
  <path class="d-msg d-msg--accent" d="M356 70h38"/><path class="d-head d-head--accent" d="M388 64l8 6-8 6"/>
  <path class="d-msg" d="M536 70h32"/><path class="d-head" d="M562 64l8 6-8 6"/>
  <path class="d-msg" d="M281 168v-66"/><path class="d-head" d="M275 110l6-8 6 8"/>
  <path class="d-msg d-msg--blue" d="M91 100v98h113"/><path class="d-head d-head--blue" d="M198 192l8 6-8 6"/>
  <text class="d-note" x="16" y="26">Run N</text>
  <text class="d-note d-note--blue" x="104" y="150">rewritten after</text>
  <text class="d-note d-note--blue" x="104" y="168">every run</text>
  <text class="d-note" x="396" y="132">only when an alert</text>
  <text class="d-note" x="396" y="150">reaches fail-on</text>
</svg>`;

const t = (kind, text) => ({ kind, text });

export default function render(ctx) {
  const { html, codeBlock, terminal, table, callout, diagram, faq } = ctx;
  return html`<p><code>settlens monitor</code> turns a point-in-time scan into continuous assurance. Each run performs the same passive scan as <a href="/docs/cli#scan"><code>settlens scan</code></a> on every target of a <a href="/docs/configuration">configuration file</a>, compares the results with the previous run stored in a state file, and reports what changed: a payment endpoint that starts advertising a new price, a different recipient or an unsupported network is caught on the next run. Monitoring never sends a payment or runs the active probe. Optional journal mode keeps an exportable observation history.</p>
${diagram({ svg: FLOW_SVG, label: "One monitor run: a passive scan of every target is compared by check id with the state file from the previous run. Regressions, new findings and removed checks become alerts; when an alert reaches fail-on, the command exits 1 and calls the webhook. The state file is rewritten after every run.", caption: "Each run compares with the run before it, then becomes the next baseline.", size: "wide" })}

<h2 id="private-workspace">Private workspace and persistent history</h2>
<p>The optional private workspace at <code>/dashboard</code> supports endpoint configuration, manual and scheduled scans, change history, remediation hints and JSON or HTML exports. It is a single-owner workspace protected by a dedicated token exchanged for a one-hour session; it is not a multi-tenant customer portal. Remote scans accept only public destinations and no custom headers.</p>
<p>In the private workspace, edit endpoint names and policies while retaining history, review observed terms before approval, acknowledge incidents, add comments, filter by severity and inspect or retry notification deliveries. Open incidents remind daily; acknowledgement pauses reminders. Delivery uses bounded persistent retries and can duplicate an email if a remote acceptance response was lost.</p><p>For CLI history, use <code>--history .settlens/monitor.json</code> instead of <code>--state</code>. The journal separates latest observations from owner-approved terms and keeps up to 200 runs from the last 90 days, subject to its 8 MiB bound. Active incidents gate CI until passing observations establish recovery; missing checks do not prove recovery. Export with <code>settlens history --history .settlens/monitor.json --format html --out history.html</code>. SHA-256 digests detect edits but do not authenticate the observer.</p>
<p>Payment fields are compared using fingerprints; raw terms are not stored. Option reordering and rotating Solana blockhash fields do not cause alerts. Outages retain the last observable terms for comparison on recovery. When SMTP is configured, blocking changes go to contact@settlens.com with the subject prefix <code>[Settlens][ALERTE]</code>; pilot requests use <code>[Settlens][PILOTE]</code>.</p>
<h2 id="usage">Usage</h2>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens monitor --config <file> [--state <file>] [--webhook <url>] [--fail-on <severity>] [--timeout <ms>]", copy: false })}
<ul>
  <li><code>--config</code> (required): the same file format as <code>settlens check</code>. <code>failOn</code> applies when <code>--fail-on</code> is not given; <code>output</code> is ignored.</li>
  <li><code>--state</code>: where the previous run is read and the new one written. Without it, nothing is remembered and every run is a first run.</li>
  <li><code>--webhook</code>: URL that receives a JSON POST when at least one alert reaches the threshold.</li>
  <li><code>--fail-on</code>: lowest severity that makes an alert blocking: <code>low</code>, <code>medium</code>, <code>high</code>, <code>critical</code> or <code>none</code>. Default <code>high</code>. Any other value stops the command with exit code 2 before anything is scanned.</li>
  <li><code>--timeout</code>: per-request timeout in milliseconds. Each target's <code>repeat</code> comes from the config.</li>
  <li>Custom headers follow the same allowlist rule as other commands: set <code>SETTLENS_ALLOWED_HOSTS</code>.</li>
</ul>

<h2 id="example">A baseline, then a regression</h2>
<p>The demo server's <code>/drift</code> endpoint alternates its price between 10000 and 25000 atomic units on successive requests. With <code>repeat: 1</code>, each run sees one price, so a ceiling of 10000 passes on one run and fails on the next:</p>
${codeBlock({ lang: "json", title: "settlens.config.json", code: CONFIG })}
${codeBlock({ lang: "shell", title: "Compare two observations", code: "settlens monitor --config settlens.config.json --history .settlens/monitor.json\nsettlens monitor --config settlens.config.json --history .settlens/monitor.json" })}
<p>The first run records a baseline. The next run detects the changed amount even without a price policy. If the amount also exceeds the configured ceiling, the policy regression is a separate alert.</p>
<p>Coverage that disappears is an alert too. Delete <code>maxAmount</code> from the configuration and the next run no longer evaluates the ceiling, so the check that guarded the price is reported as removed:</p>
${terminal({
  title: "The ceiling removed from the configuration (exit 1)",
  lines: [
    t("cmd", "settlens monitor --config settlens.config.json --state state.json"),
    t("out", ""),
    t("out", "priced-api (GET http://127.0.0.1:4402/drift)"),
    t("fail", "  ALERT [high] policy.maximum_amount: removed (was pass): coverage lost — Amounts stay within the approved ceiling"),
    t("out", ""),
    t("fail", "1 blocking alert(s) at or above high."),
  ],
})}

<h2 id="alerts">What raises an alert</h2>
<p>Checks are compared by id. Statuses are ranked <code>pass</code> = <code>skip</code> &lt; <code>warn</code> &lt; <code>fail</code>.</p>
${table({
  caption: "How changes between two runs are reported",
  head: ["Change", "Console", "Alert"],
  rows: [
    ["A check moves up the ranking (pass or skip to warn or fail, warn to fail)", "ALERT or note", "Yes, regression"],
    ["A check absent from the previous run is now warn or fail", "ALERT or note", "Yes, new finding"],
    ["A check moves down the ranking (fail to warn or pass, warn to pass)", "resolved", "No"],
    ["A check keeps the same status, even fail", "nothing", "No"],
    ["A check present before is missing now", "ALERT or note: removed (was …): coverage lost", "Yes, removed"],
    ["First run for a target", "baseline recorded", "No"],
  ],
})}
<p>An alert is blocking, printed as <code>ALERT</code>, when the severity of its check is at or above <code>--fail-on</code>; below the threshold it is printed as <code>note</code> and does not change the exit code. <code>none</code> never blocks. Payment-term changes are also alerts: amount, recipient, asset, network, scheme, resource binding and version changes are high severity; timeout and extra metadata changes are medium severity. The rule applies to every alert kind. Unlike <code>scan</code> and <code>check</code>, a new <em>warning</em> of high severity is blocking at the default threshold. A removed check uses the severity it had in the previous run.</p>
${callout({ tone: "info", title: "Legacy state mode reports changes", body: html`<p>With legacy <code>--state</code>, a check that keeps failing alerts once, on the run where it changed. Journal mode instead maintains persistent incidents and gates CI until recovery. The state file then records the failure as the new baseline. To fail a job on everything that is currently wrong, run <a href="/docs/cli#check"><code>settlens check</code></a> alongside the monitor.</p>` })}

<h2 id="state-file">State file</h2>
<p>The state file is a JSON object keyed by each target's method and sanitized URL, for example <code>GET http://127.0.0.1:4402/drift</code>. For every target it keeps the compact list of checks, the summary and the time of the run. It is read at the start of a run and rewritten at the end, so the baseline is always the previous run. Excerpt after the regression above (3 of 16 checks kept):</p>
${codeBlock({ lang: "json", title: "state.json (excerpt)", code: STATE })}
<ul>
  <li>A missing state file starts an empty baseline. An unreadable or invalid file stops the command rather than silently resetting coverage. Writes are atomic and protected by a fail-fast writer lock.</li>
  <li>Targets are keyed by method and URL, so a GET and a POST target on the same URL keep separate baselines. A state file written by Settlens 0.4.0, keyed by URL only, is still read for a URL that only one target uses, and the entry is rewritten under the new key.</li>
  <li>Legacy state files hold check ids, statuses, severities, titles and payment-term fingerprints. Journal mode adds validated payment field values for review, approved references, incidents, comments and notification delivery jobs; it never stores request headers, raw response bodies or transport credentials. Keep it with the monitor's working files and do not edit it by hand.</li>
</ul>

<h2 id="webhook">Webhook</h2>
<p>With <code>--webhook</code>, Settlens sends one <code>POST</code> with <code>Content-Type: application/json</code> when the run has at least one blocking alert. This is the payload received for the regression above:</p>
${codeBlock({ lang: "json", title: "Webhook body", code: WEBHOOK })}
<ul>
  <li><code>alerting</code> counts blocking alerts and <code>failOn</code> is the threshold used. <code>runs</code> lists every target with its <code>method</code>, <code>url</code> and all of its alerts, including those below the threshold. Each alert has a <code>kind</code>: <code>regression</code> (with <code>from</code> and <code>to</code>), <code>new</code> or <code>removed</code> (with the previous <code>status</code>).</li>
  <li>The request times out after 5 seconds and does not follow redirects. A failed delivery is printed to stderr as <code>Monitor webhook failed: …</code> and does not change the exit code.</li>
  <li>With <code>--webhook-secret-env MONITOR_WEBHOOK_SECRET</code>, the request carries <code>x-settlens-timestamp</code> and <code>x-settlens-signature</code> (<code>sha256=</code> plus HMAC-SHA256 of <code>timestamp.body</code>). The receiver should verify the exact bytes and reject old timestamps. An HTTP error is a failed delivery; details and secret URLs are not logged.</li>
</ul>

<h2 id="scheduling">Scheduling</h2>
<p>Run the monitor from cron, a systemd timer or a CI schedule, in a directory where the state file persists between runs:</p>
${codeBlock({ lang: "shell", title: "crontab: every 15 minutes", code: `*/15 * * * * cd /opt/settlens-monitor && node /opt/settlens/src/cli.js monitor --config settlens.config.json --state settlens.state.json --webhook https://hooks.example.com/settlens >> monitor.log 2>&1` })}
<p>On a CI runner the workspace starts empty, so restore the state file at the start of each run and save it at the end (for example as a cache or an artifact); otherwise every run is a first run and nothing is ever compared. Each run makes <code>repeat</code> requests per target, two by default, so choose an interval the endpoint owner is comfortable with.</p>

<h2 id="exit-codes">Exit codes</h2>
${table({
  caption: "settlens monitor exit codes",
  head: ["Code", "Meaning"],
  rows: [
    ["0", "No blocking alert: first run, no change, resolved checks, or alerts below the threshold."],
    ["1", "At least one alert at or above --fail-on."],
    ["2", "Usage or configuration error, for example a missing --config, an invalid --fail-on or a custom header to a host that is not allowlisted."],
  ],
  rowHeaders: true,
})}

<h2 id="faq">Questions</h2>
${faq([
  { q: "Does Monitor send payments or run the active probe?", a: "No. Every monitor run is a passive scan: ordinary unauthenticated requests, no PAYMENT-SIGNATURE, no call to /settle, no wallet or key. Monitor never runs the active probe, even when --active, --authorized and --authorization-ref are given." },
  { q: "Why did I not get a second alert for a check that is still failing?", a: "Monitor alerts on changes between consecutive runs. After the run that raised the alert, the failure becomes the baseline. Use settlens check, or the GitHub Action, to gate on the current state." },
  { q: "Does Monitor write reports?", a: "No. It prints a console summary and updates the state file. Run settlens check when you need JSON, HTML or SARIF evidence for a given moment." },
])}
<p>Related: the checks that can regress are listed in the <a href="/docs/checks">check catalog</a>, the <a href="/product/monitor">Monitor product page</a> explains where it fits, and <a href="/blog/detecting-x402-payment-drift">Detecting x402 payment drift</a> shows what each kind of change looks like. To set up monitoring of your own endpoints, <a href="/contact">request a pilot</a>.</p>`;
}
