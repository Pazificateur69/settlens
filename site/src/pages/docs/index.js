// Documentation hub. Group cards are built from site.docsNav and the page records, so a new
// docs page appears here as soon as it exists.

export const meta = {
  path: "/docs",
  title: "Settlens documentation",
  label: "Documentation",
  heading: "Documentation",
  lede: "Install the Settlens CLI, assess x402 endpoints and facilitators, gate CI, monitor production, sign evidence and connect AI agents.",
  description: "Settlens documentation: install the CLI, run passive x402 scans, gate CI, monitor drift, sign evidence and let AI agents check payments through MCP.",
  section: "docs",
  schemaType: "CollectionPage",
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Documentation", path: "/docs" },
  ],
  lastmod: "2026-10-13",
  order: 1,
  icon: "book",
  summary: "Settlens documentation covers the CLI, the x402 V2 check catalog, configuration, report formats, the GitHub Action, Monitor, signed evidence, the MCP server and the HTTP scan API. Start with the quickstart: a passive scan of a local demo endpoint, with no wallet or payment key.",
};

// Rows whose page does not exist yet (the tools and learn pages are written separately) are dropped.
const TASKS = [
  ["Check a PAYMENT-REQUIRED header in the browser, with nothing to install", "/tools/x402-checker", "x402 checker"],
  ["Understand x402 before you start", "/learn", "Learn x402"],
  ["Try Settlens on a local demo in ten minutes", "/docs/quickstart", "Quickstart"],
  ["Scan one paid endpoint", "/docs/cli#scan", "CLI: scan"],
  ["Check a facilitator's GET /supported", "/docs/cli#facilitator", "CLI: facilitator"],
  ["Assess many endpoints with a policy", "/docs/configuration", "Configuration"],
  ["Fail a pull request when a check fails", "/docs/github-action", "GitHub Action"],
  ["Understand a finding and fix it", "/docs/checks", "Check catalog"],
  ["Verify a captured payment authorization offline", "/docs/cli#verify-payment", "CLI: verify-payment"],
  ["Prove a report was not edited", "/docs/reports#verify-a-report", "Reports: verify"],
  ["Get alerted when payment terms change", "/docs/monitor", "Monitor"],
  ["Sign a report for a partner or auditor", "/docs/evidence", "Evidence"],
  ["Let an AI agent check a 402 before paying", "/docs/mcp", "MCP server"],
  ["Run scans from your own backend", "/docs/api", "HTTP API"],
  ["Know what a passing report proves", "/docs/methodology", "Methodology"],
  ["Review Settlens' safety guarantees or report a vulnerability", "/docs/security", "Security model"],
];

const MAP_SVG = `<svg viewBox="0 0 720 220" width="720" height="220" xmlns="http://www.w3.org/2000/svg">
  <title>How the Settlens components fit together</title>
  <desc>Assess, CI gate, Monitor and Evidence form a sequence. Assess, CI gate and Monitor share one engine: the check catalog, the report formats and the SHA-256 digest. The MCP server uses the same engine for agents that check a payment before paying.</desc>
  <rect class="d-node" x="16" y="30" width="150" height="64" rx="10"/>
  <rect class="d-node" x="196" y="30" width="150" height="64" rx="10"/>
  <rect class="d-node" x="376" y="30" width="150" height="64" rx="10"/>
  <rect class="d-node" x="556" y="30" width="150" height="64" rx="10"/>
  <rect class="d-zone" x="16" y="140" width="450" height="60" rx="10"/>
  <rect class="d-node d-node--accent" x="486" y="140" width="220" height="60" rx="10"/>
  <text class="d-title" x="91" y="57" text-anchor="middle">Assess</text>
  <text class="d-label" x="91" y="79" text-anchor="middle">scan, facilitator</text>
  <text class="d-title" x="271" y="57" text-anchor="middle">CI gate</text>
  <text class="d-label" x="271" y="79" text-anchor="middle">GitHub Action</text>
  <text class="d-title" x="451" y="57" text-anchor="middle">Monitor</text>
  <text class="d-label" x="451" y="79" text-anchor="middle">settlens monitor</text>
  <text class="d-title" x="631" y="57" text-anchor="middle">Evidence</text>
  <text class="d-label" x="631" y="79" text-anchor="middle">evidence attest</text>
  <text class="d-title" x="241" y="166" text-anchor="middle">One engine</text>
  <text class="d-label" x="241" y="188" text-anchor="middle">check catalog · reports · SHA-256 digest</text>
  <text class="d-title" x="596" y="166" text-anchor="middle">MCP server</text>
  <text class="d-label" x="596" y="188" text-anchor="middle">checks before paying</text>
  <path class="d-msg" d="M166 62h28"/><path class="d-head" d="M188 56l8 6-8 6"/>
  <path class="d-msg" d="M346 62h28"/><path class="d-head" d="M368 56l8 6-8 6"/>
  <path class="d-msg d-msg--accent" d="M526 62h28"/><path class="d-head d-head--accent" d="M548 56l8 6-8 6"/>
  <path class="d-line" d="M91 94v46M271 94v46M451 94v46M466 170h20"/>
</svg>`;

export default function render(ctx) {
  const { html, cards, table, callout, diagram, toCard, find, site } = ctx;
  const card = (path, fallback) => (find(path) ? toCard(find(path)) : { ...fallback, href: path });
  const groups = site.docsNav
    .filter((group) => !group.paths.includes("/docs"))
    .map((group) => ({ title: group.title, pages: group.paths.map(find).filter(Boolean) }))
    .filter((group) => group.pages.length);

  return html`<p>Settlens checks that x402 paid resources and facilitators follow the protocol, bind each payment to the right resource, recipient and price, and keep doing so. It verifies payment authorizations offline and signs its evidence. It is passive by default, needs no wallet or payment key, never calls <code>/settle</code> and never holds funds.</p>
<p>The CLI (version ${site.version}) runs on Node.js 20.19 or newer. Its code is in a source repository that <a href="/contact">pilot participants</a> receive; it is not published on npm.</p>

<h2 id="start-here">Start here</h2>
${cards(
  [
    card("/docs/quickstart", { icon: "arrow-right", title: "Quickstart", body: "Scan a local demo endpoint, read the report and verify it." }),
    card("/docs/cli", { icon: "terminal", title: "CLI reference", body: "Every command, option and exit code." }),
    card("/docs/mcp", { icon: "chip", title: "MCP server", body: "Let an AI agent check an x402 payment request before paying." }),
  ],
  { columns: 3 },
)}

<h2 id="by-task">Find a page by task</h2>
${table({
  caption: "What do you want to do?",
  head: ["Task", "Read"],
  rows: TASKS.filter(([, href]) => find(href.split("#")[0])).map(([task, href, label]) => [task, html`<a href="${href}">${label}</a>`]),
  rowHeaders: true,
})}

<h2 id="how-it-fits">How the pieces fit</h2>
${diagram({ svg: MAP_SVG, label: "Assess, CI gate, Monitor and Evidence form a sequence from first scan to signed evidence. Assess, CI gate and Monitor share one engine: the check catalog, the report formats and the SHA-256 digest. The MCP server uses the same engine so AI agents can check a payment request before paying.", caption: "A finding means the same thing in a local scan, a CI job, a monitor alert and an agent's decision.", size: "wide" })}

<h2 id="by-component">Browse by component</h2>
${groups.map((group) => html`<h3 id="${ctx.slugify(group.title)}">${group.title}</h3>
${cards(group.pages.map(toCard), { columns: 2, headingLevel: 4 })}`)}

<h2 id="conventions">Conventions in these docs</h2>
<ul>
  <li><code>settlens</code> stands for <code>node /path/to/settlens/src/cli.js</code>; the <a href="/docs/cli">CLI reference</a> shows a one-line alias.</li>
  <li>Transcripts are real output. Scans run against the demo server bundled with the repository (<code>npm run demo:server</code>). Report ids, digests, keys and timings differ on every run.</li>
  <li><code>merchant.example</code> and <code>facilitator.example</code> stand for your own hosts.</li>
  <li>Reference tables (configuration fields, report fields, checks, Action inputs, CLI options) are generated from the Settlens source when this site is built.</li>
</ul>
${callout({ tone: "info", title: "Get access", body: html`<p>To run Settlens on your own endpoints, <a href="/contact">request a pilot</a>: we scope one endpoint or facilitator first and share the repository. Building an agent? Start with the <a href="/mcp">MCP server</a>.</p>` })}`;
}
