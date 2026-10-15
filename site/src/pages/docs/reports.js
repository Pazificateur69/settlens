// Report formats. Field tables are generated from schemas/settlens-report.schema.json; the SARIF
// mapping mirrors src/reporters.js; excerpts are real output from the demo server.

import { repoJson, schemaTable } from "./_shared.js";

export const meta = {
  path: "/docs/reports",
  title: "Reports: JSON, HTML, SARIF and integrity",
  label: "Reports",
  heading: "Reports",
  lede: "What a Settlens run writes, field by field, and how the SHA-256 integrity digest lets anyone detect a modified report.",
  description: "Settlens report formats: the JSON report schema, the HTML report, SARIF for code scanning, and the SHA-256 integrity digest checked by verify-report.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 9,
  icon: "file",
  summary: "Each scan, facilitator or check run writes up to three files: a JSON report whose integrity block holds a SHA-256 digest of its canonical form, a self-contained HTML report for people and a SARIF 2.1.0 file for code scanning. verify-report recomputes the digest offline.",
  sources: [
    { title: "Static Analysis Results Interchange Format (SARIF) Version 2.1.0", url: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html", publisher: "OASIS" },
    { title: "SARIF support for code scanning", url: "https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support", publisher: "GitHub Docs" },
    { title: "FIPS 180-4: Secure Hash Standard (SHS)", url: "https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf", publisher: "NIST" },
  ],
};

const DESCRIPTIONS = {
  root: {
    schemaVersion: "Version of the report format.",
    reportId: "Random identifier of the report, also used in the file names.",
    product: "Always Settlens.",
    productVersion: "Version of the CLI that produced the report.",
    protocol: "Always x402.",
    protocolVersion: "x402 protocol version assessed.",
    generatedAt: "ISO 8601 time at which the report was assembled.",
    integrations: "Versions of external components used during the run.",
    "integrations.officialX402Core": "Pinned @x402/core version used for SDK schema validation.",
    scope: "What the run touched.",
    "scope.targetCount": "Number of targets in the report.",
    "scope.activeTargetCount": "Targets that received the authorized active probe.",
    "scope.settlementCalls": "Calls to a facilitator's /settle. Always 0.",
    "scope.privateKeysUsed": "Private keys used. Always 0.",
    metadata: 'How the run started: {"source":"cli"}, {"source":"config","configName":"settlens.config.json"}, {"source":"cli","assessmentType":"facilitator"} or {"source":"settlens-web-api"}.',
    summary: "Result counts across every target.",
    targets: "One result per assessed target.",
    integrity: "Digest of the report without this block. See Integrity below.",
    "integrity.algorithm": "Hash function.",
    "integrity.canonicalization": "How the report is serialized before hashing.",
    "integrity.digest": "SHA-256 of the canonical report, in hex.",
  },
  targetResult: {
    id: "Random identifier of this target result.",
    name: "Target label (config name, --name or the hostname).",
    target: "The request: sanitized url, method and requestHeaderNames (names only, never values).",
    mode: "passive, active-authorized (the probe ran) or passive-facilitator (facilitator command).",
    startedAt: "ISO 8601 start time.",
    completedAt: "ISO 8601 end time.",
    summary: "Result counts for this target.",
    request: "First response: status, durationMs, responseBytes, responseDigest (SHA-256 of the body read), responseBodyTruncated and responseHeaderNames. null when the endpoint could not be reached.",
    checks: "Every check result for this target.",
    supported: "Facilitator command only: the /supported answer as parsed.",
    integrations: "When a facilitator was cross-checked: its URL and the number of kinds it supports.",
    authorization: "Only when the active probe ran: { confirmed: true, reference } from --authorization-ref.",
  },
  check: {
    id: "Check id, documented in the check catalog.",
    title: "Short name of the property checked.",
    status: "Outcome of the check.",
    severity: "Impact if the check fails.",
    message: "What was observed in this run.",
    evidence: "Check-specific observations, such as expected and actual status codes. Values come from the assessed server.",
    recommendation: "How to fix it, on results that did not pass.",
  },
  summary: {
    pass: "Checks that passed.",
    fail: "Checks that failed.",
    warn: "Checks that raised a warning.",
    skip: "Checks that could not run.",
  },
};

const JSON_EXCERPT = `{
  "schemaVersion": 1,
  "reportId": "613cdc9b",
  "product": "Settlens",
  "productVersion": "0.5.0",
  "protocol": "x402",
  "protocolVersion": 2,
  "integrations": { "officialX402Core": "2.28.0" },
  "generatedAt": "2026-10-13T11:14:32.642Z",
  "scope": { "targetCount": 1, "activeTargetCount": 0, "settlementCalls": 0, "privateKeysUsed": 0 },
  "metadata": { "source": "cli" },
  "summary": { "pass": 13, "fail": 0, "warn": 0, "skip": 0 },
  "targets": [
    {
      "id": "23c370f9",
      "name": "127.0.0.1",
      "target": { "url": "http://127.0.0.1:4402/secure", "method": "GET", "requestHeaderNames": [] },
      "mode": "passive",
      "request": {
        "status": 402,
        "durationMs": 12,
        "responseBytes": 28,
        "responseDigest": "bd3559c1cc8ba756860ad6f192140e6ecd6bc00fe6becbccdb6f14bc23d0b319",
        "responseBodyTruncated": false,
        "responseHeaderNames": ["connection", "content-type", "date", "keep-alive", "payment-required", "transfer-encoding"]
      },
      "checks": [
        {
          "id": "binding.resource_url",
          "title": "Payment requirement is bound to the requested resource",
          "status": "pass",
          "severity": "high",
          "message": "resource.url exactly matches the protected request URL.",
          "evidence": {
            "requested": "http://127.0.0.1:4402/secure",
            "advertised": "http://127.0.0.1:4402/secure"
          }
        }
      ]
    }
  ],
  "integrity": {
    "algorithm": "sha256",
    "canonicalization": "settlens-stable-json-v2",
    "digest": "cb591281b5875d2bb9a27c4d2ca290dd5da43c3ec60a9ef49cfa7878a6a39cbd"
  }
}`;

const SARIF_EXCERPT = `{
  "version": "2.1.0",
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "Settlens",
          "version": "0.5.0",
          "informationUri": "https://settlens.com",
          "rules": [
            {
              "id": "policy.network",
              "name": "policy_network",
              "shortDescription": { "text": "Networks match the local policy" },
              "fullDescription": { "text": "Unexpected networks: eip155:84532." },
              "help": { "text": "Restore the approved networks or update the reviewed Settlens policy intentionally." },
              "properties": { "tags": ["security", "x402", "agentic-payments"], "security-severity": "8.0" }
            }
          ]
        }
      },
      "automationDetails": { "id": "settlens/56940334" },
      "invocations": [
        { "executionSuccessful": true, "properties": { "reportDigest": "d5576349e7b85404e354b15b17635e2f31cd2a3d63a42569ca5c0ac957fa2252" } }
      ],
      "results": [
        {
          "ruleId": "policy.network",
          "level": "error",
          "message": { "text": "Unexpected networks: eip155:84532. Target: GET http://127.0.0.1:4402/drift" },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "settlens.config.json", "uriBaseId": "%SRCROOT%" },
                "region": { "startLine": 1 }
              }
            }
          ],
          "partialFingerprints": { "primaryLocationLineHash": "651267a8258e3446:1" },
          "properties": {
            "status": "fail",
            "severity": "high",
            "target": "http://127.0.0.1:4402/drift",
            "recommendation": "Restore the approved networks or update the reviewed Settlens policy intentionally.",
            "reportId": "56940334"
          }
        }
      ]
    }
  ]
}`;

const VERIFY_SNIPPET = `import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// settlens-stable-json-v2: object keys sorted by UTF-16 code unit (the default sort),
// arrays kept in order, other values serialized with JSON.stringify, no whitespace.
// Reports whose integrity.canonicalization is settlens-stable-json-v1 sort keys with
// (a, b) => a.localeCompare(b, "en") instead.
function stable(value) {
  if (Array.isArray(value)) return \`[\${value.map(stable).join(",")}]\`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return \`{\${keys.map((key) => \`\${JSON.stringify(key)}:\${stable(value[key])}\`).join(",")}}\`;
  }
  return JSON.stringify(value);
}

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { integrity, ...content } = report;
const digest = createHash("sha256").update(stable(content)).digest("hex");
console.log(digest === integrity.digest ? "VALID" : "INVALID", digest);`;

const INTEGRITY_SVG = `<svg viewBox="0 0 720 250" width="720" height="250" xmlns="http://www.w3.org/2000/svg">
  <title>How the report digest is computed and verified</title>
  <desc>The report without its integrity block is serialized as canonical JSON, hashed with SHA-256 and the hex digest is stored in integrity.digest. verify-report repeats the computation on the received file and compares.</desc>
  <rect class="d-node" x="16" y="36" width="150" height="64" rx="10"/>
  <rect class="d-node" x="196" y="36" width="200" height="64" rx="10"/>
  <rect class="d-node" x="426" y="36" width="110" height="64" rx="10"/>
  <rect class="d-node d-node--accent" x="566" y="36" width="138" height="64" rx="10"/>
  <text class="d-title" x="91" y="62" text-anchor="middle">Report</text>
  <text class="d-label" x="91" y="84" text-anchor="middle">minus integrity</text>
  <text class="d-title" x="296" y="62" text-anchor="middle">Canonical JSON</text>
  <text class="d-label" x="296" y="84" text-anchor="middle">settlens-stable-json-v2</text>
  <text class="d-title" x="481" y="62" text-anchor="middle">SHA-256</text>
  <text class="d-label" x="481" y="84" text-anchor="middle">hex digest</text>
  <text class="d-title" x="635" y="62" text-anchor="middle">integrity.digest</text>
  <text class="d-label" x="635" y="84" text-anchor="middle">in the report</text>
  <path class="d-msg" d="M166 68h28"/><path class="d-head" d="M188 62l8 6-8 6"/>
  <path class="d-msg" d="M396 68h28"/><path class="d-head" d="M418 62l8 6-8 6"/>
  <path class="d-msg d-msg--accent" d="M536 68h28"/><path class="d-head d-head--accent" d="M558 62l8 6-8 6"/>
  <text class="d-note" x="16" y="22">Written when the report is created</text>
  <rect class="d-zone d-zone--blue" x="16" y="134" width="688" height="100" rx="10"/>
  <path class="d-line" d="M635 100v32"/>
  <text class="d-title" x="36" y="164">verify-report and the MCP verify_report tool</text>
  <text class="d-text" x="36" y="190">Recompute the digest from the file you received, the same way,</text>
  <text class="d-text" x="36" y="214">then compare it with integrity.digest: VALID (exit 0) or INVALID (exit 1).</text>
</svg>`;

export default function render(ctx) {
  const { html, codeBlock, terminal, table, callout, diagram } = ctx;
  const schema = repoJson("schemas/settlens-report.schema.json");
  const anchors = { targetResult: "target-result", check: "check-object", summary: "summary-object" };
  const defs = schema.$defs;

  return html`<p>Every <code>scan</code>, <code>facilitator</code> and <code>check</code> run builds one report object and writes it in up to three formats, chosen with <code>--format</code> (all three by default), into the <code>--out</code> directory (<code>reports</code> by default). Files are named <code>settlens-&lt;reportId&gt;.json</code>, <code>.html</code> and <code>.sarif</code>. <code>--no-write</code> skips the files and prints the console summary only.</p>
${table({
  caption: "Report formats",
  head: ["Format", "For", "Contents"],
  rows: [
    ["JSON", "Evidence, automation, verify-report, evidence attest", "The complete report, with the integrity block."],
    ["HTML", "People: engineers, partners, auditors", "One self-contained file: inline styles, no scripts, nothing loaded from the network."],
    ["SARIF", "Code scanning and SARIF viewers", "Failing and warning checks as SARIF 2.1.0 results."],
  ],
  rowHeaders: true,
})}

<h2 id="json">JSON report</h2>
<p>The JSON report follows the schema in <code>schemas/settlens-report.schema.json</code>, from which the tables below are generated. This excerpt keeps one of the 13 checks of a passive scan of the demo endpoint:</p>
${codeBlock({ lang: "json", title: "settlens-613cdc9b.json (excerpt)", code: JSON_EXCERPT })}
${schemaTable(ctx, { root: schema, node: schema, caption: "Top-level fields", anchors, descriptions: DESCRIPTIONS.root })}
<h3 id="target-result">Target result</h3>
${schemaTable(ctx, { root: schema, node: defs.targetResult, caption: "Fields of each entry in targets", anchors, descriptions: DESCRIPTIONS.targetResult })}
<h3 id="check-object">Check result</h3>
${schemaTable(ctx, { root: schema, node: defs.check, caption: "Fields of each entry in checks", anchors, descriptions: DESCRIPTIONS.check })}
<p>What each id means, and how to fix a failure, is in the <a href="/docs/checks">check catalog</a>.</p>
<h3 id="summary-object">Summary</h3>
${schemaTable(ctx, { root: schema, node: defs.summary, caption: "Fields of summary objects", anchors, descriptions: DESCRIPTIONS.summary })}

<h3 id="what-reports-leave-out">What reports leave out</h3>
<ul>
  <li>Values of the request headers you configure: only their names are kept.</li>
  <li>Response bodies: only their size and SHA-256 digest.</li>
  <li>Credentials in URLs, and the values of common secret query parameters such as <code>token</code>, <code>api_key</code> or <code>signature</code>.</li>
</ul>
<p>Evidence fields do contain what the assessed server sent, for example the payment terms it advertised. Treat them as data from that server, not as instructions.</p>

<h2 id="integrity">Integrity</h2>
<p>The JSON report ends with an <code>integrity</code> block. Its <code>digest</code> is the SHA-256 of the whole report except that block, serialized with the canonicalization named in <code>integrity.canonicalization</code>. New reports use <code>settlens-stable-json-v2</code>: object keys sorted by UTF-16 code unit, arrays kept in order, values serialized as JSON, no whitespace. Reports written by Settlens 0.4.0 and earlier name <code>settlens-stable-json-v1</code> and still verify. Pretty-printing or reordering keys in the file does not change the digest; changing any value does.</p>
${diagram({ svg: INTEGRITY_SVG, label: "The report minus its integrity block is serialized as canonical JSON (settlens-stable-json-v2), hashed with SHA-256, and the hex digest is written to integrity.digest. verify-report and the MCP verify_report tool recompute it from the received file and compare: VALID or INVALID.", caption: "The digest is computed once when the report is created and recomputed by anyone who receives the file." })}
<p>The digest proves that the content is unchanged since it was computed. It does not say who produced the report or when: anyone can edit a report and compute a new digest. To bind a report to a signing identity and a time, sign it with <a href="/docs/evidence">Settlens Evidence</a>. Each run also gets a new <code>reportId</code> and timestamps, so two scans of the same endpoint never share a digest.</p>

<h2 id="verify-a-report">Verify a report</h2>
${terminal({
  title: "settlens verify-report (exit 0, then exit 1 for an edited copy)",
  lines: [
    { kind: "cmd", text: "settlens verify-report reports/settlens-613cdc9b.json" },
    { kind: "pass", text: "VALID Report content matches its SHA-256 evidence digest." },
    { kind: "muted", text: "Expected: cb591281b5875d2bb9a27c4d2ca290dd5da43c3ec60a9ef49cfa7878a6a39cbd" },
    { kind: "muted", text: "Actual:   cb591281b5875d2bb9a27c4d2ca290dd5da43c3ec60a9ef49cfa7878a6a39cbd" },
    { kind: "cmd", text: "settlens verify-report tampered.json" },
    { kind: "fail", text: "INVALID Report content was modified after the evidence digest was created." },
    { kind: "muted", text: "Expected: cb591281b5875d2bb9a27c4d2ca290dd5da43c3ec60a9ef49cfa7878a6a39cbd" },
    { kind: "muted", text: "Actual:   8db417669d0df8842b0478668786774a7b17cf8a98e377a23b28575cf67c66bf" },
  ],
})}
<p>The same verification is available offline to AI agents through the <code>verify_report</code> tool of the <a href="/docs/mcp">MCP server</a>. Without the CLI, these lines of Node.js reproduce it; run against the report above, they print <code>VALID</code> and the same digest:</p>
${codeBlock({ lang: "js", title: "verify-digest.mjs (node verify-digest.mjs report.json)", code: VERIFY_SNIPPET })}
${callout({ tone: "note", title: "Key order is UTF-16 code-unit order", body: html`<p><code>settlens-stable-json-v2</code> sorts keys the way JavaScript's default <code>sort()</code> does, by UTF-16 code unit, with no locale involved. For ASCII keys this is byte order; a reimplementation in another language must compare UTF-16 code units, not code points, for characters outside the Basic Multilingual Plane. The older <code>settlens-stable-json-v1</code> sorted with <code>localeCompare</code> under the <code>en</code> collation, which puts <code>_</code> before letters and compares letters case-insensitively first. When in doubt, verify with <code>settlens verify-report</code>.</p>` })}

<h2 id="html">HTML report</h2>
<p>The HTML file is meant for people. It shows the digest, the pass, fail and warning counts, then each target with its checks sorted by status (fail, warn, pass, skip) and severity. Each check shows its id, severity, message, recommendation and a collapsible evidence block. The file has inline styles only, no scripts and a <code>noindex</code> robots tag, so it can be attached to a ticket or opened offline. Its footer states that the report describes observed behavior and is not a guarantee of security or legal compliance.</p>

<h2 id="sarif">SARIF</h2>
<p>The SARIF file (version 2.1.0) lists failing and warning checks as results, with one rule per check id. Passing and skipped checks are left out.</p>
${table({
  caption: "How check results map to SARIF",
  head: ["Check result", "SARIF level", "security-severity"],
  rows: [
    ["fail, critical", "error", "9.5"],
    ["fail, high", "error", "8.0"],
    ["fail, medium", "warning", "5.0"],
    ["fail, low", "warning", "2.0"],
    ["warn (any severity)", "warning", "rule severity: 9.5, 8.0, 5.0, 2.0 or 0.1 (info)"],
  ],
  rowHeaders: true,
})}
${codeBlock({ lang: "json", title: "settlens-56940334.sarif (excerpt: one rule, one result)", code: SARIF_EXCERPT })}
<p>Findings concern a URL, not a line of code, but code scanning only displays results that have a location. Each result is therefore anchored at line 1 of the configuration file that declared the target: the <code>--config</code> path relative to the working directory for <code>check</code>, and <code>settlens.config.json</code> for an ad hoc <code>scan</code> such as this one. <code>partialFingerprints.primaryLocationLineHash</code> is computed from the check id and the target, so the same rule failing on two targets stays two alerts. The target URL is in the message and in <code>properties.target</code>, and the run's <code>invocations[0].properties.reportDigest</code> ties the SARIF file to its JSON report. How to upload it from a GitHub workflow is covered on the <a href="/docs/github-action#sarif">GitHub Action</a> page.</p>

<h2 id="console">Console summary</h2>
<p>Every run also prints a summary: the report id, the scope counters, then for each target its counts and every check that did not pass, failures first. Colors are used only on a terminal and never when <code>NO_COLOR</code> is set. Examples are on the <a href="/docs/cli#scan">CLI reference</a>.</p>`;
}
