import { AUTHOR } from "./_shared.js";

export const meta = {
  path: "/blog/signed-evidence-for-payment-assessments",
  title: "Why payment security reports need signed evidence",
  heading: "Signed evidence for payment assessments: digests, ed25519 and offline verification",
  label: "Signed evidence",
  description:
    "Why a payment security report needs an integrity digest and a signature, how Settlens signs reports with ed25519, and how auditors verify them offline.",
  lede: "A security report gets forwarded, attached and archived. By the time an auditor reads it, the only useful question is whether they can check it themselves. Here is how Settlens makes that possible.",
  section: "blog",
  lastmod: "2026-10-13",
  datePublished: "2026-10-13",
  dateModified: "2026-10-13",
  author: AUTHOR,
  tags: ["Evidence", "ed25519", "Audit", "Reports"],
  summary:
    "A SHA-256 digest only shows that a report was not edited carelessly, because anyone who edits it can recompute the digest. Settlens adds an ed25519 attestation that binds the digest to a signing key and a time; an auditor verifies both offline and pins the assessor's public key to reject forgeries.",
  sources: [
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032", publisher: "IRTF" },
    { title: "FIPS 180-4: Secure Hash Standard (SHS)", url: "https://csrc.nist.gov/pubs/fips/180-4/upd1/final", publisher: "NIST" },
    { title: "RFC 3161: Time-Stamp Protocol (TSP)", url: "https://www.rfc-editor.org/rfc/rfc3161", publisher: "IETF" },
  ],
  related: ["/blog/agentic-payments-what-breaks", "/blog/how-to-test-x402-endpoint", "/blog/x402-security-failure-modes"],
};

const EVIDENCE_SVG = `<svg viewBox="0 0 720 320" width="720" height="320" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-zone" x="16" y="16" width="300" height="288" rx="10"/>
  <rect class="d-zone d-zone--blue" x="404" y="16" width="300" height="288" rx="10"/>
  <text class="d-title" x="36" y="46">Assessor</text>
  <text class="d-title" x="424" y="46">Auditor, offline</text>
  <rect class="d-node" x="36" y="64" width="260" height="44" rx="10"/>
  <rect class="d-node" x="36" y="140" width="260" height="44" rx="10"/>
  <rect class="d-node d-node--accent" x="36" y="216" width="260" height="44" rx="10"/>
  <text class="d-text" x="166" y="91" text-anchor="middle">settlens scan</text>
  <text class="d-label" x="166" y="167" text-anchor="middle">report.json + SHA-256</text>
  <text class="d-label d-label--accent" x="166" y="243" text-anchor="middle">attestation.json</text>
  <path class="d-msg" d="M166 108v26"/><path class="d-head" d="M160 128l6 8 6-8"/>
  <path class="d-msg" d="M166 184v26"/><path class="d-head" d="M160 204l6 8 6-8"/>
  <text class="d-note" x="180" y="202">sign (ed25519)</text>
  <path class="d-msg d-msg--accent" d="M296 238h102"/><path class="d-head d-head--accent" d="M392 232l8 6-8 6"/>
  <path class="d-msg" d="M296 162h102"/><path class="d-head" d="M392 156l8 6-8 6"/>
  <rect class="d-node" x="424" y="64" width="260" height="36" rx="10"/>
  <rect class="d-node" x="424" y="110" width="260" height="36" rx="10"/>
  <rect class="d-node" x="424" y="156" width="260" height="36" rx="10"/>
  <rect class="d-node d-node--accent" x="424" y="202" width="260" height="36" rx="10"/>
  <text class="d-text" x="440" y="87">1. signature valid for key</text>
  <text class="d-text" x="440" y="133">2. report digest recomputes</text>
  <text class="d-text" x="440" y="179">3. digest equals attested digest</text>
  <text class="d-text" x="440" y="225">4. key equals the pinned key</text>
  <text class="d-note d-note--blue" x="424" y="276">All four: the evidence holds</text>
</svg>`;

const REPORT_HEAD = `{
  "schemaVersion": 1,
  "reportId": "a92a9d60",
  "product": "Settlens",
  "productVersion": "0.5.0",
  "protocol": "x402",
  "protocolVersion": 2,
  "integrations": { "officialX402Core": "2.28.0" },
  "generatedAt": "2026-10-13T11:13:35.213Z",
  "scope": {
    "targetCount": 1,
    "activeTargetCount": 0,
    "settlementCalls": 0,
    "privateKeysUsed": 0
  },
  "metadata": { "source": "cli" },
  "summary": { "pass": 13, "fail": 0, "warn": 0, "skip": 0 },
  "targets": [ … ],
  "integrity": {
    "algorithm": "sha256",
    "canonicalization": "settlens-stable-json-v2",
    "digest": "455b6f3e15b4886bda9862bb7148b5852691a4f3daaed1ed04464d125acb5b3f"
  }
}`;

const VERIFY_OK = [
  { kind: "cmd", text: "settlens verify-report reports/settlens-a92a9d60.json" },
  { kind: "pass", text: "VALID Report content matches its SHA-256 evidence digest." },
  { kind: "muted", text: "Expected: 455b6f3e15b4886bda9862bb7148b5852691a4f3daaed1ed04464d125acb5b3f" },
  { kind: "muted", text: "Actual:   455b6f3e15b4886bda9862bb7148b5852691a4f3daaed1ed04464d125acb5b3f" },
];

const TAMPER = [
  { kind: "cmd", text: "settlens verify-report edited.json" },
  { kind: "fail", text: "INVALID Report content was modified after the evidence digest was created." },
  { kind: "muted", text: "Expected: 11c8f0535c9e76cc7c47db297e53d460089cafbfdbb063a4f5f36ef7ecb78cb7" },
  { kind: "muted", text: "Actual:   ffc358d5c1e1c806537d870f9533720012a8b19f9c917ea4e34a72efd61cdabd" },
  { kind: "blank", text: "" },
  { kind: "cmd", text: "settlens verify-report redigested.json" },
  { kind: "pass", text: "VALID Report content matches its SHA-256 evidence digest." },
  { kind: "muted", text: "Expected: ffc358d5c1e1c806537d870f9533720012a8b19f9c917ea4e34a72efd61cdabd" },
  { kind: "muted", text: "Actual:   ffc358d5c1e1c806537d870f9533720012a8b19f9c917ea4e34a72efd61cdabd" },
];

const SIGN = [
  { kind: "cmd", text: "settlens evidence keygen --out settlens-evidence.key" },
  { kind: "out", text: "Private key written to settlens-evidence.key (keep it secret)." },
  { kind: "out", text: "Public key: 0xb4d78c4d6485f43eb41ff3f82270b7cd9f0131621a0fa72bb442e73c34426e48" },
  { kind: "blank", text: "" },
  { kind: "cmd", text: "settlens evidence attest reports/settlens-a92a9d60.json \\" },
  { kind: "cont", text: "    --key settlens-evidence.key --out attestation.json" },
  { kind: "out", text: "Attestation written to attestation.json" },
];

const ATTESTATION = `{
  "kind": "settlens-evidence-attestation",
  "version": 1,
  "canonicalization": "settlens-stable-json-v2",
  "reportId": "a92a9d60",
  "productVersion": "0.5.0",
  "protocolVersion": 2,
  "subjects": [
    "http://127.0.0.1:4402/secure"
  ],
  "summary": {
    "pass": 13,
    "fail": 0,
    "warn": 0,
    "skip": 0
  },
  "reportDigest": "455b6f3e15b4886bda9862bb7148b5852691a4f3daaed1ed04464d125acb5b3f",
  "attestedAt": "2026-10-13T11:13:35.683Z",
  "publicKey": "0xb4d78c4d6485f43eb41ff3f82270b7cd9f0131621a0fa72bb442e73c34426e48",
  "signature": "0xa341371dd11c19c699774755d994e32b05245e3c1446e5c465541abb20853d5e0e08264c74c985b698adecbbef5130325eea44bf8213c2d0fd56d74ce24cde05"
}`;

const VERIFY_ATTESTATION = [
  { kind: "cmd", text: "settlens evidence verify attestation.json --report reports/settlens-a92a9d60.json" },
  { kind: "pass", text: "VALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "out", text: "Public key:      0xb4d78c4d6485f43eb41ff3f82270b7cd9f0131621a0fa72bb442e73c34426e48" },
];

const VERIFY_FORGERIES = [
  { kind: "cmd", text: "settlens evidence verify bypass-attestation.json --report edited.json" },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  false" },
  { kind: "out", text: "Public key:      0xb4d78c4d6485f43eb41ff3f82270b7cd9f0131621a0fa72bb442e73c34426e48" },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - The provided report failed its own integrity check." },
  { kind: "blank", text: "" },
  { kind: "cmd", text: "settlens evidence verify bypass-attestation.json --report redigested.json" },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  false" },
  { kind: "out", text: "Public key:      0xb4d78c4d6485f43eb41ff3f82270b7cd9f0131621a0fa72bb442e73c34426e48" },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - The attestation does not match the provided report digest." },
];

const ATTACKER = [
  { kind: "cmd", text: "settlens evidence keygen --out attacker.key" },
  { kind: "out", text: "Private key written to attacker.key (keep it secret)." },
  { kind: "out", text: "Public key: 0xecb54c8a074ffa313ec65dc39a6bd6f0f64fba8e57a95657d6262324d57b620a" },
  { kind: "cmd", text: "settlens evidence attest redigested.json --key attacker.key --out forged-attestation.json" },
  { kind: "out", text: "Attestation written to forged-attestation.json" },
  { kind: "cmd", text: "settlens evidence verify forged-attestation.json --report redigested.json" },
  { kind: "pass", text: "VALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "warn", text: "Public key:      0xecb54c8a074ffa313ec65dc39a6bd6f0f64fba8e57a95657d6262324d57b620a" },
];

const PINNED = [
  { kind: "cmd", text: "settlens evidence verify forged-attestation.json --report redigested.json \\" },
  { kind: "cont", text: "    --expect-key assessor.pub" },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "fail", text: "Expected signer: false" },
  { kind: "out", text: "Public key:      0xecb54c8a074ffa313ec65dc39a6bd6f0f64fba8e57a95657d6262324d57b620a" },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - The attestation is signed by 0xecb54c8a074ffa313ec65dc39a6bd6f0f64fba8e57a95657d6262324d57b620a, not by the expected key 0xb4d78c4d6485f43eb41ff3f82270b7cd9f0131621a0fa72bb442e73c34426e48." },
];

export default function render(ctx) {
  const { html, terminal, codeBlock, callout, diagram, comparisonTable } = ctx;
  return html`<p>A payment security assessment rarely stays with the people who ran it. The report goes to a partner who wants to integrate, a customer's security team, a procurement questionnaire, an auditor a year later. On the way it becomes an email attachment, a PDF, a file in a shared drive. Whoever finally reads it has three questions, and none of them is answered by the report looking official:</p>
<ul>
  <li>Is this the report the tool produced, or has something been changed since?</li>
  <li>Who stands behind it?</li>
  <li>What exactly does it cover: which endpoint, which tool version, which mode, when?</li>
</ul>
<p>Settlens answers them in two layers: a deterministic SHA-256 digest inside every JSON report, and an optional ed25519 attestation that binds that digest to a signing key and a time. Both verify offline. This article explains how each layer works, shows real commands and output, and is explicit about what each layer does not prove.</p>

<h2>Why a checkmark is not evidence</h2>
<p>Turning a failing result into a passing one takes seconds in a text editor. The demo target in the Settlens repository has a route that serves paid content for an invalid signature, a critical payment bypass. Its report says so. Below, we edit that report so the critical failure reads as a pass and see which verification catches the edit.</p>
<p>There is also a structural problem. When an operator assesses its own payment system, the party that benefits from a clean result is the party producing it. That does not make self-assessment dishonest, but it means a reader should be able to check the result instead of trusting it. Evidence is useful to the extent that someone else can verify it without asking you.</p>

${diagram({
  svg: EVIDENCE_SVG,
  size: "wide",
  label: "Evidence flow. The assessor runs settlens scan, which writes report.json with a SHA-256 integrity digest, then signs it with ed25519 into attestation.json. The auditor, offline, checks four things: the signature is valid for the attestation's key, the report digest recomputes, the digest equals the attested digest, and the key equals the assessor's key obtained separately.",
  caption: "The assessor sends the report and its attestation; the auditor needs neither network access nor the assessor's help to check them, only the assessor's public key from a trusted channel.",
})}

<h2>Layer 1: the integrity digest</h2>
<p>Every JSON report Settlens writes ends with an <code>integrity</code> block. The digest is computed over the whole report except the block itself, after canonicalization: the JSON is re-serialized with object keys sorted by UTF-16 code unit and arrays kept in order, with no whitespace. Settlens calls that format <code>settlens-stable-json-v2</code> and records the name in the block; reports from Settlens 0.4.0 and earlier used <code>settlens-stable-json-v1</code>, which still verifies. The result is hashed with SHA-256.</p>
${codeBlock({ lang: "json", title: "Top of a Settlens JSON report (targets elided)", code: REPORT_HEAD })}
<p>Canonicalization makes the digest independent of formatting: pretty-printing the file or reordering its keys does not change it, while changing any value does. Note what else the report states about its own scope: the tool and <code>@x402/core</code> versions, how many targets ran in active mode, and that it made zero settlement calls and used zero private keys. Reports also leave out the resource's response body (only its size and SHA-256 are kept) and request header values, and redact credentials and common secret query parameters from URLs, so they can be shared without leaking assessment tokens.</p>
<p>Anyone holding the file can recompute the digest:</p>
${terminal({ title: "Recompute the digest of an untouched report", lines: VERIFY_OK })}
<p>Now the edit. We took the report of the bypass scan, flipped its critical failure to pass and adjusted the summary, once without touching the digest (<code>edited.json</code>) and once recomputing the digest with the same canonicalization (<code>redigested.json</code>):</p>
${terminal({ title: "A naive edit, then an edit with a recomputed digest", lines: TAMPER })}
<p>The naive edit is caught. The careful one is not, and cannot be: a digest is a checksum, and anyone who can edit the file can also recompute it. The <a href="/docs/methodology#evidence-handling">Settlens methodology</a> says it plainly: “The digest establishes integrity only.” It protects against accidental corruption and lazy tampering. It says nothing about who produced the report.</p>

<h2>Layer 2: the ed25519 attestation</h2>
<p>An attestation adds the missing piece: a signature from a key the reader can recognize, which is what turns a report into <a href="/product/evidence">signed x402 evidence</a>. Settlens uses ed25519, a widely implemented signature scheme with 32-byte public keys and 64-byte signatures that runs everywhere from <code>node:crypto</code> to OpenSSL. Generating a key and signing a report takes two commands:</p>
${terminal({ title: "Generate a signing key and attest a report", lines: SIGN })}
<p><code>keygen</code> writes the private key as a new PKCS#8 PEM file readable only by its owner, refuses to overwrite a file that already exists, and prints the public key as 32 bytes of hex. <code>attest</code> reads the report and signs a compact statement about it:</p>
${codeBlock({ lang: "json", title: "attestation.json", code: ATTESTATION, wrap: true })}
<p>The signed payload is every field except <code>signature</code>, serialized with the canonical JSON named in its <code>canonicalization</code> field. It names the report (<code>reportId</code>, tool and protocol versions), the subjects (the target URLs), the summary, the report digest, the time of signing and the public key. The signature covers all of them, so none can be altered without invalidating it. Signing uses <code>node:crypto</code> only: no network call, no third-party service and no hardware security module are required.</p>

<h2>How an auditor verifies, offline</h2>
<p>The auditor needs the report, the attestation and the Settlens CLI, nothing else. <code>evidence verify</code> checks the ed25519 signature against the public key in the attestation, recomputes the report's own digest, and confirms it equals the digest that was signed:</p>
${terminal({ title: "Verify an attestation against its report", lines: VERIFY_ATTESTATION })}
<p>The assessor had also signed the genuine bypass report, as <code>bypass-attestation.json</code>. Checked against that attestation, both forged reports from earlier fail. The naive edit fails its own integrity check. The re-digested one passes that check, but its digest is not the one the assessor signed:</p>
${terminal({ title: "The edited reports against the genuine attestation", lines: VERIFY_FORGERIES })}
<p>Without <code>--report</code>, <code>evidence verify</code> checks the signature alone. That tells you the attestation is intact, but not that it matches the file in front of you, so always pass the report when you have it. The same checks are available to AI agents: the Settlens <a href="/mcp">MCP server</a> exposes <code>verify_report</code> and <code>verify_attestation</code> as offline tools, public on the remote endpoint.</p>

<h2>Pin the public key</h2>
<p>There is one more forgery to try. Anyone can generate a key. What happens if the attacker signs their own edited report?</p>
${terminal({ title: "A forged report signed with a different key", lines: ATTACKER })}
<p>It verifies. It should: the signature is valid, the report is intact and the digests match. The only thing wrong is the key, and on its own the tool cannot know which key you expected. A signature proves that the holder of a key signed a digest. It does not prove who holds the key.</p>
<p>Tell it. Save the assessor's public key, obtained through a separate channel, in a file and pass it with <code>--expect-key</code> (the 0x hex printed by <code>keygen</code> or an ed25519 PEM public key). An attestation from any other key is then rejected:</p>
${terminal({ title: "The same forgery against the pinned key", lines: PINNED })}
${callout({ tone: "warning", title: "Pin the key, every time", body: html`<p>The expected key must come from somewhere the forger cannot write to: the assessor's website, the engagement letter or pilot agreement, or a direct exchange. An attestation from an unknown key is a valid signature from a stranger. The MCP <code>verify_attestation</code> tool takes the same key as <code>expected_public_key</code>.</p>` })}

<h2>What the timestamp means</h2>
<p><code>attestedAt</code> is the signer's clock at signing time. Because it is inside the signed payload, nobody can change it afterwards without breaking the signature, but it is exactly as trustworthy as the signer: an assessor could sign with a wrong clock. When independent proof of time matters, for example in a dispute, a common approach is to have the attestation's hash timestamped by an external timestamping authority. Settlens does not do that for you; it is worth deciding up front whether your use case needs it.</p>
<p>The report's own <code>generatedAt</code> and per-target <code>startedAt</code> and <code>completedAt</code> fields are covered by the digest, so they cannot change without changing the report. They are likewise the scanning machine's clock.</p>

<h2>Keeping the signing key safe</h2>
<ul>
  <li>Use one key per assessor or team, generated on the machine that signs. Scans never need it; only <code>evidence attest</code> does.</li>
  <li>Always pass <code>--out</code> to <code>keygen</code>. Without it, the private key is printed to standard output, which in CI means into the job log. With it, an existing key file is never overwritten.</li>
  <li>Never commit the key file. Treat it like any other signing secret and restrict who can read it.</li>
  <li>Publish the public key where your readers will look for it, and keep a list of retired keys so older attestations remain checkable after a rotation.</li>
</ul>

<h2>A workflow that holds up</h2>
<p>The mechanics are simple; the discipline around them is what makes the evidence useful months later. This is the sequence we follow in a pilot:</p>
<ol>
  <li><strong>Agree on scope and the key first.</strong> The engagement letter names the endpoints, the mode (passive, or active with an authorization reference) and the assessor's public key, before the first scan runs.</li>
  <li><strong>Keep the JSON report untouched.</strong> It is the file that carries the integrity block and the one that gets signed. The HTML and SARIF files display the same digest, so a reader can match them to the JSON, but only the JSON can be recomputed.</li>
  <li><strong>Attest right after the scan</strong>, then send the report and its attestation together. The attestation names the subjects and the summary, so a reader sees what it covers before opening the report.</li>
  <li><strong>Verify on receipt.</strong> The reader runs <code>evidence verify</code> with <code>--report</code> and <code>--expect-key</code>. If any of the four checks fails, the file is not evidence.</li>
  <li><strong>Archive the set:</strong> report, attestation and the configuration that produced them, so the result can be reproduced with the same tool version.</li>
</ol>

<h2>What signed evidence proves, and what it does not</h2>
${comparisonTable({
  caption: "What each layer establishes",
  columns: ["Question", "Digest only", "Digest, attestation and pinned key"],
  rows: [
    { label: "The report is the file the tool wrote", values: ["Against accidental or naive edits only", true] },
    { label: "A known party stands behind the result", values: [false, true] },
    { label: "When it was produced", values: ["Scanner clock, unsigned", "Signer's clock, signed"] },
    { label: "The endpoint is secure in general", values: [false, false] },
    { label: "Payments settled correctly", values: [false, false] },
  ],
  highlight: 2,
})}
<p>The last two rows matter as much as the first three. A Settlens report describes the behavior that was observed during the recorded window: which checks ran, in which mode, with which results. A signature makes that statement verifiable and attributable. It does not turn it into a certification, a guarantee about untested code, or proof that a payment settled; Settlens never calls <code>/settle</code>.</p>
<p>Within those limits, signed evidence changes the conversation with partners and auditors from “trust us” to “check it yourself”. The <a href="/docs/evidence">evidence documentation</a> lists every command and field, the <a href="/docs/reports">report reference</a> describes the report format, the <a href="/product/evidence">Evidence page</a> explains how attestations fit into an assessment, and <a href="/use-cases/security-teams">Settlens for security teams</a> shows how auditors and risk teams use them in a review. To get signed evidence for your own x402 endpoints, <a href="/contact">request a pilot</a>.</p>`;
}
