// Illustrative Base Sepolia policy. Replace every constraint with reviewed values.
import { createSettlensClient } from "../src/client.js";
const [url] = process.argv.slice(2);
if (!url || !url.startsWith("https://")) throw new Error("Provide an explicitly selected HTTPS paid resource.");
const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
await response.body?.cancel();
if (response.status !== 402) throw new Error("The resource did not return HTTP 402.");
const client = createSettlensClient();
const result = await client.callTool("evaluate_payment_requirements", {
  payment_required: response.headers.get("payment-required"), resource_url: url,
  policy: { schemes: ["exact"], networks: ["eip155:84532"], assets: ["0x036CbD53842c5426634e7929541eC2318f3dCF7e"], pay_to: ["0x1111111111111111111111111111111111111111"], max_amount: "10000" },
});
console.log(JSON.stringify({ decision: result.decision, reasons: result.reasons }, null, 2));
// This example stops here. Your payment implementation must choose an acceptable option.
