// Living reference of every component. Not indexed, not in the nav or sitemap.
// All sample data is illustrative; links stay on this page.

export const meta = {
  path: "/styleguide",
  title: "Design system",
  description: "Reference rendering of every Settlens site component: tokens, typography, buttons, cards, code, tables, callouts, forms and diagrams.",
  section: "system",
  lastmod: "2026-10-13",
  noindex: true,
};

const FLOW_SVG = `<svg viewBox="0 0 720 340" width="720" height="340" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-zone" x="24" y="76" width="420" height="98" rx="10"/>
  <rect class="d-zone d-zone--blue" x="24" y="180" width="420" height="40" rx="10"/>
  <rect class="d-node" x="40" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="280" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="520" y="16" width="160" height="44" rx="10"/>
  <text class="d-title" x="120" y="43" text-anchor="middle">Client or agent</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="600" y="43" text-anchor="middle">Facilitator</text>
  <path class="d-life" d="M120 60v268M360 60v268M600 60v268"/>
  <path class="d-msg" d="M120 108h236"/><path class="d-head" d="M350 102l8 6-8 6"/>
  <text class="d-label" x="240" y="99" text-anchor="middle">GET /paid-resource</text>
  <path class="d-msg d-msg--accent" d="M360 152H124"/><path class="d-head d-head--accent" d="M130 146l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="240" y="143" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <path class="d-msg" d="M120 206h236"/><path class="d-head" d="M350 200l8 6-8 6"/>
  <text class="d-label" x="240" y="197" text-anchor="middle">retry + PAYMENT-SIGNATURE</text>
  <path class="d-msg" d="M360 254h236"/><path class="d-head" d="M590 248l8 6-8 6"/>
  <text class="d-label" x="480" y="245" text-anchor="middle">/verify, then /settle</text>
  <path class="d-msg" d="M360 302H124"/><path class="d-head" d="M130 296l-8 6 8 6"/>
  <text class="d-label" x="240" y="293" text-anchor="middle">200 + PAYMENT-RESPONSE</text>
  <text class="d-note" x="458" y="130">Passive scan</text>
  <text class="d-note d-note--blue" x="458" y="197">Active probe,</text>
  <text class="d-note d-note--blue" x="458" y="213">authorized only</text>
</svg>`;

const SAMPLE_POSTS = [
  { path: "/styleguide#post-list", title: "Example post: what an x402 handshake should return", description: "Illustrative entry rendered with postList(). Real posts come from ctx.posts().", datePublished: "2026-10-01", readingMinutes: 7, tags: ["x402", "Conformance"] },
  { path: "/styleguide#post-list", title: "Example post: reading a Settlens report", description: "A second illustrative entry to show spacing and tag pills.", datePublished: "2026-09-18", readingMinutes: 4, tags: ["Reports"] },
];

export default function render(ctx) {
  const c = ctx;
  const { html } = ctx;
  const sectionIds = ["tokens", "typography", "buttons", "icons", "cards", "features", "steps", "callouts", "code", "terminal", "visuals", "answers", "tables", "faq", "pricing", "stats", "diagram", "navigation", "posts", "forms", "layout"];
  return html`${c.hero({
    title: "Settlens design system",
    lede: "Every component the site is built from, rendered with the production stylesheet. Content pages compose these; nothing here uses inline styles or inline scripts.",
    actions: [
      { label: "Jump to components", href: "#buttons", icon: "arrow-right" },
      { label: "See the diagram style", href: "#diagram" },
    ],
    aside: c.terminal({
      title: "settlens scan (demo target)",
      lines: [
        { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
        { kind: "cont", text: "    --active --authorized --authorization-ref DEMO-002" },
        { kind: "out", text: "12 pass · 1 fail · 1 warn · 1 skip" },
        { kind: "fail", text: "  FAIL critical Invalid payment authorization is denied" },
        { kind: "warn", text: "  WARN medium   Invalid payment uses a standard failure status" },
        { kind: "skip", text: "  SKIP medium   Payment requirements remain stable" },
      ],
    }),
  })}
${c.section({
  id: "tokens",
  title: "Color tokens",
  lede: "Custom properties in site.css. Text tokens meet WCAG 2.2 AA on every surface token.",
  body: html`<ul class="swatches" role="list">${[
    ["bg", "--bg #07111f"], ["surface", "--surface"], ["surface-2", "--surface-2"], ["text", "--text"], ["text-2", "--text-2"], ["text-3", "--text-3"],
    ["accent", "--accent #26e6c8"], ["blue", "--blue #4c7dff"], ["ok", "--ok"], ["warn", "--warn"], ["danger", "--danger"], ["line", "--line-strong"],
  ].map(([name, label]) => html`<li class="swatch"><span class="swatch__chip swatch__chip--${name}"></span><code>${label}</code></li>`)}</ul>`,
})}
${c.section({
  id: "typography",
  title: "Typography",
  lede: "Inter variable, self-hosted (titles 650, UI 500-600, body 400), system monospace for code. Fluid display sizes, fixed reading sizes.",
  tone: "raised",
  body: c.prose(html`<p class="type-sample type-sample--display">Display: settle with evidence</p>
<h3>Heading three inside prose</h3>
<p>Body copy is set at a comfortable measure. Inline <code>PAYMENT-REQUIRED</code> code, <a href="#typography">a link</a>, <strong>strong text</strong> and <em>emphasis</em>.</p>
<ul><li>Unordered list item</li><li>Another item with <code>resource.url</code></li></ul>
<ol><li>Ordered step one</li><li>Ordered step two</li></ol>
<blockquote><p>A blockquote for quoting a specification or a report finding.</p></blockquote>
<h4>Heading four</h4>
<p>Small print and <kbd>Ctrl</kbd> + <kbd>C</kbd> keys.</p>`),
})}
${c.section({
  id: "buttons",
  title: "Buttons, badges and pills",
  body: html`<div class="sg-row">${c.button({ label: "Primary", href: "#buttons" })}${c.button({ label: "Secondary", href: "#buttons", variant: "secondary" })}${c.button({ label: "Ghost", href: "#buttons", variant: "ghost" })}${c.button({ label: "With icon", href: "#buttons", icon: "arrow-right" })}${c.button({ label: "Small", href: "#buttons", size: "sm" })}${c.button({ label: "Button element", variant: "secondary" })}</div>
<div class="sg-row">${["neutral", "accent", "success", "warning", "danger", "info"].map((tone) => c.badge(tone, { tone }))}</div>
<div class="sg-row">${c.pill("x402 V2")}${c.pill("EIP-3009", { tone: "info" })}${c.pill("Passive", { tone: "accent" })}</div>`,
})}
${c.section({
  id: "icons",
  title: "Icons",
  lede: "One authored set on a 24px grid. Decorative by default; pass a label when the icon carries meaning.",
  tone: "raised",
  body: html`<ul class="icon-grid" role="list">${c.ICON_NAMES.map((name) => html`<li>${c.icon(name)}<code>${name}</code></li>`)}</ul>`,
})}
${c.section({
  id: "cards",
  title: "Cards",
  body: c.cards([
    { icon: "search", title: "Linked card", body: "The whole tile is clickable through a stretched link.", href: "#cards" },
    { icon: "shield", title: "With a tag", body: "Tags render as neutral badges.", tag: "Passive" },
    { icon: "seal", title: "Plain card", body: "No link, no tag." },
  ]),
})}
${c.section({
  id: "features",
  title: "Feature grid",
  tone: "raised",
  body: c.featureGrid([
    { icon: "terminal", title: "Deterministic checks", body: "Identical input gives an identical report digest.", href: "#features" },
    { icon: "lock", title: "No custody", body: "Settlens never holds funds, wallets or payment keys." },
    { icon: "file", title: "JSON, HTML, SARIF", body: "One run, three report formats." },
  ]),
})}
${c.section({
  id: "steps",
  title: "Steps",
  body: c.steps([
    { title: "Scan passively", body: "Request the paid resource and decode PAYMENT-REQUIRED." },
    { title: "Gate in CI", body: html`<p>Fail the build at <code>--fail-on high</code>.</p>` },
    { title: "Sign the evidence", body: "Attest the report digest with an ed25519 key." },
  ]),
})}
${c.section({
  id: "callouts",
  title: "Callouts",
  tone: "raised",
  width: "narrow",
  body: html`${c.callout({ tone: "info", title: "Info", body: "Passive mode is the default and never sends PAYMENT-SIGNATURE." })}
${c.callout({ tone: "note", title: "Note", body: "Reports omit response bodies and request header values." })}
${c.callout({ tone: "success", title: "Success", body: "The report integrity block verifies." })}
${c.callout({ tone: "warning", title: "Warning", body: "Only use --active --authorized with the endpoint owner's written approval." })}
${c.callout({ tone: "danger", title: "Danger", body: html`<p>An endpoint that returns <code>200</code> to an invalid signature does not fail closed.</p>` })}`,
})}
${c.section({
  id: "code",
  title: "Code blocks",
  body: html`${c.codeBlock({ lang: "shell", title: "Passive scan with a local policy", code: `# Passive by default: no payment signature is sent
settlens scan https://merchant.example/api/data \\
  --expect-scheme exact \\
  --expect-network eip155:8453 \\
  --max-amount 10000` })}
${c.codeBlock({ lang: "json", title: "settlens.config.json", code: `{
  "version": 1,
  "failOn": "high",
  "targets": [
    { "name": "paid-api", "url": "https://merchant.example/api/data", "expected": { "maxAmount": "10000" } }
  ]
}` })}
${c.codeBlock({ lang: "yaml", title: ".github/workflows/settlens.yml", code: `- name: Assess x402 endpoints
  uses: ./
  with:
    config: settlens.config.json
    fail-on: high # block on high and critical findings` })}`,
})}
${c.section({
  id: "terminal",
  title: "Terminal",
  tone: "raised",
  width: "narrow",
  body: c.terminal({
    title: "settlens scan (demo target)",
    lines: [
      { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure" },
      { kind: "out", text: "Settlens x402 assessment a703d006" },
      { kind: "muted", text: "Targets 1 · Active 0 · Settlement calls 0" },
      { kind: "pass", text: "13 pass · 0 fail · 0 warn · 0 skip" },
    ],
  }),
})}
${c.section({
  id: "visuals",
  title: "Product visuals",
  lede: "panel() chrome around real product output. Pages feed them from a build-time MCP call or a recorded run; the inspector and verdict values here are illustrative.",
  body: html`${c.split({
    main: c.inspector({
      title: "evaluate_payment_requirements",
      meta: "5 of 6 checks pass",
      request: { label: "Agent requested", call: "GET 127.0.0.1:4402/premium", response: "402 PAYMENT-REQUIRED" },
      rows: [
        { field: "scheme", value: "exact", check: "policy.scheme", status: "pass" },
        { field: "network", value: "eip155:84532", check: "policy.network", status: "pass" },
        { field: "amount", value: "10000", check: "policy.maximum_amount", status: "pass" },
        { field: "asset", value: "0x036C…CF7e", check: "policy.asset", status: "pass" },
        { field: "payTo", value: "0x2096…287C", check: "policy.recipient", status: "warn" },
        { field: "resource.url", value: "127.0.0.1:4402/secure", check: "binding.resource_url", status: "fail" },
      ],
      decision: { value: "do_not_pay", tone: "danger", reason: "resource.url does not match the URL being assessed." },
      caption: "inspector(): illustrative values. Rows pass, warn or fail; the decision settles last.",
    }),
    aside: html`${c.verdicts({
      title: "evaluate_payment_requirements",
      meta: "One request, three policies",
      items: [
        { decision: "pay", tone: "success", when: "Under a complete policy", detail: "Every policy check passes for one option." },
        { decision: "review", tone: "warning", when: "When the policy sets only max_amount", detail: "No pay_to allowlist: the recipient cannot be confirmed." },
        { decision: "do_not_pay", tone: "danger", when: "When max_amount is 5000", detail: "The amount is above the policy maximum." },
      ],
      caption: "verdicts(): illustrative values.",
    })}
${c.panel({ title: "panel()", meta: "Shared chrome", body: "The titled bar and gradient edge of every product visual. Use it directly for any other short, real output." })}`,
  })}
${c.reportPreview({
  file: "settlens-19fc4364.json",
  meta: "Recorded example",
  mode: "active-authorized",
  target: "GET http://127.0.0.1:4402/bypass",
  summary: { pass: 25, fail: 1, warn: 1, skip: 0 },
  findings: [
    { id: "security.invalid_signature_fail_closed", severity: "critical", message: "The endpoint returned HTTP 200 after an invalid payment authorization." },
    { id: "transport.invalid_payment_status", severity: "medium", message: "Expected HTTP 400 or 402 for invalid payment, received HTTP 200." },
  ],
  facts: [
    { term: "scope", value: "settlementCalls 0 · privateKeysUsed 0" },
    { term: "sha256", value: html`d5c00c1f…8fdae09d ${c.icon("check-circle", { label: "Valid" })} verify-report` },
  ],
  caption: "reportPreview(): the recorded demo run against /bypass (Settlens 0.5.0). Report ids and digests change on every run.",
})}`,
})}
${c.section({
  id: "answers",
  title: "Answer blocks",
  lede: "Layouts render these from meta.summary and meta.sources: the summary under the title (after the hero on page layouts), the sources at the end of the content.",
  tone: "raised",
  body: html`${c.summary({ text: "Settlens checks x402 payment endpoints and agent payment decisions: passive conformance scans, a local payment policy and signed evidence, without ever paying or holding funds. Illustrative summary text." })}
${c.sources([
  { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
  { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
])}`,
})}
${c.section({
  id: "tables",
  title: "Tables",
  body: html`${c.table({
    caption: "CLI exit codes",
    head: ["Code", "Meaning"],
    rows: [
      ["0", "No failing check at or above the --fail-on severity."],
      ["1", "At least one failing check at or above the threshold."],
      ["2", "CLI or configuration error."],
    ],
    rowHeaders: true,
  })}
${c.comparisonTable({
  caption: "Passive scan and active probe",
  columns: ["Behavior", "Passive scan", "Active probe"],
  rows: [
    { label: "Sends a payment signature", values: [false, "One invalid signature"] },
    { label: "Requires the owner's authorization", values: [false, true] },
    { label: "Calls facilitator /settle", values: [false, false] },
    { label: "Needs a wallet or private key", values: [false, false] },
  ],
})}`,
})}
${c.section({
  id: "faq",
  title: "FAQ",
  tone: "raised",
  width: "narrow",
  body: c.faq([
    { q: "Does Settlens move funds?", a: "No. It never calls /settle, holds no wallet or payment key and never custodies funds." },
    { q: "Is there a token?", a: html`<p>No. Settlens is not a blockchain and has no token.</p>` },
  ]),
})}
${c.section({
  id: "pricing",
  title: "Pricing cards",
  lede: "Example data for layout only.",
  body: c.pricingCards([
    { name: "Example A", price: "On request", description: "One endpoint, one report.", features: ["Passive scan", "JSON, HTML and SARIF reports"], cta: { label: "Contact", href: "#pricing" } },
    { name: "Example B", price: "On request", period: "per quarter", description: "Featured plan styling.", features: ["Everything in A", "CI gate", "Monitoring"], cta: { label: "Contact", href: "#pricing" }, featured: true, badge: "Featured" },
    { name: "Example C", price: "On request", description: "With a footnote.", features: ["Signed evidence"], cta: { label: "Contact", href: "#pricing" }, note: "Footnotes sit under the feature list." },
  ]),
})}
${c.section({
  id: "stats",
  title: "Stats",
  tone: "raised",
  body: html`${c.stats([
    { value: "0", label: "Payment keys required" },
    { value: "1", label: "Invalid signature per active probe", detail: "Only with explicit authorization" },
    { value: "3", label: "Report formats", detail: "JSON, HTML and SARIF" },
  ])}
${c.stat({ value: "0", label: "Calls to facilitator /settle", detail: "stat() renders a single fact" })}`,
})}
${c.section({
  id: "diagram",
  title: "Diagram",
  lede: "Inline SVG drawn with the d-* classes so strokes and labels follow the tokens.",
  body: c.diagram({ svg: FLOW_SVG, label: "x402 V2 sequence: the client requests a paid resource, receives 402 with PAYMENT-REQUIRED, retries with PAYMENT-SIGNATURE; the resource asks the facilitator to verify then settle and returns 200 with PAYMENT-RESPONSE. Settlens passively checks the first exchange and, when authorized, sends one invalid signature that must fail closed.", caption: "The x402 V2 handshake. Settlens scans the first exchange passively; the authorized active probe sends one invalid signature, which must be refused. Settlens never calls /settle.", size: "wide" }),
})}
${c.section({
  id: "navigation",
  title: "Navigation components",
  tone: "raised",
  body: html`<div class="sg-stack">
${c.breadcrumbs([{ name: "Home", path: "/" }, { name: "Design system", path: "/styleguide" }, { name: "Navigation", path: "/styleguide#navigation" }])}
${c.toc(sectionIds.slice(0, 5).map((id, index) => ({ id, text: id[0].toUpperCase() + id.slice(1), level: index % 2 ? 3 : 2 })))}
${c.prevNext({ prev: { title: "Home", path: "/" }, next: { title: "Back to top", path: "#main" } })}
</div>`,
})}
${c.section({ id: "posts", title: "Post list", lede: "postList() for related lists; variant \"index\" for the blog index (date and reading time in a left column from 64rem).", body: html`<div id="post-list">${c.postList(SAMPLE_POSTS, { headingLevel: 3, variant: "index" })}</div>` })}
${c.section({
  id: "forms",
  title: "Forms and key values",
  tone: "raised",
  body: c.split({
    main: c.pilotForm({ source: "/styleguide" }),
    aside: c.keyValues([
      { term: "Publisher", value: html`${ctx.site.legal.publisher}, <span lang="fr">${ctx.site.legal.status}</span>` },
      { term: "Trade name", value: ctx.site.legal.tradeName },
      { term: "Email", value: html`<a href="mailto:${ctx.site.email}">${ctx.site.email}</a>` },
    ]),
  }),
})}
${c.section({
  id: "layout",
  title: "Layout helpers",
  lede: "container(), split() and prose() compose page layouts; article and docs layouts are selected by meta.layout.",
  body: c.split({
    main: c.prose(html`<p>split() places two columns side by side and stacks them below 56rem. Use <code>reverse: true</code> to put the aside first on wide screens.</p>`),
    aside: c.callout({ tone: "info", title: "Layouts", body: "Pages under /docs use the docs layout; /blog/* and /learn/* use the article layout." }),
  }),
})}
${c.container(c.prose(html`<p>container() adds the page gutter and maximum width to content placed outside section(), like this paragraph.</p>`), { width: "narrow" })}
${c.cta({ title: "Call to action band", body: "cta() closes a page with one primary and one secondary action.", actions: [{ label: "Primary action", href: "#main" }, { label: "Secondary", href: "#buttons" }] })}`;
}
