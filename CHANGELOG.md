# Changelog

All notable changes to Settlens. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions refer to the tool
(`src/constants.js`).

## [Unreleased] — 2026-10-14

- Explicit approved monitoring references, bounded price ranges and durable incident lifecycle with acknowledgement, comments, reminders and observed recovery.
- Atomic monitor outbox and separate pilot outbox, bounded retries/backoff, crash recovery, retention and private delivery status/retry controls.
- Private dashboard policy editing, approved/observed term comparison, incident filters and owner action history; equivalent reference/incident/delivery CLI commands.
- Optional offline Solana SPL TransferChecked requirement binding, with unsupported runtime effects explicitly unverified.
- Reproducible synthetic x402 conformance corpus and pinned SDK2.28.0 checks; no inference of real-world detection rates.

### Added
- Guided private setup with explicit policy/observation/approval steps, exact atomic-unit conversion and CLI configuration download.
- CLI journal handoff preserving approved references without replaying dashboard notifications.
- End-to-end synthetic HTTP monitoring test with durable mail retry, restart, recovery, export and logout.
- Durable scheduler heartbeat, private operational health probe and owner-only `[Settlens][OPS]` alerts.
- Data-only encrypted backups, bounded non-destructive restoration, off-host copy and restore verification; credentials excluded.
- Public checker scenarios for changed prices, recipients, resources and incomplete policies, evaluated with the real x402 V2 tool.
- Downloadable unsigned decision JSON and a direct path from a verdict to a scoped endpoint pilot.
- Concrete first-pilot deliverables and a guided request message, without changing the pilot intake API.
- Cross-run payment-term fingerprints, including option rebinding and recovery after outages.
- Atomic, locked monitor journals (200 observations / 90 days), integrity checks and JSON/HTML exports.
- Optional single-owner private monitoring workspace with dedicated authentication, one-time owner email codes, session cookies,
  endpoint management, manual/scheduled scans and public-only network destinations.
- Signed monitoring webhooks, HTTP delivery error handling and remediation hints.
- SMTP or dedicated TLS-relay notifications to contact@settlens.com with separate `[Settlens][PILOTE]` and
  `[Settlens][ALERTE]` subjects; email is disabled until protected SMTP configuration is enabled.
- Offline CLI preflight, asset allowlist flag, HTTP MCP client and scheduled CI example.

### Changed
- Clear private dashboard data immediately on logout and ignore late responses from earlier sessions or edits.
- Preserve pilot messages changed while submission is in progress.
- Require fresh monitoring observations after policy edits and enforce price ranges before the first approval.
- Resolve redirect incidents after an observable HTTP recovery, without treating timeouts or opaque responses as recovery.
- Reject malformed remote preflight decisions and sanitize response-stream failures.
- Distinguish Solana signatures-only verification from payment-profile verification; refuse partial payment terms.
- Keep signature results readable when timestamps exceed the supported calendar range.
- Invalidate browser-tool verdicts when inputs change or a sample is loaded; cancel and ignore superseded requests so a stale `pay` result cannot reappear.
- Pin @x402/core 2.28.0; pin Nodemailer for optional SMTP delivery.
- Refuse invalid monitor baselines instead of silently starting over.
- Check syntax for every JavaScript module, including website code.
- Update privacy/cookie notices for private sessions, monitoring and email notifications.

## [0.5.0] — 2026-10-13

Settlens now answers AI agents before they pay: an MCP server exposes its checks
as tools, locally and at `https://settlens.com/mcp`, and a new product website
documents every stage.

### Added
- **MCP server** (`src/mcp.js`, `settlens mcp`): eight tools
  (`evaluate_payment_requirements`, `verify_payment_signature`,
  `verify_solana_transaction`, `verify_report`, `verify_attestation`,
  `list_checks`, and the passive network tools `scan_endpoint` and
  `scan_facilitator`), resources (`settlens://checks`,
  `settlens://checks/{id}`, `settlens://policy-guide`) and the `x402_preflight`
  prompt. Transports: stdio (`src/mcp-stdio.js`) and remote Streamable HTTP at
  `/mcp` (`src/mcp-http.js`), where the offline tools are public and the network
  tools require the API bearer token. No tool pays, signs or calls `/settle`.
- **Agent preflight** (`src/preflight.js`): `evaluate_payment_requirements`
  answers `pay`, `review` or `do_not_pay` with reasons. The server's terms are
  judged as a whole and the spending policy per payment option. `pay` requires a
  policy that sets `pay_to`, `assets`, `networks` and `max_amount` and at least
  one option that satisfies it; the agent pays only with an option listed in
  `acceptable`.
- Destination guard (`src/net-guard.js`) for remotely exposed network tools:
  only public HTTP(S) destinations, checked on the literal address and on every
  DNS answer, including IPv4 embedded in IPv6.
- `verify-payment --now <unix-seconds|ISO-8601>` checks an EVM authorization's
  window at a chosen time and prints the time used.
- `evidence verify --expect-key <file>` (an ed25519 PEM or the 0x hex key
  printed by `keygen`) rejects an attestation signed by any other key. The MCP
  `verify_attestation` tool takes `expected_public_key` and returns
  `publicKeyMatches`.

### Changed
- Reports and attestations are canonicalized with `settlens-stable-json-v2`
  (UTF-16 code-unit key order, independent of the machine's locale).
  Attestations now include the signed `canonicalization` field. Reports and
  attestations made with `settlens-stable-json-v1` still verify: v1 is pinned to
  the `en` collation, and attestations without the field are read as v1.

### Fixed
- EIP-3009 window: `verify-payment` and `verify_payment_signature` accepted an
  authorization at exactly `validAfter` or `validBefore`. The window is now
  strict, `validAfter < now < validBefore`, as in the EIP-3009 reference
  implementation.
- Solana: only the fee payer's signature was checked, and a partially signed
  x402 payload (the facilitator adds the fee-payer signature at settlement) was
  rejected. Every signer slot is now checked against its account key, empty
  slots are reported as pending (`pendingSigners`, `feePayerPending`), and the
  CLI prints one `Signer N` line per slot.
- SARIF results had no location, so GitHub code scanning did not display them.
  Each result is now anchored at line 1 of the `--config` file (or
  `settlens.config.json` for ad hoc scans) and carries a per-target fingerprint.
- Monitor: a check that disappeared between runs was recorded but never
  reported. It is now an alert of kind `removed` (coverage lost) that blocks at
  or above `--fail-on`. State is keyed by method and URL, so GET and POST on one
  URL keep separate baselines (URL-only state files are migrated). An invalid
  `--fail-on` exits 2 instead of being treated as `high`. The webhook payload
  adds `failOn`, `runs[].method` and `alerts[].kind`.
- `--allow-host` was listed in the help but rejected as an unknown option.
- `evidence keygen --out` overwrote an existing key file. It now refuses with
  exit code 2 and creates new key files with mode 0600.
- GitHub Action: the `report-directory` output was not set when the gate failed.
  The step now writes it, then exits with the CLI's status.
  `examples/github-workflow.yml` pins `actions/upload-artifact` to the full
  40-character commit SHA (the previous pin was one character short).

### Website
- **New settlens.com**, generated by `site/build.js` (Node.js standard library
  only) from about 50 page modules on one design system: product stages, MCP,
  use cases, documentation, learning guides, blog, this changelog and the legal
  pages. The build fails on broken links or anchors, inline styles or scripts,
  invalid structured data and other contract violations.
- `/api/scan` hardening: the resource and facilitator URLs pass the same
  destination guard as the MCP network tools, `facilitator` is accepted only as
  a URL string of at most 2048 characters, and the API token is compared through
  SHA-256 digests so the comparison no longer reveals its length.
- Pilot requests older than 12 months are deleted automatically, at startup and
  then daily (the store is rewritten atomically with mode 0600). The pilot form
  has its own rate limit, refuses cross-site submissions and oversized fields,
  and the store stops taking new requests above 20 MiB.
- `/api/scan` counts failed authentications against its rate limit, requires the
  `Bearer` scheme, and a placeholder or short `SETTLENS_API_TOKEN` disables the
  scan API and the MCP network tools. Remote network tools only reach ports 80
  and 443. Each entry of a JSON-RPC batch counts against the `/mcp` rate limit,
  and Solana transactions larger than 1232 bytes are refused.
- Security headers add `Strict-Transport-Security`, `Cross-Origin-Resource-Policy`
  and Trusted Types in the CSP. ETags are derived from file content, so pages
  that did not change stay cached across deployments.
- `/mcp` serves its documentation page to every GET or HEAD that does not ask
  for an event stream, so crawlers and link checkers no longer get a 405. URLs
  of the previous site redirect to their closest page, or answer 410 Gone.

## [0.4.0] — 2026-07-31

The tool now covers all four assurance stages: **Assess → CI → Monitor → Evidence**.

### Added
- **Monitor** (`src/monitor.js`, `settlens monitor`): continuous assurance. Each
  run compares the passive scan to a stored baseline and flags regressions
  (pass→fail/warn, newly failing checks). Exits non-zero at or above
  `--fail-on` and can POST alerts with `--webhook`. Fully passive. Checks that
  disappeared between runs were recorded but not reported until 0.5.0.
- **Evidence** (`src/evidence.js`, `settlens evidence keygen|attest|verify`):
  ed25519-signed, offline-verifiable attestations that bind a report's SHA-256
  digest to a signing identity and timestamp. Uses `node:crypto` only.
- **Solana verification**: `verify-payment` now verifies a transaction's
  fee-payer ed25519 signature (legacy + versioned), with base58 output,
  alongside the existing EVM path.

### Website
- Search and sharing metadata (Open Graph, Twitter Cards, JSON-LD), a sitemap
  with `lastmod`, and correct MIME types for `sitemap.xml` and `robots.txt`.
- New blog with three articles on x402 and agentic payment security.
- Full documentation for the methodology, the security model and threat model,
  evidence, the CLI and the API.

## [0.3.0] — 2026-07-31

The authorized probe now also checks that the facilitator's `/verify` rejects
the invalid signature, and `verify-payment` recovers EIP-3009 signers offline.

### Added
- **Facilitator `/verify` integration** (`probeFacilitatorVerify`): the authorized
  active probe now sends the invalid payload to the facilitator's `/verify` and
  asserts it fails closed (critical finding if it reports a zero signature valid).
- **Cryptographic signature verification** (`src/signature.js`, `settlens
  verify-payment`): EIP-3009 / EIP-712 EVM signer recovery with offline domain
  reconstruction (no RPC), plus binding, amount and freshness checks. Uses the
  `@noble/curves` and `@noble/hashes` libraries.

### Infrastructure
- Published to a private GitHub repository with green CI (Node.js 20/22/24,
  coverage thresholds, SBOM, container build, reproducible evidence).

## [0.2.0]

### Baseline
- x402 V2 conformance scanner: transport (402, `PAYMENT-REQUIRED`, HTTPS),
  schema (official `@x402/core` + core shape), `resource.url` binding, policy
  (scheme/network/recipient/max-amount), drift detection, and an authorized
  invalid-signature fail-closed probe.
- Deterministic JSON/HTML/SARIF reports with a SHA-256 integrity digest and
  `verify-report`; GitHub composite Action; pinned non-root container.
