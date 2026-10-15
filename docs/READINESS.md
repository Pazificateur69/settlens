# Readiness snapshot (0.2.0, historical)

Observed on 2026-07-30 with Settlens 0.2.0 and Node.js 24.9.0. This snapshot has
not been re-run for 0.5.0: its counts, coverage and artifacts describe 0.2.0 only.
Since then, the security contact (contact@settlens.com) has been published in
`SECURITY.md` and `/.well-known/security.txt`, and the repository has a GitHub
remote; the current gate status is in [`PILOT_ACCEPTANCE.md`](./PILOT_ACCEPTANCE.md).

## Verified locally

| Proof | Result | Artifact or command |
| --- | --- | --- |
| Locked install | 7 packages installed; install scripts disabled; 0 vulnerabilities reported | `npm ci --ignore-scripts` |
| Syntax and tests | 31/31 pass | `npm run quality` |
| Coverage | 86.72% lines, 62.90% branches, 90.34% functions | enforced thresholds: 85/60/90 |
| Known dependency vulnerabilities | 0 total at audit time | `npm audit --audit-level=high --json` |
| Official x402 parser | `@x402/core` 2.20.0 canonical V2 fixture passes | automated test and report integration metadata |
| Controlled compliant E2E | 27 pass, 0 fail, 0 warn, 0 skip | `reports/release-0.2.0/local-secure/` |
| Controlled bypass E2E | critical failure detected; expected exit code 1 | `reports/release-0.2.0/local-bypass/` |
| Live public facilitator | 8 pass, 0 fail, 0 warn, 0 skip | `reports/release-0.2.0/live-x402/` |
| Report integrity | all three canonical JSON reports pass `verify-report` | embedded SHA-256 digests |
| Evidence bundle integrity | nine artifact hashes | `reports/release-0.2.0/SHA256SUMS` |
| Package dry-run | 26 expected entries; dry-run successful | `npm pack --dry-run --json` |
| SBOM generation | valid CycloneDX 1.5; 7 components | `npm sbom --sbom-format cyclonedx` |
| YAML syntax | action, example, CI and Dependabot parse | Ruby YAML parser |
| Container policy | digest-pinned base, locked install, non-root user | automated Dockerfile policy test |
| Plesk container runtime | read-only, UID 1000, no capabilities, no privilege gain, bounded resources, no published port | verified on Docker 29.6.2 |
| Container CVEs | 0 high or critical after removing unused npm/npx from runtime | Trivy 0.72.0 pinned by digest |
| Plesk live integration | public x402 facilitator: 8 pass, 0 fail, 0 warn, 0 skip | `reports/plesk-0.2.0/` |

## Not yet independently proven

| Gate | Why it remains open |
| --- | --- |
| Node.js 20/22/24 matrix | only Node.js 24.9.0 is installed locally; workflow is ready but has not run |
| GitHub SARIF ingestion and artifact upload | this directory is not currently a Git repository connected to GitHub |
| Customer resource integration | requires a customer-owned testnet endpoint and written scope |
| Independent security review | cannot be self-issued by the implementation author |
| Release provenance signature | SHA-256 integrity exists; Sigstore or equivalent identity attestation is not yet configured |
| Disclosure operations | contact@settlens.com is published in SECURITY.md and /.well-known/security.txt (after this snapshot); a delivery and response test is still required |
| Legal approval | requires the owner and, where appropriate, counsel |

Status: technically ready for a controlled internal demonstration. External pilot
is `NO-GO` until the mandatory customer, CI/container, independent-review,
security-contact and legal gates in `PILOT_ACCEPTANCE.md` are closed.
