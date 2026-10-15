// /faq: grouped questions with one linkable <h3> per question (a closed accordion would hide the
// answer a link points to). One data array drives the page and the FAQPage JSON-LD in meta.jsonLd.

import { CHECK_CATALOG } from "../../../src/catalog.js";
import { html, stripTags, toHtmlString } from "../lib/html.js";
import { crumbs, MCP_TOOLS } from "./_company.js";

const PAGE_URL = "https://settlens.com/faq";
const code = (text) => html`<code>${text}</code>`;
const toolList = (tools) => html`${tools.map((tool, index) => html`${index ? (index === tools.length - 1 ? " and " : ", ") : ""}${code(tool.name)}`)}`;

const GROUPS = [
  {
    id: "x402-basics",
    title: "x402 basics",
    items: [
      {
        id: "what-is-x402",
        q: "What is x402?",
        a: html`<p>x402 is an open protocol for paying over HTTP. A server answers a request with <code>402 Payment Required</code> and the payment terms in a <code>PAYMENT-REQUIRED</code> header; the client pays by retrying with a <code>PAYMENT-SIGNATURE</code> header; a facilitator verifies and settles the payment, and the server returns the resource. It lets AI agents and other software pay per request without accounts or checkout pages. Read <a href="/learn/what-is-x402">What is x402?</a> for the full flow.</p>`,
      },
      {
        id: "x402-v2-headers",
        q: "Which headers does x402 V2 use?",
        a: html`<p>Three, each carrying Base64-encoded JSON: <code>PAYMENT-REQUIRED</code> (the terms, sent with HTTP 402), <code>PAYMENT-SIGNATURE</code> (the client's payment payload, which replaces the V1 <code>X-PAYMENT</code> header) and <code>PAYMENT-RESPONSE</code> (the settlement result). See <a href="/learn/x402-v2-headers">x402 V2 headers</a>.</p>`,
      },
      {
        id: "what-is-a-facilitator",
        q: "What is a facilitator?",
        a: html`<p>The service that verifies payment authorizations (<code>POST /verify</code>), settles them (<code>POST /settle</code>) and publishes what it supports (<code>GET /supported</code>). A resource server can use a third-party facilitator or run these endpoints itself. Settlens checks facilitators; it is not one. See <a href="/use-cases/facilitators">Settlens for facilitators</a>.</p>`,
      },
      {
        id: "x402-v1",
        q: "Does Settlens support x402 V1?",
        a: html`<p>No, Settlens checks x402 V2 only. A V1 endpoint sends its terms in the JSON body of the 402 response and expects an <code>X-PAYMENT</code> header, so a passive scan fails the <code>transport.payment_required_header</code> check and a V1 payment request fails <code>schema.payment_required</code>. The <a href="/learn/x402-v1-to-v2-migration">V1 to V2 migration guide</a> lists what changes on the wire.</p>`,
      },
    ],
  },
  {
    id: "product",
    title: "Product",
    items: [
      {
        id: "what-does-settlens-check",
        q: "What does Settlens check on an x402 endpoint?",
        a: html`<p>A passive scan checks that an unauthenticated request gets HTTP 402, that <code>PAYMENT-REQUIRED</code> is present and decodes, that the terms pass the official <code>@x402/core</code> schema and the V2 shape, that <code>resource.url</code> matches the URL you tested, that every payment option has a valid scheme, CAIP-2 network, positive atomic amount, asset, recipient and timeout, that options are not duplicated, that the endpoint uses HTTPS and does not redirect, and that identical requests return identical terms. It can also apply your own policy. The <a href="/docs/checks">check reference</a> lists all ${CHECK_CATALOG.length} checks.</p>`,
      },
      {
        id: "passive-vs-active",
        q: "What is the difference between a passive scan and an active probe?",
        a: html`<p>A passive scan, the default, only sends ordinary requests without any payment header. The active probe runs only with <code>--active --authorized --authorization-ref</code>: it sends one intentionally invalid <code>PAYMENT-SIGNATURE</code> and checks that the resource refuses it and that the facilitator's <code>/verify</code> rejects it. Neither calls <code>/settle</code>. See <a href="/product/assess">Assess</a>.</p>`,
      },
      {
        id: "verify-payment",
        q: "Can Settlens verify a payment authorization?",
        a: html`<p>Yes, offline. <code>settlens verify-payment</code> recovers the EIP-3009 / EIP-712 signer for the EVM <code>exact</code> scheme, with the domain rebuilt from the payment requirement, and checks that the recipient, amount and asset are bound and that the check time is strictly inside its validity window. For Solana it verifies the ed25519 signature in every signer slot; the fee payer's slot stays pending until the facilitator signs at settlement. It does not check on-chain balances, nonce use or settlement. See <a href="/product/verify">Verify</a>.</p>`,
      },
      {
        id: "ci-gate",
        q: "How do I use Settlens in CI?",
        a: html`<p>With the GitHub composite Action: it runs the checks from your configuration, fails the job at your <code>fail-on</code> severity, writes JSON, HTML and SARIF reports that your workflow can upload to code scanning, and only sends custom headers to hosts listed in <code>allowed-hosts</code>. See <a href="/docs/github-action">GitHub Action</a>.</p>`,
      },
      {
        id: "monitor",
        q: "What does Settlens Monitor do?",
        a: html`<p><code>settlens monitor</code> compares each passive scan with a stored baseline and alerts on regressions: a check that gets worse (from pass or skip to warn or fail, or from warn to fail), a new check that fails or warns, and a check that disappeared (coverage lost). It exits non-zero at your threshold and can post an alert to a webhook. See <a href="/product/monitor">Monitor</a>.</p>`,
      },
      {
        id: "signed-evidence",
        q: "What is signed evidence?",
        a: html`<p>Every JSON report carries a deterministic SHA-256 integrity digest. <code>settlens evidence attest</code> signs that digest with an ed25519 key, together with a signing identity and a timestamp, and anyone can check the attestation and the report offline with <code>settlens evidence verify</code>. See <a href="/product/evidence">Evidence</a>.</p>`,
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    items: [
      {
        id: "move-funds",
        q: "Does Settlens move funds or call /settle?",
        a: html`<p>No. Settlens never pays, never settles and never calls a facilitator's <code>/settle</code>. Every report records zero settlement calls. The <a href="/security">security page</a> lists everything Settlens never does.</p>`,
      },
      {
        id: "private-key",
        q: "Does Settlens need my wallet or private key?",
        a: html`<p>No. No Settlens tool needs a wallet, a seed phrase or the private key of a paying account. The only key involved is a separate ed25519 evidence key, held by whoever signs the report (you, or Settlens for a pilot), and Settlens uses it only to sign report attestations.</p>`,
      },
      {
        id: "scan-third-party",
        q: "Can I scan an endpoint I do not own?",
        a: html`<p>Only within your authorization. Checking a payment request you received as a paying client is ordinary client behavior. The active probe always requires the owner's written authorization and a reference passed to <code>--authorization-ref</code>; the CLI refuses to run it otherwise. See the <a href="/terms#authorized-use">terms of use</a>.</p>`,
      },
      {
        id: "certification",
        q: "Is a passing report a certification?",
        a: html`<p>No. A report is evidence of the behavior Settlens observed at a point in time, with an integrity digest and optionally a signature. It is not a certification, a guarantee of security or legal advice. The <a href="/docs/methodology">methodology</a> explains what each result proves.</p>`,
      },
    ],
  },
  {
    id: "mcp-and-agents",
    title: "MCP and AI agents",
    items: [
      {
        id: "what-does-the-mcp-server-do",
        q: "What does the Settlens MCP server do?",
        a: html`<p>It lets an AI agent check a payment request before paying. On every HTTP 402, the agent calls <code>evaluate_payment_requirements</code> with the <code>PAYMENT-REQUIRED</code> value, the URL it requested and its spending policy, and gets <code>pay</code>, <code>review</code> or <code>do_not_pay</code> with the reasons and the payment options it may use. No tool pays, signs or needs a key. See the <a href="/mcp">MCP server</a>.</p>`,
      },
      {
        id: "why-review",
        q: "Why does a valid payment request return review instead of pay?",
        a: html`<p>The decision is <code>pay</code> only when no protocol check fails or warns, at least one payment option satisfies every constraint of your policy, and the policy bounds the recipient (<code>pay_to</code>), the asset (<code>assets</code>), the network (<code>networks</code>) and the amount (<code>max_amount</code>). Without <code>assets</code>, an amount ceiling means little, because tokens use different numbers of decimals; without <code>networks</code>, the same token address can point to another contract on another chain. Set all four and the same request can return <code>pay</code>.</p>`,
      },
      {
        id: "remote-endpoint-tools",
        q: "Which tools does the remote MCP endpoint expose?",
        a: html`<p>Without a token, <code>https://settlens.com/mcp</code> lists ${toolList(MCP_TOOLS.public)}. The passive network tools ${toolList(MCP_TOOLS.network)} also run there with a Settlens API token, and always in the local server. Requests are limited to 60 per minute per IP address by default.</p>`,
      },
      {
        id: "mcp-clients",
        q: "Which MCP clients can use Settlens?",
        a: html`<p>Any MCP client, including Claude Desktop and Claude Code; browser-based clients must run on an allowed origin (settlens.com or claude.ai). Locally, <code>settlens mcp</code> speaks MCP over stdio; remotely, the endpoint uses Streamable HTTP in stateless JSON mode and supports protocol revisions 2025-06-18, 2025-03-26 and 2024-11-05. See the <a href="/docs/mcp">MCP documentation</a>.</p>`,
      },
      {
        id: "daily-budget",
        q: "Does the MCP preflight enforce a daily budget?",
        a: html`<p>No. <code>evaluate_payment_requirements</code> applies a per-request policy: allowed recipients (<code>pay_to</code>), assets, networks, a maximum amount per payment (<code>max_amount</code>) and optionally schemes. It does not track spending across calls, so daily or cumulative budgets must be enforced by the wallet or the agent runtime. See <a href="/learn/agent-spending-policy">agent spending policy</a>.</p>`,
      },
      {
        id: "x402-over-mcp",
        q: "Can Settlens check x402 payments carried over MCP?",
        a: html`<p>No. Settlens evaluates x402 payment requests for HTTP resources. In the x402 MCP transport, a paid tool returns its terms in an error tool result and the client sends the payment in <code>_meta["x402/payment"]</code>. Such a request names an <code>mcp://</code> resource, which fails the <code>schema.payment_required</code> check, so the decision is <code>do_not_pay</code>.</p>`,
      },
    ],
  },
  {
    id: "free-tools",
    title: "Free tools",
    items: [
      {
        id: "free-x402-checker",
        q: "Is there a free x402 checker?",
        a: html`<p>Yes. The <a href="/tools/x402-checker">x402 payment request checker</a> runs in your browser, free and without an account. Paste a <code>PAYMENT-REQUIRED</code> value and, optionally, the URL you requested and your spending policy: it shows the <code>pay</code>, <code>review</code> or <code>do_not_pay</code> decision with every check. It calls <code>evaluate_payment_requirements</code> on <code>https://settlens.com/mcp</code>, the tool AI agents use, and never pays.</p>`,
      },
      {
        id: "free-eip-3009-verifier",
        q: "Can I verify an EIP-3009 payment signature in the browser?",
        a: html`<p>Yes. The <a href="/tools/eip-3009-verifier">EIP-3009 signature verifier</a> calls <code>verify_payment_signature</code>: it recovers the EIP-712 signer of an <code>exact</code> EVM payment and checks the recipient, amount, asset and validity window against the payment requirement. It does not check balances, nonce use or settlement. Anyone who holds a signed authorization can submit it on chain until <code>validBefore</code>, so paste expired captures, or check a live one locally with <code>settlens verify-payment</code>.</p>`,
      },
      {
        id: "free-tools-data",
        q: "What happens to what I paste into the free tools?",
        a: html`<p>Your browser sends it to <code>https://settlens.com/mcp</code>, where it is processed to compute the answer and then discarded: it is not stored. No access log is kept; the proxy's error log only records technical problems, such as a request that fails, exceeds a rate limit or is unusually large. Nothing is saved in your browser. Calls are rate limited per IP address, with counters held in memory only. See the <a href="/privacy#mcp-endpoint">privacy notice</a>.</p>`,
      },
    ],
  },
  {
    id: "pricing-and-access",
    title: "Pricing and access",
    items: [
      {
        id: "cost",
        q: "How much does Settlens cost?",
        a: html`<p>Engagements (Pilot, Team and Assurance) are quoted after a call, based on the number of endpoints and facilitators in scope and the cadence. The offline tools of the remote MCP endpoint are free to use. See <a href="/pricing">pricing</a>.</p>`,
      },
      {
        id: "open-source",
        q: "Is Settlens open source or on npm?",
        a: html`<p>No. The code is in a source repository. Pilot participants receive the CLI, which runs on Node.js 20.19 or newer, the GitHub Action and the container image. <a href="/contact">Request a pilot</a> to get access.</p>`,
      },
      {
        id: "token",
        q: "Is there a Settlens token or blockchain?",
        a: html`<p>No. Settlens is not a blockchain, has no token and never custodies funds. It checks the HTTP side of x402 payments and verifies signatures offline.</p>`,
      },
    ],
  },
  {
    id: "data-and-privacy",
    title: "Data and privacy",
    items: [
      {
        id: "data-collected",
        q: "What data does settlens.com collect?",
        a: html`<p>Only what you send through the pilot request form (name, work email, company, message) and technical error-log lines, for example for a request that fails or exceeds a rate limit; no access log of ordinary visits is kept. There are no cookies, analytics or third-party resources. See the <a href="/privacy">privacy notice</a> and the <a href="/cookies">cookie notice</a>.</p>`,
      },
      {
        id: "mcp-storage",
        q: "Does the remote MCP endpoint store my requests?",
        a: html`<p>No. Request content is processed in memory to compute the answer and then discarded, and the per-IP rate-limit counters stay in memory. There is no access log: a call leaves a line, with its IP address, time and path, in the proxy's error log only in exceptional cases such as an error, a rate limit or an unusually large request, as described in the <a href="/privacy#server-logs">privacy notice</a>.</p>`,
      },
      {
        id: "never-send",
        q: "What should I never send to Settlens?",
        a: html`<p>Private keys, seed phrases, third-party API or bearer tokens, <code>PAYMENT-SIGNATURE</code> values that are still valid and customer data. No assessment needs them: your own Settlens API token goes only in the <code>Authorization</code> header, and captured payments can be verified locally with <code>settlens verify-payment</code> or the stdio MCP server. For vulnerability reports, see <a href="/security#disclosure">responsible disclosure</a>.</p>`,
      },
      {
        id: "hosting",
        q: "Where is settlens.com hosted?",
        a: html`<p>On a server rented from IONOS SE, in the European Union. Pilot requests are stored there and requests older than 12 months are deleted automatically; emails to contact@settlens.com are stored by our mailbox provider, Hostinger. See the <a href="/security#infrastructure">infrastructure</a> details.</p>`,
      },
    ],
  },
];

const ITEMS = GROUPS.flatMap((group) => group.items);
const plain = (value) => stripTags(toHtmlString(value));

export const meta = {
  path: "/faq",
  title: "Settlens FAQ: x402 assurance, MCP, safety and data",
  label: "FAQ",
  description:
    "Answers about Settlens: what it checks on x402 endpoints, why it never pays, the MCP server for agents, the free tools, pricing, data and x402 basics.",
  section: "company",
  lastmod: "2026-10-13",
  priority: 0.7,
  breadcrumbs: crumbs("FAQ", "/faq"),
  summary:
    "Settlens checks x402 V2 payment endpoints and facilitators; it never pays, never creates a valid payment and never holds wallet or payment keys. Its free browser tools and remote MCP tools process what you send without storing it; pilots and other engagements are quoted per scope.",
  sources: [
    { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "x402 V1 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v1/http.md", publisher: "x402 Foundation" },
    { title: "x402 V2 MCP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/mcp.md", publisher: "x402 Foundation" },
    { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: "Ethereum Improvement Proposals" },
    { title: "Model Context Protocol specification 2025-06-18: transports", url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/transports", publisher: "Model Context Protocol" },
  ],
  jsonLd: {
    "@type": "FAQPage",
    "@id": `${PAGE_URL}#faq`,
    url: PAGE_URL,
    isPartOf: { "@id": "https://settlens.com/#website" },
    mainEntity: ITEMS.map((item) => ({
      "@type": "Question",
      "@id": `${PAGE_URL}#${item.id}`,
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: plain(item.a) },
    })),
  },
};

export default function render(ctx) {
  return html`${ctx.hero({
    title: "Frequently asked questions",
    lede: `${ITEMS.length} answers about what Settlens checks, why it never pays or signs a payment, the MCP server for agents, the free tools, pricing, data and x402 itself.`,
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Read the docs", href: "/docs" },
    ],
  })}
${ctx.section({
  id: "topics",
  width: "narrow",
  body: html`<nav aria-label="FAQ topics"><p class="actions">${GROUPS.map((group) => ctx.button({ label: `${group.title} (${group.items.length})`, href: `#${group.id}`, variant: "secondary", size: "sm" }))}</p></nav>`,
})}
${GROUPS.map((group, index) =>
  ctx.section({
    id: group.id,
    title: group.title,
    tone: index % 2 ? "default" : "raised",
    width: "narrow",
    body: ctx.prose(html`${group.items.map((item) => html`<h3 id="${item.id}">${item.q}</h3>
${item.a}`)}`),
  }),
)}
${ctx.cta({
  title: "Still have a question?",
  body: "Write to us with your endpoints, facilitator or agent flow in mind. We reply by email.",
  actions: [
    { label: "Contact us", href: "/contact" },
    { label: "See pricing", href: "/pricing" },
  ],
})}`;
}
