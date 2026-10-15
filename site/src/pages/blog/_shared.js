// Shared data for the blog posts. Files starting with "_" are not pages (see site/src/README.md).

import { readFileSync } from "node:fs";
import { getCheck } from "../../../../src/catalog.js";
import { meta as aboutMeta } from "../about.js";

// The founder Person node of /about, reused as is (README §6): every byline points at the one
// https://settlens.com/about#founder entity, described identically on every page. The layout adds "@type".
const { "@type": _personType, ...FOUNDER } = aboutMeta.jsonLd;
export const AUTHOR = Object.freeze(FOUNDER);

/** A repository file (path from the repo root), read at build time so examples cannot drift from the source. */
export const repoFile = (path) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8").trimEnd();

/** True when the CLI source defines this option, so flag tables follow src/cli.js. */
export const cliHasFlag = (flag) => repoFile("src/cli.js").includes(`"${flag.replace(/^--/, "")}"`);

/** Catalog entry for a check id. Fails the build when the id disappears from src/catalog.js. */
export function check(id) {
  const entry = getCheck(id);
  if (!entry) throw new Error(`Unknown check id "${id}" (not in src/catalog.js).`);
  return entry;
}

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"];

/** Table rows [label, ids, "modes · highest severity"] for a list of { label, ids }; ids missing from the catalog are skipped. */
export function checkRows(ctx, groups) {
  return groups.map(({ label, ids }) => {
    const entries = ids.map(getCheck).filter(Boolean);
    const modes = [...new Set(entries.map((entry) => entry.mode))].join(", ");
    const highest = entries.map((entry) => entry.severity).sort((a, b) => SEVERITY_ORDER.indexOf(b) - SEVERITY_ORDER.indexOf(a))[0];
    return [label, ctx.html`${entries.map((entry, index) => ctx.html`${index ? ctx.html`<br>` : ""}<code>${entry.id}</code>`)}`, `${modes} · ${highest}`];
  });
}

/** Small numbered marker for diagrams. */
export const badge = (x, y, n) =>
  `<circle class="d-node d-node--accent" cx="${x}" cy="${y}" r="11"/><text class="d-label d-label--accent" x="${x}" y="${y + 5}" text-anchor="middle">${n}</text>`;
