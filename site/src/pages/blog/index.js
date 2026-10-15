import { jsonLd } from "../../lib/html.js";

export const meta = {
  path: "/blog",
  title: "Blog: x402 and agentic payment security",
  label: "Blog",
  description:
    "Practical, technically precise writing on x402 and agentic payment security: failure modes, testing guides, drift monitoring and verifiable evidence.",
  section: "blog",
  schemaType: "CollectionPage",
  lastmod: "2026-10-13",
  summary:
    "The Settlens blog covers x402 and agentic payment security in technical detail: the failure modes to test, a step-by-step endpoint testing checklist, payment drift detection, preflight checks before an AI agent pays, and signed evidence that auditors verify offline.",
  changefreq: "weekly",
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
  ],
};

// Fundamentals linked under the post list; the post list itself comes from ctx.posts().
const START_HERE = [
  { icon: "book", title: "What is x402?", body: "How HTTP 402, the PAYMENT-REQUIRED challenge and a facilitator fit together.", href: "/learn/what-is-x402" },
  { icon: "layers", title: "x402 V1 to V2 migration", body: "What changed on the wire between the two protocol versions, header by header.", href: "/learn/x402-v1-to-v2-migration" },
  { icon: "shield-check", title: "x402 security checklist", body: "The properties a paid endpoint and its facilitator should satisfy before agents pay them.", href: "/learn/x402-security-checklist" },
  { icon: "search", title: "x402 payment request checker", body: "Paste a PAYMENT-REQUIRED header and check it against a spending policy from your browser.", href: "/tools/x402-checker" },
];

export default function render(ctx) {
  const { html, hero, section, postList, cards, cta, site } = ctx;
  const posts = ctx.posts();
  const blog = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${site.origin}/blog#blog`,
    name: `${site.name} blog`,
    url: `${site.origin}/blog`,
    description: meta.description,
    inLanguage: site.lang,
    publisher: { "@id": `${site.origin}/#organization` },
    // References only: each post's BlogPosting node is emitted, with its description, on its own page.
    blogPost: posts.map((post) => ({ "@id": `${post.url}#webpage` })),
  };
  return html`${hero({
    title: "x402 and agentic payment security",
    lede: "Practical writing on testing agentic payments: the failure modes that matter, how to check them without holding a payment key, and how to turn results into evidence other people can verify.",
    actions: [
      { label: "Subscribe via RSS", href: "/rss.xml", icon: "rss" },
      { label: "Request a pilot", href: "/contact" },
    ],
    note: `${posts.length} articles, newest first.`,
  })}
${section({
  id: "articles",
  title: "All articles",
  body: postList(posts, { headingLevel: 3, variant: "index" }),
})}
${section({
  id: "fundamentals",
  title: "New to x402?",
  lede: "Start with the protocol, then come back to the articles.",
  tone: "raised",
  body: cards(START_HERE, { columns: 4 }),
})}
${cta({
  title: "See these checks on your own endpoints",
  body: "A scoped pilot assesses one paid endpoint or facilitator and delivers a report your partners can verify offline.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Explore the MCP server", href: "/mcp" },
  ],
})}
${jsonLd(blog)}`;
}
