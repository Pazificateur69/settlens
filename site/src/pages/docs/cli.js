// CLI reference. Usage lines and the option table are parsed from the HELP text of src/cli.js
// at build time; transcripts are real output from the bundled demo server (npm run demo:server).

import { VERSION } from "../../../../src/constants.js";
import { cliHelp } from "./_shared.js";

export const meta = {
  path: "/docs/cli",
  title: "CLI reference: commands, options, exit codes",
  label: "CLI reference",
  heading: "CLI reference",
  lede: "Every Settlens command and option, with defaults, exit codes and real output from the bundled demo target.",
  description: "Settlens CLI reference: scan, facilitator, check, verify-report, verify-payment, monitor, evidence and mcp, with every option, default and exit code.",
  section: "docs",
  lastmod: "2026-10-14",
  order: 3,
  icon: "terminal",
  summary: "The Settlens CLI (src/cli.js, Node.js 20.19 or newer) has eight commands: scan, facilitator, check, verify-report, verify-payment, monitor, evidence and mcp. Exit code 0 means success, 1 a failed gate or an invalid result, and 2 a usage, configuration or safety error.",
  sources: [
    { title: "x402 Protocol Specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: "Ethereum Improvement Proposals" },
    { title: "RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)", url: "https://www.rfc-editor.org/rfc/rfc8032.html", publisher: "IRTF" },
  ],
};

// Commands that read each option, from the argument handling in src/cli.js.
const USED_BY = {
  "--method": "scan",
  "--name": "scan, facilitator",
  "--header": "scan, facilitator",
  "--allow-host": "scan, facilitator, check, monitor",
  "--body": "scan",
  "--facilitator": "scan",
  "--timeout": "scan, facilitator, check, monitor",
  "--repeat": "scan, check",
  "--max-amount": "scan",
  "--active": "scan, check",
  "--authorized": "scan, check",
  "--authorization-ref": "scan, check",
  "--out": "scan, facilitator, check; evidence keygen and attest (output file)",
  "--format": "scan, facilitator, check",
  "--fail-on": "scan, facilitator, check, monitor",
  "--no-write": "scan, facilitator, check",
};

// Verified behavior worth knowing beyond the one-line help text.
const NOTES = {
  "--method": "Letters only, upper-cased. A body is refused with GET and HEAD.",
  "--name": "Defaults to the URL hostname.",
  "--header": 'Format "Name: value", split at the first colon. Values never reach a report (only header names do). PAYMENT-SIGNATURE is refused.',
  "--allow-host": "Exact hostname, case-insensitive, without port. Required for every host that receives a custom header.",
  "--body": "Sent as is. Use with --method POST (or another method that takes a body).",
  "--facilitator": "Base URL; Settlens requests <base>/supported and adds the facilitator and coverage checks. With an authorized active probe it also POSTs the invalid payload to <base>/verify.",
  "--timeout": "Positive integer in milliseconds; overrides timeoutMs from a config file.",
  "--repeat": "Positive integer; overrides repeat from a config file. 1 skips the stability comparison.",
  "--max-amount": "Integer in the asset's atomic units, compared with every advertised amount.",
  "--active": "Requires --authorized and --authorization-ref. Sends one intentionally invalid PAYMENT-SIGNATURE.",
  "--authorized": "Accepted only together with --active.",
  "--authorization-ref": "Recorded in the report under targets[].authorization.reference.",
  "--out": "Created if missing. Report files are named settlens-<reportId>.<format>.",
  "--format": "Any subset of json, html and sarif, comma-separated.",
  "--fail-on": "Exit 1 when a failing check has this severity or higher. none never fails.",
  "--no-write": "Prints the console summary only.",
};

const EXTRA_OPTIONS = [
  ["--config <file>", "check, monitor", "Path to a JSON configuration file. Required by both commands."],
  ["--state <file>", "monitor", "JSON file holding the previous run. Read if present, rewritten after every run."],
  ["--webhook <url>", "monitor", "URL that receives a JSON POST when at least one blocking alert is raised."],
  ["--now <unix-seconds|ISO-8601>", "verify-payment", "Time at which the EVM validity window is checked, for example the moment a capture was used. Default: the current clock. The output prints the time used."],
  ["--key <key.pem>", "evidence attest", "PKCS#8 PEM ed25519 private key created by evidence keygen."],
  ["--report <report.json>", "evidence verify", "Report to compare with the attestation's digest."],
  ["--expect-key <public-key.pem>", "evidence verify", "The signer you trust: an ed25519 PEM public key or a file holding the 0x hex key printed by evidence keygen. An attestation signed by any other key is INVALID; a malformed or non-ed25519 key exits 2."],
  ["--version", "all", "Prints the CLI version and exits 0."],
  ["--help", "all", "Prints the usage text and exits 0. Running settlens with no arguments does the same."],
];

const t = (kind, text) => ({ kind, text });

const SCAN_SECURE = [
  t("cmd", "settlens scan http://127.0.0.1:4402/secure"),
  t("out", "Settlens x402 assessment 8ef6b907"),
  t("muted", "Targets 1 · Active 0 · Settlement calls 0"),
  t("out", ""),
  t("out", "127.0.0.1  GET http://127.0.0.1:4402/secure"),
  t("pass", "13 pass · 0 fail · 0 warn · 0 skip"),
  t("out", ""),
  t("out", "Total: 13 pass · 0 fail · 0 warn · 0 skip"),
  t("out", ""),
  t("out", "Reports:"),
  t("muted", "  …/reports/settlens-8ef6b907.json"),
  t("muted", "  …/reports/settlens-8ef6b907.html"),
  t("muted", "  …/reports/settlens-8ef6b907.sarif"),
];

const SCAN_POLICY = [
  t("cmd", "settlens scan http://127.0.0.1:4402/drift \\"),
  t("cont", "    --expect-network eip155:8453 --max-amount 5000"),
  t("out", "Settlens x402 assessment 7093ee3c"),
  t("muted", "Targets 1 · Active 0 · Settlement calls 0"),
  t("out", ""),
  t("out", "127.0.0.1  GET http://127.0.0.1:4402/drift"),
  t("out", "12 pass · 2 fail · 1 warn · 0 skip"),
  t("fail", "  FAIL high     Networks match the local policy"),
  t("muted", "       Unexpected networks: eip155:84532."),
  t("fail", "  FAIL high     Amounts stay within the approved ceiling"),
  t("muted", "       1 payment amount(s) exceed 5000."),
  t("warn", "  WARN medium   Payment requirements remain stable"),
  t("muted", "       Payment terms changed between identical unauthenticated requests."),
  t("out", ""),
  t("out", "Total: 12 pass · 2 fail · 1 warn · 0 skip"),
];

const SCAN_ACTIVE = [
  t("cmd", "settlens scan http://127.0.0.1:4402/bypass \\"),
  t("cont", "    --active --authorized --authorization-ref DEMO-APPROVAL-002 --no-write"),
  t("out", "Settlens x402 assessment 89ea5946"),
  t("muted", "Targets 1 · Active 1 · Settlement calls 0"),
  t("out", ""),
  t("out", "127.0.0.1  GET http://127.0.0.1:4402/bypass"),
  t("out", "13 pass · 1 fail · 1 warn · 0 skip"),
  t("fail", "  FAIL critical Invalid payment authorization is denied"),
  t("muted", "       The endpoint returned HTTP 200 after an invalid payment authorization."),
  t("warn", "  WARN medium   Invalid payment uses a standard failure status"),
  t("muted", "       Expected HTTP 400 or 402 for invalid payment, received HTTP 200."),
  t("out", ""),
  t("out", "Total: 13 pass · 1 fail · 1 warn · 0 skip"),
];

const FACILITATOR = [
  t("cmd", "settlens facilitator http://127.0.0.1:4402/facilitator --no-write"),
  t("out", "Settlens x402 assessment 0950222c"),
  t("muted", "Targets 1 · Active 0 · Settlement calls 0"),
  t("out", ""),
  t("out", "127.0.0.1  GET http://127.0.0.1:4402/facilitator/supported"),
  t("pass", "8 pass · 0 fail · 0 warn · 0 skip"),
  t("out", ""),
  t("out", "Total: 8 pass · 0 fail · 0 warn · 0 skip"),
];

const CHECK = [
  t("cmd", "settlens check --config settlens.config.example.json"),
  t("out", "Settlens x402 assessment bfd83874"),
  t("muted", "Targets 1 · Active 0 · Settlement calls 0"),
  t("out", ""),
  t("out", "local-secure-demo  GET http://127.0.0.1:4402/secure"),
  t("pass", "28 pass · 0 fail · 0 warn · 0 skip"),
  t("out", ""),
  t("out", "Total: 28 pass · 0 fail · 0 warn · 0 skip"),
];

const VERIFY_REPORT = [
  t("cmd", "settlens verify-report reports/settlens-8ef6b907.json"),
  t("pass", "VALID Report content matches its SHA-256 evidence digest."),
  t("muted", "Expected: 646b3d941885b8bf1cb50ff4f55a24b0635b936ba233d24957c235bf1ce4f1ef"),
  t("muted", "Actual:   646b3d941885b8bf1cb50ff4f55a24b0635b936ba233d24957c235bf1ce4f1ef"),
  t("cmd", "settlens verify-report tampered.json"),
  t("fail", "INVALID Report content was modified after the evidence digest was created."),
  t("muted", "Expected: 646b3d941885b8bf1cb50ff4f55a24b0635b936ba233d24957c235bf1ce4f1ef"),
  t("muted", "Actual:   f084495caab4f2db67460c33f7de67542dac55f84c87db6a536d97739cffd55a"),
];

const VERIFY_PAYMENT = [
  t("cmd", "settlens verify-payment payment.json --now 2026-10-13T10:00:00Z"),
  t("pass", "VERIFIED exact EVM payment authorization"),
  t("out", "Recovered signer: 0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a"),
  t("out", "Signature valid:  true"),
  t("out", "Recipient bound:  true"),
  t("out", "Amount bound:     true"),
  t("out", "Within window:    true (at 1791885600)"),
  t("cmd", "settlens verify-payment payment-wrong-recipient.json --now 2026-10-13T10:00:00Z"),
  t("fail", "REJECTED exact EVM payment authorization"),
  t("out", "Recovered signer: 0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a"),
  t("out", "Signature valid:  true"),
  t("fail", "Recipient bound:  false"),
  t("out", "Amount bound:     true"),
  t("out", "Within window:    true (at 1791885600)"),
  t("out", "Reasons:"),
  t("muted", "  - authorization.to does not match requirement.payTo."),
];

const PAYMENT_FILE = `{
  "requirement": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USDC", "version": "2" }
  },
  "payload": {
    "signature": "0x03d6ea79…e506221b",
    "authorization": {
      "from": "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "10000",
      "validAfter": "1791885175",
      "validBefore": "1791888835",
      "nonce": "0x2222…2222"
    }
  }
}`;

export default function render(ctx) {
  const { html, codeBlock, terminal, table, callout, find } = ctx;
  const help = cliHelp();
  // Guides and tools written separately: linked only once their page exists.
  const linkTo = (path) => (find(path) ? html`<a href="${path}">${find(path).title}</a>` : "");
  const facilitatorGuide = linkTo("/learn/x402-facilitator-security");
  const verifier = find("/tools/eip-3009-verifier") ? html`<a href="/tools/eip-3009-verifier">EIP-3009 signature verifier</a>` : "";
  // Lists rather than tables: option names stay readable at any width.
  const optionItems = help.options.map((option) => {
    const readBy = USED_BY[option.flag] ?? (option.flag.startsWith("--expect-") ? "scan" : "");
    return html`<li><code>${option.flag}${option.argument ? ` ${option.argument}` : ""}</code>: ${option.description}.${NOTES[option.flag] ? html` ${NOTES[option.flag]}` : ""}${option.fallback ? html` Default <code>${option.fallback}</code>.` : ""}${readBy ? html` <em>Read by ${readBy}.</em>` : ""}</li>`;
  });

  return html`<p>The Settlens CLI is one Node.js program, <code>src/cli.js</code> (version ${VERSION}). It needs Node.js 20.19 or newer and no wallet or payment key; the only private key it reads is your ed25519 evidence key, in <code>evidence attest</code>. Passive scanning is the default; nothing it does calls a facilitator's <code>/settle</code> or moves funds. The code is in a source repository that pilot participants receive; it is not published on npm.</p>
${callout({
  tone: "note",
  title: "settlens in these docs",
  body: html`<p>Examples write <code>settlens</code> for <code>node /path/to/settlens/src/cli.js</code>. Inside the repository, <code>npm run settlens -- &lt;args&gt;</code> does the same. An alias keeps the examples copy-pasteable:</p>`,
})}
${codeBlock({ lang: "shell", title: "Run from the repository root", code: `alias settlens="node $PWD/src/cli.js"
settlens --version` })}

<h2 id="synopsis">Synopsis</h2>
<p>The usage block printed by <code>settlens --help</code>:</p>
${codeBlock({ lang: "text", title: "settlens --help (usage)", code: help.usage.join("\n"), copy: false })}

<h2 id="argument-syntax">Argument syntax</h2>
<ul>
  <li>Options take their value as the next argument: <code>--fail-on high</code>. The <code>--fail-on=high</code> form is not supported and is reported as an unknown option.</li>
  <li>A value cannot start with <code>--</code>; the CLI reports <code>Missing value for --option.</code></li>
  <li><code>--header</code>, <code>--allow-host</code> and the <code>--expect-*</code> options are repeatable. The <code>--expect-*</code> options also accept comma-separated lists.</li>
  <li>Unknown options and unknown commands stop the run with exit code 2 before any request is sent.</li>
</ul>

<h2 id="exit-codes">Exit codes</h2>
${table({
  caption: "Exit codes for every command",
  head: ["Code", "Meaning"],
  rows: [
    ["0", html`Success. <code>scan</code>, <code>facilitator</code> and <code>check</code>: no failing check at or above <code>--fail-on</code>. <code>verify-report</code> and <code>evidence verify</code>: valid. <code>verify-payment</code>: verified. <code>monitor</code>: no blocking regression. <code>evidence keygen</code>, <code>evidence attest</code>, <code>--help</code>, <code>--version</code> and <code>mcp</code>: completed.`],
    ["1", html`The gate failed: a failing check at or above the threshold, an <code>INVALID</code> report or attestation, a <code>REJECTED</code> payment, or a blocking monitor alert. An unreachable endpoint is a failing <code>transport.reachable</code> check (high), so it exits 1 at the default threshold.`],
    ["2", html`Usage, configuration or safety error, printed as <code>Settlens error: …</code> on stderr: unknown command or option, missing value or file, invalid JSON or config, <code>--active</code> without <code>--authorized</code> and <code>--authorization-ref</code>, a <code>PAYMENT-SIGNATURE</code> header, a custom header sent to a host that is not allowlisted, an existing file given to <code>evidence keygen --out</code>, an invalid <code>monitor --fail-on</code>, or a malformed <code>--expect-key</code>.`],
  ],
  rowHeaders: true,
})}

<h2 id="commands">Commands</h2>

<h3 id="scan">scan</h3>
<p>Assesses one paid resource. By default the scan is passive: it sends ordinary unauthenticated requests (two by default), does not follow redirects, reads at most 1 MiB of each response and never sends <code>PAYMENT-SIGNATURE</code>. The checks it runs are listed in the <a href="/docs/checks">check catalog</a>.</p>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens scan <url> [options]", copy: false })}
${terminal({ title: "Passive scan of the compliant demo endpoint (exit 0; absolute paths shortened)", lines: SCAN_SECURE })}
<p>Add a local policy with the <code>--expect-*</code> options and <code>--max-amount</code>. Every option the server advertises must satisfy the policy; one non-compliant option fails the check. The demo's <code>/drift</code> endpoint alternates its price between two requests and advertises Base Sepolia (<code>eip155:84532</code>), so a mainnet policy fails:</p>
${terminal({ title: "Policy and drift findings (exit 1)", lines: SCAN_POLICY })}
<p>With the endpoint owner's written approval, <code>--active --authorized --authorization-ref &lt;id&gt;</code> adds one request carrying an intentionally invalid <code>PAYMENT-SIGNATURE</code>. The demo's <code>/bypass</code> endpoint trusts the mere presence of the header, which is the critical finding the probe exists to catch:</p>
${terminal({ title: "Authorized active probe against a deliberately vulnerable endpoint (exit 1)", lines: SCAN_ACTIVE })}
${callout({ tone: "warning", title: "Authorized testing only", body: html`<p>Run the active probe only against endpoints you own or have written permission to test, and record the approval in <code>--authorization-ref</code>. It never calls <code>/settle</code> and needs no key, but it is still traffic the owner must approve. See the <a href="/docs/methodology#active-probe">methodology</a>.</p>` })}
<p>To reach a gateway that needs authentication, pass a header and allowlist its destination host. Without the allowlist the CLI refuses to send it:</p>
${codeBlock({ lang: "shell", title: "Custom header with an allowlisted host", code: `settlens scan https://merchant.example/paid \\
  --header "Authorization: Bearer $ASSESSMENT_TOKEN" \\
  --allow-host merchant.example` })}
<p>In CI, set the same exact hostnames in <code>SETTLENS_ALLOWED_HOSTS</code> (comma-separated) instead, outside the configuration file; the GitHub Action does this through its <code>allowed-hosts</code> input.</p>

<h3 id="facilitator">facilitator</h3>
<p>Assesses a facilitator on its own by reading <code>GET &lt;base-url&gt;/supported</code>: reachability, response size, HTTP 200, JSON media type, HTTPS, the SupportedResponse shape, x402 V2 capability and duplicate kinds. It never calls <code>/verify</code> or <code>/settle</code>. To check that a facilitator covers what a resource advertises, use <code>scan --facilitator</code> instead.${facilitatorGuide ? html` What these checks can and cannot establish about a facilitator: ${facilitatorGuide}.` : ""}</p>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens facilitator <base-url> [options]", copy: false })}
${terminal({ title: "Facilitator capability scan (exit 0)", lines: FACILITATOR })}

<h3 id="check">check</h3>
<p>Runs every target of a <a href="/docs/configuration">configuration file</a> and writes one report covering all of them. This is the command the <a href="/docs/github-action">GitHub Action</a> runs. <code>--out</code> and <code>--fail-on</code> override the file's <code>output</code> and <code>failOn</code>; <code>--timeout</code> and <code>--repeat</code> override each target's values; <code>--active --authorized --authorization-ref</code> applies the probe to every target.</p>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens check --config <file> [options]", copy: false })}
${terminal({ title: "The repository's example config against the demo server (exit 0)", lines: CHECK })}

<h3 id="verify-report">verify-report</h3>
<p>Recomputes the SHA-256 digest of a JSON report and compares it with the report's <code>integrity</code> block. It works offline. Exit 0 means the content is unchanged since the digest was written; it does not say who wrote the report. For that, sign it with <a href="/docs/evidence">evidence attest</a>. How the digest is computed is described in <a href="/docs/reports#integrity">Reports</a>.</p>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens verify-report <report.json>", copy: false })}
${terminal({ title: "An intact report (exit 0) and an edited copy (exit 1)", lines: VERIFY_REPORT })}
<p>A file without a Settlens integrity block prints <code>INVALID Report does not contain a supported Settlens integrity block.</code> and exits 1.</p>

<h3 id="verify-payment">verify-payment</h3>
<p>Checks a captured payment authorization offline, with no RPC. The file holds the advertised requirement (one <code>accepts</code> entry) and the payment payload. The command also accepts <code>paymentRequirements</code> instead of <code>requirement</code>, and <code>paymentPayload</code> (a full PaymentPayload object) instead of <code>payload</code>.</p>
<ul>
  <li><strong>EVM <code>exact</code> scheme</strong> (<code>eip155:*</code> networks): rebuilds the EIP-712 domain from <code>requirement.extra.name</code>, <code>requirement.extra.version</code>, <code>requirement.asset</code> and the chain id, recovers the EIP-3009 <code>TransferWithAuthorization</code> signer and requires it to equal <code>authorization.from</code>. High-s (malleable) signatures are rejected. It then checks that <code>to</code> equals <code>payTo</code>, <code>value</code> equals <code>amount</code>, and that the check time is strictly between <code>validAfter</code> and <code>validBefore</code> (<code>validAfter &lt; now &lt; validBefore</code>, as EIP-3009 requires). The check time is the current clock, or <code>--now</code>. Because the asset is the EIP-712 verifying contract, a signature made for another token does not recover to <code>from</code>.</li>
  <li><strong>Solana</strong> (<code>solana:*</code> networks): checks every signature slot of a Base64 legacy or versioned transaction (<code>payload.transaction</code>) against its account key with ed25519. Empty slots are reported as pending. Without payment terms, the verdict explicitly covers signatures only: at least one signature must be present, every present signature must be valid and the slot count must match the message header. Supplying <code>asset</code>, <code>amount</code>, <code>payTo</code> and <code>extra.feePayer</code> also requires the supported offline SPL TransferChecked profile. A rejected or unverified payment profile exits 1 even when signatures are valid. Partial payment terms exit 2 rather than falling back to signatures only. Static instruction checks do not establish runtime execution, balances, replay protection or settlement; unsupported instructions, lookup tables and token extensions remain unverified.</li>
</ul>
<p>The fields and the EIP-712 domain are explained in <a href="/learn/eip-3009">EIP-3009 transferWithAuthorization for x402</a>.${verifier ? html` To check one authorization in the browser: ${verifier}.` : ""}</p>
${codeBlock({ lang: "json", title: "payment.json (signature and nonce shortened)", code: PAYMENT_FILE, copy: false })}
${terminal({ title: "A valid authorization (exit 0) and the same signature against another recipient (exit 1)", lines: VERIFY_PAYMENT })}
${callout({ tone: "info", title: "What verify-payment does not check", body: "It does not read the chain: no balance check, no on-chain nonce or replay check and no settlement check. Other networks exit 2 with \"verify-payment supports the exact EVM (eip155) and Solana schemes.\"" })}

<h3 id="monitor">monitor</h3>
<p>Runs a passive scan of every configured target, compares it with the previous run stored in <code>--state</code>, prints alerts (regressions, new findings and removed checks) and exits 1 when one reaches <code>--fail-on</code>. <code>--webhook</code> posts the alerts as JSON. Monitoring is always passive, even if <code>--active</code> is given. Full usage, the state file and the webhook payload are in <a href="/docs/monitor">Monitor</a>.</p>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens monitor --config <file> [--state <file>] [--webhook <url>] [--fail-on <severity>] [--timeout <ms>]", copy: false })}

<h3 id="evidence">evidence keygen, attest, verify</h3>
<p>Signs a report digest with an ed25519 key and verifies the result offline. <code>keygen</code> writes a PKCS#8 PEM private key (with <code>--out</code>, to a new file with mode 0600; it refuses to overwrite an existing file and exits 2; otherwise to stdout) and prints the public key; <code>attest</code> signs a report; <code>verify</code> checks an attestation and, with <code>--report</code>, that the report is intact and is the one attested, and with <code>--expect-key</code>, that it was signed by the key you trust. Walkthrough and key management: <a href="/docs/evidence">Evidence</a>.</p>
${codeBlock({ lang: "shell", title: "Syntax", code: `settlens evidence keygen [--out <key.pem>]
settlens evidence attest <report.json> --key <key.pem> [--out <file>]
settlens evidence verify <attestation.json> [--report <report.json>] [--expect-key <public-key.pem>]`, copy: false })}

<h3 id="mcp">mcp</h3>
<p>Starts the Settlens MCP server over stdio for Claude Desktop, Claude Code or any MCP client, so an agent can check an x402 payment request before paying. Stdout carries protocol messages only. The server exposes the offline verification tools and the passive network tools; it never signs or pays. Setup, tools and the remote endpoint: <a href="/docs/mcp">MCP server</a>.</p>
${codeBlock({ lang: "shell", title: "Syntax", code: "settlens mcp", copy: false })}

<h2 id="options">Options</h2>
<p>The options printed by <code>settlens --help</code>, in the same order. Every command accepts the same option names; each entry says which commands read it, others ignore it.</p>
<ul>${optionItems}</ul>
<h3 id="command-specific-options">Command-specific options</h3>
<p>Options that are not in the help text's option list:</p>
<ul>${EXTRA_OPTIONS.map(([flag, by, text]) => html`<li><code>${flag}</code>: ${text} <em>Read by ${by}.</em></li>`)}</ul>

<h2 id="environment-variables">Environment variables</h2>
<ul>
  <li><code>SETTLENS_ALLOWED_HOSTS</code>: comma-separated exact hostnames allowed to receive custom headers, added to any <code>--allow-host</code> values. It lives outside the config file on purpose, so a modified config cannot send secrets to a new host.</li>
  <li><code>NO_COLOR</code>: disables ANSI colors. Colors are also off whenever stdout is not a terminal.</li>
  <li><code>\${NAME}</code> inside a config file: expanded from the environment when the file is loaded; a missing variable is an error. See <a href="/docs/configuration#environment-variables">Configuration</a>.</li>
  <li><code>SETTLENS_DEMO_PORT</code>: port of the local demo server started by <code>npm run demo:server</code> (default 4402).</li>
</ul>

<h2 id="safety-rules">Safety rules the CLI enforces</h2>
<ul>
  <li>Passive mode never sends <code>PAYMENT-SIGNATURE</code>, and a user-supplied <code>PAYMENT-SIGNATURE</code> header is refused in options and config files.</li>
  <li>The active probe needs <code>--active</code>, <code>--authorized</code> and a non-empty <code>--authorization-ref</code>; <code>--authorized</code> alone is an error.</li>
  <li>Redirects are never followed; a 3xx answer is reported with its sanitized <code>Location</code>.</li>
  <li>URLs with embedded credentials are refused. Reports keep request header names but not their values, and redact the values of common secret query parameters (<code>token</code>, <code>api_key</code>, <code>signature</code>, <code>secret</code>…).</li>
  <li>No command calls <code>/settle</code>, signs a payment or needs a wallet. Every report records <code>settlementCalls: 0</code> and <code>privateKeysUsed: 0</code>.</li>
</ul>

<h2 id="container">Run in a container</h2>
<p>The repository's <code>Dockerfile</code> builds a non-root image (user <code>node</code>) on a digest-pinned <code>node:24-alpine</code> base, with production dependencies installed from the lockfile and install scripts disabled. The entrypoint is the CLI and the working directory is <code>/workspace</code>.</p>
${codeBlock({ lang: "shell", title: "Build and run the image", code: `docker build -t settlens:local .
docker run --rm settlens:local --version
docker run --rm -v "$PWD:/workspace" settlens:local check --config settlens.config.json` })}
<p>The container runs as UID 1000, so a mounted directory must be writable by that user for reports to be saved. Inside a container, <code>127.0.0.1</code> is the container itself, not the host running the demo server.</p>
<p>Next: write a <a href="/docs/configuration">configuration file</a>, read the <a href="/docs/reports">report formats</a>, or gate pull requests with the <a href="/docs/github-action">GitHub Action</a>.</p>`;
}
