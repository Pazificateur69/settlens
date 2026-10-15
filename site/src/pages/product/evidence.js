// /product/evidence: report integrity digest and ed25519 attestations.
// Every transcript and JSON sample is real output from a scan of the demo target
// (npm run demo:server) followed by evidence keygen / attest / verify.

import { otherStages, SOFTWARE } from "./_stage-kit.js";

const PATH = "/product/evidence";
const DESCRIPTION =
  "Sign Settlens reports with ed25519 so customers and auditors can verify offline that a report is intact, who signed it and which digest was attested.";

export const meta = {
  path: PATH,
  title: "Signed x402 evidence: ed25519 report attestations",
  label: "Evidence",
  description: DESCRIPTION,
  section: "product",
  lastmod: "2026-10-13",
  order: 5,
  icon: "seal",
  summary:
    "Every Settlens JSON report carries a SHA-256 digest of its canonical content. settlens evidence attest signs that digest, the report id and a timestamp with your ed25519 key, so a customer or auditor can verify offline that the report is intact and which key attested it.",
  sources: [
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032.html", publisher: "IETF" },
    { title: "FIPS 180-4: Secure Hash Standard (SHS)", url: "https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf", publisher: "NIST" },
  ],
  jsonLd: SOFTWARE,
};

const DIGEST = "3c101d12204a09a63dcbb2605ee160b40f09e6444e49a7ecb7fee2738bcde126";
const PUBLIC_KEY = "0x07275b21a0307d196228262603b7b16844487c1db1ce1dd0244c5ab9c9612fed";
const OTHER_KEY = "0x272957df36966f378990ec667b94757c5a08939c28cc63c2336437159d05ee1f";
const REPORT = "reports/settlens-cb29c023.json";

const VERIFY_LINES = [
  { kind: "cmd", text: "settlens evidence verify attestation.json \\" },
  { kind: "cont", text: `    --report ${REPORT}` },
  { kind: "pass", text: "VALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "out", text: `Public key:      ${PUBLIC_KEY}` },
];

const PRODUCE_LINES = [
  { kind: "cmd", text: `settlens verify-report ${REPORT}` },
  { kind: "pass", text: "VALID Report content matches its SHA-256 evidence digest." },
  { kind: "muted", text: `Expected: ${DIGEST}` },
  { kind: "muted", text: `Actual:   ${DIGEST}` },
  { kind: "cmd", text: "settlens evidence keygen --out settlens-evidence.key" },
  { kind: "out", text: "Private key written to settlens-evidence.key (keep it secret)." },
  { kind: "out", text: `Public key: ${PUBLIC_KEY}` },
  { kind: "cmd", text: `settlens evidence attest ${REPORT} \\` },
  { kind: "cont", text: "    --key settlens-evidence.key --out attestation.json" },
  { kind: "out", text: "Attestation written to attestation.json" },
];

const ATTESTATION = `{
  "kind": "settlens-evidence-attestation",
  "version": 1,
  "canonicalization": "settlens-stable-json-v2",
  "reportId": "cb29c023",
  "productVersion": "0.5.0",
  "protocolVersion": 2,
  "subjects": [
    "http://127.0.0.1:4402/secure"
  ],
  "summary": {
    "pass": 23,
    "fail": 0,
    "warn": 0,
    "skip": 0
  },
  "reportDigest": "${DIGEST}",
  "attestedAt": "2026-10-13T11:12:36.225Z",
  "publicKey": "${PUBLIC_KEY}",
  "signature": "0xda54e746e5adabc6a4726ca3c794b488823fa4bcece60df585a17e8791c51bbc668ba1dba5a5aa5a7b009067b74d7bfc87a982f47cc7d95602557df88402f905"
}`;

const REPORT_HEAD = `{
  "schemaVersion": 1,
  "reportId": "cb29c023",
  "product": "Settlens",
  "productVersion": "0.5.0",
  "protocol": "x402",
  "protocolVersion": 2,
  "integrations": { "officialX402Core": "2.28.0" },
  "generatedAt": "2026-10-13T11:12:36.003Z",
  "scope": {
    "targetCount": 1,
    "activeTargetCount": 0,
    "settlementCalls": 0,
    "privateKeysUsed": 0
  },
  "metadata": { "source": "cli" },
  "summary": { "pass": 23, "fail": 0, "warn": 0, "skip": 0 },
  "targets": [ … ],
  "integrity": {
    "algorithm": "sha256",
    "canonicalization": "settlens-stable-json-v2",
    "digest": "${DIGEST}"
  }
}`;

const TAMPER_LINES = [
  { kind: "muted", text: "# one check message edited in the report" },
  { kind: "cmd", text: "settlens verify-report tampered.json" },
  { kind: "fail", text: "INVALID Report content was modified after the evidence digest was created." },
  { kind: "muted", text: `Expected: ${DIGEST}` },
  { kind: "muted", text: "Actual:   59171055343d2f48b64a85efe2fd4b490da979add667ef5762880572c7192014" },
  { kind: "cmd", text: "settlens evidence verify attestation.json --report tampered.json" },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "fail", text: "Report matches:  false" },
  { kind: "out", text: `Public key:      ${PUBLIC_KEY}` },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - The provided report failed its own integrity check." },
];

const EDITED_LINES = [
  { kind: "muted", text: "# the subject URL edited in the attestation" },
  { kind: "cmd", text: `settlens evidence verify attestation-edited.json --report ${REPORT}` },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "fail", text: "Signature valid: false" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "out", text: `Public key:      ${PUBLIC_KEY}` },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: "  - The attestation signature is invalid." },
];

const OTHER_KEY_LINES = [
  { kind: "muted", text: "# the same report, attested with a different key" },
  { kind: "cmd", text: `settlens evidence verify attestation-other.json --report ${REPORT}` },
  { kind: "pass", text: "VALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "warn", text: `Public key:      ${OTHER_KEY}` },
  { kind: "muted", text: "# the same check, pinned to the key you published" },
  { kind: "cmd", text: `settlens evidence verify attestation-other.json --report ${REPORT} \\` },
  { kind: "cont", text: "    --expect-key ours.pub" },
  { kind: "fail", text: "INVALID evidence attestation" },
  { kind: "out", text: "Signature valid: true" },
  { kind: "out", text: "Report matches:  true" },
  { kind: "fail", text: "Expected signer: false" },
  { kind: "out", text: `Public key:      ${OTHER_KEY}` },
  { kind: "out", text: "Reasons:" },
  { kind: "muted", text: `  - The attestation is signed by ${OTHER_KEY}, not by the expected key ${PUBLIC_KEY}.` },
];

const LAYERS_SVG = `<svg viewBox="0 0 720 330" width="720" height="330" xmlns="http://www.w3.org/2000/svg">
  <rect class="d-zone" x="12" y="12" width="696" height="140" rx="10"/>
  <text class="d-note" x="28" y="36">Produce: settlens scan, then evidence attest</text>
  <rect class="d-node" x="28" y="52" width="150" height="84" rx="10"/>
  <text class="d-title" x="103" y="78" text-anchor="middle">JSON report</text>
  <text class="d-label" x="103" y="102" text-anchor="middle">checks · scope</text>
  <text class="d-label" x="103" y="122" text-anchor="middle">targets · summary</text>
  <path class="d-line" d="M178 94h20"/><path class="d-head" d="M192 88l8 6-8 6"/>
  <rect class="d-node" x="202" y="52" width="150" height="84" rx="10"/>
  <text class="d-title" x="277" y="78" text-anchor="middle">Integrity block</text>
  <text class="d-label" x="277" y="102" text-anchor="middle">stable JSON</text>
  <text class="d-label" x="277" y="122" text-anchor="middle">SHA-256 digest</text>
  <path class="d-line" d="M352 94h20"/><path class="d-head" d="M366 88l8 6-8 6"/>
  <rect class="d-node" x="376" y="52" width="150" height="84" rx="10"/>
  <text class="d-title" x="451" y="78" text-anchor="middle">Attestation</text>
  <text class="d-label" x="451" y="102" text-anchor="middle">digest · reportId</text>
  <text class="d-label" x="451" y="122" text-anchor="middle">attestedAt · key</text>
  <path class="d-line" d="M526 94h20"/><path class="d-head" d="M540 88l8 6-8 6"/>
  <rect class="d-node d-node--accent" x="550" y="52" width="150" height="84" rx="10"/>
  <text class="d-title" x="625" y="78" text-anchor="middle">ed25519 sign</text>
  <text class="d-label" x="625" y="102" text-anchor="middle">evidence key</text>
  <text class="d-label" x="625" y="122" text-anchor="middle">kept by you</text>
  <rect class="d-zone d-zone--blue" x="12" y="176" width="696" height="140" rx="10"/>
  <text class="d-note d-note--blue" x="28" y="200">Verify offline: verify-report, evidence verify</text>
  <rect class="d-node" x="28" y="216" width="200" height="84" rx="10"/>
  <text class="d-title" x="128" y="242" text-anchor="middle">Recompute digest</text>
  <text class="d-label" x="128" y="266" text-anchor="middle">report → SHA-256</text>
  <text class="d-label" x="128" y="286" text-anchor="middle">== integrity?</text>
  <path class="d-line" d="M228 258h28"/><path class="d-head" d="M250 252l8 6-8 6"/>
  <rect class="d-node" x="260" y="216" width="200" height="84" rx="10"/>
  <text class="d-title" x="360" y="242" text-anchor="middle">Compare digests</text>
  <text class="d-label" x="360" y="266" text-anchor="middle">report vs attestation</text>
  <text class="d-label" x="360" y="286" text-anchor="middle">reportDigest</text>
  <path class="d-line" d="M460 258h28"/><path class="d-head" d="M482 252l8 6-8 6"/>
  <rect class="d-node d-node--accent" x="492" y="216" width="208" height="84" rx="10"/>
  <text class="d-title" x="596" y="242" text-anchor="middle">Check signature</text>
  <text class="d-label" x="596" y="266" text-anchor="middle">ed25519, then compare</text>
  <text class="d-label" x="596" y="286" text-anchor="middle">publicKey to yours</text>
</svg>`;

export default function render(ctx) {
  const { html } = ctx;
  return html`${ctx.hero({
    title: "Evidence anyone can check offline",
    lede: "Every Settlens JSON report carries a SHA-256 digest of its own content. Sign that digest with an ed25519 key and a customer, partner or auditor can confirm, with no network access, that the report is intact and was attested by the key you published.",
    actions: [
      { label: "Request a pilot", href: "/contact", icon: "arrow-right" },
      { label: "Evidence docs", href: "/docs/evidence" },
    ],
    note: "Real output from an attested scan of the demo target.",
    aside: ctx.terminal({ title: "settlens evidence verify", lines: VERIFY_LINES }),
  })}
${ctx.section({
  id: "two-layers",
  title: "Two layers of proof",
  lede: "The integrity digest comes with every JSON report. The attestation is optional: it adds a signer and, because the digest is signed, makes deliberate edits detectable.",
  body: ctx.comparisonTable({
    caption: "Integrity digest and signed attestation",
    columns: ["Property", "Integrity digest", "Signed attestation"],
    rows: [
      { label: "Detects accidental changes to the JSON report", values: [true, true] },
      { label: "Detects a deliberate edit", values: ["No: whoever edits the report can recompute it", "Yes, with --report: the signed digest no longer matches"] },
      { label: "Says who vouches for the report", values: [false, "The holder of the signing key"] },
      { label: "Carries a time", values: ["generatedAt, inside the report", "attestedAt, signed"] },
      { label: "Needs a key to create", values: [false, "An ed25519 private key"] },
      { label: "Verifiable offline", values: [true, true] },
      { label: "Command", values: ["verify-report", "evidence verify"] },
    ],
  }),
})}
${ctx.section({
  id: "how-it-works",
  title: "How it works",
  tone: "raised",
  body: html`${ctx.diagram({
    svg: LAYERS_SVG,
    size: "wide",
    label: "Producing evidence: the JSON report is canonicalized and hashed with SHA-256 into its integrity block; the attestation carries that digest, the report id, a timestamp and the public key, and is signed with ed25519. Verifying offline: recompute the report digest and compare it with the integrity block, compare it with the attestation's reportDigest, then check the ed25519 signature and compare the public key with the one you expect.",
    caption: "The signer keeps the private key. The verifier needs only the attestation, the report and the expected public key.",
  })}
${ctx.steps([
    { title: "Scan", body: html`<p>Any scan or <code>check</code> writes a JSON report. Settlens serializes it with sorted keys (<code>settlens-stable-json-v2</code>), hashes it with SHA-256 and stores the result in an <code>integrity</code> block.</p>` },
    { title: "Generate a key once", body: html`<p><code>evidence keygen</code> creates an ed25519 key pair with Node's built-in crypto. With <code>--out</code>, it writes the private key to a new file readable only by its owner, and refuses to overwrite a file that already exists. Publish the public key where your verifiers can find it.</p>` },
    { title: "Attest", body: html`<p><code>evidence attest</code> works offline: it signs the report's digest, id, product and protocol versions, subject URLs, summary, a timestamp and your public key. It signs the digest recorded in the report without recomputing it, so run <code>verify-report</code> first.</p>` },
    { title: "Share and verify", body: html`<p>Send the report and <code>attestation.json</code>. <code>evidence verify</code> checks the signature, with <code>--report</code> that the report is intact and is the one attested, and with <code>--expect-key</code> that your key signed it.</p>` },
  ])}
${ctx.terminal({ title: "Producing evidence", lines: PRODUCE_LINES })}`,
})}
${ctx.section({
  id: "attestation",
  title: "What an attestation contains",
  body: ctx.split({
    main: ctx.codeBlock({ lang: "json", title: "attestation.json", code: ATTESTATION }),
    aside: ctx.table({
      caption: "Attestation fields",
      head: ["Field", "Meaning"],
      rows: [
        [html`<code>reportDigest</code>`, "The report's SHA-256 integrity digest: the link to the exact report."],
        [html`<code>canonicalization</code>`, "The canonical JSON form that was signed, settlens-stable-json-v2."],
        [html`<code>reportId</code>`, "The report's id, also part of its file name."],
        [html`<code>subjects</code>`, "Target URLs from the report, as sanitized in it."],
        [html`<code>summary</code>`, "Pass, fail, warn and skip counts."],
        [html`<code>productVersion</code>, <code>protocolVersion</code>`, "Settlens version and x402 version of the report."],
        [html`<code>attestedAt</code>`, "When the signer attested, from the signer's clock."],
        [html`<code>publicKey</code>`, "The raw 32-byte ed25519 public key, hex."],
        [html`<code>signature</code>`, "ed25519 signature over every other field, in sorted-key JSON."],
      ],
      rowHeaders: true,
    }),
  }),
})}
${ctx.section({
  id: "auditor",
  title: "What an auditor can check offline",
  tone: "raised",
  body: ctx.table({
    caption: "Questions an auditor can answer with the files alone",
    head: ["Question", "How", "Command"],
    rows: [
      ["Is the report internally consistent?", "Recompute the canonical SHA-256 digest and compare it with the integrity block. This catches corruption and careless edits, not someone who recomputes the digest.", html`<code>settlens verify-report report.json</code>`],
      ["Is this the report that was attested, unchanged?", "The report's digest must equal the attestation's reportDigest, which the signature protects.", html`<code>settlens evidence verify attestation.json --report report.json</code>`],
      ["Was the attestation changed?", "The ed25519 signature must verify over every attested field.", html`<code>settlens evidence verify attestation.json</code>`],
      ["Who attested it?", "Pass the key the signer published, obtained through a channel you trust. An attestation signed by any other key is INVALID.", html`<code>settlens evidence verify attestation.json --expect-key signer.pub</code>`],
      ["Did the assessment move funds or use keys?", html`The report scope declares <code>settlementCalls: 0</code> and <code>privateKeysUsed: 0</code>. These are fixed by design, since Settlens has no code path that settles or signs a payment, not measured during the run.`, "Read the report"],
      ["Was an active probe authorized?", html`Active targets record <code>mode: active-authorized</code> and the approval reference.`, "Read the report"],
    ],
    rowHeaders: true,
  }),
})}
${ctx.section({
  id: "tampering",
  title: "What tampering looks like",
  lede: "Each layer catches a different edit. All three transcripts are real.",
  body: html`${ctx.split({
    main: ctx.terminal({ title: "Editing the report", lines: TAMPER_LINES, replay: false }),
    aside: ctx.terminal({ title: "Editing the attestation", lines: EDITED_LINES, replay: false }),
  })}
${ctx.split({
  main: ctx.terminal({ title: "A valid signature from someone else", lines: OTHER_KEY_LINES, replay: false }),
  aside: ctx.callout({ tone: "warning", title: "Always check the public key", body: html`<p>The public key travels inside the attestation, so anyone can attest any report with their own key and the signature will verify. What makes an attestation yours is that its <code>publicKey</code> matches the key you published. Verifiers should pass that key with <code>--expect-key</code>, as the last command shows, or compare it by hand.</p>` }),
})}`,
})}
${ctx.section({
  id: "report",
  title: "What the report records, and what it leaves out",
  tone: "raised",
  body: ctx.split({
    main: ctx.prose(html`<p>The digest covers the whole JSON report: scope, summary, every target and every check with its message and evidence. Reports are designed to be shared:</p>
<ul>
<li>In target URLs, credentials are removed and common secret query parameters (tokens, keys, signatures) are redacted.</li>
<li>Request headers are recorded by name only, never by value.</li>
<li>The paid resource's response body is never stored: only its size and SHA-256 digest. Facilitator capabilities read from <code>/supported</code> are kept as evidence.</li>
<li>The scope records how many targets were probed actively and declares zero settlement calls and zero private keys used.</li>
</ul>
<p>Read more in the <a href="/docs/reports">report reference</a> and the <a href="/docs/methodology">methodology</a>.</p>`),
    aside: ctx.codeBlock({ lang: "json", title: "settlens-cb29c023.json (top level, targets elided)", code: REPORT_HEAD }),
  }),
})}
${ctx.section({
  id: "agents",
  title: "Verification from an agent",
  body: ctx.prose(html`<p>The <a href="/mcp">Settlens MCP server</a> exposes the same checks as offline tools: <code>verify_report</code> recomputes a report's digest and <code>verify_attestation</code> checks an attestation's signature, given the report that it is the one attested, and given <code>expected_public_key</code> that the expected key signed it. An agent can confirm a counterparty's evidence before relying on it, with no network access and no key.</p>`),
})}
${ctx.section({
  id: "limitations",
  title: "What evidence does not prove",
  tone: "raised",
  width: "narrow",
  body: ctx.prose(html`<ul>
<li><strong>Identity is a key, not a name.</strong> There is no certificate authority, registry or revocation. Publish your public key somewhere verifiers trust, and rotate it yourself if it leaks.</li>
<li><strong>The time is the signer's.</strong> <code>attestedAt</code> comes from the signing machine's clock. It is signed, but it is not a trusted timestamp.</li>
<li><strong>JSON only.</strong> The digest covers the JSON report. The HTML and SARIF files are renderings of the same run and are not signed.</li>
<li><strong>Observed behavior, not certification.</strong> An attestation says what Settlens observed during the run. It is not a security audit, a compliance certificate or legal advice.</li>
<li><strong>Your key, your custody.</strong> Settlens never stores evidence keys. Keep the private key out of repositories and CI logs; a leaked key can attest anything.</li>
</ul>`),
})}
${ctx.section({
  id: "faq",
  title: "Questions about evidence",
  width: "narrow",
  body: ctx.faq([
    { q: "Does verification need Settlens servers or a network connection?", a: "No. verify-report and evidence verify run locally on the files. The signature check uses Node's built-in ed25519 implementation." },
    { q: "What exactly is signed?", a: "A JSON object with sorted keys containing the canonicalization name, the report digest, report id, product and protocol versions, subject URLs, summary counts, attestedAt and the public key. The signature covers all of it." },
    { q: "Can I verify an attestation without the report?", a: "Yes, the signature can be checked alone. You then know the attestation is intact, but not whether a given report is the one attested; pass --report for that." },
    { q: "Where should I publish my public key?", a: "Anywhere your verifiers already trust: your website, a security page, a signed email or a contract annex. Verifiers pass it to evidence verify with --expect-key, or compare it with the publicKey field." },
    { q: "Is the integrity digest enough on its own?", a: "No. It catches corruption and careless edits, but anyone who edits the report can recompute it, and it does not say who produced the report. An attestation signs the digest, so verifying the report against it detects edits and identifies the signer." },
  ]),
})}
${ctx.section({
  id: "related",
  title: "Related",
  tone: "raised",
  body: html`${ctx.cards(otherStages(PATH), { columns: 4 })}
${ctx.prose(html`<p>Reference: <a href="/docs/evidence">Evidence guide</a> · <a href="/docs/reports">report formats</a> · <a href="/docs/security">security model</a> · <a href="/blog/signed-evidence-for-payment-assessments">why signed evidence matters</a> · <a href="/use-cases/security-teams">Settlens for security teams</a>.</p>`)}`,
})}
${ctx.cta({
  title: "Get a report you can hand to a partner",
  body: "A pilot ends with a signed assessment of your endpoint that your customers and auditors can verify on their own machines.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See how Assess works", href: "/product/assess" },
  ],
})}`;
}
