import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SEVERITY_RANK,
  STATUS_ORDER,
} from "./constants.js";
import { escapeHtml, sha256 } from "./utils.js";

const COLORS = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  pass: "\u001b[32m",
  fail: "\u001b[31m",
  warn: "\u001b[33m",
  skip: "\u001b[90m",
  mint: "\u001b[36m",
};

function paint(value, color) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) {
    return String(value);
  }
  return `${COLORS[color]}${value}${COLORS.reset}`;
}

export function renderConsole(report) {
  const output = [];
  output.push(
    `${paint("Settlens", "mint")} ${paint(`x402 assessment ${report.reportId}`, "bold")}`,
  );
  output.push(
    `Targets ${report.scope.targetCount} · Active ${report.scope.activeTargetCount} · Settlement calls ${report.scope.settlementCalls}`,
  );

  for (const target of report.targets) {
    output.push("");
    output.push(`${paint(target.name, "bold")}  ${target.target.method} ${target.target.url}`);
    output.push(
      `${paint(`${target.summary.pass} pass`, "pass")} · ${paint(`${target.summary.fail} fail`, "fail")} · ${paint(`${target.summary.warn} warn`, "warn")} · ${paint(`${target.summary.skip} skip`, "skip")}`,
    );

    const notable = target.checks
      .filter(({ status }) => status !== "pass")
      .sort(
        (left, right) =>
          STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
          SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity],
      );
    for (const check of notable) {
      output.push(
        `  ${paint(check.status.toUpperCase().padEnd(4), check.status)} ${check.severity.padEnd(8)} ${check.title}`,
      );
      output.push(`       ${check.message}`);
    }
  }

  output.push("");
  output.push(
    `Total: ${report.summary.pass} pass · ${report.summary.fail} fail · ${report.summary.warn} warn · ${report.summary.skip} skip`,
  );
  return output.join("\n");
}

export function shouldFail(report, failOn = "high") {
  if (failOn === "none") {
    return false;
  }
  const threshold = SEVERITY_RANK[failOn];
  if (threshold === undefined) {
    throw new Error(
      `Invalid fail-on severity "${failOn}". Use low, medium, high, critical or none.`,
    );
  }
  return report.targets.some((target) =>
    target.checks.some(
      (check) =>
        check.status === "fail" && SEVERITY_RANK[check.severity] >= threshold,
    ),
  );
}

export async function writeReports(
  report,
  outputDirectory,
  formats = ["json", "html", "sarif"],
  options = {},
) {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const written = [];

  for (const format of formats) {
    const filePath = resolve(directory, `settlens-${report.reportId}.${format}`);
    if (format === "json") {
      await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } else if (format === "html") {
      await writeFile(filePath, renderHtml(report), "utf8");
    } else if (format === "sarif") {
      await writeFile(
        filePath,
        `${JSON.stringify(renderSarif(report, options), null, 2)}\n`,
        "utf8",
      );
    } else {
      throw new Error(`Unsupported report format: ${format}`);
    }
    written.push(filePath);
  }

  return written;
}

function sarifLevel(check) {
  if (check.status === "fail") {
    return ["critical", "high"].includes(check.severity) ? "error" : "warning";
  }
  return check.status === "warn" ? "warning" : "note";
}

function securitySeverity(severity) {
  return {
    critical: "9.5",
    high: "8.0",
    medium: "5.0",
    low: "2.0",
    info: "0.1",
  }[severity] ?? "0.1";
}

// Settlens findings concern a remote endpoint, not a source line, but GitHub
// code scanning drops results without a location. Convention: every result is
// anchored at line 1 of the configuration file that declared the target
// (options.artifactUri, a path relative to the repository root, with "/"),
// and at "settlens.config.json" (the action's default config) for ad hoc
// scans. A per-target fingerprint keeps targets sharing a rule distinct.
export const DEFAULT_SARIF_ARTIFACT = "settlens.config.json";

export function renderSarif(report, options = {}) {
  const artifactUri = options.artifactUri ?? DEFAULT_SARIF_ARTIFACT;
  const findings = report.targets.flatMap((target) =>
    target.checks
      .filter((check) => ["fail", "warn"].includes(check.status))
      .map((check) => ({ target, check })),
  );
  const uniqueRules = new Map();
  for (const { check } of findings) {
    if (!uniqueRules.has(check.id)) {
      uniqueRules.set(check.id, {
        id: check.id,
        name: check.id.replaceAll(".", "_"),
        shortDescription: { text: check.title },
        fullDescription: { text: check.message },
        help: {
          text: check.recommendation ?? check.message,
        },
        properties: {
          tags: ["security", "x402", "agentic-payments"],
          "security-severity": securitySeverity(check.severity),
        },
      });
    }
  }

  return {
    version: "2.1.0",
    $schema:
      "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "Settlens",
            version: report.productVersion,
            informationUri: "https://settlens.com",
            rules: [...uniqueRules.values()],
          },
        },
        automationDetails: {
          id: `settlens/${report.reportId}`,
        },
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              reportDigest: report.integrity?.digest,
            },
          },
        ],
        results: findings.map(({ target, check }) => ({
          ruleId: check.id,
          level: sarifLevel(check),
          message: {
            text: `${check.message} Target: ${target.target.method} ${target.target.url}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: artifactUri, uriBaseId: "%SRCROOT%" },
                region: { startLine: 1 },
              },
            },
          ],
          partialFingerprints: {
            primaryLocationLineHash: `${sha256(
              `${check.id}\n${target.target.method} ${target.target.url}`,
            ).slice(0, 16)}:1`,
          },
          properties: {
            status: check.status,
            severity: check.severity,
            target: target.target.url,
            recommendation: check.recommendation,
            reportId: report.reportId,
          },
        })),
      },
    ],
  };
}

function checkCard(check) {
  const evidence = check.evidence
    ? `<details><summary>Evidence</summary><pre>${escapeHtml(JSON.stringify(check.evidence, null, 2))}</pre></details>`
    : "";
  const recommendation = check.recommendation
    ? `<p class="recommendation"><strong>Fix:</strong> ${escapeHtml(check.recommendation)}</p>`
    : "";

  return `<article class="check ${escapeHtml(check.status)}">
    <div class="check-heading">
      <span class="status">${escapeHtml(check.status)}</span>
      <span class="severity">${escapeHtml(check.severity)}</span>
      <code>${escapeHtml(check.id)}</code>
    </div>
    <h3>${escapeHtml(check.title)}</h3>
    <p>${escapeHtml(check.message)}</p>
    ${recommendation}
    ${evidence}
  </article>`;
}

function targetSection(target) {
  const sortedChecks = [...target.checks].sort(
    (left, right) =>
      STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
      SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity],
  );

  return `<section class="target">
    <div class="target-title">
      <div>
        <div class="eyebrow">${escapeHtml(target.mode)}</div>
        <h2>${escapeHtml(target.name)}</h2>
        <code>${escapeHtml(target.target.method)} ${escapeHtml(target.target.url)}</code>
      </div>
      <div class="score">
        <strong>${target.summary.fail}</strong>
        <span>failed checks</span>
      </div>
    </div>
    <div class="counts">
      <span class="pass">${target.summary.pass} pass</span>
      <span class="fail">${target.summary.fail} fail</span>
      <span class="warn">${target.summary.warn} warn</span>
      <span class="skip">${target.summary.skip} skip</span>
    </div>
    <div class="checks">${sortedChecks.map(checkCard).join("")}</div>
  </section>`;
}

export function renderHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Settlens assessment ${escapeHtml(report.reportId)}</title>
  <style>
    :root {
      --ink:#07111f; --mint:#26e6c8; --blue:#4c7dff; --cloud:#f4f7fb;
      --slate:#536275; --border:#dde5ee; --amber:#f6b94a; --coral:#f06464;
    }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:var(--cloud); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
    main { width:min(1120px,calc(100% - 32px)); margin:16px auto 64px; }
    .hero { padding:42px; color:white; background:var(--ink); border-radius:24px; }
    .brand { display:flex; align-items:center; gap:14px; font-size:27px; font-weight:700; }
    .mark { width:42px; height:42px; }
    .hero .eyebrow { margin-top:72px; }
    .eyebrow { color:var(--mint); font-family:ui-monospace,monospace; font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { max-width:760px; margin:14px 0; font-size:clamp(40px,6vw,68px); line-height:1; letter-spacing:-.045em; }
    .hero p { color:#a9b8c8; line-height:1.6; }
    .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:30px; }
    .summary-grid div { padding:17px; border:1px solid #24364b; border-radius:14px; }
    .summary-grid strong { display:block; font-size:30px; }
    .summary-grid span { color:#a9b8c8; font-size:12px; text-transform:uppercase; }
    .target { margin-top:16px; padding:32px; background:white; border:1px solid var(--border); border-radius:20px; }
    .target-title { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; }
    h2 { margin:7px 0; font-size:32px; letter-spacing:-.035em; }
    code, pre { font-family:"JetBrains Mono",ui-monospace,monospace; }
    .target-title code { color:var(--slate); overflow-wrap:anywhere; }
    .score { min-width:125px; padding:15px; text-align:center; background:var(--cloud); border-radius:14px; }
    .score strong { display:block; font-size:27px; }
    .score span { color:var(--slate); font-size:11px; text-transform:uppercase; }
    .counts { display:flex; flex-wrap:wrap; gap:8px; margin:24px 0 15px; }
    .counts span,.status,.severity { padding:5px 9px; border-radius:999px; font-size:11px; font-weight:750; text-transform:uppercase; }
    .counts .pass,.check.pass .status { color:#086657; background:#d9faf3; }
    .counts .fail,.check.fail .status { color:#8f2626; background:#ffe0e0; }
    .counts .warn,.check.warn .status { color:#78510a; background:#fff0cf; }
    .counts .skip,.check.skip .status { color:#536275; background:#e8edf3; }
    .checks { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .check { padding:20px; border:1px solid var(--border); border-left-width:4px; border-radius:14px; }
    .check.pass { border-left-color:var(--mint); }
    .check.fail { border-left-color:var(--coral); }
    .check.warn { border-left-color:var(--amber); }
    .check.skip { border-left-color:#a9b8c8; }
    .check-heading { display:flex; flex-wrap:wrap; align-items:center; gap:7px; }
    .severity { color:var(--slate); background:var(--cloud); }
    .check-heading code { color:var(--slate); font-size:11px; }
    h3 { margin:14px 0 8px; font-size:17px; }
    .check p { color:var(--slate); line-height:1.5; }
    .recommendation { padding:11px; background:var(--cloud); border-radius:10px; }
    details { margin-top:12px; }
    summary { cursor:pointer; color:var(--slate); font-size:13px; }
    pre { max-height:240px; overflow:auto; padding:12px; color:#cfe0f0; background:var(--ink); border-radius:10px; font-size:11px; white-space:pre-wrap; }
    footer { padding:26px 6px; color:var(--slate); font-size:12px; }
    @media (max-width:760px) {
      .hero,.target { padding:24px; }
      .summary-grid,.checks { grid-template-columns:1fr 1fr; }
      .target-title { display:block; }
      .score { margin-top:18px; }
    }
  </style>
</head>
<body>
<main>
  <header class="hero">
    <div class="brand">
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <path fill="#fff" d="M8 30v-3C8 16.507 16.507 8 27 8h19a4 4 0 0 1 4 4v6H29c-6.075 0-11 4.925-11 11v1H8Z"/>
        <path fill="#fff" d="M56 34v3c0 10.493-8.507 19-19 19H18a4 4 0 0 1-4-4v-6h21c6.075 0 11-4.925 11-11v-1h10Z"/>
        <circle cx="32" cy="32" r="4" fill="#26e6c8"/>
      </svg>
      Settlens
    </div>
    <div class="eyebrow">x402 security assessment · ${escapeHtml(report.reportId)}</div>
    <h1>See what settles.</h1>
    <p>Deterministic protocol and security evidence. No private key used. No settlement endpoint called.</p>
    <p><code>SHA-256 ${escapeHtml(report.integrity?.digest ?? "unavailable")}</code></p>
    <div class="summary-grid">
      <div><strong>${report.summary.pass}</strong><span>passed</span></div>
      <div><strong>${report.summary.fail}</strong><span>failed</span></div>
      <div><strong>${report.summary.warn}</strong><span>warnings</span></div>
      <div><strong>${report.scope.targetCount}</strong><span>targets</span></div>
    </div>
  </header>
  ${report.targets.map(targetSection).join("")}
  <footer>Generated ${escapeHtml(report.generatedAt)} by Settlens ${escapeHtml(report.productVersion)} · This report describes observed behavior, not a guarantee of security or legal compliance.</footer>
</main>
</body>
</html>`;
}
