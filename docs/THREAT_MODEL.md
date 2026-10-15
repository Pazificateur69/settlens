# Settlens threat model

Version: 0.5.0
Scope: CLI, configuration loader, x402 resource scan, facilitator capability
scan, report generation, offline signature verification, signed evidence,
GitHub composite action, container, the MCP server (stdio and the remote
endpoint at `https://settlens.com/mcp`) and the settlens.com server (`/api/scan`,
pilot intake). The website's security page (`/docs/security`) describes the same
model for readers.

## Security objectives

Settlens must:

1. assess an explicitly selected HTTP(S) target without moving funds;
2. never accept or transmit a caller-provided `PAYMENT-SIGNATURE`;
3. prevent a modified assessment config from exfiltrating CI secrets;
4. avoid persisting credentials or response bodies in evidence;
5. distinguish passive observation from authorized active probing;
6. make post-generation report modification detectable;
7. fail CI deterministically when findings meet the selected severity.

## Assets and trust boundaries

| Asset | Boundary | Main risk |
| --- | --- | --- |
| CI bearer tokens and custom headers | config/process → remote host | exfiltration |
| x402 payment requirements | remote host → parser | malformed or hostile input |
| authorization reference | operator → report | missing accountability |
| evidence reports | scanner → artifact store | tampering or accidental secrets |
| dependency graph | registry → build | supply-chain compromise |
| customer endpoint | scanner → network | unauthorized or excessive traffic |
| API bearer token (`SETTLENS_API_TOKEN`) | operator → settlens.com server | network tools used by anyone |
| ed25519 evidence signing key | operator → attestations | forged attestations |
| pilot leads | visitor → server store | disclosure, flooding |

The resource server, facilitator, DNS, TLS termination, CI runner and artifact
store are independent trust domains. Settlens does not assume that a resource
server and its named facilitator are operated by the same party.

## Threats and controls

| Threat | Control | Verification |
| --- | --- | --- |
| Real payment accidentally sent | caller-provided `PAYMENT-SIGNATURE` rejected; invalid synthetic payload only; `/settle` never called | unit and E2E tests; report counters |
| Secret forwarded after malicious config change | any custom header requires an independently supplied exact hostname allowlist | config tests; action input is separate from config |
| Credentials leaked in evidence | only header names, response size and digest stored; URL credentials forbidden; common secret query values redacted | reporter/config tests |
| Redirect to an attacker-controlled host | Fetch uses `redirect: "manual"` | transport implementation and checks |
| Parser abuse or oversized header | header size limit, Base64/JSON validation, official SDK parser, request timeout | protocol and scanner tests |
| Payment bypass from signature-presence checks | authorized invalid-signature probe must remain denied; HTTP 2xx is critical | controlled bypass E2E |
| Requirement substitution or drift | exact `resource.url` binding and repeated-sample normalization | scanner tests |
| Unsupported facilitator route | `/supported` kind, signer and resource coverage checks | facilitator integration tests |
| Evidence modified after generation | stable canonical JSON plus SHA-256 digest; verification command | integrity tests and CI |
| Dependency or action drift | exact npm versions, lockfile integrity, ignored install scripts, pinned action SHAs and pinned container digest | CI, audit, SBOM, container policy test |
| Container privilege abuse | runtime user is `node`; application and runtime workspace are separated | Dockerfile policy test and CI build |
| SSRF through the remote network tools (`/mcp`, `/api/scan`) | bearer token required; destinations must be public HTTP(S) on ports 80/443, checked on the literal address and every DNS answer; no redirects | net-guard, MCP and site server tests |
| Abuse of the public endpoints | bodies capped (256 KiB on `/mcp`, 32 KiB on `/api`); per-IP rate limits (each JSON-RPC batch entry counts; failed `/api/scan` authentications count); Solana transactions capped at 1232 bytes; a placeholder or short API token disables the network tools | MCP transport and site server tests |
| Pilot intake flooding or cross-site submission | own rate limit (5 per 15 minutes per IP), cross-site posts refused, field size limits, honeypot field, store size cap, 12-month retention | site server tests |
| Evidence signing key theft | the key stays with the operator (file mode 0600, `keygen` never overwrites); verifiers pin the expected key with `--expect-key` / `expected_public_key` | evidence tests |

## Residual risks

- SHA-256 integrity detects changes but is not an identity signature. A release
  signing key or keyless Sigstore attestation is still required for provenance.
- A compromised CI runner can read secrets already granted to that job.
- DNS and TLS trust are delegated to the runtime platform.
- Passive samples cannot prove every server-side code path.
- The active probe tests one invalid payload class, not full cryptographic or
  chain-specific verification.
- No live `/settle`, wallet or fund-movement testing is in scope; `/verify`
  receives only the one invalid payload of the authorized probe.
- A stolen evidence signing key can sign forged attestations until verifiers
  stop trusting it: `--expect-key` only helps when the expected key is
  distributed out of band.
- DNS is resolved again by the HTTP client after the destination check
  (rebinding window), accepted because the remote network tools are
  token-gated and passive.
- Rate limiting and multi-tenant isolation remain properties of the assessed
  service, not guarantees Settlens can establish from two samples.

## Review triggers

Re-review this model when adding wallet support, `/settle` or any fund
movement, remote plugins, new remote tools or endpoints, accounts or
multi-tenant execution, new persistent storage, or signed release publishing.
