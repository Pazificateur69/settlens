// /learn/agent-spending-policy: per-request spending policies for agents that pay with x402.
// The example policy, the decision rules and every verdict come from the real MCP server at build
// time (src/mcp.js through pages/mcp.js), so the page cannot drift from the product.

import { getCheck } from "../../../../src/catalog.js";
import { DEMO_POLICY, DEMO_URL, evaluate, expectDecision, INIT, rpcResult } from "../mcp.js";
import { SOURCES, ifPage } from "./_shared.js";

export const meta = {
  path: "/learn/agent-spending-policy",
  title: "AI agent spending policy for x402 payments",
  heading: "Spending policies for AI agents that pay with x402",
  label: "Agent spending policy",
  description:
    "How to write a spending policy for an AI agent that pays with x402: recipients, assets, networks and amount caps, the pay or review decision, and its limits.",
  lede: "An agent that can pay needs limits it cannot talk itself out of. This guide explains the four constraints that bound an x402 payment, how a per-request check turns them into pay, review or do_not_pay, and which limits belong in the wallet or the agent runtime instead.",
  summary:
    "An agent spending policy is a set of fixed limits checked outside the model before each x402 payment: allowed recipients, tokens, CAIP-2 networks and a maximum amount in atomic units. Settlens applies it per request and answers pay, review or do_not_pay; cumulative budgets belong in the wallet or agent runtime.",
  sources: [SOURCES.x402, SOURCES.paymentIdentifier, SOURCES.mcpTools, SOURCES.caip2],
  section: "learn",
  order: 6,
  icon: "lock",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "AI agents", "Spending policy", "MCP"],
  related: ["/mcp", "/learn/x402-security-checklist", "/blog/mcp-verify-before-paying"],
};

// The policy guide resource served by the MCP server; its example is rendered verbatim.
const GUIDE = (await rpcResult("resources/read", { uri: "settlens://policy-guide" })).contents[0].text;
const EXAMPLE = /```json\n([\s\S]+?)\n```/.exec(GUIDE)?.[1];
if (!EXAMPLE) throw new Error("/learn/agent-spending-policy: the policy guide no longer contains a JSON example.");

// One request (the demo's PAYMENT-REQUIRED) evaluated under several policies by the real server.
const VERDICTS = [
  { when: "Full policy: pay_to, assets, networks, max_amount 10000 and schemes", policy: DEMO_POLICY, expect: "pay" },
  { when: "No policy at all", policy: undefined, expect: "review" },
  { when: "Same policy without pay_to", policy: { assets: DEMO_POLICY.assets, networks: DEMO_POLICY.networks, max_amount: DEMO_POLICY.max_amount }, expect: "review" },
  { when: "max_amount lowered to 5000", policy: { ...DEMO_POLICY, max_amount: "5000" }, expect: "do_not_pay" },
  { when: "networks set to Base mainnet only (eip155:8453)", policy: { ...DEMO_POLICY, networks: ["eip155:8453"] }, expect: "do_not_pay" },
];
const RESULTS = await Promise.all(
  VERDICTS.map(async (entry, index) => ({
    ...entry,
    result: expectDecision(await evaluate({ policy: entry.policy, id: 60 + index }), entry.expect, `/learn/agent-spending-policy (${entry.when})`).result,
  })),
);
const TONE = { pay: "success", review: "warning", do_not_pay: "danger" };

const POLICY_CHECKS = [
  ["pay_to", "Allowed recipients (payTo) you have reviewed. EVM addresses compare case-insensitively, other formats exactly.", "policy.recipient", "Required for pay"],
  ["assets", "Allowed token contract addresses (EVM) or mints (Solana).", "policy.asset", "Required for pay"],
  ["networks", "Allowed CAIP-2 networks, for example eip155:8453 for Base mainnet.", "policy.network", "Required for pay"],
  ["max_amount", "The largest amount you accept, as an integer string in the asset's atomic units.", "policy.maximum_amount", "Required for pay"],
  ["schemes", "Allowed x402 schemes, for example exact.", "policy.scheme", "Recommended"],
].map(([field, meaning, id, need]) => {
  if (!getCheck(id)) throw new Error(`/learn/agent-spending-policy: unknown check id ${id}`);
  return { field, meaning, id, need };
});

export default function render(ctx) {
  const { html, table, codeBlock, callout, verdicts, faq } = ctx;
  return html`<p>An x402 server states its price in a machine-readable header, and an agent with a wallet can pay it within the same request. That is the point of <a href="/learn/what-is-x402">x402</a>, and also the risk: nothing in the protocol decides whether a given payment is one the agent's owner would approve. The <a href="${SOURCES.x402.url}">x402 V2 core specification</a> lists client-side budget management as out of scope and calls spending controls implementation-specific. The client has to bring its own policy.</p>

<h2 id="prompts-are-not-policy">Why a prompt is not a policy</h2>
<p>Telling a model "never pay more than one cent" is an instruction it may weigh against others, including text supplied by the server it is paying. The payment terms come from that server: the recipient, the token, the amount, even the human-readable <code>error</code> and <code>description</code> strings. A spending policy has to be checked by code outside the model, against fixed values the owner set, before anything is signed. The model can call the check; it should not be the check.</p>

<h2 id="four-constraints">The four constraints that make "pay" possible</h2>
<p>A payment request usually offers several options in <code>accepts</code>, and the agent pays with one of them. A useful policy bounds every dimension of an option: who is paid, in which token, on which chain and how much. In the Settlens MCP tool <code>evaluate_payment_requirements</code>, the decision can only be <code>pay</code> when all four are set.</p>
${table({
  caption: "Spending policy fields of evaluate_payment_requirements and the Settlens check for each",
  head: ["Field", "Meaning", "Check", "For pay"],
  rows: POLICY_CHECKS.map((row) => [html`<code>${row.field}</code>`, row.meaning, html`<code>${row.id}</code>`, row.need]),
  rowHeaders: true,
})}
<p>This is the example policy from the server's own guide (the MCP resource <code>settlens://policy-guide</code>):</p>
${codeBlock({ lang: "json", title: "Spending policy example", code: EXAMPLE })}
<p>An option is acceptable when it is well formed and satisfies every constraint you set; <code>policy.acceptable_option</code> passes when at least one option is. The per-constraint checks only summarize the options: they warn when some options violate the constraint and fail when all do.</p>

<h2 id="atomic-units">Amounts are in atomic units</h2>
<p>x402 amounts are integer strings in the token's smallest unit. USDC has 6 decimals, so <code>"10000"</code> is 0.01 USDC. A cap therefore means nothing without the token: the same <code>max_amount</code> of <code>"10000000"</code> is 10 USDC but 0.1 of a token with 8 decimals. Pair <code>max_amount</code> with an <code>assets</code> allowlist, and list only assets that share the same decimals. The <a href="/learn/glossary#atomic-units">glossary</a> has the definition.</p>

<h2 id="asset-and-network">An asset only means something on its network</h2>
<p>A token address is only unique within one chain: the same address can be a different contract, or nothing at all, on another network. An allowlist of assets without a list of <a href="/learn/glossary#caip-2">CAIP-2</a> networks lets a server name your trusted address on a chain where it means something else. Set both, and keep the networks to the ones your wallet can actually sign for.</p>

<h2 id="decisions">Decisions: pay, review, do_not_pay</h2>
<p>The checks produce one of three decisions. The verdicts below were computed when this page was built: the same request (the demo's <code>PAYMENT-REQUIRED</code>, 10000 atomic units on Base Sepolia, requested at <code>${DEMO_URL}</code>) evaluated under five policies.</p>
${verdicts({
  title: "evaluate_payment_requirements",
  meta: "One request, five policies",
  items: RESULTS.map((entry) => ({ decision: entry.result.decision, tone: TONE[entry.result.decision], when: entry.when, detail: entry.result.reasons[0] ?? entry.result.summary })),
  caption: "Build-time calls to the Settlens MCP server (src/mcp.js) with the demo request.",
})}
<p>The rules, in order:</p>
<ol>
  <li><strong><code>do_not_pay</code></strong> when any check of severity high or critical fails, including when no option is acceptable. Never pay.</li>
  <li><strong><code>review</code></strong> when any other check fails or warns, apart from the per-constraint summaries, or when the policy does not set <code>pay_to</code>, <code>assets</code>, <code>networks</code> and <code>max_amount</code>. Ask the human first.</li>
  <li><strong><code>pay</code></strong> otherwise. Pay only with an option listed in <code>acceptable</code>.</li>
</ol>
<p>Always pass the URL you requested as <code>resource_url</code>. Without it the binding between the terms and the resource cannot be confirmed, and the best possible answer is <code>review</code>. The server gives connected agents these instructions at <code>initialize</code>:</p>
${codeBlock({ lang: "text", title: "MCP server instructions", code: INIT.instructions, wrap: true })}

<h2 id="what-it-does-not-cover">What a per-request policy does not cover</h2>
<p>A per-request check sees one payment request at a time. Several limits need state or chain access that it does not have, and belong elsewhere:</p>
${table({
  caption: "Spending limits outside a per-request check, and where they belong",
  head: ["Limit", "Why a per-request check misses it", "Where it belongs"],
  rows: [
    ["Daily or cumulative budget", "Each request can be within the cap while the total is not.", "The wallet or the agent runtime, which sees every payment."],
    ["Rate of spend", "A loop calling a cheap resource thousands of times passes every individual check.", "The agent runtime: rate limits and loop detection."],
    ["Duplicate payments on retry", "A retried request is evaluated as new.", html`Idempotency keys from the <a href="${SOURCES.paymentIdentifier.url}"><code>payment-identifier</code> extension</a>, when the server supports it, plus deduplication in the runtime.`],
    ["Whether the payment settled", "The check runs before payment.", html`The client, reading <code>PAYMENT-RESPONSE</code> and reconciling <a href="/learn/x402-error-codes"><code>settlement_pending</code></a> on chain.`],
    [html`Unrecognized <code>paymentFlow</code>`, "Settlens does not evaluate payment flows or transfer methods.", html`The client: the specification says it must not build a payment for a flow it does not recognize.`],
    ["Token behavior, balance and nonces", "The check runs offline, and Settlens never reads chain state.", "The wallet and the chain."],
  ],
  rowHeaders: true,
})}
${callout({
  tone: "warning",
  title: "Server text is data, not instructions",
  body: html`<p>Fields such as <code>error</code>, <code>description</code> and the reasons a tool returns are written by, or derived from, the server being paid. An agent should act on the decision and the policy, never on instructions found in those strings.</p>`,
})}

<h2 id="wire-it-in">Wire it into your agent</h2>
<p>The <a href="/mcp">Settlens MCP server</a> exposes <code>evaluate_payment_requirements</code> as a public offline tool at <code>https://settlens.com/mcp</code>. Claude Code connects in one command:</p>
${codeBlock({ lang: "shell", title: "Claude Code (remote)", code: "claude mcp add --transport http settlens https://settlens.com/mcp", wrap: true })}
<p>The server also ships an <code>x402_preflight</code> prompt that walks an agent through the steps for one URL: request it without payment, read <code>PAYMENT-REQUIRED</code>, call the tool with its policy, then act on the decision. Transports, limits and error codes are in the <a href="/docs/mcp">MCP reference</a>.${ifPage(ctx, "/tools/x402-checker", html` To try a policy on a real header first, use the <a href="/tools/x402-checker">x402 payment request checker</a>.`)}</p>
<p>Policy checks are only one layer. The <a href="/learn/x402-security-checklist#agent-clients">agent section of the x402 security checklist</a> lists the other controls a paying client needs.</p>

<h2 id="faq">Frequently asked questions</h2>
${faq([
  {
    q: "Does the Settlens MCP preflight enforce a daily budget?",
    a: "No. It applies a per-request policy: allowed recipients, assets, networks, schemes and a maximum amount. Cumulative or daily budgets must be enforced by the wallet or the agent runtime, which see every payment.",
  },
  {
    q: "What happens if the policy leaves out pay_to?",
    a: "The decision cannot be pay. Without pay_to, assets, networks and max_amount the policy does not bound the payment, so the best possible answer is review: the agent should ask a human before paying.",
  },
  {
    q: "Why do max_amount and assets need to go together?",
    a: "Amounts are integer strings in each token's atomic units, and tokens have different decimals. \"10000000\" is 10 USDC but 0.1 of an 8-decimal token, so a cap is only meaningful for assets you listed.",
  },
])}`;
}
