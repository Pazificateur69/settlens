// Shared helpers for the company and legal pages (/pricing, /security, /about, /contact, /faq,
// /changelog, /legal, /privacy, /terms, /cookies). The leading underscore keeps the build from
// treating this file as a page.

import { readFileSync } from "node:fs";
import { html, raw, slugify } from "../lib/html.js";
import { icon } from "../lib/icons.js";
import { toc } from "../lib/components.js";
import { createMcpServer } from "../../../src/mcp.js";

const REPO_ROOT = new URL("../../../", import.meta.url);

/** Text of a repository file (path relative to the repo root), independent of the working directory. */
export function repoFile(path) {
  try {
    return readFileSync(new URL(path, REPO_ROOT), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${path} is rendered from the repository root but is missing (the site build image must include it).`);
    throw error;
  }
}

const listTools = async (allowNetworkTools) =>
  (await createMcpServer({ mode: "remote", allowNetworkTools }).handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools;

/** MCP tools as the remote endpoint lists them: without a token (public) and with one (all). */
const PUBLIC_TOOLS = await listTools(false);
const ALL_TOOLS = await listTools(true);
export const MCP_TOOLS = Object.freeze({
  public: PUBLIC_TOOLS,
  network: ALL_TOOLS.filter((tool) => !PUBLIC_TOOLS.some((open) => open.name === tool.name)),
});

/** Breadcrumb trail for a top-level page (single-segment paths get none automatically). */
export const crumbs = (name, path) => [
  { name: "Home", path: "/" },
  { name, path },
];

/** Long-form page body with a sticky table of contents: sections = [{ id, title, body }]. */
export function documentBody({ sections, footer }) {
  const headings = sections.map((section) => ({ id: section.id, text: section.title, level: 2 }));
  return html`<div class="article">
  <div class="container article__grid">
    <div class="article__body">
      <details class="toc-mobile"><summary>On this page${icon("chevron-down")}</summary>${toc(headings)}</details>
      <div class="prose">${sections.map((section) => html`<h2 id="${section.id}">${section.title}</h2>
${section.body}`)}${footer ?? ""}</div>
    </div>
    <aside class="article__aside">${toc(headings, { className: "toc--sticky" })}</aside>
  </div>
</div>`;
}

/** Escaped text with `code`, **bold** and [label](https://…) turned into markup. */
export function inlineMarkdown(text) {
  const markup = html`${text}`.value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  // Break opportunities after "/" in prose (not in code or tags), so "A/B/C/D" lists wrap on phones.
  return raw(markup.split(/(<code>.*?<\/code>|<[^>]+>)/).map((part, index) => (index % 2 ? part : part.replace(/\/(?=\w)/g, "/<wbr>"))).join(""));
}

/**
 * Parses CHANGELOG.md (Keep a Changelog style) into
 * { intro: [paragraph], releases: [{ version, date, id, blocks: [{ type: "p"|"h3"|"ul", text|items }] }] }.
 * ponytail: handles the subset the file uses (## [version] — date, ### sections, paragraphs, "- " bullets
 * with indented continuation lines). The asserts below fail the build when the file outgrows it.
 */
export function parseChangelog(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const intro = [];
  const releases = [];
  let current = null;
  let paragraph = [];
  let list = null;
  const target = () => (current ? current.blocks : null);
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    if (current) current.blocks.push({ type: "p", text });
    else intro.push(text);
    paragraph = [];
  };
  const flushList = () => {
    if (list) target()?.push({ type: "ul", items: list });
    list = null;
  };
  for (const line of lines) {
    const release = /^## \[([^\]]+)\](?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(line);
    if (release) {
      flushParagraph();
      flushList();
      const version = release[1];
      current = { version, date: release[2] ?? null, id: /^\d/.test(version) ? `v${slugify(version)}` : slugify(version), blocks: [] };
      releases.push(current);
      continue;
    }
    if (/^# /.test(line)) continue;
    const sectionHeading = /^### (.+)$/.exec(line);
    if (sectionHeading) {
      flushParagraph();
      flushList();
      target()?.push({ type: "h3", text: sectionHeading[1].trim() });
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list ??= [];
      list.push(bullet[1].trim());
      continue;
    }
    if (/^\s+\S/.test(line) && list) {
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();

  // Self-check: every bullet of the file is rendered once, every release has content.
  const bulletCount = lines.filter((line) => /^- /.test(line)).length;
  const parsedBullets = releases.flatMap((entry) => entry.blocks).filter((block) => block.type === "ul").reduce((sum, block) => sum + block.items.length, 0);
  if (!releases.length) throw new Error("CHANGELOG.md: no release heading (## [x.y.z] — YYYY-MM-DD) found.");
  if (parsedBullets !== bulletCount) throw new Error(`CHANGELOG.md: parsed ${parsedBullets} of ${bulletCount} bullet(s); the parser in site/src/pages/_company.js needs updating.`);
  for (const entry of releases) if (!entry.blocks.length) throw new Error(`CHANGELOG.md: release ${entry.version} has no content.`);
  return { intro, releases };
}

/** Rendered blocks of one release (h3 levels are kept so the page outline stays logical). */
export function releaseBlocks(entry) {
  return entry.blocks.map((block) => {
    if (block.type === "h3") return html`<h3 id="${entry.id}-${slugify(block.text)}">${block.text}</h3>`;
    if (block.type === "ul") return html`<ul>${block.items.map((item) => html`<li>${inlineMarkdown(item)}</li>`)}</ul>`;
    return html`<p>${inlineMarkdown(block.text)}</p>`;
  });
}
