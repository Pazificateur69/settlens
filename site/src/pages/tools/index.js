// /tools: hub of the free browser tools. The cards and the ItemList JSON-LD come from the tool pages' own
// meta; the MCP tool table comes from pages/mcp.js, which reads the real server at build time.

import { OFFLINE_TOOLS, toolSummary } from "../mcp.js";
import { meta as checker } from "./x402-checker.js";
import { meta as verifier } from "./eip-3009-verifier.js";

const TOOL_PAGES = [checker, verifier];
const BROWSER_PAGE = { evaluate_payment_requirements: checker, verify_payment_signature: verifier };

export const meta = {
  path: "/tools",
  title: "Free x402 tools: checker and EIP-3009 verifier",
  label: "Free tools",
  description:
    "Free browser tools for x402 payments: check a PAYMENT-REQUIRED header against your spending policy and verify an EIP-3009 payment signature, offline.",
  section: "tools",
  order: 0,
  icon: "search",
  schemaType: "CollectionPage",
  lastmod: "2026-10-13",
  changefreq: "monthly",
  summary:
    "Settlens offers two free browser tools for x402: a payment request checker that answers pay, review or do_not_pay for a PAYMENT-REQUIRED header under your spending policy, and an EIP-3009 verifier that recovers the signer of a PAYMENT-SIGNATURE. Both run the public offline tools of the Settlens MCP server.",
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Tools", path: "/tools" },
  ],
  jsonLd: {
    "@type": "ItemList",
    "@id": "https://settlens.com/tools#tools",
    name: "Free x402 tools",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: TOOL_PAGES.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: page.heading ?? page.title,
      url: `https://settlens.com${page.path}`,
    })),
  },
};

export default function render(ctx) {
  const { html } = ctx;
  const code = (text) => html`<code>${text}</code>`;
  const tools = ctx.children("/tools");
  if (tools.length !== TOOL_PAGES.length) throw new Error("pages/tools/index.js: a tool page is missing from TOOL_PAGES (ItemList).");

  return html`${ctx.hero({
    title: "Free x402 tools",
    lede: "Check an x402 payment request before paying, and verify the signature of a payment after the fact. Both work in your browser and call the public Settlens MCP endpoint: no account, no wallet and no payment key.",
    actions: [
      { label: "Check a payment request", href: checker.path, icon: "arrow-right" },
      { label: "Verify a signature", href: verifier.path },
    ],
  })}
${ctx.section({
  id: "tools",
  title: "Tools",
  body: ctx.cards(tools.map(ctx.toCard), { columns: 2 }),
})}
${ctx.section({
  id: "mcp",
  title: "The same tools for agents",
  tone: "raised",
  lede: html`Each page calls one offline tool of ${code("https://settlens.com/mcp")} with what you paste. Agents and scripts call the same tools, and a few more, directly.`,
  body: html`${ctx.table({
    caption: "Offline tools of the Settlens MCP server",
    head: ["Tool", "What it does", "In the browser"],
    rows: OFFLINE_TOOLS.map((tool) => [
      html`<a href="/docs/mcp#${tool.name}"><code>${tool.name}</code></a>`,
      toolSummary(tool),
      BROWSER_PAGE[tool.name] ? html`<a href="${BROWSER_PAGE[tool.name].path}">${BROWSER_PAGE[tool.name].label}</a>` : "MCP only",
    ]),
    rowHeaders: true,
  })}
${ctx.split({
  main: ctx.codeBlock({ lang: "shell", title: "Claude Code", code: "claude mcp add --transport http settlens https://settlens.com/mcp", wrap: true }),
  aside: ctx.prose(html`<p>The <a href="/mcp">MCP server page</a> explains how an agent acts on each decision. Pilot participants also get the <a href="/docs/cli">Settlens CLI</a>, which scans live endpoints and facilitators.</p>`),
})}`,
})}
${ctx.section({
  id: "privacy",
  title: "What happens to what you paste",
  width: "narrow",
  body: ctx.prose(html`<p>Your browser sends it to the Settlens MCP endpoint, which computes the result in memory and keeps no copy of the content. Requests are limited to 60 per minute per IP address. The tools never need a private key or seed phrase: never paste one. See the <a href="/privacy#mcp-endpoint">privacy notice</a>.</p>`),
})}
${ctx.cta({
  title: "Go beyond one request",
  body: "A pilot assesses a paid endpoint or facilitator end to end: passive scan, CI gate, monitoring and signed evidence.",
  actions: [
    { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
    { label: "See the product", href: "/product" },
  ],
})}`;
}
