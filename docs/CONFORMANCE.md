# Reproducible x402 conformance corpus

Run the labelled fixture corpus after installing the repository lockfile:

```sh
npm ci --ignore-scripts
npm run conformance -- --seed 402 --mutations 32 --out /tmp/settlens-conformance.json
```

Choose a fresh output path: existing files are never overwritten. Output files are
owner-readable only. Without `--out`, JSON goes to stdout; the short human summary
goes to stderr. For clean redirected JSON use `node scripts/conformance.mjs > report.json`.
Exit codes are `0` when every expectation matches, `1` for a mismatch and `2` for
invalid arguments, dependency/version mismatch or output failure.

The versioned corpus is `test/fixtures/conformance/x402-v2.json`. Its cases declare
expected decisions, scanner findings and SDK parser acceptance before execution.
They cover a canonical V2 challenge, optional metadata, EVM address case, a Solana
advertisement, Base64URL, wrong binding, invalid shape and amounts, policy breaches,
wide timeouts, duplicates, mixed payment options, missing headers, plaintext HTTP,
redirects and repeated payment-term changes. A canonical V1 fixture demonstrates
that the pinned SDK can parse a V1 object while Settlens intentionally requires V2.
The Solana advertisement case validates advertised terms; it does not validate a
transaction. The separate signature tests cover transaction verification.

A seeded xorshift32 generator adds recipient, asset, network and spending-limit
violations. `--seed` accepts unsigned 32-bit integers and `--mutations` accepts
0–1000 (defaults: 402 and 32). The report records the corpus SHA-256, generator seed,
generated-case SHA-256, Node version, Settlens version and installed SDK version.
Repeated runs on the same code, corpus and Node version produce identical JSON.
Digests establish content identity; they do not establish authorship.

The harness runs the production passive scanner through in-memory HTTP `Response`
objects and the production offline preflight. It opens no sockets and never
requests an external endpoint. Requests must be GET, redirects must stay disabled
and `PAYMENT-SIGNATURE` must be absent. Those constraints are checked by the harness.
A redirect fixture never follows its advertised destination. No email, wallet,
private key, RPC, broadcast, payment, facilitator or settlement call is involved.

## How to read the results

Each case includes expected and observed results plus mismatches. `scan.flagged`
means at least one warning or failure, at any severity. The agent preflight metric
counts `review` and `do_not_pay` as positive findings and `pay` as negative. Each
plane has its own label: a valid decoded header can yield `pay` offline while a
scanner flags an unprotected HTTP 200 resource. Mixed options can allow an agent
to choose a compliant option while the merchant scanner flags a disallowed option.

The confusion counts report true positives, false positives, true negatives and
false negatives. Detection rate is `TP / (TP + FN)`; false-positive rate is
`FP / (FP + TN)`. Denominators are included. These rates describe this finite,
synthetic, labelled corpus only. They are not estimates for production traffic,
security guarantees or comparisons with competitors. A mismatch fails the command
even if aggregate detection rates appear satisfactory.

The SDK matrix tests only the installed pinned `@x402/core` **2.28.0**
`parsePaymentRequired` surface. Installed and declared versions must agree.
SDK acceptance is recorded separately from policy and resource binding: parsing a
challenge does not make paying it safe. This is not a compatibility claim for any
other SDK version, client/server implementation, transport, scheme implementation
or newer MCP revision.

## Extending coverage

Add independently reviewed labelled cases to the JSON corpus, increment its
version when changing existing semantics, and run `npm run conformance` plus
`npm run quality`. Review any changed expectation against the specification and
the pinned SDK source before accepting it. Do not relabel a failure solely to make
the benchmark green. Keep customer data, credentials and real payment signatures
out of the corpus.

Transport fixtures simulate status and headers; they do not exercise real TLS,
DNS, socket handling or HTTP proxy behavior. The existing network-guard, scanner,
MCP, signature and website tests provide separate evidence. The benchmark does not
prove all malformed inputs, real-world false-positive rates or on-chain state.
