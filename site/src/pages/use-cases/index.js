// Use-case hub: lists the persona pages from data (ctx.children) and maps each team to the
// Settlens stages it relies on. Claims follow the capability truth table in site/src/README.md.

export const meta = {
  path: "/use-cases",
  title: "x402 payment security use cases",
  description:
    "How API sellers, facilitator operators, AI agent builders and security teams use Settlens to check, gate, monitor and prove x402 payment behavior.",
  section: "use-cases",
  schemaType: "CollectionPage",
  label: "Use cases",
  lastmod: "2026-10-13",
  summary:
    "Settlens serves four roles around an x402 payment: API sellers scan, gate and monitor their paid endpoints; facilitator operators test /supported and /verify; agent builders check each 402 against a spending policy before paying; security teams get reports and signed evidence they verify offline.",
  sources: [
    { title: "x402 protocol specification, version 2 (§2 core payment flow, §7 facilitator interface)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
  ],
  changefreq: "monthly",
  priority: 0.8,
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Use cases", path: "/use-cases" },
  ],
  jsonLd: {
    "@type": "ItemList",
    name: "Settlens use cases",
    itemListElement: [
      ["API sellers", "/use-cases/api-sellers"],
      ["Facilitators", "/use-cases/facilitators"],
      ["Agent builders", "/use-cases/agent-builders"],
      ["Security teams", "/use-cases/security-teams"],
    ].map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, url: `https://settlens.com${path}` })),
  },
};

const MAP_SVG = `<svg viewBox="0 0 720 352" width="720" height="352" xmlns="http://www.w3.org/2000/svg">
  <title>Where each team sits in an x402 payment</title>
  <desc>Three parties take part in an x402 payment: the AI agent, the paid API and the facilitator. Settlens offers each one a stage, and security teams receive the resulting reports and signed evidence.</desc>
  <rect class="d-node" x="16" y="24" width="170" height="60" rx="10"/>
  <rect class="d-node" x="275" y="24" width="170" height="60" rx="10"/>
  <rect class="d-node" x="534" y="24" width="170" height="60" rx="10"/>
  <text class="d-title" x="101" y="50" text-anchor="middle">AI agent</text>
  <text class="d-title" x="360" y="50" text-anchor="middle">Paid API</text>
  <text class="d-title" x="619" y="50" text-anchor="middle">Facilitator</text>
  <text class="d-note" x="101" y="70" text-anchor="middle">Agent builders</text>
  <text class="d-note" x="360" y="70" text-anchor="middle">API sellers</text>
  <text class="d-note" x="619" y="70" text-anchor="middle">Facilitators</text>
  <path class="d-msg" d="M186 54h85"/><path class="d-head" d="M194 48l-8 6 8 6"/><path class="d-head" d="M263 48l8 6-8 6"/>
  <text class="d-label" x="230" y="44" text-anchor="middle">HTTP 402</text>
  <text class="d-label" x="230" y="74" text-anchor="middle">signature</text>
  <path class="d-msg" d="M445 54h85"/><path class="d-head" d="M522 48l8 6-8 6"/>
  <text class="d-label" x="489" y="44" text-anchor="middle">/verify</text>
  <text class="d-label" x="489" y="74" text-anchor="middle">/settle</text>
  <rect class="d-zone" x="8" y="118" width="704" height="120" rx="10"/>
  <path class="d-life" d="M101 84v44M360 84v44M619 84v44"/>
  <text class="d-note" x="230" y="110" text-anchor="middle">Settlens stage</text>
  <rect class="d-node d-node--accent" x="16" y="128" width="170" height="100" rx="10"/>
  <rect class="d-node d-node--accent" x="275" y="128" width="170" height="100" rx="10"/>
  <rect class="d-node d-node--accent" x="534" y="128" width="170" height="100" rx="10"/>
  <text class="d-title" x="101" y="156" text-anchor="middle">MCP preflight</text>
  <text class="d-text" x="101" y="180" text-anchor="middle">Checks the 402 terms</text>
  <text class="d-text" x="101" y="200" text-anchor="middle">before the agent pays</text>
  <text class="d-title" x="360" y="156" text-anchor="middle">Scan, CI, monitor</text>
  <text class="d-text" x="360" y="180" text-anchor="middle">Passive by default,</text>
  <text class="d-text" x="360" y="200" text-anchor="middle">authorized probe</text>
  <text class="d-title" x="619" y="156" text-anchor="middle">Facilitator scan</text>
  <text class="d-label" x="619" y="180" text-anchor="middle">GET /supported</text>
  <text class="d-text" x="619" y="200" text-anchor="middle">invalid /verify probe</text>
  <path class="d-msg d-msg--accent" d="M360 228v38"/><path class="d-head d-head--accent" d="M354 258l6 8 6-8"/>
  <path class="d-msg d-msg--accent" d="M619 228v38"/><path class="d-head d-head--accent" d="M613 258l6 8 6-8"/>
  <rect class="d-node" x="16" y="270" width="688" height="66" rx="10"/>
  <text class="d-title" x="360" y="296" text-anchor="middle">Security teams</text>
  <text class="d-text" x="360" y="320" text-anchor="middle">JSON, HTML and SARIF reports · ed25519-signed evidence, verifiable offline</text>
</svg>`;

// Editorial mapping of roles to stages; every stage named here exists in the CLI or the MCP server.
const STAGE_ROWS = [
  ["Passive scan of a paid resource", "Primary", "Optional", "Optional", "Primary"],
  ["Authorized active probe", "Primary", "Primary", "Not available over MCP", "Primary"],
  ["Facilitator /supported scan", "Optional", "Primary", "Not used", "Optional"],
  ["Offline signature verification", "Optional", "Optional", "Optional", "Optional"],
  ["MCP preflight before paying", "Optional", "Not used", "Primary", "Not used"],
  ["CI gate with SARIF", "Primary", "Primary", "Optional", "Primary"],
  ["Monitor against a baseline", "Primary", "Optional", "Optional", "Optional"],
  ["Signed evidence", "Optional", "Optional", "Not used", "Primary"],
];

export default function render(ctx) {
  const { html } = ctx;
  return html`${ctx.hero({
    title: "Settlens use cases for x402 payments",
    lede: "An x402 payment involves a paying agent, a paid API and a facilitator. Each one fails in its own way and each needs different evidence. Pick your role to see which checks apply, how to run them and what you get.",
    actions: [
      { label: "Find your role", href: "#roles", icon: "arrow-right" },
      { label: "Request a pilot", href: "/contact" },
    ],
  })}
${ctx.section({
  id: "roles",
  title: "Choose your role",
  lede: "Each page lists the failure modes Settlens checks for that role, the commands or configuration to run, an example you can adapt and the limits you should know about.",
  body: ctx.cards(ctx.children("/use-cases").map(ctx.toCard), { columns: 2 }),
})}
${ctx.section({
  id: "map",
  title: "Where each team sits in the payment",
  lede: "Settlens never joins the payment itself. It observes the challenge, checks the facilitator's capabilities and, with explicit authorization, sends one invalid signature that must be refused.",
  tone: "raised",
  body: ctx.diagram({
    svg: MAP_SVG,
    label: "Map of an x402 payment. The AI agent receives an HTTP 402 challenge from the paid API and retries with a signature; the paid API calls the facilitator's /verify and /settle endpoints. Settlens stages sit under each party: MCP preflight for the agent, scan, CI and monitor for the paid API, facilitator scan for the facilitator. Reports and signed evidence from the scans go to security teams.",
    caption: "Settlens checks each party from outside. It never calls /settle and never holds a wallet or payment key.",
    size: "wide",
  }),
})}
${ctx.section({
  id: "stages",
  title: "Which stage each team relies on",
  lede: "Every stage draws on one check catalog, so a check id names the same property in CI, in a pilot report and in a preflight answer. One rule differs: a scan requires every advertised option to fit your policy, while the agent preflight needs one acceptable option.",
  body: html`${ctx.table({
    caption: "Settlens stages by role",
    head: ["Stage", "API sellers", "Facilitators", "Agent builders", "Security teams"],
    rows: STAGE_ROWS,
    rowHeaders: true,
  })}
${ctx.prose(html`<p>Every check is documented in the <a href="/docs/checks">check reference</a>, with what it verifies, why it matters and how to fix it. The <a href="/docs/methodology">methodology</a> explains what a pass, fail, warning or skip proves.</p>`)}`,
})}
${ctx.section({
  id: "for-every-team",
  title: "What holds for every team",
  tone: "raised",
  body: ctx.featureGrid(
    [
      { icon: "search", title: "Passive by default", body: "A scan sends ordinary requests without any payment header, follows no redirect and refuses a user-supplied PAYMENT-SIGNATURE.", href: "/product/assess", linkLabel: "How a scan works" },
      { icon: "lock", title: "No wallet, no custody, no settlement", body: "Settlens never needs a wallet or a payment key, never calls /settle and never moves funds. The only key it uses is the optional ed25519 key that signs evidence. It is not a blockchain and has no token.", href: "/docs/security", linkLabel: "Read the security model" },
      { icon: "seal", title: "Evidence you can re-check", body: "JSON reports carry a deterministic SHA-256 digest, and an ed25519 attestation binds that digest to a signing key and a timestamp.", href: "/product/evidence", linkLabel: "See signed evidence" },
      { icon: "check-circle", title: "Official x402 parsing", body: "PaymentRequired objects are validated with the pinned official @x402/core 2.28.0 SDK, plus the x402 V2 core shape and per-requirement rules.", href: "/learn/what-is-x402", linkLabel: "Learn how x402 works" },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  width: "narrow",
  body: ctx.callout({
    tone: "note",
    title: "How to get Settlens",
    body: html`<p>The code lives in a source repository. Pilot participants receive the CLI (Node.js 20.19 or newer), the GitHub composite Action and the local MCP server. The remote MCP endpoint at <code>https://settlens.com/mcp</code> exposes the offline tools publicly; its network tools need a Settlens API token. See <a href="/pricing">pricing</a> for pilot options.</p>`,
  }),
})}
${ctx.cta({
  title: "Start with one endpoint, facilitator or agent flow",
  body: "A pilot usually starts with one paid endpoint, facilitator or agent flow and ends with a report and a signed attestation you can verify yourself.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Connect the MCP server", href: "/mcp" },
  ],
})}`;
}
