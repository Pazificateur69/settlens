# Settlens threat model

Version: 0.2.0
Scope: CLI, configuration loader, x402 resource scan, facilitator capability
scan, report generation, GitHub composite action and container.

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

## Residual risks

- SHA-256 integrity detects changes but is not an identity signature. A release
  signing key or keyless Sigstore attestation is still required for provenance.
- A compromised CI runner can read secrets already granted to that job.
- DNS and TLS trust are delegated to the runtime platform.
- Passive samples cannot prove every server-side code path.
- The active probe tests one invalid payload class, not full cryptographic or
  chain-specific verification.
- No live `/verify`, `/settle`, wallet or fund-movement testing is in scope.
- Rate limiting and multi-tenant isolation remain properties of the assessed
  service, not guarantees Settlens can establish from two samples.

## Review triggers

Re-review this model when adding wallet support, facilitator `/verify`, remote
plugins, browser UI, persistent storage, multi-tenant SaaS execution or signed
release publishing.
