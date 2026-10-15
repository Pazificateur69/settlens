// Security model of Settlens itself. Updated from docs/THREAT_MODEL.md and SECURITY.md to the
// current code (Evidence, facilitator /verify probe, MCP HTTP transport, net-guard, scan API).

import { repoJson } from "./_shared.js";

export const meta = {
  path: "/docs/security",
  title: "Security model and threat model",
  label: "Security model",
  heading: "Security model",
  lede: "How Settlens protects the systems it assesses and the secrets it is given, the risks that remain, and how to report a vulnerability.",
  description: "Settlens security model: no custody, no payment keys, trust boundaries, threats, residual risks, supply chain, safe testing and vulnerability disclosure.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 12,
  icon: "shield",
  summary: "Settlens has no custody: it holds no funds, wallet or payment key, never calls /settle, and the only signature it sends is a deliberately invalid one, under explicit authorization. Custom headers reach allowlisted hosts only, and their values never appear in reports. Report vulnerabilities to contact@settlens.com.",
  sources: [
    { title: "RFC 9116: A File Format to Aid in Security Vulnerability Disclosure", url: "https://www.rfc-editor.org/rfc/rfc9116.html", publisher: "IETF" },
    { title: "Secure use reference (pin actions to a full-length commit SHA)", url: "https://docs.github.com/en/actions/reference/security/secure-use", publisher: "GitHub Docs" },
  ],
};

const THREATS = [
  ["A real payment is sent by accident", "A PAYMENT-SIGNATURE supplied in options or config is refused. The only signature Settlens ever sends is the synthetic invalid one of the authorized probe. /settle is never called."],
  ["A modified config forwards CI secrets to a new host", "Custom headers go only to hosts listed outside the config (SETTLENS_ALLOWED_HOSTS or the Action's allowed-hosts input)."],
  ["Credentials leak into evidence", "Reports keep header names, not values; URLs with credentials are refused; common secret query values are redacted; response bodies are hashed, not stored."],
  ["A redirect sends the request to an attacker's host", "Requests use manual redirect handling and never follow a Location header."],
  ["Hostile or oversized payment data", "Header size limit, Base64 and JSON validation, the official SDK parser, a request timeout and a 1 MiB cap on bodies read."],
  ["A resource unlocks for any signature", "The authorized invalid-signature probe must stay denied; a 2xx answer is a critical finding."],
  ["Payment terms are swapped or drift", "Exact resource.url binding, policy checks and repeated-sample comparison."],
  ["A facilitator accepts a forged signature", "Under authorization, the invalid payload is posted to /verify, which must answer isValid: false."],
  ["A report is edited after the fact", "Canonical JSON plus a SHA-256 digest, checked by verify-report; optional ed25519 attestation by evidence attest."],
  ["Server-side request forgery through the hosted scan API or remote MCP tools", "Destinations must be public, on ports 80 and 443 only: no local names, no private, loopback, link-local, CGNAT, reserved or documentation addresses, checked on the literal and on every DNS answer. Both interfaces require a bearer token."],
  ["Abuse of the remote MCP endpoint", "POST only, JSON only, 256 KiB body cap, an allowlist for browser Origins and a per-IP rate limit (60 requests per minute, each batch entry counted as one request)."],
  ["Dependency or action drift", "Exact dependency versions from the lockfile, install scripts disabled, actions pinned to commit SHAs, container base pinned by digest."],
  ["Container privilege abuse", "The image runs as the unprivileged node user, with npm and npx removed from the runtime."],
];

const BOUNDARIES = [
  ["CI tokens and custom headers", "config and process → remote host", "Exfiltration"],
  ["x402 payment requirements", "remote host → parser", "Malformed or hostile input"],
  ["Authorization reference", "operator → report", "Missing accountability"],
  ["Reports and attestations", "scanner → artifact store → recipient", "Tampering or accidental secrets"],
  ["Evidence signing key", "signer's machine or CI secret store", "Theft, then forged attestations"],
  ["Dependency graph", "registry → build", "Supply-chain compromise"],
  ["Assessed endpoint", "scanner → network", "Unauthorized or excessive traffic"],
];

export default function render(ctx) {
  const { html, table, callout, faq, site } = ctx;
  const pkg = repoJson("package.json");
  const dependencies = Object.entries(pkg.dependencies ?? {});
  return html`<p>Settlens is a security tool, so its own behavior has to be easy to check. It is read-only by design: it holds no funds, no wallet and no payment key, it never signs or settles a payment, and it is not a blockchain and has no token. This page lists the guarantees, the threats they answer, what remains, and how to report a problem. For how assessments are performed, see the <a href="/docs/methodology">methodology</a>.</p>

<h2 id="guarantees">Guarantees</h2>
<ul>
  <li><strong>No custody, no payment keys.</strong> No command needs a wallet or a payment key. Every report records <code>settlementCalls: 0</code> and <code>privateKeysUsed: 0</code>. The only key Settlens handles is your own optional evidence signing key, generated and used locally.</li>
  <li><strong>No payments.</strong> Passive scans never send <code>PAYMENT-SIGNATURE</code>. The authorized active probe sends one signature that cannot be valid. Nothing calls a facilitator's <code>/settle</code>.</li>
  <li><strong>Explicit consent for active traffic.</strong> The probe needs <code>--active</code>, <code>--authorized</code> and an <code>--authorization-ref</code>, and is not available through the GitHub Action, Monitor, the HTTP API or the MCP server.</li>
  <li><strong>Secrets stay where you put them.</strong> Custom headers reach only allowlisted hosts and are never written to reports.</li>
  <li><strong>Evidence is checkable.</strong> Reports carry a SHA-256 digest; attestations carry an ed25519 signature; both verify offline.</li>
</ul>

<h2 id="objectives">Security objectives</h2>
<p>Settlens must:</p>
<ol>
  <li>assess an explicitly selected HTTP(S) target without moving funds;</li>
  <li>never accept or transmit a caller-provided <code>PAYMENT-SIGNATURE</code>;</li>
  <li>prevent a modified assessment config from exfiltrating CI secrets;</li>
  <li>avoid persisting credentials or response bodies in evidence;</li>
  <li>distinguish passive observation from authorized active probing;</li>
  <li>make post-generation report modification detectable;</li>
  <li>fail CI deterministically when findings meet the selected severity.</li>
</ol>

<h2 id="trust-boundaries">Trust boundaries</h2>
<p>The resource server, the facilitator, DNS, TLS termination, the CI runner and the artifact store are independent trust domains. Settlens does not assume that a resource server and the facilitator it names are run by the same party.</p>
${table({ caption: "Assets and trust boundaries", head: ["Asset", "Boundary", "Main risk"], rows: BOUNDARIES, rowHeaders: true })}

<h2 id="threats">Threats and controls</h2>
${table({ caption: "Threats and the controls that address them", head: ["Threat", "Control"], rows: THREATS, rowHeaders: true })}

<h2 id="residual-risks">Residual risks</h2>
<ul>
  <li>A report digest detects changes but does not identify the author. An attestation identifies a key, not a person: its value depends on comparing the public key with one the signer published. <code>attestedAt</code> comes from the signer's clock.</li>
  <li>The hosted scan API and remote MCP tools check DNS before connecting, and the HTTP client resolves again when it connects. That window is accepted because these interfaces are authenticated, passive and follow no redirects.</li>
  <li>A compromised CI runner can read the secrets already granted to that job.</li>
  <li>DNS and TLS trust are delegated to the platform running Settlens.</li>
  <li>Passive samples cannot exercise every server-side code path.</li>
  <li>The active probe tests one invalid payload class, not every way a signature can be wrong.</li>
  <li>Rate limiting and multi-tenant isolation are properties of the assessed service that a few samples cannot establish.</li>
</ul>

<h2 id="supply-chain">Supply chain</h2>
<ul>
  <li>${dependencies.length} direct runtime dependencies, at exact versions: ${dependencies.map(([name, version], index) => html`${index ? ", " : ""}<code>${name}</code> ${version}`)}. Their own dependencies are locked in <code>package-lock.json</code>; everything else uses the Node.js standard library.</li>
  <li>Installs use the lockfile with install scripts disabled (<code>npm ci --ignore-scripts</code>).</li>
  <li>The GitHub Action and the repository's CI pin third-party actions to full commit SHAs.</li>
  <li>The container image starts from a digest-pinned <code>node:24-alpine</code>, installs production dependencies only, removes npm and npx, and runs as the <code>node</code> user.</li>
  <li>The code is in a source repository; pilot participants receive access. Settlens is not distributed through npm.</li>
</ul>

<h2 id="safe-testing">Safe testing rules</h2>
<ul>
  <li>Assess only endpoints you own or are allowed in writing to test.</li>
  <li>Use testnet assets and synthetic data.</li>
  <li>Record the approval for any active run in <code>--authorization-ref</code>.</li>
  <li>Never use Settlens for denial of service, credential testing, settlement, transaction replay or fund movement.</li>
</ul>

<h2 id="disclosure">Report a vulnerability</h2>
<p>Email <a href="mailto:${site.email}">${site.email}</a>. Please do not open a public issue or post details that contain an exploit, credential, customer URL or payment payload. Include:</p>
<ul>
  <li>the affected version or commit (<code>settlens --version</code>);</li>
  <li>the smallest example that reproduces the problem;</li>
  <li>impact and preconditions;</li>
  <li>whether real funds, keys or customer systems were involved;</li>
  <li>how to reach you for coordinated follow-up.</li>
</ul>
${callout({ tone: "danger", title: "Never send secrets", body: "Do not include private keys, bearer tokens, real PAYMENT-SIGNATURE values or unredacted customer data in a report. Describe them instead; we will ask for what we need through a safe channel." })}
<p>Operating targets, not contractual commitments: acknowledgement within two business days, an initial severity assessment within five business days, a mitigation target of seven calendar days for critical issues, and a disclosure date agreed with the reporter. Security fixes are made on the latest release line. The site also publishes this contact in <a href="/.well-known/security.txt">security.txt</a>, and the <a href="/security">security page</a> summarizes our practices.</p>

<h2 id="faq">Questions</h2>
${faq([
  { q: "Can Settlens move funds or sign a payment?", a: "No. It has no wallet and uses no private key for payments, the only signature it ever sends is a deliberately invalid one under explicit authorization, and it never calls /settle." },
  { q: "Does Settlens see my API keys or tokens?", a: "Only those you pass as custom headers for a scan, and only to send them to hosts you allowlisted. Their values are never written to reports, state files or attestations." },
  { q: "Where do I report a security problem?", a: "By email to contact@settlens.com, with the version, a minimal reproduction and the impact, and without secrets or customer data." },
])}`;
}
