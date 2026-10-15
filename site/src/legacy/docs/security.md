<!-- Legacy source: site/docs/security.html (removed). Old canonical: https://settlens.com/docs/security.html -->
<!-- Old <title>: Security & Threat Model | Settlens Docs -->
<!-- Old meta description: Settlens security model: objectives, trust boundaries, the threats it defends against and how, residual risks stated honestly, responsible disclosure, and safe-testing rules. Read-only, no custody, no keys. -->

DOCUMENTATION

# Security & threat model

Settlens is a security tool, so its own security posture has to be legible. It is read-only by design: it does not custody funds, sign transactions, hold private keys, or call a facilitator's `/settle`. This page documents what it protects, how, and the risks that remain.

## Security objectives

Settlens must:

- assess an explicitly selected HTTP(S) target without moving funds;
- never accept or transmit a caller-provided `PAYMENT-SIGNATURE`;
- prevent a modified assessment config from exfiltrating CI secrets;
- avoid persisting credentials or response bodies in evidence;
- distinguish passive observation from authorized active probing;
- make post-generation report modification detectable;
- fail CI deterministically when findings meet the selected severity.

## Trust boundaries

The resource server, facilitator, DNS, TLS termination, CI runner and artifact store are independent trust domains. Settlens does not assume that a resource server and its named facilitator are operated by the same party.

| Asset | Boundary | Main risk |
|---|---|---|
| CI bearer tokens & custom headers | config/process → remote host | exfiltration |
| x402 payment requirements | remote host → parser | malformed or hostile input |
| Authorization reference | operator → report | missing accountability |
| Evidence reports | scanner → artifact store | tampering or accidental secrets |
| Dependency graph | registry → build | supply-chain compromise |
| Customer endpoint | scanner → network | unauthorized or excessive traffic |

## Threats and controls

| Threat | Control |
|---|---|
| Real payment accidentally sent | Caller-provided `PAYMENT-SIGNATURE` rejected; only an invalid synthetic payload is used; `/settle` is never called. |
| Secret forwarded after a malicious config change | Any custom header requires an independently supplied exact-hostname allowlist; the action input is separate from the config. |
| Credentials leaked in evidence | Only header names, response size and digest are stored; URL credentials are forbidden; common secret query values are redacted. |
| Redirect to an attacker-controlled host | Fetch uses `redirect: "manual"` and does not follow. |
| Parser abuse or oversized header | Header size limit, Base64/JSON validation, official SDK parser, request timeout. |
| Payment bypass from signature-presence checks | An authorized invalid-signature probe must remain denied; an HTTP 2xx is treated as critical. |
| Requirement substitution or drift | Exact `resource.url` binding and repeated-sample normalization. |
| Evidence modified after generation | Stable canonical JSON plus SHA-256 digest, with a verification command. |
| Dependency or action drift | Exact npm versions, lockfile integrity, ignored install scripts, pinned action SHAs and a pinned container digest. |
| Container privilege abuse | Runtime user is `node`; application and runtime workspace are separated. |

## Residual risks (stated honestly)

- SHA-256 integrity detects changes but is not an identity signature — a signing key or keyless Sigstore attestation is still the path to full provenance.
- A compromised CI runner can read secrets already granted to that job.
- DNS and TLS trust are delegated to the runtime platform.
- Passive samples cannot prove every server-side code path.
- Rate limiting and multi-tenant isolation are properties of the assessed service, not guarantees Settlens can establish from a few samples.

## Reporting a vulnerability

Please do not open a public issue containing an exploit, credential, customer URL or payment payload. Use the repository host's private security-advisory channel. When you report, include the affected version or commit, the smallest reproducible example, impact and preconditions, whether real funds/keys/customer systems were involved, and safe contact details. **Never** include private keys, bearer tokens, real `PAYMENT-SIGNATURE` values or unredacted customer data.

Operating targets (not contractual SLAs): acknowledgement within two business days, initial severity assessment within five, a critical-mitigation target of seven calendar days, and a disclosure date agreed with the reporter.

## Safe testing

Only assess endpoints you own or have explicit written authorization to test. Use testnet assets and synthetic data. Active mode sends a deliberately invalid authorization, but it still changes network traffic and therefore requires an authorization reference. Settlens must never be used for denial of service, credential testing, settlement, transaction replay or fund movement.

### Assess your endpoint under written scope

We only test what you authorize, on testnet first, and share every result privately. [Request a private assessment](../#pilot)
