// Compare payment terms across runs without storing server-controlled values.
import { sha256, stableStringify, withoutEphemeralFields } from "./utils.js";
const FIELDS = ["scheme", "network", "asset", "payTo", "amount", "maxTimeoutSeconds", "extra"];
const digest = (value) => sha256(stableStringify(value));
export function paymentTermsSnapshot(required, { includeValues = false } = {}) {
  if (!required || !Array.isArray(required.accepts)) return null;
  const options = required.accepts.map((entry) => Object.fromEntries(
    FIELDS.map((field) => [field, withoutEphemeralFields(entry?.[field] ?? null)]),
  ));
  const fields = Object.fromEntries(FIELDS.map((field) => [field,
    digest(options.map((entry) => stableStringify(entry[field])).sort()),
  ]));
  fields.resource = digest(required.resource?.url ?? null);
  fields.version = digest(required.x402Version ?? null);
  const snapshot = { digest: digest({ fields, options: options.map(stableStringifyOption).sort() }), fields };
  if (includeValues) {
    snapshot.bindingWithoutAmount = digest(options.map(({ amount, ...rest }) => stableStringify(rest)).sort());
    snapshot.valuesComplete = options.length <= 32;
    snapshot.values = options.slice(0, 32).map((entry) => Object.fromEntries(["scheme", "network", "asset", "payTo", "amount", "maxTimeoutSeconds"].map((field) => {
      const value = entry[field];
      const safe = field === "maxTimeoutSeconds" ? Number.isSafeInteger(value) && value > 0 : typeof value === "string" && value.length <= 128 && (field === "amount" ? /^[0-9]{1,80}$/.test(value) : field === "network" ? /^[a-z0-9-]+:[a-zA-Z0-9-]+$/.test(value) : field === "scheme" ? /^[a-zA-Z0-9_-]+$/.test(value) : /^(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value));
      return [field, safe ? value : "[unavailable]"];
    })));
  }
  return snapshot;
}
function stableStringifyOption(value) { return stableStringify(value); }
export function diffPaymentTerms(previous, current) {
  if (!previous || !current || previous.digest === current.digest) return [];
  let changed = Object.keys(current.fields).filter((field) => previous.fields[field] !== current.fields[field]);
  if (!changed.length) changed = ["options"]; // Rebinding fields between options also matters.
  return changed.map((field) => ({
    kind: "terms", id: `terms.${field}`, field,
    severity: ["extra", "maxTimeoutSeconds"].includes(field) ? "medium" : "high",
    title: `Advertised payment ${field} changed`,
    from: previous.fields[field] ?? previous.digest,
    to: current.fields[field] ?? current.digest,
    ...(previous.values && current.values ? { before: previous.values, after: current.values } : {}),
    recommendation: "Review the new payment terms against the approved policy before accepting the change.",
  }));
}
