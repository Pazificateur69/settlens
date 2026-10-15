// Small dependency-free client for Settlens' stateless JSON-response MCP endpoint.
// Private pilot distribution; this is not a published npm package.
import { readBoundedResponseBody } from "./utils.js";
const TOOLS = new Set(["evaluate_payment_requirements", "verify_payment_signature", "verify_solana_transaction", "verify_report", "verify_attestation", "list_checks", "scan_endpoint", "scan_facilitator"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
async function discardBody(response) { try { await response.body?.cancel(); } catch { /* Do not surface transport diagnostics. */ } }
function validContent(name, value) {
  if (!object(value)) return false;
  if (!["evaluate_payment_requirements", "scan_endpoint"].includes(name)) return true;
  if (!["pay", "review", "do_not_pay"].includes(value.decision) || typeof value.summary !== "string" || !Array.isArray(value.reasons) || !value.reasons.every((reason) => typeof reason === "string") || !Array.isArray(value.acceptable) || value.acceptable.length > 32 || !value.acceptable.every((option) => object(option) && ["scheme", "network", "asset", "payTo"].every((field) => typeof option[field] === "string" && option[field].length > 0) && typeof option.amount === "string" && /^[0-9]{1,78}$/.test(option.amount) && BigInt(option.amount) > 0n && Number.isSafeInteger(option.maxTimeoutSeconds) && option.maxTimeoutSeconds > 0)) return false;
  if (value.decision === "pay" && value.acceptable.length === 0) return false;
  if (value.decision === "do_not_pay" && value.acceptable.length !== 0) return false;
  const checks = name === "scan_endpoint" ? value.issues : value.checks;
  if (!Array.isArray(checks) || (name === "evaluate_payment_requirements" && checks.length === 0) || !checks.every((check) => object(check) && ["pass", "warn", "fail", "skip"].includes(check.status) && ["info", "low", "medium", "high", "critical"].includes(check.severity))) return false;
  return value.decision !== "pay" || !checks.some((check) => check.status === "fail" && ["high", "critical"].includes(check.severity));
}
export function createSettlensClient({ url = "https://settlens.com/mcp", apiToken, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) throw new Error("Use an HTTPS MCP endpoint without URL credentials or query parameters (HTTP loopback is allowed for tests).");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("Client timeout must be 1000–30000 ms.");
  let sequence = 0;
  return {
    async callTool(name, args = {}) {
      if (!TOOLS.has(name)) throw new Error("Unknown Settlens tool.");
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object.");
      const id = ++sequence;
      const headers = { "content-type": "application/json", accept: "application/json", "mcp-protocol-version": "2025-06-18" };
      if (apiToken) headers.authorization = `Bearer ${apiToken}`;
      let response;
      try { response = await fetchImpl(endpoint.toString(), { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }), redirect: "error", signal: AbortSignal.timeout(timeoutMs) }); }
      catch { throw new Error("Settlens request failed or timed out."); }
      if (!response.ok) { await discardBody(response); throw new Error(`Settlens returned HTTP ${response.status}.`); }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) { await discardBody(response); throw new Error("Expected a JSON MCP response."); }
      let data;
      try { data = await readBoundedResponseBody(response); }
      catch { throw new Error("Settlens response could not be read or timed out."); }
      if (data.truncated) throw new Error("Settlens response exceeded the size limit.");
      let message;
      try { message = JSON.parse(data.buffer.toString("utf8")); }
      catch { throw new Error("Invalid JSON MCP response."); }
      if (message?.id !== id || message?.jsonrpc !== "2.0" || message.error || message.result?.isError || !validContent(name, message.result?.structuredContent)) throw new Error("Settlens rejected the tool call or returned an invalid response.");
      return message.result.structuredContent;
    },
  };
}
