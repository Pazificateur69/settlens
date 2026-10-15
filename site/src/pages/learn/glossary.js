// /learn/glossary: x402, EIP-3009/EIP-712 and Settlens terms. One data array drives the visible
// glossary, the alphabetical index and the DefinedTermSet JSON-LD. Backticks mark code; `see` is one
// [path, label] pair or a list of them; `sameAs` is the term's primary specification.

import { SOURCES } from "./_shared.js";

const PAGE_URL = "https://settlens.com/learn/glossary";

const TERMS = [
  { id: "accepts", term: "accepts", def: "The array of payment options in a `PaymentRequired` object. Each entry is a `PaymentRequirements` object; the client chooses one and echoes it as `accepted`.", see: ["/learn/x402-v2-headers", "x402 V2 headers"] },
  { id: "active-probe", term: "Active probe", def: "A Settlens test that runs only with the endpoint owner's authorization (`--active --authorized --authorization-ref`). It sends one intentionally invalid `PAYMENT-SIGNATURE` and expects the resource and the facilitator's `/verify` to reject it. It never calls `/settle` and moves no funds.", see: ["/docs/checks", "Check reference"] },
  { id: "agentic-payment", term: "Agentic payment", def: "A payment made by software acting for a person or an organization, typically an AI agent paying per request for an API, a dataset or a tool, without a human filling in a checkout form." },
  { id: "asset", term: "asset", def: "The field of a payment requirement that names what is paid: a token contract address, or an ISO 4217 currency code for fiat rails. For EIP-3009 payments it is also the EIP-712 `verifyingContract`." },
  { id: "asset-transfer-method", term: "Asset transfer method", def: "`extra.assetTransferMethod`, a reserved protocol key that says how value is authorized or moved for a scheme on a network, for example `eip3009` or `permit2` on the EVM `exact` scheme, where the default is `eip3009`." },
  { id: "atomic-units", term: "Atomic units", def: "The smallest indivisible unit of a token. x402 amounts are integer strings in atomic units: for a token with 6 decimals, `\"10000\"` means 0.01. An amount ceiling is meaningless without knowing the asset." },
  { id: "authorization-flow", term: "Authorization flow", def: "The default x402 payment flow: verify, run the resource, then settle. Funds move only after the handler succeeds. Clients should prefer it when a resource also offers another flow.", see: ["/learn/what-is-x402", "What is x402?"] },
  { id: "authorization-state", term: "authorizationState", def: "The EIP-3009 view function that returns whether a given nonce has already been used by a given authorizer. Checking it requires reading the chain." },
  { id: "base64", term: "Base64", def: "The text encoding used for the JSON values of the three x402 V2 headers. A client Base64-decodes the header value, then parses the result as JSON." },
  { id: "bazaar", term: "Bazaar", def: "The x402 discovery concept: a catalog where x402-enabled resources can be found, exposed through the discovery API (`GET /discovery/resources`)." },
  { id: "caip-2", term: "CAIP-2", def: "Chain Agnostic Improvement Proposal 2, the `namespace:reference` format x402 V2 uses for networks. The namespace is 3 to 8 characters, the reference 1 to 32: `eip155:8453` is Base mainnet, `eip155:84532` is Base Sepolia.", sameAs: SOURCES.caip2.url },
  { id: "client", term: "Client", def: "In x402, any application or agent that requests a paid resource, reads `PAYMENT-REQUIRED` and pays with `PAYMENT-SIGNATURE`." },
  { id: "domain-separator", term: "Domain separator", def: "The EIP-712 hash of the domain struct (for EIP-3009: `name`, `version`, `chainId`, `verifyingContract`). It scopes a signature to one contract on one chain, which prevents cross-chain replay.", see: ["/learn/eip-3009", "EIP-3009 guide"] },
  { id: "drift", term: "Drift", def: "In Settlens, a change in payment terms (resource, options or extensions) between identical requests in one scan. Settlens monitoring also compares each scan with a stored baseline and flags checks that regress.", see: ["/product/monitor", "Monitor"] },
  { id: "ecrecover", term: "ecrecover", def: "Recovery of the Ethereum address that produced a secp256k1 signature over a digest. It returns the zero address for a malformed signature, which verifiers must reject." },
  { id: "eip-155-chain-id", term: "EIP-155 chain id", def: "The integer that identifies an EVM chain, introduced by EIP-155 for transaction replay protection. It is the reference in `eip155:` CAIP-2 identifiers and the `chainId` of an EIP-712 domain." },
  { id: "eip-2-low-s", term: "EIP-2 low-s rule", def: "EIP-2 made transaction signatures with an `s` value above half the secp256k1 order invalid, because every signature otherwise has a second valid form. The `ecrecover` precompile still accepts high-s values; Settlens rejects them." },
  { id: "eip-3009", term: "EIP-3009", def: "Transfer With Authorization, a draft ERC that lets a token holder authorize a transfer by signing an EIP-712 message that anyone can submit. It is the default transfer method of the x402 `exact` scheme on EVM chains.", see: ["/learn/eip-3009", "EIP-3009 guide"], sameAs: SOURCES.eip3009.url },
  { id: "eip-712", term: "EIP-712", def: "The Ethereum standard for hashing and signing typed structured data. The signed digest is `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))`.", sameAs: SOURCES.eip712.url },
  { id: "escrow-flow", term: "Escrow flow", def: "An x402 payment flow in which a first settle commits a deposit or ceiling before the resource runs and a second settle records the final charge." },
  { id: "evidence-attestation", term: "Evidence attestation", def: "In Settlens, an ed25519 signature that binds a report's SHA-256 digest to a signing identity and a timestamp, so a third party can verify the report offline.", see: ["/product/evidence", "Evidence"] },
  { id: "exact-scheme", term: "exact scheme", def: "The x402 scheme that transfers a specific amount, known in advance, from the client to the recipient. On EVM chains it uses EIP-3009 by default, Permit2 or ERC-7710 otherwise." },
  { id: "extensions", term: "Extensions", def: "Optional protocol features advertised in the `extensions` object of `PaymentRequired`, each with `info` and a JSON `schema`. Clients echo them in the payload and may add information but not remove it." },
  { id: "extra", term: "extra", def: "Additional data in a payment requirement. `assetTransferMethod` and `paymentFlow` are reserved protocol keys; for EIP-3009 tokens, `name` and `version` carry the token's EIP-712 domain." },
  { id: "facilitator", term: "Facilitator", def: "The service that verifies payment authorizations (`POST /verify`) and settles them (`POST /settle`), and publishes its capabilities (`GET /supported`). A resource server can use a third-party facilitator or host these endpoints itself.", see: [["/learn/x402-facilitator-security", "x402 facilitator security"], ["/use-cases/facilitators", "Settlens for facilitators"]] },
  { id: "fail-closed", term: "Fail closed", def: "Refusing access when a payment is missing, malformed, invalid or cannot be verified. A resource that serves content for an invalid signature fails open." },
  { id: "fee-payer", term: "Fee payer", def: "On Solana, the account that pays the transaction fee and provides the final required signature. In the x402 `exact` scheme on Solana it is the sponsor named in `extra.feePayer`." },
  { id: "http-402", term: "HTTP 402 Payment Required", def: "The HTTP status code that RFC 9110 reserves for future use. x402 gives it a meaning: the resource requires payment, and the terms are in the `PAYMENT-REQUIRED` header." },
  { id: "max-timeout-seconds", term: "maxTimeoutSeconds", def: "The maximum time, in seconds, allowed for payment completion in a payment requirement. Settlens warns when it exceeds 3600 seconds." },
  { id: "mcp", term: "MCP (Model Context Protocol)", def: "A protocol that connects AI applications to external tools and data. The Settlens MCP server lets an agent check an x402 payment request before paying.", see: ["/mcp", "Settlens MCP server"], sameAs: "https://modelcontextprotocol.io" },
  { id: "nonce", term: "Nonce (EIP-3009)", def: "A random 32-byte value in an EIP-3009 authorization. The token contract accepts each nonce once per payer, which prevents replay; random rather than sequential nonces let many authorizations be pending at once." },
  { id: "pay-to", term: "payTo", def: "The recipient of a payment requirement: an address, or a role constant such as \"merchant\". On `eip155` networks Settlens requires a 20-byte address." },
  { id: "payment-bypass", term: "Payment bypass", def: "A paid resource that can be obtained without a valid payment, for example because the server accepts an invalid signature. Settlens tests for it with `security.invalid_signature_fail_closed`." },
  { id: "payment-flow", term: "Payment flow", def: "`extra.paymentFlow`: when settlement happens relative to the resource handler. V2 defines `authorization` (the default), `upfront` and `escrow`, and clients must not pay with a flow they do not recognize.", see: [["/learn/what-is-x402#payment-flows", "Payment flows"], ["/learn/x402-v1-to-v2-migration", "V1 to V2 migration"], [SOURCES.x402.url, "section 6.1 of the V2 specification"]] },
  { id: "payment-payload", term: "PaymentPayload", def: "The object a client sends in `PAYMENT-SIGNATURE`: `x402Version`, the optional `resource`, the chosen requirement in `accepted`, the scheme-specific `payload` and optional `extensions`." },
  { id: "payment-required", term: "PAYMENT-REQUIRED", def: "The x402 V2 response header, sent with HTTP 402, that carries a Base64-encoded `PaymentRequired` object.", see: ["/learn/x402-v2-headers", "x402 V2 headers"] },
  { id: "payment-required-object", term: "PaymentRequired", def: "The object in `PAYMENT-REQUIRED`: `x402Version` (2), an optional `error`, the `resource` description, the `accepts` array and optional `extensions`." },
  { id: "payment-requirements", term: "PaymentRequirements", def: "One payment option: `scheme`, `network`, `amount`, `asset`, `payTo`, `maxTimeoutSeconds` and optional `extra`." },
  { id: "payment-response", term: "PAYMENT-RESPONSE", def: "The x402 V2 response header that carries a Base64-encoded settlement response: HTTP 200 on success, HTTP 402 when settlement failed." },
  { id: "payment-signature", term: "PAYMENT-SIGNATURE", def: "The x402 V2 request header in which the client sends a Base64-encoded `PaymentPayload`. It replaces the V1 `X-PAYMENT` header." },
  { id: "permit2", term: "Permit2", def: "The fallback transfer method of the EVM `exact` scheme for tokens without EIP-3009. The payer approves the Permit2 contract once, then signs transfers whose recipient is enforced by the x402 Permit2 proxy." },
  { id: "replay", term: "Replay", def: "Reusing a payment authorization, on the same chain or another one. EIP-3009 nonces stop reuse on chain, `validBefore` limits the lifetime and the EIP-712 domain ties a signature to one chain and one token." },
  { id: "report-digest", term: "Report digest", def: "In Settlens, the deterministic SHA-256 integrity block of a JSON report. `verify-report` recomputes it to show the report has not changed.", see: ["/docs/reports", "Reports"] },
  { id: "resource", term: "resource (ResourceInfo)", def: "The object in `PaymentRequired` that describes the protected resource. Its `url` is required and should equal the URL the client requested; `description`, `mimeType`, `serviceName`, `tags` and `iconUrl` are optional." },
  { id: "resource-server", term: "Resource server", def: "The service that requires payment for a resource. It answers 402 with the terms, verifies and settles payments through a facilitator and returns the resource." },
  { id: "sarif", term: "SARIF", def: "Static Analysis Results Interchange Format, a JSON format for analysis findings. Settlens writes SARIF so code-scanning tools can display x402 findings." },
  { id: "scheme", term: "Scheme", def: "The payment logic of a payment requirement, independent of transport. The x402 specifications define `exact`, `upto`, `batch-settlement` and `auth-capture`, each with per-network bindings." },
  { id: "settle", term: "Settle (/settle)", def: "The facilitator endpoint that durably commits a payment, typically by broadcasting a transaction, and returns a settlement response. Settlens never calls it." },
  { id: "settle-response", term: "SettleResponse", def: "The result of settlement: `success`, `transaction`, `network`, and optionally `errorReason`, `payer`, `amount` and `extensions`. The resource server returns it in `PAYMENT-RESPONSE`." },
  { id: "settlement-pending", term: "settlement_pending", def: "A non-terminal x402 error: the settlement transaction was broadcast but its confirmation could not be established. The response must include the transaction hash so the caller can reconcile on chain before retrying.", see: ["/learn/x402-error-codes#settlement-pending", "x402 error codes"] },
  { id: "spending-policy", term: "Spending policy", def: "The limits an agent applies before paying. In the Settlens MCP tools: allowed recipients (`pay_to`), assets (`assets`), networks, schemes and a maximum amount in atomic units (`max_amount`). Cumulative budgets are not part of it.", see: ["/learn/agent-spending-policy", "Agent spending policy"] },
  { id: "supported", term: "Supported (/supported)", def: "The facilitator endpoint that lists its capabilities: `kinds` (x402 version, scheme and network), `extensions` and `signers` per network." },
  { id: "transfer-with-authorization", term: "transferWithAuthorization", def: "The EIP-3009 function that moves tokens from `from` to `to` given a signed authorization and its `v`, `r`, `s` signature. The x402 facilitator calls it at settlement." },
  { id: "upfront-flow", term: "Upfront flow", def: "An x402 payment flow that settles before the resource runs. If the handler then fails, the client has paid; the core specification defines no refund for this case." },
  { id: "upto-scheme", term: "upto scheme", def: "An x402 scheme in which the requirement's `amount` is the maximum authorized at verification time, and the amount actually settled is set at settlement time." },
  { id: "valid-after-before", term: "validAfter and validBefore", def: "The Unix times that bound an EIP-3009 authorization. The token contract accepts it only after `validAfter` and before `validBefore`." },
  { id: "verify", term: "Verify (/verify)", def: "The facilitator endpoint that checks a payment authorization against the requirements without executing it. It is read-only and must not commit payment state." },
  { id: "verify-response", term: "VerifyResponse", def: "The answer of `/verify`: a boolean `isValid` and, optionally, `invalidReason`, `payer`, `extensions` and scheme-specific `extra`." },
  { id: "x402", term: "x402", def: "An open payment standard that lets any client pay for a resource as part of a request-response exchange. Over HTTP it uses status 402 and three headers; a facilitator typically verifies the payment and settles it on a blockchain.", see: ["/learn/what-is-x402", "What is x402?"], sameAs: "https://github.com/x402-foundation/x402" },
  { id: "x-payment", term: "X-PAYMENT", def: "The x402 V1 request header that carried the client's Base64-encoded payment payload. V2 replaces it with `PAYMENT-SIGNATURE`.", see: ["/learn/x402-v1-to-v2-migration", "V1 to V2 migration"] },
  { id: "x-payment-response", term: "X-PAYMENT-RESPONSE", def: "The x402 V1 response header that carried the Base64-encoded settlement response. V2 replaces it with `PAYMENT-RESPONSE`." },
  { id: "max-amount-required", term: "maxAmountRequired", def: "The x402 V1 field of a payment requirement that held the amount in atomic units. V2 renames it `amount`.", see: ["/learn/x402-v1-to-v2-migration", "V1 to V2 migration"] },
  { id: "payment-identifier", term: "payment-identifier", def: "An x402 extension in which the client attaches an `id` of 16 to 128 characters to its payment payload as an idempotency key, so resource servers and facilitators can deduplicate repeated submissions." },
  { id: "error-reason", term: "invalidReason and errorReason", def: "The fields of `VerifyResponse` and `SettleResponse` that carry an x402 error code, such as `insufficient_funds`, when verification or settlement fails.", see: ["/learn/x402-error-codes", "x402 error codes"] },
  { id: "signers", term: "signers", def: "The map in a facilitator's `/supported` response from CAIP-2 patterns, such as `eip155:*`, to the facilitator's public signer addresses.", see: ["/learn/x402-facilitator-security", "x402 facilitator security"] },
  { id: "x402-version", term: "x402Version", def: "The protocol version field present in x402 objects. V2 objects carry `2`; V1 objects carry `1` and use a different layout." },
];

const plainText = (def) => def.replace(/`/g, "");
const seeLinks = (see) => (Array.isArray(see[0]) ? see : [see]);
const letterOf = (term) => term.replace(/^[^A-Za-z0-9]+/, "")[0].toUpperCase();
const SORTED = [...TERMS].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));

export const meta = {
  path: "/learn/glossary",
  title: "x402 glossary: agentic payment terms defined",
  heading: "x402 and agentic payments glossary",
  label: "Glossary",
  description:
    "Plain definitions of x402, EIP-3009, EIP-712 and agentic payment terms, from PAYMENT-REQUIRED and CAIP-2 to facilitators, nonces, payment flows and replay.",
  summary:
    "A glossary of x402 and agentic payment terms, from PAYMENT-REQUIRED, CAIP-2 and atomic units to facilitators, EIP-3009 nonces, payment flows and settlement_pending. Definitions follow the x402 V1 and V2 specifications and the EIPs, and say when a term is specific to Settlens.",
  sources: [SOURCES.x402, SOURCES.x402V1, SOURCES.eip3009, SOURCES.eip712, SOURCES.caip2],
  lede: `${TERMS.length} terms you meet when building, paying or testing x402 payments, each with a stable link you can share.`,
  section: "learn",
  order: 9,
  icon: "layers",
  datePublished: "2026-10-13",
  lastmod: "2026-10-13",
  tags: ["x402", "Glossary", "Reference"],
  related: ["/learn/what-is-x402", "/learn/x402-v2-headers", "/learn/eip-3009"],
  jsonLd: {
    "@type": "DefinedTermSet",
    "@id": `${PAGE_URL}#terms`,
    name: "x402 and agentic payments glossary",
    url: PAGE_URL,
    inLanguage: "en",
    publisher: { "@id": "https://settlens.com/#organization" },
    hasDefinedTerm: SORTED.map((entry) => ({
      "@type": "DefinedTerm",
      "@id": `${PAGE_URL}#${entry.id}`,
      name: entry.term,
      description: plainText(entry.def),
      url: `${PAGE_URL}#${entry.id}`,
      ...(entry.sameAs ? { sameAs: entry.sameAs } : {}),
      inDefinedTermSet: { "@id": `${PAGE_URL}#terms` },
    })),
  },
};

export default function render(ctx) {
  const { html, keyValues } = ctx;
  // `code` spans: escape first, then turn backtick pairs into <code>.
  const rich = (def) => ctx.raw(ctx.escape(def).replace(/`([^`]+)`/g, "<code>$1</code>"));
  const groups = [];
  for (const entry of SORTED) {
    const letter = letterOf(entry.term);
    if (groups.at(-1)?.letter !== letter) groups.push({ letter, entries: [] });
    groups.at(-1).entries.push(entry);
  }
  return html`<p>Definitions follow the x402 V1 and V2 specifications, EIP-3009 and EIP-712. Terms specific to <a href="/about">Settlens</a> say so. For the protocol in context, start with <a href="/learn/what-is-x402">What is x402?</a>; for field-level detail, see the <a href="/learn/x402-v2-headers">V2 headers reference</a>.</p>
<nav aria-label="Glossary index"><p>${groups.map((group, index) => html`${index ? " · " : ""}<a href="#letter-${group.letter.toLowerCase()}">${group.letter}</a>`)}</p></nav>
${groups.map(
  (group) => html`<h2 id="letter-${group.letter.toLowerCase()}">${group.letter}</h2>
${keyValues(
  group.entries.map((entry) => ({
    term: html`<dfn id="${entry.id}"><strong>${entry.term}</strong></dfn>`,
    value: html`${rich(entry.def)}${entry.see ? html` See ${seeLinks(entry.see).map(([path, label], index) => html`${index ? " and " : ""}<a href="${path}">${label}</a>`)}.` : ""}`,
  })),
)}`,
)}
<p>Missing a term? Tell us at <a href="mailto:${ctx.site.email}">${ctx.site.email}</a>, or read how the terms fit together in the <a href="/learn/x402-security-checklist">x402 security checklist</a>.</p>`;
}
