// /security: trust center. Terminal output is real CLI output (demo target, npm run demo:server);
// the CSP comes from site/server.js and dependency pins and coverage thresholds from package.json.
// Disclosure response targets mirror SECURITY.md (not copied into the site image, so kept in sync by hand).

import { SECURITY_HEADERS } from "../../server.js";
import { MAX_RESPONSE_BODY_BYTES } from "../../../src/constants.js";
import { crumbs, MCP_TOOLS, repoFile } from "./_company.js";

const PACKAGE = JSON.parse(repoFile("package.json"));
const DEPENDENCIES = Object.entries(PACKAGE.dependencies ?? {});
for (const [name, version] of DEPENDENCIES) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`security.js: dependency ${name}@${version} is no longer pinned to an exact version; update the supply-chain section.`);
}
const COVERAGE = Object.fromEntries([...(PACKAGE.scripts?.["test:coverage"] ?? "").matchAll(/--test-coverage-(\w+)=(\d+)/g)].map((match) => [match[1], match[2]]));
if (!COVERAGE.lines) throw new Error("security.js: coverage thresholds not found in package.json scripts.test:coverage.");
const MIB = MAX_RESPONSE_BODY_BYTES / (1024 * 1024);

export const meta = {
  path: "/security",
  title: "Security and trust center",
  label: "Security",
  description:
    "What Settlens never does, how active tests are gated, how pilot data is handled, how settlens.com is hosted and secured, and how to report a vulnerability.",
  section: "company",
  lastmod: "2026-10-13",
  priority: 0.7,
  breadcrumbs: crumbs("Security", "/security"),
  summary:
    "Settlens never pays, never creates a valid payment, never holds wallet or payment keys and never calls a facilitator's /settle. Scans are passive by default; the one active probe needs three explicit flags and the owner's written authorization. Vulnerabilities are reported privately by email.",
  sources: [
    { title: "RFC 9116: A File Format to Aid in Security Vulnerability Disclosure (security.txt)", url: "https://www.rfc-editor.org/rfc/rfc9116.html", publisher: "IETF" },
    { title: "Model Context Protocol specification 2025-06-18: transports (Origin validation)", url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/transports", publisher: "Model Context Protocol" },
    { title: "x402 protocol specification, version 2 (facilitator /verify and /settle)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032.html", publisher: "IRTF" },
  ],
};

const GATES_SVG = `<svg viewBox="0 0 720 324" width="720" height="324" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-zone d-zone--blue" x="390" y="132" width="322" height="186" rx="10"/>
  <rect class="d-node" x="16" y="24" width="150" height="56" rx="10"/>
  <rect class="d-node" x="190" y="24" width="150" height="56" rx="10"/>
  <rect class="d-node" x="364" y="24" width="150" height="56" rx="10"/>
  <rect class="d-node" x="538" y="24" width="166" height="56" rx="10"/>
  <text class="d-title" x="91" y="48" text-anchor="middle">Passive scan</text>
  <text class="d-label" x="91" y="69" text-anchor="middle">default</text>
  <text class="d-title" x="265" y="48" text-anchor="middle">Active probe?</text>
  <text class="d-label" x="265" y="69" text-anchor="middle">--active</text>
  <text class="d-title" x="439" y="48" text-anchor="middle">Owner approval</text>
  <text class="d-label" x="439" y="69" text-anchor="middle">--authorized</text>
  <text class="d-title" x="621" y="48" text-anchor="middle">Approval reference</text>
  <text class="d-label" x="621" y="69" text-anchor="middle">--authorization-ref</text>
  <path class="d-msg" d="M166 52h18M340 52h18M514 52h18"/>
  <path class="d-head" d="M178 46l8 6-8 6M352 46l8 6-8 6M526 46l8 6-8 6"/>
  <text class="d-text" x="190" y="106">Not set: passive only</text>
  <text class="d-text" x="364" y="106">Missing flag: exit 2, nothing sent</text>
  <path class="d-msg d-msg--blue" d="M680 80v58"/><path class="d-head d-head--blue" d="M674 134l6 8 6-8"/>
  <rect class="d-node d-node--accent" x="404" y="150" width="300" height="56" rx="10"/>
  <text class="d-title" x="554" y="174" text-anchor="middle">One invalid PAYMENT-SIGNATURE</text>
  <text class="d-label d-label--accent" x="554" y="195" text-anchor="middle">no wallet · no payment key</text>
  <path class="d-msg" d="M474 206v38M634 206v38"/>
  <path class="d-head" d="M468 238l6 8 6-8M628 238l6 8 6-8"/>
  <rect class="d-node" x="404" y="250" width="140" height="56" rx="10"/>
  <rect class="d-node" x="564" y="250" width="140" height="56" rx="10"/>
  <text class="d-title" x="474" y="274" text-anchor="middle">Resource</text>
  <text class="d-label" x="474" y="295" text-anchor="middle">must refuse</text>
  <text class="d-title" x="634" y="274" text-anchor="middle">/verify</text>
  <text class="d-label" x="634" y="295" text-anchor="middle">must reject</text>
  <text class="d-note" x="16" y="176">/settle is never called.</text>
  <text class="d-text" x="16" y="200">Every report records 0 settlement calls.</text>
  <text class="d-text" x="16" y="224">The approval reference is written</text>
  <text class="d-text" x="16" y="244">into the report.</text>
  <text class="d-note d-note--blue" x="16" y="296">Active probe: authorized runs only</text>
</svg>`;

export default function render(ctx) {
  const { html, site } = ctx;
  const mail = html`<a href="mailto:${site.email}">${site.email}</a>`;
  const code = (text) => html`<code>${text}</code>`;
  return html`${ctx.hero({
    title: "Security at Settlens",
    lede: "Settlens is a security tool, so its own limits are part of the product. Here is what it never does, how its tests are gated, how we handle your data, how the site is run and how to report a vulnerability.",
    actions: [
      { label: "Report a vulnerability", href: "#disclosure", icon: "arrow-right" },
      { label: "Read the security model", href: "/docs/security" },
    ],
    aside: ctx.terminal({
      title: "settlens scan (demo target): the active-probe gates",
      lines: [
        { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure --active" },
        { kind: "fail", text: "Settlens error: Active testing requires --authorized to confirm explicit owner approval." },
        { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
        { kind: "cont", text: "    --active --authorized" },
        { kind: "fail", text: "Settlens error: Active testing requires --authorization-ref with a traceable owner approval reference." },
        { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/secure \\" },
        { kind: "cont", text: "    --active --authorized \\" },
        { kind: "cont", text: "    --authorization-ref PILOT-0001 --no-write" },
        { kind: "out", text: "Settlens x402 assessment 996014c8" },
        { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
        { kind: "pass", text: "15 pass · 0 fail · 0 warn · 0 skip" },
      ],
    }),
  })}
${ctx.section({
  id: "never",
  title: "What Settlens never does",
  lede: "These limits are enforced in the code, not left to configuration. They hold for the CLI, the GitHub Action, the container, the API and the MCP server.",
  body: ctx.featureGrid([
    { icon: "x-circle", title: "Never pays or signs", body: "No Settlens tool creates a valid payment. The only signature it ever sends is an intentionally invalid one, and only in an authorized active probe." },
    { icon: "lock", title: "Never holds your keys or funds", body: "No wallet, no payment key, no custody. The only key in play is a separate ed25519 evidence key, held by whoever signs the report (you, or Settlens for a pilot), and Settlens uses it only to sign report attestations." },
    { icon: "shield", title: "Never calls /settle", body: "Settlens reads a facilitator's /supported and, in an authorized probe, sends one invalid payload to /verify. Settlement is never requested." },
    { icon: "alert", title: "Never sends your PAYMENT-SIGNATURE", body: "A PAYMENT-SIGNATURE header supplied in a target or on the command line is refused before any request, so a real authorization cannot leak into a scan." },
    { icon: "branch", title: "Never follows redirects", body: "A 3xx answer is reported as a finding with the sanitized Location; the payment challenge is only assessed at the URL you named." },
    { icon: "file", title: "Never stores response bodies", body: `Bodies are read up to ${MIB} MiB to bound memory; reports keep only their size and SHA-256 digest. Request header values are omitted and URL credentials redacted.` },
  ]),
})}
${ctx.section({
  id: "gated-tests",
  title: "Passive by default, active only with authorization",
  lede: "A passive scan only reads what any unauthenticated client would see. The single active test needs three explicit flags, and the CLI stops with exit code 2 if one is missing.",
  tone: "raised",
  body: html`${ctx.diagram({
    svg: GATES_SVG,
    label: "Active probe gates. A passive scan always runs by default. Without --active the scan stays passive. With --active, the CLI also requires --authorized and --authorization-ref; if either is missing it exits with code 2 and sends nothing. With all three, Settlens sends one invalid PAYMENT-SIGNATURE, without wallet or private key, and expects the resource to refuse it and the facilitator's /verify to reject it. /settle is never called, every report records zero settlement calls and the approval reference is written into the report.",
    caption: "The active probe is the only test that sends a payment header, and it is designed to be refused.",
    size: "wide",
  })}
${ctx.comparisonTable({
  caption: "Passive scan and authorized active probe",
  columns: ["Behavior", "Passive scan", "Active probe"],
  rows: [
    { label: "Default mode", values: [true, false] },
    { label: "Sends a payment header", values: [false, "One intentionally invalid PAYMENT-SIGNATURE"] },
    { label: "Requires the owner's written authorization and a reference", values: [false, true] },
    { label: "Calls the facilitator's /verify", values: [false, "With the same invalid payload"] },
    { label: "Calls the facilitator's /settle", values: [false, false] },
    { label: "Needs a wallet or private key", values: [false, false] },
    { label: "Available over the MCP server", values: [true, false] },
  ],
})}
<p>Read the <a href="/docs/methodology">methodology</a> for what each result proves, and the <a href="/terms#authorized-use">terms of use</a> for the authorization rules.</p>`,
})}
${ctx.section({
  id: "data-handling",
  title: "How we handle pilot data",
  lede: "We ask for as little as possible, and an assessment never needs your secrets.",
  body: ctx.split({
    main: ctx.prose(html`<h3>Pilot requests</h3>
<p>The <a href="/contact">pilot form</a> collects a name, work email, company and message. Requests are stored on our server, hosted by ${site.legal.host.name} in the European Union, read only by the publisher, and a daily clean-up deletes requests more than 12 months old. Our replies come from the contact@settlens.com mailbox, hosted by Hostinger. Details are in the <a href="/privacy">privacy notice</a>.</p>
<h3>Assessments</h3>
<ul>
<li>We need URLs and the payment terms you expect, not credentials. Passive scans send no authentication.</li>
<li>If a staging endpoint needs a header, it is only sent to hosts you allowlist with ${code("--allow-host")}; otherwise the CLI refuses to run. Values can come from environment variables and are never written into reports.</li>
<li>Pilots run on test networks, synthetic data and staging endpoints where possible, with at most two passive samples and one authorized invalid-signature probe per run.</li>
<li>We stop immediately if you withdraw the authorization or if any unexpected impact appears.</li>
</ul>
<h3>Reports</h3>
<p>Reports omit response bodies and request header values, redact URL credentials and secret query parameters (such as ${code("api_key")}, ${code("token")} or ${code("signature")}), and carry a deterministic SHA-256 integrity block. You can verify them, and the signed attestation, offline. See <a href="/docs/reports">reports</a> and <a href="/docs/evidence">evidence</a>.</p>`),
    aside: ctx.callout({
      tone: "warning",
      title: "Never send us secrets",
      body: "Private keys, seed phrases, third-party bearer tokens, real PAYMENT-SIGNATURE values and customer data have no place in a pilot request, a report or a support email. To check a captured PAYMENT-SIGNATURE that is still valid, run verify-payment or the local MCP server instead of sending it to us or pasting it into the browser verifier.",
    }),
  }),
})}
${ctx.section({
  id: "remote-mcp",
  title: "The remote MCP endpoint",
  lede: html`<code>https://settlens.com/mcp</code> serves the Settlens tools to AI agents over MCP Streamable HTTP, and the free <a href="/tools">browser tools</a> call it too. Here is what limits a public caller.`,
  tone: "raised",
  body: ctx.featureGrid([
    { icon: "check-circle", title: "Offline tools are public", body: `The ${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][MCP_TOOLS.public.length] ?? MCP_TOOLS.public.length} public tools compute only on the inputs you send: payment-request evaluation, signature, transaction, report and attestation checks, and the check catalog.` },
    { icon: "key", title: "Network tools need a token", body: `${MCP_TOOLS.network.map((tool) => tool.name).join(" and ")} are listed and callable only with a Settlens API token, compared in constant time. They are passive; the active probe is not available over MCP.` },
    { icon: "shield-check", title: "Public destinations only", body: "Before any remote network request, private, loopback, link-local and other non-public addresses are rejected, including through DNS answers, and only ports 80 and 443 are allowed. Redirects are never followed." },
    { icon: "lock", title: "Hardened transport", body: "POST only (plus CORS preflight), JSON only, bodies capped at 256 KiB, browser origins limited to settlens.com and claude.ai, and 60 requests per minute per IP address by default." },
    { icon: "file", title: "Request content not stored", body: "Request content is processed in memory to compute the answer, then discarded; the rate-limit counters are kept in memory only. There is no access log: a call leaves a line, with its IP address, time and path, in the proxy's error log only in exceptional cases such as an error, a rate limit or an unusually large request." },
    { icon: "alert", title: "Server content is data", body: "Check messages, reasons and issues that can carry values chosen by the scanned server are reduced to one line of at most 300 characters. Returned payment terms are still the server's own values: agents must treat them as data, never as instructions." },
  ], { columns: 3 }),
})}
${ctx.section({
  id: "infrastructure",
  title: "Infrastructure",
  lede: "A small, static-first site with a short list of moving parts.",
  body: ctx.split({
    main: ctx.keyValues([
      { term: "Hosting", value: html`A server rented from ${site.legal.host.name}, in the European Union` },
      { term: "Transport", value: "HTTPS, with TLS terminated by the nginx reverse proxy in front of the application" },
      { term: "Application", value: "Static pages generated at build time, served by a Node.js server that also handles the pilot form, the token-protected scan API and the MCP endpoint" },
      { term: "Container", value: "Runs as the unprivileged node user with read-only code, a read-only root filesystem, all Linux capabilities dropped, no-new-privileges, memory, CPU and process limits, and npm removed; the port is bound to 127.0.0.1 behind the proxy" },
      { term: "Logs", value: html`No access log. The proxy's error log records technical problems, such as requests that fail, hit a rate or size limit or are buffered to disk; the application logs only start-up, warning and error messages, capped at three files of 10 MB (see the <a href="/privacy#server-logs">privacy notice</a>)` },
      { term: "Browser side", value: html`No cookies, no analytics, no third-party scripts, fonts or embeds (see <a href="/cookies">cookies</a>)` },
    ]),
    aside: ctx.codeBlock({
      lang: "http",
      title: "Security headers on every response",
      // Rendered from the headers the server sends, so the two cannot drift apart.
      code: Object.entries(SECURITY_HEADERS)
        .map(([name, value]) => `${name.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase())}: ${value}`)
        .join("\n"),
      wrap: true,
    }),
  }),
})}
${ctx.section({
  id: "supply-chain",
  title: "Supply chain",
  lede: "Few dependencies, all pinned, all checked on every change.",
  tone: "raised",
  body: html`${ctx.split({
    main: ctx.table({
      caption: "Runtime dependencies (exact versions, from package.json)",
      head: ["Package", "Version", "Used for"],
      rowHeaders: true,
      rows: DEPENDENCIES.map(([name, version]) => [
        html`<code>${name}</code>`,
        version,
        { "@x402/core": "Official x402 V2 schema validation", "@noble/curves": "secp256k1 recovery for EIP-712 signatures", "@noble/hashes": "keccak-256 for EIP-712 hashing" }[name] ?? "Runtime dependency",
      ]),
    }),
    aside: ctx.prose(html`<ul>
<li>Exact versions in <code>package.json</code> and a committed lockfile, installed with <code>npm ci --ignore-scripts</code>.</li>
<li>CI on Node.js 20, 22 and 24, with coverage thresholds of ${COVERAGE.lines}% lines, ${COVERAGE.branches}% branches and ${COVERAGE.functions}% functions.</li>
<li><code>npm audit</code> at the high level and a CycloneDX SBOM on every CI run.</li>
<li>GitHub Actions pinned to full commit SHAs, Dependabot updates for npm and Actions weekly.</li>
<li>Container base image pinned by sha256 digest; evidence signing uses <code>node:crypto</code> only.</li>
</ul>`),
  })}`,
})}
${ctx.section({
  id: "disclosure",
  title: "Responsible disclosure",
  lede: html`Found a vulnerability in settlens.com, the MCP endpoint or the Settlens tools? Write to ${mail}. Our <a href="/.well-known/security.txt">security.txt</a> lists the same contact.`,
  body: html`${ctx.steps([
    { title: "Send a private report", body: html`<p>Email ${mail}. Do not open a public issue or post details publicly before a fix is available.</p>` },
    { title: "Include what we need to reproduce", body: "The affected version, commit or URL; the smallest reproducible example; the impact and preconditions; whether real funds, keys or customer systems were involved; and how to reach you safely." },
    { title: "Leave secrets out", body: "Never include private keys, bearer tokens, real PAYMENT-SIGNATURE values or unredacted customer data." },
    { title: "We coordinate the fix with you", body: "We aim to acknowledge your report within two business days and to give an initial severity assessment within five, then keep you informed while we work on it and agree a disclosure date with you. These are operating targets, not contractual service levels." },
  ])}
${ctx.callout({
  tone: "info",
  title: "Test safely",
  body: "Test only deployments you own, or the local demo target. Use test networks and synthetic data. Denial of service, credential testing, settlement, transaction replay and fund movement are out of bounds.",
})}`,
})}
${ctx.cta({
  title: "Assess your endpoints under these rules",
  body: "A pilot runs passive checks by default and the active probe only with your written authorization. You receive reports and a signed attestation you can verify offline.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Read the security model", href: "/docs/security" },
  ],
})}`;
}
