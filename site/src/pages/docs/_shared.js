// Shared helpers for the /docs pages. The leading underscore keeps the build from treating this
// file as a page. Reference tables are generated from repository files so the docs cannot drift.
// Files read here must be present in the site build image (site/Dockerfile COPY lines; checked by
// test/site.test.js). docs/ and every examples/ file except examples/github-workflow.yml are
// excluded by .dockerignore: never read them.

import { readFileSync } from "node:fs";

/** Text of a repository file (path relative to the repo root), independent of the working directory. */
export function repoFile(path) {
  try {
    return readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${path} is rendered from the repository root but is missing (the site build image must include it).`);
    throw error;
  }
}

export const repoJson = (path) => JSON.parse(repoFile(path));

/** Help text of src/cli.js (the HELP template literal), so usage and options cannot drift. */
export function cliHelp() {
  const source = repoFile("src/cli.js");
  const help = /const HELP = `([\s\S]*?)`;/.exec(source)?.[1];
  if (!help) throw new Error("src/cli.js: HELP template literal not found.");
  const block = (name) => {
    const match = new RegExp(`\\n${name}:\\n((?:  .*\\n?)+)`).exec(help);
    if (!match) throw new Error(`src/cli.js HELP: no "${name}:" block.`);
    return match[1].split("\n").filter(Boolean);
  };
  const usage = block("Usage").map((line) => line.trim());
  const options = block("Options").map((line) => {
    const match = /^ {2}(--[a-z][a-z-]*)(?: (<[^>]+>))?\s{2,}(.+)$/.exec(line);
    if (!match) throw new Error(`src/cli.js HELP: cannot parse option line ${JSON.stringify(line)}.`);
    const [, flag, argument = "", description] = match;
    const fallback = /\(default: ([^)]+)\)/.exec(description)?.[1] ?? "";
    return { flag, argument, description: description.replace(/\s*\(default: [^)]+\)/, ""), fallback };
  });
  return { usage, options, source };
}

const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };
const MODE_TONE = { passive: "accent", offline: "neutral", active: "warning", facilitator: "info" };

export const severityBadge = (ctx, severity) => ctx.badge(severity, { tone: SEVERITY_TONE[severity] ?? "neutral" });
export const modePill = (ctx, mode) => ctx.pill(mode, { tone: MODE_TONE[mode] ?? "neutral" });

const refName = (node) => node.$ref?.split("/").pop();

/** Readable type of a JSON Schema node; refs to documented definitions link to their table. */
function typeOf(ctx, node, root, anchors) {
  if (node === true) return "any JSON value";
  if (node.$ref) {
    const name = refName(node);
    const inner = typeOf(ctx, root.$defs[name], root, anchors);
    return anchors[name] ? ctx.html`${inner} (see <a href="#${anchors[name]}">${name}</a>)` : inner;
  }
  if (node.const !== undefined) return `${JSON.stringify(node.const)} (constant)`;
  if (node.enum) return `one of ${node.enum.join(", ")}`;
  if (node.oneOf) return ctx.html`${node.oneOf.map((option, index) => ctx.html`${index ? " or " : ""}${typeOf(ctx, option, root, anchors)}`)}`;
  if (node.type === "array") return ctx.html`array of ${typeOf(ctx, node.items ?? true, root, anchors)}`;
  if (Array.isArray(node.type)) return node.type.join(" or ");
  if (node.type === "object" && node.additionalProperties && typeof node.additionalProperties === "object") return "object (name → string)";
  return node.type ?? (node.properties ? "object" : "any JSON value");
}

// Plain-language names for the patterns the Settlens schemas use; others are shown as regexes.
const PATTERNS = {
  "^https?://": "starts with http:// or https://",
  "^[^\\r\\n]*$": "no line breaks",
  "^[0-9]+$": "digits only (integer string)",
  "^[A-Za-z]+$": "letters only",
  "^[a-f0-9]{8}$": "8 lowercase hex characters",
  "^[a-f0-9]{64}$": "64 lowercase hex characters",
  "^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$": "CAIP-2 identifier (namespace:reference)",
};

/** Validation rules of a JSON Schema node, as short phrases (refs are resolved). */
function rulesOf(node, root) {
  if (!node || node === true) return [];
  if (node.$ref) return rulesOf(root.$defs[refName(node)], root);
  const rules = [];
  if (node.pattern) rules.push(PATTERNS[node.pattern] ?? `matches ${node.pattern}`);
  if (node.minLength !== undefined) rules.push(node.minLength === 1 ? "non-empty" : `at least ${node.minLength} characters`);
  if (node.maxLength !== undefined) rules.push(`at most ${node.maxLength} characters`);
  if (node.minimum !== undefined) rules.push(`≥ ${node.minimum}`);
  if (node.maximum !== undefined) rules.push(`≤ ${node.maximum}`);
  if (node.minItems !== undefined || node.maxItems !== undefined) rules.push(`${node.minItems ?? 0} to ${node.maxItems ?? "any number of"} items`);
  if (node.uniqueItems) rules.push("no duplicates");
  if (node.maxProperties !== undefined) rules.push(`at most ${node.maxProperties} entries`);
  const itemRules = node.items ? rulesOf(node.items, root) : [];
  if (itemRules.length) rules.push(`each item: ${itemRules.join(", ")}`);
  if (node.oneOf) rules.push(...node.oneOf.flatMap((option) => rulesOf(option, root)));
  if (node.propertyNames) rules.push("names are HTTP header tokens; PAYMENT-SIGNATURE is rejected");
  const valueRules = node.additionalProperties && typeof node.additionalProperties === "object" ? rulesOf(node.additionalProperties, root) : [];
  if (valueRules.length) rules.push(`values: ${valueRules.join(", ")}`);
  return [...new Set(rules)];
}

/**
 * Rows for an object schema: inline sub-objects are flattened as dotted paths, refs to
 * definitions listed in `anchors` link to their own table. `descriptions` is keyed by path;
 * a schema `description` wins when present.
 */
function rowsOf(ctx, node, root, { anchors, descriptions, prefix = "" }) {
  const required = new Set(node.required ?? []);
  return Object.entries(node.properties ?? {}).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    const description = child.description ?? descriptions[path] ?? "";
    const rules = rulesOf(child, root);
    const type = ctx.html`${typeOf(ctx, child, root, anchors)}${required.has(key) ? ", required" : ""}${rules.length ? ctx.html`<br>${rules.join("; ")}` : ""}`;
    const row = [path, type, description];
    const nested = child.type === "object" && child.properties ? rowsOf(ctx, child, root, { anchors, descriptions, prefix: `${path}.` }) : [];
    return [row, ...nested];
  });
}

/**
 * table() of an object schema's fields: Field, Type and rules, Description. Field names are plain
 * text (not <code>): prose code may break anywhere, which collapses a first table column.
 */
export function schemaTable(ctx, { root, node, caption, anchors = {}, descriptions = {} }) {
  const rows = rowsOf(ctx, node, root, { anchors, descriptions });
  if (!rows.length) throw new Error(`schemaTable: "${caption}" has no properties.`);
  return ctx.table({ caption, head: ["Field", "Type and rules", "Description"], rows, rowHeaders: true });
}
