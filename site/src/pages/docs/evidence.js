// Evidence documentation. Behavior follows src/evidence.js and the evidence branch of src/cli.js;
// transcripts are real output (key, report and attestation generated for this page).

export const meta = {
  path: "/docs/evidence",
  title: "Evidence: sign and verify assessment reports",
  label: "Evidence",
  heading: "Evidence",
  lede: "Bind a report's digest to an ed25519 signing key and a timestamp, so a partner or auditor can verify who vouched for it, offline.",
  description: "Settlens Evidence: generate an ed25519 key, attest a report, verify the attestation offline, the attestation format, key management and its limits.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 7,
  icon: "seal",
  summary: "Settlens Evidence signs a report's SHA-256 digest, summary and timestamp with your own ed25519 key (evidence keygen, then attest). Anyone verifies the attestation offline with evidence verify, and --expect-key pins the signer. It proves which key signed which exact report, not when the scan ran.",
  sources: [
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032.html", publisher: "IRTF" },
    { title: "FIPS 180-4: Secure Hash Standard (SHS)", url: "https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf", publisher: "NIST" },
  ],
};

const ATTESTATION = `{
  "kind": "settlens-evidence-attestation",
  "version": 1,
  "canonicalization": "settlens-stable-json-v2",
  "reportId": "4b9f875a",
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
  "reportDigest": "0a7f80cf394e699ccf0105793d3ec0255d8e0811f7634ca8adbffc1c0d19a91a",
  "attestedAt": "2026-10-13T11:11:25.166Z",
  "publicKey": "0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2",
  "signature": "0x63d62a18a3203174e1d6ab6dd561743e9a7da91f83084ef43f49d6a45faeda85bec0435cc385e23070fc34f71121bf1efde0a1510b39d4e885f2f9f502245b00"
}`;

const FIELDS = [
  ["kind", "Always settlens-evidence-attestation."],
  ["version", "Attestation format version, 1."],
  ["canonicalization", "Canonical JSON form that was signed: settlens-stable-json-v2. Attestations made before this field existed are verified with settlens-stable-json-v1."],
  ["reportId", "reportId of the attested report."],
  ["productVersion", "Settlens version that produced the report."],
  ["protocolVersion", "x402 protocol version of the report."],
  ["subjects", "Target URLs in the report, as written in it."],
  ["summary", "The report's pass, fail, warn and skip counts."],
  ["reportDigest", "The report's integrity.digest (SHA-256). This is what binds the attestation to one exact report."],
  ["attestedAt", "ISO 8601 time from the signer's clock."],
  ["publicKey", "Raw 32-byte ed25519 public key, hex with 0x."],
  ["signature", "ed25519 signature over every other field, hex with 0x."],
];

const FLOW_SVG = `<svg viewBox="0 0 720 240" width="720" height="240" xmlns="http://www.w3.org/2000/svg">
  <title>Signing and verifying a report</title>
  <desc>The signer combines the report and a private key with evidence attest to produce attestation.json. Anyone verifies it offline with evidence verify, optionally against the report, then compares the public key with the one the signer published.</desc>
  <rect class="d-node" x="16" y="44" width="140" height="60" rx="10"/>
  <rect class="d-node d-node--accent" x="196" y="44" width="150" height="60" rx="10"/>
  <rect class="d-node" x="380" y="44" width="150" height="60" rx="10"/>
  <rect class="d-node d-node--accent" x="564" y="44" width="140" height="60" rx="10"/>
  <rect class="d-node" x="196" y="164" width="150" height="60" rx="10"/>
  <rect class="d-node" x="564" y="164" width="140" height="60" rx="10"/>
  <text class="d-title" x="86" y="70" text-anchor="middle">Report JSON</text>
  <text class="d-label" x="86" y="91" text-anchor="middle">integrity.digest</text>
  <text class="d-title" x="271" y="70" text-anchor="middle">evidence attest</text>
  <text class="d-label" x="271" y="91" text-anchor="middle">ed25519 sign</text>
  <text class="d-title" x="455" y="70" text-anchor="middle">attestation.json</text>
  <text class="d-label" x="455" y="91" text-anchor="middle">signed payload</text>
  <text class="d-title" x="634" y="70" text-anchor="middle">evidence verify</text>
  <text class="d-label" x="634" y="91" text-anchor="middle">VALID / INVALID</text>
  <text class="d-title" x="271" y="190" text-anchor="middle">Private key</text>
  <text class="d-label" x="271" y="211" text-anchor="middle">PEM, kept secret</text>
  <text class="d-title" x="634" y="190" text-anchor="middle">Report</text>
  <text class="d-label" x="634" y="211" text-anchor="middle">optional input</text>
  <path class="d-msg" d="M156 74h38"/><path class="d-head" d="M188 68l8 6-8 6"/>
  <path class="d-msg" d="M346 74h32"/><path class="d-head" d="M372 68l8 6-8 6"/>
  <path class="d-msg d-msg--blue" d="M530 74h32"/><path class="d-head d-head--blue" d="M556 68l8 6-8 6"/>
  <path class="d-msg" d="M271 164v-58"/><path class="d-head" d="M265 112l6-8 6 8"/>
  <path class="d-msg d-msg--blue" d="M634 164v-58"/><path class="d-head d-head--blue" d="M628 112l6-8 6 8"/>
  <text class="d-note" x="16" y="30">Signer</text>
  <text class="d-note d-note--blue" x="564" y="30">Anyone, offline</text>
  <text class="d-note d-note--blue" x="380" y="186">Then compare publicKey with</text>
  <text class="d-note d-note--blue" x="380" y="204">the key the signer published</text>
</svg>`;

const t = (kind, text) => ({ kind, text });

export default function render(ctx) {
  const { html, codeBlock, terminal, table, callout, diagram, faq } = ctx;
  return html`<p>Every Settlens JSON report carries a SHA-256 digest that shows whether it was modified (see <a href="/docs/reports#integrity">Integrity</a>). A digest alone does not say who produced the report: anyone who edits it can compute a new one. An evidence attestation closes that gap. It signs the report's digest, together with a summary and a timestamp, with an ed25519 key, producing a small JSON file that anyone can verify offline with the Settlens CLI or the MCP <code>verify_attestation</code> tool. Signing uses Node.js' built-in <code>node:crypto</code>: no network, no HSM and no key custody by Settlens.</p>
${diagram({ svg: FLOW_SVG, label: "The signer runs evidence attest with the report and a private key to produce attestation.json. Anyone verifies it offline with evidence verify, optionally with the report, and then compares the public key in the attestation with the key the signer published.", caption: "Signing happens once, where the key is; verification needs only the files.", size: "wide" })}

<h2 id="walkthrough">Walkthrough</h2>
<h3 id="generate-a-key">1. Generate a signing key</h3>
<p><code>keygen</code> creates an ed25519 key pair. With <code>--out</code> the private key is written as a PKCS#8 PEM file, created readable only by you (mode 0600), and the public key is printed. <code>keygen</code> never replaces an existing file: if the path exists it stops with exit code 2 and leaves the key untouched. Without <code>--out</code> the private key is printed to stdout, so avoid that anywhere output is logged.</p>
${terminal({
  title: "settlens evidence keygen",
  lines: [
    t("cmd", "settlens evidence keygen --out settlens-evidence.key"),
    t("out", "Private key written to settlens-evidence.key (keep it secret)."),
    t("out", "Public key: 0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2"),
    t("cmd", "settlens evidence keygen --out settlens-evidence.key"),
    t("fail", "Settlens error: settlens-evidence.key already exists. Refusing to overwrite a key file; choose another --out path."),
  ],
})}
<p>Publish the public key where the people who will verify your attestations can find it and trust it: your website, your security page, a signed email, a contract annex.</p>

<h3 id="attest">2. Attest a report</h3>
<p>Produce a JSON report with <a href="/docs/cli#scan"><code>scan</code></a> or <a href="/docs/cli#check"><code>check</code></a>, then sign it:</p>
${terminal({
  title: "settlens evidence attest",
  lines: [
    t("cmd", "settlens evidence attest reports/settlens-4b9f875a.json \\"),
    t("cont", "    --key settlens-evidence.key --out attestation.json"),
    t("out", "Attestation written to attestation.json"),
  ],
})}
${codeBlock({ lang: "json", title: "attestation.json", code: ATTESTATION })}
<p>Share the attestation together with the JSON report (and, for readers, the HTML report generated in the same run).</p>

<h3 id="verify">3. Verify, offline</h3>
<p>The recipient needs only the files. With <code>--report</code>, Settlens also checks that the report is intact and is exactly the one that was signed:</p>
${terminal({
  title: "settlens evidence verify (exit 0)",
  lines: [
    t("cmd", "settlens evidence verify attestation.json --report reports/settlens-4b9f875a.json"),
    t("pass", "VALID evidence attestation"),
    t("out", "Signature valid: true"),
    t("out", "Report matches:  true"),
    t("out", "Public key:      0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2"),
  ],
})}
<p>Any change to the attestation breaks the signature, and a different report does not match the signed digest:</p>
${terminal({
  title: "Failed verifications (exit 1)",
  lines: [
    t("cmd", "settlens evidence verify attestation-edited.json"),
    t("fail", "INVALID evidence attestation"),
    t("fail", "Signature valid: false"),
    t("out", "Public key:      0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2"),
    t("out", "Reasons:"),
    t("muted", "  - The attestation signature is invalid."),
    t("cmd", "settlens evidence verify attestation.json --report other/settlens-237f6e6f.json"),
    t("fail", "INVALID evidence attestation"),
    t("out", "Signature valid: true"),
    t("fail", "Report matches:  false"),
    t("out", "Public key:      0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2"),
    t("out", "Reasons:"),
    t("muted", "  - The attestation does not match the provided report digest."),
  ],
})}
<p>If the report itself was edited, verification fails with <code>The provided report failed its own integrity check.</code></p>

<h3 id="check-the-key">4. Check the public key</h3>
${callout({ tone: "warning", title: "VALID alone is about the key in the file", body: html`<p>Without <code>--expect-key</code>, <code>evidence verify</code> checks the signature against the <code>publicKey</code> written inside the attestation. Anyone can create a key and sign a report, so a <code>VALID</code> result means "signed by the holder of this public key". It becomes evidence about a person or company only once that key is the one they published.</p>` })}
<p>Save the signer's published public key in a file, either as the <code>0x</code> hex printed by <code>keygen</code> or as an ed25519 PEM public key, and pass it with <code>--expect-key</code>. An attestation signed by any other key is then <code>INVALID</code>, even when its signature and report are fine. A file that does not hold a valid ed25519 key stops the command with exit code 2.</p>
${terminal({
  title: "settlens evidence verify --expect-key",
  lines: [
    t("cmd", "settlens evidence verify attestation.json --report reports/settlens-4b9f875a.json \\"),
    t("cont", "    --expect-key signer.pub"),
    t("pass", "VALID evidence attestation"),
    t("out", "Signature valid: true"),
    t("out", "Report matches:  true"),
    t("out", "Expected signer: true"),
    t("out", "Public key:      0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2"),
    t("cmd", "settlens evidence verify attestation.json --report reports/settlens-4b9f875a.json \\"),
    t("cont", "    --expect-key someone-else.pub"),
    t("fail", "INVALID evidence attestation"),
    t("out", "Signature valid: true"),
    t("out", "Report matches:  true"),
    t("fail", "Expected signer: false"),
    t("out", "Public key:      0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2"),
    t("out", "Reasons:"),
    t("muted", "  - The attestation is signed by 0xfe6e01fca8a65ea84b985a68ce4955bb5ad6495331408ad62bbd239103e582e2, not by the expected key 0xbdeb61a7ac6a6d43ec8baa58efa395d3ccb2d2d1f943d8f940753b20ec2e6961."),
  ],
})}
<p>The MCP <code>verify_attestation</code> tool does the same with its <code>expected_public_key</code> argument and returns <code>publicKeyMatches</code>.</p>

<h2 id="format">Attestation format</h2>
${table({ caption: "Attestation fields", head: ["Field", "Content"], rows: FIELDS, rowHeaders: true })}
<p>The signed message is every field except <code>signature</code>, serialized with the canonical JSON named in <code>canonicalization</code> (<code>settlens-stable-json-v2</code>: keys sorted by UTF-16 code unit, no whitespace), the same form as the report digest. Because the name is signed, it cannot be changed without breaking the signature. The attestation therefore covers the summary and subjects as well as the digest: editing the pass count in the file invalidates it.</p>

<h2 id="what-it-proves">What an attestation proves</h2>
<ul>
  <li><strong>It proves</strong> that the holder of the private key for <code>publicKey</code> signed this exact report digest and summary, and that the report you hold is that report.</li>
  <li><strong>It does not prove</strong> when the scan happened: <code>attestedAt</code> comes from the signer's clock, not from a trusted timestamping service.</li>
  <li><strong>It does not prove</strong> that the assessed endpoint is secure. The report describes behavior observed during the scan, under the limits set out in the <a href="/docs/methodology">methodology</a>. It is not a certification.</li>
</ul>

<h2 id="key-management">Key management</h2>
<ul>
  <li>Keep the private key in a secret store, or on the machine that signs, never in the repository or in CI logs. A CI job that signs needs it as a secret file.</li>
  <li>Use one key per signing identity, for example one for your security team, and publish each public key once.</li>
  <li>To rotate, generate a new key and publish the new public key. Attestations made with the old key stay verifiable, because each one carries its public key.</li>
  <li>Settlens has no revocation list. If a key leaks, announce through the channel where you published it that attestations made with it after a given date must not be trusted.</li>
</ul>

<h2 id="faq">Questions</h2>
${faq([
  { q: "Do I need Settlens to verify an attestation?", a: "The Settlens CLI and the MCP verify_attestation tool do it in one step. Any ed25519 library can check the signature too, provided it rebuilds the signed message exactly: the attestation without its signature field, serialized with Settlens' canonical JSON." },
  { q: "Does Settlens hold my signing key?", a: "No. Keys are generated and used locally with node:crypto. Settlens never receives, stores or needs your private key." },
  { q: "Can I attest a report that someone else produced?", a: "Yes. Attesting means that you vouch for that exact report. Verify it with verify-report first; an attestation of an edited report fails verification when the report is supplied." },
])}
<p>Related: <a href="/docs/reports">report formats</a>, the <a href="/product/evidence">Evidence product page</a>, <a href="/blog/signed-evidence-for-payment-assessments">why payment security reports need signed evidence</a>, and the offline verification tools of the <a href="/docs/mcp">MCP server</a>.</p>`;
}
