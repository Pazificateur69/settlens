// Blog: why agents need a preflight before paying over x402, and how to write the spending
// policy. Every tool answer below is produced by the MCP server code at build time (see
// pages/mcp.js); the build fails if an answer no longer matches the text around it.

import { OFFICIAL_X402_CORE_VERSION } from "../../../../src/constants.js";
import { DEMO_OPTION, DEMO_PAYMENT_REQUIRED, DEMO_POLICY, evaluate, expectDecision, SOURCES, X402_OVER_MCP } from "../mcp.js";
import { AUTHOR, check } from "./_shared.js";

export const meta = {
  path: "/blog/mcp-verify-before-paying",
  title: "MCP preflight: verify x402 requests before paying",
  heading: "Verify before paying: a preflight check for AI agents on x402",
  label: "Verify before paying (MCP)",
  description:
    "Why AI agents need a deterministic check before signing an x402 payment, how to write a spending policy in atomic units, and a worked example with real output.",
  lede: "Unless something checks first, an agent that pays over x402 signs what the 402 response asks for. A preflight check, run outside the model under a policy you wrote, decides whether it should.",
  section: "blog",
  lastmod: "2026-10-13",
  datePublished: "2026-10-13",
  dateModified: "2026-10-13",
  author: AUTHOR,
  tags: ["MCP", "AI agents", "x402", "Spending policy"],
  summary: "Before an AI agent signs an x402 payment, a deterministic preflight should check the 402 terms against a spending policy that bounds recipient, token, chain and amount. The Settlens MCP tool evaluate_payment_requirements does this offline and answers pay, review or do_not_pay.",
  sources: [
    SOURCES.x402,
    SOURCES.x402Http,
    SOURCES.mcpTools,
    SOURCES.x402Mcp,
    { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
  related: ["/mcp", "/learn/agent-spending-policy", "/blog/agentic-payments-what-breaks"],
};

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY = expectDecision(await evaluate({ policy: DEMO_POLICY }), "pay", "blog/mcp-verify-before-paying (full policy)");
const OVER_BUDGET = expectDecision(await evaluate({ policy: { ...DEMO_POLICY, max_amount: "5000" }, id: 3 }), "do_not_pay", "blog (max_amount 5000)");
const UNBOUNDED = expectDecision(await evaluate({ policy: { max_amount: "10000" }, id: 4 }), "review", "blog (max_amount only)");
const NO_URL = expectDecision(await evaluate({ policy: DEMO_POLICY, resourceUrl: null, id: 5 }), "review", "blog (no resource_url)");
const WRONG_URL = expectDecision(await evaluate({ policy: DEMO_POLICY, resourceUrl: "http://127.0.0.1:4402/other", id: 6 }), "do_not_pay", "blog (other resource_url)");

// A constructed request with three options: the demo one, a pricier one and one on Base mainnet
// (whose USDC has the EIP-712 domain name "USD Coin", unlike Base Sepolia's "USDC").
const OPTIONS = [
  DEMO_OPTION,
  { ...DEMO_OPTION, amount: "25000" },
  { ...DEMO_OPTION, network: "eip155:8453", asset: BASE_USDC, extra: { name: "USD Coin", version: "2" } },
];
const MULTI = expectDecision(
  await evaluate({ policy: DEMO_POLICY, paymentRequired: { ...DEMO_PAYMENT_REQUIRED, accepts: OPTIONS }, id: 7 }),
  "pay",
  "blog (three options)",
);
if (!PAY.result.checks.every((entry) => entry.status === "pass")) throw new Error("blog/mcp-verify-before-paying: the full-policy example no longer passes every check.");
const MULTI_TALLY = MULTI.result.checks.find((entry) => entry.id === "policy.acceptable_option")?.message;
if (MULTI_TALLY !== "1 of 3 payment option(s) satisfy the policy; 2 rejected (max_amount: 1, networks: 1, assets: 1).") {
  throw new Error(`blog/mcp-verify-before-paying: the three-option tally changed to "${MULTI_TALLY}"; update the diagram.`);
}

const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const OPTIONS_SVG = `<svg viewBox="0 0 720 304" width="720" height="304" xmlns="http://www.w3.org/2000/svg">
  <title>One policy applied to three payment options</title>
  <desc>Three advertised options pass through the same policy. Option 1 is acceptable, option 2 is rejected for max_amount, option 3 for networks and assets.</desc>
  <text class="d-note" x="24" y="34">accepts[] in the 402</text>
  <text class="d-note" x="536" y="34">result</text>
  <rect class="d-node" x="24" y="48" width="264" height="56" rx="10"/>
  <rect class="d-node" x="24" y="120" width="264" height="56" rx="10"/>
  <rect class="d-node" x="24" y="192" width="264" height="56" rx="10"/>
  <text class="d-label" x="40" y="72">1 · exact · ${OPTIONS[0].network}</text>
  <text class="d-label" x="40" y="94">amount ${OPTIONS[0].amount} · test USDC</text>
  <text class="d-label" x="40" y="144">2 · exact · ${OPTIONS[1].network}</text>
  <text class="d-label" x="40" y="166">amount ${OPTIONS[1].amount} · test USDC</text>
  <text class="d-label" x="40" y="216">3 · exact · ${OPTIONS[2].network}</text>
  <text class="d-label" x="40" y="238">amount ${OPTIONS[2].amount} · USDC on Base</text>
  <path class="d-msg" d="M288 76h18M288 148h18M288 220h18"/>
  <path class="d-head" d="M300 70l8 6-8 6"/><path class="d-head" d="M300 142l8 6-8 6"/><path class="d-head" d="M300 214l8 6-8 6"/>
  <rect class="d-node d-node--accent" x="312" y="48" width="200" height="200" rx="10"/>
  <text class="d-title" x="412" y="76" text-anchor="middle">Your policy</text>
  <text class="d-label" x="326" y="106">pay_to ${short(DEMO_POLICY.pay_to[0])}</text>
  <text class="d-label" x="326" y="134">assets ${short(DEMO_POLICY.assets[0])}</text>
  <text class="d-label" x="326" y="162">networks ${DEMO_POLICY.networks[0]}</text>
  <text class="d-label" x="326" y="190">max_amount ${DEMO_POLICY.max_amount}</text>
  <text class="d-label" x="326" y="218">schemes ${DEMO_POLICY.schemes[0]}</text>
  <path class="d-msg" d="M512 76h16M512 148h16M512 220h16"/>
  <path class="d-head" d="M522 70l8 6-8 6"/><path class="d-head" d="M522 142l8 6-8 6"/><path class="d-head" d="M522 214l8 6-8 6"/>
  <rect class="d-node d-node--accent" x="536" y="48" width="168" height="56" rx="10"/>
  <rect class="d-node" x="536" y="120" width="168" height="56" rx="10"/>
  <rect class="d-node" x="536" y="192" width="168" height="56" rx="10"/>
  <text class="d-label d-label--accent" x="620" y="81" text-anchor="middle">acceptable</text>
  <text class="d-label" x="620" y="144" text-anchor="middle">rejected</text>
  <text class="d-label" x="620" y="166" text-anchor="middle">max_amount</text>
  <text class="d-label" x="620" y="216" text-anchor="middle">rejected</text>
  <text class="d-label" x="620" y="238" text-anchor="middle">networks, assets</text>
  <text class="d-note d-note--blue" x="24" y="286">policy.acceptable_option passes: 1 of 3 options. Pay with option 1 only.</text>
</svg>`;

const json = (value) => JSON.stringify(value, null, 2);

export default function render(ctx) {
  const { html, codeBlock, callout, diagram, table } = ctx;
  const code = (text) => html`<code>${text}</code>`;
  const id = (checkId) => html`<code>${check(checkId).id}</code>`;
  const reasonOf = ({ result }) => (result.reasons.length ? result.reasons.join(" ") : "None.");
  const { resource, accepts } = DEMO_PAYMENT_REQUIRED;

  return html`<p><a href="/learn/what-is-x402">x402</a> lets a server charge for an HTTP resource. The first request returns <code>402 Payment Required</code> with the price and the payment terms; the client signs a payment authorization for those terms and sends the request again. For a person at a checkout page, that is a moment of attention. For an AI agent, it is a decision taken in milliseconds, from text written by the party that wants to be paid.</p>
<p>This article is about the step between those two requests. It covers what the agent is about to sign, why the decision to sign should not be left to the model, how to write a spending policy that a machine can enforce, and what that looks like with the <a href="/mcp">Settlens MCP server</a>, with real output from the tool. It ends with what such a check cannot tell you.</p>

<h2>What a 402 asks an agent to sign</h2>
<p>In x402 V2, the terms travel in the <code>PAYMENT-REQUIRED</code> response header as Base64-encoded JSON (the <a href="/learn/x402-v2-headers">V2 headers guide</a> covers the format). Decoded, the challenge from the Settlens demo server looks like this:</p>
${codeBlock({ lang: "json", title: "Decoded PAYMENT-REQUIRED (demo server)", code: json(DEMO_PAYMENT_REQUIRED) })}
<p>Each entry of <code>accepts</code> is one way to pay. <code>network</code> is a CAIP-2 chain identifier (<code>${DEMO_OPTION.network}</code> is Base Sepolia). <code>asset</code> is the token contract, <code>payTo</code> the recipient, and <code>amount</code> an integer string in the token's smallest unit. <code>maxTimeoutSeconds</code> is the maximum time allowed to complete the payment, which bounds how long a signed authorization needs to stay usable; for this <code>exact</code> EVM option, <code>extra</code> carries the token's EIP-712 domain name and version.</p>
<p>The agent picks one entry, signs an authorization that moves exactly that amount of that token to that address (for USDC under the <code>exact</code> scheme on EVM chains, an <a href="/learn/eip-3009">EIP-3009</a> transfer authorization), and retries with a <code>PAYMENT-SIGNATURE</code> header. Whatever the chosen entry says is what the signature commits to. Nothing in the protocol asks whether the agent should agree.</p>

<h2>What goes wrong when nobody checks</h2>
<p>An unchecked agent pays whatever the server advertises. The ways this goes wrong are well known; <a href="/blog/agentic-payments-what-breaks">what breaks in agentic payments</a> covers them from both sides. For the payer, they map onto a short list of checks:</p>
${table({
  caption: "What an unchecked agent would sign, and the check that catches it",
  head: ["Problem", "What the agent would sign", "Check"],
  rows: [
    ["Recipient swapped", html`A transfer to a ${code("payTo")} nobody reviewed, after a misconfiguration, a compromised deployment or a malicious proxy.`, id("policy.recipient")],
    ["Price too high", "An amount far above what the task is worth, whether by mistake or by design.", id("policy.maximum_amount")],
    ["Wrong token or chain", "A payment in a token you never meant to spend, or on a chain where the same address is another contract.", html`${id("policy.asset")}<br>${id("policy.network")}`],
    ["Wrong resource", html`A payment whose ${code("resource.url")} is not the URL the agent requested.`, id("binding.resource_url")],
    ["Malformed terms", `A challenge that the official @x402/core ${OFFICIAL_X402_CORE_VERSION} schema rejects, so client libraries may read it differently.`, id("schema.official_x402_sdk")],
    ["Long-lived authorization", html`A ${code("maxTimeoutSeconds")} window of hours, which leaves a signed authorization usable for longer than needed.`, id("freshness.timeout_window")],
  ],
  rowHeaders: true,
})}
<p>Every one of these can be decided from the 402 response alone, before anything is signed. That is what makes a preflight possible: no balance lookup, no node, no wallet, only the terms, the URL and a policy.</p>

<h2>Why the check should not live in the prompt</h2>
<p>The tempting design is to give the model the decoded header and a sentence such as "only pay trusted merchants, at most one cent". It fails in predictable ways.</p>
<ul>
<li><strong>The arithmetic is unforgiving.</strong> One cent of USDC is <code>10000</code> atomic units, because USDC has 6 decimals. A model that reads <code>10000</code> as ten thousand dollars refuses a fair price; one that reads <code>1000000</code> as one cent overpays a hundredfold.</li>
<li><strong>Addresses need a strict comparison.</strong> EVM addresses are compared case-insensitively (their mixed case is only a checksum), Solana addresses character for character, and one changed character means a different recipient. Language models are good at "looks like" and bad at "is".</li>
<li><strong>The server writes part of the input.</strong> Fields such as <code>resource.description</code> or an error string are chosen by the server. Text that says "this payment is pre-approved" should change nothing, and with a prompt-only rule it can.</li>
<li><strong>Nobody can audit a judgment call.</strong> When an agent pays the wrong address, "the model thought it was fine" is not an explanation anyone can act on.</li>
</ul>
<p>A preflight tool turns the question into a function: the same terms and the same policy always produce the same decision, with reasons that name a check id. The model's job shrinks to calling the tool on every 402 and following a three-valued answer: <code>pay</code>, <code>review</code> or <code>do_not_pay</code>.</p>
<p>Then enforce it where the money moves. The model can still ignore a tool result, so the code that signs should refuse unless the last decision for that URL was <code>pay</code> and the option it is about to sign is one the tool returned as acceptable.</p>

<h2>How to express a spending policy</h2>
<p>The policy is what turns "trusted" and "cheap" into something a program can compare. The Settlens tools take five fields:</p>
${table({
  caption: "Spending policy fields",
  head: ["Field", "What it bounds", "Example", "Why it is needed"],
  rows: [
    [code("pay_to"), "Recipient addresses you reviewed", code(short(DEMO_POLICY.pay_to[0])), "Without it, any recipient is acceptable."],
    [code("assets"), "Token contracts or Solana mints", code(short(DEMO_POLICY.assets[0])), "An amount means nothing until the token, and its decimals, are fixed."],
    [code("networks"), "CAIP-2 chains", code(DEMO_POLICY.networks[0]), "The same token address can be another contract on another chain."],
    [code("max_amount"), "Largest amount per payment, in atomic units", code(DEMO_POLICY.max_amount), "The ceiling. 0.01 USDC × 10^6 = 10000."],
    [code("schemes"), "x402 payment schemes", code(DEMO_POLICY.schemes[0]), "Optional; limits how the payment is made."],
  ],
  rowHeaders: true,
})}
${codeBlock({ lang: "json", title: "The policy used in the examples below", code: json(DEMO_POLICY) })}
<p>To convert a price into atomic units, multiply by ten to the power of the token's decimals: 0.01 USDC with 6 decimals is 0.01 × 1,000,000 = 10,000. Keep the amount a string, because 18-decimal tokens overflow the integers JavaScript can represent exactly.</p>
<p>The policy bounds one payment at a time. Daily or cumulative budgets, retries and rate of spend are enforced elsewhere, in the wallet or the agent runtime; the <a href="/learn/agent-spending-policy">agent spending policy guide</a> covers where each belongs.</p>
<p>Two rules follow from the table. First, <code>max_amount</code> only makes sense together with <code>assets</code>: <code>"10000000"</code> is 10 USDC (6 decimals) but 0.1 of an 8-decimal token such as WBTC. If you allow several assets, list only ones with the same decimals and similar value, or run separate policies. Second, <code>assets</code> only makes sense together with <code>networks</code>, because a contract address identifies a token on one chain only.</p>
<p>That is why the Settlens decision can be <code>pay</code> only when the policy sets all four of <code>pay_to</code>, <code>assets</code>, <code>networks</code> and <code>max_amount</code>. With anything less, every check can pass and the answer is still <code>review</code>: the payment is not bounded, so a person should look.</p>
<h3>One policy, several options</h3>
<p>A 402 can advertise several options, for example the same price on two chains, and the agent pays with one. The policy is therefore applied to each option separately. An option is acceptable when it is well formed and satisfies every constraint; the tool returns the acceptable ones in <code>acceptable</code>, and the check ${id("policy.acceptable_option")} fails, with severity high, when none qualifies. One bad option does not block a good one, and the agent learns exactly which options it may use.</p>

<h2>A worked example</h2>
<p>The <a href="/docs/quickstart">quickstart</a> starts a local demo server whose <code>/secure</code> route answers with the challenge shown earlier. An agent connected to the Settlens MCP server sends this call on receiving it:</p>
${codeBlock({ lang: "json", title: "tools/call evaluate_payment_requirements", code: json(PAY.request) })}
<p>The answer is <code>${PAY.result.decision}</code>, with ${PAY.result.acceptable.length} acceptable option and ${PAY.result.checks.length} checks, all passing. The summary reads: "${PAY.result.summary}"</p>
<p>Change one input at a time and the decision moves. These are the server's real answers for the same challenge:</p>
${table({
  caption: "Same challenge, different inputs",
  head: ["Input", "Decision", "Reasons"],
  rows: [
    ["The policy above", code(PAY.result.decision), reasonOf(PAY)],
    [html`${code("max_amount")} lowered to ${code("5000")}`, code(OVER_BUDGET.result.decision), reasonOf(OVER_BUDGET)],
    [html`Policy reduced to ${code("max_amount")}`, code(UNBOUNDED.result.decision), reasonOf(UNBOUNDED)],
    [html`No ${code("resource_url")}`, code(NO_URL.result.decision), reasonOf(NO_URL)],
    [html`${code("resource_url")} of another path`, code(WRONG_URL.result.decision), reasonOf(WRONG_URL)],
  ],
  rowHeaders: true,
})}
<p>Each row tells the agent something different. Over budget is a hard stop. An incomplete policy is a question for a human. A missing URL means the binding could not be confirmed, so the tool will not say <code>pay</code>. A URL mismatch means the payment would be for something other than what was requested.</p>
<h3>Three options, one acceptable</h3>
<p>To see the per-option rule, take the same challenge with two more options: the same token at ${OPTIONS[1].amount} units, and USDC on Base mainnet (<code>${OPTIONS[2].network}</code>), which the policy does not allow.</p>
${diagram({
  svg: OPTIONS_SVG,
  size: "wide",
  label: `Three payment options pass through one policy. Option 1, exact on ${OPTIONS[0].network} for ${OPTIONS[0].amount} units, is acceptable. Option 2, for ${OPTIONS[1].amount} units, is rejected for max_amount. Option 3, on ${OPTIONS[2].network} with another asset, is rejected for networks and assets. policy.acceptable_option passes with 1 of 3 options.`,
  caption: "The policy is applied to each advertised option; only option 1 can be paid.",
})}
<p>The real answer is <code>${MULTI.result.decision}</code>, with exactly one entry in <code>acceptable</code>. The deciding check reports "${MULTI_TALLY}" The per-constraint summaries (${id("policy.network")}, ${id("policy.asset")}, ${id("policy.maximum_amount")}) are warnings of severity info: they explain what was filtered out and do not change the decision.</p>

<h2>Wiring it into an agent</h2>
<p>The public endpoint offers the offline tools without installation. In Claude Code:</p>
${codeBlock({ lang: "shell", title: "Connect the remote endpoint", code: "claude mcp add --transport http settlens https://settlens.com/mcp" })}
<p>On connection, the server sends instructions, which clients that support them pass to the model: call <code>evaluate_payment_requirements</code> on every 402 before paying, and act on the decision as described above. The <code>x402_preflight</code> prompt walks an agent through the same steps for one URL. Then close the loop in code:</p>
<ol>
<li>Request the resource without a payment header.</li>
<li>On a 402, call the tool with the raw header value, the exact URL you requested and your policy.</li>
<li>On <code>do_not_pay</code>, stop and log the reasons. On <code>review</code>, show them to a person and wait.</li>
<li>On <code>pay</code>, sign one option from <code>acceptable</code> with your own wallet tooling, and have that tooling refuse anything else.</li>
</ol>
<p>To see the decision for a real 402 before writing any agent code, paste its <code>PAYMENT-REQUIRED</code> header into the <a href="/tools/x402-checker">x402 payment request checker</a>, which runs the same tool from your browser. If the terms or the policy should not leave your infrastructure, run the same server locally over stdio; pilot participants receive the source. The <a href="/docs/mcp">MCP reference</a> lists every field, error and limit.</p>

<h2>What a preflight does not tell you</h2>
<p>A preflight reads terms. It is deliberately narrow, and its limits matter as much as its checks.</p>
<ul>
<li><strong>It does not see behavior.</strong> Whether the resource refuses an invalid payment, or the facilitator rejects an invalid signature, takes a live, authorized test. That is what an <a href="/product/assess">assessment</a> of the endpoint is for, run by its owner.</li>
<li><strong>It does not look on-chain.</strong> No balances, no nonce reuse or replay, no settlement status, and nothing about what the token contract at <code>asset</code> actually does.</li>
<li><strong>It does not vouch for the merchant.</strong> <code>pay</code> means the request is well formed, bound to your URL and inside your policy. It says nothing about whether the content is worth the price.</li>
<li><strong>It covers x402 over HTTP.</strong> In the x402 MCP transport, a paid tool returns its terms in a tool result and the payment travels in <code>_meta["x402/payment"]</code>. The tool does not support that transport: the specification's own example names an <code>mcp://</code> resource, which Settlens rejects in ${id("schema.payment_required")}, and gets <code>${X402_OVER_MCP.result.decision}</code>.</li>
<li><strong>It is only as good as the policy.</strong> An allowlisted recipient you never verified, or a ceiling set too high, is approved exactly as written.</li>
</ul>
${callout({ tone: "note", title: "Takeaway", body: html`<p>Give the agent a tool, not a rule in its prompt. Bound the recipient, the token, the chain and the amount. Pay only an option the tool returned as acceptable, and make the signing code enforce it. Start on <a href="/mcp">the MCP server page</a>.</p>` })}`;
}
