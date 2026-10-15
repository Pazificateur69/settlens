// Public example: node x402-policy-regression.cjs x402-policy-cases.json
// Synthetic fixture checks, not a scan of a deployed merchant or a settlement test.
const { readFile } = require("node:fs/promises");

async function main() {
  const cases = JSON.parse(await readFile(process.argv[2] || "x402-policy-cases.json", "utf8"));
  if (!Array.isArray(cases) || !cases.length) throw new Error("Expected a non-empty array of reviewed cases.");
  for (const example of cases) {
    const response = await fetch("https://settlens.com/mcp", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", accept: "application/json", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
        name: "evaluate_payment_requirements", arguments: example.arguments,
      } }),
    });
    if (!response.ok) throw new Error(`Evaluator unavailable (HTTP ${response.status}).`);
    const message = await response.json();
    const result = message.result?.structuredContent;
    if (message.error || message.result?.isError || !result) throw new Error("Evaluator returned an error.");
    if (result.decision !== example.expected) throw new Error(`${example.name}: expected ${example.expected}, got ${result.decision}.`);
    console.log(`${example.name}: ${result.decision}`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
