// Check catalog, generated from src/catalog.js (the same catalog the MCP server serves as
// settlens://checks). Every check gets an anchor equal to its id: /docs/checks#binding.resource_url.

import { CHECK_CATALOG, CHECK_CATEGORIES, CHECK_MODES } from "../../../../src/catalog.js";
import { SEVERITY_RANK } from "../../../../src/constants.js";
import { modePill, severityBadge } from "./_shared.js";

const CRITICAL = CHECK_CATALOG.filter((check) => check.severity === "critical");
const USED_SEVERITIES = Object.keys(SEVERITY_RANK).filter((severity) => CHECK_CATALOG.some((check) => check.severity === severity));
// The summary below says every critical check needs the authorized probe; fail the build if that stops being true.
if (!CRITICAL.every((check) => check.mode === "active")) throw new Error("docs/checks.js: a critical check no longer runs only in the active probe; update meta.summary.");

export const meta = {
  path: "/docs/checks",
  title: "Check catalog: every x402 check Settlens runs",
  label: "Check catalog",
  heading: "Check catalog",
  lede: "Every check Settlens can report, grouped by category, with what it verifies, why it matters and how to fix a failure.",
  description: "The Settlens check catalog: every x402 conformance, binding, policy, stability and facilitator check, with its severity, mode, rationale and fix.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 8,
  icon: "check-circle",
  summary: `Settlens reports ${CHECK_CATALOG.length} checks in ${CHECK_CATEGORIES.length} categories (${CHECK_CATEGORIES.join(", ")}), each with a default severity from ${USED_SEVERITIES[0]} to ${USED_SEVERITIES.at(-1)}, a mode (${Object.keys(CHECK_MODES).join(", ")}) and a fix. The ${CRITICAL.length} critical checks run only in the authorized active probe.`,
  sources: [
    { title: "x402 Protocol Specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
};

// Guides that explain a check in depth, shown as "Learn more". A guide is linked only once its page
// exists (ctx.find), so a guide still being written never becomes a broken link.
const CATEGORY_GUIDES = {
  policy: ["/learn/agent-spending-policy"],
  facilitator: ["/learn/x402-facilitator-security"],
};
const CHECK_GUIDES = {
  "transport.status_402": ["/learn/what-is-x402"],
  "transport.payment_required_header": ["/learn/x402-v2-headers", "/learn/x402-v1-to-v2-migration"],
  "transport.payment_required_encoding": ["/learn/x402-v2-headers"],
  "transport.https": ["/blog/x402-security-failure-modes"],
  "transport.redirect": ["/blog/x402-security-failure-modes"],
  "transport.response_body_limit": ["/blog/x402-security-failure-modes"],
  "schema.official_x402_sdk": ["/learn/x402-v2-headers"],
  "schema.payment_required": ["/learn/x402-v2-headers", "/learn/x402-v1-to-v2-migration"],
  "schema.payment_requirements": ["/learn/x402-v2-headers"],
  "binding.resource_url": ["/blog/x402-security-failure-modes"],
  "freshness.timeout_window": ["/blog/x402-security-failure-modes"],
  "stability.payment_requirements": ["/blog/detecting-x402-payment-drift"],
  "security.invalid_signature_fail_closed": ["/blog/x402-security-failure-modes", "/learn/x402-security-checklist"],
  "transport.invalid_payment_status": ["/learn/x402-security-checklist"],
  "security.facilitator_rejects_invalid_signature": ["/learn/x402-facilitator-security", "/blog/x402-security-failure-modes"],
};
const unknownIds = Object.keys(CHECK_GUIDES).filter((id) => !CHECK_CATALOG.some((check) => check.id === id));
if (unknownIds.length) throw new Error(`docs/checks.js: CHECK_GUIDES lists unknown check ids: ${unknownIds.join(", ")}.`);

const CATEGORY = {
  transport: ["Transport", "How the paid resource answers a request without payment: reachability, HTTP 402, the PAYMENT-REQUIRED header and its encoding, HTTPS, redirects and response size."],
  schema: ["Schema", "Whether the decoded PaymentRequired object is valid x402 V2, for the official @x402/core SDK and for Settlens' field-level rules."],
  binding: ["Binding", "Whether the payment terms are tied to the resource that was actually requested."],
  freshness: ["Freshness", "How long a signed payment authorization stays usable."],
  policy: ["Policy", "Your own rules: the schemes, networks, recipients, assets and amounts you accept. Each check runs only when the matching policy field is set (expected in a config file, the --expect-* and --max-amount options, or the policy argument of the MCP tools)."],
  stability: ["Stability", "Whether the payment terms stay the same across identical requests."],
  security: ["Security", "Fail-closed behavior, tested only by the authorized active probe."],
  safety: ["Safety", "Guards on Settlens' own behavior."],
  facilitator: ["Facilitator", "A facilitator's GET /supported capabilities, its coverage of what the resource advertises and, during an authorized active probe, its answer on /verify."],
};

const SEVERITIES = [
  ["critical", "Payment protection can be bypassed: content is served, or a payment accepted, without a valid authorization."],
  ["high", "A required protocol, binding, policy, reachability or facilitator-coverage property fails."],
  ["medium", "A meaningful transport, signer or stability weakness."],
  ["low", "Hygiene or ambiguity, such as duplicate entries."],
  ["info", "Descriptive evidence only."],
];

const count = (predicate) => CHECK_CATALOG.filter(predicate).length;
// Same status tones as the result table on /mcp.
const STATUS_TONE = { pass: "success", fail: "danger", warn: "warning", skip: "neutral" };

export default function render(ctx) {
  const { html, table, stats, find } = ctx;
  const guides = (label, paths = []) => {
    const pages = paths.map(find).filter(Boolean);
    return pages.length ? html`<p><strong>${label}.</strong> ${pages.map((page, index) => html`${index ? ", " : ""}<a href="${page.path}">${page.title}</a>`)}</p>` : "";
  };
  const checker = find("/tools/x402-checker");
  const name = (category) => CATEGORY[category]?.[0] ?? category[0].toUpperCase() + category.slice(1);

  return html`<p>Settlens reports ${CHECK_CATALOG.length} checks. This page is generated from the catalog in the Settlens source (<code>src/catalog.js</code>), which a test keeps in sync with every check the code can emit. The MCP server serves the same entries as the <code>settlens://checks</code> resource and through the <code>list_checks</code> tool, so an agent and a human read the same text. Link to a check with its id as the anchor, for example <a href="#binding.resource_url"><code>/docs/checks#binding.resource_url</code></a>.</p>
${checker ? html`<p>To run the offline checks on a <code>PAYMENT-REQUIRED</code> header without installing anything, paste it into the <a href="${checker.path}">x402 payment request checker</a>.</p>` : ""}
${stats([
  { value: String(CHECK_CATALOG.length), label: "Checks in the catalog" },
  { value: String(CHECK_CATEGORIES.length), label: "Categories" },
  { value: String(CRITICAL.length), label: "Critical checks", detail: "Run only with the authorized active probe" },
])}

<h2 id="reading-checks">How to read a check</h2>
<p>Each result in a report has an <code>id</code>, a <code>status</code>, a <code>severity</code>, a <code>message</code> and, when it did not pass, a <code>recommendation</code>. See <a href="/docs/reports">Reports</a> for the full format.</p>
${table({
  caption: "Result statuses",
  head: ["Status", "Meaning"],
  rows: [
    [ctx.badge("pass", { tone: STATUS_TONE.pass }), "The observed evidence satisfied the check."],
    [ctx.badge("fail", { tone: STATUS_TONE.fail }), "The observed evidence violated a required property."],
    [ctx.badge("warn", { tone: STATUS_TONE.warn }), "A risk or instability was observed, but it is not a hard conformance failure."],
    [ctx.badge("skip", { tone: STATUS_TONE.skip }), "The prerequisite evidence was unavailable, or the check was out of scope for this run."],
  ],
  rowHeaders: true,
})}
${table({
  caption: "Severities (default severity per check is shown below)",
  head: ["Severity", "Meaning", "Checks"],
  rows: SEVERITIES.map(([severity, meaning]) => [severityBadge(ctx, severity), meaning, String(count((check) => check.severity === severity))]),
  rowHeaders: true,
  numeric: [2],
})}
<p>Severity expresses expected impact, not likelihood. For <code>scan</code>, <code>facilitator</code> and <code>check</code>, only failing checks count toward <code>--fail-on</code>; warnings never fail the run. <a href="/docs/monitor">Monitor</a> is different: it alerts on changes, including a check that drops to a warning. A few checks report a lower severity when they degrade: when the active probe cannot complete, <code>security.invalid_signature_fail_closed</code> becomes a medium warning.</p>
<h3 id="modes">Modes</h3>
<ul>${Object.entries(CHECK_MODES).map(([mode, text]) => html`<li>${modePill(ctx, mode)} ${text}</li>`)}</ul>

${CHECK_CATEGORIES.map((category) => {
  const checks = CHECK_CATALOG.filter((check) => check.category === category);
  return html`<h2 id="${category}-checks">${name(category)} checks</h2>
${CATEGORY[category] ? html`<p>${CATEGORY[category][1]}</p>` : ""}
${guides("Guide", CATEGORY_GUIDES[category])}
${checks.map(
  (check) => html`<h3 id="${check.id}">${check.title}</h3>
<p><code>${check.id}</code> ${severityBadge(ctx, check.severity)} ${modePill(ctx, check.mode)}</p>
<p><strong>What it verifies.</strong> ${check.verifies}</p>
<p><strong>Why it matters.</strong> ${check.why}</p>
<p><strong>How to fix.</strong> ${check.fix}</p>
${check.specUrl ? html`<p><strong>Reference.</strong> <a href="${check.specUrl}">${check.spec}</a></p>` : ""}
${guides("Learn more", CHECK_GUIDES[check.id])}`,
)}`;
})}
<h2 id="next">Next steps</h2>
<p>Run these checks against your endpoint with the <a href="/docs/cli#scan">scan command</a>, set the policy fields in a <a href="/docs/configuration#expected">configuration file</a>, or read how results are interpreted in the <a href="/docs/methodology">methodology</a>.</p>`;
}
