const fail = (status, message) => Object.assign(new Error(message), { status });
export function validatePricePolicy(value = { mode: "fixed" }) {
  if (!value || !["fixed", "range"].includes(value.mode) || Object.keys(value).some((key) => !["mode", "minAmount", "maxAmount"].includes(key))) throw fail(400, "Invalid price policy.");
  if (value.mode === "fixed") {
    if (value.minAmount !== undefined || value.maxAmount !== undefined) throw fail(400, "A fixed price policy cannot contain bounds.");
    return { mode: "fixed" };
  }
  if (![value.minAmount, value.maxAmount].every((amount) => typeof amount === "string" && /^[0-9]{1,80}$/.test(amount)) || BigInt(value.minAmount) > BigInt(value.maxAmount)) throw fail(400, "Price bounds must be ordered atomic-unit integers of at most 80 digits.");
  return { mode: "range", minAmount: value.minAmount, maxAmount: value.maxAmount };
}
