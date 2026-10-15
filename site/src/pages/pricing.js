// /pricing: engagement models without prices (they are quoted per scope). Capabilities in the
// cards and the comparison follow the truth table in site/src/README.md; the free MCP tools are
// listed from the remote server definition in src/mcp.js.

import { crumbs, MCP_TOOLS } from "./_company.js";

const PROVIDER = { "@id": "https://settlens.com/#organization" };

const ENGAGEMENTS = [
  {
    name: "Pilot",
    summary: "A scoped assessment of your x402 endpoints, run by Settlens, with a written report and signed evidence.",
  },
  {
    name: "Team",
    summary: "Settlens in your own CI and production monitoring for the x402 endpoints you operate, with the CLI, its local MCP server, the GitHub Action and the container that pilot participants receive.",
  },
  {
    name: "Assurance",
    summary: "Independent periodic assessment of your x402 endpoints, with signed evidence for partners and auditors.",
  },
];

export const meta = {
  path: "/pricing",
  title: "Pricing: pilot, team and assurance engagements",
  label: "Pricing",
  description:
    "How Settlens pricing works: a scoped pilot, Team access for CI and monitoring, or periodic independent assurance, quoted on endpoints, facilitators and cadence.",
  section: "company",
  lastmod: "2026-10-13",
  priority: 0.8,
  breadcrumbs: crumbs("Pricing", "/pricing"),
  summary:
    "Settlens has no public price list. Each engagement (a one-off Pilot, Team access for your own CI and monitoring, or periodic independent Assurance) is quoted in writing after a call, from the endpoints and facilitators in scope and the cadence. The browser tools and the offline tools of settlens.com/mcp are free.",
  jsonLd: ENGAGEMENTS.map((engagement) => ({
    "@type": "Service",
    name: `Settlens ${engagement.name}`,
    serviceType: "Security and conformance assessment for x402 payment endpoints",
    description: engagement.summary,
    provider: PROVIDER,
    url: "https://settlens.com/pricing",
  })),
};


export default function render(ctx) {
  const { html } = ctx;
  const [pilot, team, assurance] = ENGAGEMENTS;
  const authorized = "With the owner's written authorization";
  return html`${ctx.hero({
    title: "Pricing scoped to your endpoints and facilitators",
    lede: "Settlens is offered as engagements, not seats. Each one is quoted after a short call, based on how many paid endpoints and facilitators are in scope and how often they need checking.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "How pricing works", href: "#how-pricing-works" },
    ],
    note: html`The <a href="/tools">browser tools</a> and the offline tools of the <a href="#free-mcp-tools">remote MCP endpoint</a> are free to use.`,
  })}
${ctx.section({
  id: "engagements",
  title: "Three ways to work with Settlens",
  lede: "Start with a pilot, then keep the checks running yourself, have them repeated independently, or both.",
  body: ctx.pricingCards([
    {
      name: pilot.name,
      price: "One-off",
      period: "quoted per scope",
      description: pilot.summary,
      featured: true,
      badge: "Start here",
      cta: { label: "Request a pilot", href: "/contact" },
      features: [
        "Passive scan of each in-scope paid endpoint: 402 handshake, PAYMENT-REQUIRED, official @x402/core schema, resource binding, drift",
        "Facilitator GET /supported scan and coverage of your advertised requirements",
        "Optional fail-closed probe: one invalid signature, with the owner's written authorization",
        "Offline verification of payment authorizations you capture (EVM exact scheme and Solana)",
        "Written report with findings and fixes, plus JSON, HTML and SARIF reports",
        "ed25519-signed evidence attestation you can verify offline",
      ],
      note: "Recommended setup: one endpoint and one facilitator, on a test network or staging.",
    },
    {
      name: team.name,
      price: "Ongoing",
      period: "quoted per scope",
      description: team.summary,
      cta: { label: "Talk to us", href: "/contact" },
      features: [
        "CLI for Node.js 20.19 or newer and the pinned non-root container image",
        "GitHub composite Action: fail-on threshold, allowed-hosts for custom headers, SARIF for code scanning",
        "Monitor: baseline comparison, regression detection, webhook alerts, non-zero exit at your threshold",
        "Offline verification of captured payment authorizations (EVM exact scheme and Solana)",
        `Local MCP server with all ${MCP_TOOLS.public.length + MCP_TOOLS.network.length} tools, including the passive network scans, for your agents`,
      ],
      note: "Self-run results are your own evidence; they are not an independent assessment.",
    },
    {
      name: assurance.name,
      price: "Periodic",
      period: "quoted per cadence",
      description: assurance.summary,
      cta: { label: "Talk to us", href: "/contact" },
      features: [
        "Assessment repeated at an agreed cadence, by Settlens",
        "Comparison with the previous assessment, so regressions stand out",
        "A signed attestation for every report, bound to its SHA-256 digest and a timestamp",
        "Evidence your partners and auditors verify themselves with verify-report and evidence verify",
      ],
      note: "Reports describe observed behavior. They are not a certification or legal advice.",
    },
  ]),
})}
${ctx.section({
  id: "compare",
  title: "Compare the engagements",
  lede: "Every engagement uses the same check catalog. What changes is who runs the checks, how often, and who signs the evidence.",
  tone: "raised",
  body: ctx.comparisonTable({
    caption: "Settlens engagement models compared",
    columns: ["Capability", "Pilot", "Team", "Assurance"],
    highlight: 1,
    rows: [
      { label: "Who runs the checks", values: ["Settlens", "Your team", "Settlens"] },
      { label: "Cadence", values: ["Once, on the agreed scope", "Every build and every schedule you set", "Agreed cadence"] },
      { label: "Passive endpoint scan", values: [true, true, true] },
      { label: "Facilitator /supported scan", values: [true, true, true] },
      { label: "Invalid-signature fail-closed probe", values: [authorized, authorized, authorized] },
      { label: "Offline payment signature verification", values: [true, true, true] },
      { label: "JSON, HTML and SARIF reports", values: [true, true, true] },
      { label: "Written report with findings and fixes", values: [true, false, true] },
      { label: "Ongoing CI gate and production monitoring", values: [false, true, "Combine with Team"] },
      { label: "Signed evidence attestation", values: ["Signed by Settlens", "Signed with your own key", "Signed by Settlens"] },
      { label: "Independent of the endpoint operator", values: [true, false, true] },
    ],
  }),
})}
${ctx.section({
  id: "how-pricing-works",
  title: "How pricing works",
  lede: "There is no public price list yet. Every engagement is quoted after a call, from three inputs.",
  body: html`${ctx.featureGrid([
    { icon: "layers", title: "Endpoints in scope", body: "The number of x402 paid resources to assess, monitor or gate in CI." },
    { icon: "shield-check", title: "Facilitators in scope", body: "The facilitators whose /supported capabilities and /verify behavior are checked." },
    { icon: "clock", title: "Cadence", body: "One pilot, continuous use by your team, or independent assessments repeated on a schedule." },
  ])}`,
})}
${ctx.section({
  id: "from-request-to-kickoff",
  title: "From request to kickoff",
  lede: "Four steps, and nothing is assessed before the scope is agreed in writing.",
  tone: "raised",
  body: html`${ctx.steps([
  { title: "Send a request", body: html`<p>Use the <a href="/contact">pilot request form</a> or write to <a href="mailto:${ctx.site.email}">${ctx.site.email}</a> with the endpoints, facilitators or agent flows you have in mind.</p>` },
  { title: "Scoping call", body: "We agree on what is in scope, the terms each endpoint should advertise and whether an authorized active probe is wanted." },
  { title: "Written quote and scope", body: "You receive the scope, the deliverables and the price in writing. Nothing starts before you accept it." },
  { title: "Authorization and kickoff", body: html`<p>For an active probe, the endpoint owner's written authorization comes first. Its reference is passed to <code>--authorization-ref</code> and recorded in the report. See the <a href="/security">security page</a> for how tests are gated.</p>` },
])}`,
})}
${ctx.section({
  id: "free-mcp-tools",
  title: "Free: the remote MCP offline tools",
  lede: html`The MCP endpoint at <code>https://settlens.com/mcp</code> lists these tools without any token. They compute on the inputs you send, never pay and never need a key. The <a href="/tools/x402-checker">x402 checker</a> runs <code>evaluate_payment_requirements</code> in your browser.`,
  body: ctx.split({
    main: ctx.table({
      caption: "Tools the remote MCP endpoint exposes without a token",
      head: ["Tool", "What it does"],
      rowHeaders: true,
      rows: MCP_TOOLS.public.map((tool) => [html`<code>${tool.name}</code>`, tool.title]),
    }),
    aside: html`${ctx.codeBlock({ lang: "shell", title: "Add the remote endpoint to Claude Code", code: "claude mcp add --transport http settlens https://settlens.com/mcp", wrap: true })}
${ctx.callout({
  tone: "info",
  title: "Network tools need a token",
  body: html`<p>${MCP_TOOLS.network.map((tool, index) => html`${index ? " and " : ""}<code>${tool.name}</code>`)} are passive and run on the remote endpoint only with a Settlens API token. Requests are rate limited per IP address. See the <a href="/mcp">MCP server page</a>.</p>`,
})}`,
  }),
})}
${ctx.section({
  id: "pricing-faq",
  title: "Pricing questions",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Why are there no prices on this page?", a: "Prices are not public yet. The work depends on how many endpoints and facilitators are in scope and how often they are checked, so each engagement is quoted in writing after a call." },
    { q: "Is anything free?", a: html`<p>Yes. The offline tools of the remote MCP endpoint, including <code>evaluate_payment_requirements</code>, are free to use within the rate limits, from any MCP client or with the <a href="/tools">browser tools</a>. The <a href="/learn">Learn</a> guides and the <a href="/docs">documentation</a> are public too.</p>` },
    { q: "Where should we start?", a: "With a pilot on one endpoint and one facilitator, ideally on a test network or staging. Team and Assurance can follow, separately or together." },
    { q: "Do you need our wallets, keys or tokens?", a: "No. Settlens never pays, never signs a payment, never holds your keys or funds and never calls a facilitator's /settle. Passive scans need no credentials at all." },
    { q: "Can we install Settlens from npm?", a: html`<p>No. Settlens is in a source repository and is not published on npm or as open source. Pilot participants receive the CLI (Node.js 20.19 or newer), the GitHub Action and the container. <a href="/contact">Request a pilot</a> to get access.</p>` },
  ]),
})}
${ctx.cta({
  title: "Get a quote for your endpoints",
  body: "Tell us which endpoints, facilitators or agent flows you want checked. We reply by email to set up a short scoping call.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Read the FAQ", href: "/faq" },
  ],
})}`;
}
