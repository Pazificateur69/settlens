<!-- Legacy source: site/docs/methodology.html (removed). Old canonical: https://settlens.com/docs/methodology.html -->
<!-- Old <title>: Methodology — What Each Settlens Result Proves | Settlens Docs -->
<!-- Old meta description: How Settlens assesses x402 payment endpoints: passive and active modes, result and severity semantics, evidence handling, and the honest limits of what a passing report establishes. -->

DOCUMENTATION

# Assessment methodology

This page defines exactly what a Settlens result means — and, just as importantly, what it does not. Every claim we make about an endpoint is traceable to a specific, reproducible check.

## Scope

Settlens evaluates the x402 V2 HTTP challenge exposed by a resource server and the advertised capabilities of an optional facilitator. It combines four layers:

- **Normative conformance** checks derived from the x402 V2 core and HTTP transport specifications;
- **Compatibility parsing** through the pinned official `@x402/core` package;
- **Operator policy** for allowed schemes, networks, recipients and price;
- **Security checks** for transport, drift, fail-closed behavior, facilitator `/verify`, and independent cryptographic signature verification.

## Assessment modes

**Passive mode** sends ordinary unauthenticated requests. It follows no redirect, uses a bounded timeout, retains no response body, and samples the challenge at least twice by default to detect drift. It never attaches a payment authorization, so it is safe to run against any endpoint you own.

**Active mode** adds a single deliberately invalid synthetic `PAYMENT-SIGNATURE`. It only runs when both an authorization confirmation and a traceable authorization reference are supplied. It uses no private key, never creates a valid payment, and never calls a facilitator's `/settle`. When a facilitator is configured, the same invalid payload is also sent to its `/verify` endpoint to confirm verification fails closed upstream of the resource.

## Result semantics

| Status | Meaning |
|---|---|
| `pass` | The observed evidence satisfied this check. |
| `fail` | Observed evidence violated a required property. |
| `warn` | Risk or instability was observed, but the check is not a hard conformance failure. |
| `skip` | The prerequisite evidence was unavailable or the check was out of scope. |

Severities express expected *impact*, not exploit probability:

| Severity | Meaning |
|---|---|
| `critical` | Payment protection can be bypassed. |
| `high` | Required protocol, binding, reachability or facilitator coverage fails. |
| `medium` | Meaningful transport, signer or stability weakness. |
| `low` | Hygiene or ambiguity issue. |
| `info` | Descriptive evidence. |

The default CI failure threshold is `high`.

## Evidence handling

Reports include sanitized target URLs, request header *names*, response status, duration, size, body SHA-256, and check-specific evidence. They intentionally omit request header *values* and response bodies. The JSON report is canonicalized with `settlens-stable-json-v1` and hashed with SHA-256; `verify-report` recomputes the digest. This digest establishes internal consistency; a signed [evidence attestation](evidence.html) adds identity and a timestamp on top.

## Interpretation limits

A passing report means the sampled endpoint behaved consistently with the tested properties during the recorded window. It does **not** establish:

- absence of vulnerabilities in untested application code;
- on-chain settlement or continuous uptime;
- rate limiting or economic safety;
- legal, regulatory or audit certification.

Customer-facing claims should link to the exact report, tool version, configuration scope and authorization record. We would rather say "we tested X under conditions Y" than "X is secure."

### See it against your endpoint

A first authorized testnet assessment, results shared privately. [Request a private assessment](../#pilot)
