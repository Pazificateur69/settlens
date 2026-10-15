// /learn: hub of the x402 learning guides. The reading path links every guide (no separate card
// grid, which listed the same guides twice); it and the ItemList JSON-LD reuse the guides' own meta.

import { SOURCES, ifPage } from "./_shared.js";
import { meta as spending } from "./agent-spending-policy.js";
import { meta as eip3009 } from "./eip-3009.js";
import { meta as glossary } from "./glossary.js";
import { meta as errorCodes } from "./x402-error-codes.js";
import { meta as facilitator } from "./x402-facilitator-security.js";
import { meta as headers } from "./x402-v2-headers.js";
import { meta as migration } from "./x402-v1-to-v2-migration.js";
import { meta as checklist } from "./x402-security-checklist.js";
import { meta as whatIs } from "./what-is-x402.js";

const PATH = [whatIs, headers, migration, eip3009, checklist, spending, facilitator, errorCodes, glossary];

export const meta = {
  path: "/learn",
  title: "Learn x402: agentic payment security guides",
  label: "Learn",
  description:
    "How x402 agentic payments work and how to secure them: V2 headers, V1 migration, EIP-3009, agent spending policies, facilitator security and error codes.",
  summary:
    "Settlens' x402 guides explain how agentic payments over HTTP 402 work and how to secure them: the protocol and its V2 headers, migrating from V1, EIP-3009 signatures, a security checklist, agent spending policies, facilitator security, error codes and a glossary, each citing the specifications.",
  sources: [SOURCES.x402, SOURCES.x402Http, SOURCES.eip3009],
  section: "learn",
  order: 0,
  schemaType: "CollectionPage",
  lastmod: "2026-10-13",
  changefreq: "monthly",
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Learn", path: "/learn" },
  ],
  jsonLd: {
    "@type": "ItemList",
    "@id": "https://settlens.com/learn#guides",
    name: "x402 learning guides",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: PATH.map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: guide.heading ?? guide.title,
      url: `https://settlens.com${guide.path}`,
    })),
  },
};

const WHY = {
  [whatIs.path]: "The roles, the 402 handshake step by step, payment flows, schemes, CAIP-2 networks and how V2 differs from V1.",
  [headers.path]: "Every field of PAYMENT-REQUIRED, PAYMENT-SIGNATURE and PAYMENT-RESPONSE, with decoded examples and the validation mistakes that matter.",
  [eip3009.path]: "How the payer's signature is built and bound to the token, chain, recipient and amount, and what only the chain can confirm.",
  [migration.path]: "What changed between V1 and V2 on the wire, the steps for servers, clients and facilitators, and how to confirm a migration shipped.",
  [checklist.path]: "Controls for resource servers, facilitators and agents, mapped to the Settlens checks that test them where one exists.",
  [spending.path]: "The limits an agent should check before it signs, how they turn into pay, review or do_not_pay, and what a per-request policy cannot cover.",
  [facilitator.path]: "How /verify, /settle and /supported work, the ways they fail, and what an outside test can and cannot prove.",
  [errorCodes.path]: "Every error code of the V2 specification, with the fix and the Settlens check that detects the cause where one exists.",
  [glossary.path]: "Keep it open as a reference while you read the others.",
};

// Hero map of the three x402 roles (no Settlens in the protocol drawing). Lifelines: client, resource, facilitator.
const [C, R, F] = [70, 272, 414];
function arrow(from, to, y, label, { tone = "", small = false } = {}) {
  const right = to > from;
  const end = right ? to - 4 : to + 4;
  const head = right ? `M${to - 10} ${y - 6}l8 6-8 6` : `M${to + 10} ${y - 6}l-8 6 8 6`;
  const cls = (base) => (tone ? `${base} ${base}--${tone}` : base);
  const labelCls = ["d-label", tone === "accent" && "d-label--accent", small && "d-label--sm"].filter(Boolean).join(" ");
  return `<path class="${cls("d-msg")}" d="M${from} ${y}H${end}"/><path class="${cls("d-head")}" d="${head}"/>
  <text class="${labelCls}" x="${(from + to) / 2}" y="${y - 9}" text-anchor="middle">${label}</text>`;
}
const ROLES_SVG = `<svg viewBox="0 0 480 300" width="480" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="4" y="12" width="132" height="40" rx="10"/>
  <rect class="d-node d-node--accent" x="202" y="12" width="140" height="40" rx="10"/>
  <rect class="d-node" x="352" y="12" width="124" height="40" rx="10"/>
  <text class="d-title" x="${C}" y="37" text-anchor="middle">Client or agent</text>
  <text class="d-title" x="${R}" y="37" text-anchor="middle">Resource server</text>
  <text class="d-title" x="${F}" y="37" text-anchor="middle">Facilitator</text>
  <path class="d-life" d="M${C} 52v240M${R} 52v240M${F} 52v240"/>
  ${arrow(C, R, 88, "GET /resource")}
  ${arrow(R, C, 126, "402 + PAYMENT-REQUIRED", { tone: "accent" })}
  ${arrow(C, R, 164, "retry + PAYMENT-SIGNATURE", { small: true })}
  ${arrow(R, F, 202, "POST /verify")}
  ${arrow(R, F, 240, "POST /settle")}
  ${arrow(R, C, 278, "200 + PAYMENT-RESPONSE", { tone: "accent" })}
</svg>`;
// Stacked version below 40rem: one row per message, in the same order.
const ROWS = [
  ["Client or agent", "Resource server", "right", "GET /resource", ""],
  ["Client or agent", "Resource server", "left", "402 + PAYMENT-REQUIRED", "accent"],
  ["Client or agent", "Resource server", "right", "retry + PAYMENT-SIGNATURE", ""],
  ["Resource server", "Facilitator", "right", "POST /verify", ""],
  ["Resource server", "Facilitator", "right", "POST /settle", ""],
  ["Client or agent", "Resource server", "left", "200 + PAYMENT-RESPONSE", "accent"],
];
const ROLES_SVG_NARROW = `<svg viewBox="0 0 320 476" width="320" height="476" xmlns="http://www.w3.org/2000/svg">
  ${ROWS.map(([left, right, dir, label, tone], index) => {
    const y = 12 + index * 78;
    const msg = tone ? "d-msg d-msg--accent" : "d-msg";
    const headCls = tone ? "d-head d-head--accent" : "d-head";
    const path = dir === "right" ? `<path class="${msg}" d="M146 ${y + 18}h22"/><path class="${headCls}" d="M164 ${y + 12}l8 6-8 6"/>` : `<path class="${msg}" d="M174 ${y + 18}h-22"/><path class="${headCls}" d="M156 ${y + 12}l-8 6 8 6"/>`;
    return `<rect class="d-node" x="4" y="${y}" width="140" height="36" rx="10"/>
  <rect class="d-node" x="176" y="${y}" width="140" height="36" rx="10"/>
  <text class="d-title" x="74" y="${y + 23}" text-anchor="middle">${left}</text>
  <text class="d-title" x="246" y="${y + 23}" text-anchor="middle">${right}</text>
  ${path}
  <text class="d-label${tone ? " d-label--accent" : ""}" x="160" y="${y + 58}" text-anchor="middle">${label}</text>`;
  }).join("\n  ")}
</svg>`;

export default function render(ctx) {
  const { html, hero, section, cards, cta, diagram } = ctx;
  return html`${hero({
    title: "Learn x402",
    lede: "x402 lets software pay for an HTTP resource over HTTP itself: the server answers 402 with machine-readable terms and the client retries with a signed payment. These guides explain how the protocol works, field by field, and what has to hold for an agent to pay safely, with links to the specifications they paraphrase.",
    actions: [
      { label: "Start with What is x402?", href: whatIs.path, icon: "arrow-right" },
      { label: "Open the security checklist", href: checklist.path },
    ],
    aside: diagram({
      svg: ROLES_SVG,
      svgNarrow: ROLES_SVG_NARROW,
      label: "Diagram of the x402 roles: the client requests a resource and receives 402 with PAYMENT-REQUIRED, retries with PAYMENT-SIGNATURE, the resource server calls the facilitator's /verify and /settle, then returns 200 with PAYMENT-RESPONSE.",
      caption: "The three x402 roles and the messages between them, in order.",
    }),
  })}
${section({
  id: "reading-path",
  title: "Recommended reading path",
  lede: "Read in this order if x402 is new to you. Each guide builds on the previous one.",
  body: cards(
    PATH.map((guide, index) => ({ icon: guide.icon, title: `${index + 1}. ${guide.label}`, body: WHY[guide.path], href: guide.path })),
    { columns: 3 },
  ),
})}
${section({
  id: "practice",
  title: "Put it into practice",
  tone: "raised",
  lede: "The guides paraphrase the specifications listed under Sources: when they disagree with a guide, the specification wins. To run the same checks:",
  body: cards(
    [
      { icon: "search", title: "Assess an endpoint", body: "Run the passive checks from these guides against a paid resource, without paying.", href: "/product/assess" },
      { icon: "signature", title: "Verify a signature", body: "Recover the EIP-3009 signer and check its binding offline, with no RPC or key.", href: "/product/verify" },
      { icon: "chip", title: "Check before paying", body: "Give an AI agent the same checks through the Settlens MCP server.", href: "/mcp" },
      { icon: "terminal", title: "Quickstart", body: "Install the CLI as a pilot participant and run your first scan.", href: "/docs/quickstart" },
    ],
    { columns: 4 },
  ),
  actions: ifPage(ctx, "/tools", [{ label: "Try the free x402 tools", href: "/tools" }]) || undefined,
})}
${cta({
  title: "Check your own x402 endpoints",
  body: "A scoped pilot on one paid endpoint or facilitator, with a report your engineers and partners can verify.",
  actions: [
    { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
    { label: "Explore the MCP server", href: "/mcp" },
  ],
})}`;
}
