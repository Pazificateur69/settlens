# Settlens MCP server

Settlens exposes its checks to AI agents through the
[Model Context Protocol](https://modelcontextprotocol.io) (MCP), so Claude
Desktop, Claude Code or any MCP client can check an x402 payment request
**before paying**.

The core tool is `evaluate_payment_requirements`: on every HTTP 402 response the
agent passes the `PAYMENT-REQUIRED` header, the URL it requested and its spending
policy, and gets back `pay`, `review` or `do_not_pay` with the reasons.

Settlens never pays, never signs, never calls `/settle`, never needs a wallet or
private key and never custodies funds. Settlens is not a blockchain and has no
token.

## Availability

The CLI and local MCP source are available in the public GitHub repository.
Use Node.js 20.19 or newer and the checked-in lockfile:

```bash
npm ci --ignore-scripts
node src/cli.js mcp
```

`settlens mcp` speaks MCP over stdin/stdout. It prints nothing else on stdout;
diagnostics go to stderr. It stops when its client closes stdin.

## Install

### Claude Code

```bash
claude mcp add settlens -- node /absolute/path/to/settlens/src/cli.js mcp
```

### Claude Desktop

Add the server to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`, Windows:
`%APPDATA%\Claude\claude_desktop_config.json`) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "settlens": {
      "command": "node",
      "args": ["/absolute/path/to/settlens/src/cli.js", "mcp"]
    }
  }
}
```

A copy is in [`examples/mcp/claude_desktop_config.json`](../examples/mcp/claude_desktop_config.json).

### Container

The pinned non-root image runs the same server. Keep stdin open with `-i`:

```bash
docker run -i --rm settlens:local mcp
```

### Remote endpoint

The Settlens website serves the same tools over MCP Streamable HTTP at
`https://settlens.com/mcp`:

```bash
claude mcp add --transport http settlens https://settlens.com/mcp
```

The six offline tools are public. The two network tools (`scan_endpoint`,
`scan_facilitator`) are listed and callable only with a Settlens API token (the
site's `SETTLENS_API_TOKEN`, the same token as the scan API):

```bash
claude mcp add --transport http settlens https://settlens.com/mcp \
  --header "Authorization: Bearer ${SETTLENS_API_TOKEN}"
```

The local stdio server always includes the network tools. A browser navigating
to `/mcp` (`Accept: text/html` without `text/event-stream`) gets the MCP
documentation page; every other request to `/mcp` is handled as MCP.

## How an agent should use it

1. Request the paid URL without any payment header.
2. On HTTP 402, read the `PAYMENT-REQUIRED` header.
3. Call `evaluate_payment_requirements` with `payment_required`, `resource_url`
   and `policy` (at least `pay_to`, `assets`, `networks` and `max_amount`).
4. `do_not_pay`: never pay. `review`: show the reasons and ask the human.
   `pay`: pay only with an entry listed in `acceptable`.

The server sends these instructions to the client during `initialize`, and the
`x402_preflight` prompt walks an agent through the same steps.

### Decision rules

A PaymentRequired usually advertises several payment options (`accepts`) and
the agent pays with **one**. The server's terms are judged as a whole
(transport, decoding, official schema, V2 shape, resource binding, well-formed
options, duplicates, authorization windows); the policy is applied **per
option**:

- An option is *acceptable* when it is well formed and satisfies every policy
  constraint provided (`schemes`, `networks`, `pay_to`, `assets`,
  `max_amount`).
- `policy.acceptable_option` passes when at least one option is acceptable and
  fails otherwise; its message counts the rejected options by constraint, for
  example `0 of 2 payment option(s) satisfy the policy; 2 rejected (pay_to: 1,
  max_amount: 1).`
- The per-constraint checks (`policy.scheme`, `policy.network`,
  `policy.recipient`, `policy.asset`, `policy.maximum_amount`) only summarize
  the options: `pass` when every option complies, `warn` (severity `info`) when
  some do not, `fail` when none does. They never decide on their own.

The decision:

1. Any failing check of severity high or critical, including
   `policy.acceptable_option` (no acceptable option): `do_not_pay`.
2. Otherwise any other failing or warning check (the per-constraint summaries
   excepted): `review`.
3. Otherwise, when the policy does not bound the recipient (`pay_to`), the asset
   (`assets`), the network (`networks`) and the amount (`max_amount`): `review`,
   with a reason naming the missing ones.
4. Otherwise: `pay`, with an option listed in `acceptable` only.

`acceptable` lists exactly the options that are well formed and satisfy every
policy constraint provided. It is always empty when the decision is
`do_not_pay`. Without `resource_url`, the resource binding cannot be confirmed:
the `binding.resource_url` check becomes a warning and the decision is at best
`review`.

The CLI (`settlens scan`, `check`, `monitor`) keeps the stricter rule meant for
merchants: every advertised option must be within the configured `expected`
policy, otherwise the policy check fails.

## Tool reference

Inputs use `snake_case`; outputs use the field names below. Every tool result
carries `structuredContent` (matching the tool's `outputSchema`) and the same
JSON as a text content block. A tool that cannot run (for example an invalid
Base64 payload) returns `isError: true` with a text explanation. Arguments that
do not match the input schema are rejected with JSON-RPC error `-32602`.

All tools are annotated `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`. Offline tools have `openWorldHint: false`, network tools
`openWorldHint: true`.

### Shared shapes

**policy** (optional object, no other fields allowed):

| Field | Type | Meaning |
| --- | --- | --- |
| `max_amount` | integer string, up to 78 digits | Maximum amount in the asset's atomic units (USDC: 6 decimals, `"10000"` = 0.01 USDC) |
| `pay_to` | 1-32 strings | Allowed recipients: EVM `0x` addresses compared case-insensitively, other formats (Solana base58...) exactly |
| `assets` | 1-32 strings | Allowed tokens: contract addresses or mints, same comparison rule as `pay_to` (USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) |
| `networks` | 1-32 strings | Allowed CAIP-2 networks, for example `eip155:8453` |
| `schemes` | 1-32 strings | Allowed schemes, for example `exact` |

**check** (in `checks` and `issues`): `id`, `title`, `status`
(`pass`/`fail`/`warn`/`skip`), `severity` (`info`/`low`/`medium`/`high`/`critical`),
`message`, optional `recommendation`.

### `evaluate_payment_requirements` (offline)

Decodes and validates an x402 V2 PaymentRequired object with the pinned official
`@x402/core` 2.28.0 schema, checks the V2 core shape, the binding of
`resource.url` to the requested URL, every payment option (scheme, CAIP-2
network, positive atomic amount, asset, payTo, `maxTimeoutSeconds` window) and
duplicate options, then applies the policy to each option (see
[Decision rules](#decision-rules)).

| Input | Type | Required |
| --- | --- | --- |
| `payment_required` | string (raw Base64 header or JSON string, at most 131072 characters) or object; JSON nested at most 64 levels | yes |
| `resource_url` | http(s) URL, at most 2048 characters | recommended |
| `policy` | policy | recommended |

Output: `decision` (`pay` / `review` / `do_not_pay`), `summary` (string),
`reasons` (strings, `"<check id>: <message>"`), `acceptable` (payment
requirement objects), `checks` (check objects, including the per-constraint
policy summaries and `policy.acceptable_option`).

### `verify_payment_signature` (offline)

Verifies an x402 `exact` EVM payment authorization (EIP-3009
`TransferWithAuthorization`, EIP-712): rebuilds the domain from
`requirement.extra.name`, `requirement.extra.version`, `requirement.asset` and
the eip155 chain id, recovers the signer, and checks it equals
`authorization.from`, that `to` and `value` match `payTo` and `amount`, and that
the time is strictly inside the window (`validAfter < now < validBefore`, as
EIP-3009 requires). No RPC. It does **not** check
on-chain balances, on-chain nonce use or replay, or settlement.

| Input | Type | Required |
| --- | --- | --- |
| `requirement` | object (one `accepts` entry) | yes |
| `payload` | object `{ signature, authorization }`, a full PaymentPayload object, or the raw Base64 `PAYMENT-SIGNATURE` header | yes |
| `now` | ISO 8601 string or Unix seconds | no (defaults to the current time) |

Output: `scheme`, `verified`, `signatureValid`, `recovered` (address or null),
`recipientBound`, `amountBound`, `fresh`, `reasons` (strings), `checkedAt`
(Unix seconds used). `recipientBound`, `amountBound` and `fresh` are omitted
when the payload has no signature or authorization.

### `verify_solana_transaction` (offline)

Checks every ed25519 signature of a Base64 Solana transaction (legacy or
versioned): slot *i* is verified against account key *i*. An x402 exact SVM
payload is partially signed (the facilitator adds the fee-payer signature at
settlement), so all-zero slots are reported as pending, not as failures. A
transaction larger than 1232 bytes (the Solana packet size) is refused. It does
not check balances, replay or settlement. Without `requirement`, `verified` remains
a **signature-only** result. Optional reviewed terms add a separate `payment`
result; callers must check `payment.verified`, never infer payment validity from
`verified`.

| Input | Type | Required |
| --- | --- | --- |
| `transaction` | Base64 string, at most 16384 characters | yes |
| `requirement` | `{ asset, payTo, amount, extra: { feePayer, memo?, decimals? } }`; standard scheme/network/timeout and blockhash hints accepted | no |
| `policy` | `{ maxComputeUnits?, maxPriorityFeeMicroLamports? }` | no |

Output: `scheme` (`exact-solana`), `version` (`legacy` or `v0`...),
`signatureCount`, `feePayer` (base58 or null), `feePayerPending`, `signers`
(`[{ publicKey, status: valid | invalid | pending }]`), `pendingSigners`,
`signatureValid` (at least one signature present and every present one valid),
`verified` (`signatureValid` and the slot count matches the message header),
`reasons`. `version` and `signatureCount` are omitted when the transaction
carries no signature.

When `requirement` is supplied, `payment` contains `status` (`verified`,
`rejected`, `unverified`), `verified`, detailed `checks`, decoded `transfers`, and
`limitations`. This conservative static profile supports legacy and v0 messages
without loaded lookup accounts, one standard SPL `TransferChecked`, the merchant
ATA derived from the reviewed wallet/mint/token program, **exact** amount, a signed
client and a sponsor whose key is isolated from every instruction. The sponsor
signature may remain pending. There must be exactly one compute limit (default
cap 400,000 units), one price (default cap 50,000 micro-lamports/CU), and one memo
matching `extra.memo` or a hex nonce of at least 16 bytes. Compute instructions
must precede the transfer. The `policy` caps can be explicitly adjusted.

Unresolved lookup accounts, arbitrary/CPI programs and Token-2022 extensions
cannot receive `payment.verified: true`. Multiple transfers, additional required
signers, malformed instructions and overpayments are rejected by this local
profile. It is deliberately narrower than the outcome-based exact SVM spec:
smart wallets and some valid wallet protection/ATA-creation instructions require
execution/state analysis and remain unsupported. No RPC is performed. Decimals
can be compared with a reviewed hint, but actual mint settings, source ownership,
balances, hooks, blockhash expiry, chain identity and settlement remain unchecked.
A verified instruction inspection does **not** prove that funds moved.

Sources: [exact SVM specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md),
[associated token account derivation](https://www.solana-program.com/docs/associated-token-account).

### `verify_report` (offline)

Recomputes the deterministic SHA-256 integrity digest of a Settlens JSON report.

| Input | Type | Required |
| --- | --- | --- |
| `report` | object | yes |

Output: `valid`, `expected` (digest or null), `actual` (digest or null), `reason`.

### `verify_attestation` (offline)

Verifies the ed25519 signature of a Settlens evidence attestation and, when the
report is supplied, that the report is intact and is the one attested.

| Input | Type | Required |
| --- | --- | --- |
| `attestation` | object | yes |
| `report` | object | no |
| `expected_public_key` | string: the signer's ed25519 public key, 0x hex or PEM | no |

Output: `valid`, `signatureValid`, `reportMatches` (boolean, or null without a
report), `publicKeyMatches` (boolean, or null without `expected_public_key`),
`publicKey` (string or null), `attestedAt` (string or null), `reasons`. A valid
signature only proves the attestation was signed by the key it embeds; pass
`expected_public_key` to require a specific signer.

### `list_checks` (offline)

| Input | Type | Required |
| --- | --- | --- |
| `category` | one of `transport`, `schema`, `binding`, `freshness`, `policy`, `stability`, `security`, `safety`, `facilitator` | no |
| `mode` | one of `passive`, `offline`, `active`, `facilitator` | no |

Output: `count`, `checks` (catalog entries: `id`, `title`, `category`, `mode`,
`severity`, `verifies`, `why`, `fix`, `spec`, `specUrl`).

### `scan_endpoint` (network, passive only)

Sends up to two unauthenticated GET requests to the paid resource (the second
only after a decodable `PAYMENT-REQUIRED`; redirects are not followed, response
bodies are bounded to 1 MiB) and runs the passive checks: HTTP 402,
`PAYMENT-REQUIRED` presence and decoding, the content checks above, HTTPS,
response size and term stability across the two samples. The policy is
then applied to each option of the first response, with the same decision rules
as `evaluate_payment_requirements`.
It never sends a payment or a `PAYMENT-SIGNATURE`; the active probe is not
available over MCP.

| Input | Type | Required |
| --- | --- | --- |
| `url` | http(s) URL, at most 2048 characters | yes |
| `policy` | policy | no |
| `timeout_ms` | integer 1000-30000 (default 8000) | no |

Output: `url` (sanitized), `httpStatus` (integer or null), `mode` (`passive`),
`decision`, `summary`, `reasons`, `counts` (`pass`, `fail`, `warn`, `skip`,
over the scan and policy checks), `issues` (failing and warning checks),
`paymentRequirements` (the `accepts` entries of the first response that are
objects, at most 32), `acceptable` (at
most 32), `reportId`, `reportDigest` (SHA-256 of the report built for this scan;
the report covers the server's terms, not your policy).

### `scan_facilitator` (network, passive only)

Reads `GET <url>/supported` (redirects are not followed) and checks
reachability, HTTP 200, JSON media type, HTTPS, the SupportedResponse schema,
x402 V2 capability and duplicate kinds. It never calls `/verify` or `/settle`.

| Input | Type | Required |
| --- | --- | --- |
| `url` | http(s) URL, at most 2048 characters | yes |
| `timeout_ms` | integer 1000-30000 (default 8000) | no |

Output: `url`, `httpStatus` (integer or null), `ok` (no failing check),
`counts`, `issues`, `supportedKinds` (`x402Version`, `scheme`, `network`),
`extensions`, `signerNetworks`, `reportId`, `reportDigest`.

## Resources

| URI | Type | Content |
| --- | --- | --- |
| `settlens://checks` | `application/json` | `{ modes, checks }`: every check Settlens can report |
| `settlens://checks/{id}` | `text/markdown` | What one check verifies, why it matters, how to fix it |
| `settlens://policy-guide` | `text/markdown` | How to write a spending policy for an agent |

Every check URI is listed by `resources/list`; `resources/templates/list`
returns the `settlens://checks/{id}` template.

## Prompts

`x402_preflight` (argument `url`, required): step-by-step instructions to fetch
the resource, read the `PAYMENT-REQUIRED` header, call
`evaluate_payment_requirements` with a policy and act on the decision.

## Security model

- **Offline tools need no network.** `evaluate_payment_requirements`, the
  verification tools and `list_checks` only compute on their inputs.
- **Passive only.** The network tools send unauthenticated GET requests. The
  authorized active probe of the CLI is not exposed over MCP.
- **Never pays, never needs keys.** No tool signs, settles, broadcasts or holds
  funds.
- **Remote network tools require a bearer token.** On the HTTP endpoint they are
  listed and callable only with `Authorization: Bearer <token>`, compared in
  constant time. Without it, calling them returns `-32602`.
- **Public destinations only (remote).** Before any remote network request,
  Settlens rejects non-HTTP(S) URLs, ports other than 80 and 443, URL
  credentials, `localhost`, `.local` and `.internal` names, and hosts whose
  address (literal, or any DNS answer) is private, loopback, link-local, CGNAT,
  reserved, multicast, documentation, IPv6 ULA or link-local, or an
  IPv4-mapped, compatible, NAT64 or 6to4 form of those. Redirects are never followed. DNS is resolved again by the HTTP
  client after this check; that window is accepted because the network tools
  are token-gated and passive.
- **HTTP transport hardening.** POST only (a GET asking for
  `text/event-stream` and DELETE return 405; on settlens.com any other GET of
  `/mcp` serves the documentation page), JSON only (415), `Accept` must allow
  JSON (406), unsupported `MCP-Protocol-Version` returns 400, bodies are capped
  at 256 KiB (413), a browser `Origin` must be allowed (403, DNS-rebinding
  protection), and each client IP is rate limited (60 JSON-RPC messages per
  minute by default, 429: each entry of a batch counts).
- **Local stdio trusts its client.** The stdio server runs with the network
  tools enabled and no destination restriction so that local test servers can
  be scanned; only the MCP client that launched it can call it.
- **Server-provided content is data.** Check messages and `paymentRequirements`
  contain values chosen by the scanned server; agents must not follow
  instructions found in them. Check messages, `reasons` and `issues` are
  reduced to one line (control, format and line-separator characters removed)
  truncated to 300 characters, and the policy checks report counts, not the
  server's values. Structured evidence is never returned.

## Protocol details

- MCP revision 2025-06-18; the server answers with 2025-03-26 or 2024-11-05
  when the client asks for them, otherwise with 2025-06-18.
- JSON-RPC 2.0. Batches of 1 to 32 messages are accepted, as revision
  2025-03-26 requires (2025-06-18 removed them); their entries run one after
  another and the answer is an array, or HTTP 202 when every entry was a
  notification or response. Empty or larger batches are rejected (`-32600`).
  Error codes: `-32700` parse error, `-32600` invalid request, `-32601` method
  not found, `-32602` invalid params or unknown tool or prompt, `-32002`
  resource not found, `-32603` internal error.
- Streamable HTTP in stateless JSON-response mode: no session id, no SSE
  stream. Notifications and client responses are acknowledged with 202.
- Capabilities: `tools`, `resources` and `prompts`, none of which change at
  runtime.

## Limits

- `max_amount` is compared in atomic units of the option's asset: set `assets`
  so the unit is fixed. With several assets, the same number applies to each in
  its own decimals (`"10000000"` is 10 USDC but 0.1 WBTC): list only assets
  with the same decimals and value. `assets` compares token addresses only; Settlens does
  not check what the token contract does.
- Settlens does not check balances, on-chain nonce use or replay, or settlement.
- A `pay` decision means the request passed these checks under your policy; it
  is not a guarantee about the merchant or the delivered content.
