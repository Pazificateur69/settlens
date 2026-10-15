// Shared helpers for the /product/<stage> pages. The leading underscore keeps the build
// from treating this file as a page. Reference data is read from the repository so the
// pages cannot drift from the code: the check catalog, action.yml and the example workflow.

import { readFileSync } from "node:fs";
import { CHECK_CATALOG } from "../../../../src/catalog.js";

const REPO_ROOT = new URL("../../../../", import.meta.url);

/** Text of a repository file (path relative to the repo root), independent of the working directory. */
export function repoFile(path) {
  try {
    return readFileSync(new URL(path, REPO_ROOT), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${path} is rendered from the repository root but is missing (the site build image must include it).`);
    }
    throw error;
  }
}

// Reported only by the MCP agent tools, never by settlens scan/check/monitor.
const AGENT_ONLY = new Set(["policy.acceptable_option"]);

/** Catalog entries a CLI run can emit, filtered by predicate. Throws when nothing matches, so a catalog rename fails the build. */
export function catalogChecks(predicate, what) {
  const checks = CHECK_CATALOG.filter((check) => !AGENT_ONLY.has(check.id) && predicate(check));
  if (!checks.length) throw new Error(`No catalog check matches ${what}.`);
  return checks;
}

const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };

export const severityBadge = (ctx, severity) => ctx.badge(severity, { tone: SEVERITY_TONE[severity] ?? "neutral" });

/** Table of catalog checks: id + title, default severity, what it verifies. */
export function checkTable(ctx, { caption, checks }) {
  return ctx.table({
    caption,
    head: ["Check", "Default severity", "What it verifies"],
    rows: checks.map((check) => [ctx.html`<code>${check.id}</code><br>${check.title}`, severityBadge(ctx, check.severity), check.verifies]),
    rowHeaders: true,
  });
}

/**
 * Inputs or outputs declared in action.yml, as [{ name, description, required, default, value }].
 * ponytail: line reader for the flat two-level blocks action.yml uses today; switch to a YAML
 * parser if the file gains multi-line scalars or deeper nesting (the asserts below fail first).
 */
export function actionBlock(yamlText, block) {
  const lines = yamlText.split("\n");
  const start = lines.indexOf(`${block}:`);
  if (start === -1) throw new Error(`action.yml has no top-level "${block}:" block.`);
  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (!line.startsWith("  ")) break;
    const key = /^ {2}([\w-]+):\s*$/.exec(line);
    const field = /^ {4}([\w-]+):\s*(.*)$/.exec(line);
    if (key) entries.push({ name: key[1] });
    else if (field && entries.length) entries.at(-1)[field[1]] = field[2].replace(/^"(.*)"$/, "$1");
    else throw new Error(`action.yml ${block}: unexpected line ${JSON.stringify(line)}.`);
  }
  if (!entries.length || entries.some((entry) => !entry.description)) throw new Error(`action.yml ${block}: every entry needs a description.`);
  return entries;
}

/** Reference to the home page's SoftwareApplication node (one software entity site-wide; the build emits the canonical node). */
export const SOFTWARE = { "@id": "https://settlens.com/#software" };

/** The five product stages, for "related" cards (the current one is left out). */
const STAGES = [
  { path: "/product/assess", icon: "search", title: "Assess", body: "Passive conformance and policy scan, plus the authorized fail-closed probe." },
  { path: "/product/ci", icon: "branch", title: "CI gate", body: "GitHub composite Action with a fail-on threshold, SARIF and evidence artifacts." },
  { path: "/product/verify", icon: "signature", title: "Verify", body: "Offline EIP-3009 and Solana signature checks, and facilitator checks." },
  { path: "/product/monitor", icon: "activity", title: "Monitor", body: "Scheduled passive scans compared to a baseline, with regression alerts." },
  { path: "/product/evidence", icon: "seal", title: "Evidence", body: "ed25519 attestations over the report digest, verifiable offline." },
];

export function otherStages(currentPath) {
  return STAGES.filter((stage) => stage.path !== currentPath).map(({ path, ...card }) => ({ ...card, href: path }));
}
