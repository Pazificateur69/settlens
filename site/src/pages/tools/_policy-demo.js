import { SCENARIOS } from "./x402-checker.js";
import { runTool } from "./_shared.js";

export const CASES = SCENARIOS.map(({ label, expect, sample }) => ({
  name: label,
  expected: expect,
  arguments: {
    payment_required: JSON.parse(Buffer.from(sample.payment_required, "base64").toString("utf8")),
    resource_url: sample.resource_url,
    policy: Object.fromEntries(["pay_to", "assets", "networks", "schemes", "max_amount"]
      .filter((key) => sample[key])
      .map((key) => [key, key === "max_amount" ? sample[key] : sample[key].split(", ")])),
  },
}));

export const RESULTS = await Promise.all(CASES.map(async (example) => {
  const result = await runTool("evaluate_payment_requirements", example.arguments);
  if (result.decision !== example.expected) throw new Error(`Public policy demo: ${example.name} changed.`);
  return result;
}));
