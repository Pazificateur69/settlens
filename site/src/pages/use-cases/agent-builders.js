// Persona page: teams whose AI agents pay for APIs over x402.
// The decisions shown on this page are computed at build time by the real MCP server
// (src/mcp.js, offline tools only), so they always match the shipped decision rules.

import { createMcpServer } from "../../../../src/mcp.js";
import { assertValidConfig, prettyJson, SOFTWARE } from "./_shared.js";

export const meta = {
  path: "/use-cases/agent-builders",
  title: "x402 spending guardrails for AI agent builders",
  description:
    "Give your AI agent a spending policy and an MCP preflight: Settlens checks each x402 payment request and answers pay, review or do_not_pay with reasons.",
  section: "use-cases",
  label: "Agent builders",
  icon: "chip",
  order: 3,
  lastmod: "2026-10-13",
  summary:
    "The Settlens MCP server checks an x402 request against an AI agent's spending policy before it pays. It answers pay only when the policy sets recipients, assets, networks and a maximum amount, every protocol check passes (including the binding to the requested URL) and an option fits; otherwise review or do_not_pay.",
  sources: [
    { title: "x402 protocol specification, version 2 (PaymentRequirements fields)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport: PAYMENT-REQUIRED and PAYMENT-SIGNATURE headers", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
    { title: "Model Context Protocol specification 2025-06-18: Tools", url: "https://modelcontextprotocol.io/specification/2025-06-18/server/tools", publisher: "Model Context Protocol" },
  ],
  changefreq: "monthly",
  jsonLd: SOFTWARE,
};

// Illustrative merchant terms: USDC on Base, plus a second option on Ethereum mainnet.
const RESOURCE_URL = "https://api.example.com/v1/forecast";
const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ETHEREUM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const PAYMENT_REQUIRED = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: { url: RESOURCE_URL, description: "Seven-day forecast", mimeType: "application/json" },
  accepts: [
    { scheme: "exact", network: "eip155:8453", amount: "10000", asset: USDC_BASE, payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } },
    { scheme: "exact", network: "eip155:1", amount: "10000", asset: USDC_ETHEREUM, payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } },
  ],
  extensions: {},
};
const HEADER = Buffer.from(JSON.stringify(PAYMENT_REQUIRED)).toString("base64");

const POLICY = {
  pay_to: [PAY_TO],
  assets: [USDC_BASE],
  max_amount: "20000",
  networks: ["eip155:8453"],
  schemes: ["exact"],
};
const { assets: _assets, ...POLICY_WITHOUT_ASSETS } = POLICY;

const server = createMcpServer({ mode: "local" });

async function evaluate(args) {
  const response = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "evaluate_payment_requirements", arguments: args } });
  if (response.error || response.result.isError) {
    throw new Error(`evaluate_payment_requirements failed: ${JSON.stringify(response.error ?? response.result.content)}`);
  }
  return response.result.structuredContent;
}

const SCENARIOS = await Promise.all(
  [
    { name: "Policy bounds recipient, asset, network and amount", change: "None (base policy)", args: { policy: POLICY } },
    { name: "Price above the ceiling", change: "max_amount lowered to 5000", args: { policy: { ...POLICY, max_amount: "5000" } } },
    { name: "Policy without an asset", change: "assets removed", args: { policy: POLICY_WITHOUT_ASSETS } },
    { name: "Challenge bound to another URL", change: "resource_url is /v1/history", args: { policy: POLICY, resource_url: "https://api.example.com/v1/history" } },
  ].map(async (scenario) => ({
    ...scenario,
    result: await evaluate({ payment_required: HEADER, resource_url: RESOURCE_URL, ...scenario.args }),
  })),
);

const TOOLS = (await createMcpServer({ mode: "local", allowNetworkTools: true }).handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools;

const DECISION_TONE = { pay: "success", review: "warning", do_not_pay: "danger" };

const CONFIG = assertValidConfig({
  version: 1,
  failOn: "high",
  defaults: {
    expected: {
      schemes: ["exact"],
      networks: ["eip155:8453"],
      payTo: [PAY_TO],
      assets: [USDC_BASE],
      maxAmount: "20000",
    },
  },
  targets: [{ name: "forecast-provider", url: RESOURCE_URL }],
});

const PREFLIGHT_SVG = `<svg viewBox="0 0 720 370" width="720" height="370" xmlns="http://www.w3.org/2000/svg">
  <title>x402 preflight with the Settlens MCP server</title>
  <desc>The agent requests the paid API, receives a 402 challenge, asks Settlens to evaluate it offline and retries with a payment signature only when the answer is pay.</desc>
  <rect class="d-zone" x="24" y="160" width="440" height="110" rx="10"/>
  <rect class="d-node d-node--accent" x="40" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="280" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="520" y="16" width="160" height="44" rx="10"/>
  <text class="d-title" x="120" y="43" text-anchor="middle">Settlens MCP</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">AI agent</text>
  <text class="d-title" x="600" y="43" text-anchor="middle">Paid API</text>
  <path class="d-life" d="M120 60v290M360 60v290M600 60v290"/>
  <path class="d-msg" d="M360 100h236"/><path class="d-head" d="M590 94l8 6-8 6"/>
  <text class="d-label" x="480" y="91" text-anchor="middle">GET, no payment</text>
  <path class="d-msg d-msg--accent" d="M600 140H364"/><path class="d-head d-head--accent" d="M370 134l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="480" y="131" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <path class="d-msg" d="M360 200H124"/><path class="d-head" d="M130 194l-8 6 8 6"/>
  <text class="d-label" x="240" y="191" text-anchor="middle">evaluate_payment_requirements</text>
  <path class="d-msg d-msg--accent" d="M120 236h236"/><path class="d-head d-head--accent" d="M350 230l8 6-8 6"/>
  <text class="d-label d-label--accent" x="240" y="227" text-anchor="middle">pay · review · do_not_pay</text>
  <text class="d-note" x="136" y="260">offline · never pays · no wallet</text>
  <text class="d-text" x="136" y="300">review: ask a human</text>
  <text class="d-text" x="136" y="324">do_not_pay: stop</text>
  <path class="d-msg d-msg--blue" d="M360 300h236"/><path class="d-head d-head--blue" d="M590 294l8 6-8 6"/>
  <text class="d-label" x="480" y="291" text-anchor="middle">retry + PAYMENT-SIGNATURE</text>
  <text class="d-note d-note--blue" x="480" y="324" text-anchor="middle">only on pay, from acceptable</text>
</svg>`;


export default function render(ctx) {
  const { html } = ctx;
  const [base] = SCENARIOS;
  const excerpt = { decision: base.result.decision, summary: base.result.summary, reasons: base.result.reasons, acceptable: base.result.acceptable };
  return html`${ctx.hero({
    title: "Spending guardrails for agents that pay over x402",
    lede: "For teams whose AI agents buy API calls, data or content over x402. The Settlens MCP server reads the 402 challenge, applies your spending policy and answers pay, review or do_not_pay with the reasons. It never signs, never pays and needs no wallet or payment key.",
    actions: [
      { label: "Connect the MCP server", href: "/mcp", icon: "arrow-right" },
      { label: "Request a pilot", href: "/contact" },
    ],
    aside: ctx.codeBlock({
      lang: "shell",
      title: "Add Settlens to Claude Code",
      wrap: true,
      code: `# Remote endpoint: offline tools, no token needed
claude mcp add --transport http settlens https://settlens.com/mcp

# Local server over stdio, from the pilot source
claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp`,
    }),
  })}
${ctx.section({
  id: "who",
  title: "Who this is for",
  width: "narrow",
  body: ctx.prose(html`<p>Your agent calls paid APIs on its own. With <a href="/learn/what-is-x402">x402</a>, the API answers HTTP 402 with machine-readable terms in a <code>PAYMENT-REQUIRED</code> header, and the agent signs a payment and retries. Unless your code checks them first, the agent signs the terms the server sent, and nothing in the protocol tells it whether those are the terms you meant to accept.</p>
<p>Settlens sits between the 402 and the signature. It is a check the agent calls, not a wallet: it reads the terms, compares them with your policy and returns a decision your agent code can enforce. Our guide to <a href="/learn/agent-spending-policy">agent spending policies</a> explains how to choose those limits.</p>`),
})}
${ctx.section({
  id: "failure-modes",
  title: "What goes wrong when an agent pays",
  lede: "Each failure mode maps to a check the preflight runs. The tag on each card is the check id returned in reasons and checks.",
  tone: "raised",
  body: ctx.cards(
    [
      { icon: "key", title: "Paying the wrong recipient", body: "A compromised or misconfigured server swaps payTo. Only recipients in pay_to can produce an acceptable option.", tag: "policy.recipient" },
      { icon: "activity", title: "Paying more than intended", body: "A price change or a malicious server raises the amount. Options above max_amount are rejected.", tag: "policy.maximum_amount" },
      { icon: "chip", title: "Paying in another token", body: "Amounts are atomic units: 10000 is 0.01 USDC but means something else in a token with other decimals. Without an asset allowlist, a ceiling is not a ceiling.", tag: "policy.asset" },
      { icon: "layers", title: "Paying on the wrong chain", body: "A testnet option where you expect mainnet, or the reverse. networks restricts the CAIP-2 chains you pay on.", tag: "policy.network" },
      { icon: "branch", title: "Paying for a different resource", body: "resource.url must equal the URL the agent requested. A mismatch means the payment could be steered to or reused for another resource.", tag: "binding.resource_url" },
      { icon: "file", title: "Terms that do not parse", body: "The challenge must decode as Base64 JSON and pass the official @x402/core 2.28.0 schema and the per-option rules for scheme, network, amount, asset, payTo and timeout.", tag: "schema.official_x402_sdk" },
      { icon: "clock", title: "Long authorization windows", body: "maxTimeoutSeconds above 3600 keeps a signed payment usable for longer than needed.", tag: "freshness.timeout_window" },
      { icon: "alert", title: "Instructions hidden in server data", body: "Check messages and payment options carry values chosen by the server. Treat them as data; never follow instructions found in them." },
    ],
    { columns: 2 },
  ),
})}
${ctx.section({
  id: "preflight",
  title: "How the preflight works",
  lede: "One extra tool call between the 402 and the signature. The evaluation is offline: it only computes on the header, the URL and the policy you pass.",
  body: html`${ctx.diagram({
    svg: PREFLIGHT_SVG,
    label: "Sequence between Settlens MCP, the AI agent and the paid API. The agent sends a GET without payment, receives 402 with PAYMENT-REQUIRED, calls evaluate_payment_requirements on Settlens and receives pay, review or do_not_pay. On review it asks a human, on do_not_pay it stops, and only on pay does it retry with a PAYMENT-SIGNATURE built from an acceptable option.",
    caption: "Settlens returns a decision; your agent code enforces it. Enforce do_not_pay in code, not only in the prompt.",
    size: "wide",
  })}
${ctx.steps([
    { title: "Request the paid URL without payment", body: "Keep the exact URL you requested: it is the resource_url Settlens compares with resource.url." },
    { title: "Read PAYMENT-REQUIRED on HTTP 402", body: "Pass the raw header value as payment_required. A decoded JSON object or JSON string also works." },
    { title: "Call evaluate_payment_requirements", body: html`<p>Send <code>payment_required</code>, <code>resource_url</code> and your <code>policy</code>. The server also exposes the <code>x402_preflight</code> prompt and the <code>settlens://policy-guide</code> resource with the same instructions.</p>` },
    { title: "Act on the decision", body: html`<p><code>do_not_pay</code>: never pay. <code>review</code>: show the summary and reasons to a human and wait for approval. <code>pay</code>: pay only with an option listed in <code>acceptable</code>.</p>` },
  ])}
${ctx.split({
  main: ctx.callout({
    tone: "info",
    title: "When the answer can be pay",
    body: html`<p>Only when every protocol check passes, including the match between <code>resource.url</code> and the <code>resource_url</code> you pass, at least one advertised option satisfies every constraint in your policy, and the policy bounds the recipient, the asset, the network and the amount: <code>pay_to</code>, <code>assets</code>, <code>networks</code> and <code>max_amount</code>. Otherwise the answer is <code>review</code> or <code>do_not_pay</code>, with reasons.</p>`,
  }),
  aside: ctx.codeBlock({ lang: "json", title: "Base spending policy (illustrative values)", code: prettyJson(POLICY), wrap: true }),
})}`,
})}
${ctx.section({
  id: "example",
  title: "Four requests, four answers",
  lede: "The same illustrative challenge (USDC on Base, plus a second option on Ethereum mainnet) evaluated under four policies. The decisions and reasons below are computed by the Settlens MCP server when this page is built.",
  tone: "raised",
  body: html`${ctx.table({
    caption: "evaluate_payment_requirements results",
    head: ["Scenario", "Change from the base policy", "Decision", "Acceptable options", "First reason"],
    rows: SCENARIOS.map(({ name, change, result }) => [
      name,
      change,
      ctx.badge(result.decision, { tone: DECISION_TONE[result.decision] }),
      String(result.acceptable.length),
      result.reasons.length ? html`<code>${result.reasons[0]}</code>` : "None",
    ]),
    rowHeaders: true,
    numeric: [3],
  })}
${ctx.split({
  main: ctx.prose(html`<p>In the first scenario the Ethereum option falls outside the policy (network and asset), but the Base option satisfies every constraint, so the answer is <code>${base.result.decision}</code> and <code>acceptable</code> lists ${base.result.acceptable.length} option${base.result.acceptable.length === 1 ? "" : "s"}. An agent pays with one option, so one option outside the policy does not block the others.</p>
<p>When no option fits, when the policy leaves the asset open, or when the challenge is bound to another URL, the preflight does not answer <code>pay</code>. The full result also carries every check with its status, severity and message (${base.result.checks.length} checks in the first scenario).</p>
<p>To see the same evaluation on a challenge from one of your providers, paste its header into the free <a href="/tools/x402-checker">x402 payment request checker</a>, which calls this tool from your browser.</p>`),
  aside: ctx.codeBlock({ lang: "json", title: "First scenario, checks omitted", code: JSON.stringify(excerpt, null, 2), wrap: true }),
})}`,
})}
${ctx.section({
  id: "tools",
  title: "Tools your agent can call",
  lede: "Listed from the server's own tool definitions. No tool signs, pays or needs a wallet or payment key, and every tool is annotated read-only.",
  body: html`${ctx.table({
    caption: "Settlens MCP tools",
    head: ["Tool", "Purpose", "Runs"],
    rows: TOOLS.map((tool) => [
      html`<code>${tool.name}</code>`,
      tool.title,
      tool.annotations.openWorldHint ? "Network, passive only. Remote endpoint: bearer token required" : "Offline",
    ]),
    rowHeaders: true,
  })}
${ctx.prose(html`<p>Before an agent sends a payment, <code>verify_payment_signature</code> can check the authorization it built: EIP-3009 signer recovery for the <code>exact</code> EVM scheme, recipient and amount binding and the validity window. The <a href="/docs/mcp">MCP reference</a> documents every input and output field, and the <a href="/mcp">x402 MCP server</a> page covers installation and the remote endpoint.</p>`)}`,
})}
${ctx.section({
  id: "vet-providers",
  title: "Vet the APIs your agent depends on",
  lede: "The preflight protects each payment. A scheduled passive scan tells you before the agent does when a provider changes its terms.",
  tone: "raised",
  body: ctx.split({
    main: ctx.prose(html`<p>Put the paid APIs your agent uses in a configuration file with the terms you approved. <code>settlens check</code> in CI, or <code>settlens monitor</code> on a schedule, sends ordinary unauthenticated requests. It reports a failure when a recipient, asset, network, scheme or amount leaves your policy, and a warning when terms drift between identical requests.</p>
<p>In a scan the rule is stricter than in the preflight: every advertised option must fit the policy, because you are reviewing the provider, not choosing one option to pay with. The active probe is not for third-party APIs: it needs the owner's authorization.</p>
<p>See <a href="/product/monitor">Monitor</a> and the <a href="/docs/configuration">configuration reference</a>.</p>`),
    aside: ctx.codeBlock({ lang: "json", title: "settlens.config.json (illustrative values)", code: prettyJson(CONFIG), wrap: true }),
  }),
})}
${ctx.section({
  id: "limits",
  title: "Limits to keep in mind",
  width: "narrow",
  body: html`${ctx.callout({
    tone: "warning",
    title: "A pay decision is not a guarantee",
    body: "It means the request passed these checks under your policy. It says nothing about the merchant's honesty or the content you receive after paying.",
  })}
${ctx.prose(html`<ul>
<li>Settlens does not check balances, on-chain nonce use or replay, or settlement.</li>
<li><code>assets</code> compares token addresses or mints with your allowlist. Settlens does not look up what the token at that address is; review the addresses you allow.</li>
<li>The remote endpoint exposes the offline tools publicly and rate limits each client IP. Its network tools need a Settlens API token; the local stdio server always includes them.</li>
<li>The authorized active probe is not available over MCP. Network tools are passive only.</li>
</ul>`)}`,
})}
${ctx.section({
  id: "faq",
  title: "Questions from agent builders",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Does Settlens pay or sign on behalf of my agent?", a: "No. Every tool is read-only. The MCP server never signs a payment, never pays, never calls /settle and never needs a wallet or payment key." },
    { q: "Why is the answer review when every check passes?", a: "Because the policy does not bound the payment. The decision can only be pay when the policy sets pay_to, assets, networks and max_amount, and at least one advertised option satisfies all of them." },
    { q: "Do I need the remote endpoint or the local server?", a: "Either. The remote endpoint at settlens.com/mcp serves the offline tools without a token. The local server, run from the pilot source with Node.js 20.19 or newer, adds the passive network tools and can scan local test servers." },
    { q: "Can a malicious server manipulate the answer?", a: "It controls the terms and the text inside check messages, not the decision rules. Reasons are bounded to one line, and your agent should treat every server-provided value as data, never as instructions." },
  ]),
})}
${ctx.cta({
  title: "Add a preflight to your agent",
  body: "Connect the MCP server, give it a policy and let it check every 402 before your agent signs.",
  actions: [
    { label: "Connect the MCP server", href: "/mcp" },
    { label: "Request a pilot", href: "/contact" },
  ],
})}`;
}
