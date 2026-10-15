// /tools/x402-checker: free browser checker for an x402 V2 PAYMENT-REQUIRED header. tools.js sends the form
// to evaluate_payment_requirements on the same-origin /mcp. The sample, the example answers and the check
// table are computed at build time from src/, so the page cannot drift from what the endpoint answers.

import { MAX_HEADER_LENGTH, OFFICIAL_X402_CORE_VERSION } from "../../../../src/constants.js";
import { CHECK_CATALOG } from "../../../../src/catalog.js";
import { encodeBase64Json } from "../../../../src/protocol.js";
import { curlCommand, field, resultArea, runTool, toolForm, webApplication } from "./_shared.js";

const PATH = "/tools/x402-checker";
const DESCRIPTION =
  "Free x402 checker: paste a PAYMENT-REQUIRED header and your spending policy to get pay, review or do_not_pay with every check. No wallet, no sign-up.";

// The example PaymentRequired of the x402 V2 HTTP transport specification (transports-v2/http.md).
export const SAMPLE_URL = "https://api.example.com/premium-data";
export const SAMPLE_OPTION = Object.freeze({
  scheme: "exact",
  network: "eip155:84532",
  amount: "10000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  maxTimeoutSeconds: 60,
  extra: Object.freeze({ name: "USDC", version: "2" }),
});
export const SAMPLE_RESOURCE = Object.freeze({ url: SAMPLE_URL, description: "Access to premium market data", mimeType: "application/json" });
export const SAMPLE_HEADER = encodeBase64Json({
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: SAMPLE_RESOURCE,
  accepts: [SAMPLE_OPTION],
});
const SAMPLE_POLICY = {
  pay_to: [SAMPLE_OPTION.payTo],
  assets: [SAMPLE_OPTION.asset],
  networks: [SAMPLE_OPTION.network],
  max_amount: "10000",
  schemes: ["exact"],
};
const formSample = (header = SAMPLE_HEADER, policy = SAMPLE_POLICY) => ({
  payment_required: header, resource_url: SAMPLE_URL,
  pay_to: policy.pay_to?.join(", ") ?? "", assets: policy.assets.join(", "),
  networks: policy.networks.join(", "), max_amount: policy.max_amount,
  schemes: policy.schemes.join(", "),
});
const changedHeader = (option, resource = SAMPLE_RESOURCE) => encodeBase64Json({
  x402Version: 2, resource, accepts: [{ ...SAMPLE_OPTION, ...option }],
});
export const SCENARIOS = [
  { label: "Approved example", expect: "pay", sample: formSample() },
  { label: "Price doubles", expect: "do_not_pay", sample: formSample(changedHeader({ amount: "20000" })) },
  { label: "Recipient changes", expect: "do_not_pay", sample: formSample(changedHeader({ payTo: "0x309693Bc6afc0C5328bA36FaF03C514EF312287C" })) },
  { label: "Resource changes", expect: "do_not_pay", sample: formSample(changedHeader({}, { ...SAMPLE_RESOURCE, url: "https://api.example.com/other-data" })) },
  { label: "Recipient policy missing", expect: "review", sample: formSample(SAMPLE_HEADER, { ...SAMPLE_POLICY, pay_to: [] }) },
];
// Illustrative inputs are checked with the same implementation as the public endpoint.
for (const scenario of SCENARIOS) {
  const s = scenario.sample;
  const { pay_to: _recipient, ...rest } = SAMPLE_POLICY;
  const result = await runTool("evaluate_payment_requirements", {
    payment_required: s.payment_required, resource_url: s.resource_url,
    policy: s.pay_to ? SAMPLE_POLICY : rest,
  });
  if (result.decision !== scenario.expect) throw new Error(`${PATH}: scenario ${scenario.label} no longer answers ${scenario.expect}.`);
}
const evaluate = (resourceUrl, policy) =>
  runTool("evaluate_payment_requirements", { payment_required: SAMPLE_HEADER, ...(resourceUrl ? { resource_url: resourceUrl } : {}), ...(policy ? { policy } : {}) });

// Real answers to the sample; the copy below describes them, so the build fails if one changes.
const { pay_to: _payTo, ...WITHOUT_PAY_TO } = SAMPLE_POLICY;
const EXAMPLES = [
  { when: "The sample with its full policy", expect: "pay", result: await evaluate(SAMPLE_URL, SAMPLE_POLICY) },
  { when: "The same policy without pay_to", expect: "review", result: await evaluate(SAMPLE_URL, WITHOUT_PAY_TO) },
  { when: "With max_amount lowered to 5000", expect: "do_not_pay", result: await evaluate(SAMPLE_URL, { ...SAMPLE_POLICY, max_amount: "5000" }) },
  { when: "With resource_url set to another path", expect: "do_not_pay", result: await evaluate("https://api.example.com/other-data", SAMPLE_POLICY) },
];
for (const example of EXAMPLES) {
  if (example.result.decision !== example.expect) throw new Error(`${PATH}: "${example.when}" now answers ${example.result.decision}, not ${example.expect}. Update the page copy.`);
}
const SAMPLE_CHECKS = EXAMPLES[0].result.checks.length;
const OFFLINE_CHECKS = CHECK_CATALOG.filter((check) => check.mode === "offline");

export const meta = {
  path: PATH,
  title: "x402 payment request checker (free, no wallet)",
  heading: "Check an x402 payment request before you pay",
  label: "x402 checker",
  description: DESCRIPTION,
  section: "tools",
  order: 1,
  icon: "shield-check",
  lastmod: "2026-10-15",
  priority: 0.8,
  scripts: ["tools"],
  summary: `The Settlens x402 checker is a free browser tool: paste a PAYMENT-REQUIRED header (Base64 or JSON), the URL you requested and an optional spending policy. It validates the request with the official @x402/core ${OFFICIAL_X402_CORE_VERSION} schema, checks the URL binding and each payment option, and answers pay, review or do_not_pay.`,
  sources: [
    { title: "x402 Protocol Specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
    { title: "Model Context Protocol specification (2025-06-18): tools", url: "https://modelcontextprotocol.io/specification/2025-06-18/server/tools", publisher: "Model Context Protocol" },
  ],
  jsonLd: [{ "@id": "https://settlens.com/#software" }, webApplication({
    path: PATH,
    name: "Settlens x402 payment request checker",
    description: DESCRIPTION,
    featureList: [
      "Decodes a PAYMENT-REQUIRED header (Base64 or JSON)",
      `Validates it with the official @x402/core ${OFFICIAL_X402_CORE_VERSION} schema`,
      "Checks that resource.url matches the requested URL",
      "Applies a spending policy to each payment option",
      "Answers pay, review or do_not_pay with every check",
    ],
  })],
};

const TONE = { pay: "success", review: "warning", do_not_pay: "danger" };
const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };

export default function render(ctx) {
  const { html } = ctx;
  const code = (text) => html`<code>${text}</code>`;
  const checkLink = (id) => html`<a href="/docs/checks#${id}"><code>${id}</code></a>`;

  const form = toolForm(ctx, {
    tool: "evaluate_payment_requirements",
    id: "xc",
    submitLabel: "Check the request",
    scenarios: SCENARIOS.slice(1),
    sample: { payment_required: SAMPLE_HEADER, resource_url: SAMPLE_URL, pay_to: SAMPLE_POLICY.pay_to.join(", "), assets: SAMPLE_POLICY.assets.join(", "), networks: SAMPLE_POLICY.networks.join(", "), max_amount: SAMPLE_POLICY.max_amount, schemes: SAMPLE_POLICY.schemes.join(", ") },
    fields: html`${field(ctx, { id: "xc-header", label: "PAYMENT-REQUIRED header", arg: "payment_required", kind: "header", multiline: true, rows: 6, required: true, maxlength: MAX_HEADER_LENGTH, hint: "The header value from the HTTP 402 response, as Base64, or the decoded JSON object." })}
${field(ctx, { id: "xc-url", label: "URL you requested (recommended)", arg: "resource_url", type: "url", inputmode: "url", maxlength: 2048, hint: "Must match resource.url exactly (a #fragment is ignored). Without it the answer is at most review. The checker never requests this URL." })}
<div class="form" role="group" aria-labelledby="xc-policy-label" aria-describedby="xc-policy-hint"><div class="field"><p class="field__label" id="xc-policy-label">Spending policy (optional)</p><p class="field__hint" id="xc-policy-hint">A pay answer needs pay_to, assets, networks and max_amount. Separate several values with commas.</p></div>
<div class="form__row">${field(ctx, { id: "xc-pay-to", label: "Allowed recipients (pay_to)", arg: "policy.pay_to", kind: "list", hint: "Addresses you agree to pay." })}${field(ctx, { id: "xc-assets", label: "Allowed assets", arg: "policy.assets", kind: "list", hint: "Token contract addresses." })}</div>
<div class="form__row">${field(ctx, { id: "xc-networks", label: "Allowed networks (CAIP-2)", arg: "policy.networks", kind: "list", hint: "For example eip155:8453 for Base." })}${field(ctx, { id: "xc-schemes", label: "Allowed schemes", arg: "policy.schemes", kind: "list", hint: "For example exact." })}</div>
${field(ctx, { id: "xc-max", label: "Maximum amount (atomic units)", arg: "policy.max_amount", inputmode: "numeric", maxlength: 78, hint: "In the asset's smallest unit. USDC has 6 decimals: 10000 is 0.01 USDC." })}</div>`,
  });

  return html`${ctx.hero({
    title: "Check an x402 payment request before you pay",
    lede: "Paste the PAYMENT-REQUIRED header of an HTTP 402 response. Settlens decodes it, validates it against the x402 V2 specification and your spending policy, and answers pay, review or do_not_pay with every check behind the answer.",
    actions: [
      { label: "Check a payment request", href: "#checker", icon: "arrow-right" },
      { label: "Try the 60-second walkthrough", href: "#guided-demo" },
    ],
    note: "Free. No account, no wallet, no payment key.",
  })}
${ctx.section({
  id: "guided-demo",
  title: "Three synthetic cases, about 60 seconds",
  lede: "Use the buttons in the checker below. Run each check explicitly; every decision comes from the public evaluator. No wallet or payment is involved.",
  body: ctx.prose(html`<ol><li><strong>0–20 seconds:</strong> select <strong>Load sample</strong>, then <strong>Check the request</strong>. Expected decision: <code>pay</code> under the complete example policy.</li><li><strong>20–40 seconds:</strong> select <strong>Price doubles</strong>, then check again. The unchanged price ceiling rejects the new amount: <code>do_not_pay</code>.</li><li><strong>40–60 seconds:</strong> select <strong>Recipient changes</strong>, then check again. The unchanged recipient allowlist rejects it: <code>do_not_pay</code>.</li></ol><p>These are illustrative changes, not evidence of an attack or a customer incident. <a href="/blog/check-x402-payment-policy#video">Watch the recorded example</a> or <a href="/blog/check-x402-payment-policy#ci">reproduce all five cases with curl and CI</a>.</p>`),
})}
${ctx.section({
  id: "checker",
  title: "Check a payment request",
  lede: html`Load the sample to see a complete answer: the example request of the x402 V2 HTTP transport specification, under a policy that allows it. Each check links to its entry in the <a href="/docs/checks">check catalog</a>.`,
  body: html`${ctx.split({
    main: form,
    aside: ctx.prose(html`<h3>Where to find the header</h3>
<p>Request the paid URL without paying. An x402 V2 resource answers HTTP 402 with a ${code("PAYMENT-REQUIRED")} header: Base64 JSON listing the payment options it accepts. <a href="/learn/x402-v2-headers">x402 V2 headers</a> explains every field.</p>
<h3>What happens to what you paste</h3>
<p>Your browser sends it to the Settlens MCP endpoint, which runs the offline ${code("evaluate_payment_requirements")} tool in memory and keeps no copy of the content. Requests are limited to 60 per minute per IP address. Never paste a private key or seed phrase: the checker never needs one. Details in the <a href="/privacy#mcp-endpoint">privacy notice</a>.</p>`),
  })}
${resultArea(ctx, "xc", "The decision, its reasons, the acceptable payment options and every check appear here.")}`,
})}
${ctx.section({
  id: "decisions",
  title: "What pay, review and do_not_pay mean",
  tone: "raised",
  lede: "Fixed rules in the server decide, the same way on every call. No model judges whether the request looks safe.",
  body: ctx.split({
    main: ctx.prose(html`<ul>
<li>${code("do_not_pay")}: a check of high or critical severity failed, for example terms the official schema rejects, a ${code("resource.url")} that does not match your URL, or no payment option inside your policy. Never pay.</li>
<li>${code("review")}: a non-blocking issue was found, the URL is missing, or the policy does not set ${code("pay_to")}, ${code("assets")}, ${code("networks")} and ${code("max_amount")}. Show the reasons to a person before paying.</li>
<li>${code("pay")}: every protocol check passed and at least one option satisfies the complete policy. Pay only with an option listed as acceptable.</li>
</ul>
<p>The policy applies to each advertised option, because a client pays with one of them. Writing one for an agent is covered in <a href="/learn/agent-spending-policy">agent spending policies</a>; the rules are specified in the <a href="/docs/mcp#decision-rules">MCP reference</a>.</p>`),
    aside: ctx.verdicts({
      title: "evaluate_payment_requirements",
      meta: "the sample, four inputs",
      items: EXAMPLES.map(({ when, result }) => ({ decision: result.decision, tone: TONE[result.decision], when, detail: result.reasons[0] ?? result.summary })),
      caption: "Real answers to the sample request, computed with the Settlens server code when this page was built.",
    }),
  }),
})}
${ctx.section({
  id: "checks",
  title: `The ${OFFLINE_CHECKS.length} offline checks`,
  lede: html`The checker runs the offline checks of a Settlens passive scan on the terms you paste. With the sample and its full policy, ${SAMPLE_CHECKS} checks run.`,
  body: html`${ctx.table({
    caption: "Checks run by the x402 checker",
    head: ["Check", "What it verifies", "Severity"],
    rows: OFFLINE_CHECKS.map((check) => [checkLink(check.id), check.title, ctx.badge(check.severity, { tone: SEVERITY_TONE[check.severity] })]),
    rowHeaders: true,
  })}
${ctx.prose(html`<p>${code("transport.payment_required_encoding")} runs on a Base64 header, not on pasted JSON. Each ${code("policy.*")} check runs only for the constraints you set, except ${code("policy.acceptable_option")}, which runs whenever the header decodes. The passive and active checks need the live endpoint: see <a href="/product/assess">Assess</a>.</p>`)}`,
})}
${ctx.section({
  id: "limits",
  title: "What the checker does not check",
  tone: "raised",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>The live endpoint.</strong> It reads what you paste and never requests the URL, so it cannot see the HTTP status, redirects, HTTPS or drift between responses. The <a href="/product/assess">passive scan</a> does.</li>
<li><strong>Chain state.</strong> No balances, settlement, or behavior of the token contract at ${code("asset")}.</li>
<li><strong>x402 V1.</strong> A V1 payment request fails ${code("schema.payment_required")} and the answer is ${code("do_not_pay")}. See the <a href="/learn/x402-v1-to-v2-migration">V1 to V2 migration guide</a>.</li>
<li><strong>x402 over MCP.</strong> Payment requests carried over the MCP transport (${code("mcp://")} resources) are not evaluated: ${code("resource.url")} must be an http(s) URL, so the answer is ${code("do_not_pay")}.</li>
<li><strong>Payment flow semantics.</strong> ${code("extra.paymentFlow")} and ${code("extra.assetTransferMethod")} are not interpreted.</li>
<li><strong>Decimals across assets.</strong> ${code("max_amount")} is compared in each option's atomic units, so list only assets with the same decimals.</li>
<li><strong>The signature.</strong> A captured ${code("PAYMENT-SIGNATURE")} is checked by the <a href="/tools/eip-3009-verifier">EIP-3009 signature verifier</a>.</li>
</ul>`),
})}
${ctx.section({
  id: "from-your-agent",
  title: "Use it from your agent or a terminal",
  lede: "The checker is a page in front of a public MCP tool. An agent can call the same tool on every HTTP 402 before it pays.",
  body: ctx.split({
    main: html`${ctx.prose(html`<p>Add the remote endpoint to Claude Code (any MCP client with Streamable HTTP works):</p>`)}
${ctx.codeBlock({ lang: "shell", title: "Claude Code", code: "claude mcp add --transport http settlens https://settlens.com/mcp", wrap: true })}
${ctx.prose(html`<p>Or call the tool directly with the sample header:</p>`)}
${ctx.codeBlock({ lang: "shell", title: "curl", code: curlCommand("evaluate_payment_requirements", { payment_required: SAMPLE_HEADER, resource_url: SAMPLE_URL, policy: SAMPLE_POLICY }), wrap: true })}`,
    aside: html`${ctx.prose(html`<p>The <a href="/mcp">MCP server page</a> shows how an agent acts on each decision, and the <a href="/docs/mcp">MCP reference</a> documents every argument and output field.</p>`)}
${ctx.callout({ tone: "note", title: "Gate a release in CI", body: html`<p>Pilot participants run the same checks against the live endpoint with the <a href="/docs/cli">Settlens CLI</a> and fail a build on a regression with the <a href="/docs/github-action">GitHub Action</a>.</p>` })}`,
  }),
})}
${ctx.section({
  id: "faq",
  title: "Questions about the x402 checker",
  tone: "raised",
  width: "narrow",
  body: ctx.faq([
    { q: "Is the x402 checker free?", a: "Yes. It needs no account, wallet or payment key. Requests to the Settlens MCP endpoint, which the checker calls, are limited to 60 per minute per IP address." },
    { q: "Does the checker pay, sign or contact the paid resource?", a: "No. It reads only what you paste. It never pays, signs or calls a facilitator, and it does not request the URL you enter: it only compares that URL with resource.url." },
    { q: "Why do I get review instead of pay?", a: "A pay answer needs every protocol check to pass, the URL you requested, and a policy that sets pay_to, assets, networks and max_amount. When one is missing the answer is review, and the reasons say what is missing." },
    { q: "Does it support x402 V1?", a: html`<p>No. It checks x402 V2 payment requests. A V1 request fails the V2 schema check and the answer is do_not_pay. The <a href="/learn/x402-v1-to-v2-migration">migration guide</a> lists what changed.</p>` },
  ]),
})}
${ctx.cta({
  title: "Check the endpoint, not only its terms",
  body: "A pilot assesses one paid endpoint or facilitator: passive scan, CI gate, monitoring and signed evidence your partners can verify.",
  actions: [
    { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
    { label: "See how Assess works", href: "/product/assess" },
  ],
})}`;
}
