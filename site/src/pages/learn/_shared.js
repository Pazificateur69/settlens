// Shared data for the /learn guides (files starting with "_" are not pages). Protocol facts were
// checked against the x402-foundation/x402 specifications on CHECKED_ON.

import { SOURCES as MCP_SOURCES } from "../mcp.js";

export const CHECKED_ON = "2026-10-13";

const SPECS = "https://github.com/x402-foundation/x402/blob/main/specs";
const FOUNDATION = "x402 Foundation";
const EIPS = "Ethereum Improvement Proposals";

/** Primary sources cited by the learn guides (meta.sources entries). */
export const SOURCES = Object.freeze({
  x402: MCP_SOURCES.x402,
  x402Http: MCP_SOURCES.x402Http,
  x402Mcp: MCP_SOURCES.x402Mcp,
  mcpTools: MCP_SOURCES.mcpTools,
  x402V1: { title: "x402 protocol specification, version 1", url: `${SPECS}/x402-specification-v1.md`, publisher: FOUNDATION },
  x402HttpV1: { title: "x402 HTTP transport, version 1", url: `${SPECS}/transports-v1/http.md`, publisher: FOUNDATION },
  exact: { title: "x402 scheme: exact", url: `${SPECS}/schemes/exact/scheme_exact.md`, publisher: FOUNDATION },
  exactEvm: { title: "x402 scheme: exact on EVM", url: `${SPECS}/schemes/exact/scheme_exact_evm.md`, publisher: FOUNDATION },
  paymentIdentifier: { title: "x402 extension: payment-identifier", url: `${SPECS}/extensions/payment_identifier.md`, publisher: FOUNDATION },
  eip3009: { title: "ERC-3009: Transfer With Authorization", url: "https://eips.ethereum.org/EIPS/eip-3009", publisher: EIPS },
  eip712: { title: "EIP-712: Typed structured data hashing and signing", url: "https://eips.ethereum.org/EIPS/eip-712", publisher: EIPS },
  eip155: { title: "EIP-155: Simple replay attack protection", url: "https://eips.ethereum.org/EIPS/eip-155", publisher: EIPS },
  eip2: { title: "EIP-2: Homestead Hard-fork Changes", url: "https://eips.ethereum.org/EIPS/eip-2", publisher: EIPS },
  eip2612: { title: "ERC-2612: Permit Extension for EIP-20 Signed Approvals", url: "https://eips.ethereum.org/EIPS/eip-2612", publisher: EIPS },
  caip2: { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  rfc9110: { title: "RFC 9110: HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110", publisher: "IETF" },
});

/** Wire-level V1 → V2 rows, shared by /learn/what-is-x402 and /learn/x402-v1-to-v2-migration. */
export function versionRows(html) {
  return [
    { label: "Payment terms", values: ["JSON body of the 402 response", html`<code>PAYMENT-REQUIRED</code> header, Base64 JSON`] },
    { label: "Client payment header", values: [html`<code>X-PAYMENT</code>`, html`<code>PAYMENT-SIGNATURE</code>`] },
    { label: "Settlement header", values: [html`<code>X-PAYMENT-RESPONSE</code>`, html`<code>PAYMENT-RESPONSE</code>`] },
    { label: "Network identifiers", values: [html`Names such as <code>base-sepolia</code>`, html`CAIP-2, such as <code>eip155:84532</code>`] },
    { label: "Amount field", values: [html`<code>maxAmountRequired</code>`, html`<code>amount</code>`] },
    { label: "Resource description", values: [html`<code>resource</code> URL inside each requirement`, html`One top-level <code>resource</code> object`] },
    { label: "Chosen option in the payload", values: ["Scheme and network only", html`The full requirement, in <code>accepted</code>`] },
    { label: "Extensions", values: [false, html`<code>extensions</code> object`] },
  ];
}

/** Renders `body` only when the page at `path` exists, so links to pages owned elsewhere never break the build. */
export const ifPage = (ctx, path, body) => (ctx.find(path) ? body : "");
