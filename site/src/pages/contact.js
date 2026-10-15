// /contact: pilot request form (POST /api/pilot via pilotForm) and what happens next.

import { crumbs } from "./_company.js";

export const meta = {
  path: "/contact",
  title: "Contact Settlens and request a pilot",
  label: "Contact",
  description:
    "Request a Settlens pilot for your x402 endpoints, facilitator or agent payments, or email contact@settlens.com. What to send, what not to send, what comes next.",
  section: "company",
  lastmod: "2026-10-14",
  priority: 0.8,
  breadcrumbs: crumbs("Contact", "/contact"),
  summary:
    "To request a Settlens pilot or a quote, use the form at settlens.com/contact or write to contact@settlens.com with the x402 endpoints, facilitators or agent flows to check. Never include private keys, tokens or real PAYMENT-SIGNATURE values. A person replies by email to scope the work.",
  // The layout's #webpage node becomes the ContactPage; the ContactPoint lives on #organization.
  schemaType: "ContactPage",
};

export default function render(ctx) {
  const { html, site } = ctx;
  const mail = html`<a href="mailto:${site.email}">${site.email}</a>`;
  return html`${ctx.hero({
    title: "Request a pilot or a quote",
    lede: "Start with one x402 V2 HTTP endpoint, a facilitator profile or an agent's spending policy. Tell us what could break; we reply by email to agree the scope, authorization and quote.",
    note: html`Prefer email? Write to ${mail}.`,
  })}
${ctx.section({
  id: "pilot-request",
  title: "Your request",
  lede: "All fields are required. A few lines are enough: we will ask for the details we need.",
  body: ctx.split({
    main: ctx.pilotForm({
      source: "/contact", submitLabel: "Send request",
      messagePlaceholder: "We want to check one x402 V2 endpoint before our next release. We need to detect changes in its payment terms and gate them in CI.",
      messageHint: "Include a public or staging URL if available, the current x402 version, and the payment terms or release risk you want checked. No credentials, private keys, payment signatures or customer data.",
    }),
    aside: html`${ctx.callout({
      tone: "warning",
      title: "Never send secrets",
      body: "Do not include private keys, seed phrases, API or bearer tokens, real PAYMENT-SIGNATURE values or customer data. Scoping a pilot or a quote never needs them, and this form is not a secure channel for them.",
    })}
${ctx.keyValues([
  { term: "Email", value: mail },
  { term: "Languages", value: "English, French" },
  { term: "Security reports", value: html`See <a href="/security#disclosure">responsible disclosure</a>` },
  { term: "Publisher", value: html`<a href="/legal">Legal notice</a>` },
])}`,
  }),
})}
${ctx.section({
  id: "first-pilot",
  title: "What a first endpoint pilot can deliver",
  lede: "Choose the checks with the integration owner. The written scope and quote determine the work; submitting this form does not start a scan or a paid engagement.",
  tone: "raised",
  body: ctx.cards([
    { icon: "file", title: "A baseline you can review", body: "A passive assessment of the HTTP challenge, resource binding and explicit recipient, asset, network and amount policy, with JSON, HTML and SARIF evidence.", href: "/docs/reports" },
    { icon: "activity", title: "Changes against reviewed terms", body: "If monitoring is in scope, explicitly approve a payment reference and review detected changes and incidents. New observations never approve themselves.", href: "/docs/monitor" },
    { icon: "branch", title: "A gate for your next release", body: "Run the agreed checks in CLI/CI and fail on the chosen severity threshold. Validate the behavior with controlled examples before using it in your release process.", href: "/docs/github-action" },
  ], { columns: 3 }),
})}
${ctx.section({
  id: "good-reasons",
  title: "Good reasons to reach out",
  tone: "raised",
  body: ctx.cards(
    [
      { icon: "search", title: "x402 V2 HTTP API", body: "You sell API access over x402 V2 and want an outside check of the HTTP 402 challenge, advertised payment terms and resource binding.", href: "/use-cases/api-sellers" },
      { icon: "layers", title: "Facilitator review", body: "You run a facilitator and want its /supported capabilities checked and proof that /verify rejects an invalid signature.", href: "/use-cases/facilitators" },
      { icon: "chip", title: "AI agent payments", body: "Your agents pay x402 resources and you want a preflight check and a spending policy before any payment is signed.", href: "/use-cases/agent-builders" },
      { icon: "seal", title: "Partner or auditor evidence", body: "You need reports and signed attestations that a partner or auditor can verify offline, without trusting your word.", href: "/product/evidence" },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  id: "what-happens-next",
  title: "What happens next",
  lede: "Every request is read and answered by a person. Here is how a pilot usually starts.",
  body: ctx.steps([
    { title: "We read your request", body: html`<p>The reply comes from ${mail}, usually with a few questions or a proposal for a short call.</p>` },
    { title: "We scope it together", body: "Which paid endpoints, facilitators or agent flows are in scope, the payment terms you expect them to advertise (scheme, network, recipient, asset, maximum amount) and whether an active probe is wanted." },
    {
      title: "You confirm in writing",
      body: html`<p>You receive a written scope and quote. If an active probe is in scope, the endpoint owner's written authorization is required; its reference is passed to <code>--authorization-ref</code> and recorded in the report. Passive scans need no credentials.</p>`,
    },
    { title: "We assess and deliver", body: html`<p>Passive scans, the optional authorized probe, JSON, HTML and SARIF reports and an ed25519-signed attestation you can verify offline. See <a href="/pricing">pricing</a> for the engagement models.</p>` },
  ]),
})}
${ctx.section({
  id: "what-to-include",
  title: "What to include",
  tone: "raised",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li>The URLs of the paid resources to assess. Staging or test-network endpoints are ideal.</li>
<li>The facilitator base URL, if you run one or rely on one.</li>
<li>The terms you expect each endpoint to advertise, so policy findings are meaningful.</li>
<li>Who can authorize an active probe, if you want one.</li>
</ul>
<p>Not sure what to ask for? The <a href="/faq">FAQ</a> answers the common questions, and the <a href="/docs/quickstart">quickstart</a> shows what a scan looks like.</p>`),
})}
${ctx.cta({
  title: "Want to see the checks first?",
  body: "The offline tools of the remote MCP endpoint are free to use: paste a payment request into the browser checker, or point any MCP client at settlens.com/mcp and check a payment request before paying.",
  actions: [
    { label: "Try the x402 checker", href: "/tools/x402-checker" },
    { label: "Explore the MCP server", href: "/mcp" },
  ],
})}`;
}
