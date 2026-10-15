// Helpers shared by the /use-cases pages. The leading underscore keeps the build from
// treating this file as a page. Check facts come from src/catalog.js and config
// examples are validated with src/config.js at build time, so the pages cannot drift.

import { getCheck } from "../../../../src/catalog.js";
import { normalizeTarget } from "../../../../src/config.js";

const SEVERITY_TONE = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };

/** Catalog entries for the given ids; throws when an id is no longer emitted so the build fails loudly. */
export function catalogChecks(ids) {
  return ids.map((id) => {
    const check = getCheck(id);
    if (!check) throw new Error(`Unknown check id "${id}" (not in src/catalog.js).`);
    return check;
  });
}

/** Table of catalog checks: id, what Settlens verifies, default severity. */
export function checkTable(ctx, ids, caption) {
  return ctx.table({
    caption,
    head: ["Check", "What Settlens verifies", "Severity"],
    rows: catalogChecks(ids).map((check) => [
      ctx.html`<code>${check.id}</code><br>${check.title}`,
      // The agent-tools note is irrelevant to sellers and facilitators; /docs/checks keeps the full text.
      check.verifies.replace(/ In the agent tools[\s\S]*$/, ""),
      ctx.badge(check.severity, { tone: SEVERITY_TONE[check.severity] }),
    ]),
    rowHeaders: true,
  });
}

/** Throws unless the example passes the same validation as `settlens check --config`. */
export function assertValidConfig(config) {
  if (config.version !== 1) throw new Error("Example config must use version 1.");
  config.targets.forEach((target, index) => normalizeTarget({ ...(config.defaults ?? {}), ...target }, index));
  return config;
}

/** Reference to the home page's SoftwareApplication node: the build emits that one canonical node. */
export const SOFTWARE = { "@id": "https://settlens.com/#software" };

/** JSON.stringify with single-item arrays kept on one line, for readable examples. */
export const prettyJson = (value) => JSON.stringify(value, null, 2).replace(/\[\n\s+("[^"\n]*")\n\s+\]/g, "[$1]");
