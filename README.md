# Settlens

Security and conformance evidence for agentic payment endpoints.

Settlens inspects the x402 V2 HTTP handshake, validates advertised payment
requirements, detects unexpected changes in price or recipient, enforces a local
policy, and can safely check that an intentionally invalid authorization does not
unlock the resource.

Settlens uses the official `@x402/core` parser as a pinned runtime dependency.
It never holds funds, wallets or payment keys and never calls `/settle`. The
only key it uses is the optional ed25519 key that signs evidence attestations.

Product overview and full documentation: [settlens.com](https://settlens.com)
([docs](https://settlens.com/docs), [changelog](https://settlens.com/changelog)).

## Source availability

This repository publishes a reviewed snapshot of the Settlens implementation.
The original development history, commercial prospecting records and production
operations history remain in a separate private repository. Deployment hostnames
and IP examples in this snapshot are illustrative; configure your own host.

Source visibility does not establish an open-source license. No npm package or
general open-source license is published here. The hosted service and accompanied
technical pilots remain available at [settlens.com](https://settlens.com).

## What it checks

- the unauthenticated resource returns HTTP `402`;
- `PAYMENT-REQUIRED` exists and contains Base64-encoded JSON;
- the decoded object uses x402 V2 and the required core fields;
- the same object is accepted by the pinned official x402 V2 SDK;
- `resource.url` binds payment to the URL under test;
- scheme, CAIP-2 network, atomic amount, asset, recipient and timeout are valid;
- schemes, networks, recipients, assets and maximum price match an optional
  local policy;
- identical requests do not unexpectedly change their payment terms;
- remote endpoints use HTTPS;
- a facilitator's `GET /supported` schema, signer metadata and coverage agree
  with the advertised requirements;
- with explicit authorization, an invalid payment signature fails closed, both
  at the resource and at the facilitator's `/verify` endpoint;
- a captured payment authorization can be cryptographically verified offline.

The implementation follows the official
[x402 V2 core specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)
and [HTTP transport specification](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md).

## Requirements

- Node.js 20.19 or newer.

## Try the local demonstration

Install the exact lockfile and run the quality gate:

```bash
npm ci --ignore-scripts
npm run quality
```

Start the deliberately mixed-quality local target:

```bash
npm run demo:server
```

In another terminal, scan the compliant endpoint:

```bash
npm run settlens -- scan http://127.0.0.1:4402/secure
```

Run the safe active probe:

```bash
npm run settlens -- scan http://127.0.0.1:4402/secure \
  --active \
  --authorized \
  --authorization-ref DEMO-APPROVAL-001
```

Detect the demonstration payment bypass:

```bash
npm run settlens -- scan http://127.0.0.1:4402/bypass \
  --active \
  --authorized \
  --authorization-ref DEMO-APPROVAL-002
```

The CLI writes self-contained JSON, HTML and SARIF evidence to `reports/`. JSON
reports contain a deterministic SHA-256 integrity block. It exits with code `1`
when a failing check meets the configured severity threshold, and code `2` for
CLI or configuration errors.

Verify that a JSON report has not changed:

```bash
npm run settlens -- verify-report reports/settlens-REPORT_ID.json
```

## Scan a real authorized endpoint

Passive mode is the default:

```bash
npm run settlens -- scan https://merchant.example/api/data \
  --expect-scheme exact \
  --expect-network eip155:8453 \
  --expect-pay-to 0xYourReviewedRecipient \
  --max-amount 10000
```

Settlens does not follow redirects and does not include response bodies in its
reports. URL credentials and common secret query parameters are redacted.
Request header values are also omitted from evidence. A user-supplied
`PAYMENT-SIGNATURE` is rejected outright so passive scans cannot accidentally
send a real payment authorization.

Only use `--active --authorized` after the endpoint owner has explicitly approved
the assessment, and provide its ticket or scope identifier with
`--authorization-ref`. The active probe submits one intentionally invalid
`PAYMENT-SIGNATURE`; it never calls a facilitator's `/settle` endpoint and cannot
move funds.

When custom headers are used, their destination must be independently allowlisted:

```bash
npm run settlens -- scan https://merchant.example/paid \
  --header "Authorization: Bearer ${ASSESSMENT_TOKEN}" \
  --allow-host merchant.example
```

This prevents a modified configuration from forwarding CI secrets to an
attacker-controlled host. CI may also set `SETTLENS_ALLOWED_HOSTS` as a
comma-separated list outside the assessment configuration.

## Independent signature verification

Settlens can cryptographically verify a captured x402 payment authorization
offline — no wallet, private key or RPC required:

```bash
npm run settlens -- verify-payment payment.json
```

The file contains `{ "requirement": { … }, "payload": { … } }`. For the EVM
`exact` scheme, Settlens recovers the EIP-3009 / EIP-712 signer and checks that
it matches the authorized `from`, that the transfer is bound to the advertised
recipient and amount, and that the check time is strictly inside the
authorization window (`validAfter < now < validBefore`, as EIP-3009 requires).
The check time is the current clock, or `--now <unix-seconds|ISO-8601>` to check
a capture at the moment it was used. The EIP-712 domain is rebuilt from the
payment requirement itself, so no on-chain call is needed.

For Solana it checks every signer slot of the transaction against its account
key with ed25519. An empty slot is reported as pending: an x402 client payload
is partially signed, and the facilitator adds the fee payer's signature at
settlement. The transaction verifies when at least one signature is present,
every present signature is valid and the slot count matches the message header.
If no payment terms (`asset`, `amount`, `payTo`, `maxTimeoutSeconds`, `extra`) are supplied, this is explicitly a
signatures-only result: payment terms are not checked. Providing `asset`, `amount`,
`payTo` and `extra.feePayer`
also requires the supported offline SPL TransferChecked profile to bind the
mint, atomic amount and recipient. Partial payment terms are a usage error.
This static profile does not establish runtime execution or settlement; unsupported
instructions, lookup tables and token extensions remain unverified.

The command exits `0` when the requested verification succeeds, `1` when signatures
or the requested payment profile fail, and `2` for invalid input or usage.

## Continuous monitoring

Once an endpoint is live, `settlens monitor` turns point-in-time scans into
continuous assurance. Each run compares the current passive scan with the
previous run and raises an alert for each change for the worse: a check that
drops from pass to warn or fail, a new failing or warning check, or a check that
disappeared (`removed`: coverage lost). Drift is caught on the first scheduled
run after an endpoint starts behaving differently:

```bash
settlens monitor --config settlens.config.json --state settlens.state.json
```

Run it on a schedule (cron or CI). An alert blocks when its check's severity is
at or above `--fail-on` (default `high`); below that it is printed as a note.
The command exits `1` on a blocking alert and can POST the alerts with
`--webhook <url>`. The state file is keyed by method and URL. Monitoring is
fully passive and never sends a payment.

## Shareable evidence attestations

Every report carries a deterministic SHA-256 digest. An evidence attestation
binds that digest to an ed25519 signing identity and a timestamp, so a customer,
partner or auditor can verify the result offline:

```bash
settlens evidence keygen --out settlens-evidence.key
settlens evidence attest reports/settlens-REPORT_ID.json \
  --key settlens-evidence.key --out attestation.json
settlens evidence verify attestation.json --report reports/settlens-REPORT_ID.json
```

`verify` checks the ed25519 signature and that the report is intact and matches
the attestation. Add `--expect-key <file>` (an ed25519 PEM public key, or the
0x hex key printed by `keygen`) to also reject an attestation signed by any
other key: the public key inside an attestation only proves that *some* key
signed it. `keygen --out` refuses to overwrite an existing file and creates the
key readable by its owner only (mode 0600). Signing uses `node:crypto` only; no
HSM or network is required.

## AI agents (MCP)

`settlens mcp` runs a Model Context Protocol server over stdio so Claude
Desktop, Claude Code or any MCP client can check an x402 payment request before
paying:

```bash
claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp
```

On every HTTP 402 the agent calls `evaluate_payment_requirements` with the
`PAYMENT-REQUIRED` header, the requested URL and its spending policy, and gets
`pay`, `review` or `do_not_pay` with the reasons. Offline tools also verify
payment signatures, Solana transactions, reports and attestations; the network
tools (`scan_endpoint`, `scan_facilitator`) are passive only. No tool pays,
signs or needs a key.

The decision is `pay` only when every protocol check passes, at least one
advertised payment option satisfies the policy, and the policy sets all four of
`pay_to`, `assets`, `networks` and `max_amount`. A policy that leaves any of them
open gets `review`. The agent then pays only with an option listed in
`acceptable`.

The same tools are served over MCP Streamable HTTP at
`https://settlens.com/mcp`: the offline tools are public, the network tools need
an API token. See [`docs/MCP.md`](./docs/MCP.md) for the remote endpoint,
resources, the `x402_preflight` prompt, every tool's inputs and outputs, and the
security model.

## Configuration and CI

Copy the example:

```bash
cp settlens.config.example.json settlens.config.json
npm run settlens -- check --config settlens.config.json
```

Configuration values can reference environment variables:

```json
{
  "headers": {
    "Authorization": "Bearer ${ASSESSMENT_TOKEN}"
  }
}
```

The value is expanded at runtime and never written into the report. See
[`action.yml`](./action.yml) and
[`examples/github-workflow.yml`](./examples/github-workflow.yml) for the local
composite GitHub Action. SARIF results are anchored at line 1 of the
configuration file, so GitHub code scanning can display them (code scanning on
private repositories requires GitHub Code Security).

The repository CI tests Node.js 20, 22 and 24, enforces coverage thresholds,
audits dependencies, produces a CycloneDX SBOM, uploads SARIF, proves bypass
detection and builds the pinned non-root container:

```bash
docker build -t settlens:local .
docker run --rm settlens:local --version
```

For an isolated Plesk host deployment, `compose.plesk.yml` provides a default
network-disabled service and a separate network-enabled `scan` profile. Neither
service publishes an inbound port.

## Assurance documents

- [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) defines what each result proves;
- [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md) documents trust boundaries,
  controls and residual risks;
- [`docs/PILOT_ACCEPTANCE.md`](./docs/PILOT_ACCEPTANCE.md) is the objective
  go/no-go checklist for a customer pilot;
- [`docs/READINESS.md`](./docs/READINESS.md) is the historical 0.2.0 readiness
  snapshot (verified and open gates at that release, without self-certification);
- [`docs/EVIDENCE.md`](./docs/EVIDENCE.md) provides reproducible proof commands;
- [`SECURITY.md`](./SECURITY.md) defines the vulnerability reporting policy.

## Current boundary

Settlens now independently and cryptographically verifies payment
authorizations (see *Independent signature verification* above), and its
authorized active probe calls a facilitator's `/verify` endpoint to confirm that
an invalid signature fails closed. It still does not:

- call facilitator `/settle`;
- submit, replay or broadcast real transactions;
- hold wallets or payment keys, sign payments or take custody of funds;
- prove complete application security or regulatory compliance.

Those exclusions are intentional: Settlens produces useful, reproducible
evidence without ever holding wallets or payment keys, moving funds or taking
custody.

Settlens reports observed protocol behavior. It is not a proof of complete
application security, a certification, or legal advice.

## Persistent monitoring and private workspace

Monitoring now compares payment-term fingerprints between runs even when check
statuses remain unchanged. Use `monitor --history .settlens/monitor.json` for a
bounded, atomic journal and `history --history .settlens/monitor.json --format html`
for an export. The optional private `/dashboard` supports target configuration,
scheduling and history; it uses a dedicated credential, not the scan API token.
SMTP notifications can send pilot requests (`[Settlens][PILOTE]`) and blocking
changes (`[Settlens][ALERTE]`) to contact@settlens.com. See [monitoring setup](docs/MONITORING.md).

For agent integration, `src/client.js` provides a dependency-free HTTP MCP client.
`examples/preflight-client.mjs` demonstrates a request followed by a policy check.
An offline CLI check is also available:

```sh
node src/cli.js preflight payment-required.txt --policy examples/agent-policy.json --resource-url https://merchant.example/paid
```

The example policy is illustrative Base Sepolia data; review and replace its recipient,
asset, network and amount. Exit 0 means `pay`; both `review` and `do_not_pay` exit 1.
These tools never pay or sign, and do not verify on-chain state.

### Approved references and incident lifecycle

Journal mode now separates observations from explicitly approved payment terms,
tracks open/acknowledged/resolved incidents, and queues owner email/webhook alerts
atomically with observations. Persistent incidents gate CLI/CI until recovery;
acknowledgement pauses reminders. The private dashboard supports endpoint policy
editing, reviewed approval, comments, severity filters and delivery retries.
See [monitoring behavior and limits](docs/MONITORING.md),
[operational checks and encrypted recovery](docs/RECOVERY.md) and the
[first pilot acceptance protocol](docs/PILOT-PROTOCOL.md).

Run `npm run conformance` for the deterministic synthetic corpus and pinned SDK
compatibility checks. Its measured outcomes apply only to that corpus; see
[benchmark methodology](docs/CONFORMANCE.md). Solana requirements can additionally
be checked against the supported static SPL TransferChecked profile offline; this
cannot establish on-chain balances, CPI outcomes, Token-2022 net transfers or settlement.
