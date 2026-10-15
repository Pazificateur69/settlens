#!/usr/bin/env node
// Static site generator for settlens.com. Node stdlib only.
// Usage: node site/build.js [outDir] [--allow-missing=pending|/a,/b] [--require-summary]

import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { declaredRoutes, site } from "./src/data/site.js";
import * as components from "./src/lib/components.js";
import { cx, escape, html, raw, SafeHtml, slugify, stripTags } from "./src/lib/html.js";
import { ICON_NAMES, icon } from "./src/lib/icons.js";
import { defaultLayout, documentShell, LAYOUTS, processHeadings, readingMinutes } from "./src/lib/layout.js";

const SITE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT_DIR = join(SITE_DIR, "public");
export const DEFAULT_PAGES_DIR = join(SITE_DIR, "src", "pages");
const SOURCE_ASSETS = join(SITE_DIR, "src", "assets");
const BRAND_ASSETS = join(SITE_DIR, "assets");
const DATA_DIR = join(SITE_DIR, "src", "data");
/** Committed Open Graph images (site/tools/og.mjs writes them, one per indexable page). */
export const OG_DIR = join(SOURCE_ASSETS, "og");
/** Title each OG image was rendered with: test/site.test.js flags a missing or stale image. */
export const OG_MANIFEST = join(DATA_DIR, "og-manifest.json");
export const INDEXNOW_KEY_FILE = join(DATA_DIR, "indexnow-key.txt");
/** site.css names the font by its source file; the build publishes it under a content hash. */
export const FONT_SOURCE_URL = "/assets/fonts/Inter-latin-var.woff2";
const PAGE_SCRIPTS = new Set(["tools"]);
const LLMS_FULL_MAX_BYTES = 2 * 1024 * 1024;
const MARKER = ".settlens-build";
const NOT_FOUND_PATH = "/404";
const PATH_PATTERN = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHANGEFREQ = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
// Site-wide JSON-LD entities emitted by the layout on every page: pages reference them, never redefine them.
const LAYOUT_IDS = new Set([`${site.origin}/#organization`, `${site.origin}/#website`]);

export class BuildError extends Error {
  constructor(errors) {
    super(`Site build failed with ${errors.length} error(s):\n${errors.map((error) => `  - ${error}`).join("\n")}`);
    this.name = "BuildError";
    this.errors = errors;
  }
}

const isDate = (value) => DATE_PATTERN.test(value ?? "") && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const documentTitle = (title) => (title.includes(site.name) ? title : `${title} | ${site.name}`);
const decodeAttribute = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function listModules(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("_") && !entry.name.startsWith("."))
      .map((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return listModules(full);
        return entry.name.endsWith(".js") ? [full] : [];
      }),
  );
  return nested.flat().sort();
}

async function loadPages(pagesDir, extraPages) {
  const files = await listModules(pagesDir);
  const modules = await Promise.all(
    files.map(async (file) => {
      const module = await import(pathToFileURL(file).href);
      return { meta: module.meta, render: module.default, source: relative(SITE_DIR, file) };
    }),
  );
  return [...modules, ...extraPages.map((page, index) => ({ source: `extraPages[${index}]`, ...page }))];
}

/** Routes promised by nav/footer/docs sidebar that have no page module yet. */
export async function pendingRoutes({ pagesDir = DEFAULT_PAGES_DIR } = {}) {
  const pages = await loadPages(pagesDir, []);
  const existing = new Set(pages.map((page) => page.meta?.path));
  return declaredRoutes.filter((path) => !existing.has(path));
}

const isHttpsUrl = (value) => {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

function validateMeta({ meta, render, source }, errors, requireSummary = false) {
  const fail = (message) => errors.push(`${source}: ${message}`);
  if (!meta || typeof meta !== "object") {
    fail("missing `export const meta`.");
    return false;
  }
  if (typeof render !== "function") fail("missing default export render(ctx).");
  if (typeof meta.path !== "string" || !PATH_PATTERN.test(meta.path)) fail(`invalid path ${JSON.stringify(meta.path)} (lowercase, hyphenated, leading slash, no trailing slash).`);
  if (typeof meta.title !== "string" || !meta.title.trim()) fail("missing title.");
  else if (documentTitle(meta.title).length > 60) fail(`title "${documentTitle(meta.title)}" is ${documentTitle(meta.title).length} characters (max 60).`);
  if (typeof meta.description !== "string" || !meta.description.trim()) fail("missing description.");
  else if (meta.description.length < 120 || meta.description.length > 160) fail(`description is ${meta.description.length} characters (must be 120-160).`);
  if (typeof meta.section !== "string" || !meta.section) fail("missing section.");
  if (!isDate(meta.lastmod)) fail(`lastmod must be YYYY-MM-DD (got ${JSON.stringify(meta.lastmod)}).`);
  for (const key of ["datePublished", "dateModified"]) if (meta[key] !== undefined && !isDate(meta[key])) fail(`${key} must be YYYY-MM-DD.`);
  if (meta.layout !== undefined && !LAYOUTS[meta.layout]) fail(`unknown layout "${meta.layout}" (page, article, docs).`);
  if (meta.ogType !== undefined && !["website", "article"].includes(meta.ogType)) fail('ogType must be "website" or "article".');
  if (meta.changefreq !== undefined && !CHANGEFREQ.has(meta.changefreq)) fail(`invalid changefreq "${meta.changefreq}".`);
  if (meta.priority !== undefined && !(typeof meta.priority === "number" && meta.priority >= 0 && meta.priority <= 1)) fail("priority must be a number between 0 and 1.");
  if (meta.jsonLd !== undefined && [meta.jsonLd].flat().some((node) => !node || typeof node !== "object" || Array.isArray(node))) fail("jsonLd must be an object or an array of objects.");
  // Answer-first "In short" text (page, llms files, Markdown, JSON-LD abstract). Legal pages never need one.
  const indexable = meta.path !== NOT_FOUND_PATH && meta.noindex !== true && meta.section !== "legal";
  if (meta.summary !== undefined || (requireSummary && indexable)) {
    if (typeof meta.summary !== "string" || !meta.summary.trim()) fail("missing summary (120-320 characters of plain text).");
    else if (meta.summary.trim().length < 120 || meta.summary.trim().length > 320) fail(`summary is ${meta.summary.trim().length} characters (must be 120-320).`);
  }
  if (meta.sources !== undefined) {
    if (!Array.isArray(meta.sources) || !meta.sources.length) fail("sources must be a non-empty array of { title, url, publisher? }.");
    else
      meta.sources.forEach((entry, index) => {
        if (typeof entry?.title !== "string" || !entry.title.trim()) fail(`sources[${index}] needs a title.`);
        if (!isHttpsUrl(entry?.url)) fail(`sources[${index}].url must be an absolute https URL.`);
        if (entry?.publisher !== undefined && (typeof entry.publisher !== "string" || !entry.publisher.trim())) fail(`sources[${index}].publisher must be a non-empty string.`);
      });
  }
  if (meta.scripts !== undefined && (!Array.isArray(meta.scripts) || meta.scripts.some((name) => !PAGE_SCRIPTS.has(name)))) fail(`scripts must be an array of: ${[...PAGE_SCRIPTS].map((name) => `"${name}"`).join(", ")}.`);
  if (/^\/blog\/./.test(meta.path ?? "")) {
    if (!isDate(meta.datePublished)) fail("blog posts require datePublished (YYYY-MM-DD).");
    if (!meta.author) fail("blog posts require author.");
    if (!Array.isArray(meta.tags) || !meta.tags.length) fail("blog posts require a non-empty tags array.");
  }
  return true;
}

function toRecord({ meta, render, source }) {
  const layout = meta.layout ?? defaultLayout(meta.path);
  const noindex = meta.path === NOT_FOUND_PATH || meta.noindex === true;
  return {
    ...meta,
    render,
    source,
    layout,
    noindex,
    // Markdown alternate (<link rel="alternate" type="text/markdown">), written for indexable pages only.
    markdownUrl: noindex ? undefined : meta.path === "/" ? "/index.md" : `${meta.path}.md`,
    ogType: meta.ogType ?? (layout === "article" ? "article" : "website"),
    url: `${site.origin}${meta.path}`,
    documentTitle: documentTitle(meta.title),
    outFile: meta.path === NOT_FOUND_PATH ? "404.html" : meta.path === "/" ? "index.html" : `${meta.path.slice(1)}/index.html`,
  };
}

/** Blog posts (/blog/<slug>), newest first. */
function blogPosts(records, { tag, limit } = {}) {
  return records
    .filter((record) => /^\/blog\/./.test(record.path) && !record.noindex && (!tag || record.tags?.includes(tag)))
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished) || a.path.localeCompare(b.path))
    .slice(0, limit ?? Infinity);
}

const sortPages = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.label ?? a.title).localeCompare(b.label ?? b.title);

function createContext(page, records, byPath) {
  const listed = records.filter((record) => record.path !== NOT_FOUND_PATH);
  return {
    ...components,
    html,
    raw,
    escape,
    cx,
    icon,
    ICON_NAMES,
    slugify,
    stripTags,
    site,
    page,
    pages: listed,
    find: (path) => byPath.get(path),
    url: (path) => `${site.origin}${path}`,
    children: (parent) =>
      listed
        .filter((record) => !record.noindex && record.path !== parent && (record.path.slice(0, record.path.lastIndexOf("/")) || "/") === parent)
        .sort(sortPages),
    inSection: (name) => listed.filter((record) => record.section === name && !record.noindex).sort(sortPages),
    posts: (options) => blogPosts(listed, options),
  };
}

function renderBody(page, records, byPath) {
  const output = page.render(createContext(page, records, byPath));
  return output instanceof SafeHtml ? output.value : String(output ?? "");
}

function crumbsFor(page, byPath) {
  if (page.breadcrumbs === false) return [];
  if (Array.isArray(page.breadcrumbs)) return page.breadcrumbs;
  const segments = page.path.split("/").filter(Boolean);
  if (segments.length < 2) return [];
  const name = (record) => record.label ?? record.heading ?? record.title;
  const items = [{ name: "Home", path: "/" }];
  for (let i = 1; i < segments.length; i += 1) {
    const parent = byPath.get(`/${segments.slice(0, i).join("/")}`);
    if (parent) items.push({ name: name(parent), path: parent.path });
  }
  return [...items, { name: name(page), path: page.path }];
}

/**
 * One description per JSON-LD @id across the site. Page definitions (meta.jsonLd nodes with an @id and
 * other properties) of the same @id are merged into one canonical node, which every page that defines
 * or lists it ({ "@id": id } alone) emits. A property set to two different values fails the build.
 */
export function canonicalJsonLd(records) {
  const errors = [];
  const canonical = new Map();
  const setBy = new Map(); // "<@id> <property>" → page that set it first
  for (const record of records) {
    for (const { "@context": _context, ...node } of [record.jsonLd ?? []].flat()) {
      const id = node["@id"];
      if (typeof id !== "string" || Object.keys(node).length === 1) continue;
      if (LAYOUT_IDS.has(id) || id.endsWith("#webpage")) {
        errors.push(`${record.source}: JSON-LD @id ${id} is emitted by the layout; reference it as { "@id": "${id}" } instead of redefining it.`);
        continue;
      }
      const merged = canonical.get(id) ?? {};
      for (const [key, value] of Object.entries(node)) {
        const first = setBy.get(`${id} ${key}`);
        // ponytail: JSON.stringify compares key order too; reuse one shared object rather than retyping it.
        if (!first) {
          merged[key] = value;
          setBy.set(`${id} ${key}`, record.source);
        } else if (JSON.stringify(merged[key]) !== JSON.stringify(value)) {
          errors.push(`${record.source}: JSON-LD ${id} sets "${key}" differently from ${first} (one description per @id: reuse that page's node).`);
        }
      }
      canonical.set(id, merged);
    }
  }
  return { canonical, errors };
}

/** Structural and CSP checks on one rendered document. */
export function validateHtml(source, markup) {
  const errors = [];
  const fail = (message) => errors.push(`${source}: ${message}`);
  const h1 = markup.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1 !== 1) fail(`expected exactly one <h1>, found ${h1}.`);
  if (/<[a-z][^>]*\sstyle\s*=/i.test(markup)) fail("inline style= attribute (blocked by CSP style-src 'self').");
  if (/<style[\s>]/i.test(markup)) fail("inline <style> element (blocked by CSP).");
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(markup)) fail("inline event handler attribute (blocked by CSP).");
  if (/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(markup)) fail("javascript: URL.");
  // Any absolute or protocol-relative resource URL: the CSP only loads same-origin resources.
  const external = String.raw`\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\/`;
  if (new RegExp(String.raw`<[a-z][^>]*\s(?:src|srcset|poster|data|action|formaction)${external}`, "i").test(markup) || new RegExp(String.raw`<link\b(?=[^>]*\srel\s*=\s*["']?[^"'>]*\b(?:stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|manifest)\b)[^>]*\shref${external}`, "i").test(markup)) {
    fail("third-party resource URL (the CSP only loads same-origin resources; use a root-relative path).");
  }
  if (/<img\b(?![^>]*\salt=)[^>]*>/i.test(markup)) fail("<img> without alt attribute.");
  let faqPages = 0;
  for (const match of markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, content] = match;
    if (/\stype="application\/ld\+json"/.test(attrs)) {
      try {
        if (JSON.parse(content)["@type"] === "FAQPage") faqPages += 1;
      } catch (error) {
        fail(`invalid JSON-LD (${error.message}).`);
      }
    } else if (!/\ssrc="[^"]+"/.test(attrs) || content.trim()) {
      fail("inline <script> (only external scripts and application/ld+json are allowed).");
    }
  }
  if (faqPages > 1) fail("more than one FAQPage JSON-LD block (use faq() once per page).");
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) fail(`duplicate id(s): ${duplicates.join(", ")}.`);
  return errors;
}

/** Every internal href/src must hit a generated page (and anchor), a generated file, or an allowMissing path. */
export function checkLinks(rendered, files, allowMissing = []) {
  const errors = [];
  const broken = new Map(); // missing target → pages linking to it, reported once per target
  const idsOf = (markup) => new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const pageIds = new Map([...rendered].filter(([path]) => path !== NOT_FOUND_PATH).map(([path, markup]) => [path, idsOf(markup)]));
  for (const [path, markup] of rendered) {
    for (const match of markup.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const value = decodeAttribute(match[1]);
      if (/^(?:mailto|tel):/i.test(value)) continue;
      if (value.startsWith("//")) {
        errors.push(`${path}: protocol-relative URL "${value}".`);
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith(`${site.origin}/`)) continue;
      if (value === `${site.origin}${path}`) continue; // canonical self-reference
      const target = new URL(value, `${site.origin}${path}`);
      const targetPath = value.startsWith("#") ? path : decodeURIComponent(target.pathname);
      const ids = value.startsWith("#") ? idsOf(markup) : pageIds.get(targetPath);
      if (targetPath !== "/" && targetPath.endsWith("/")) errors.push(`${path}: link "${value}" has a trailing slash (use ${targetPath.slice(0, -1)}).`);
      else if (ids) {
        const anchor = decodeURIComponent(target.hash.slice(1));
        if (value.endsWith("#")) errors.push(`${path}: empty anchor link "${value}".`);
        else if (anchor && !ids.has(anchor)) errors.push(`${path}: link "${value}" points to a missing anchor.`);
      } else if (!files.has(targetPath) && !allowMissing.includes(targetPath)) broken.set(value, new Set([...(broken.get(value) ?? []), path]));
    }
  }
  for (const [value, pages] of broken) errors.push(`broken internal link "${value}" (on ${[...pages].join(", ")}).`);
  return errors;
}

const hashOf = (content) => createHash("sha256").update(content).digest("hex").slice(0, 10);
const rfc822 = (isoDate) => new Date(`${isoDate}T00:00:00Z`).toUTCString();

/**
 * Strips comments and collapses whitespace outside quoted strings. Keeps the space before a pseudo-class
 * (".prose :where(" is a descendant combinator) and the spaces inside calc().
 */
export function minifyCss(source) {
  const strings = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/;
  return String(source)
    .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\//g, (match, string) => string ?? "")
    .split(strings)
    .map((part, index) => (index % 2 ? part : part.replace(/\s+/g, " ").replace(/ ?([{};,]) ?/g, "$1").replace(/: /g, ":").replace(/;}/g, "}")))
    .join("")
    .trim();
}

/** Width and height of a PNG, from its IHDR chunk. */
export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("latin1", 1, 4) !== "PNG" || buffer.toString("latin1", 12, 16) !== "IHDR") throw new Error("not a PNG file");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** File name (without .png) of a page's Open Graph image: "/" → "home", "/docs/cli" → "docs--cli". */
export const ogSlug = (path) => path.slice(1).replaceAll("/", "--") || "home";
/** Title an Open Graph image shows (and og-manifest.json records): the page's visible heading. */
export const ogTitle = (page) => stripTags(String(page.heading ?? page.title));

/* ---------- HTML → Markdown (alternates at <path>.md and llms-full.txt) ---------- */

// Written for the site's own generated markup, not arbitrary HTML.
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);
const BLOCK_TAGS = new Set(["address", "article", "aside", "blockquote", "caption", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "nav", "noscript", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);
// Chrome, interactive controls and decoration: never content.
const DROPPED_TAGS = new Set(["aside", "button", "canvas", "dialog", "form", "head", "iframe", "input", "link", "meta", "nav", "object", "script", "select", "style", "svg", "template", "textarea"]);
const DROPPED_CLASSES = /(?:^|\s)(?:skip-link|toc-mobile|docs__mobile-nav)(?:\s|$)/;
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
const BREAK = "\uE000"; // <br> placeholder: whitespace collapsing must not eat it

const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] !== "#") return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

/** Tag/text tokenizer → { tag, attrs, children } tree; unmatched closing tags are ignored. */
function parseHtml(markup) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|[^<]+|</g;
  for (let match; (match = token.exec(markup)); ) {
    const [whole, closing, opening, attrText = ""] = match;
    const parent = stack.at(-1);
    if (opening) {
      const tag = opening.toLowerCase();
      const attrs = {};
      for (const [, name, double, single, bare] of attrText.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        attrs[name.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? "");
      }
      const node = { tag, attrs, children: [] };
      parent.children.push(node);
      if (RAW_TEXT_TAGS.has(tag)) {
        const end = markup.toLowerCase().indexOf(`</${tag}`, token.lastIndex);
        const stop = end === -1 ? markup.length : end;
        node.children.push({ text: markup.slice(token.lastIndex, stop) });
        token.lastIndex = end === -1 ? stop : markup.indexOf(">", end) + 1;
      } else if (!VOID_TAGS.has(tag) && !whole.endsWith("/>")) stack.push(node);
    } else if (closing) {
      const index = stack.findLastIndex((node) => node.tag === closing.toLowerCase());
      if (index > 0) stack.length = index;
    } else if (!whole.startsWith("<!")) parent.children.push({ text: whole });
  }
  return root;
}

const hasClass = (node, name) => (node.attrs?.class ?? "").split(/\s+/).includes(name);
const isLabelledSvg = (node) => node.tag === "svg" && Boolean(node.attrs["aria-label"]);
const isDropped = (node) =>
  Boolean(node.tag) && ((DROPPED_TAGS.has(node.tag) && !isLabelledSvg(node)) || "hidden" in node.attrs || node.attrs["aria-hidden"] === "true" || DROPPED_CLASSES.test(node.attrs.class ?? ""));
const textContent = (node) => (node.text !== undefined ? decodeEntities(node.text) : node.children.map(textContent).join(""));
const findNode = (node, test) => {
  for (const child of node.children ?? []) {
    if (child.tag && test(child)) return child;
    const found = child.tag && findNode(child, test);
    if (found) return found;
  }
  return undefined;
};

// Escapes text so it stays text: emphasis, code, link and HTML markers.
const escapeMarkdown = (text) =>
  text
    .replace(/[\\`*[\]]/g, "\\$&")
    .replace(/<(?=[a-zA-Z/!?])/g, "\\<")
    .replace(/(?<![a-zA-Z0-9])_|_(?![a-zA-Z0-9])/g, "\\_");
const squash = (text) =>
  text
    .replace(/\s+/g, " ")
    .replace(new RegExp(`^[\\s${BREAK}]+|[\\s${BREAK}]+$`, "g"), "")
    .replace(new RegExp(` ?${BREAK} ?`, "g"), "\\\n");
// A paragraph that happens to start like a heading, quote or list marker stays a paragraph.
const asParagraph = (text) =>
  squash(text)
    .replace(/^(#{1,6}(?=\s)|>|[-+*](?=\s))/, "\\$1")
    .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2");
const wrapInline = (text, mark) => {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  return core ? `${lead}${mark}${core}${mark}${trail}` : text;
};
const codeSpan = (text) => {
  const value = text.replace(/\s+/g, " ");
  if (!value.trim()) return "";
  let ticks = "`";
  while (value.includes(ticks)) ticks += "`";
  const pad = /^`|`$/.test(value) ? " " : "";
  return `${ticks}${pad}${value}${pad}${ticks}`;
};
const fence = (text, language = "") => {
  const body = text.replace(/^\n+|\s+$/g, "");
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return `${ticks}${language}\n${body}\n${ticks}`;
};
const absoluteUrl = (href, base) => {
  try {
    return new URL(href, base).href.replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return href;
  }
};

/** Inline Markdown of sibling nodes. Elements written side by side (buttons, badges, a date then a reading time) are
 * set apart visually by CSS, so they get a space; text next to an element is joined as written. */
function joinInline(nodes, base) {
  let out = "";
  let afterElement = false;
  for (const node of nodes) {
    const text = inline(node, base);
    if (!text) continue;
    const element = node.text === undefined;
    if (element && afterElement && node.tag !== "sup" && !/\s$/.test(out) && !/^\s/.test(text)) out += " ";
    out += text;
    afterElement = element;
  }
  return out;
}

function inline(node, base) {
  if (node.text !== undefined) return escapeMarkdown(decodeEntities(node.text));
  if (isLabelledSvg(node)) return escapeMarkdown(node.attrs["aria-label"]);
  if (isDropped(node)) return "";
  const inner = () => joinInline(node.children, base);
  switch (node.tag) {
    case "br":
      return BREAK;
    case "wbr":
      return "";
    case "sup": // an exponent (N<sup>1−k</sup>) must not read as a factor: N^(1−k)
      return `^(${inner()})`;
    case "code":
    case "kbd":
    case "samp":
      return codeSpan(textContent(node));
    case "strong":
    case "b":
      return wrapInline(inner(), "**");
    case "em":
    case "i":
      return wrapInline(inner(), "_");
    case "a": {
      const text = squash(inner());
      if (!text || !node.attrs.href) return text;
      return `[${text}](${absoluteUrl(node.attrs.href, base)})`;
    }
    case "img":
      return node.attrs.alt ? `![${escapeMarkdown(node.attrs.alt)}](${absoluteUrl(node.attrs.src ?? "", base)})` : "";
    default:
      return BLOCK_TAGS.has(node.tag) ? ` ${inner()} ` : inner();
  }
}

/** Child nodes as Markdown blocks: runs of inline content become paragraphs. */
function blocks(nodes, base) {
  const out = [];
  let run = [];
  const flush = () => {
    const text = asParagraph(joinInline(run, base));
    if (text) out.push(text);
    run = [];
  };
  for (const node of nodes) {
    if (node.tag && isDropped(node)) continue;
    if (node.tag && BLOCK_TAGS.has(node.tag)) {
      flush();
      out.push(...block(node, base));
    } else run.push(node);
  }
  flush();
  return out;
}

const indentLines = (text, pad) => text.split("\n").map((line, index) => (index && line ? pad + line : line)).join("\n");

function list(node, base) {
  const ordered = node.tag === "ol";
  // Headings inside items (cards, steps, features) read as the item's bold title.
  const items = node.children
    .filter((child) => child.tag === "li" && !isDropped(child))
    .map((item) => blocks(item.children, base).map((text) => text.replace(/^#{1,6} ([\s\S]*)$/, "**$1**")))
    .filter((parts) => parts.length);
  // A nested list sits right under its item and does not make the outer list loose.
  const isList = (part) => /^(?:-|\d+\.) /.test(part);
  const loose = items.some((parts) => parts.filter((part) => !isList(part)).length > 1 || parts.some((part) => !isList(part) && part.includes("\n")));
  return items
    .map((parts, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      const pad = " ".repeat(marker.length + 1);
      return `${marker} ${parts.map((part, at) => `${at ? (isList(part) ? "\n" : "\n\n") + pad : ""}${indentLines(part, pad)}`).join("")}`;
    })
    .join(loose ? "\n\n" : "\n");
}

function table(node, base) {
  const rows = [];
  const collect = (parent) => {
    for (const child of parent.children) {
      if (child.tag === "tr") rows.push(child);
      else if (["thead", "tbody", "tfoot"].includes(child.tag)) collect(child);
    }
  };
  collect(node);
  const cells = rows.map((row) =>
    row.children
      .filter((cell) => cell.tag === "th" || cell.tag === "td")
      .map((cell) => squash(joinInline(cell.children, base).replaceAll(BREAK, "; ")).replace(/\|/g, "\\|")),
  );
  if (!cells.length) return [];
  const width = Math.max(...cells.map((row) => row.length));
  const line = (row) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
  const caption = node.children.find((child) => child.tag === "caption");
  const captionText = caption && squash(joinInline(caption.children, base));
  return [...(captionText ? [`_${captionText}_`] : []), [line(cells[0]), line(Array(width).fill("---")), ...cells.slice(1).map(line)].join("\n")];
}

function definitions(node, base) {
  const items = [];
  const text = (child) => squash(joinInline(child.children, base));
  const collect = (parent) => {
    for (const child of parent.children) {
      if (child.tag === "dt") items.push({ term: text(child), values: [] });
      else if (child.tag === "dd") {
        if (!items.length) items.push({ term: "", values: [] });
        items.at(-1).values.push(text(child));
      } else if (child.tag && !isDropped(child)) collect(child);
    }
  };
  collect(node);
  // A term already set in bold (glossary <dt><dfn><strong>) is not wrapped twice ("****term**:**").
  const bold = (term) => `**${term.replace(/^\*\*([\s\S]*)\*\*$/, "$1")}:**`;
  return items.map(({ term, values }) => `- ${term ? `${bold(term)} ` : ""}${values.join(" — ")}`).join("\n");
}

const quote = (parts) => (parts.length ? [parts.join("\n\n").split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")] : []);

function block(node, base) {
  const { tag } = node;
  const text = () => squash(joinInline(node.children, base));
  if (/^h[1-6]$/.test(tag)) return text() ? [`${"#".repeat(Number(tag[1]))} ${text()}`] : [];
  if (tag === "pre") return [fence(textContent(node), /\blanguage-([\w-]+)/.exec(findNode(node, (child) => child.tag === "code")?.attrs.class ?? "")?.[1] ?? "")];
  if (tag === "ul" || tag === "ol") return [list(node, base)].filter(Boolean);
  if (tag === "table") return table(node, base);
  if (tag === "dl") return [definitions(node, base)].filter(Boolean);
  if (tag === "hr") return ["---"];
  if (tag === "blockquote" || hasClass(node, "callout")) return quote(blocks(node.children, base));
  if (hasClass(node, "callout__title")) return text() ? [`**${text()}**`] : [];
  if (tag === "figcaption" || tag === "caption") return text() ? [`_${text()}_`] : [];
  if (node.attrs.role === "img" && node.attrs["aria-label"]) return [`_Diagram: ${escapeMarkdown(node.attrs["aria-label"])}_`];
  if (tag === "details") {
    const summary = node.children.find((child) => child.tag === "summary");
    const question = summary && squash(joinInline(summary.children, base));
    return [...(question ? [`**${question}**`] : []), ...blocks(node.children.filter((child) => child !== summary), base)];
  }
  if (tag === "figure" && (hasClass(node, "code") || hasClass(node, "terminal"))) {
    const pre = findNode(node, (child) => child.tag === "pre");
    const title = findNode(node, (child) => hasClass(child, "code__title") || hasClass(child, "terminal__title"));
    const titleText = title && squash(joinInline(title.children, base));
    const language = hasClass(node, "terminal") ? "text" : (/\blanguage-([\w-]+)/.exec(findNode(pre ?? node, (child) => child.tag === "code")?.attrs.class ?? "")?.[1] ?? "");
    return [...(titleText ? [`**${titleText}**`] : []), ...(pre ? [fence(textContent(pre), language)] : [])];
  }
  return blocks(node.children, base);
}

/** Markdown for a fragment of the site's HTML. Relative links resolve against `base` (the page URL). */
export function htmlToMarkdown(markup, base = `${site.origin}/`) {
  const text = blocks(parseHtml(String(markup)).children, base).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? `${text}\n` : "";
}

const inlineMarkdown = (value) => htmlToMarkdown(`<p>${value instanceof SafeHtml ? value.value : escape(value)}</p>`).trim();

/** Markdown body of a page: H1, "In short", lede (article/docs), the rendered body, then sources. */
function markdownBody(page, bodyHtml) {
  const summary = page.summary ? `> **In short:** ${inlineMarkdown(page.summary.trim())}` : "";
  let body = htmlToMarkdown(bodyHtml, page.url);
  if (page.layout === "page" && /^# /m.test(body)) {
    // The hero <h1> is part of the body: the summary goes right under it.
    if (summary) body = body.replace(/^# .*$/m, (heading) => `${heading}\n\n${summary}`);
  } else {
    const heading = inlineMarkdown(page.h1 ?? page.heading ?? page.title);
    const lede = page.layout === "page" ? "" : inlineMarkdown(page.lede ?? page.description);
    body = [`# ${heading}`, summary, lede, body.trim()].filter(Boolean).join("\n\n");
  }
  const sources = (page.sources ?? []).map((entry, index) => `${index + 1}. [${inlineMarkdown(entry.title)}](${absoluteUrl(entry.url)})${entry.publisher ? ` — ${inlineMarkdown(entry.publisher)}` : ""}`);
  return `${[body.trim(), sources.length ? `## Sources\n\n${sources.join("\n")}` : ""].filter(Boolean).join("\n\n")}\n`;
}

/** The <path>.md file: YAML front matter, then the Markdown body. */
function markdownFile(page, body) {
  const author = page.author && (typeof page.author === "string" ? page.author : page.author.name);
  const front = [
    `title: ${JSON.stringify(page.documentTitle)}`,
    `description: ${JSON.stringify(page.description)}`,
    `url: ${page.url}`,
    `last_updated: ${page.dateModified ?? page.lastmod}`,
    ...(page.datePublished ? [`published: ${page.datePublished}`] : []),
    ...(author ? [`author: ${JSON.stringify(author)}`] : []),
  ];
  return `---\n${front.join("\n")}\n---\n\n${body}`;
}

function sitemapXml(pages) {
  const urls = pages.map(
    (page) =>
      `  <url><loc>${escape(page.url)}</loc><lastmod>${page.dateModified ?? page.lastmod}</lastmod>${page.changefreq ? `<changefreq>${page.changefreq}</changefreq>` : ""}${page.priority !== undefined ? `<priority>${page.priority.toFixed(1)}</priority>` : ""}</url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function rssXml(posts, now) {
  const items = posts.map(
    (post) => `    <item>
      <title>${escape(post.heading ?? post.title)}</title>
      <link>${escape(post.url)}</link>
      <guid isPermaLink="true">${escape(post.url)}</guid>
      <pubDate>${rfc822(post.datePublished)}</pubDate>
      <description>${escape(post.description)}</description>
${post.tags.map((tag) => `      <category>${escape(tag)}</category>`).join("\n")}
    </item>`,
  );
  const lastBuild = posts.length ? rfc822(posts[0].dateModified ?? posts[0].datePublished) : now.toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(site.name)} blog</title>
    <link>${site.origin}/blog</link>
    <description>Notes on x402 agentic payment security, conformance and evidence.</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${site.origin}/rss.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>
`;
}

const LLMS_GROUPS = [
  { title: "Product", test: (path) => /^\/(?:$|product|mcp|use-cases|pricing)/.test(path) },
  { title: "Docs", test: (path) => /^\/docs(?:\/|$)/.test(path) },
  { title: "Tools", test: (path) => /^\/tools(?:\/|$)/.test(path) },
  { title: "Learn", test: (path) => /^\/learn(?:\/|$)/.test(path) },
  { title: "Blog", test: (path) => /^\/blog(?:\/|$)/.test(path) },
  { title: "Optional", test: () => true },
];

/** Indexable pages grouped by LLMS_GROUPS (Product first, Optional last); path order inside a group. */
function llmsSections(pages) {
  const sections = LLMS_GROUPS.map((group) => ({ title: group.title, pages: [] }));
  for (const page of pages) sections[LLMS_GROUPS.findIndex((group) => group.test(page.path))].pages.push(page);
  return sections.filter((section) => section.pages.length);
}

function llmsHeader() {
  return `# ${site.name}

> ${site.tagline}

${site.description}

Facts that matter when describing Settlens:

- Passive scans of x402 V2 paid resources are the default and never send a payment signature.
- The optional active probe requires explicit authorization, sends one intentionally invalid PAYMENT-SIGNATURE, never calls /settle and never moves funds.
- Offline payment verification recovers EIP-3009 / EIP-712 signers (EVM exact scheme) and checks every present ed25519 signer of a Solana transaction (empty slots, such as the fee payer's before settlement, are reported as pending); it does not check on-chain balances, nonce use or settlement.
- Settlens checks x402 V2 over HTTP: a V1 endpoint (no PAYMENT-REQUIRED header) fails the header check, and a payment request for an MCP tool resource (mcp:// URL) is answered do_not_pay rather than evaluated.
- Settlens is not a blockchain, has no token and never custodies funds, wallets or payment keys (signed evidence uses the pilot's own ed25519 signing key).
- The CLI (v${site.version}, Node.js 20 or newer) is available to pilot participants; the code is in a source repository.

Full text of this site: ${site.origin}/llms-full.txt
Every page is also available as Markdown: append .md to its URL (the home page is ${site.origin}/index.md).
Remote MCP endpoint: ${site.origin}/mcp (Streamable HTTP; the offline tools are public).
`;
}

const llmsText = (value) => String(value).replace(/\s+/g, " ").trim();

function llmsTxt(pages) {
  const body = llmsSections(pages)
    .map((section) => `## ${section.title}\n\n${section.pages.map((page) => `- [${llmsText(page.heading ?? page.title)}](${site.origin}${page.markdownUrl}): ${llmsText(page.summary ?? page.description)}`).join("\n")}`)
    .join("\n\n");
  return `${llmsHeader()}\n${body}\n`;
}

// Legal notices and the contact form say nothing about the product: left out of the full text.
const LLMS_FULL_EXCLUDED = (page) => page.section === "legal" || page.path === "/contact";

/** Every indexable page as Markdown, most important first (same order as llms.txt). */
function llmsFullTxt(pages, markdown) {
  const parts = llmsSections(pages.filter((page) => !LLMS_FULL_EXCLUDED(page)))
    .flatMap((section) => section.pages)
    .map((page) => `URL: ${page.url}\nLast updated: ${page.dateModified ?? page.lastmod}\n\n${markdown.get(page.path)}`);
  return `${llmsHeader()}\n---\n\n${parts.join("\n---\n\n")}`;
}

// AI assistants, AI search and training crawlers, each token checked on its vendor's page (2026-10-13):
// developers.openai.com/api/docs/bots, support.claude.com/en/articles/8896518, docs.perplexity.ai/guides/bots,
// developers.google.com/search/docs/crawling-indexing/google-common-crawlers, support.apple.com/en-us/119829,
// duckduckgo.com/duckduckgo-help-pages/results/duckassistbot, commoncrawl.org/ccbot, developer.amazon.com/amazonbot,
// developers.facebook.com/docs/sharing/webmasters/web-crawlers, docs.mistral.ai/robots.
export const AI_CRAWLERS = Object.freeze([
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-User", "Claude-SearchBot",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended",
  "Applebot", "Applebot-Extended",
  "DuckAssistBot",
  "CCBot",
  "Amazonbot", "Amzn-SearchBot", "Amzn-User",
  "meta-externalagent", "meta-externalfetcher", "meta-webindexer",
  "MistralAI-User", "MistralAI-Index", "MistralAI-Training",
]);

// RFC 9309: a crawler that matches a named group ignores the * group, so the AI group repeats every rule.
function robotsTxt() {
  const rules = "Allow: /\nDisallow: /api/\n";
  return `User-agent: *\n${rules}\n# AI assistants, AI search and training crawlers: the same rules, stated explicitly.\n${AI_CRAWLERS.map((name) => `User-agent: ${name}\n`).join("")}${rules}\nSitemap: ${site.origin}/sitemap.xml\n`;
}

/**
 * Speculation rules, sent with every HTML response as `Speculation-Rules: "/speculation-rules.json"` (no CSP
 * change): same-origin page links are prerendered on hover/pointerdown. "/*.*" excludes every URL whose path has a
 * dot: files, assets, the .md alternates, llms.txt and llms-full.txt; page paths never contain one.
 */
export const SPECULATION_RULES = Object.freeze({
  prerender: [
    {
      where: {
        and: [{ href_matches: "/*" }, { not: { href_matches: ["/api/*", "/*.*"] } }, { not: { selector_matches: "[download], [rel~=nofollow], [data-no-prerender]" } }],
      },
      eagerness: "moderate",
    },
  ],
});

function manifest() {
  return `${JSON.stringify(
    {
      name: site.name,
      short_name: site.name,
      description: site.tagline,
      lang: site.lang,
      start_url: "/",
      scope: "/",
      display: "minimal-ui",
      background_color: site.themeColor,
      theme_color: site.themeColor,
      icons: [
        { src: "/assets/favicon.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/assets/logo-mark.png", sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  )}\n`;
}

// RFC 9116 recommends an expiry under a year; the image is rebuilt on every release, which refreshes it.
function securityTxt(now, hasPolicy) {
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 180);
  return [
    `Contact: mailto:${site.email}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en, fr",
    `Canonical: ${site.origin}/.well-known/security.txt`,
    ...(hasPolicy ? [`Policy: ${site.origin}/security`] : []),
    "",
  ].join("\n");
}

async function assertReplaceable(outDir) {
  let entries = [];
  try {
    entries = await readdir(outDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (entries.length && !entries.includes(MARKER)) {
    throw new Error(`Refusing to clean ${outDir}: it is not empty and was not created by the site build.`);
  }
}

// rename() cannot replace a non-empty directory, so the previous build is moved aside first. A concurrent
// build can swap its own output in between; then that one is moved aside too and the rename retried.
async function swapIn(staging, outDir) {
  const previous = `${staging}.old`;
  for (let attempt = 1; ; attempt += 1) {
    await assertReplaceable(outDir);
    const moved = await rename(outDir, previous).then(
      () => true,
      (error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
    try {
      await rename(staging, outDir);
      await rm(previous, { recursive: true, force: true });
      return;
    } catch (error) {
      if (["ENOTEMPTY", "EEXIST"].includes(error.code) && attempt < 5) {
        await rm(previous, { recursive: true, force: true });
        continue;
      }
      if (moved) await rename(previous, outDir).catch(() => {}); // keep serving the previous build
      throw error;
    }
  }
}

/** Writes the build into a sibling staging directory, then swaps it into place: outDir is never half-built. */
async function writeOutDir(outDir, writes) {
  await assertReplaceable(outDir); // fail before writing anything
  await mkdir(dirname(outDir), { recursive: true });
  const staging = await mkdtemp(join(dirname(outDir), `.${basename(outDir)}.tmp-`));
  try {
    await chmod(staging, 0o755); // mkdtemp creates 0700; the server may run as another user
    // The marker lets the next build replace this directory (and only directories carrying it).
    await writeFile(join(staging, MARKER), "Generated by site/build.js. This directory is replaced on every build.\n");
    for (const [file, content] of writes) {
      const target = join(staging, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await swapIn(staging, outDir);
  } finally {
    await rm(staging, { recursive: true, force: true }); // left only when the build failed before the swap
  }
}

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
// Text the server negotiates as file.br / file.gz; images and fonts are compressed already.
const COMPRESSIBLE = /\.(?:css|html|js|json|md|svg|txt|webmanifest|xml)$/;
const readOptional = (file) => readFile(file).catch((error) => (error.code === "ENOENT" ? undefined : Promise.reject(error)));

/** Validated page records (meta plus derived fields such as url, layout and markdownUrl), sorted by path, not rendered. */
export async function pageRecords({ pagesDir = DEFAULT_PAGES_DIR, extraPages = [], requireSummary = false } = {}) {
  const errors = [];
  const loaded = await loadPages(pagesDir, extraPages);
  const valid = loaded.filter((page) => validateMeta(page, errors, requireSummary));
  if (errors.length) throw new BuildError(errors);
  return valid.map(toRecord).sort((a, b) => a.path.localeCompare(b.path));
}

/** Fingerprinted assets: minified CSS (font URL rewritten), site.js, the font and, when it exists, tools.js. */
async function readAssets(errors) {
  const font = await readFile(join(SOURCE_ASSETS, "fonts", "Inter-latin-var.woff2"));
  const fontUrl = `/assets/inter.${hashOf(font)}.woff2`;
  const cssSource = await readFile(join(SOURCE_ASSETS, "site.css"), "utf8");
  if (!cssSource.includes(FONT_SOURCE_URL)) errors.push(`site/src/assets/site.css must load the font from ${FONT_SOURCE_URL} (layout.js preloads it on every page).`);
  const css = minifyCss(cssSource.replaceAll(FONT_SOURCE_URL, fontUrl));
  const js = await readFile(join(SOURCE_ASSETS, "site.js"));
  const tools = await readOptional(join(SOURCE_ASSETS, "tools.js"));
  const assets = { css: `/assets/site.${hashOf(css)}.css`, js: `/assets/site.${hashOf(js)}.js`, font: fontUrl, ...(tools ? { tools: `/assets/tools.${hashOf(tools)}.js` } : {}) };
  const files = [
    [assets.css, css],
    [assets.js, js],
    [assets.font, font],
    // The OFL travels with the font.
    ["/assets/LICENSE-Inter.txt", await readFile(join(SOURCE_ASSETS, "fonts", "LICENSE-Inter.txt"))],
    ...(tools ? [[assets.tools, tools]] : []),
  ];
  return { assets, files };
}

/** Sets page.ogImage for every indexable page that has site/src/assets/og/<slug>.png; returns the files to publish. */
async function attachOgImages(records, errors) {
  const names = new Set(await readdir(OG_DIR).catch((error) => (error.code === "ENOENT" ? [] : Promise.reject(error))));
  const files = [];
  for (const page of records) {
    const name = `${ogSlug(page.path)}.png`;
    if (page.noindex || !names.has(name)) continue;
    const image = await readFile(join(OG_DIR, name));
    try {
      page.ogImage = { url: `${site.origin}/assets/og/${name}`, ...pngSize(image) };
      files.push([`/assets/og/${name}`, image]);
    } catch (error) {
      errors.push(`site/src/assets/og/${name}: ${error.message}.`);
    }
  }
  return files;
}

async function indexNowKey(errors) {
  const key = (await readOptional(INDEXNOW_KEY_FILE))?.toString("utf8").trim();
  // IndexNow: 8-128 characters of a-z, A-Z, 0-9 and "-".
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key ?? "")) errors.push("site/src/data/indexnow-key.txt must hold the IndexNow key (8-128 characters: letters, digits, -).");
  return key;
}

/** Adds file.br (quality 11) and file.gz (level 9) next to every compressible file of 1 KiB or more. */
async function precompressed(writes) {
  const jobs = writes
    .filter(([file, content]) => COMPRESSIBLE.test(file) && Buffer.byteLength(content) >= 1024)
    .flatMap(([file, content]) => [
      brotliAsync(content, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(content) } }).then((data) => [`${file}.br`, data]),
      gzipAsync(content, { level: 9 }).then((data) => [`${file}.gz`, data]),
    ]);
  return Promise.all(jobs);
}

/**
 * Builds the site into outDir. Throws BuildError (nothing written) when any check fails.
 * allowMissing tolerates broken links to the listed paths; leave it empty for release builds.
 * requireSummary makes meta.summary mandatory on every indexable, non-legal page.
 */
export async function buildSite({ outDir = DEFAULT_OUT_DIR, allowMissing = [], pagesDir = DEFAULT_PAGES_DIR, extraPages = [], now = new Date(), requireSummary = false } = {}) {
  await assertReplaceable(outDir); // fail fast, before rendering and compressing
  const errors = [];
  const records = await pageRecords({ pagesDir, extraPages, requireSummary });
  const byPath = new Map();
  for (const record of records) {
    if (byPath.has(record.path)) errors.push(`duplicate path ${record.path} in ${byPath.get(record.path).source} and ${record.source}.`);
    byPath.set(record.path, record);
  }
  if (!byPath.has(NOT_FOUND_PATH)) errors.push(`no page with path ${NOT_FOUND_PATH} (needed for 404.html).`);
  const { canonical, errors: jsonLdErrors } = canonicalJsonLd(records);
  errors.push(...jsonLdErrors);
  if (errors.length) throw new BuildError(errors);
  for (const record of records) {
    if (record.jsonLd) record.jsonLd = [record.jsonLd].flat().map((node) => canonical.get(node["@id"]) ?? node);
  }

  const { assets, files: assetFiles } = await readAssets(errors);
  for (const page of records) {
    if (page.scripts?.includes("tools") && !assets.tools) errors.push(`${page.source}: meta.scripts includes "tools" but site/src/assets/tools.js does not exist.`);
  }
  const ogFiles = await attachOgImages(records, errors);
  const key = await indexNowKey(errors);
  if (errors.length) throw new BuildError(errors);

  // Two passes: the first measures reading time so hubs can show it in the second.
  const bodies = new Map();
  for (const pass of [1, 2]) {
    for (const page of records) {
      try {
        bodies.set(page.path, renderBody(page, records, byPath));
      } catch (error) {
        if (pass === 1) errors.push(`${page.source}: render failed: ${error.message}`);
      }
    }
    if (errors.length) throw new BuildError(errors);
    if (pass === 1) for (const page of records) page.readingMinutes = readingMinutes(bodies.get(page.path));
  }

  const year = now.getUTCFullYear();
  const rendered = new Map();
  const markdown = new Map();
  for (const page of records) {
    const { html: body, headings } = processHeadings(bodies.get(page.path));
    const ctx = createContext(page, records, byPath);
    const main = LAYOUTS[page.layout]({ page, body, headings: page.toc === false ? [] : headings, crumbs: crumbsFor(page, byPath), ctx });
    const markup = documentShell({ page, main, assets, year });
    errors.push(...validateHtml(page.source, markup));
    rendered.set(page.path, markup);
    if (page.markdownUrl) markdown.set(page.path, markdownBody(page, body));
  }

  const indexable = records.filter((page) => !page.noindex);
  const posts = blogPosts(records);
  const llmsFull = llmsFullTxt(indexable, markdown);
  if (Buffer.byteLength(llmsFull) > LLMS_FULL_MAX_BYTES) errors.push(`llms-full.txt is ${Buffer.byteLength(llmsFull)} bytes (max ${LLMS_FULL_MAX_BYTES}).`);
  const brandFiles = (await readdir(BRAND_ASSETS, { withFileTypes: true })).filter((entry) => entry.isFile() && !entry.name.startsWith(".")).map((entry) => entry.name);
  const generated = new Map([
    ["/sitemap.xml", sitemapXml(indexable)],
    ["/robots.txt", robotsTxt()],
    ["/rss.xml", rssXml(posts, now)],
    ["/llms.txt", llmsTxt(indexable)],
    ["/llms-full.txt", llmsFull],
    ["/manifest.webmanifest", manifest()],
    ["/.well-known/security.txt", securityTxt(now, byPath.has("/security"))],
    ["/speculation-rules.json", `${JSON.stringify(SPECULATION_RULES, null, 2)}\n`],
    // IndexNow ownership proof: the key file holds exactly the key.
    [`/${key}.txt`, key],
    ...assetFiles,
    ...ogFiles,
    ...indexable.map((page) => [page.markdownUrl, markdownFile(page, markdown.get(page.path))]),
  ]);
  const files = new Set([...generated.keys(), ...brandFiles.map((name) => `/assets/${name}`)]);
  errors.push(...checkLinks(rendered, files, allowMissing));
  if (errors.length) throw new BuildError(errors);

  const writes = [...generated].map(([path, content]) => [path.slice(1), content]);
  // Re-written rather than copied so files get default permissions (a 0600 source would be unreadable to the server user).
  for (const name of brandFiles) writes.push([`assets/${name}`, await readFile(join(BRAND_ASSETS, name))]);
  for (const page of records) writes.push([page.outFile, rendered.get(page.path)]);
  writes.push(...(await precompressed(writes)));
  await writeOutDir(outDir, writes);
  return { outDir, pages: records.map(({ render: _render, ...page }) => page), assets, files: [...files] };
}

function parseAllowMissing(args) {
  const flag = args.find((arg) => arg.startsWith("--allow-missing"));
  if (!flag) return undefined;
  return flag.split("=")[1] ?? "pending";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outArg = args.find((arg) => !arg.startsWith("--"));
  const allowArg = parseAllowMissing(args);
  const allowMissing = allowArg === undefined ? [] : allowArg === "pending" ? await pendingRoutes() : allowArg.split(",").filter(Boolean);
  if (allowMissing.length) console.warn(`WARNING: tolerating ${allowMissing.length} missing route(s); never ship this build:\n  ${allowMissing.join("\n  ")}`);
  try {
    const result = await buildSite({ outDir: outArg ? resolve(outArg) : DEFAULT_OUT_DIR, allowMissing, requireSummary: args.includes("--require-summary") });
    console.log(`Built ${result.pages.length} pages into ${result.outDir}`);
  } catch (error) {
    console.error(error.message);
    if (error.errors?.some((message) => message.startsWith("broken internal link"))) {
      console.error("Routes promised by the nav/footer that have no page yet can be tolerated while drafting with --allow-missing=pending (never ship that build).");
    }
    process.exitCode = 1;
  }
}
