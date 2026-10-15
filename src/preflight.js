/* Offline "should I pay?" evaluation of an x402 PaymentRequired object.
 *
 * Reuses the scanner's content checks (checks.js) and policy validation
 * (config.js); this module only decodes the input and turns checks into a
 * pay / review / do_not_pay decision. It never sends a request or a payment.
 *
 * An agent pays with ONE advertised option, so the server's terms (schema,
 * binding, freshness) are judged as a whole and the policy per option. The CLI
 * scan keeps its stricter rule: every advertised option must be allowed.
 */
import { MAX_HEADER_LENGTH } from "./constants.js";
import {
  makeCheck,
  paymentRequiredChecks,
  paymentRequiredEncodingCheck,
  policyChecks,
} from "./checks.js";
import { validateExpected } from "./config.js";
import { assertJsonDepth, decodeBase64Json, validateRequirement } from "./protocol.js";
import { agentText, isPlainObject } from "./utils.js";

const POLICY_KEYS = new Set(["maxAmount", "networks", "schemes", "payTo", "assets"]);
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
// Agent-facing (MCP) name of each per-constraint policy check.
const CONSTRAINTS = Object.freeze({
  "policy.scheme": "schemes",
  "policy.network": "networks",
  "policy.recipient": "pay_to",
  "policy.asset": "assets",
  "policy.maximum_amount": "max_amount",
});
const MAX_MESSAGE_LENGTH = 300;
const LIST = new Intl.ListFormat("en", { type: "conjunction" });

// Maps an agent spending policy onto the scanner's `expected` shape and
// validates it with the same rules as a configuration file.
export function policyToExpected(policy = {}, resourceUrl) {
  if (!isPlainObject(policy)) {
    throw new Error("policy must be an object.");
  }
  const unknown = Object.keys(policy).filter((key) => !POLICY_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`policy contains unsupported field(s): ${unknown.join(", ")}.`);
  }
  const expected = Object.fromEntries(
    Object.entries({ resourceUrl, ...policy }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  validateExpected(expected, "policy");
  return expected;
}

function readPaymentRequired(input) {
  let size;
  try {
    // Depth first: JSON.stringify recurses, and an object can nest deeper than the stack.
    size =
      typeof input === "string"
        ? input.length
        : JSON.stringify(assertJsonDepth(input ?? null)).length;
  } catch (error) {
    return { checks: [paymentRequiredEncodingCheck(error)] };
  }
  if (size > MAX_HEADER_LENGTH) {
    return {
      checks: [
        paymentRequiredEncodingCheck(
          new Error(`PAYMENT-REQUIRED exceeds ${MAX_HEADER_LENGTH} characters.`),
        ),
      ],
    };
  }
  if (isPlainObject(input)) {
    return { paymentRequired: input, checks: [] };
  }
  if (typeof input !== "string") {
    throw new Error(
      "paymentRequired must be the PAYMENT-REQUIRED header value, a JSON string or an object.",
    );
  }
  const text = input.trim();
  if (text.startsWith("{")) {
    try {
      return { paymentRequired: assertJsonDepth(JSON.parse(text)), checks: [] };
    } catch (error) {
      return {
        checks: [
          paymentRequiredEncodingCheck(
            error instanceof SyntaxError ? new Error("The value is not valid JSON.") : error,
          ),
        ],
      };
    }
  }
  try {
    return {
      paymentRequired: decodeBase64Json(text),
      checks: [paymentRequiredEncodingCheck()],
    };
  } catch (error) {
    return { checks: [paymentRequiredEncodingCheck(error)] };
  }
}

// Applies the policy to each advertised option. Returns one summary check per
// policy constraint (pass: every option complies, warn: some do not, fail:
// none does; informational, decide() ignores them), the
// policy.acceptable_option check, and the options that are well formed and
// satisfy every constraint.
export function evaluateOptions(paymentRequired, expected = {}) {
  const options = Array.isArray(paymentRequired?.accepts) ? paymentRequired.accepts : [];
  const perOption = options.map((entry) => policyChecks([entry], expected));
  const summaries = (perOption[0] ?? []).map(({ id, title, severity }, index) => {
    const label = `the ${CONSTRAINTS[id]} policy`;
    const violating = perOption.filter((checks) => checks[index].status !== "pass").length;
    const status =
      violating === 0 ? "pass" : violating === options.length ? "fail" : "warn";
    return makeCheck({
      id,
      title,
      status,
      severity: status === "warn" ? "info" : severity,
      message: {
        pass: `All ${options.length} payment option(s) satisfy ${label}.`,
        warn: `${violating} of ${options.length} payment option(s) violate ${label}; they are left out of acceptable.`,
        fail: `All ${options.length} payment option(s) violate ${label}.`,
      }[status],
    });
  });

  const rejections = options.map((entry, index) => [
    ...(validateRequirement(entry, index).length > 0 ? ["malformed"] : []),
    ...perOption[index]
      .filter(({ status }) => status !== "pass")
      .map(({ id }) => CONSTRAINTS[id]),
  ]);
  const acceptable = options.filter((_, index) => rejections[index].length === 0);
  const tally = new Map();
  for (const name of rejections.flat()) {
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const rejected = options.length - acceptable.length;
  const why = [...tally].map(([name, count]) => `${name}: ${count}`).join(", ");

  return {
    acceptable,
    checks: [
      ...summaries,
      makeCheck({
        id: "policy.acceptable_option",
        title: "At least one payment option satisfies the policy",
        status: acceptable.length > 0 ? "pass" : "fail",
        severity: "high",
        message:
          options.length === 0
            ? "No payment option is advertised."
            : `${acceptable.length} of ${options.length} payment option(s) satisfy the policy${
                rejected > 0 ? `; ${rejected} rejected (${why})` : ""
              }.`,
        recommendation:
          acceptable.length > 0
            ? undefined
            : "Do not pay. Ask the merchant for terms within your policy or change the policy deliberately.",
      }),
    ],
  };
}

// Check messages may carry server-controlled values: one bounded line only.
function reason(check) {
  return `${check.id}: ${agentText(check.message, MAX_MESSAGE_LENGTH)}`;
}

// Decision rule of the agent preflight (evaluate_payment_requirements,
// scan_endpoint). The per-constraint policy summaries are informational: the
// policy enters the decision only through policy.acceptable_option.
export function decide(checks, policy = {}) {
  const deciding = checks.filter(({ id }) => !Object.hasOwn(CONSTRAINTS, id));
  const blocking = deciding.filter(
    ({ status, severity }) =>
      status === "fail" && BLOCKING_SEVERITIES.has(severity),
  );
  if (blocking.length > 0) {
    return {
      decision: "do_not_pay",
      summary: `Do not pay: ${blocking.length} blocking problem(s) found.`,
      reasons: blocking.map(reason),
    };
  }
  const concerns = deciding.filter(
    ({ status }) => status === "fail" || status === "warn",
  );
  if (concerns.length > 0) {
    return {
      decision: "review",
      summary: `Ask a human before paying: ${concerns.length} issue(s) need review.`,
      reasons: concerns.map(reason),
    };
  }
  if (
    !deciding.some(
      ({ id, status }) => id === "policy.acceptable_option" && status === "pass",
    )
  ) {
    return {
      decision: "review",
      summary: "Ask a human before paying: no payment option was evaluated against the policy.",
      reasons: ["No payment option was evaluated against the policy."],
    };
  }
  const missing = [
    !policy.payTo?.length && "allowed recipients (pay_to)",
    !policy.assets?.length && "allowed assets (assets)",
    // The same token address can mean another contract on another chain.
    !policy.networks?.length && "allowed networks (networks)",
    policy.maxAmount === undefined && "a maximum amount in atomic units (max_amount)",
  ].filter(Boolean);
  if (missing.length > 0) {
    return {
      decision: "review",
      summary:
        "Ask a human before paying: the spending policy does not bound the recipient, the asset, the network and the amount.",
      reasons: [
        `The spending policy is incomplete: set ${LIST.format(missing)} to allow an automatic pay decision.`,
      ],
    };
  }
  return {
    decision: "pay",
    summary:
      "Every protocol check passed and at least one payment option is within the allowed recipients, assets, networks and maximum amount. Pay only with an option listed in acceptable.",
    reasons: [],
  };
}

export function publicCheck({ id, title, status, severity, message, recommendation }) {
  return {
    id,
    title,
    status,
    severity,
    message: agentText(message, MAX_MESSAGE_LENGTH),
    ...(recommendation ? { recommendation } : {}),
  };
}

export function evaluatePaymentRequired({
  paymentRequired,
  resourceUrl,
  policy = {},
} = {}) {
  const expected = policyToExpected(policy, resourceUrl);
  const parsed = readPaymentRequired(paymentRequired);
  const checks = [...parsed.checks];
  let acceptable = [];

  if (parsed.paymentRequired !== undefined) {
    const advertised = parsed.paymentRequired?.resource?.url;
    // No policy here: the server's terms are judged as a whole, the policy per option.
    checks.push(
      ...paymentRequiredChecks({
        paymentRequired: parsed.paymentRequired,
        target: { url: resourceUrl ?? advertised },
      }).map((check) =>
        check.id === "binding.resource_url" && resourceUrl === undefined
          ? makeCheck({
              ...check,
              status: "warn",
              severity: "medium",
              message:
                "No resource URL was provided, so resource.url could not be compared with the URL you requested.",
              recommendation:
                "Provide the exact URL you requested so the payment binding can be confirmed.",
            })
          : check,
      ),
    );
    const options = evaluateOptions(parsed.paymentRequired, expected);
    checks.push(...options.checks);
    acceptable = options.acceptable;
  }

  const verdict = decide(checks, expected);
  return {
    ...verdict,
    // Never offer a payment option when the answer is do_not_pay.
    acceptable: verdict.decision === "do_not_pay" ? [] : acceptable,
    checks: checks.map(publicCheck),
  };
}
