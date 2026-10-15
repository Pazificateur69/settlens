<!-- Legacy source: site/docs/api.html (removed). Old canonical: https://settlens.com/docs/api.html -->
<!-- Old <title>: CLI & API Reference | Settlens Docs -->
<!-- Old meta description: Settlens command reference: scan, facilitator, check, verify-report, verify-payment, monitor and evidence commands, common options, exit codes, and the authenticated web scan API. -->

DOCUMENTATION

# CLI & API reference

One tool spans all four assurance stages — Assess, CI, Monitor and Evidence. It needs Node.js 20+, no wallet and no private key. Every command exits `0` on success, `1` when a gate fails, and `2` on a usage or configuration error.

## Assess & CI

### scan

Assess a single resource endpoint.

```
settlens scan https://merchant.example/api/data \
  --expect-network eip155:8453 \
  --expect-pay-to 0xYourReviewedRecipient \
  --max-amount 10000 \
  --facilitator https://facilitator.example
```

### facilitator

Assess a facilitator's advertised `GET /supported` capabilities on their own.

```
settlens facilitator https://facilitator.example
```

### check

Run every target defined in a configuration file — the shape used in CI.

```
settlens check --config settlens.config.json
```

## Verify a real payment

### verify-payment

Cryptographically verify a captured x402 payment authorization, offline. EVM recovers the EIP-3009 / EIP-712 signer and checks binding, amount and freshness; Solana verifies the transaction's fee-payer ed25519 signature.

```
settlens verify-payment captured-payment.json
```

## Monitor

### monitor

Compare each run to a stored baseline and alert on regressions. Run on cron or CI; add a webhook to push alerts.

```
settlens monitor --config settlens.config.json \
  --state settlens.state.json --webhook https://your-crm/hook
```

## Evidence

### evidence keygen · attest · verify

```
settlens evidence keygen --out settlens-evidence.key
settlens evidence attest report.json --key settlens-evidence.key --out attestation.json
settlens evidence verify attestation.json --report report.json
```

### verify-report

Recompute a report's SHA-256 integrity digest.

```
settlens verify-report reports/settlens-REPORT_ID.json
```

## Common options

| Option | Purpose |
|---|---|
| `--facilitator <url>` | Cross-check requirements against a facilitator's `/supported`. |
| `--expect-scheme / --expect-network / --expect-pay-to` | Allowed values; repeatable or comma-separated. |
| `--max-amount <atomic>` | Maximum advertised atomic token amount. |
| `--active --authorized --authorization-ref <id>` | Run the one invalid-signature fail-closed probe, under explicit authorization. |
| `--header "Name: value" · --allow-host <host>` | Add a request header; its destination must be independently allowlisted. |
| `--format json,html,sarif · --out <dir>` | Report formats and output directory. |
| `--fail-on low|medium|high|critical|none` | Severity that makes the process exit non-zero (default `high`). |
| `--timeout <ms> · --repeat <count>` | Per-request timeout and passive drift samples. |

Passive mode never sends a `PAYMENT-SIGNATURE`; a user-supplied one is rejected outright. Active mode requires both `--active` and `--authorized`, uses no private key, and never calls `/settle`.

## CI: GitHub Action

Settlens ships as a composite GitHub Action, so it drops into a workflow and emits SARIF into code scanning. The repository CI itself runs the suite on Node.js 20, 22 and 24, enforces coverage thresholds, audits dependencies, produces a CycloneDX SBOM and builds a pinned non-root container.

## Authenticated web scan API

The public website never exposes scan credentials. Server-to-server clients authenticate with a bearer token and receive the same report structure as the CLI:

```
POST /api/scan
Authorization: Bearer SETTLENS_API_TOKEN
Content-Type: application/json

{ "url": "https://facilitator.example.com" }
```

Only public HTTP(S) destinations are accepted. Local/private IP ranges, credentials in URLs, redirects and active payment probes are rejected by design.

### Wire it into your pipeline

We'll help you scope the first authorized assessment and hand back a report you can automate against. [Request a private assessment](../#pilot)
