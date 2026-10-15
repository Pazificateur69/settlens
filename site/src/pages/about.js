// /about: mission, the independence principle, what Settlens is and is not, founder note.
// Milestones are read from CHANGELOG.md; company facts from site.legal in data/site.js.

import { VERSION } from "../../../src/constants.js";
import { crumbs, inlineMarkdown, parseChangelog, repoFile } from "./_company.js";

const RELEASES = parseChangelog(repoFile("CHANGELOG.md")).releases.filter((entry) => /^\d/.test(entry.version));

export const meta = {
  path: "/about",
  title: "About Settlens: independent x402 payment assurance",
  label: "About",
  description:
    "Why Settlens exists: operators should not be the only ones attesting their own x402 payment endpoints. What Settlens is, what it is not, and who builds it.",
  section: "company",
  schemaType: "AboutPage",
  lastmod: "2026-10-13",
  priority: 0.6,
  breadcrumbs: crumbs("About", "/about"),
  summary:
    "Settlens is an independent assurance tool for x402 agentic payments, built in France by its founder, Alessandro Gagliardi. It checks paid endpoints and facilitators from the outside, never pays or holds wallet or payment keys, and its reports can be signed so third parties verify them offline.",
  sources: [
    { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032.html", publisher: "IRTF" },
  ],
  // The founder Person: pages/blog/_shared.js derives the blog AUTHOR from this node, so every byline
  // references the same https://settlens.com/about#founder entity (one description per @id).
  jsonLd: {
    "@type": "Person",
    "@id": "https://settlens.com/about#founder",
    name: "Alessandro Gagliardi",
    jobTitle: "Founder of Settlens",
    worksFor: { "@id": "https://settlens.com/#organization" },
    homeLocation: { "@type": "Country", name: "France" },
    url: "https://settlens.com/about",
  },
};

const INDEPENDENCE_SVG = `<svg viewBox="0 0 720 300" width="720" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="16" y="20" width="210" height="64" rx="10"/>
  <rect class="d-node d-node--accent" x="255" y="20" width="210" height="64" rx="10"/>
  <rect class="d-node" x="494" y="20" width="210" height="64" rx="10"/>
  <text class="d-title" x="121" y="47" text-anchor="middle">Operator</text>
  <text class="d-label" x="121" y="70" text-anchor="middle">endpoint · facilitator</text>
  <text class="d-title" x="360" y="47" text-anchor="middle">Settlens</text>
  <text class="d-label d-label--accent" x="360" y="70" text-anchor="middle">independent checks</text>
  <text class="d-title" x="599" y="47" text-anchor="middle">Relying party</text>
  <text class="d-label" x="599" y="70" text-anchor="middle">partner · auditor · agent</text>
  <path class="d-life" d="M121 84v156M360 84v156M599 84v156"/>
  <path class="d-msg" d="M360 122H129"/><path class="d-head" d="M135 116l-8 6 8 6"/>
  <text class="d-label" x="244" y="113" text-anchor="middle">GET, no payment</text>
  <path class="d-msg d-msg--accent" d="M121 162h231"/><path class="d-head d-head--accent" d="M346 156l8 6-8 6"/>
  <text class="d-label d-label--accent" x="240" y="153" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <path class="d-msg" d="M360 202h231"/><path class="d-head" d="M585 196l8 6-8 6"/>
  <text class="d-label" x="479" y="193" text-anchor="middle">report + attestation</text>
  <rect class="d-zone" x="494" y="216" width="210" height="34" rx="10"/>
  <text class="d-note" x="599" y="238" text-anchor="middle">verifies offline</text>
  <text class="d-text" x="16" y="276">Checks run from the outside, the way a paying client sees the endpoint.</text>
  <text class="d-text" x="16" y="294">The relying party checks the SHA-256 digest and the ed25519 signature itself.</text>
</svg>`;

// The same flow stacked for phones (shown below 40rem instead of INDEPENDENCE_SVG).
const INDEPENDENCE_SVG_NARROW = `<svg viewBox="0 0 320 472" width="320" height="472" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="40" y="16" width="240" height="60" rx="10"/>
  <text class="d-title" x="160" y="42" text-anchor="middle">Operator</text>
  <text class="d-label" x="160" y="64" text-anchor="middle">endpoint · facilitator</text>
  <path class="d-msg" d="M56 162V86"/><path class="d-head" d="M50 92l6-8 6 8"/>
  <text class="d-label" x="160" y="108" text-anchor="middle">GET, no payment</text>
  <path class="d-msg d-msg--accent" d="M264 78v76"/><path class="d-head d-head--accent" d="M258 148l6 8 6-8"/>
  <text class="d-label d-label--accent" x="160" y="140" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <rect class="d-node d-node--accent" x="40" y="164" width="240" height="60" rx="10"/>
  <text class="d-title" x="160" y="190" text-anchor="middle">Settlens</text>
  <text class="d-label d-label--accent" x="160" y="212" text-anchor="middle">independent checks</text>
  <path class="d-msg" d="M80 226v34"/><path class="d-head" d="M74 254l6 8 6-8"/>
  <text class="d-label" x="92" y="250">report + attestation</text>
  <rect class="d-node" x="40" y="268" width="240" height="60" rx="10"/>
  <text class="d-title" x="160" y="294" text-anchor="middle">Relying party</text>
  <text class="d-label" x="160" y="316" text-anchor="middle">partner · auditor · agent</text>
  <rect class="d-zone" x="80" y="336" width="160" height="34" rx="10"/>
  <text class="d-note" x="160" y="358" text-anchor="middle">verifies offline</text>
  <text class="d-text" x="16" y="396">Checks run from the outside, the way a</text>
  <text class="d-text" x="16" y="414">paying client sees the endpoint.</text>
  <text class="d-text" x="16" y="440">The relying party checks the SHA-256</text>
  <text class="d-text" x="16" y="458">digest and the ed25519 signature itself.</text>
</svg>`;

export default function render(ctx) {
  const { html, site } = ctx;
  const { legal } = site;
  const mail = html`<a href="mailto:${site.email}">${site.email}</a>`;
  // One line per release: its lead paragraph, else the bold lead-ins (or openings) of its bullets.
  const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);
  const milestone = (entry) => {
    const lead = entry.blocks.find((block) => block.type === "p")?.text;
    if (lead) return inlineMarkdown(lead);
    const items = entry.blocks.filter((block) => block.type === "ul").flatMap((block) => block.items);
    const bold = items.flatMap((item) => [...item.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]));
    const parts = (bold.length ? bold : items.map((item) => item.split(/[:;]/)[0])).map(lower);
    return inlineMarkdown(`Added ${new Intl.ListFormat("en").format(parts)}.`);
  };

  return html`${ctx.hero({
    title: "Independent assurance for agentic payments",
    lede: "When software pays software, the payment request is the contract. Settlens checks that contract from the outside, on x402 endpoints and facilitators, and signs the evidence so anyone can verify it.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "See the product", href: "/product" },
    ],
  })}
${ctx.section({
  id: "mission",
  title: "Our mission",
  width: "narrow",
  body: ctx.prose(html`<p>With x402, a server answers <code>402 Payment Required</code> with machine-readable terms, and an AI agent or any other client can pay and retry in a single exchange. No checkout page, no human reading the price. That is what makes agentic payments useful, and it is also why a wrong recipient, a silently changed amount or a resource that serves content for an invalid signature can go unnoticed.</p>
<p>Settlens exists to make that exchange checkable: by the people who run the endpoints, by the people who rely on them, and by the agents that pay them. It reads the <a href="/learn/x402-v2-headers">x402 V2 headers</a> the way a paying client does, compares what it sees with what was expected, and records the result in reports that can be signed and verified offline.</p>`),
})}
${ctx.section({
  id: "independence",
  title: "The independence principle",
  lede: "Operators should not be the only ones attesting their own payment endpoints.",
  tone: "raised",
  body: html`${ctx.diagram({
    svg: INDEPENDENCE_SVG,
    svgNarrow: INDEPENDENCE_SVG_NARROW,
    label: "Independent assurance flow. Settlens sends an unauthenticated GET request, without payment, to the operator's endpoint or facilitator; the operator answers 402 with PAYMENT-REQUIRED. Settlens sends a report and a signed attestation to the relying party, a partner, auditor or agent, which verifies the SHA-256 digest and the ed25519 signature offline.",
    caption: "Settlens observes the endpoint from the outside and hands the relying party evidence it can verify on its own.",
    size: "wide",
  })}
${ctx.featureGrid([
  { icon: "search", title: "Observed, not declared", body: "Findings come from what the endpoint actually returns to an unauthenticated client, not from a questionnaire or the operator's configuration files." },
  { icon: "terminal", title: "Reproducible", body: "A pilot report, the CI gate and the monitor run the same scanner, and the agent preflight reuses its payment-request checks, so a finding means the same thing in each." },
  { icon: "seal", title: "Verifiable offline", body: "Every JSON report carries a SHA-256 integrity block, and an ed25519 attestation binds it to a signer and a time. Verifying needs neither our servers nor our word." },
])}`,
})}
${ctx.section({
  id: "is-and-is-not",
  title: "What Settlens is, and what it is not",
  body: ctx.split({
    main: ctx.prose(html`<h3>Settlens is</h3>
<ul>
<li>A catalog of deterministic <a href="/docs/checks">conformance and security checks</a> for x402 V2 paid resources and facilitators, built on the official <code>@x402/core</code> schema.</li>
<li>A CLI, a GitHub composite Action, a monitor and an evidence signer that run those checks from your machine, your CI or your servers.</li>
<li>Offline verification of captured payment authorizations: EIP-3009 / EIP-712 signer recovery for the EVM <code>exact</code> scheme, and ed25519 checks of every Solana transaction signer.</li>
<li>An <a href="/mcp">MCP server</a> that lets an AI agent check a payment request before it pays, and free <a href="/tools">browser tools</a> that run the same offline checks.</li>
<li>Independent assessments, delivered as reports and signed evidence.</li>
</ul>`),
    aside: ctx.prose(html`<h3>Settlens is not</h3>
<ul>
<li>A blockchain, a token or a wallet. There is no Settlens token.</li>
<li>A custodian or a payment processor. It never holds your keys or funds and never calls a facilitator's <code>/settle</code>.</li>
<li>A facilitator. It checks facilitators; it does not verify payments on-chain or settle them for you.</li>
<li>A certification body. A report is evidence of observed behavior, not a certificate or legal advice.</li>
<li>Open source or on npm. The code is in a source repository, available to pilot participants.</li>
</ul>`),
  }),
})}
${ctx.section({
  id: "founder",
  title: "A note from the founder",
  tone: "raised",
  width: "narrow",
  body: html`${ctx.prose(html`<p>I am Alessandro Gagliardi, the founder of Settlens, and I build it from France.</p>
<p>Agents can now pay for an API in a single HTTP exchange, with no human reading the price. When the only evidence that such an endpoint behaves correctly is its operator's own word, everyone downstream has to take it on trust. I think a payment endpoint deserves the same treatment as any other security boundary: an outside test, a written result and evidence that a third party can check without trusting the tester either.</p>
<p>So Settlens is built around a few rules I do not bend. It is passive by default. It never pays, never signs a payment and never holds your keys or funds. The one active test, an intentionally invalid signature, runs only with the owner's written authorization. And every claim on this site has to match what the code does; the <a href="/changelog">changelog</a> lists what has actually shipped.</p>
<p>If you run x402 endpoints, operate a facilitator or build agents that pay, I would like to hear what you need checked. Write to me at ${mail}.</p>
<p>Alessandro Gagliardi</p>`)}`,
})}
${ctx.section({
  id: "milestones",
  title: "Milestones",
  lede: html`Read from the project <a href="/changelog">changelog</a> at build time. The current CLI version is ${VERSION}.`,
  body: ctx.steps([
    ...[...RELEASES].reverse().map((entry) => ({
      title: html`Version ${entry.version}${entry.date ? html` · <time datetime="${entry.date}">${ctx.formatDate(entry.date)}</time>` : ""}`,
      body: html`<p>${milestone(entry)}</p>`,
    })),
  ]),
})}
${ctx.section({
  id: "company",
  title: "Company details",
  tone: "raised",
  width: "narrow",
  body: html`${ctx.keyValues([
    { term: "Publisher", value: html`${legal.publisher}, sole proprietor (<span lang="fr">Entrepreneur individuel</span>, EI)` },
    { term: "Trade name", value: legal.tradeName },
    { term: "Offering", value: legal.offering },
    { term: "Location", value: `${legal.address.city}, ${legal.address.country}` },
    { term: "SIREN", value: legal.siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3") },
    { term: "Email", value: mail },
  ])}
<p>Full details are in the <a href="/legal">legal notice</a>. How the site and the tools handle data is on the <a href="/security">security page</a> and in the <a href="/privacy">privacy notice</a>.</p>`,
})}
${ctx.cta({
  title: "Start with one endpoint",
  body: "A pilot usually starts with one paid endpoint, facilitator or agent flow and ends with a report and a signed attestation you can verify yourself.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See pricing", href: "/pricing" },
  ],
})}`;
}
