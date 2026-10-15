#!/usr/bin/env node

import { basename, relative, resolve, sep } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  assertCredentialHosts,
  loadConfig,
  normalizeFacilitator,
  normalizeTarget,
} from "./config.js";
import { SEVERITY_RANK, VERSION } from "./constants.js";
import { scanFacilitator } from "./facilitator.js";
import {
  createReport,
  scanTarget,
  verifyReportIntegrity,
} from "./scanner.js";
import {
  verifyExactEvmPayment,
  verifySolanaTransaction,
} from "./signature.js";
import { approveReference, updateIncident } from "./monitor-lifecycle.js";
import { drainNotifications, publicDeliveries, retryNotification } from "./notification-queue.js";
import { monitorTargets, stateKey } from "./monitor.js";
import { MonitorStore, readJsonFile, withMonitorLock, writeJsonAtomic, verifyHistoryEntry } from "./monitor-store.js";
import { deliverMonitorWebhook } from "./monitor-webhook.js";
import { renderHistoryHtml } from "./monitor-report.js";
import { createEmailNotifications } from "./notifications.js";
import { evaluatePaymentRequired } from "./preflight.js";
import { unixSeconds } from "./utils.js";
import { createMcpServer } from "./mcp.js";
import { runStdioServer } from "./mcp-stdio.js";
import {
  attestReport,
  generateEvidenceKeypair,
  verifyAttestation,
} from "./evidence.js";
import {
  renderConsole,
  shouldFail,
  writeReports,
} from "./reporters.js";

const HELP = `Settlens ${VERSION} — security assurance for agentic payments

Usage:
  settlens scan <url> [options]
  settlens facilitator <base-url> [options]
  settlens check --config <file> [options]
  settlens preflight <payment-required.txt> --policy <policy.json> --resource-url <url>
  settlens verify-report <report.json>
  settlens verify-payment <payment.json> [--now <unix-seconds|ISO-8601>]
  settlens monitor --config <file> [--state <file>] [--webhook <url>]
  settlens history --history <journal.json> [--format json|html] [--out <file>]
  settlens reference --history <journal.json> --target <url> --digest <reviewed-digest>
  settlens incidents --history <journal.json> [--incident <id> --status open|acknowledged --comment <text>]
  settlens notifications --history <journal.json> [--retry <id>] [--webhook <url>]
  settlens evidence keygen [--out <key.pem>]
  settlens evidence attest <report.json> --key <key.pem> [--out <file>]
  settlens evidence verify <attestation.json> [--report <report.json>] [--expect-key <public-key.pem>]
  settlens mcp
  settlens --help

Options:
  --method <verb>           HTTP method (default: GET)
  --name <label>            Human-readable target name
  --header <name:value>     Add a request header; repeatable
  --allow-host <hostname>   Permit custom headers to this exact host; repeatable
  --body <json-or-text>     Request body
  --facilitator <base-url>  Cross-check requirements with GET /supported
  --timeout <ms>            Per-request timeout (default: 8000)
  --repeat <count>          Passive samples used for drift detection (default: 2)
  --expect-scheme <value>   Allowed scheme; repeatable or comma-separated
  --expect-network <value>  Allowed CAIP-2 network; repeatable or comma-separated
  --expect-pay-to <value>   Allowed recipient; repeatable or comma-separated
  --expect-asset <value>    Allowed asset; repeatable or comma-separated
  --policy <file>          Local agent policy (payTo, assets, networks, maxAmount)
  --resource-url <url>     Exact requested URL for offline preflight
  --max-amount <atomic>     Maximum advertised atomic token amount
  --active                  Send one intentionally invalid payment probe
  --authorized              Confirm the endpoint owner authorized active testing
  --authorization-ref <id>  Approval ticket/email/scope reference for active mode
  --out <directory>         Report directory (default: reports)
  --format <list>           json,html,sarif (default: json,html,sarif)
  --fail-on <severity>      low|medium|high|critical|none (default: high)
  --no-write                Do not create report files
  --history <file>          Persistent monitor journal with bounded history
  --webhook-secret-env <name>  Environment variable containing the signing secret

Safety:
  Passive mode never sends PAYMENT-SIGNATURE. Active mode requires --active,
  --authorized and --authorization-ref, uses no private key, and never calls
  /settle.

MCP:
  settlens mcp serves Settlens to AI agents (Claude Desktop, Claude Code, any
  MCP client) over stdio. Agents call evaluate_payment_requirements on every
  HTTP 402 before paying. Network tools are passive only. See docs/MCP.md.
`;

function parseArguments(args) {
  const positionals = [];
  const values = new Map();
  const booleans = new Set();
  const repeatable = new Set([
    "header",
    "allow-host",
    "expect-scheme",
    "expect-network",
    "expect-pay-to",
    "expect-asset",
  ]);
  const booleanFlags = new Set([
    "active",
    "authorized",
    "no-write",
    "help",
    "version",
  ]);
  const valueFlags = new Set([
    "method",
    "name",
    "header",
    "allow-host",
    "body",
    "facilitator",
    "timeout",
    "repeat",
    "expect-scheme",
    "expect-network",
    "expect-pay-to",
    "expect-asset",
    "max-amount",
    "out",
    "format",
    "fail-on",
    "config",
    "authorization-ref",
    "state",
    "history",
    "target", "digest", "incident", "status", "comment", "retry",
    "webhook-secret-env",
    "webhook",
    "key",
    "report",
    "now",
    "expect-key",
    "policy",
    "resource-url",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    const key = argument.slice(2);
    if (booleanFlags.has(key)) {
      booleans.add(key);
      continue;
    }
    if (!valueFlags.has(key)) {
      throw new Error(`Unknown option --${key}.`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }
    index += 1;
    if (repeatable.has(key)) {
      values.set(key, [...(values.get(key) ?? []), value]);
    } else {
      values.set(key, value);
    }
  }

  return { positionals, values, booleans };
}

function parseList(values, key) {
  return (values.get(key) ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseHeaders(values) {
  const result = {};
  for (const header of values.get("header") ?? []) {
    const separator = header.indexOf(":");
    if (separator <= 0) {
      throw new Error(`Invalid --header "${header}". Use "Name: value".`);
    }
    result[header.slice(0, separator).trim()] = header
      .slice(separator + 1)
      .trim();
  }
  return result;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function formatsFrom(values) {
  const formats = (values.get("format") ?? "json,html,sarif")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (formats.some((format) => !["json", "html", "sarif"].includes(format))) {
    throw new Error("--format supports only json, html and sarif.");
  }
  return formats;
}

async function scanAll(targets, options) {
  const results = [];
  for (const target of targets) {
    results.push(await scanTarget(target, options));
  }
  return results;
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const command = args[0];
  const parsed = parseArguments(args.slice(1));
  const active = parsed.booleans.has("active");
  const authorized = parsed.booleans.has("authorized");
  if (active && !authorized) {
    throw new Error(
      "Active testing requires --authorized to confirm explicit owner approval.",
    );
  }
  if (active && !parsed.values.get("authorization-ref")) {
    throw new Error(
      "Active testing requires --authorization-ref with a traceable owner approval reference.",
    );
  }
  if (authorized && !active) {
    throw new Error("--authorized is only meaningful together with --active.");
  }

  let targets;
  let defaultOutput = "reports";
  let defaultFailOn = "high";
  let metadata = {};
  let sarifOptions = {};
  const allowedHosts = [
    ...parseList(parsed.values, "allow-host"),
    ...(process.env.SETTLENS_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  ];

  if (command === "mcp") {
    // stdout carries MCP protocol messages only; nothing else may be printed.
    await runStdioServer({
      server: createMcpServer({ mode: "local", allowNetworkTools: true }),
    });
    return 0;
  }

  if (command === "verify-report") {
    const filePath = parsed.positionals[0];
    if (!filePath) {
      throw new Error("verify-report requires a Settlens JSON report.");
    }
    const report = JSON.parse(await readFile(filePath, "utf8"));
    const verification = verifyReportIntegrity(report);
    process.stdout.write(
      `${verification.valid ? "VALID" : "INVALID"} ${verification.reason}\n`,
    );
    if (verification.expected) {
      process.stdout.write(`Expected: ${verification.expected}\n`);
      process.stdout.write(`Actual:   ${verification.actual}\n`);
    }
    return verification.valid ? 0 : 1;
  }

  if (command === "verify-payment") {
    const filePath = parsed.positionals[0];
    if (!filePath) {
      throw new Error(
        "verify-payment requires a JSON file containing { requirement, payload }.",
      );
    }
    const input = JSON.parse(await readFile(filePath, "utf8"));
    const requirement = input.requirement ?? input.paymentRequirements;
    const payload =
      input.payload ?? input.paymentPayload?.payload ?? input.paymentPayload;
    if (!requirement || !payload) {
      throw new Error(
        "The file must contain a payment requirement and a payment payload.",
      );
    }
    const network = String(requirement.network);
    let result;
    if (/^eip155:\d+$/.test(network)) {
      const checkedAt = unixSeconds(parsed.values.get("now"));
      result = verifyExactEvmPayment({ requirement, payload, now: checkedAt });
      process.stdout.write(
        `${result.verified ? "VERIFIED" : "REJECTED"} exact EVM payment authorization\n`,
      );
      if (result.recovered) {
        process.stdout.write(`Recovered signer: ${result.recovered}\n`);
      }
      process.stdout.write(`Signature valid:  ${result.signatureValid}\n`);
      process.stdout.write(`Recipient bound:  ${result.recipientBound}\n`);
      process.stdout.write(`Amount bound:     ${result.amountBound}\n`);
      process.stdout.write(`Within window:    ${result.fresh} (at ${checkedAt})\n`);
    } else if (/^solana:/.test(network)) {
      const transaction =
        typeof payload.transaction === "string" ? payload.transaction : payload;
      if (typeof transaction !== "string") {
        throw new Error(
          "The Solana payload must contain a base64 transaction string.",
        );
      }
      const hasPaymentTerms = ["asset", "amount", "payTo", "maxTimeoutSeconds", "extra"].some((field) => Object.hasOwn(requirement, field));
      if (hasPaymentTerms && (!requirement.asset || !requirement.amount || !requirement.payTo || !requirement.extra?.feePayer)) {
        throw new Error("Complete Solana payment terms require asset, amount, payTo and extra.feePayer; partial terms cannot fall back to signature-only verification.");
      }
      result = verifySolanaTransaction(transaction, hasPaymentTerms ? requirement : undefined, input.policy ?? {});
      let verdict = result.verified ? "VERIFIED" : "REJECTED";
      if (result.payment) verdict = result.payment.verified ? "VERIFIED" : result.payment.status === "unverified" ? "UNVERIFIED" : "REJECTED";
      process.stdout.write(`${verdict} ${result.payment ? "offline Solana payment instructions" : "Solana signatures only"} (${result.version})\n`);
      if (!result.payment) process.stdout.write("Payment terms were not provided; amount, recipient, asset and execution are not checked.\n");
      process.stdout.write(
        `Fee payer:        ${result.feePayer}${result.feePayerPending ? " (signature pending: added by the facilitator at settlement)" : ""}\n`,
      );
      for (const [index, signer] of (result.signers ?? []).entries()) {
        process.stdout.write(`Signer ${index}:         ${signer.publicKey} ${signer.status}\n`);
      }
      process.stdout.write(`Signatures valid: ${result.signatureValid}\n`);
      if (result.payment) process.stdout.write(`Offline payment profile: ${result.payment.status}\n${result.payment.limitations.join("; ")}\n`);
    } else {
      throw new Error(
        "verify-payment supports the exact EVM (eip155) and Solana schemes.",
      );
    }
    if (result.reasons?.length > 0) {
      process.stdout.write(
        `Reasons:\n${result.reasons.map((reason) => `  - ${reason}`).join("\n")}\n`,
      );
    }
    return result.verified && (!result.payment || result.payment.verified) ? 0 : 1;
  }

  if (command === "preflight") {
    const inputPath = parsed.positionals[0];
    const policyPath = parsed.values.get("policy");
    const resourceUrl = parsed.values.get("resource-url");
    if (!inputPath || !policyPath || !resourceUrl) throw new Error("preflight requires an input file, --policy and --resource-url.");
    const result = evaluatePaymentRequired({ paymentRequired: await readFile(inputPath, "utf8"), policy: JSON.parse(await readFile(policyPath, "utf8")), resourceUrl });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.decision === "pay" ? 0 : 1;
  }

  if (command === "history") {
    const path = parsed.values.get("history");
    if (!path) throw new Error("history requires --history <journal.json>.");
    const { history } = await new MonitorStore(path).read();
    if (!history.every(verifyHistoryEntry)) throw new Error("Monitor history integrity check failed.");
    const format = parsed.values.get("format") ?? "json";
    if (!["json", "html"].includes(format)) throw new Error("history supports json or html.");
    const output = format === "json" ? `${JSON.stringify(history, null, 2)}\n` : renderHistoryHtml(history);
    const out = parsed.values.get("out");
    if (out) await writeFile(out, output, { mode: 0o600 });
    else process.stdout.write(output);
    return 0;
  }

  if (["reference", "incidents", "notifications"].includes(command)) {
    const path = parsed.values.get("history");
    if (!path) throw new Error(`${command} requires --history <journal.json>.`);
    const store = new MonitorStore(path);
    let output;
    if (command === "reference") {
      const targetUrl = parsed.values.get("target"); const reviewedDigest = parsed.values.get("digest");
      if (!targetUrl || !reviewedDigest) throw new Error("reference requires --target <url> and --digest <reviewed-digest>.");
      output = await store.update((journal) => {
        const target = journal.targets.find((entry) => entry.url === targetUrl) ?? { url: targetUrl };
        return approveReference(journal, target, reviewedDigest);
      });
    } else if (command === "incidents") {
      const id = parsed.values.get("incident");
      if (id) await store.update((journal) => updateIncident(journal, id, { ...(parsed.values.has("status") ? { status: parsed.values.get("status") } : {}), ...(parsed.values.has("comment") ? { comment: parsed.values.get("comment") } : {}) }));
      else if (parsed.values.has("status") || parsed.values.has("comment")) throw new Error("Incident updates require --incident <id>.");
      output = (await store.read()).incidents;
    } else {
      if (parsed.values.has("retry")) await store.update((journal) => retryNotification(journal, parsed.values.get("retry")));
      const email = createEmailNotifications();
      const secretEnv = parsed.values.get("webhook-secret-env");
      if (secretEnv && !process.env[secretEnv]) { email?.close(); throw new Error("Webhook signing environment variable is empty."); }
      try {
        await drainNotifications(store, (job) => job.kind === "monitor.email" && email ? email.monitor(job.payload.runs, job.payload.failOn) : job.kind === "monitor.webhook" && parsed.values.has("webhook") ? deliverMonitorWebhook(parsed.values.get("webhook"), job.payload.runs, { secret: secretEnv ? process.env[secretEnv] : undefined, failOn: job.payload.failOn, eventId: job.id }) : { delivered: false }, { kinds: [...(email ? ["monitor.email"] : []), ...(parsed.values.has("webhook") ? ["monitor.webhook"] : [])] });
      } finally { email?.close(); }
      output = publicDeliveries((await store.read()).outbox);
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); return 0;
  }

  if (command === "monitor") {
    const configPath = parsed.values.get("config");
    if (!configPath) {
      throw new Error("monitor requires --config <file>.");
    }
    const config = await loadConfig(configPath);
    assertCredentialHosts(config.targets, allowedHosts);
    const failOn = parsed.values.get("fail-on") ?? config.failOn ?? "high";
    if (!["low", "medium", "high", "critical", "none"].includes(failOn)) {
      throw new Error(
        `Invalid --fail-on "${failOn}". Use low, medium, high, critical or none.`,
      );
    }
    const secretEnv = parsed.values.get("webhook-secret-env");
    if (secretEnv && !process.env[secretEnv]) throw new Error("Webhook signing environment variable is empty.");
    const statePath = parsed.values.get("state");
    const historyPath = parsed.values.get("history");
    if (statePath && historyPath) throw new Error("Use either --state or --history; the journal already persists the baseline.");
    const timeoutMs = parsed.values.has("timeout")
      ? parsePositiveInteger(parsed.values.get("timeout"), "--timeout")
      : undefined;
    const execute = async () => {
      const previousState = statePath ? await readJsonFile(statePath, {}) : {};
      if (!previousState || typeof previousState !== "object" || Array.isArray(previousState)) throw new Error("Invalid monitor baseline format.");
      const result = await monitorTargets(config.targets, previousState, { timeoutMs });
      if (statePath) await writeJsonAtomic(statePath, result.state);
      return result;
    };
    const webhook = parsed.values.get("webhook");
    const emailNotifications = createEmailNotifications();
    const journalStore = historyPath ? new MonitorStore(historyPath) : null;
    let result;
    try {
      result = historyPath
      ? await journalStore.run(config.targets, { timeoutMs, failOn, notificationKinds: [...(emailNotifications ? ["monitor.email"] : []), ...(webhook ? ["monitor.webhook"] : [])] })
      : statePath ? await withMonitorLock(statePath, execute) : await execute();
    } catch (error) { emailNotifications?.close(); throw error; }
    const { runs } = result;
    if (historyPath) for (const run of runs) run.alerts = (run.events ?? []).filter((event) => event.kind !== "resolved");

    // An alert (regression, new fail/warn, or removed check = coverage loss)
    // blocks when its check severity is at or above --fail-on, the same rule
    // as `check`; below it, it is printed as a note. "none" never blocks.
    const threshold = failOn === "none" ? Infinity : SEVERITY_RANK[failOn];
    const describe = (alert) =>
      alert.kind === "terms" ? "payment terms changed (fingerprints recorded)" : alert.kind === "removed"
        ? `removed (was ${alert.status}): coverage lost`
        : alert.kind === "regression"
          ? `${alert.from} -> ${alert.to}`
          : `new ${alert.status}`;
    let alerting = 0;
    for (const run of runs) {
      process.stdout.write(`\n${run.name} (${run.method} ${run.url})\n`);
      if (run.firstRun) {
        process.stdout.write("  baseline recorded (first run)\n");
        if (!historyPath) continue;
      }
      if (run.alerts.length === 0) {
        process.stdout.write("  no regressions\n");
      }
      for (const alert of run.alerts) {
        const severity = alert.severity ?? "medium";
        const blocking =
          (SEVERITY_RANK[severity] ?? SEVERITY_RANK.medium) >= threshold;
        if (blocking) {
          alerting += 1;
        }
        process.stdout.write(
          `  ${blocking ? "ALERT" : "note"} [${severity}] ${alert.id}: ${describe(alert)} — ${alert.title}\n`,
        );
      }
      for (const improvement of run.diff.improvements) {
        process.stdout.write(
          `  resolved ${improvement.id}: ${improvement.from} -> ${improvement.to}\n`,
        );
      }
    }

    try {
      if (journalStore) {
        await drainNotifications(journalStore, (job) => job.kind === "monitor.email" && emailNotifications ? emailNotifications.monitor(job.payload.runs, job.payload.failOn) : job.kind === "monitor.webhook" && webhook ? deliverMonitorWebhook(webhook, job.payload.runs, { failOn: job.payload.failOn, secret: secretEnv ? process.env[secretEnv] : undefined, eventId: job.id }) : { delivered: false }, { kinds: [...(emailNotifications ? ["monitor.email"] : []), ...(webhook ? ["monitor.webhook"] : [])] });
        const selected = new Set(config.targets.map((target) => stateKey(target.method, target.url)));
        alerting = (await journalStore.read()).incidents.filter((incident) => selected.has(incident.target) && incident.status !== "resolved" && (SEVERITY_RANK[incident.finding.severity] ?? 2) >= threshold).length;
      } else {
        if (webhook && alerting > 0) { const delivery = await deliverMonitorWebhook(webhook, runs, { failOn, secret: secretEnv ? process.env[secretEnv] : undefined }); if (delivery.error) process.stderr.write(`${delivery.error}\n`); }
        if (emailNotifications) { const delivery = await emailNotifications.monitor(runs, failOn); if (delivery.error) process.stderr.write(`${delivery.error}\n`); }
      }
    } finally { emailNotifications?.close(); }
    process.stdout.write(`\n${alerting} blocking alert(s) at or above ${failOn}.\n`);
    return alerting > 0 ? 1 : 0;
  }

  if (command === "evidence") {
    const sub = parsed.positionals[0];
    if (sub === "keygen") {
      const keypair = generateEvidenceKeypair();
      const out = parsed.values.get("out");
      if (out) {
        try {
          // "wx": never replace an existing key; 0600: readable by its owner only.
          await writeFile(out, keypair.privateKeyPem, { flag: "wx", mode: 0o600 });
        } catch (error) {
          if (error.code === "EEXIST") {
            throw new Error(
              `${out} already exists. Refusing to overwrite a key file; choose another --out path.`,
            );
          }
          throw error;
        }
        process.stdout.write(`Private key written to ${out} (keep it secret).\n`);
      } else {
        process.stdout.write(keypair.privateKeyPem);
      }
      process.stdout.write(`Public key: ${keypair.publicKey}\n`);
      return 0;
    }
    if (sub === "attest") {
      const reportPath = parsed.positionals[1];
      const keyPath = parsed.values.get("key");
      if (!reportPath || !keyPath) {
        throw new Error(
          "evidence attest <report.json> --key <key.pem> [--out <attestation.json>].",
        );
      }
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      const privateKeyPem = await readFile(keyPath, "utf8");
      const attestation = attestReport(report, privateKeyPem);
      const out = parsed.values.get("out");
      if (out) {
        await writeFile(out, `${JSON.stringify(attestation, null, 2)}\n`);
        process.stdout.write(`Attestation written to ${out}\n`);
      } else {
        process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`);
      }
      return 0;
    }
    if (sub === "verify") {
      const attestationPath = parsed.positionals[1];
      if (!attestationPath) {
        throw new Error(
          "evidence verify <attestation.json> [--report <report.json>] [--expect-key <public-key.pem>].",
        );
      }
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      const reportPath = parsed.values.get("report");
      const report = reportPath
        ? JSON.parse(await readFile(reportPath, "utf8"))
        : undefined;
      const expectKeyPath = parsed.values.get("expect-key");
      const result = verifyAttestation(attestation, report, {
        expectedPublicKey: expectKeyPath
          ? await readFile(expectKeyPath, "utf8")
          : undefined,
      });
      process.stdout.write(
        `${result.valid ? "VALID" : "INVALID"} evidence attestation\n`,
      );
      process.stdout.write(`Signature valid: ${result.signatureValid}\n`);
      if (result.reportMatches !== null) {
        process.stdout.write(`Report matches:  ${result.reportMatches}\n`);
      }
      if (result.publicKeyMatches !== null) {
        process.stdout.write(`Expected signer: ${result.publicKeyMatches}\n`);
      }
      process.stdout.write(`Public key:      ${result.publicKey}\n`);
      if (result.reasons.length > 0) {
        process.stdout.write(
          `Reasons:\n${result.reasons.map((reason) => `  - ${reason}`).join("\n")}\n`,
        );
      }
      return result.valid ? 0 : 1;
    }
    throw new Error("evidence subcommand must be keygen, attest or verify.");
  }

  if (command === "scan") {
    const url = parsed.positionals[0];
    if (!url) {
      throw new Error("scan requires a URL.");
    }
    const schemes = parseList(parsed.values, "expect-scheme");
    const networks = parseList(parsed.values, "expect-network");
    const payTo = parseList(parsed.values, "expect-pay-to");
    const assets = parseList(parsed.values, "expect-asset");
    const expected = {
      ...(schemes.length > 0 ? { schemes } : {}),
      ...(networks.length > 0 ? { networks } : {}),
      ...(payTo.length > 0 ? { payTo } : {}),
      ...(assets.length > 0 ? { assets } : {}),
      ...(parsed.values.has("max-amount")
        ? { maxAmount: parsed.values.get("max-amount") }
        : {}),
    };
    targets = [
      normalizeTarget({
        name: parsed.values.get("name") ?? new URL(url).hostname,
        url,
        method: parsed.values.get("method") ?? "GET",
        headers: parseHeaders(parsed.values),
        body: parsed.values.get("body"),
        expected,
        ...(parsed.values.has("facilitator")
          ? { facilitator: parsed.values.get("facilitator") }
          : {}),
      }),
    ];
    metadata = { source: "cli" };
  } else if (command === "facilitator") {
    const url = parsed.positionals[0];
    if (!url) {
      throw new Error("facilitator requires a base URL.");
    }
    targets = null;
    metadata = { source: "cli", assessmentType: "facilitator" };
    const facilitator = normalizeFacilitator({
      name: parsed.values.get("name") ?? new URL(url).hostname,
      url,
      headers: parseHeaders(parsed.values),
    });
    assertCredentialHosts(
      [
        {
          name: facilitator.name,
          url: facilitator.url,
          headers: facilitator.headers,
        },
      ],
      allowedHosts,
    );
    const result = await scanFacilitator(facilitator, {
      timeoutMs: parsed.values.has("timeout")
        ? parsePositiveInteger(parsed.values.get("timeout"), "--timeout")
        : undefined,
    });
    const report = createReport([result], metadata);
    process.stdout.write(`${renderConsole(report)}\n`);
    if (!parsed.booleans.has("no-write")) {
      const files = await writeReports(
        report,
        parsed.values.get("out") ?? defaultOutput,
        formatsFrom(parsed.values),
      );
      process.stdout.write(
        `\nReports:\n${files.map((file) => `  ${file}`).join("\n")}\n`,
      );
    }
    const failOn = parsed.values.get("fail-on") ?? defaultFailOn;
    return shouldFail(report, failOn) ? 1 : 0;
  } else if (command === "check") {
    const configPath = parsed.values.get("config");
    if (!configPath) {
      throw new Error("check requires --config <file>.");
    }
    const config = await loadConfig(configPath);
    targets = config.targets;
    defaultOutput = config.output;
    defaultFailOn = config.failOn;
    metadata = { source: "config", configName: basename(configPath) };
    sarifOptions = {
      artifactUri: relative(process.cwd(), resolve(configPath)).split(sep).join("/"),
    };
  } else {
    throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }

  assertCredentialHosts(targets, allowedHosts);

  const timeoutMs = parsed.values.has("timeout")
    ? parsePositiveInteger(parsed.values.get("timeout"), "--timeout")
    : undefined;
  const repeat = parsed.values.has("repeat")
    ? parsePositiveInteger(parsed.values.get("repeat"), "--repeat")
    : undefined;
  const results = await scanAll(targets, {
    active,
    authorized,
    authorizationRef: parsed.values.get("authorization-ref"),
    timeoutMs,
    repeat,
  });
  const report = createReport(results, metadata);

  process.stdout.write(`${renderConsole(report)}\n`);
  if (!parsed.booleans.has("no-write")) {
    const files = await writeReports(
      report,
      parsed.values.get("out") ?? defaultOutput,
      formatsFrom(parsed.values),
      sarifOptions,
    );
    process.stdout.write(
      `\nReports:\n${files.map((file) => `  ${file}`).join("\n")}\n`,
    );
  }

  const failOn = parsed.values.get("fail-on") ?? defaultFailOn;
  return shouldFail(report, failOn) ? 1 : 0;
}

run()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    process.stderr.write(`Settlens error: ${error.message}\n`);
    process.exitCode = 2;
  });
