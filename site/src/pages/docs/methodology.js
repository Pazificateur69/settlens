// Assessment methodology. Updated from docs/METHODOLOGY.md and docs/PILOT_ACCEPTANCE.md to the
// current code: src/scanner.js, src/protocol.js (invalid probe payload), src/facilitator.js.

import { DEFAULT_REPEAT, DEFAULT_TIMEOUT_MS, OFFICIAL_X402_CORE_VERSION, VERSION } from "../../../../src/constants.js";

export const meta = {
  path: "/docs/methodology",
  title: "Assessment methodology",
  label: "Methodology",
  heading: "Assessment methodology",
  lede: "What a Settlens assessment observes, what it sends in each mode, how results are graded and what a passing report does and does not prove.",
  description: "How Settlens assesses x402 endpoints: passive scans, the authorized invalid-signature probe, facilitator checks, result semantics and the limits of a report.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 11,
  icon: "book",
  summary: "Settlens assesses the x402 V2 HTTP payment challenge with passive requests that carry no payment header, an optional facilitator GET /supported check and, only with an owner approval reference, one invalid PAYMENT-SIGNATURE. A passing report shows behavior observed during the scan, not a certification.",
  sources: [
    { title: "x402 Protocol Specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "x402 V1 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v1/http.md", publisher: "x402 Foundation" },
    { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: "Ethereum Improvement Proposals" },
    { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: "Ethereum Improvement Proposals" },
  ],
};

const MODES_SVG = `<svg viewBox="0 0 720 400" width="720" height="400" xmlns="http://www.w3.org/2000/svg">
  <title>What Settlens sends in each mode</title>
  <desc>Passive mode sends requests without a payment header and reads 402 with PAYMENT-REQUIRED, plus GET /supported on the facilitator. The authorized active probe sends one invalid PAYMENT-SIGNATURE that must not be answered with 2xx, and posts the invalid payload to /verify, which must answer isValid false. Settlens never sends a valid signature or calls /settle.</desc>
  <rect class="d-zone" x="24" y="72" width="672" height="132" rx="10"/>
  <rect class="d-zone d-zone--blue" x="24" y="214" width="672" height="144" rx="10"/>
  <rect class="d-node d-node--accent" x="40" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="280" y="16" width="160" height="44" rx="10"/>
  <rect class="d-node" x="520" y="16" width="160" height="44" rx="10"/>
  <text class="d-title" x="120" y="43" text-anchor="middle">Settlens</text>
  <text class="d-title" x="360" y="43" text-anchor="middle">Paid resource</text>
  <text class="d-title" x="600" y="43" text-anchor="middle">Facilitator</text>
  <path class="d-life" d="M120 60v300M360 60v300M600 60v300"/>
  <path class="d-msg" d="M120 100h236"/><path class="d-head" d="M350 94l8 6-8 6"/>
  <text class="d-label" x="240" y="91" text-anchor="middle">GET, no payment header</text>
  <path class="d-msg d-msg--accent" d="M360 138H124"/><path class="d-head d-head--accent" d="M130 132l-8 6 8 6"/>
  <text class="d-label d-label--accent" x="240" y="129" text-anchor="middle">402 + PAYMENT-REQUIRED</text>
  <text class="d-note" x="372" y="124">2 samples by default</text>
  <path class="d-msg" d="M120 180h472"/><path class="d-head" d="M588 174l8 6-8 6"/>
  <text class="d-label" x="480" y="171" text-anchor="middle">GET /supported</text>
  <text class="d-note" x="688" y="94" text-anchor="end">Passive</text>
  <path class="d-msg d-msg--blue" d="M120 244h236"/><path class="d-head d-head--blue" d="M350 238l8 6-8 6"/>
  <text class="d-label" x="240" y="235" text-anchor="middle">invalid PAYMENT-SIGNATURE</text>
  <path class="d-msg" d="M360 282H124"/><path class="d-head" d="M130 276l-8 6 8 6"/>
  <text class="d-label" x="240" y="273" text-anchor="middle">must not be 2xx</text>
  <path class="d-msg d-msg--blue" d="M120 314h472"/><path class="d-head d-head--blue" d="M588 308l8 6-8 6"/>
  <text class="d-label" x="480" y="305" text-anchor="middle">POST /verify, invalid payload</text>
  <path class="d-msg" d="M600 342H124"/><path class="d-head" d="M130 336l-8 6 8 6"/>
  <text class="d-label" x="480" y="333" text-anchor="middle">isValid must be false</text>
  <text class="d-note d-note--blue" x="688" y="236" text-anchor="end">Active,</text>
  <text class="d-note d-note--blue" x="688" y="254" text-anchor="end">authorized</text>
  <text class="d-text" x="360" y="388" text-anchor="middle">Never sent: a valid signature, a call to /settle, any funds.</text>
</svg>`;

export default function render(ctx) {
  const { html, table, callout, diagram, faq, find } = ctx;
  // Guides written separately: linked only once their page exists.
  const migration = find("/learn/x402-v1-to-v2-migration");
  const facilitatorGuide = find("/learn/x402-facilitator-security");
  return html`<p>This page describes how Settlens ${VERSION} gathers evidence and what that evidence can support. It applies to every interface: the <a href="/docs/cli">CLI</a>, the <a href="/docs/github-action">GitHub Action</a>, <a href="/docs/monitor">Monitor</a>, the <a href="/docs/api">HTTP API</a> and the network tools of the <a href="/docs/mcp">MCP server</a>.</p>

<h2 id="scope">Scope</h2>
<p>Settlens evaluates the x402 V2 HTTP payment challenge exposed by a paid resource, the advertised capabilities of an optional facilitator, and, offline, captured payment authorizations. It combines four kinds of checks:</p>
<ul>
  <li>Conformance checks derived from the <a href="https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md">x402 V2 core specification</a> and the <a href="https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md">V2 HTTP transport</a>.</li>
  <li>Compatibility parsing with the official <code>@x402/core</code> SDK, pinned at version ${OFFICIAL_X402_CORE_VERSION}, so a result reflects what clients built on that SDK accept.</li>
  <li>An operator policy: allowed schemes, networks, recipients, assets and a maximum amount, each checked only when you set it.</li>
  <li>Conservative security checks: transport, binding of the payment to the requested resource, stability across requests and, with authorization, fail-closed behavior.</li>
</ul>
<p>Every check is documented with its rationale and fix in the <a href="/docs/checks">check catalog</a>.</p>
<p>Only V2 is assessed. An x402 V1 endpoint sends its requirements in the 402 response body instead of the <code>PAYMENT-REQUIRED</code> header, so it fails <a href="/docs/checks#transport.payment_required_header"><code>transport.payment_required_header</code></a> (high).${migration ? html` See <a href="${migration.path}">${migration.title}</a>.` : ""}</p>

<h2 id="modes">Modes</h2>
${diagram({ svg: MODES_SVG, label: "Sequence of requests. Passive: Settlens sends GET requests without a payment header to the paid resource, which answers 402 with PAYMENT-REQUIRED (two samples by default), and GET /supported to the facilitator. Active, authorized only: one request with an invalid PAYMENT-SIGNATURE that must not get a 2xx answer, and a POST of the invalid payload to the facilitator's /verify, which must answer isValid false. Settlens never sends a valid signature, never calls /settle and moves no funds.", caption: "Passive requests are the default. The blue band runs only with --active --authorized --authorization-ref.", size: "wide" })}

<h3 id="passive-scan">Passive scan</h3>
<p>The default. Settlens sends ordinary requests without any payment header, ${DEFAULT_REPEAT} by default, with <code>Accept: application/json</code> and the user agent <code>Settlens/${VERSION} authorized-security-assessment</code>. Each request has a ${DEFAULT_TIMEOUT_MS} ms timeout, redirects are never followed (a redirect is reported instead), and at most 1 MiB of the body is read, hashed and discarded. The first answer is checked for HTTP 402, the <code>PAYMENT-REQUIRED</code> header, its Base64 JSON encoding, the official SDK schema, the V2 shape, the binding of <code>resource.url</code> to the requested URL, every advertised payment option and your policy. Later samples are compared with the first to detect terms that change between identical requests; known ephemeral fields (<code>recentBlockhash</code>, <code>lastValidBlockHeight</code>) are ignored.</p>

<h3 id="facilitator-scan">Facilitator scan</h3>
<p>With a facilitator URL, Settlens reads <code>GET /supported</code> and checks its status, media type, transport, the SupportedResponse shape, x402 V2 capability, duplicate kinds and signer metadata. When a resource was scanned too, it checks that every scheme and network the resource advertises is supported by the facilitator for the same x402 version. This is passive: <code>/verify</code> is called only by the active probe, and <code>/settle</code> never.${facilitatorGuide ? html` Facilitator risks these checks do and do not cover: <a href="${facilitatorGuide.path}">${facilitatorGuide.title}</a>.` : ""}</p>

<h3 id="active-probe">Authorized active probe</h3>
<p>The active probe answers one question: does the resource stay closed when someone presents an invalid payment? It runs only when three conditions hold: <code>--active</code>, <code>--authorized</code> and a non-empty <code>--authorization-ref</code> are given, and the passive scan decoded a V2 PaymentRequired object with at least one payment option. The CLI refuses to start (exit 2) when <code>--active</code> comes without the other two; any other caller that requests the probe without authorization gets a failing <code>safety.active_authorization</code> check instead of a probe. Without a decodable V2 PaymentRequired object, the probe is skipped.</p>
<p>The probe payload is built from the first advertised option and cannot authorize a transfer:</p>
<ul>
  <li>EVM networks: an all-zero 65-byte signature over an authorization from the zero address, with a zero nonce, the advertised recipient and amount, and a validity window around the current time.</li>
  <li>Solana networks: a transaction field made of 64 zero bytes.</li>
  <li>Other networks: a marker payload, <code>settlens-intentionally-invalid-authorization</code>.</li>
</ul>
<p>It is sent once, Base64-encoded in <code>PAYMENT-SIGNATURE</code>. A <code>2xx</code> answer is a critical failure: the resource serves content for a payment that cannot be valid. An answer other than <code>400</code> or <code>402</code> is a medium warning. When a facilitator is configured, the same payload is posted to its <code>/verify</code>, which must answer with a well-formed VerifyResponse and <code>isValid: false</code>; <code>isValid: true</code> is a critical failure. The authorization reference is written into the report.</p>
${callout({ tone: "warning", title: "Authorization comes first", body: html`<p>Run the active probe only on endpoints you own or are allowed in writing to test. It is one request, with no key and no funds, but it is still traffic the owner must approve. Settlens records the reference you give; it cannot check that the approval exists.</p>` })}

<h3 id="offline-verification">Offline verification</h3>
<p><code>verify-payment</code> and the MCP verification tools check captured authorizations without any network access: EIP-3009 / EIP-712 signer recovery for the EVM <code>exact</code> scheme with the domain rebuilt from the requirement, binding of recipient, amount and asset, and the validity window (strictly <code>validAfter &lt; now &lt; validBefore</code>); for Solana transactions, the ed25519 signature in every signer slot, with empty slots such as the fee payer's before settlement reported as pending. They do not check balances, on-chain nonce use or replay, or settlement. Details: <a href="/docs/cli#verify-payment">verify-payment</a>.</p>

<h2 id="results">Result semantics</h2>
<p>Each check ends as <code>pass</code>, <code>fail</code>, <code>warn</code> or <code>skip</code> and carries a severity from <code>info</code> to <code>critical</code>. Severity expresses expected impact if the property does not hold, not the likelihood of exploitation. The default CI threshold is <code>high</code>: a run fails when a check of severity high or critical fails. Definitions and counts: <a href="/docs/checks#reading-checks">How to read a check</a>.</p>
${table({
  caption: "What each severity means",
  head: ["Severity", "Meaning"],
  rows: [
    ["critical", "Payment protection can be bypassed."],
    ["high", "A required protocol, binding, policy, reachability or facilitator-coverage property fails."],
    ["medium", "A meaningful transport, signer or stability weakness."],
    ["low", "Hygiene or ambiguity."],
    ["info", "Descriptive evidence."],
  ],
  rowHeaders: true,
})}

<h2 id="evidence-handling">Evidence handling</h2>
<p>Reports record the sanitized target URL, request header names, response status, duration, size and body digest, the response header names, and check-specific evidence. They omit request header values and response bodies. The JSON report is serialized with the <code>settlens-stable-json-v2</code> canonicalization (keys in code-unit order, independent of locale; reports made with v1 still verify) and hashed with SHA-256, so <code>verify-report</code> can detect any later change. The digest establishes integrity only; binding a report to a signer and a time is the job of an <a href="/docs/evidence">evidence attestation</a>. Every report also states <code>settlementCalls: 0</code> and <code>privateKeysUsed: 0</code>.</p>

<h2 id="limits">What a passing report proves</h2>
<p>A passing report shows that the sampled endpoint behaved consistently with the tested properties during the recorded window, for the requests Settlens sent. It does not establish:</p>
<ul>
  <li>the absence of vulnerabilities in code paths the requests did not exercise;</li>
  <li>that real wallet signatures are verified correctly beyond the one invalid payload class the active probe sends;</li>
  <li>on-chain facts: balances, nonce use, replay protection or settlement;</li>
  <li>uptime, rate limiting, economic safety or multi-tenant isolation;</li>
  <li>legal, regulatory or audit certification.</li>
</ul>
<p>When you cite a result to a customer or partner, cite the exact report (its id and digest), the Settlens version, the configuration scope and, for active runs, the authorization record.</p>

<h2 id="pilot-rules">How pilots are run</h2>
<ul>
  <li>Testnet assets and synthetic data.</li>
  <li>One resource endpoint and one facilitator to start with.</li>
  <li>At most two passive samples plus one authorized invalid-signature probe per run.</li>
  <li>No wallet keys, real signatures, settlement, replay or fund movement.</li>
  <li>Testing stops immediately if the owner withdraws authorization or unexpected impact appears.</li>
</ul>
<p>A pilot succeeds when Settlens produces a reproducible report, surfaces at least one actionable conformance or security fact, causes no impact, leaks no secret, and the owner finds the evidence understandable. Finding a vulnerability is not required.</p>

<h2 id="faq">Questions</h2>
${faq([
  { q: "Does a passing report mean my x402 endpoint is secure?", a: "No. It means the endpoint behaved as expected for the properties Settlens tested, during the scan. It does not cover untested code paths, on-chain behavior or legal compliance, and it is not a certification." },
  { q: "Why does one invalid request need written authorization?", a: "Because it is still active traffic against someone else's system, and payment endpoints are sensitive. Settlens refuses to send the probe without both the confirmation flag and a traceable approval reference, which it records in the report." },
  { q: "Which x402 version does Settlens assess?", a: "x402 V2, over the V2 HTTP transport, validated with the official @x402/core SDK pinned at the version shown in each report under integrations.officialX402Core." },
])}`;
}
