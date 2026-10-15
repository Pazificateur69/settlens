import { VERSION } from "../../../src/constants.js";

// Single source of truth for site-wide data. Every route listed in nav/footer must
// have a page module before a strict build passes (see site/src/README.md).

export const site = Object.freeze({
  name: "Settlens",
  origin: "https://settlens.com",
  version: VERSION,
  lang: "en",
  locale: "en_US",
  email: "contact@settlens.com",
  themeColor: "#07111f",
  tagline: "Independent security and conformance assurance for x402 agentic payments.",
  description:
    "Settlens checks x402 paid endpoints and facilitators for protocol conformance, payment binding and drift, verifies payment authorizations offline, and signs the evidence.",
  ogImage: Object.freeze({
    path: "/assets/og-image.jpg",
    width: 1512,
    height: 794,
    alt: "Settlens: security and conformance assurance for x402 agentic payments",
  }),
  legal: Object.freeze({
    publisher: "Alessandro Gagliardi",
    status: "Entrepreneur individuel (EI)",
    tradeName: "Pazent",
    offering: "Settlens",
    publicationDirector: "Alessandro Gagliardi",
    address: Object.freeze({
      street: "135 montée de Fonas",
      postalCode: "69400",
      city: "Porte des Pierres Dorées",
      country: "France",
      countryCode: "FR",
    }),
    siren: "988414348",
    siret: "98841434800017",
    phone: "06 68 75 45 70",
    phoneIntl: "+33 6 68 75 45 70",
    phoneHref: "tel:+33668754570",
    email: "contact@settlens.com",
    host: Object.freeze({
      name: "IONOS SE",
      street: "Elgendorfer Str. 57",
      postalCode: "56410",
      city: "Montabaur",
      country: "Germany",
      // As published on the previous settlens.com legal notice.
      phone: "01 76 54 09 41",
      phoneIntl: "+33 1 76 54 09 41",
      phoneHref: "tel:+33176540941",
    }),
  }),
  nav: Object.freeze([
    { label: "Product", path: "/product" },
    { label: "MCP", path: "/mcp" },
    { label: "Use cases", path: "/use-cases" },
    { label: "Pricing", path: "/pricing" },
    { label: "Docs", path: "/docs" },
    { label: "Learn", path: "/learn" },
    { label: "Blog", path: "/blog" },
  ]),
  cta: Object.freeze({ label: "Request a pilot", path: "/contact" }),
  footer: Object.freeze([
    {
      title: "Product",
      links: [
        { label: "Overview", path: "/product" },
        { label: "Assess", path: "/product/assess" },
        { label: "CI gate", path: "/product/ci" },
        { label: "Verify", path: "/product/verify" },
        { label: "Monitor", path: "/product/monitor" },
        { label: "Evidence", path: "/product/evidence" },
        { label: "MCP server", path: "/mcp" },
        { label: "Free tools", path: "/tools" },
        { label: "Pricing", path: "/pricing" },
      ],
    },
    {
      title: "Use cases",
      links: [
        { label: "All use cases", path: "/use-cases" },
        { label: "API sellers", path: "/use-cases/api-sellers" },
        { label: "Facilitators", path: "/use-cases/facilitators" },
        { label: "Agent builders", path: "/use-cases/agent-builders" },
        { label: "Security teams", path: "/use-cases/security-teams" },
      ],
    },
    {
      title: "Docs",
      links: [
        { label: "Documentation", path: "/docs" },
        { label: "Quickstart", path: "/docs/quickstart" },
        { label: "CLI", path: "/docs/cli" },
        { label: "Configuration", path: "/docs/configuration" },
        { label: "Checks", path: "/docs/checks" },
        { label: "Reports", path: "/docs/reports" },
        { label: "GitHub Action", path: "/docs/github-action" },
        { label: "Monitor", path: "/docs/monitor" },
        { label: "Evidence", path: "/docs/evidence" },
        { label: "MCP", path: "/docs/mcp" },
        { label: "API", path: "/docs/api" },
        { label: "Methodology", path: "/docs/methodology" },
        { label: "Security model", path: "/docs/security" },
      ],
    },
    {
      title: "Learn",
      links: [
        { label: "Learn x402", path: "/learn" },
        { label: "What is x402?", path: "/learn/what-is-x402" },
        { label: "x402 V2 headers", path: "/learn/x402-v2-headers" },
        { label: "EIP-3009", path: "/learn/eip-3009" },
        { label: "Security checklist", path: "/learn/x402-security-checklist" },
        { label: "V1 to V2 migration", path: "/learn/x402-v1-to-v2-migration" },
        { label: "Agent spending policy", path: "/learn/agent-spending-policy" },
        { label: "Facilitator security", path: "/learn/x402-facilitator-security" },
        { label: "x402 error codes", path: "/learn/x402-error-codes" },
        { label: "Glossary", path: "/learn/glossary" },
      ],
    },
    {
      title: "Blog",
      links: [
        { label: "All articles", path: "/blog" },
        { label: "x402 failure modes", path: "/blog/x402-security-failure-modes" },
        { label: "Testing an x402 endpoint", path: "/blog/how-to-test-x402-endpoint" },
        { label: "What breaks in agentic payments", path: "/blog/agentic-payments-what-breaks" },
        { label: "Verify before paying (MCP)", path: "/blog/mcp-verify-before-paying" },
        { label: "Detecting payment drift", path: "/blog/detecting-x402-payment-drift" },
        { label: "Signed evidence", path: "/blog/signed-evidence-for-payment-assessments" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", path: "/about" },
        { label: "Security", path: "/security" },
        { label: "FAQ", path: "/faq" },
        { label: "Changelog", path: "/changelog" },
        { label: "Contact", path: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Legal notice", path: "/legal" },
        { label: "Privacy", path: "/privacy" },
        { label: "Terms", path: "/terms" },
        { label: "Cookies", path: "/cookies" },
      ],
    },
  ]),
  // Docs sidebar groups and prev/next order. Docs pages not listed here are appended under "More".
  docsNav: Object.freeze([
    { title: "Get started", paths: ["/docs", "/docs/quickstart"] },
    {
      title: "Use Settlens",
      paths: [
        "/docs/cli",
        "/docs/configuration",
        "/docs/github-action",
        "/docs/monitor",
        "/docs/evidence",
        "/docs/mcp",
      ],
    },
    { title: "Reference", paths: ["/docs/checks", "/docs/reports", "/docs/api"] },
    { title: "Assurance", paths: ["/docs/methodology", "/docs/security"] },
  ]),
});

/** Every route the nav, footer and docs sidebar promise. A strict build requires a page for each. */
export const declaredRoutes = Object.freeze(
  [
    "/",
    ...site.nav.map((item) => item.path),
    site.cta.path,
    ...site.footer.flatMap((column) => column.links.map((link) => link.path)),
    ...site.docsNav.flatMap((group) => group.paths),
  ].filter((path, index, all) => all.indexOf(path) === index),
);
