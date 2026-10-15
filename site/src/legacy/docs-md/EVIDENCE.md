# Reproducible evidence

Run from a clean checkout with Node.js 24:

```bash
npm ci --ignore-scripts
npm run quality
npm audit --audit-level=high
npm pack --dry-run
```

Start the controlled target:

```bash
npm run demo:server
```

In another terminal, generate compliant evidence and verify its digest:

```bash
node src/cli.js check \
  --config settlens.config.example.json \
  --out reports/secure \
  --format json,html,sarif

node src/cli.js verify-report reports/secure/settlens-REPORT_ID.json
```

Prove that the security gate detects the deliberately vulnerable fixture:

```bash
node src/cli.js scan http://127.0.0.1:4402/bypass \
  --active \
  --authorized \
  --authorization-ref CONTROLLED-DEMO-001 \
  --repeat 1 \
  --out reports/bypass \
  --format json,html,sarif
```

The expected process exit code is `1`, and the
`security.invalid_signature_fail_closed` result is `critical/fail`.

Build and smoke-test the locked non-root container:

```bash
docker build -t settlens:evidence .
docker run --rm settlens:evidence --version
```

The GitHub workflow repeats these checks, generates a CycloneDX SBOM, uploads
SARIF and stores a SHA-256 manifest with the evidence bundle.

## Evidence that cannot be self-issued

The repository cannot honestly manufacture:

- customer authorization;
- a real customer/testnet integration result;
- CI status before the workflow runs on a repository host;
- independent code review;
- legal approval or certification.

Those items remain explicit pilot gates rather than being represented as passed.
