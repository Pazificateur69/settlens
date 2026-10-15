<!-- Legacy source: site/docs/evidence.html (removed). Old canonical: https://settlens.com/docs/evidence.html -->
<!-- Old <title>: Evidence — Verifiable Reports & Attestations | Settlens Docs -->
<!-- Old meta description: Settlens produces JSON, HTML and SARIF reports with a deterministic SHA-256 integrity digest, ed25519-signed attestations anyone can verify offline, and reproducible evidence commands. Includes what cannot be self-issued. -->

DOCUMENTATION

# Evidence you — and your customers — can verify

A result is only useful if someone else can trust it. Settlens produces reports in the formats your team already uses, with a deterministic digest and an optional signed attestation, so evidence travels from your engineers to your customers and auditors without losing meaning.

## Report formats

| Format | Use |
|---|---|
| `JSON` | Machine-readable report with checks, severity, timestamps and metadata — and an embedded integrity block. |
| `HTML` | Human-readable report for engineering reviews and pilot debriefs. |
| `SARIF` | CI-native findings for code scanning and security workflows. |

## Integrity: detect any change

Each JSON report is canonicalized with `settlens-stable-json-v1` and hashed with SHA-256. Anyone can recompute and confirm the digest:

```
settlens verify-report reports/settlens-REPORT_ID.json
```

This proves the report has not changed since it was produced. It establishes internal consistency — not *who* produced it or *when*. For that, add an attestation.

## Signed attestations: add identity and time

An evidence attestation binds a report's digest to an ed25519 signing identity and a timestamp. A customer, partner or auditor can verify it offline, with nothing but the attestation and (optionally) the report. Signing uses `node:crypto` only — no key custody, HSM or network:

```
settlens evidence keygen --out settlens-evidence.key
settlens evidence attest reports/settlens-REPORT_ID.json \
  --key settlens-evidence.key --out attestation.json
settlens evidence verify attestation.json \
  --report reports/settlens-REPORT_ID.json
```

`verify` checks the signature and that the report is intact and matches the attestation. Keep the private key secret; share the attestation freely.

## Reproduce the evidence yourself

From a clean checkout with Node.js 24, the full quality and evidence gate is a handful of commands:

```
npm ci --ignore-scripts
npm run quality
npm audit --audit-level=high
npm run demo:server   # in another terminal

node src/cli.js check --config settlens.config.example.json \
  --out reports/secure --format json,html,sarif
node src/cli.js verify-report reports/secure/settlens-REPORT_ID.json
```

To prove the security gate actually catches a bypass, scan the deliberately vulnerable fixture — the expected exit code is `1` and `security.invalid_signature_fail_closed` is `critical/fail`:

```
node src/cli.js scan http://127.0.0.1:4402/bypass \
  --active --authorized --authorization-ref CONTROLLED-DEMO-001 --repeat 1
```

## Evidence that cannot be self-issued

Some things a tool must never pretend to have produced. We keep these as explicit pilot gates rather than represent them as passed:

- customer authorization;
- a real customer or testnet integration result;
- independent code review;
- legal approval or certification.

Honesty about the boundary is part of the product. See the [methodology](methodology.html) for exactly what a passing report does and does not establish.

### Get a report you can share

Signed, reproducible evidence from an authorized testnet assessment. [Request a private assessment](../#pilot)
