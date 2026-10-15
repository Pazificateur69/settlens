// /mcp: landing page of the Settlens MCP server. The tool cards, resources, prompt and the example
// call are produced at build time by running the real server (src/mcp.js), so they cannot drift.
// /docs/mcp and /blog/mcp-verify-before-paying import the shared helpers exported here.

import { DEFAULT_REPEAT, OFFICIAL_X402_CORE_VERSION, VERSION } from "../../../src/constants.js";
import { createMcpServer, SUPPORTED_PROTOCOL_VERSIONS } from "../../../src/mcp.js";
import { encodeBase64Json } from "../../../src/protocol.js";

const server = createMcpServer({ mode: "local", allowNetworkTools: true });

/** Sends one JSON-RPC request to the real server: { request, response }. */
export async function exchange(method, params, id = 1) {
  const request = { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
  return { request, response: await server.handle(request) };
}

/** Result of a request that must succeed; any JSON-RPC error fails the build. */
export async function rpcResult(method, params) {
  const { response } = await exchange(method, params);
  if (response.error) throw new Error(`pages/mcp.js: ${method} failed: ${response.error.message}`);
  return response.result;
}

export const DEMO_URL = "http://127.0.0.1:4402/secure";
export const DEMO_OPTION = Object.freeze({
  scheme: "exact",
  network: "eip155:84532",
  amount: "10000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
});
// The PaymentRequired that demo/server.js (npm run demo:server) serves at /secure. demo/ is not
// in the site build image, so it is restated here; the encoded header is byte-identical.
export const DEMO_PAYMENT_REQUIRED = Object.freeze({
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: {
    url: DEMO_URL,
    description: "Settlens local demonstration resource",
    mimeType: "application/json",
    serviceName: "Settlens Demo",
    tags: ["security", "demo"],
  },
  accepts: [DEMO_OPTION],
  extensions: {},
});
export const DEMO_HEADER = encodeBase64Json(DEMO_PAYMENT_REQUIRED);
export const DEMO_POLICY = Object.freeze({
  pay_to: [DEMO_OPTION.payTo],
  assets: [DEMO_OPTION.asset],
  networks: [DEMO_OPTION.network],
  max_amount: "10000",
  schemes: ["exact"],
});

/** Runs evaluate_payment_requirements on the real server: { request, result }. */
export async function evaluate({ policy, resourceUrl = DEMO_URL, paymentRequired = DEMO_HEADER, id = 2 } = {}) {
  const args = {
    payment_required: paymentRequired,
    ...(resourceUrl ? { resource_url: resourceUrl } : {}),
    ...(policy ? { policy } : {}),
  };
  const { request, response } = await exchange("tools/call", { name: "evaluate_payment_requirements", arguments: args }, id);
  if (response.error || response.result.isError) throw new Error(`pages/mcp.js: evaluate_payment_requirements failed: ${JSON.stringify(response)}`);
  return { request, result: response.result.structuredContent };
}

/** Fails the build when the server's answer no longer matches what the page copy says. */
export function expectDecision(example, decision, where) {
  if (example.result.decision !== decision) {
    throw new Error(`${where}: expected decision "${decision}", the server now answers "${example.result.decision}". Update the page copy.`);
  }
  return example;
}

export const INIT = await rpcResult("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "settlens-site-build", version: VERSION },
});
export const TOOLS = (await rpcResult("tools/list")).tools;
export const RESOURCES = (await rpcResult("resources/list")).resources;
export const RESOURCE_TEMPLATES = (await rpcResult("resources/templates/list")).resourceTemplates;
export const PROMPTS = (await rpcResult("prompts/list")).prompts;
export const isNetworkTool = (tool) => tool.annotations?.openWorldHint === true;
export const OFFLINE_TOOLS = TOOLS.filter((tool) => !isNetworkTool(tool));
export const NETWORK_TOOLS = TOOLS.filter(isNetworkTool);
// The page says every tool is read-only; fail the build if a tool stops being annotated that way.
for (const tool of TOOLS) {
  const { readOnlyHint, destructiveHint, idempotentHint } = tool.annotations ?? {};
  if (!readOnlyHint || destructiveHint !== false || !idempotentHint) throw new Error(`pages/mcp.js: ${tool.name} is no longer annotated read-only, non-destructive and idempotent.`);
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const words = (n) => NUMBER_WORDS[n] ?? String(n);
const capitalized = (text) => text[0].toUpperCase() + text.slice(1);

// One-line card summaries. A tool added to src/mcp.js without one falls back to its own description.
const SUMMARIES = {
  evaluate_payment_requirements: `Decides pay, review or do_not_pay for a 402: validates PAYMENT-REQUIRED with @x402/core ${OFFICIAL_X402_CORE_VERSION}, checks the URL binding and applies your policy to each option.`,
  verify_payment_signature: "Recovers the EIP-3009 signer of an exact EVM authorization offline and checks it pays the advertised payTo and amount inside its time window.",
  verify_solana_transaction: "Checks every ed25519 signer slot of a Base64 Solana transaction, legacy or versioned. An empty fee-payer slot is reported as pending, not as a failure.",
  verify_report: "Recomputes the SHA-256 integrity digest of a Settlens JSON report to show whether it was edited after it was generated.",
  verify_attestation: "Verifies the ed25519 signature of a Settlens evidence attestation and, given the report, that it covers that report.",
  list_checks: "Explains every check id: what it verifies, why it matters and how to fix it, optionally filtered by category or mode.",
  // The second sample is sent only after a decodable PAYMENT-REQUIRED (src/scanner.js), hence "up to".
  scan_endpoint: `Sends up to ${words(DEFAULT_REPEAT)} unauthenticated GET requests to a paid resource, runs the passive checks and returns the same pay, review or do_not_pay decision under your policy.`,
  scan_facilitator: "Reads GET /supported from a facilitator and checks its schema, x402 V2 capability, HTTPS, media type and duplicate kinds.",
};
export const toolSummary = (tool) => SUMMARIES[tool.name] ?? tool.description.split(/(?<=\.)\s/)[0];

// The page copy below describes these answers; the build fails if the server disagrees.
const PAY = expectDecision(await evaluate({ policy: DEMO_POLICY }), "pay", "pages/mcp.js (full policy)");
const OVER_BUDGET = expectDecision(await evaluate({ policy: { ...DEMO_POLICY, max_amount: "5000" }, id: 3 }), "do_not_pay", "pages/mcp.js (max_amount 5000)");
const UNBOUNDED = expectDecision(await evaluate({ policy: { max_amount: "10000" }, id: 4 }), "review", "pages/mcp.js (max_amount only)");
const WRONG_URL = expectDecision(await evaluate({ policy: DEMO_POLICY, resourceUrl: "http://127.0.0.1:4402/other", id: 5 }), "do_not_pay", "pages/mcp.js (other resource_url)");

// The PaymentRequired example of the x402 MCP transport (transports-v2/mcp.md), whose resource is mcp://
// (the spec sets no URL scheme; only the example does). Its accepts entry is DEMO_OPTION field for field.
// Settlens evaluates HTTP x402 only.
export const X402_OVER_MCP = expectDecision(
  await evaluate({
    policy: DEMO_POLICY,
    resourceUrl: null,
    paymentRequired: { x402Version: 2, error: "Payment required to access this resource", resource: { url: "mcp://tool/financial_analysis", description: "Advanced financial analysis tool", mimeType: "application/json" }, accepts: [DEMO_OPTION] },
    id: 6,
  }),
  "do_not_pay",
  "pages/mcp.js (x402 over MCP)",
);
if (!X402_OVER_MCP.result.reasons[0]?.startsWith("schema.payment_required:")) throw new Error(`pages/mcp.js: an mcp:// resource is no longer rejected by schema.payment_required: ${X402_OVER_MCP.result.reasons}. Update the copy on /mcp, /docs/mcp and the blog.`);

// Primary sources cited by /mcp, /docs/mcp and /blog/mcp-verify-before-paying (meta.sources).
export const SOURCES = Object.freeze({
  mcpTools: { title: "Model Context Protocol specification 2025-06-18: Tools", url: "https://modelcontextprotocol.io/specification/2025-06-18/server/tools", publisher: "Model Context Protocol" },
  mcpTransports: { title: "Model Context Protocol specification 2025-06-18: Transports", url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/transports", publisher: "Model Context Protocol" },
  x402: { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
  x402Http: { title: "x402 HTTP transport, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
  x402Mcp: { title: "x402 MCP transport, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/mcp.md", publisher: "x402 Foundation" },
});

const ACCESS_NOTE = `${capitalized(words(OFFLINE_TOOLS.length))} offline tools are public; the ${words(NETWORK_TOOLS.length)} network tools need a Settlens API token.`;

export const meta = {
  path: "/mcp",
  title: "x402 MCP server: AI agent payment preflight",
  label: "MCP server",
  description:
    "The Settlens MCP server checks x402 payment requests against your agent's spending policy and answers pay, review or do_not_pay. It never signs or pays.",
  section: "product",
  lastmod: "2026-10-13",
  summary: `The Settlens MCP server is an x402 preflight for AI agents: on each HTTP 402, evaluate_payment_requirements checks the PAYMENT-REQUIRED terms, the requested URL and your spending policy, then answers pay, review or do_not_pay. It never signs or pays. ${capitalized(words(OFFLINE_TOOLS.length))} offline tools are public at https://settlens.com/mcp.`,
  sources: [SOURCES.mcpTools, SOURCES.mcpTransports, SOURCES.x402, SOURCES.x402Http, SOURCES.x402Mcp],
  priority: 0.9,
  icon: "chip",
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "MCP server", path: "/mcp" },
  ],
  jsonLd: {
    "@type": "SoftwareApplication",
    "@id": "https://settlens.com/mcp#software",
    name: "Settlens MCP server",
    url: "https://settlens.com/mcp",
    description:
      "Model Context Protocol server that lets an AI agent check an x402 payment request against its spending policy before paying. Read-only: it never signs, pays or holds keys.",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Local: any platform with Node.js 20.19 or newer. Remote: any MCP client with Streamable HTTP.",
    softwareVersion: VERSION,
    publisher: { "@id": "https://settlens.com/#organization" },
    isPartOf: { "@id": "https://settlens.com/#software" },
    featureList: TOOLS.map((tool) => tool.title),
  },
};

// Agent, merchant and Settlens lifelines; the decision fans out to the three outcomes.
const FLOW_SVG = `<svg viewBox="0 0 720 410" width="720" height="410" xmlns="http://www.w3.org/2000/svg">
  <title>x402 preflight with the Settlens MCP server</title>
  <desc>The agent requests a paid resource, receives HTTP 402 with PAYMENT-REQUIRED, calls evaluate_payment_requirements with the header, the URL and its policy, and receives pay, review or do_not_pay.</desc>
  <rect class="d-zone d-zone--blue" x="24" y="172" width="688" height="122" rx="10"/>
  <rect class="d-node" x="48" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="280" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node d-node--accent" x="512" y="16" width="160" height="44" rx="10"/>
  <text class="d-title" x="128" y="43" text-anchor="middle">AI agent</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="592" y="43" text-anchor="middle">Settlens MCP</text>
  <path class="d-life" d="M128 60v244M360 60v228M592 60v228"/>
  <path class="d-msg" d="M128 104h228"/><path class="d-head" d="M350 98l8 6-8 6"/>
  <text class="d-label" x="244" y="95" text-anchor="middle">GET, no payment</text>
  <path class="d-msg d-msg--accent" d="M360 148H132"/><path class="d-head d-head--accent" d="M138 142l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="244" y="139" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <path class="d-msg" d="M128 204h460"/><path class="d-head" d="M582 198l8 6-8 6"/>
  <text class="d-label d-label--sm" x="476" y="195" text-anchor="middle">evaluate_payment_requirements</text>
  <text class="d-note" x="476" y="226" text-anchor="middle">header, resource_url, policy</text>
  <path class="d-msg d-msg--blue" d="M592 266H132"/><path class="d-head d-head--blue" d="M138 260l-8 6 8 6"/>
  <text class="d-label d-label--sm" x="476" y="257" text-anchor="middle">decision, reasons, acceptable</text>
  <text class="d-note d-note--blue" x="604" y="286">offline, no wallet</text>
  <path class="d-line" d="M128 304h464M360 304v14M592 304v14M128 304v14"/>
  <path class="d-head" d="M122 312l6 8 6-8"/><path class="d-head" d="M354 312l6 8 6-8"/><path class="d-head" d="M586 312l6 8 6-8"/>
  <rect class="d-node d-node--accent" x="24" y="322" width="208" height="72" rx="10"/>
  <rect class="d-node" x="256" y="322" width="208" height="72" rx="10"/>
  <rect class="d-node" x="488" y="322" width="208" height="72" rx="10"/>
  <text class="d-label d-label--accent" x="128" y="346" text-anchor="middle">pay</text>
  <text class="d-text" x="128" y="368" text-anchor="middle">Your wallet pays with</text>
  <text class="d-text" x="128" y="386" text-anchor="middle">an acceptable option</text>
  <text class="d-label" x="360" y="346" text-anchor="middle">review</text>
  <text class="d-text" x="360" y="368" text-anchor="middle">Show the reasons,</text>
  <text class="d-text" x="360" y="386" text-anchor="middle">ask a human first</text>
  <text class="d-label" x="592" y="346" text-anchor="middle">do_not_pay</text>
  <text class="d-text" x="592" y="368" text-anchor="middle">Never pay, report</text>
  <text class="d-text" x="592" y="386" text-anchor="middle">the reasons</text>
</svg>`;

// The same exchange stacked for phones (shown below 40rem instead of FLOW_SVG).
const FLOW_SVG_NARROW = `<svg viewBox="0 0 320 632" width="320" height="632" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-node" x="12" y="16" width="118" height="36" rx="10"/>
  <rect class="d-node" x="190" y="16" width="118" height="36" rx="10"/>
  <text class="d-title" x="71" y="39" text-anchor="middle">AI agent</text>
  <text class="d-title" x="249" y="39" text-anchor="middle">Paid resource</text>
  <path class="d-msg" d="M132 34h48"/><path class="d-head" d="M174 28l8 6-8 6"/>
  <text class="d-label" x="160" y="72" text-anchor="middle">GET, no payment</text>
  <rect class="d-node" x="12" y="88" width="118" height="36" rx="10"/>
  <rect class="d-node" x="190" y="88" width="118" height="36" rx="10"/>
  <text class="d-title" x="71" y="111" text-anchor="middle">AI agent</text>
  <text class="d-title" x="249" y="111" text-anchor="middle">Paid resource</text>
  <path class="d-msg d-msg--accent" d="M188 106h-48"/><path class="d-head d-head--accent" d="M146 100l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="160" y="144" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <rect class="d-zone d-zone--blue" x="4" y="162" width="312" height="194" rx="10"/>
  <rect class="d-node" x="12" y="176" width="118" height="36" rx="10"/>
  <rect class="d-node d-node--accent" x="190" y="176" width="118" height="36" rx="10"/>
  <text class="d-title" x="71" y="199" text-anchor="middle">AI agent</text>
  <text class="d-title" x="249" y="199" text-anchor="middle">Settlens MCP</text>
  <path class="d-msg" d="M132 194h48"/><path class="d-head" d="M174 188l8 6-8 6"/>
  <text class="d-label" x="160" y="232" text-anchor="middle">evaluate_payment_requirements</text>
  <text class="d-note" x="160" y="250" text-anchor="middle">header, resource_url, policy</text>
  <rect class="d-node" x="12" y="266" width="118" height="36" rx="10"/>
  <rect class="d-node d-node--accent" x="190" y="266" width="118" height="36" rx="10"/>
  <text class="d-title" x="71" y="289" text-anchor="middle">AI agent</text>
  <text class="d-title" x="249" y="289" text-anchor="middle">Settlens MCP</text>
  <path class="d-msg d-msg--blue" d="M188 284h-48"/><path class="d-head d-head--blue" d="M146 278l-8 6 8 6"/>
  <text class="d-label" x="160" y="322" text-anchor="middle">decision, reasons, acceptable</text>
  <text class="d-note d-note--blue" x="160" y="340" text-anchor="middle">offline, no wallet</text>
  <path class="d-line" d="M160 358v18"/><path class="d-head" d="M154 370l6 8 6-8"/>
  <rect class="d-node d-node--accent" x="12" y="384" width="296" height="72" rx="10"/>
  <rect class="d-node" x="12" y="464" width="296" height="72" rx="10"/>
  <rect class="d-node" x="12" y="544" width="296" height="72" rx="10"/>
  <text class="d-label d-label--accent" x="160" y="408" text-anchor="middle">pay</text>
  <text class="d-text" x="160" y="430" text-anchor="middle">Your wallet pays with</text>
  <text class="d-text" x="160" y="448" text-anchor="middle">an acceptable option</text>
  <text class="d-label" x="160" y="488" text-anchor="middle">review</text>
  <text class="d-text" x="160" y="510" text-anchor="middle">Show the reasons,</text>
  <text class="d-text" x="160" y="528" text-anchor="middle">ask a human first</text>
  <text class="d-label" x="160" y="568" text-anchor="middle">do_not_pay</text>
  <text class="d-text" x="160" y="590" text-anchor="middle">Never pay, report</text>
  <text class="d-text" x="160" y="608" text-anchor="middle">the reasons</text>
</svg>`;

const json = (value) => JSON.stringify(value, null, 2);
// Same severity tones as the home page check table (index.js).
const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };
const STATUS_TONE = { pass: "success", fail: "danger", warn: "warning", skip: "neutral" };
const DECISION_TONE = { pay: "success", review: "warning", do_not_pay: "danger" };
const decisionOf = ({ result }) => result.decision;
const reasonOf = ({ result }) => (result.reasons.length ? result.reasons.join(" ") : "None: every check passed.");

export default function render(ctx) {
  const { html } = ctx;
  const code = (text) => html`<code>${text}</code>`;
  const toned = (value, tones) => ctx.badge(value, { tone: tones[value] ?? "neutral" });
  const { checks, ...decisionFields } = PAY.result;
  const staticResources = RESOURCES.filter((resource) => !resource.uri.startsWith("settlens://checks/"));
  const checkResourceCount = RESOURCES.length - staticResources.length;

  return html`${ctx.hero({
    title: "Let your AI agent check before it pays",
    lede: "The Settlens MCP server gives an agent a preflight check for x402. On every HTTP 402 it evaluates the payment request against your spending policy and answers pay, review or do_not_pay, with the reasons. It never signs, never pays and needs no wallet or payment key.",
    actions: [
      { label: "Connect the server", href: "#install", icon: "arrow-right" },
      { label: "Try it in your browser", href: "/tools/x402-checker" },
    ],
    note: html`Remote endpoint ${code("https://settlens.com/mcp")}. ${ACCESS_NOTE} <a href="/docs/mcp">Read the MCP reference</a>.`,
    aside: ctx.verdicts({
      title: "evaluate_payment_requirements",
      meta: "One request, three policies",
      items: [
        { decision: "pay", tone: "success", when: "Under a complete policy", detail: PAY.result.summary },
        { decision: "review", tone: "warning", when: "When the policy sets only max_amount", detail: UNBOUNDED.result.reasons[0] },
        { decision: "do_not_pay", tone: "danger", when: "When max_amount is 5000", detail: OVER_BUDGET.result.reasons[0] },
      ],
      caption: html`Real answers to the same demo request, produced by the server when this page was built. <a href="#example">See the call</a>.`,
    }),
  })}
${ctx.section({
  id: "how-it-works",
  title: "How the preflight works",
  lede: "One tool call sits between the 402 and the signature. The agent keeps its wallet; Settlens only reads the terms.",
  body: html`${ctx.diagram({
    svg: FLOW_SVG,
    svgNarrow: FLOW_SVG_NARROW,
    size: "wide",
    label: "Sequence: the AI agent sends a GET without payment to the paid resource, which answers HTTP 402 with a PAYMENT-REQUIRED header. The agent calls evaluate_payment_requirements on the Settlens MCP server with the header, the resource URL and its policy, offline and without a wallet, and receives a decision, reasons and the acceptable options. Three outcomes follow: pay with an acceptable option from the agent's own wallet, review by asking a human first, or do_not_pay.",
    caption: "Settlens sits between the 402 and the payment. It reads the terms; your agent's own wallet tooling makes the payment, only after a pay.",
  })}
${ctx.steps([
  { title: "Request without paying", body: html`<p>The agent requests the resource with no payment header. An x402 V2 resource answers HTTP 402 with a ${code("PAYMENT-REQUIRED")} header: Base64 JSON listing the accepted payment options. See <a href="/learn/x402-v2-headers">x402 V2 headers</a>.</p>` },
  { title: "Call evaluate_payment_requirements", body: html`<p>The agent passes the raw header value, the exact URL it requested as ${code("resource_url")} and its spending policy. The tool makes no network request: it validates the terms with the official ${code(`@x402/core ${OFFICIAL_X402_CORE_VERSION}`)} schema, checks that ${code("resource.url")} matches the URL, validates each option and applies the policy to each option.</p>` },
  { title: "Act on the decision", body: html`<p>${code("do_not_pay")}: stop. ${code("review")}: show the reasons to a human and wait. ${code("pay")}: continue, with one of the options listed in ${code("acceptable")} only.</p>` },
  { title: "Pay with your own tooling", body: "Settlens never signs and never calls /settle. After a pay, the agent's wallet signs the chosen option and retries the request with PAYMENT-SIGNATURE, exactly as it would without Settlens." },
])}`,
})}
${ctx.section({
  id: "decisions",
  title: "Three answers, decided by fixed rules",
  tone: "raised",
  lede: "The model does not judge whether a payment request looks safe. Deterministic rules in the server do, the same way on every call.",
  body: html`${ctx.cards([
    { icon: "check-circle", title: html`<code>pay</code>`, body: "All protocol checks passed, at least one option satisfies the policy, and the policy bounds the recipient, the asset, the network and the amount. Pay only with an option listed in acceptable." },
    { icon: "alert", title: html`<code>review</code>`, body: "A non-blocking issue was found, such as a missing resource_url, or the policy leaves pay_to, assets, networks or max_amount unset. Show the reasons and wait for a human." },
    { icon: "x-circle", title: html`<code>do_not_pay</code>`, body: "A high or critical check failed: a resource binding mismatch, terms the official schema rejects, or no option within the policy. acceptable is empty. Never pay." },
  ], { columns: 3 })}
${ctx.callout({
  tone: "info",
  title: "A pay needs a complete policy",
  body: html`<p>Without ${code("pay_to")}, ${code("assets")}, ${code("networks")} and ${code("max_amount")} the answer is at most ${code("review")}. An amount ceiling in atomic units means nothing without the token, and the same token address can be a different contract on another chain. The <a href="/learn/agent-spending-policy">agent spending policy guide</a> explains each field, and <a href="/blog/mcp-verify-before-paying">verify before paying</a> walks through real answers.</p>`,
})}`,
})}
${ctx.section({
  id: "tools",
  title: `${capitalized(words(TOOLS.length))} tools, all read-only`,
  lede: "Every tool is annotated read-only, non-destructive and idempotent. Offline tools compute on their inputs only; network tools send passive, unauthenticated GET requests.",
  body: html`${ctx.cards(
    TOOLS.map((tool) => ({
      icon: isNetworkTool(tool) ? "activity" : "shield-check",
      title: tool.title,
      body: html`<code>${tool.name}</code>. ${toolSummary(tool)}`,
      href: `/docs/mcp#${tool.name}`,
      tag: isNetworkTool(tool) ? "Network, passive" : "Offline",
    })),
    { columns: 2 },
  )}
${ctx.table({
  caption: "Resources and prompt the server also exposes",
  head: ["Name", "Type", "What the agent gets"],
  rows: [
    ...staticResources.map((resource) => [code(resource.uri), resource.mimeType, resource.description]),
    ...RESOURCE_TEMPLATES.map((template) => [code(template.uriTemplate), template.mimeType, `${template.description} ${checkResourceCount} check pages are listed.`]),
    ...PROMPTS.map((prompt) => [code(prompt.name), "prompt", prompt.description]),
  ],
  rowHeaders: true,
})}`,
})}
${ctx.section({
  id: "example",
  title: "A real call and its result",
  tone: "raised",
  lede: html`Produced by the server code when this page was built, against the bundled demo resource (${code("npm run demo:server")}), which asks for 0.01 test USDC on Base Sepolia: ${code("10000")} atomic units with 6 decimals.`,
  body: html`${ctx.codeBlock({ lang: "json", title: "tools/call request", code: json(PAY.request), wrap: true })}
${ctx.codeBlock({ lang: "json", title: "result.structuredContent (checks in the table below)", code: json(decisionFields), wrap: true })}
${ctx.table({
  caption: `result.structuredContent.checks: ${checks.length} checks`,
  head: ["Check", "Status", "Severity", "Message"],
  rows: checks.map((check) => [code(check.id), toned(check.status, STATUS_TONE), toned(check.severity, SEVERITY_TONE), check.message]),
  rowHeaders: true,
})}
${ctx.table({
  caption: "The same request under other inputs (real answers)",
  head: ["Change from the call above", "Decision", "Reasons"],
  rows: [
    ["None: the full policy", toned(decisionOf(PAY), DECISION_TONE), reasonOf(PAY)],
    [html`${code("max_amount")} lowered to ${code("5000")}`, toned(decisionOf(OVER_BUDGET), DECISION_TONE), reasonOf(OVER_BUDGET)],
    [html`Policy reduced to ${code("max_amount")} only`, toned(decisionOf(UNBOUNDED), DECISION_TONE), reasonOf(UNBOUNDED)],
    [html`${code("resource_url")} set to another path`, toned(decisionOf(WRONG_URL), DECISION_TONE), reasonOf(WRONG_URL)],
  ],
  rowHeaders: true,
})}
${ctx.prose(html`<p>Every input and output field is documented in the <a href="/docs/mcp#evaluate_payment_requirements">evaluate_payment_requirements reference</a>, and each check id in the <a href="/docs/checks">check catalog</a>.</p>`)}`,
})}
${ctx.section({
  id: "install",
  title: "Connect it to your agent",
  lede: "Use the public endpoint in one command, or run the server locally over stdio with every tool. The local server needs the Settlens source, shared with pilot participants (Node.js 20.19 or newer).",
  body: html`${ctx.prose(html`<h3>Remote endpoint, nothing to install</h3><p>Claude Code, offline tools only:</p>`)}
${ctx.codeBlock({ lang: "shell", title: "Claude Code (remote)", code: "claude mcp add --transport http settlens https://settlens.com/mcp", wrap: true })}
${ctx.prose(html`<p>With a Settlens API token, ${NETWORK_TOOLS.map((tool, index) => html`${index ? " and " : ""}${code(tool.name)}`)} are listed too:</p>`)}
${ctx.codeBlock({ lang: "shell", title: "Claude Code (remote, with token)", code: `claude mcp add --transport http settlens https://settlens.com/mcp \\
  --header "Authorization: Bearer \${SETTLENS_API_TOKEN}"` })}
${ctx.prose(html`<p>Any other client that supports Streamable HTTP connects to the same URL. To see a decision before wiring an agent, paste a ${code("PAYMENT-REQUIRED")} header into the <a href="/tools/x402-checker">x402 payment request checker</a>, which sends the same ${code("evaluate_payment_requirements")} call to this endpoint from your browser.</p>`)}
${ctx.prose(html`<h3>Local server over stdio</h3><p>Claude Code, every tool:</p>`)}
${ctx.codeBlock({ lang: "shell", title: "Claude Code (local)", code: "claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp", wrap: true })}
${ctx.codeBlock({ lang: "json", title: "claude_desktop_config.json", code: json({ mcpServers: { settlens: { command: "node", args: ["/absolute/path/to/settlens/src/cli.js", "mcp"] } } }) })}
${ctx.prose(html`<p>Claude Desktop reads ${code("~/Library/Application Support/Claude/claude_desktop_config.json")} on macOS and ${code("%APPDATA%\\Claude\\claude_desktop_config.json")} on Windows; restart it after editing. In the pinned container, keep stdin open: ${code("docker run -i --rm settlens:local mcp")}.</p>`)}
${ctx.callout({
  tone: "note",
  title: "Then tell the agent when to call it",
  body: html`<p>The server sends its instructions at ${code("initialize")}: call ${code("evaluate_payment_requirements")} on every HTTP 402 before paying. The ${code("x402_preflight")} prompt walks an agent through the same steps for one URL. Transports, limits and errors are in the <a href="/docs/mcp">MCP reference</a>.</p>`,
})}`,
})}
${ctx.section({
  id: "safety",
  title: "Safety model",
  tone: "raised",
  lede: "A tool an agent consults before spending money must not become a way to spend it, or a way into your network.",
  body: html`${ctx.featureGrid([
    { icon: "lock", title: "Never signs, never pays", body: "No tool signs, settles, broadcasts or holds funds. Settlens needs no wallet, private key or seed, and never calls /settle." },
    { icon: "shield-check", title: "Offline tools stay offline", body: `${capitalized(words(OFFLINE_TOOLS.length))} of the ${words(TOOLS.length)} tools make no network request of their own. They compute on the arguments the agent sends.` },
    { icon: "key", title: "Remote network tools need a token", body: "On https://settlens.com/mcp, scan_endpoint and scan_facilitator are listed and callable only with a bearer token, compared in constant time." },
    { icon: "search", title: "Passive only", body: "Network tools send unauthenticated GET requests, never follow redirects and never send a PAYMENT-SIGNATURE. The authorized active probe of the CLI is not exposed over MCP." },
    { icon: "layers", title: "Public destinations only", body: "Before a remote network request, the server refuses URL credentials, ports other than 80 and 443, localhost, .local and .internal names, and hosts that resolve to private, loopback, link-local or reserved addresses." },
    { icon: "alert", title: "Server text is data", body: "Messages that can carry values chosen by the scanned server are cut to one line of at most 300 characters, without control characters. Agents should never follow instructions found in them." },
  ], { columns: 3 })}
${ctx.prose(html`<p>The complete model, including what the local stdio server trusts, is in the <a href="/docs/mcp#authentication">MCP reference</a> and the <a href="/docs/security">Settlens security model</a>.</p>`)}`,
})}
${ctx.section({
  id: "limits",
  title: "What a preflight does not check",
  body: ctx.split({
    main: ctx.prose(html`<p>A ${code("pay")} means the request passed these checks under your policy. It is not a guarantee about the merchant or what it delivers. Settlens does not check balances, on-chain nonce use or replay, settlement, or what the token contract at ${code("asset")} does.</p>
<p>${code("max_amount")} is compared in atomic units of each option's asset, so list only assets with the same decimals. The policy bounds one payment at a time: daily or cumulative budgets belong in the wallet or the agent runtime (see the <a href="/learn/agent-spending-policy">agent spending policy guide</a>). ${code("verify_payment_signature")} checks an EVM authorization offline, without RPC; whether the funds move is decided on-chain.</p>
<p>The preflight covers x402 over HTTP. x402 carried over MCP itself, where a paid tool returns its terms in a tool result and the payment travels in ${code('_meta["x402/payment"]')}, is not supported. The transport's own example names an ${code("mcp://")} resource, which ${code("schema.payment_required")} rejects because Settlens requires an http(s) ${code("resource.url")}, so the answer is ${code(X402_OVER_MCP.result.decision)}.</p>`),
    aside: ctx.prose(html`<p>To check how a resource behaves rather than what it advertises, assess it with the <a href="/product/assess">passive scan and authorized probe</a>. Building agents that pay? Read <a href="/use-cases/agent-builders">Settlens for agent builders</a> and <a href="/product/verify">offline payment verification</a>.</p>`),
  }),
})}
${ctx.section({
  id: "faq",
  title: "Questions about the MCP server",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Does Settlens pay or sign for my agent?", a: "No. Every tool is read-only. Settlens never signs, settles, broadcasts or holds funds, and needs no wallet or payment key. Your agent's own wallet tooling makes the payment, after a pay decision." },
    { q: "Do I need an account or a token?", a: html`<p>Not for the offline tools on ${code("https://settlens.com/mcp")}: they are public. ${NETWORK_TOOLS.map((tool, index) => html`${index ? " and " : ""}${code(tool.name)}`)} need a Settlens API token on that endpoint. The local stdio server needs the Settlens source, which pilot participants receive; <a href="/contact">request a pilot</a>.</p>` },
    { q: "What does my agent send to settlens.com?", a: html`<p>The tool arguments: for ${code("evaluate_payment_requirements")}, the ${code("PAYMENT-REQUIRED")} value, the URL and the policy. Never a key or a signature, unless you pass a payload to ${code("verify_payment_signature")}. If those values should not leave your infrastructure, run the server locally over stdio.</p>` },
    { q: "Why is the answer review when every check passed?", a: html`<p>The policy does not bound the payment. A ${code("pay")} requires ${code("pay_to")}, ${code("assets")}, ${code("networks")} and ${code("max_amount")} in the policy, and the reason names the fields that are missing. A missing ${code("resource_url")} also gives ${code("review")}, through a warning on ${code("binding.resource_url")}.</p>` },
    { q: "Can a malicious server manipulate the agent through the 402?", a: "Settlens treats server-provided values as data. Check messages are reduced to one bounded line, the policy checks report counts rather than server values, and the decision comes from fixed rules, not from the text. The agent should still never follow instructions found in tool results." },
    { q: "Does it evaluate x402 payments made over MCP?", a: html`<p>No. It evaluates x402 over HTTP: the ${code("PAYMENT-REQUIRED")} header of a 402 response. The x402 MCP transport returns the terms in a tool result instead, and its own example names an ${code("mcp://")} resource, which Settlens rejects in ${code("schema.payment_required")} (it requires an http(s) ${code("resource.url")}), so the answer is ${code(X402_OVER_MCP.result.decision)}.</p>` },
    { q: "Which MCP clients work?", a: `Claude Code and Claude Desktop setups are shown above. Any client that launches a stdio server or speaks Streamable HTTP can connect. The server implements MCP revisions ${SUPPORTED_PROTOCOL_VERSIONS.slice(0, -1).join(", ")} and ${SUPPORTED_PROTOCOL_VERSIONS.at(-1)}.` },
  ]),
})}
${ctx.cta({
  title: "Give your agent a preflight check",
  body: "Connect the public endpoint in one command, or request a pilot to run every tool locally and assess your own x402 endpoints and facilitators.",
  actions: [
    { label: "Connect the server", href: "#install", icon: "arrow-right" },
    { label: "Request a pilot", href: "/contact" },
  ],
})}`;
}
