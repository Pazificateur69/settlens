// Persona page: auditors, AppSec and risk teams who need independent evidence.
// Terminal transcripts are real CLI output against the bundled demo target (npm run demo:server).
// The attestation field list is produced at build time by src/evidence.js.

import { attestReport, generateEvidenceKeypair } from "../../../../src/evidence.js";
import { SOFTWARE } from "./_shared.js";

export const meta = {
  path: "/use-cases/security-teams",
  title: "Independent evidence for x402 payment audits",
  description:
    "Evidence for auditors, AppSec and risk teams: reproducible x402 checks, SARIF findings, SHA-256 report digests and ed25519 attestations you verify offline.",
  section: "use-cases",
  label: "Security teams",
  icon: "shield-check",
  order: 4,
  lastmod: "2026-10-13",
  summary:
    "Settlens gives auditors, AppSec and risk teams reproducible x402 checks run from outside the payment, findings in JSON, HTML and SARIF, and an evidence chain they verify offline: a SHA-256 report digest plus an ed25519 attestation from a signing key they pin. Reports describe observed behavior, not a certification.",
  sources: [
    { title: "x402 protocol specification, version 2 (§7 facilitator interface, §10 security considerations)", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032", publisher: "IRTF" },
    { title: "FIPS 180-4: Secure Hash Standard (SHS)", url: "https://csrc.nist.gov/pubs/fips/180-4/upd1/final", publisher: "NIST" },
    { title: "Static Analysis Results Interchange Format (SARIF) Version 2.1.0", url: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html", publisher: "OASIS" },
    { title: "SARIF support for code scanning (security-severity scores)", url: "https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support", publisher: "GitHub Docs" },
  ],
  changefreq: "monthly",
  jsonLd: SOFTWARE,
};

const FIELD_NOTES = {
  kind: "Always settlens-evidence-attestation.",
  version: "Attestation format version.",
  canonicalization: "Canonical JSON form that was signed (settlens-stable-json-v2; older attestations without this field used v1).",
  reportId: "Id of the attested report.",
  productVersion: "Settlens version that produced the report.",
  protocolVersion: "x402 protocol version assessed.",
  subjects: "URLs of the assessed targets.",
  summary: "Pass, fail, warn and skip counts.",
  reportDigest: "SHA-256 integrity digest of the report.",
  attestedAt: "Timestamp written by the signer's clock.",
  publicKey: "ed25519 public key of the signer, hex encoded.",
  signature: "ed25519 signature over all the fields above, in canonical JSON.",
};

// Field names come from a real attestation so this table follows src/evidence.js.
const ATTESTATION_FIELDS = Object.keys(
  attestReport({ reportId: "example", integrity: { digest: "0".repeat(64) } }, generateEvidenceKeypair().privateKeyPem),
).map((field) => {
  if (!FIELD_NOTES[field]) throw new Error(`Describe attestation field "${field}" in use-cases/security-teams.js.`);
  return [field, FIELD_NOTES[field]];
});

const BYPASS_LINES = [
  { kind: "cmd", text: "settlens scan http://127.0.0.1:4402/bypass \\" },
  { kind: "cont", text: "    --active --authorized --authorization-ref AUDIT-2026-014 --no-write" },
  { kind: "out", text: "Settlens x402 assessment 8701a0bc" },
  { kind: "muted", text: "Targets 1 · Active 1 · Settlement calls 0" },
  { kind: "out", text: "" },
  { kind: "out", text: "127.0.0.1  GET http://127.0.0.1:4402/bypass" },
  { kind: "out", text: "13 pass · 1 fail · 1 warn · 0 skip" },
  { kind: "fail", text: "  FAIL critical Invalid payment authorization is denied" },
  { kind: "muted", text: "       The endpoint returned HTTP 200 after an invalid payment authorization." },
  { kind: "warn", text: "  WARN medium   Invalid payment uses a standard failure status" },
  { kind: "muted", text: "       Expected HTTP 400 or 402 for invalid payment, received HTTP 200." },
  { kind: "out", text: "" },
  { kind: "out", text: "Total: 13 pass · 1 fail · 1 warn · 0 skip" },
];

const PUBLIC_KEY = "0x8d8c0d80a48b600dadf417ad9be2c1b1e5b9f5ad2947823282b35ef918be87ff";

const EVIDENCE_LINES = [
  { kind: "cmd", text: "settlens evidence keygen --out settlens-evidence.key" },
  { kind: "out", text: "Private key written to settlens-evidence.key (keep it secret)." },
  { kind: "out", text: `Public key: ${PUBLIC_KEY}` },
  { kind: "cmd", text: "settlens evidence attest reports/settlens-b000e04e.json \\" },
  { kind: "cont", text: "    --key settlens-evidence.key --out attestation.json" },
  { kind: "out", text: "Attestation written to attestation.json" },
  { kind: "cmd", text: "settlens evidence verify attestation.json \\" },
  { kind: "cont", text: "    --report reports/settlens-b000e04e.json" },
  { kind: "pass", text: "VALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "out", text: `Public key:      ${PUBLIC_KEY}` },
];
const TAMPER_LINES = [
  { kind: "cmd", text: "settlens verify-report tampered.json" },
  { kind: "fail", text: "INVALID Report content was modified after the evidence digest was created." },
  { kind: "muted", text: "Expected: c10d1efc4e5597749014a47d6dc4ffb10e2abb850fa5fd86c99831059ec9f5fc" },
  { kind: "muted", text: "Actual:   4996c0769db96ac3bcfa39269b95ea83aeaa8cfb881e3af7a2e3b50c9eeb89c0" },
  { kind: "cmd", text: "settlens evidence verify attestation.json --report tampered.json" },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  false" },
  { kind: "out", text: `Public key:      ${PUBLIC_KEY}` },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - The provided report failed its own integrity check." },
];

const CHAIN_SVG = `<svg viewBox="0 0 720 200" width="720" height="200" xmlns="http://www.w3.org/2000/svg">
  <title>Settlens evidence chain</title>
  <desc>A scan produces a JSON report with a SHA-256 digest, an ed25519 attestation signs that digest with a key and a timestamp, and a verifier checks both offline.</desc>
  <rect class="d-node" x="20" y="24" width="152" height="96" rx="10"/>
  <rect class="d-node" x="196" y="24" width="152" height="96" rx="10"/>
  <rect class="d-node" x="372" y="24" width="152" height="96" rx="10"/>
  <rect class="d-node d-node--accent" x="548" y="24" width="152" height="96" rx="10"/>
  <text class="d-title" x="96" y="52" text-anchor="middle">Scan</text>
  <text class="d-text" x="96" y="76" text-anchor="middle">passive or</text>
  <text class="d-text" x="96" y="96" text-anchor="middle">authorized active</text>
  <text class="d-title" x="272" y="52" text-anchor="middle">JSON report</text>
  <text class="d-text" x="272" y="76" text-anchor="middle">checks and scope</text>
  <text class="d-label" x="272" y="96" text-anchor="middle">SHA-256 digest</text>
  <text class="d-title" x="448" y="52" text-anchor="middle">Attestation</text>
  <text class="d-label" x="448" y="76" text-anchor="middle">ed25519</text>
  <text class="d-text" x="448" y="96" text-anchor="middle">digest, key, time</text>
  <text class="d-title" x="624" y="52" text-anchor="middle">Verifier</text>
  <text class="d-text" x="624" y="76" text-anchor="middle">offline, no account</text>
  <text class="d-label" x="624" y="96" text-anchor="middle">evidence verify</text>
  <path class="d-msg" d="M174 72h18"/><path class="d-head" d="M186 66l6 6-6 6"/>
  <path class="d-msg" d="M350 72h18"/><path class="d-head" d="M362 66l6 6-6 6"/>
  <path class="d-msg d-msg--accent" d="M526 72h18"/><path class="d-head d-head--accent" d="M538 66l6 6-6 6"/>
  <rect class="d-zone" x="20" y="140" width="680" height="44" rx="10"/>
  <text class="d-note" x="360" y="167" text-anchor="middle">Change one value in the report and both verify-report and evidence verify answer INVALID</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  return html`${ctx.hero({
    title: "Independent, verifiable evidence for x402 payment reviews",
    lede: "For auditors, AppSec and risk teams who must decide whether an x402 payment surface behaves as claimed. Settlens runs reproducible checks from outside, records what it observed and how, and lets anyone verify the report and its signature offline.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "See the evidence chain", href: "#evidence-chain" },
    ],
    note: "Real output from the bundled demo target, an endpoint deliberately built to unlock with an invalid signature.",
    aside: ctx.terminal({ title: "Authorized fail-closed probe", lines: BYPASS_LINES }),
  })}
${ctx.section({
  id: "who",
  title: "Who this is for",
  width: "narrow",
  body: ctx.prose(html`<p>You are asked to approve a product that takes payments from AI agents, to assess a vendor or facilitator that does, or to keep a payment surface under continuous review. Vendor claims and screenshots are hard to check. You need findings tied to an exact target, tool version, configuration and authorization record, and a way to confirm that nobody edited them afterward.</p>
<p>Settlens is independent tooling: it observes x402 behavior from the outside, the way a paying client would, and never takes part in the payment. To scope a review, start from the <a href="/learn/x402-security-checklist">x402 security checklist</a>; our article on the <a href="/blog/x402-security-failure-modes">eight x402 failure modes</a> shows what each finding looks like on the wire.</p>`),
})}
${ctx.section({
  id: "what-you-can-assess",
  title: "What you can assess",
  lede: "Each finding maps to a documented check or command. Tags show the check id you will see in JSON, HTML and SARIF reports.",
  tone: "raised",
  body: ctx.cards(
    [
      { icon: "x-circle", title: "Payment bypass at the resource", body: "With the owner's authorization, one invalid PAYMENT-SIGNATURE is sent. Any 2xx answer is a critical finding: the content is available without paying.", tag: "security.invalid_signature_fail_closed" },
      { icon: "layers", title: "Verification bypass at the facilitator", body: "The same invalid payload is posted to the facilitator's /verify. isValid=true for an all-zero signature is critical.", tag: "security.facilitator_rejects_invalid_signature" },
      { icon: "branch", title: "Payments bound to the wrong resource", body: "resource.url must equal the URL that was requested, path and query included.", tag: "binding.resource_url" },
      { icon: "key", title: "Terms outside the approved policy", body: "Recipients, assets, networks, schemes and the amount ceiling are compared with a reviewed configuration. In a scan, every advertised option must comply.", tag: "policy.recipient" },
      { icon: "activity", title: "Unstable terms", body: "Identical unauthenticated requests should return identical terms. Drift can reveal recipient rotation, unintended dynamic pricing or tampering.", tag: "stability.payment_requirements" },
      { icon: "signature", title: "Captured payment authorizations", body: "verify-payment recovers the EIP-3009 / EIP-712 signer offline and checks recipient, amount and validity window; every signature slot of a Solana transaction is checked too." },
    ],
    { columns: 3 },
  ),
})}
${ctx.section({
  id: "evidence-chain",
  title: "The evidence chain",
  lede: "Three links, each checked offline: the SHA-256 digest shows the report is unchanged since it was hashed, the ed25519 signature ties that digest to a key, and the public key, obtained through a channel you trust, ties the key to a signer. The digest alone is not a seal: whoever edits a report can recompute it.",
  body: html`${ctx.diagram({
    svg: CHAIN_SVG,
    label: "Evidence chain in four steps: a passive or authorized active scan produces a JSON report with a SHA-256 digest; an ed25519 attestation signs the digest with a key and a timestamp; a verifier checks it offline with evidence verify. Changing one value in the report makes verify-report and evidence verify answer INVALID.",
    caption: "The JSON report is canonicalized with settlens-stable-json-v2 before hashing, so the digest is deterministic.",
    size: "wide",
  })}
${ctx.split({
  main: ctx.terminal({ title: "Sign and verify a report", lines: EVIDENCE_LINES }),
  aside: ctx.terminal({ title: "The same checks on an edited report", lines: TAMPER_LINES }),
})}
${ctx.prose(html`<p>Real output. The report comes from <code>settlens check</code> against the bundled demo target; <code>tampered.json</code> is a copy with one check message changed. The signature still verifies, but the report no longer matches its digest, so the attestation is rejected. Our article on <a href="/blog/signed-evidence-for-payment-assessments">signed evidence for payment assessments</a> walks through the forgeries each layer catches, including a report re-signed with another key.</p>`)}`,
})}
${ctx.section({
  id: "workflow",
  title: "How an assessment runs",
  tone: "raised",
  body: html`${ctx.steps([
    { title: "Scope it and record the approval", body: html`<p>Passive scans need no special access. The active probe refuses to run without <code>--active</code>, <code>--authorized</code> and a non-empty <code>--authorization-ref</code>; the reference is stored in the report next to the target.</p>` },
    { title: "Run the checks", body: html`<p>The report records the mode (<code>passive</code>, <code>active-authorized</code>, or <code>passive-facilitator</code> for a <code>/supported</code> scan), the tool version, the pinned <code>@x402/core</code> version and scope counters for settlement calls and private keys used, both zero by design.</p>` },
    { title: "Verify, sign and share", body: html`<p><code>settlens verify-report</code> recomputes the SHA-256 digest. <code>settlens evidence attest</code> signs it with an ed25519 key, and <code>settlens evidence verify</code> checks the signature and that the report is the one attested. See <a href="/product/evidence">Evidence</a>.</p>` },
    { title: "Track findings and regressions", body: html`<p>Run <code>settlens check</code> on every change: it fails while a finding persists. Run <code>settlens monitor</code> on a schedule: it compares each passive scan with the previous run and exits non-zero on a regression at your threshold, once per change. See <a href="/docs/monitor">Monitor</a>.</p>` },
  ])}
${ctx.prose(html`<p>In SARIF, failing and warning checks become results. Failures at high or critical severity are errors and the rest warnings, each rule carries a <code>security-severity</code> (9.5 critical, 8.0 high, 5.0 medium, 2.0 low), and the run's invocation properties keep the report digest so a finding can be traced back to the signed report. See <a href="/docs/reports">reports</a>.</p>`)}`,
})}
${ctx.section({
  id: "report-contents",
  title: "What a report contains, and what it leaves out",
  body: html`${ctx.split({
    main: ctx.prose(html`<h3>Recorded</h3>
<ul>
<li>Target URL, with credentials stripped and secret query values redacted</li>
<li>HTTP method and request header names</li>
<li>Response status, duration, size, SHA-256 of the body and header names</li>
<li>Every check with status, severity, message and evidence</li>
<li>Tool and official SDK versions, and the authorization reference for active runs</li>
</ul>
<h3>Left out</h3>
<ul>
<li>Request header values: custom headers are listed by name only</li>
<li>Paid resource response bodies: only their size and SHA-256 are kept (a facilitator scan keeps the validated <code>/supported</code> response)</li>
<li>Wallets and payment keys: scans never use them</li>
</ul>`),
    aside: ctx.table({
      caption: "Attestation fields",
      head: ["Field", "Meaning"],
      rows: ATTESTATION_FIELDS.map(([field, note]) => [html`<code>${field}</code>`, note]),
      rowHeaders: true,
    }),
  })}
${ctx.prose(html`<p>Result semantics follow the <a href="/docs/methodology">methodology</a>: <code>pass</code> means the observed evidence satisfied the check, <code>fail</code> that it violated a required property, <code>warn</code> that risk or instability was observed, and <code>skip</code> that prerequisite evidence was missing. Severity expresses expected impact, from <code>critical</code> (payment protection can be bypassed) to <code>info</code>.</p>`)}`,
})}
${ctx.section({
  id: "limits",
  title: "Limits to keep in mind",
  width: "narrow",
  tone: "raised",
  body: html`${ctx.callout({
    tone: "warning",
    title: "Evidence of observed behavior, not a certification",
    body: "A passing report means the sampled endpoint behaved consistently with the tested properties during the recorded window. It does not establish the absence of vulnerabilities in untested code, on-chain settlement, uptime, economic safety, or legal or regulatory compliance.",
  })}
${ctx.prose(html`<ul>
<li>An attestation proves which key signed which digest. It does not prove who holds the key: obtain the signer's public key through a channel you trust.</li>
<li><code>attestedAt</code> comes from the signer's clock. It is not a trusted timestamp.</li>
<li>Check <code>subjects</code> and the target URLs: a valid attestation can cover a different endpoint from the one you care about.</li>
<li>The active probe tests one invalid payload class. Settlens does not check balances, on-chain nonce use or replay, or settlement, and never calls <code>/settle</code>.</li>
</ul>
<p>Read the <a href="/docs/security">security model</a> for the trust boundaries and residual risks of the tool itself.</p>`)}`,
})}
${ctx.section({
  id: "faq",
  title: "Questions from security teams",
  width: "narrow",
  body: ctx.faq([
    { q: "Is a Settlens report a certification?", a: "No. It is evidence of observed protocol behavior during the recorded window, tied to a tool version, a configuration and, for active runs, an authorization reference. It is not a certification or legal advice." },
    { q: "Can a vendor hand us a doctored report?", a: "The digest alone does not stop it: anyone who edits a report can recompute its digest. The attestation does: an edited report no longer matches a digest signed by a key you trust. A vendor that runs the scan can still sign an edited report, or one about another endpoint, with its own key, so check the subjects and the public key, or run the scan yourself." },
    { q: "Do verification steps need network access?", a: "No. verify-report, evidence verify and verify-payment run offline. Only scans contact the target." },
    { q: "Does Settlens test smart contracts or settlement?", a: "No. It assesses the x402 HTTP handshake, the facilitator's /supported and /verify behavior and payment authorizations offline. It never calls /settle and never moves funds." },
    { q: "Can we run it inside our own CI or network?", a: "Yes. Pilot participants receive the CLI (Node.js 20.19 or newer), the GitHub composite Action and a pinned non-root container image." },
  ]),
})}
${ctx.cta({
  title: "Get evidence you can check yourself",
  body: "Tell us the endpoint, facilitator or agent flow in scope. The pilot ends with a report, its digest and a signed attestation you verify offline.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "Read the methodology", href: "/docs/methodology" },
  ],
})}`;
}
