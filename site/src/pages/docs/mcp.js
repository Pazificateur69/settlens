// MCP server reference. Tool, resource and prompt tables come from the running server
// (tools/list, resources/list, prompts/list), transport limits from src/mcp-http.js, and every
// example response is produced by the server code at build time, so this page cannot drift.

import { CHECK_CATALOG } from "../../../../src/catalog.js";
import { DEFAULT_REPEAT, DEFAULT_TIMEOUT_MS, MAX_HEADER_LENGTH, MAX_RESPONSE_BODY_BYTES, OFFICIAL_X402_CORE_VERSION, VERSION } from "../../../../src/constants.js";
import { createMcpServer, LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "../../../../src/mcp.js";
import {
  DEMO_HEADER,
  DEMO_OPTION,
  DEMO_POLICY,
  DEMO_URL,
  evaluate,
  exchange,
  expectDecision,
  INIT,
  isNetworkTool,
  NETWORK_TOOLS,
  OFFLINE_TOOLS,
  PROMPTS,
  RESOURCE_TEMPLATES,
  RESOURCES,
  rpcResult,
  SOURCES,
  TOOLS,
  words,
  X402_OVER_MCP,
} from "../mcp.js";
import { repoFile, schemaTable } from "./_shared.js";

export const meta = {
  path: "/docs/mcp",
  title: "MCP server reference: tools, transports, errors",
  label: "MCP reference",
  heading: "MCP server reference",
  lede: "Every tool, resource and prompt of the Settlens MCP server with its inputs and outputs, the stdio and Streamable HTTP transports, authentication, limits and errors.",
  description: "Settlens MCP reference: tool inputs and outputs, resources, the x402_preflight prompt, stdio and HTTP transports, authentication, limits, errors and sessions.",
  section: "docs",
  lastmod: "2026-10-13",
  summary: `The Settlens MCP server has ${TOOLS.length} read-only tools over stdio and Streamable HTTP: ${OFFLINE_TOOLS.length} offline tools, public at https://settlens.com/mcp, and ${NETWORK_TOOLS.length} passive network tools that need a token there. evaluate_payment_requirements answers pay, review or do_not_pay; pay needs pay_to, assets, networks and max_amount in the policy.`,
  sources: [SOURCES.mcpTools, SOURCES.mcpTransports, { title: "JSON-RPC 2.0 specification", url: "https://www.jsonrpc.org/specification", publisher: "JSON-RPC Working Group" }, SOURCES.x402, SOURCES.x402Http, SOURCES.x402Mcp],
  order: 7.5,
  icon: "chip",
};

/* ---------- Values read from the transport source, so limits cannot drift ---------- */

const HTTP_SOURCE = repoFile("src/mcp-http.js");
function pick(pattern, what, source = HTTP_SOURCE, file = "src/mcp-http.js") {
  const match = pattern.exec(source);
  if (!match) throw new Error(`docs/mcp.js: ${what} not found in ${file}; update the transport section.`);
  return match;
}
const ALLOWED_ORIGINS = JSON.parse(`[${pick(/allowedOrigins = \[([^\]]*)\]/, "allowedOrigins default")[1]}]`);
const MAX_BODY_BYTES = Number(pick(/maxBodyBytes = ([\d_]+)/, "maxBodyBytes default")[1].replaceAll("_", ""));
const [, RATE_MAX, RATE_WINDOW] = pick(/rateLimit = \{ max: (\d+), windowMs: ([\d_]+) \}/, "rateLimit default");
const RATE_WINDOW_SECONDS = Number(RATE_WINDOW.replaceAll("_", "")) / 1000;
const CORS_HEADERS = pick(/ALLOWED_HEADERS = "([^"]+)"/, "ALLOWED_HEADERS")[1];
const MAX_BATCH = Number(pick(/const MAX_BATCH = (\d+);/, "MAX_BATCH", repoFile("src/mcp.js"), "src/mcp.js")[1]);
const MAX_JSON_DEPTH = Number(pick(/const MAX_JSON_DEPTH = (\d+);/, "MAX_JSON_DEPTH", repoFile("src/protocol.js"), "src/protocol.js")[1]);
// The defaults above are what the site serves only while site/server.js does not override them.
const MOUNT = pick(/createMcpHttpHandler\(\{([^}]*)\}\)/, "the /mcp mount", repoFile("site/server.js"), "site/server.js")[1];
if (/allowedOrigins|maxBodyBytes|rateLimit/.test(MOUNT)) throw new Error("docs/mcp.js: site/server.js now overrides the MCP transport defaults; update the limits on this page.");

/* ---------- Examples produced by the server code ---------- */

const json = (value) => JSON.stringify(value, null, 2);
const OVER_BUDGET = expectDecision(await evaluate({ policy: { ...DEMO_POLICY, max_amount: "5000" }, id: 3 }), "do_not_pay", "docs/mcp.js (max_amount 5000)");
const INVALID_ARGS = await exchange("tools/call", { name: "evaluate_payment_requirements", arguments: { payment_required: DEMO_HEADER, policy: { max_amount: "0.01 USDC" } } }, 7);
const TOOL_FAILURE = await exchange("tools/call", { name: "verify_payment_signature", arguments: { requirement: DEMO_OPTION, payload: "not base64!" } }, 8);
const UNKNOWN_METHOD = await exchange("completion/complete", {}, 9);
const MISSING_RESOURCE = await exchange("resources/read", { uri: "settlens://checks/no.such_check" }, 10);
const CHECK_RESOURCE = await rpcResult("resources/read", { uri: "settlens://checks/binding.resource_url" });
const PROMPT = await rpcResult("prompts/get", { name: "x402_preflight", arguments: { url: "https://merchant.example/paid" } });
const PROMPT_TEXT = PROMPT.messages[0].content.text;
// src/mcp.js's prompt calls networks optional although decide() needs it for pay; the note goes away once the prompt lists it.
const PROMPT_OMITS_NETWORKS = !/at least[^;.]*networks/.test(PROMPT_TEXT);
const LIST_BINDING = await exchange("tools/call", { name: "list_checks", arguments: { category: "binding" } }, 2);
// The public HTTP endpoint runs this configuration (src/mcp-http.js without a matching token).
const PUBLIC = createMcpServer({ mode: "remote", allowNetworkTools: false });
const PUBLIC_SCAN = await PUBLIC.handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "scan_endpoint", arguments: { url: "https://merchant.example/paid" } } });
for (const [name, response, code] of [["invalid arguments", INVALID_ARGS.response, -32602], ["unknown method", UNKNOWN_METHOD.response, -32601], ["missing resource", MISSING_RESOURCE.response, -32002], ["public scan_endpoint", PUBLIC_SCAN, -32602]]) {
  if (response.error?.code !== code) throw new Error(`docs/mcp.js: ${name} no longer returns JSON-RPC error ${code}: ${JSON.stringify(response)}`);
}
if (TOOL_FAILURE.response.result?.isError !== true) throw new Error("docs/mcp.js: a failing tool no longer returns isError: true.");

const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));
const EVALUATE = toolByName.get("evaluate_payment_requirements");
const LIST_CHECKS = toolByName.get("list_checks");
if (!EVALUATE || !LIST_CHECKS) throw new Error("docs/mcp.js: evaluate_payment_requirements or list_checks is missing from tools/list.");
const POLICY_NODE = EVALUATE.inputSchema.properties.policy;
const CHECK_NODE = EVALUATE.outputSchema.properties.checks.items;
const CATALOG_NODE = LIST_CHECKS.outputSchema.properties.checks.items;

// Meaning of output fields (output schemas carry types only). Keyed by tool, then field path.
const SHARED_DECISION = {
  decision: "pay, review or do_not_pay, from the decision rules above.",
  summary: "One sentence to show the human.",
  reasons: 'Why the decision is not pay: one line per deciding check ("<check id>: <message>") or the missing policy fields. Empty for pay.',
  acceptable: "The advertised options (accepts entries) that are well formed and satisfy every policy constraint you set. Always empty for do_not_pay. Pay with one of these only.",
};
const OUTPUT_NOTES = {
  evaluate_payment_requirements: {
    ...SHARED_DECISION,
    checks: "Every check evaluated, including the per-constraint policy summaries and policy.acceptable_option (see check result).",
  },
  verify_payment_signature: {
    scheme: "Always exact for this tool.",
    verified: "True only when the signature, recipient, amount and time window all hold.",
    signatureValid: "The recovered signer equals authorization.from.",
    recovered: "The recovered signer address, or null when no signature could be recovered.",
    recipientBound: "authorization.to equals the requirement's payTo. Omitted when the payload has no signature or authorization.",
    amountBound: "authorization.value equals the requirement's amount. Omitted in the same cases.",
    fresh: "checkedAt is inside validAfter and validBefore. Omitted in the same cases.",
    reasons: "Why verification failed; empty when verified.",
    checkedAt: "The Unix time, in seconds, used for the window check.",
  },
  verify_solana_transaction: {
    scheme: "Always exact-solana for this tool.",
    version: "legacy or v0. Omitted when the transaction carries no signature.",
    signatureCount: "Number of signature slots in the transaction, empty ones included. Omitted in the same case.",
    feePayer: "Base58 fee-payer public key, or null when the transaction carries no signature.",
    feePayerPending: "True while the fee payer's slot (slot 0) is empty, as in an x402 payload before the facilitator signs at settlement. Omitted when the transaction carries no signature.",
    payment: "Present only with a reviewed requirement. Separate conservative offline instruction result: status, verified, checks, transfers and explicit limitations. Unresolved lookup accounts, unknown/CPI programs and Token-2022 effects cannot be verified offline.",
    pendingSigners: "Base58 public keys of the signer slots that are still empty (all zero). Omitted in the same case.",
    signatureValid: "At least one signature is present and every present signature verifies over the message with ed25519. Empty slots are pending, not invalid.",
    verified: "Signature-only: signatureValid and matching required slot count. This never proves a correct or settled payment.",
    reasons: "Why verification failed; empty when verified.",
  },
  verify_report: {
    valid: "The recomputed digest equals the digest stored in the report.",
    expected: "The digest stored in the report's integrity block, or null without one.",
    actual: "The digest recomputed from the report content, or null.",
    reason: "One sentence explaining the result.",
  },
  verify_attestation: {
    valid: "The signature is valid, the report matches when one was supplied, and the signer equals expected_public_key when one was supplied.",
    signatureValid: "The ed25519 signature verifies with the attestation's public key.",
    reportMatches: "The supplied report is intact and is the one attested; null when no report was supplied.",
    publicKeyMatches: "The attestation's publicKey equals expected_public_key; null when none was supplied.",
    publicKey: "The signer's public key from the attestation, or null.",
    attestedAt: "The attestation timestamp, or null.",
    reasons: "Why verification failed; empty when valid.",
  },
  list_checks: {
    count: "Number of checks returned.",
    checks: "Catalog entries (see catalog entry).",
  },
  scan_endpoint: {
    url: "The scanned URL, sanitized.",
    httpStatus: "Status of the first response, or null when no response was received.",
    mode: "Always passive.",
    ...SHARED_DECISION,
    counts: "Number of checks per status, over the scan and policy checks.",
    "counts.pass": "Passing checks.",
    "counts.fail": "Failing checks.",
    "counts.warn": "Warnings.",
    "counts.skip": "Skipped checks.",
    issues: "The failing and warning checks (see check result).",
    paymentRequirements: "The accepts entries of the first response that are objects, at most 32.",
    reportId: "Identifier of the report built for this scan.",
    reportDigest: "SHA-256 digest of that report. It covers the server's terms, not your policy.",
  },
  scan_facilitator: {
    url: "The facilitator URL that was read, sanitized.",
    httpStatus: "Status of GET /supported, or null when no response was received.",
    ok: "No check failed.",
    counts: "Number of checks per status.",
    "counts.pass": "Passing checks.",
    "counts.fail": "Failing checks.",
    "counts.warn": "Warnings.",
    "counts.skip": "Skipped checks.",
    issues: "The failing and warning checks (see check result).",
    supportedKinds: "Up to 100 advertised kinds, each with x402Version, scheme and network.",
    extensions: "Extensions the facilitator advertises.",
    signerNetworks: "Network patterns that have signer metadata, for example eip155:*.",
    reportId: "Identifier of the report built for this scan.",
    reportDigest: "SHA-256 digest of that report.",
  },
};
const CHECK_NOTES = {
  id: "Check id; settlens://checks/<id> explains it.",
  title: "Short title.",
  status: "Outcome of the check.",
  severity: "How serious a failure is. A high or critical failure, other than a per-constraint policy summary, makes the decision do_not_pay.",
  message: "What was observed: one line, control characters removed, at most 300 characters.",
  recommendation: "How to fix it, when the check did not pass.",
};
const CATALOG_NOTES = {
  id: "Check id.",
  title: "Short title.",
  category: "First segment of the id.",
  mode: "offline, passive, active or facilitator.",
  severity: "Default severity.",
  verifies: "What the check verifies.",
  why: "Why it matters.",
  fix: "How to fix a failure.",
  spec: "Specification the check refers to, or empty.",
  specUrl: "Link to that specification, or empty.",
};

// Plain-language display of the two MCP patterns (schemaTable prints unknown patterns as regexes).
// The length bounds stay in the schema; the URL rule's "no whitespace" is stated in the prose.
const FRIENDLY_PATTERNS = { "^[0-9]{1,78}$": "^[0-9]+$", "^[Hh][Tt][Tt][Pp][Ss]?://\\S+$": "^https?://" };
const friendly = (schema) => JSON.parse(JSON.stringify(schema), (key, value) => (key === "pattern" ? FRIENDLY_PATTERNS[value] ?? value : value));

const ANNOTATION_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const kib = (bytes) => `${bytes / 1024} KiB`;

export default function render(ctx) {
  const { html, table, codeBlock, callout, keyValues, badge } = ctx;
  const code = (text) => html`<code>${text}</code>`;
  const list = (items, last = "and") => html`${items.map((item, index) => html`${index ? (index === items.length - 1 ? ` ${last} ` : ", ") : ""}${code(item)}`)}`;
  const sentence = (text) => (/[.?!]$/.test(text) ? text : `${text}.`);
  const staticResources = RESOURCES.filter((resource) => !resource.uri.startsWith("settlens://checks/"));
  const checkResources = RESOURCES.length - staticResources.length;

  const toolSection = (tool) => html`<h3 id="${tool.name}"><code>${tool.name}</code></h3>
<p>${badge(isNetworkTool(tool) ? "Network, passive" : "Offline", { tone: isNetworkTool(tool) ? "warning" : "accent" })} ${sentence(tool.title)}${isNetworkTool(tool) ? " On the remote endpoint, only with a token." : ""}</p>
<p>${tool.description}</p>
<p>Annotations: ${ANNOTATION_KEYS.map((key, index) => html`${index ? ", " : ""}${code(`${key}: ${tool.annotations[key]}`)}`)}.</p>
${schemaTable(ctx, { root: friendly(tool.inputSchema), node: friendly(tool.inputSchema), caption: `${tool.name} arguments` })}
${schemaTable(ctx, { root: tool.outputSchema, node: tool.outputSchema, caption: `${tool.name} structuredContent`, descriptions: OUTPUT_NOTES[tool.name] ?? {} })}`;

  return html`<p>The Settlens MCP server lets an AI agent check an x402 payment request before it pays, and verify payments, reports and attestations, from any <a href="https://modelcontextprotocol.io">Model Context Protocol</a> client. This reference is generated from the server code of Settlens ${VERSION} when the site is built: the tables are the server's own <code>tools/list</code>, <code>resources/list</code> and <code>prompts/list</code> answers, and every example response was produced by it.</p>
<p>For an overview and setup in one page, see <a href="/mcp">the MCP server</a>. For the reasoning behind the policy fields, read the <a href="/learn/agent-spending-policy">agent spending policy guide</a> and <a href="/blog/mcp-verify-before-paying">why agents should verify before paying</a>. To try <code>evaluate_payment_requirements</code> without a client, use the <a href="/tools/x402-checker">x402 payment request checker</a> in your browser.</p>
${keyValues([
  { term: "Server name", value: html`${code(INIT.serverInfo.name)} (${INIT.serverInfo.title}), version ${INIT.serverInfo.version}` },
  { term: "Protocol revisions", value: html`${list(SUPPORTED_PROTOCOL_VERSIONS)}; ${code(LATEST_PROTOCOL_VERSION)} when the client asks for another one` },
  { term: "Transports", value: html`stdio (${code("settlens mcp")}) and Streamable HTTP at ${code("https://settlens.com/mcp")}` },
  { term: "Capabilities", value: html`${list(Object.keys(INIT.capabilities))}, none of which change at runtime` },
  { term: "Tools", value: `${TOOLS.length}: ${OFFLINE_TOOLS.length} offline, ${NETWORK_TOOLS.length} network (passive only)` },
  { term: "Never", value: "signs, pays, settles, broadcasts, holds funds or needs a wallet or payment key" },
])}

<h2 id="connect">Connect</h2>
<p>The remote endpoint needs nothing installed. The local server runs from the Settlens source, which pilot participants receive (Node.js 20.19 or newer, then <code>npm ci --ignore-scripts</code>).</p>
${table({
  caption: "Where each tool is available",
  head: ["Setup", "Command or URL", "Tools"],
  rows: [
    ["Remote, public", code("https://settlens.com/mcp"), `${OFFLINE_TOOLS.length} offline tools`],
    ["Remote, with token", html`${code("https://settlens.com/mcp")} + ${code("Authorization: Bearer <token>")}`, `All ${TOOLS.length}`],
    ["Local stdio", code("node src/cli.js mcp"), html`All ${TOOLS.length}, with no destination restriction`],
    ["Container", code("docker run -i --rm settlens:local mcp"), html`All ${TOOLS.length} (stdio; keep ${code("-i")})`],
  ],
  rowHeaders: true,
})}
${codeBlock({ lang: "shell", title: "Claude Code", code: `# Remote, offline tools
claude mcp add --transport http settlens https://settlens.com/mcp

# Remote, with the network tools
claude mcp add --transport http settlens https://settlens.com/mcp \\
  --header "Authorization: Bearer \${SETTLENS_API_TOKEN}"

# Local stdio, every tool
claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp` })}
${codeBlock({ lang: "json", title: "claude_desktop_config.json (local stdio)", code: json({ mcpServers: { settlens: { command: "node", args: ["/absolute/path/to/settlens/src/cli.js", "mcp"] } } }) })}
<p>Claude Desktop reads that file from <code>~/Library/Application Support/Claude/</code> on macOS and <code>%APPDATA%\\Claude\\</code> on Windows; restart it after editing. On Windows, escape backslashes in the path (<code>"C:\\\\settlens\\\\src\\\\cli.js"</code>).</p>

<h2 id="agent-workflow">Agent workflow</h2>
<p>The server sends these instructions to the client in its <code>initialize</code> result, so a capable client tells the model when to call it:</p>
<blockquote><p>${INIT.instructions}</p></blockquote>
<ol>
<li>Request the paid URL without any payment header.</li>
<li>On HTTP 402, read the <code>PAYMENT-REQUIRED</code> header.</li>
<li>Call <a href="#evaluate_payment_requirements"><code>evaluate_payment_requirements</code></a> with <code>payment_required</code> (the raw header value), <code>resource_url</code> (the exact URL requested) and <code>policy</code>.</li>
<li><code>do_not_pay</code>: never pay. <code>review</code>: show the summary and reasons, wait for explicit approval. <code>pay</code>: pay with one entry of <code>acceptable</code> only, using your own wallet tooling.</li>
</ol>
${callout({ tone: "warning", title: "Enforce the decision outside the model", body: html`<p>The decision is advice to the model. If your agent can pay, make the payment tool itself refuse unless the last decision for that URL was <code>pay</code> and the chosen option is in <code>acceptable</code>.</p>` })}

<h2 id="decision-rules">Decision rules</h2>
<p>A PaymentRequired usually advertises several options in <code>accepts</code>, and the agent pays with one. The server's terms are judged as a whole (decoding, the official <code>@x402/core ${OFFICIAL_X402_CORE_VERSION}</code> schema, the V2 shape, the <code>resource.url</code> binding, well-formed options, duplicates, authorization windows). The policy is applied to each option:</p>
<ul>
<li>An option is <em>acceptable</em> when it is well formed and satisfies every policy constraint you set.</li>
<li><code>policy.acceptable_option</code> (high) passes when at least one option is acceptable. Its message counts the rejected options by constraint.</li>
<li>The per-constraint checks <code>policy.scheme</code>, <code>policy.network</code>, <code>policy.recipient</code>, <code>policy.asset</code> and <code>policy.maximum_amount</code> only summarize: <code>pass</code> when every option complies, <code>warn</code> (severity info) when some do not, <code>fail</code> when none does. They never decide on their own.</li>
</ul>
<p>The decision, for <code>evaluate_payment_requirements</code> and <code>scan_endpoint</code> alike:</p>
<ol>
<li>Any failing check of severity high or critical (<code>policy.acceptable_option</code> included, the per-constraint summaries excluded): <code>do_not_pay</code>, and <code>acceptable</code> is empty.</li>
<li>Otherwise, any failing or warning check other than the per-constraint summaries: <code>review</code>. A missing <code>resource_url</code> lands here, because <code>binding.resource_url</code> becomes a medium warning.</li>
<li>Otherwise, when no option could be evaluated against the policy: <code>review</code>.</li>
<li>Otherwise, when the policy does not set <code>pay_to</code>, <code>assets</code>, <code>networks</code> and <code>max_amount</code>: <code>review</code>, with a reason naming the missing fields.</li>
<li>Otherwise: <code>pay</code>, with an option from <code>acceptable</code> only.</li>
</ol>
${callout({ tone: "note", title: "x402 over HTTP only", body: html`<p>The tools evaluate x402 over HTTP. x402 carried over MCP itself, where a paid tool answers with <code>isError</code> and a PaymentRequired in <code>structuredContent</code> and the client pays in <code>_meta["x402/payment"]</code>, is not supported. The transport's own example names an <code>mcp://</code> resource: <code>schema.payment_required</code> rejects it, because Settlens requires an absolute http(s) <code>resource.url</code> where the x402 specification sets no scheme, so the decision is <code>${X402_OVER_MCP.result.decision}</code>. <code>resource_url</code> accepts only http(s) URLs.</p>` })}
<p>The CLI keeps the stricter rule meant for merchants: in <code>settlens scan</code>, every advertised option must be within the configured policy (see <a href="/docs/configuration">configuration</a>).</p>
<h3 id="policy">The policy object</h3>
<p>Optional on both tools that take it; no other fields are accepted. Atomic units: USDC has 6 decimals, so <code>"10000"</code> is 0.01 USDC.</p>
${schemaTable(ctx, { root: friendly(POLICY_NODE), node: friendly(POLICY_NODE), caption: "policy fields" })}
<p>The same values are validated as a <a href="/docs/configuration">configuration file</a> policy; a value the schema accepts but that validation rejects makes the call fail with <code>isError</code>. With several assets, <code>max_amount</code> applies to each in its own decimals: list only assets with the same decimals.</p>

<h2 id="tools">Tools</h2>
${table({
  caption: "Tools at a glance",
  head: ["Tool", "Mode", "Remote access", "Summary"],
  rows: TOOLS.map((tool) => [html`<a href="#${tool.name}">${tool.name}</a>`, isNetworkTool(tool) ? "network, passive" : "offline", isNetworkTool(tool) ? "token" : "public", tool.title]),
  rowHeaders: true,
})}
<p>Arguments use snake_case; URL arguments may not contain whitespace. A call whose arguments do not match the input schema is rejected with JSON-RPC error <code>-32602</code> before the tool runs. Every successful result carries <code>structuredContent</code>, matching the tool's output schema, and the same JSON as one text content block.</p>
${TOOLS.map(toolSection)}
<h3 id="shared-shapes">Shared shapes</h3>
${schemaTable(ctx, { root: CHECK_NODE, node: CHECK_NODE, caption: "check result (items of checks and issues)", descriptions: CHECK_NOTES })}
${schemaTable(ctx, { root: CATALOG_NODE, node: CATALOG_NODE, caption: "catalog entry (items of list_checks checks)", descriptions: CATALOG_NOTES })}
<h3 id="evaluate-example">Example: an over-budget request</h3>
<p>The bundled demo resource (<code>npm run demo:server</code>) asks for <code>${DEMO_OPTION.amount}</code> atomic units on <code>${DEMO_OPTION.network}</code>. With <code>max_amount</code> at <code>5000</code>, no option is acceptable:</p>
${codeBlock({ lang: "json", title: "tools/call request", code: json(OVER_BUDGET.request), wrap: true })}
${codeBlock({ lang: "json", title: "result.structuredContent", code: json(OVER_BUDGET.result), wrap: true })}

<h2 id="resources">Resources</h2>
${table({
  caption: "Resources",
  head: ["URI", "Type", "Content"],
  rows: [
    ...staticResources.map((resource) => [code(resource.uri), resource.mimeType, resource.description]),
    ...RESOURCE_TEMPLATES.map((template) => [code(template.uriTemplate), template.mimeType, `${template.description} Template from resources/templates/list.`]),
  ],
  rowHeaders: true,
})}
<p><code>resources/list</code> returns the ${staticResources.length} fixed resources and one <code>settlens://checks/{id}</code> entry per check (${checkResources}, the full <a href="/docs/checks">check catalog</a> of ${CHECK_CATALOG.length} ids). An unknown URI returns error <code>-32002</code>.</p>
${codeBlock({ lang: "text", title: "resources/read settlens://checks/binding.resource_url", code: CHECK_RESOURCE.contents[0].text, wrap: true })}

<h2 id="prompts">Prompts</h2>
${table({
  caption: "Prompts",
  head: ["Name", "Arguments", "Description"],
  rows: PROMPTS.map((prompt) => [code(prompt.name), html`${prompt.arguments.map((argument, index) => html`${index ? ", " : ""}${code(argument.name)}${argument.required ? " (required)" : ""}: ${argument.description}`)}`, prompt.description]),
  rowHeaders: true,
})}
<p>The URL must be an http(s) URL without whitespace. The message returned by <code>prompts/get</code> for <code>https://merchant.example/paid</code>:</p>
${codeBlock({ lang: "text", title: "x402_preflight", code: PROMPT_TEXT, wrap: true })}
${PROMPT_OMITS_NETWORKS ? html`<p>The prompt calls <code>networks</code> optional, but a <code>pay</code> decision also needs it: put <code>networks</code> in the policy as well (see the <a href="#decision-rules">decision rules</a>).</p>` : ""}

<h2 id="transports">Transports</h2>
<h3 id="stdio">stdio</h3>
<p><code>settlens mcp</code> (or <code>node src/cli.js mcp</code>) reads one JSON-RPC message per line on stdin and writes one per line on stdout. Stdout carries protocol messages only; diagnostics go to stderr. Requests are handled concurrently, so responses can arrive in a different order than the requests: match them by <code>id</code>. The process exits when its client closes stdin.</p>
<p>The local server includes the network tools and applies no destination restriction, so you can scan a test server on <code>127.0.0.1</code>. Only the client that launched the process can talk to it.</p>
<h3 id="streamable-http">Streamable HTTP</h3>
<p><code>https://settlens.com/mcp</code> implements MCP Streamable HTTP in stateless JSON-response mode: one endpoint, <code>POST</code> only, no session id, no SSE stream. Send <code>Content-Type: application/json</code> and an <code>Accept</code> header that allows <code>application/json</code>. <code>MCP-Protocol-Version</code> is optional; when present it must be one of ${list(SUPPORTED_PROTOCOL_VERSIONS, "or")}.</p>
<p>On settlens.com, a <code>GET</code> or <code>HEAD</code> of <code>/mcp</code> whose <code>Accept</code> does not include <code>text/event-stream</code>, from a browser, crawler or link checker, receives <a href="/mcp">the MCP web page</a>. Every other request goes to the MCP transport.</p>
${table({
  caption: "HTTP status codes of /mcp",
  head: ["Status", "When", "Body"],
  rows: [
    ["200", "A JSON-RPC request or batch was handled, including tool results with isError and JSON-RPC errors that carry an id.", "JSON-RPC response or array"],
    ["202", "The body held only notifications or client responses.", "None"],
    ["204", html`${code("OPTIONS")} (CORS preflight). Allows ${code("POST, OPTIONS")} and the headers ${code(CORS_HEADERS)}.`, "None"],
    ["400", html`Parse error (${code("-32700")}), unsupported ${code("MCP-Protocol-Version")} (${code("-32600")}), or a message rejected without an id, such as an empty batch.`, "JSON-RPC error, id null"],
    ["403", html`An ${code("Origin")} header that is not allowed.`, html`${code('{"error":"Origin not allowed."}')}`],
    ["405", html`A ${code("GET")} or ${code("HEAD")} whose ${code("Accept")} asks for ${code("text/event-stream")} (an SSE request), or any other method than ${code("GET")}, ${code("HEAD")}, ${code("POST")} and ${code("OPTIONS")}, such as ${code("DELETE")}. ${code("Allow: POST")}.`, "JSON error"],
    ["406", html`${code("Accept")} does not allow ${code("application/json")}.`, "JSON error"],
    ["413", `Body larger than ${kib(MAX_BODY_BYTES)}.`, "JSON error"],
    ["415", html`${code("Content-Type")} is not ${code("application/json")}.`, "JSON error"],
    ["429", html`More than ${RATE_MAX} requests in ${RATE_WINDOW_SECONDS} seconds from one client IP, where each JSON-RPC message counts (a batch of n counts n). ${code("Retry-After")} gives the seconds to wait.`, "JSON error"],
    ["500", "Unexpected server error.", html`JSON-RPC error ${code("-32603")}`],
  ],
  rowHeaders: true,
})}
<p>Checks run in this order: origin, method, rate limit, content type, <code>Accept</code>, protocol version, size, then JSON parsing. Responses carry <code>Cache-Control: no-store</code>.</p>
<h3 id="origin">Origin rule</h3>
<p>Requests without an <code>Origin</code> header, which is what MCP clients outside a browser send, are accepted. A browser request is accepted only from ${list(ALLOWED_ORIGINS)}, so the <a href="/tools/x402-checker">x402 payment request checker</a> on settlens.com can call it from your browser; any other origin gets <code>403</code>. This blocks DNS-rebinding and cross-site calls; allowed origins get <code>Access-Control-Allow-Origin</code> back.</p>
<h3 id="protocol">Protocol versions and batches</h3>
<p>The server implements revision ${code(LATEST_PROTOCOL_VERSION)} and answers <code>initialize</code> with the client's requested revision when it is one of ${list(SUPPORTED_PROTOCOL_VERSIONS, "or")}, otherwise with ${code(LATEST_PROTOCOL_VERSION)}. JSON-RPC batches of 1 to ${MAX_BATCH} messages are accepted, as revision 2025-03-26 requires; their entries run one after another and the answer is an array. Notifications, such as <code>notifications/initialized</code>, are never answered.</p>

<h2 id="authentication">Authentication</h2>
<p>The offline tools, resources and prompt need no authentication. ${list(NETWORK_TOOLS.map((tool) => tool.name))} are listed by <code>tools/list</code> and callable only when the request carries <code>Authorization: Bearer &lt;token&gt;</code> matching the site's API token, the same token as the <a href="/docs/api">HTTP scan API</a>. The comparison is done in constant time on SHA-256 digests. Tokens are issued to pilot participants: <a href="/contact">request a pilot</a>.</p>
<p>A missing or wrong token is not an HTTP error: the request is served by the public tool set, the network tools are absent from <code>tools/list</code>, and calling one returns:</p>
${codeBlock({ lang: "json", title: "tools/call scan_endpoint without a token", code: json(PUBLIC_SCAN), wrap: true })}
<p>Before any remote network request, the server refuses non-HTTP(S) URLs, ports other than 80 and 443, URLs with credentials, <code>localhost</code>, <code>.local</code> and <code>.internal</code> names, and hosts whose address, literal or resolved, is private, loopback, link-local, CGNAT, reserved, multicast or used for documentation, including IPv4 addresses embedded in IPv6. Redirects are never followed. The <a href="/docs/security">security model</a> covers the remaining assumptions.</p>

<h2 id="limits">Limits</h2>
${table({
  caption: "Limits",
  head: ["Limit", "Value", "Applies to"],
  rows: [
    ["Rate limit", `${RATE_MAX} requests per ${RATE_WINDOW_SECONDS} seconds per client IP; each JSON-RPC message counts, so a batch of n counts n`, "HTTP endpoint, every POST"],
    ["Request body", kib(MAX_BODY_BYTES), "HTTP endpoint"],
    ["Batch size", `1 to ${MAX_BATCH} messages`, "Both transports"],
    [html`${code("payment_required")} and Base64 payloads`, `${MAX_HEADER_LENGTH.toLocaleString("en-US")} characters`, "evaluate_payment_requirements, verify_payment_signature"],
    ["JSON nesting", `${MAX_JSON_DEPTH} levels`, "Decoded PaymentRequired objects"],
    ["Solana transaction", "1,232 bytes once decoded", "verify_solana_transaction"],
    ["Policy lists", "1 to 32 entries each", "pay_to, assets, networks, schemes"],
    ["Request timeout", `1,000 to 30,000 ms, default ${DEFAULT_TIMEOUT_MS.toLocaleString("en-US")} ms`, "scan_endpoint, scan_facilitator"],
    ["Samples", `Up to ${DEFAULT_REPEAT} identical GET requests; the second only after a decodable PAYMENT-REQUIRED`, "scan_endpoint"],
    ["Response body read", `${MAX_RESPONSE_BODY_BYTES / 1024 / 1024} MiB`, "scan_endpoint"],
  ],
  rowHeaders: true,
})}
<p>The stdio transport does not bound line length: its only peer is the local client that started it.</p>

<h2 id="errors">Errors</h2>
<p>Two kinds of failure exist, and a <code>do_not_pay</code> is neither: it is a successful result with <code>isError: false</code>.</p>
${table({
  caption: "JSON-RPC errors: the request was not executed",
  head: ["Code", "Meaning"],
  rows: [
    ["-32700", "Parse error: the body or line is not JSON."],
    ["-32600", "Invalid request: not a JSON-RPC 2.0 object, a bad id, an empty or oversized batch, or an unsupported MCP-Protocol-Version header."],
    ["-32601", "Method not found."],
    ["-32602", "Invalid params: arguments that do not match the input schema, an unknown tool or prompt, or a network tool called without a token."],
    ["-32002", "Resource not found; data.uri echoes the URI."],
    ["-32603", "Internal error."],
  ],
  rowHeaders: true,
})}
${codeBlock({ lang: "json", title: "Invalid arguments: max_amount must be an integer string", code: `${JSON.stringify(INVALID_ARGS.response)}`, wrap: true })}
${codeBlock({ lang: "json", title: "Unknown method and unknown resource", code: `${JSON.stringify(UNKNOWN_METHOD.response)}\n${JSON.stringify(MISSING_RESOURCE.response)}`, wrap: true })}
<p>A tool that starts but cannot complete, for example because a payload is not valid Base64, returns a normal result with <code>isError: true</code> and a text explanation, without <code>structuredContent</code>:</p>
${codeBlock({ lang: "json", title: "Tool failure (verify_payment_signature)", code: json(TOOL_FAILURE.response), wrap: true })}

<h2 id="example-sessions">Example sessions</h2>
<h3 id="stdio-session">stdio session</h3>
${codeBlock({ lang: "shell", title: "Three messages on stdin", code: `printf '%s\\n' \\
  '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shell", version: "1" } } })}' \\
  '${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}' \\
  '${JSON.stringify(LIST_BINDING.request)}' \\
  | node src/cli.js mcp`, wrap: true })}
<p>The notification gets no answer, so two lines come back. They are shown indented here; on stdout each is a single line:</p>
${codeBlock({ lang: "json", title: "stdout", code: `${json({ jsonrpc: "2.0", id: 1, result: INIT })}\n${json(LIST_BINDING.response)}`, wrap: true })}
<h3 id="http-session">HTTP session</h3>
${codeBlock({ lang: "shell", title: "Initialize, then call a tool", code: `curl -si https://settlens.com/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

curl -s https://settlens.com/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'MCP-Protocol-Version: 2025-06-18' \\
  -d '${JSON.stringify(OVER_BUDGET.request)}'`, wrap: true })}
${codeBlock({ lang: "http", title: "First response (headers abridged)", code: `HTTP/1.1 200 OK
cache-control: no-store
content-type: application/json
vary: Accept

${JSON.stringify({ jsonrpc: "2.0", id: 1, result: INIT })}`, wrap: true })}
<p>The second call returns the result shown in the <a href="#evaluate-example">over-budget example</a>. A <code>notifications/initialized</code> POST returns <code>202 Accepted</code> with no body, and a <code>GET</code> asking for <code>text/event-stream</code>, as an MCP client opening an SSE stream does, returns <code>405</code> with <code>Allow: POST</code>.</p>

<h2 id="troubleshooting">Troubleshooting</h2>
${table({
  caption: "Common problems",
  head: ["Symptom", "Cause and fix"],
  rows: [
    [html`${code("scan_endpoint")} and ${code("scan_facilitator")} are missing`, "The remote endpoint lists them only with a valid bearer token. Check the Authorization header, or use the local stdio server."],
    [html`The decision is always ${code("review")}`, html`Read ${code("reasons")}: the policy lacks ${code("pay_to")}, ${code("assets")}, ${code("networks")} or ${code("max_amount")}, or ${code("resource_url")} is missing.`],
    [html`${code("do_not_pay")} with ${code("binding.resource_url")}`, html`${code("resource.url")} in the 402 differs from the URL you passed. Pass the exact URL you requested, including path and query; if they truly differ, do not pay.`],
    [html`${code("-32602")}: ${code("max_amount")} has an invalid format`, html`${code("max_amount")} is an integer string in atomic units, such as ${code('"10000"')}, never ${code('"0.01"')} or a number.`],
    [html`${code("405")} on ${code("GET /mcp")}`, html`The client asked for an SSE stream (${code("Accept: text/event-stream")}); the endpoint is POST-only and has none. Configure the client for Streamable HTTP; it will POST. Any other ${code("GET")} returns the documentation page.`],
    [html`${code("403 Origin not allowed")}`, html`The request came from a web page on another origin. Call the endpoint from a server-side client, or from a page on ${list(ALLOWED_ORIGINS, "or")}.`],
    [html`${code("415")} or ${code("406")}`, html`Send ${code("Content-Type: application/json")} and an ${code("Accept")} header that includes ${code("application/json")}.`],
    [html`${code("429 Rate limit exceeded")}`, html`Wait the number of seconds in ${code("Retry-After")}. Every POST counts, including notifications, and each entry of a batch counts as one request.`],
    ["The stdio server never answers", "A wrapper script prints to stdout before the server starts, or the client sends pretty-printed JSON across several lines. Send one message per line; keep stdout for the server."],
    ["Responses arrive out of order on stdio", html`Expected: requests run concurrently. Match responses by ${code("id")}.`],
    ["Claude Desktop does not show the server", "Check that the path is absolute, that node is on the PATH Claude Desktop sees (or use the full path to node), that the JSON is valid, and restart the app."],
  ],
  rowHeaders: true,
})}
<p>Related: the <a href="/docs/checks">check catalog</a> explains every check id, <a href="/docs/cli#mcp">the CLI reference</a> covers <code>settlens mcp</code>, and <a href="/product/verify">offline verification</a> describes what the signature tools prove.</p>`;
}
