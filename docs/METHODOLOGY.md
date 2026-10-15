# Assessment methodology

## Scope

Settlens 0.5.0 evaluates the x402 V2 HTTP challenge exposed by a resource server
and the advertised capabilities of an optional facilitator. It combines:

- normative conformance checks derived from the x402 V2 core and HTTP transport
  specifications;
- compatibility parsing through the pinned official `@x402/core` package;
- explicit operator policy for allowed schemes, networks, recipients, assets and a
  maximum amount;
- conservative security checks for transport, drift and fail-closed behavior.

## Modes

Passive mode sends ordinary unauthenticated requests. It follows no redirect,
uses a bounded timeout, retains no response body and samples the challenge twice
by default (`--repeat` / `repeat`), the second request only after a decodable
`PAYMENT-REQUIRED`.

Active mode adds one deliberately invalid synthetic `PAYMENT-SIGNATURE`. It only
runs when both an authorization confirmation and a traceable authorization
reference are supplied. It uses no private key, never creates a valid payment and
never calls facilitator `/settle`.

## Result semantics

| Status | Meaning |
| --- | --- |
| `pass` | the observed evidence satisfied this check |
| `fail` | observed evidence violated a required property |
| `warn` | risk or instability was observed, but the check is not a hard conformance failure |
| `skip` | the prerequisite evidence was unavailable or the check was out of scope |

Severities express expected impact, not exploit probability:

- `critical`: payment protection can be bypassed;
- `high`: required protocol, binding, reachability or facilitator coverage fails;
- `medium`: meaningful transport, signer or stability weakness;
- `low`: hygiene or ambiguity issue;
- `info`: descriptive evidence.

The default CI threshold is `high`.

## Evidence handling

Reports include sanitized target URLs, request header names, response status,
duration, size, body SHA-256 and check-specific evidence. They intentionally omit
request header values and response bodies. The JSON report is canonicalized with
`settlens-stable-json-v2` (object keys in UTF-16 code-unit order, independent of
the machine's locale) and hashed with SHA-256. The integrity block records the
canonicalization name, and `verify-report` recomputes the digest with it, so
reports made with `settlens-stable-json-v1` still verify.

This digest establishes internal consistency only. It does not identify the
author or prove when the report was produced.

## Interpretation limits

A passing report means the sampled endpoint behaved consistently with the tested
properties during the recorded window. It does not establish:

- absence of vulnerabilities in untested application code;
- validity of real wallet signatures or on-chain settlement;
- continuous uptime, rate limiting or economic safety;
- legal, regulatory or audit certification.

Customer-facing claims must link to the exact report, tool version, configuration
scope and authorization record.
