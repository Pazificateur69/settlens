// /changelog: rendered at build time from CHANGELOG.md, so the page cannot drift from the file.

import { VERSION } from "../../../src/constants.js";
import { crumbs, inlineMarkdown, parseChangelog, releaseBlocks, repoFile } from "./_company.js";
import { meta as homeMeta } from "./index.js";

const CHANGELOG = parseChangelog(repoFile("CHANGELOG.md"));
const LATEST = CHANGELOG.releases.find((entry) => /^\d/.test(entry.version));

export const meta = {
  path: "/changelog",
  title: "Settlens changelog: releases and updates",
  label: "Changelog",
  description:
    "Every Settlens release: new checks, CLI commands, Monitor, signed Evidence, Solana verification and website changes, generated from the project changelog.",
  section: "company",
  lastmod: "2026-10-13",
  changefreq: "monthly",
  breadcrumbs: crumbs("Changelog", "/changelog"),
  summary: `Settlens ${LATEST?.version ?? VERSION}${LATEST?.date ? `, released on ${LATEST.date},` : ""} is the current version of the CLI, GitHub Action, container and MCP server. This page lists every release with its changes, generated at build time from the project's CHANGELOG.md so it matches the shipped code.`,
  // Same #software node as the home page (one description per @id); its releaseNotes points here.
  jsonLd: homeMeta.jsonLd,
};

export default function render(ctx) {
  const { html } = ctx;
  const releases = CHANGELOG.releases;
  // Highlights = the bold lead-ins of a release's bullets, else the start of its first bullets.
  const summary = (entry) => {
    const items = entry.blocks.filter((block) => block.type === "ul").flatMap((block) => block.items);
    const bold = items.flatMap((item) => [...item.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]));
    return inlineMarkdown((bold.length ? bold : items.slice(0, 2).map((item) => item.split(/[:;]/)[0])).join(" · "));
  };
  return html`${ctx.hero({
    title: "Changelog",
    lede: `Every Settlens release, generated at build time from the project's CHANGELOG.md so this page always matches the code. The current CLI version is ${VERSION}.`,
    actions: [
      { label: `Read the ${LATEST?.version ?? VERSION} notes`, href: `#${LATEST?.id ?? releases[0].id}`, icon: "arrow-right" },
      { label: "Request a pilot", href: "/contact" },
    ],
  })}
${ctx.section({
  id: "releases",
  title: "Releases at a glance",
  lede: html`${CHANGELOG.intro.map((paragraph) => inlineMarkdown(paragraph))}`,
  width: "narrow",
  body: ctx.table({
    caption: "Settlens releases, newest first",
    head: ["Version", "Date", "Highlights"],
    rowHeaders: true,
    rows: releases.map((entry) => [
      html`<a href="#${entry.id}">${entry.version}</a>${entry.version === VERSION ? html` ${ctx.badge("Current", { tone: "accent" })}` : ""}`,
      entry.date ? html`<time datetime="${entry.date}">${ctx.formatDate(entry.date)}</time>` : "Undated",
      summary(entry),
    ]),
  }),
})}
${ctx.container(
  ctx.prose(html`${releases.map(
    (entry) => html`<h2 id="${entry.id}">${entry.version}${entry.date ? html` <small>· <time datetime="${entry.date}">${ctx.formatDate(entry.date)}</time></small>` : ""}</h2>
${releaseBlocks(entry)}`,
  )}
<p>Versions refer to the Settlens tool (CLI, GitHub Action, container and MCP server). See what each part does on the <a href="/product">product overview</a>, how to run it in the <a href="/docs">documentation</a>, and how the code is built and checked on the <a href="/security#supply-chain">security page</a>.</p>`),
  { width: "narrow" },
)}
${ctx.cta({
  title: "Try the current release on your endpoints",
  body: "The CLI and GitHub Action are available to pilot participants. A pilot usually starts with one paid endpoint, facilitator or agent flow and ends with a report and a signed attestation you can verify yourself.",
  actions: [
    { label: "Request a pilot", href: "/contact" },
    { label: "See pricing", href: "/pricing" },
  ],
})}`;
}
