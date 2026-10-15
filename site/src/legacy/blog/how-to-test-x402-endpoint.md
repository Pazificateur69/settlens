<!-- Legacy source: site/blog/how-to-test-x402-endpoint.html (removed). Old canonical: https://settlens.com/blog/how-to-test-x402-endpoint.html -->
<!-- Old <title>: How to Test an x402 Payment Endpoint: A Practical Checklist | Settlens -->
<!-- Old meta description: A step-by-step checklist for testing an x402 payment endpoint: passive protocol and policy checks, facilitator verification, the one active fail-closed test, independent signature verification, and continuous monitoring in CI. -->

GUIDE · 31 JULY 2026

# How to test an x402 payment endpoint: a practical checklist

You can verify most of an x402 implementation without ever holding a key or moving money. This is the order we recommend — from safe passive checks to a single, carefully scoped active test — so you catch the [failure modes that matter](x402-security-failure-modes.html) before production does.

## Step 1 — Start passive (no payments)

A passive scan sends normal requests and inspects the response. It never attaches a payment authorization, so it is safe to run against any endpoint you own. From the unauthenticated response alone you can confirm:

- the resource returns HTTP `402` and a `PAYMENT-REQUIRED` header;
- the header decodes to a valid x402 v2 object and passes the official schema;
- `resource.url` binds the payment to the exact URL under test;
- scheme, network, amount, asset, recipient and timeout are well-formed;
- the advertised recipient and price match your reviewed policy;
- terms stay identical across repeated requests (no drift);
- remote endpoints use HTTPS.

```
settlens scan https://your-endpoint.example/paid \
  --expect-network eip155:8453 \
  --expect-pay-to 0xYourReviewedRecipient \
  --max-amount 10000
```

## Step 2 — Check the facilitator

If you rely on a facilitator, its `GET /supported` should advertise the scheme and network your resource actually uses, with valid signer metadata. A gap here means payments will fail in ways your resource can't see. Cross-check coverage against the payment requirements the resource advertises.

## Step 3 — The one active test that matters: fail-closed

With the endpoint owner's explicit authorization, submit a single intentionally *invalid* payment signature and assert the resource denies it. This is the test that catches a payment bypass. It uses no private key and never calls `/settle`, so it cannot move funds — but it proves the most important property of the whole system: that an invalid payment is rejected.

```
settlens scan https://your-endpoint.example/paid \
  --active --authorized --authorization-ref TICKET-123
```

Run the same invalid payload against the facilitator's `/verify` too — it should report `isValid: false`. If the facilitator accepts a zero signature, that is a critical finding.

## Step 4 — Verify a real signature independently

When you have a captured payment authorization, you can verify it cryptographically and offline — recovering the EIP-3009 / EIP-712 signer for EVM, or checking the fee-payer's ed25519 signature for Solana — and confirm it is bound to the advertised recipient, amount and time window. No wallet, no RPC.

```
settlens verify-payment captured-payment.json
```

## Step 5 — Put it in CI

Wire the passive scan into your pipeline so every release is checked. Settlens exits non-zero when a failing check meets your severity threshold and emits machine-readable JSON and SARIF, so findings show up where your team already looks.

## Step 6 — Monitor continuously

Endpoints drift after they ship. A scheduled monitor compares each run to a stored baseline and alerts the moment a check regresses — a price change, a new recipient, a control that stopped failing closed:

```
settlens monitor --config settlens.config.json --state settlens.state.json
```

---

The point of all six steps is the same: turn "we think payments work" into evidence you can show your team, your customers and your auditors. For the deeper background on *why* each check exists, see [the x402 failure modes](x402-security-failure-modes.html).

### Want this run against your endpoint?

We offer a first authorized testnet assessment and share all results privately. [Request a private assessment](../#pilot)
