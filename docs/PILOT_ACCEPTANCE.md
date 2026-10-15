# Pilot acceptance gates

A pilot is `GO` only when every mandatory gate below is green. “Implemented” is
not interchangeable with “independently verified.”

| Gate | Acceptance evidence | Status |
| --- | --- | --- |
| Locked install | `npm ci --ignore-scripts` succeeds from a clean checkout | verified locally |
| Automated tests | all tests pass on Node 20, 22 and 24 | CI required |
| Coverage | lines ≥85%, branches ≥60%, functions ≥90% | verified locally; CI repeat required |
| Dependency risk | no high or critical npm audit finding | verified locally; CI repeat required |
| Protocol compatibility | official x402 parser accepts the canonical V2 challenge | implemented and tested |
| Facilitator integration | live or customer `/supported` matches resource requirements | public x402 verified; customer endpoint still required |
| Safe active scope | written owner authorization plus testnet/synthetic endpoint | customer required |
| Fail-closed proof | invalid authorization is denied, while controlled vulnerable fixture is detected as critical | implemented; customer repeat required |
| Evidence integrity | generated JSON passes `verify-report` and artifact checksums are retained | implemented |
| Supply-chain evidence | CycloneDX SBOM, exact action SHAs and pinned container digest | CI required |
| Container execution | image builds and runs as non-root | Docker/CI required |
| Independent review | another qualified engineer reviews scope, threat model and a release commit | external required |
| Security contact | contact@settlens.com published in SECURITY.md and /.well-known/security.txt; a test report is received and answered | published; delivery test required (owner) |
| Legal approval | terms, privacy position and testing authorization language reviewed | external counsel/owner required |

## Pilot operating constraints

- Use testnet assets and synthetic data.
- Start with one resource endpoint and one facilitator.
- Maximum two passive samples plus one explicitly authorized invalid-signature
  probe per run.
- No wallet keys, real signatures, settlement, replay or fund movement.
- Stop immediately if the target owner withdraws authorization or unexpected
  production impact appears.

## Success criteria

The first pilot succeeds when Settlens produces a reproducible report, identifies
at least one actionable conformance or security fact, creates no customer impact,
leaks no secret, and the customer confirms that the evidence is understandable
and useful. A vulnerability is not required for success.
