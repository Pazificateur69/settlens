import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { AI_CRAWLERS, buildSite, canonicalJsonLd, checkLinks, INDEXNOW_KEY_FILE, OG_MANIFEST, ogSlug, ogTitle, pendingRoutes, SPECULATION_RULES, validateHtml } from "../site/build.js";
import { CONTENT_SECURITY_POLICY, createSiteServer, GONE, LEGACY_REDIRECTS, redirectFor, SPECULATION_RULES_PATH } from "../site/server.js";
import { declaredRoutes, site } from "../site/src/data/site.js";
import * as components from "../site/src/lib/components.js";
import { html } from "../site/src/lib/html.js";

const BUILD_SCRIPT = fileURLToPath(new URL("../site/build.js", import.meta.url));
const INDEXNOW_SCRIPT = fileURLToPath(new URL("../site/tools/indexnow.mjs", import.meta.url));
const SOURCE_ASSETS = fileURLToPath(new URL("../site/src/assets/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const NOW = new Date("2026-10-13T12:00:00Z");

// Until content agents add every declared route, the suite stands in a minimal page for each
// missing one so the strict build (no allowMissing) still runs. The todo test below lists them.
function stubPage(path) {
  const blog = path.startsWith("/blog/");
  return {
    meta: {
      path,
      title: `Pending ${path}`,
      description: "Stand-in used by the test suite until the page module for this declared route exists, so the strict build still covers the route.",
      section: "test",
      lastmod: "2026-10-01",
      ...(blog ? { datePublished: "2026-10-01", author: "Settlens", tags: ["test"] } : {}),
    },
    render: (ctx) =>
      ctx.page.layout === "page"
        ? ctx.html`<div class="container"><h1>Pending ${path}</h1><p>Stand-in body.</p></div>`
        : ctx.html`<h2>Overview</h2><p>Stand-in body for ${path}.</p><h3>Detail</h3><p>More text.</p><h2>Next</h2><p>End.</p>`,
  };
}

const minimalPage = (path, overrides = {}, body = (ctx) => ctx.html`<h1>Title</h1>`) => ({
  meta: { path, title: "Fixture page", description: "A fixture page used to prove that the site build rejects invalid input and accepts valid metadata, layouts, links and structured data.", section: "test", lastmod: "2026-10-13", ...overrides },
  render: body,
});

let work;
let outDir;
let pending;
let built;
const documents = new Map();

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])));
  return nested.flat();
}

before(async () => {
  work = await mkdtemp(join(tmpdir(), "settlens-site-"));
  outDir = join(work, "public");
  pending = await pendingRoutes();
  built = await buildSite({ outDir, extraPages: pending.map(stubPage), now: NOW });
  for (const page of built.pages) documents.set(page.path, await readFile(join(outDir, page.outFile), "utf8"));
});

after(async () => {
  await rm(work, { recursive: true, force: true });
});

test("every route promised by the nav, footer and docs sidebar has a page module", async (t) => {
  const missing = await pendingRoutes();
  if (missing.length) t.todo(`${missing.length} route(s) still need a page module: ${missing.join(", ")}`);
  else assert.deepEqual(missing, []);
});

test("the build writes one document per page plus the generated files", async () => {
  assert.ok(built.pages.length >= declaredRoutes.length + 2);
  for (const file of ["index.html", "404.html", "styleguide/index.html", "sitemap.xml", "robots.txt", "rss.xml", "llms.txt", "llms-full.txt", "index.md", "speculation-rules.json", "manifest.webmanifest", ".well-known/security.txt", "assets/og-image.png", "assets/favicon.svg", "assets/logo-horizontal-white.svg", "assets/LICENSE-Inter.txt"]) {
    await stat(join(outDir, file));
  }
  // The server runs as a non-root user: copied brand files must be world-readable even if the source is 0600.
  assert.ok((await stat(join(outDir, "assets/og-image.png"))).mode & 0o004);
  assert.match(built.assets.css, /^\/assets\/site\.[a-f0-9]{10}\.css$/);
  assert.match(built.assets.js, /^\/assets\/site\.[a-f0-9]{10}\.js$/);
  const css = await readFile(join(outDir, built.assets.css));
  const js = await readFile(join(outDir, built.assets.js));
  assert.ok(css.length < 60_000, `CSS is ${css.length} bytes`);
  assert.ok(js.length < 10_000, `JS is ${js.length} bytes`);
});

test("every page has one h1, title, description, canonical, Open Graph and Twitter tags", () => {
  for (const page of built.pages) {
    const doc = documents.get(page.path);
    const label = page.path;
    assert.equal(doc.match(/<h1[\s>]/g)?.length, 1, `${label}: h1 count`);
    const title = doc.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && title.length <= 70, `${label}: title`);
    const description = doc.match(/<meta name="description" content="([^"]+)">/)?.[1];
    assert.ok(description && description.length >= 50, `${label}: description`);
    if (page.path === "/404") {
      // Served at every unknown URL: no canonical, og:url or page entity pointing at /404.
      assert.ok(!doc.includes('rel="canonical"') && !doc.includes('property="og:url"') && !doc.includes("/404#webpage"), "/404: no canonical");
      continue;
    }
    assert.ok(doc.includes(`<link rel="canonical" href="https://settlens.com${page.path}">`), `${label}: canonical`);
    assert.ok(!/<link rel="canonical" href="https:\/\/settlens\.com\/.+\/">/.test(doc), `${label}: canonical without trailing slash`);
    for (const property of ["og:type", "og:title", "og:description", "og:url", "og:image", "og:site_name"]) {
      assert.match(doc, new RegExp(`<meta property="${property}" content="[^"]+">`), `${label}: ${property}`);
    }
    // The page's own image (site/tools/og.mjs) when it has one, else the site default.
    const image = page.ogImage ?? { url: "https://settlens.com/assets/og-image.jpg", width: 1512, height: 794 };
    assert.ok(doc.includes(`<meta property="og:image:width" content="${image.width}">`), `${label}: og width`);
    assert.ok(doc.includes(`<meta property="og:image:height" content="${image.height}">`), `${label}: og height`);
    assert.ok(doc.includes(`<meta property="og:image" content="${image.url}">`) && doc.includes(`<meta property="og:image:type" content="${page.ogImage ? "image/png" : "image/jpeg"}">`), `${label}: og image type`);
    for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
      assert.match(doc, new RegExp(`<meta name="${name}" content="[^"]+">`), `${label}: ${name}`);
    }
    assert.ok(doc.includes(`href="${built.assets.css}"`) && doc.includes(`src="${built.assets.js}"`), `${label}: fingerprinted assets`);
  }
});

test("no page uses inline styles, inline scripts or invalid JSON-LD", () => {
  for (const [path, doc] of documents) {
    assert.doesNotMatch(doc, /<[a-z][^>]*\sstyle\s*=/i, `${path}: style attribute`);
    assert.doesNotMatch(doc, /<style[\s>]/i, `${path}: style element`);
    assert.doesNotMatch(doc, /<[a-z][^>]*\son[a-z]+\s*=/i, `${path}: event handler`);
    for (const [, attrs, content] of doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (attrs.includes('type="application/ld+json"')) assert.doesNotThrow(() => JSON.parse(content), `${path}: JSON-LD`);
      else assert.ok(/\ssrc="\/assets\//.test(attrs) && !content.trim(), `${path}: inline script`);
    }
  }
});

test("every internal link and asset reference resolves to a generated file or anchor", async () => {
  const files = new Set((await walk(outDir)).map((file) => file.slice(outDir.length)));
  const ids = new Map([...documents].map(([path, doc]) => [path, new Set([...doc.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
  for (const [path, doc] of documents) {
    for (const [, raw] of doc.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const value = raw.replace(/&amp;/g, "&");
      if (/^(?:mailto|tel):/.test(value) || (/^https?:/.test(value) && !value.startsWith(site.origin))) continue;
      const url = new URL(value, `${site.origin}${path === "/404" ? "/" : path}`);
      const target = value.startsWith("#") ? path : url.pathname;
      const pageFile = target === "/" ? "/index.html" : `${target}/index.html`;
      const selfCanonical = path === "/404" && target === "/404";
      const exists = selfCanonical || files.has(pageFile) || files.has(target);
      assert.ok(exists, `${path}: ${value} does not resolve`);
      if (url.hash && documents.has(target)) assert.ok(ids.get(target).has(url.hash.slice(1)), `${path}: anchor ${value}`);
    }
  }
});

test("sitemap lists every indexable page and no noindex page", async () => {
  const xml = await readFile(join(outDir, "sitemap.xml"), "utf8");
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const expected = built.pages.filter((page) => !page.noindex).map((page) => page.url).sort();
  assert.deepEqual(locs, expected);
  assert.ok(!xml.includes("/styleguide") && !xml.includes("/404"));
  assert.equal([...xml.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length, locs.length);
  assert.match(documents.get("/styleguide"), /<meta name="robots" content="noindex, follow">/);
  assert.ok(!/href="\/styleguide"/.test(documents.get("/")), "styleguide is not linked from the nav");
});

test("robots, rss, llms.txt, security.txt and manifest are generated and parse", async () => {
  const robots = await readFile(join(outDir, "robots.txt"), "utf8");
  assert.match(robots, /^User-agent: \*\nAllow: \/\nDisallow: \/api\/\n/);
  assert.match(robots, /Sitemap: https:\/\/settlens\.com\/sitemap\.xml/);
  // RFC 9309: a crawler matching the AI group ignores *, so that group repeats Disallow: /api/.
  assert.equal(robots.match(/^User-agent: /gm).length, 1 + AI_CRAWLERS.length);
  assert.ok(robots.includes(`${AI_CRAWLERS.map((name) => `User-agent: ${name}\n`).join("")}Allow: /\nDisallow: /api/\n`));
  assert.equal(robots.match(/^Disallow: \/api\/$/gm).length, 2);
  assert.doesNotMatch(robots, /Crawl-delay/i);

  const rss = await readFile(join(outDir, "rss.xml"), "utf8");
  assert.match(rss, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
  assert.match(rss, /<atom:link href="https:\/\/settlens\.com\/rss\.xml" rel="self"/);
  const posts = built.pages.filter((page) => /^\/blog\/./.test(page.path) && !page.noindex);
  const dates = [...rss.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => Date.parse(m[1]));
  assert.equal(dates.length, posts.length);
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), "newest first");
  assert.equal(rss.match(/<item>/g)?.length ?? 0, posts.length);

  const llms = await readFile(join(outDir, "llms.txt"), "utf8");
  assert.match(llms, /^# Settlens\n\n> .+\n/);
  assert.match(llms, /never calls \/settle/);
  assert.match(llms, /never custodies funds, wallets or payment keys/);
  assert.match(llms, /\n## [A-Z][a-z]+\n\n- \[[^\]]+\]\(https:\/\/settlens\.com[^)]*\): /);

  const security = await readFile(join(outDir, ".well-known/security.txt"), "utf8");
  assert.match(security, /^Contact: mailto:contact@settlens\.com$/m);
  assert.match(security, /^Expires: 2027-04-11T12:00:00Z$/m, "180 days after the build (RFC 9116: under a year)");
  assert.match(security, /^Preferred-Languages: en, fr$/m);
  assert.match(security, /^Canonical: https:\/\/settlens\.com\/\.well-known\/security\.txt$/m);

  const manifest = JSON.parse(await readFile(join(outDir, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Settlens");
  assert.equal(manifest.theme_color, "#07111f");
  assert.ok(manifest.icons.length >= 1);
});

test("structured data covers the organization, the page and breadcrumbs", () => {
  const home = documents.get("/");
  const graph = JSON.parse(home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  const types = graph["@graph"].map((node) => node["@type"]);
  assert.deepEqual(types.slice(0, 3), ["Organization", "WebSite", "WebPage"]);
  assert.equal(graph["@graph"][0].address.addressLocality, "Porte des Pierres Dorées");
  const deep = built.pages.find((page) => page.path.split("/").length > 2 && !page.noindex);
  assert.match(documents.get(deep.path), /"@type":"BreadcrumbList"/);
  const post = built.pages.find((page) => /^\/blog\/./.test(page.path));
  assert.match(documents.get(post.path), /"@type":"BlogPosting"/);
  assert.match(documents.get(post.path), /<meta property="og:type" content="article">/);
  assert.match(documents.get("/styleguide"), /"@type":"FAQPage"/);
});

test("article and docs layouts render navigation, table of contents and pagination", () => {
  const docs = built.pages.filter((page) => page.layout === "docs");
  assert.ok(docs.length > 1);
  const doc = documents.get(docs[1].path);
  assert.match(doc, /<nav class="docs-nav" aria-label="Documentation">/);
  assert.match(doc, /aria-current="page"/);
  assert.match(doc, /<nav class="prev-next"/);
  const article = built.pages.find((page) => page.layout === "article");
  const articleDoc = documents.get(article.path);
  assert.match(articleDoc, /<nav class="toc toc--sticky" aria-label="On this page">/);
  assert.match(articleDoc, /min read/);
});

/* ---------- Assets, compression and GEO files ---------- */

const indexablePages = () => built.pages.filter((page) => !page.noindex);

test("the font is fingerprinted, preloaded on every page and loaded by the minified CSS", async () => {
  assert.match(built.assets.font, /^\/assets\/inter\.[a-f0-9]{10}\.woff2$/);
  assert.deepEqual(await readFile(join(outDir, built.assets.font)), await readFile(join(SOURCE_ASSETS, "fonts/Inter-latin-var.woff2")));
  assert.match(await readFile(join(outDir, "assets/LICENSE-Inter.txt"), "utf8"), /SIL OPEN FONT LICENSE/i);
  const css = await readFile(join(outDir, built.assets.css), "utf8");
  assert.ok(css.includes(`url("${built.assets.font}")`), "the CSS loads the fingerprinted font");
  assert.ok(!css.includes("/assets/fonts/") && !css.includes("/*"), "source font path rewritten, comments stripped");
  assert.match(css, /font-display:optional/, "optional: the font never re-wraps text after first paint");
  assert.ok(css.length < (await readFile(join(SOURCE_ASSETS, "site.css"))).length, "the CSS is minified");
  const preload = `<link rel="preload" href="${built.assets.font}" as="font" type="font/woff2" crossorigin>`;
  for (const [path, doc] of documents) assert.equal(doc.split(preload).length - 1, 1, `${path}: one font preload`);
});

test("tools.js is fingerprinted when it exists and loaded only by pages that ask for it", async () => {
  const exists = await stat(join(SOURCE_ASSETS, "tools.js")).then(() => true, () => false);
  if (!exists) return assert.equal(built.assets.tools, undefined);
  assert.match(built.assets.tools, /^\/assets\/tools\.[a-f0-9]{10}\.js$/);
  for (const page of built.pages) {
    assert.equal(documents.get(page.path).includes(`<script src="${built.assets.tools}" defer></script>`), Boolean(page.scripts?.includes("tools")), page.path);
  }
});

test("text files ship with brotli and gzip siblings; fonts and images do not", async () => {
  const files = new Set((await walk(outDir)).map((file) => file.slice(outDir.length + 1)));
  const expected = [...built.pages.map((page) => page.outFile), built.assets.css.slice(1), built.assets.js.slice(1), "llms-full.txt", "index.md", "sitemap.xml"];
  for (const file of expected) {
    const original = await readFile(join(outDir, file));
    assert.deepEqual(brotliDecompressSync(await readFile(join(outDir, `${file}.br`))), original, `${file}.br`);
    assert.deepEqual(gunzipSync(await readFile(join(outDir, `${file}.gz`))), original, `${file}.gz`);
  }
  assert.deepEqual([...files].filter((file) => /\.(?:woff2|png|jpg)\.(?:br|gz)$/.test(file)), []);
  assert.deepEqual([...files].filter((file) => file.endsWith(".br") && !files.has(`${file.slice(0, -3)}.gz`)), [], "every .br has a .gz");
});

test("speculation rules prerender same-origin pages only, never the API, files, Markdown or llms files", async () => {
  assert.deepEqual(JSON.parse(await readFile(join(outDir, "speculation-rules.json"), "utf8")), SPECULATION_RULES);
  const [rule] = SPECULATION_RULES.prerender;
  assert.equal(rule.eagerness, "moderate");
  if (typeof URLPattern !== "function") return;
  const base = "https://settlens.com/docs/cli";
  const [include, { not: exclude }] = rule.where.and;
  const matches = (href) => {
    const url = new URL(href, base).href;
    return new URLPattern(include.href_matches, base).test(url) && !exclude.href_matches.some((pattern) => new URLPattern(pattern, base).test(url));
  };
  for (const href of ["/", "/pricing", "/docs/cli#synopsis", "/tools/x402-checker", "/learn/x402-v1-to-v2-migration"]) assert.ok(matches(href), href);
  for (const href of ["/api/scan", "/api/pilot", "/docs/cli.md", "/index.md", "/llms.txt", "/llms-full.txt", built.assets.css, "/rss.xml", "/.well-known/security.txt", "https://github.com/x402-foundation/x402"]) assert.ok(!matches(href), href);
});

test("llms.txt links each page's Markdown with its summary; llms-full.txt holds the site in importance order", async () => {
  const llms = await readFile(join(outDir, "llms.txt"), "utf8");
  assert.match(llms, /^Full text of this site: https:\/\/settlens\.com\/llms-full\.txt$/m);
  assert.match(llms, /^Remote MCP endpoint: https:\/\/settlens\.com\/mcp /m);
  assert.match(llms, /V1 endpoint \(no PAYMENT-REQUIRED header\) fails the header check/);
  const links = [...llms.matchAll(/^- \[[^\]]+\]\(https:\/\/settlens\.com(\/[^)]*)\): (.+)$/gm)];
  assert.equal(links.length, indexablePages().length);
  for (const [, path, text] of links) {
    const page = built.pages.find((entry) => entry.markdownUrl === path);
    assert.ok(page, `${path} is a Markdown alternate`);
    assert.equal(text, (page.summary ?? page.description).replace(/\s+/g, " ").trim());
    await stat(join(outDir, path));
  }
  assert.deepEqual([...llms.matchAll(/^## (.+)$/gm)].map((match) => match[1]).filter((title) => title !== "Tools"), ["Product", "Docs", "Learn", "Blog", "Optional"]);

  const full = await readFile(join(outDir, "llms-full.txt"), "utf8");
  assert.ok(Buffer.byteLength(full) < 2 * 1024 * 1024);
  assert.ok(full.startsWith(llms.slice(0, llms.indexOf("\n## "))), "same header as llms.txt");
  const order = [...full.matchAll(/^URL: (\S+)$/gm)].map((match) => match[1]);
  const expected = indexablePages().filter((page) => page.section !== "legal" && page.path !== "/contact").map((page) => page.url);
  assert.deepEqual([...order].sort(), [...expected].sort());
  assert.equal(order[0], "https://settlens.com/", "the home page comes first");
  assert.ok(order.indexOf("https://settlens.com/docs") < order.indexOf("https://settlens.com/learn") && order.indexOf("https://settlens.com/learn") < order.indexOf("https://settlens.com/blog"));
  assert.ok(!full.includes("URL: https://settlens.com/privacy"));
});

test("every indexable page has a Markdown alternate generated from its rendered content", async () => {
  for (const page of built.pages) {
    const doc = documents.get(page.path);
    if (page.noindex) {
      assert.equal(page.markdownUrl, undefined, page.path);
      assert.ok(!doc.includes('type="text/markdown"'), `${page.path}: no Markdown alternate`);
      continue;
    }
    assert.equal(page.markdownUrl, page.path === "/" ? "/index.md" : `${page.path}.md`);
    assert.ok(doc.includes(`<link rel="alternate" type="text/markdown" href="${page.markdownUrl}"`), `${page.path}: alternate link`);
    const markdown = await readFile(join(outDir, page.markdownUrl), "utf8");
    const label = page.markdownUrl;
    assert.ok(markdown.startsWith(`---\ntitle: ${JSON.stringify(page.documentTitle)}\n`) && markdown.includes(`\nurl: ${page.url}\n`), `${label}: front matter`);
    // Fenced code and code spans may hold anything; the prose around them must be plain Markdown.
    const prose = markdown.replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1$/gm, "").replace(/(`+)[^`\n]*?\1/g, "");
    assert.equal(prose.match(/^# /gm)?.length, 1, `${label}: one H1`);
    assert.doesNotMatch(prose, /(?<!\\)<\/?[a-z][a-z0-9-]*[\s>/]/i, `${label}: HTML tag left in Markdown`);
    assert.doesNotMatch(prose, /\]\((?!https:\/\/|mailto:|tel:)/, `${label}: relative link`);
    assert.doesNotMatch(prose, /&(?:amp|lt|gt|quot|#\d+);/, `${label}: undecoded entity`);
    if (page.summary) assert.ok(markdown.includes("> **In short:** "), `${label}: summary`);
    if (page.sources?.length) assert.match(markdown, /\n## Sources\n\n1\. \[/, `${label}: sources`);
  }
  const cli = await readFile(join(outDir, "docs/cli.md"), "utf8");
  assert.match(cli, /^# CLI reference$/m);
  assert.match(cli, /\n```shell\n/);
  assert.match(cli, /\n\| Code \| Meaning \|\n\| --- \| --- \|\n/);
});

test("summary, sources and scripts appear in Markdown and llms.txt, and the build validates them", async () => {
  const summary = "Settlens answers first: this fixture page has an In short summary that is long enough to pass the 120 character minimum check.";
  const sources = [{ title: "x402 specification v2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" }];
  const dir = await mkdtemp(join(work, "geo-"));
  const result = await buildSite({
    outDir: join(dir, "out"),
    pagesDir: join(dir, "no-pages"),
    extraPages: [
      minimalPage("/a", { summary, sources }, (ctx) => ctx.html`<section class="hero"><h1>Fixture</h1><p>Lede.</p></section><p>Body <a href="/b">link</a>.</p>`),
      minimalPage("/learn/b", { summary, sources }, (ctx) => ctx.html`<p>Article body.</p>`),
      minimalPage("/404"),
    ],
    allowMissing: [...declaredRoutes, "/b"],
    requireSummary: true,
    now: NOW,
  });
  const page = await readFile(join(result.outDir, "a.md"), "utf8");
  assert.match(page, /\n# Fixture\n\n> \*\*In short:\*\* Settlens answers first: [^\n]+\n\nLede\.\n\nBody \[link\]\(https:\/\/settlens\.com\/b\)\.\n\n## Sources\n\n1\. \[x402 specification v2\]\(https:\/\/github\.com\/x402-foundation\/x402\/blob\/main\/specs\/x402-specification-v2\.md\) — x402 Foundation\n$/);
  const article = await readFile(join(result.outDir, "learn/b.md"), "utf8");
  assert.match(article, /\n# Fixture page\n\n> \*\*In short:\*\* [^\n]+\n\nA fixture page used to prove[^\n]+\n\nArticle body\.\n\n## Sources\n/);
  assert.match(await readFile(join(result.outDir, "llms.txt"), "utf8"), /^- \[Fixture page\]\(https:\/\/settlens\.com\/a\.md\): Settlens answers first: /m);

  const page2 = (overrides) => [minimalPage("/a", overrides)];
  await expectBuildFailure(page2({ summary: "Too short." }), /summary is 10 characters \(must be 120-320\)/);
  await expectBuildFailure(page2({ summary: "x".repeat(321) }), /summary is 321 characters/);
  await expectBuildFailure(page2({}), /missing summary/, { requireSummary: true });
  await expectBuildFailure(page2({ sources: [] }), /sources must be a non-empty array/);
  await expectBuildFailure(page2({ sources: [{ title: "", url: "http://example.com/spec", publisher: 3 }] }), /sources\[0\] needs a title[\s\S]*sources\[0\]\.url must be an absolute https URL[\s\S]*sources\[0\]\.publisher/);
  await expectBuildFailure(page2({ sources: [{ title: "Spec", url: "/docs" }] }), /absolute https URL/);
  await expectBuildFailure(page2({ scripts: ["analytics"] }), /scripts must be an array of: "tools"/);
  if (!built.assets.tools) await expectBuildFailure(page2({ scripts: ["tools"] }), /tools\.js does not exist/);
  // Legal pages and noindex pages never need a summary.
  await buildSite({ outDir: join(dir, "legal"), pagesDir: join(dir, "no-pages"), extraPages: [minimalPage("/a", { section: "legal" }), minimalPage("/b", { noindex: true }), minimalPage("/404")], allowMissing: [...declaredRoutes], requireSummary: true, now: NOW });
});

test("the IndexNow key is served at /<key>.txt and the submit script lists the sitemap URLs", async () => {
  const key = (await readFile(INDEXNOW_KEY_FILE, "utf8")).trim();
  assert.match(key, /^[a-f0-9]{32}$/);
  assert.equal(await readFile(join(outDir, `${key}.txt`), "utf8"), key);
  const run = (...args) => spawnSync(process.execPath, [INDEXNOW_SCRIPT, "--dry-run", `--sitemap=${join(outDir, "sitemap.xml")}`, ...args], { encoding: "utf8" });
  const all = run();
  assert.equal(all.status, 0, all.stderr);
  const request = JSON.parse(all.stdout.slice(all.stdout.indexOf("{")));
  assert.deepEqual(request, { host: "settlens.com", key, keyLocation: `https://settlens.com/${key}.txt`, urlList: indexablePages().map((page) => page.url) });
  assert.match(run("--since=2999-01-01").stdout, /No URL to submit/);
  assert.notEqual(run("--since=yesterday").status, 0);
});

test("every indexable page has a current Open Graph image (node site/tools/og.mjs)", async (t) => {
  const manifest = JSON.parse(await readFile(OG_MANIFEST, "utf8"));
  if (!Object.keys(manifest).length) return t.todo("no Open Graph image generated yet: run node site/tools/og.mjs");
  const pages = indexablePages().filter((page) => !pending.includes(page.path));
  assert.equal(new Set(pages.map((page) => ogSlug(page.path))).size, pages.length, "one file name per page");
  const missing = pages.filter((page) => !page.ogImage).map((page) => page.path);
  const stale = pages.filter((page) => page.ogImage && manifest[ogSlug(page.path)]?.title !== ogTitle(page)).map((page) => page.path);
  assert.deepEqual({ missing, stale }, { missing: [], stale: [] }, "run node site/tools/og.mjs (or --only=<paths>) and commit the images");
  for (const page of pages) assert.deepEqual([page.ogImage.width, page.ogImage.height], [1200, 630], page.path);
});

/* ---------- Build failure modes ---------- */

async function expectBuildFailure(pages, pattern, { with404 = true, requireSummary = false } = {}) {
  const dir = await mkdtemp(join(work, "fail-"));
  const extraPages = with404 ? [...pages, minimalPage("/404")] : pages;
  await assert.rejects(buildSite({ outDir: join(dir, "out"), pagesDir: join(dir, "no-pages"), extraPages, requireSummary, now: NOW }), (error) => {
    assert.equal(error.name, "BuildError");
    assert.match(error.message, pattern);
    return true;
  });
}

test("the build rejects invalid page metadata", async () => {
  await expectBuildFailure([minimalPage("/a"), minimalPage("/a")], /duplicate path \/a/);
  await expectBuildFailure([minimalPage("/a", { title: "" })], /missing title/);
  await expectBuildFailure([minimalPage("/a", { title: "x".repeat(60) })], /characters \(max 60\)/);
  await expectBuildFailure([minimalPage("/a", { description: undefined })], /missing description/);
  await expectBuildFailure([minimalPage("/a", { description: "y".repeat(119) })], /must be 120-160/);
  await expectBuildFailure([minimalPage("/a", { description: "y".repeat(161) })], /must be 120-160/);
  await expectBuildFailure([minimalPage("/a/", {})], /invalid path/);
  await expectBuildFailure([minimalPage("/a", { priority: "0.5" })], /priority must be a number/);
  await expectBuildFailure([minimalPage("/a", { lastmod: "13/10/2026", section: "" })], /lastmod must be YYYY-MM-DD/);
  await expectBuildFailure([minimalPage("/blog/post", {})], /blog posts require datePublished/);
  await expectBuildFailure([minimalPage("/a", { layout: "nope", ogType: "x", changefreq: "often", priority: 3, jsonLd: [1], datePublished: "soon" })], /datePublished must be[\s\S]*unknown layout[\s\S]*ogType[\s\S]*changefreq[\s\S]*priority[\s\S]*jsonLd/);
  await expectBuildFailure([{ render: () => "" }, { meta: minimalPage("/b").meta }], /missing `export const meta`[\s\S]*missing default export/);
});

test("the build rejects pages that break HTML, CSP or link rules", async () => {
  const page = (body) => minimalPage("/a", {}, body);
  await expectBuildFailure([page((ctx) => ctx.html`<p>No heading</p>`)], /expected exactly one <h1>, found 0/);
  await expectBuildFailure([page((ctx) => ctx.html`<h1>One</h1><h1>Two</h1>`)], /found 2/);
  await expectBuildFailure([page(() => '<h1 style="color:red">Styled</h1>')], /inline style= attribute/);
  await expectBuildFailure([page(() => "<h1>x</h1><script>alert(1)</script>")], /inline <script>/);
  await expectBuildFailure([page(() => '<h1>x</h1><script type="application/ld+json">{nope}</script>')], /invalid JSON-LD/);
  await expectBuildFailure([page(() => '<h1>x</h1><a href="/nowhere">x</a>')], /broken internal link "\/nowhere"/);
  await expectBuildFailure([page(() => { throw new Error("boom"); })], /render failed: boom/);
  await expectBuildFailure([page((ctx) => ctx.html`<h1>x</h1>`)], /no page with path \/404/, { with404: false });
});

test("validateHtml and checkLinks catch CSP, accessibility and link mistakes", () => {
  const shell = (body) => `<html><body><h1>t</h1>${body}</body></html>`;
  assert.deepEqual(validateHtml("ok", shell('<p id="a">x</p>')), []);
  assert.match(validateHtml("x", shell("<style>p{}</style>")).join(), /<style>/);
  assert.match(validateHtml("x", shell('<button onclick="x()">x</button>')).join(), /event handler/);
  assert.match(validateHtml("x", shell('<a href="javascript:void(0)">x</a>')).join(), /javascript: URL/);
  assert.match(validateHtml("x", shell('<img src="/a.png">')).join(), /without alt/);
  assert.match(validateHtml("x", shell('<p id="d"></p><p id="d"></p>')).join(), /duplicate id\(s\): d/);
  assert.match(validateHtml("x", shell("<a href='javascript:void(0)'>x</a>")).join(), /javascript: URL/);
  for (const external of ['<img src="https://cdn.example/a.png" alt="">', '<script src="//cdn.example/a.js"></script>', '<iframe src="https://video.example/embed" title="v"></iframe>', '<img src="/a.png" srcset="https://cdn.example/a@2x.png 2x" alt="">', '<link rel="stylesheet" href="https://fonts.example/css">', '<link href="https://fonts.example/x.woff2" rel="preload" as="font">']) {
    assert.match(validateHtml("x", shell(external)).join(), /third-party resource/, external);
  }
  assert.deepEqual(validateHtml("ok", shell('<link rel="canonical" href="https://settlens.com/x"><a href="https://example.com">x</a><img src="data:image/png;base64,AA" alt="">')), []);
  const faqLd = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
  assert.match(validateHtml("x", shell(faqLd + faqLd)).join(), /more than one FAQPage/);

  const rendered = new Map([
    ["/", '<a href="/docs/">a</a><a href="//evil.example">b</a><a href="#">c</a><a href="/x#missing">d</a><a href="#here">e</a><a href="https://example.com">f</a><a href="mailto:a@b.c">g</a>'],
    ["/x", '<h2 id="present">x</h2><a href="https://settlens.com/x">self</a><a href="/#gone">h</a>'],
  ]);
  const errors = checkLinks(rendered, new Set(["/rss.xml"])).join("\n");
  assert.match(errors, /trailing slash/);
  assert.match(errors, /protocol-relative/);
  assert.match(errors, /empty anchor/);
  assert.match(errors, /"\/x#missing" points to a missing anchor/);
  assert.match(errors, /"#here" points to a missing anchor/);
  assert.match(errors, /"\/#gone" points to a missing anchor/);
  assert.doesNotMatch(errors, /example\.com|mailto|settlens\.com\/x"/);
});

test("components keep html`` arguments out of attribute values", () => {
  const caption = html`Exit <code>codes</code> "quoted"`;
  for (const markup of [components.table({ caption, head: ["a"], rows: [["b"]] }), components.comparisonTable({ caption, columns: ["", "x"], rows: [] }), components.codeBlock({ code: "x", title: caption }), components.diagram({ svg: "<svg></svg>", label: caption })]) {
    const label = String(markup).match(/aria-label="([^"]*)"/)?.[1];
    assert.equal(label?.replace(/^Copy code \((.*)\)$/, "$1"), "Exit codes &quot;quoted&quot;", String(markup).slice(0, 120));
  }
});

test("the pilot form confirms receipt without promising a response time", () => {
  const form = String(components.pilotForm());
  assert.match(form, /Thanks, your request was received\. We reply by email from contact@settlens\.com\./);
  assert.doesNotMatch(form, /business day|within|hours/i);
});

test("table row headers that are one short token never wrap", () => {
  const markup = String(components.table({ rows: [["PAY-01", "a"], ["A longer row label", "b"], ["security.facilitator_rejects_invalid_signature", "c"]], rowHeaders: true }));
  const headers = [...markup.matchAll(/<th scope="row"([^>]*)>/g)].map((match) => match[1]);
  assert.deepEqual(headers, [' class="table__id"', "", ""]);
});

test("the styleguide renders every component", async () => {
  const source = await readFile(fileURLToPath(new URL("../site/src/pages/styleguide.js", import.meta.url)), "utf8");
  const helpers = new Set(["formatDate", "toCard"]);
  const missing = Object.keys(components).filter((name) => !helpers.has(name) && !source.includes(`c.${name}(`));
  assert.deepEqual(missing, []);
});

test("the build refuses to wipe a directory it did not create, and the CLI exits non-zero", async () => {
  const foreign = join(work, "foreign");
  await mkdir(foreign, { recursive: true });
  await writeFile(join(foreign, "keep.txt"), "important");
  await assert.rejects(buildSite({ outDir: foreign, extraPages: pending.map(stubPage), now: NOW }), /Refusing to clean/);
  assert.equal(await readFile(join(foreign, "keep.txt"), "utf8"), "important");
  const cli = spawnSync(process.execPath, [BUILD_SCRIPT, foreign], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /Site build failed|Refusing to clean/);
  // Rebuilding over a previous build output is allowed.
  await buildSite({ outDir, extraPages: pending.map(stubPage), now: NOW });
  assert.deepEqual((await readdir(work)).filter((name) => name.includes(".tmp-")), [], "no staging directory is left behind");
});

test("concurrent builds into one directory each swap in a complete build", async () => {
  const dir = await mkdtemp(join(work, "race-"));
  const target = join(dir, "public");
  const extraPages = [minimalPage("/a"), minimalPage("/404")];
  const build = () => buildSite({ outDir: target, pagesDir: join(dir, "no-pages"), extraPages, allowMissing: [...declaredRoutes], now: NOW });
  await Promise.all([build(), build(), build(), build()]);
  const key = (await readFile(INDEXNOW_KEY_FILE, "utf8")).trim();
  const listing = (await readdir(target)).filter((name) => !/\.(?:br|gz)$/.test(name)).sort();
  assert.deepEqual(listing, [".settlens-build", ".well-known", "404.html", `${key}.txt`, "a", "a.md", "assets", "llms-full.txt", "llms.txt", "manifest.webmanifest", "robots.txt", "rss.xml", "sitemap.xml", "speculation-rules.json"].sort());
  await stat(join(target, "a/index.html"));
  assert.deepEqual(await readdir(dir), ["public"], "staging and previous builds are removed");
  assert.equal((await stat(target)).mode & 0o755, 0o755, "the served directory is readable by the server user");
});

test("one JSON-LD description per @id: definitions are merged across pages, conflicts fail the build", async () => {
  const ID = "https://settlens.com/#thing";
  const page = (path, jsonLd) => minimalPage(path, { jsonLd });
  const { canonical, errors } = canonicalJsonLd([
    { source: "a.js", url: "https://settlens.com/a", jsonLd: { "@context": "https://schema.org", "@type": "Thing", "@id": ID, name: "X", list: [1, 2] } },
    { source: "b.js", url: "https://settlens.com/b", jsonLd: [{ "@type": "Thing", "@id": ID, name: "X", list: [1, 2], extra: true }, { "@id": "https://settlens.com/#ref-only" }] },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(canonical.get(ID), { "@type": "Thing", "@id": ID, name: "X", list: [1, 2], extra: true });
  assert.equal(canonical.has("https://settlens.com/#ref-only"), false);

  await expectBuildFailure([page("/a", { "@id": ID, name: "X" }), page("/b", { "@id": ID, name: "Y" })], /extraPages\[1\]: JSON-LD https:\/\/settlens\.com\/#thing sets "name" differently from extraPages\[0\]/);
  await expectBuildFailure([page("/a", { "@id": "https://settlens.com/#organization", sameAs: ["x"] })], /emitted by the layout/);
  await expectBuildFailure([page("/a", { "@id": "https://settlens.com/a#webpage", name: "x" })], /emitted by the layout/);

  // Every page that defines or lists the @id emits the same merged node.
  const dir = await mkdtemp(join(work, "jsonld-"));
  const result = await buildSite({
    outDir: join(dir, "out"),
    pagesDir: join(dir, "no-pages"),
    extraPages: [page("/a", { "@type": "Thing", "@id": ID, name: "X" }), page("/b", { "@type": "Thing", "@id": ID, name: "X", url: "https://settlens.com/b" }), page("/c", { "@id": ID }), minimalPage("/404")],
    allowMissing: [...declaredRoutes],
    now: NOW,
  });
  const nodes = await Promise.all(
    ["a", "b", "c"].map(async (name) => {
      const doc = await readFile(join(result.outDir, name, "index.html"), "utf8");
      return JSON.parse(doc.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1])["@graph"].find((node) => node["@id"] === ID);
    }),
  );
  assert.deepEqual(nodes[0], { "@type": "Thing", "@id": ID, name: "X", url: "https://settlens.com/b" });
  assert.deepEqual(nodes[1], nodes[0]);
  assert.deepEqual(nodes[2], nodes[0]);
});

test("the built site describes each JSON-LD @id the same way on every page", () => {
  const definitions = new Map();
  const visit = (node, path) => {
    if (Array.isArray(node)) return node.forEach((item) => visit(item, path));
    if (!node || typeof node !== "object") return;
    if (typeof node["@id"] === "string" && Object.keys(node).length > 1) {
      const variants = definitions.get(node["@id"]) ?? new Map();
      const key = JSON.stringify(node);
      variants.set(key, [...(variants.get(key) ?? []), path]);
      definitions.set(node["@id"], variants);
    }
    Object.values(node).forEach((value) => visit(value, path));
  };
  for (const [path, doc] of documents) {
    for (const [, content] of doc.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) visit(JSON.parse(content), path);
  }
  const conflicts = [...definitions].filter(([, variants]) => variants.size > 1).map(([id, variants]) => `${id}: ${[...variants.values()].map((paths) => paths.join(" ")).join(" vs ")}`);
  assert.deepEqual(conflicts, []);
  assert.ok(definitions.get("https://settlens.com/#organization").size === 1);
});

/* ---------- Docker image ---------- */

// .dockerignore semantics: patterns are anchored at the context root, "**/" matches any depth,
// a pattern also excludes everything below a matching directory, "!" re-includes, last match wins.
function dockerignored(path, patterns) {
  let excluded = false;
  for (const line of patterns) {
    const negate = line.startsWith("!");
    const glob = (negate ? line.slice(1) : line).replace(/^\/+|\/+$/g, "");
    const source = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/|\*\*|\*|\?/g, (token) => ({ "**/": "(?:.*/)?", "**": ".*", "*": "[^/]*", "?": "[^/]" })[token]);
    if (new RegExp(`^${source}(?:/.*)?$`).test(path)) excluded = !negate;
  }
  return excluded;
}

test("the site image copies every repository file the build reads and the context excludes secrets", async () => {
  const read = (path) => readFile(join(REPO_ROOT, path), "utf8");
  const ignore = (await read(".dockerignore")).split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.equal(dockerignored("examples/mcp/x.json", ["examples/*", "!examples/github-workflow.yml"]), true);
  assert.equal(dockerignored("examples/github-workflow.yml", ["examples/*", "!examples/github-workflow.yml"]), false);
  assert.equal(dockerignored(".env", ["**/.env"]) && dockerignored("site/.env", ["**/.env"]) && !dockerignored("site/.env.example", ["**/.env"]), true);

  // Final stage of site/Dockerfile: COPY <src...> <dest> relative to the last WORKDIR.
  const dockerfile = (await read("site/Dockerfile")).replace(/\\\n/g, " ");
  const stage = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
  const workdir = [...stage.matchAll(/^WORKDIR\s+(\S+)/gm)].at(-1)[1];
  const copies = [...stage.matchAll(/^COPY\s+(.+)$/gm)]
    .map(([, args]) => args.split(/\s+/))
    .filter((args) => !args.some((arg) => arg.startsWith("--from")))
    .map((args) => args.filter((arg) => !arg.startsWith("--")))
    .map((args) => ({ sources: args.slice(0, -1), dest: posix.resolve(workdir, args.at(-1)), dir: args.at(-1).endsWith("/") || args.length > 2 }));
  const imagePath = (file) => {
    for (const { sources, dest, dir } of copies) {
      for (const source of sources) {
        if (file === source) return dir ? posix.join(dest, posix.basename(source)) : dest;
        if (file.startsWith(`${source}/`)) return posix.join(dest, file.slice(source.length + 1));
      }
    }
    return null;
  };

  // Files read through repoFile()/repoJson() and modules imported from outside site/, by every site source.
  const sources = (await walk(join(REPO_ROOT, "site"))).filter((file) => file.endsWith(".js") && !/\/site\/(?:public|src\/legacy)\//.test(file) && !/\/site\/\.public\.tmp-/.test(file));
  const needed = new Map();
  for (const file of sources) {
    const code = await readFile(file, "utf8");
    const from = relative(REPO_ROOT, file);
    for (const [, arg] of code.matchAll(/\brepo(?:File|Json)\(([^)]*)\)/g)) {
      if (arg === "path") continue; // the helpers' own definitions
      assert.match(arg, /^"[^"$`]+"$/, `${from}: repoFile/repoJson take a string literal so this test can check the image (${arg})`);
      needed.set(arg.slice(1, -1), from);
    }
    for (const [, specifier] of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)"(\.{1,2}\/[^"]+)"/g)) {
      needed.set(relative(REPO_ROOT, join(dirname(file), specifier)), from);
    }
  }
  assert.ok(needed.has("CHANGELOG.md") && needed.has("src/constants.js"), "the scan sees repoFile() reads and imports");
  for (const [file, from] of needed) {
    await stat(join(REPO_ROOT, file));
    assert.equal(imagePath(file), posix.join(workdir, file), `${file} (read by ${from}) is not copied to ${workdir}/${file} by site/Dockerfile`);
    assert.equal(dockerignored(file, ignore), false, `${file} (read by ${from}) is excluded by .dockerignore`);
  }
  for (const secret of [".env", "site/.env", "data/pilot-leads.jsonl", "site/public/index.html", ".git/config"]) {
    assert.equal(dockerignored(secret, ignore), true, `${secret} must stay out of the build context`);
  }
});

/* ---------- Server ---------- */

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function rawRequest(base, path, method = "GET") {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const form = (body) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
const lead = { name: "Ada", email: "ada@example.com", company: "Example", message: "Assess our paid API.", source: "/contact" };
const TOKEN = "test-token-0123456789abcdef0123456789abcdef";

test("redirectFor normalises URLs and maps the previous site", () => {
  const cases = {
    "/": null,
    "/pricing": null,
    "/pricing/": "/pricing",
    "/index.html": "/",
    "/blog/index.html": "/blog",
    "/contact.html": "/contact",
    "/blog/foo.html": "/blog/foo",
    "/a.html/": "/a",
    "//evil.example/": "/evil.example",
    "/confidentialite/": "/privacy",
    "/assets/site.0123456789.css": null,
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(redirectFor(input), expected, input);
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) assert.equal(redirectFor(from), to);
});

test("the site server serves clean URLs, redirects, 404s and security headers", async () => {
  await writeFile(join(work, "secret.txt"), "outside the web root");
  const server = createSiteServer({ root: outDir, pilotStore: join(work, "leads.jsonl"), rateLimit: 1000, pilotRateLimit: 1000 });
  const base = await listen(server);
  try {
    // One encoding for the whole cache check: each encoding has its own ETag (see the negotiation test).
    const identity = { "accept-encoding": "identity" };
    const home = await fetch(`${base}/`, { headers: identity });
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(home.headers.get("cache-control"), "no-cache");
    assert.equal(home.headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
    assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests/);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.equal(home.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(home.headers.get("permissions-policy"), /camera=\(\)/);
    assert.equal(home.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(home.headers.get("cross-origin-resource-policy"), "same-site");
    assert.equal(home.headers.get("strict-transport-security"), "max-age=63072000");
    assert.match(CONTENT_SECURITY_POLICY, /; require-trusted-types-for 'script'; trusted-types 'none'$/);
    const homeBody = await home.text();
    assert.match(homeBody, /<h1/);

    // Content-derived ETag: unchanged content keeps its ETag across rebuilds (new mtimes).
    const etag = home.headers.get("etag");
    assert.match(etag, /^"[A-Za-z0-9_-]{16}"$/);
    for (const candidate of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const cached = await fetch(`${base}/`, { headers: { ...identity, "if-none-match": candidate } });
      assert.equal(cached.status, 304, candidate);
      assert.equal(await cached.text(), "");
    }
    assert.equal((await fetch(`${base}/`, { headers: { ...identity, "if-none-match": '"other"' } })).status, 200);

    const clean = await fetch(`${base}/styleguide`);
    assert.equal(clean.status, 200);
    assert.match(await clean.text(), /Settlens design system/);

    for (const [from, to] of [["/styleguide/", "/styleguide"], ["/styleguide/?x=1", "/styleguide?x=1"], ["/contact.html", "/contact"], ["/blog/foo.html", "/blog/foo"], ["/index.html", "/"], ...Object.entries(LEGACY_REDIRECTS)]) {
      const response = await fetch(`${base}${from}`, { redirect: "manual" });
      assert.equal(response.status, 301, from);
      assert.equal(response.headers.get("location"), to, from);
    }
    const openRedirect = await rawRequest(base, "//evil.example/");
    assert.equal(openRedirect.status, 301);
    assert.equal(openRedirect.headers.location, "/evil.example");

    for (const path of GONE) {
      const gone = await fetch(`${base}${path}`, { redirect: "manual" });
      assert.equal(gone.status, 410, path);
      assert.match(await gone.text(), /<h1/, path);
    }
    assert.equal((await fetch(`${base}/audit-n8n/`, { redirect: "manual" })).headers.get("location"), "/audit-n8n");

    const missing = await fetch(`${base}/does-not-exist`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await missing.text(), /<h1[^>]*>This page does not exist/);

    const head = await fetch(`${base}/`, { method: "HEAD", headers: identity });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get("content-length")), Buffer.byteLength(homeBody));
    assert.equal(head.headers.get("etag"), etag);
    assert.equal(await head.text(), "");

    assert.equal((await rawRequest(base, "http://[")).status, 400, "malformed absolute-form target");

    for (const path of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/../secret.txt", "/.settlens-build", "/assets/..%2f..%2fsecret.txt", "/%00", "/%E0%A4%A"]) {
      const response = await rawRequest(base, path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /outside the web root/, path);
    }

    const css = await fetch(`${base}${built.assets.css}`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
    assert.equal(css.headers.get("cache-control"), "public, max-age=31536000, immutable");
    const og = await fetch(`${base}/assets/og-image.jpg`);
    assert.equal(og.headers.get("content-type"), "image/jpeg");
    assert.equal(og.headers.get("cache-control"), "public, max-age=86400");
    assert.equal((await fetch(`${base}/sitemap.xml`)).headers.get("content-type"), "application/xml; charset=utf-8");
    assert.equal((await fetch(`${base}/.well-known/security.txt`)).status, 200);

    const post = await fetch(`${base}/`, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
    assert.equal((await fetch(`${base}/health`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${base}/api/pilot`)).status, 405);
    assert.equal((await fetch(`${base}/api/scan`)).status, 405);
    assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
    // No wildcard CORS: the API is same-origin (pilot) or bearer-token server-to-server (scan).
    for (const path of ["/api/scan", "/api/pilot", "/"]) {
      const preflight = await fetch(`${base}${path}`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
      assert.equal(preflight.status, 405, path);
      assert.equal(preflight.headers.get("access-control-allow-origin"), null, path);
    }
  } finally {
    await close(server);
  }
});

// Raw bytes, exact request headers (fetch would add Accept-Encoding and decode the body).
function bytesRequest(base, path, headers = {}, method = "GET") {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("static files are negotiated between brotli, gzip and identity, with Vary and one ETag per encoding", async () => {
  const server = createSiteServer({ root: outDir });
  const base = await listen(server);
  try {
    const original = await readFile(join(outDir, "pricing/index.html"));
    const cases = [
      ["br", "br", brotliDecompressSync],
      ["gzip, deflate, br, zstd", "br", brotliDecompressSync],
      ["gzip", "gzip", gunzipSync],
      ["br;q=0, gzip", "gzip", gunzipSync],
      ["br;q=0.0, gzip;q=0", undefined, (body) => body],
      // q-values rank the codings; x-gzip is gzip; "*" covers codings not listed.
      ["br;q=0.5, gzip", "gzip", gunzipSync],
      ["x-gzip", "gzip", gunzipSync],
      ["*", "br", brotliDecompressSync],
      ["gzip;q=0.2, *;q=0.4", "br", brotliDecompressSync],
      ["*;q=0, gzip", "gzip", gunzipSync],
      ["identity", undefined, (body) => body],
      [undefined, undefined, (body) => body],
    ];
    const etags = new Map();
    for (const [accept, coding, decode] of cases) {
      const response = await bytesRequest(base, "/pricing", accept === undefined ? {} : { "accept-encoding": accept });
      assert.equal(response.status, 200, accept);
      assert.equal(response.headers["content-encoding"], coding, accept);
      assert.equal(response.headers.vary, "Accept-Encoding", accept);
      assert.equal(Number(response.headers["content-length"]), response.body.length, accept);
      assert.deepEqual(decode(response.body), original, accept);
      assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
      assert.equal(response.headers["speculation-rules"], `"${SPECULATION_RULES_PATH}"`);
      etags.set(coding ?? "identity", response.headers.etag);
    }
    assert.equal(new Set(etags.values()).size, 3, "a distinct ETag per encoding");
    const head = await bytesRequest(base, "/pricing", { "accept-encoding": "br" }, "HEAD");
    assert.equal(Number(head.headers["content-length"]), (await stat(join(outDir, "pricing/index.html.br"))).size);
    assert.equal((await bytesRequest(base, "/pricing", { "accept-encoding": "br", "if-none-match": etags.get("br") })).status, 304);
    assert.equal((await bytesRequest(base, "/pricing", { "accept-encoding": "gzip", "if-none-match": etags.get("br") })).status, 200);

    // 404 pages carry the speculation rules too; precompressed siblings are not addressable.
    const missing = await bytesRequest(base, "/nope", { "accept-encoding": "br" });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers["content-encoding"], "br");
    assert.equal(missing.headers["speculation-rules"], `"${SPECULATION_RULES_PATH}"`);
    for (const path of ["/index.html.br", "/pricing/index.html.gz", `${built.assets.css}.br`]) assert.equal((await bytesRequest(base, path)).status, 404, path);

    const rules = await bytesRequest(base, SPECULATION_RULES_PATH);
    assert.equal(rules.headers["content-type"], "application/speculationrules+json");
    assert.equal(rules.headers["cache-control"], "no-cache");
    assert.equal(rules.headers["speculation-rules"], undefined);
    assert.deepEqual(JSON.parse(rules.body), SPECULATION_RULES);

    const font = await bytesRequest(base, built.assets.font, { "accept-encoding": "br, gzip" });
    assert.equal(font.headers["content-type"], "font/woff2");
    assert.equal(font.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(font.headers["content-encoding"], undefined);

    for (const [path, canonical] of [["/docs/cli.md", "https://settlens.com/docs/cli"], ["/index.md", "https://settlens.com/"]]) {
      const markdown = await bytesRequest(base, path, { "accept-encoding": "gzip" });
      assert.equal(markdown.status, 200, path);
      assert.equal(markdown.headers["content-type"], "text/markdown; charset=utf-8");
      assert.equal(markdown.headers.link, `<${canonical}>; rel="canonical"`);
      assert.equal(markdown.headers["x-robots-tag"], undefined, "canonical only: noindex would contradict it");
      assert.equal(markdown.headers["cache-control"], "no-cache");
      assert.equal(markdown.headers["content-encoding"], "gzip");
    }
    for (const path of ["/llms.txt", "/llms-full.txt"]) assert.equal((await bytesRequest(base, path)).headers["x-robots-tag"], "noindex", path);
    assert.equal((await bytesRequest(base, "/robots.txt")).headers["x-robots-tag"], undefined);
    const key = (await readFile(INDEXNOW_KEY_FILE, "utf8")).trim();
    const keyFile = await bytesRequest(base, `/${key}.txt`);
    assert.equal(keyFile.headers["content-type"], "text/plain; charset=utf-8");
    assert.equal(keyFile.body.toString(), key);
  } finally {
    await close(server);
  }
});

test("MCP_EXTRA_ORIGINS lets a local site call /mcp; other origins stay refused", async () => {
  const local = "http://127.0.0.1:8852";
  const previous = process.env.MCP_EXTRA_ORIGINS;
  process.env.MCP_EXTRA_ORIGINS = ` ${local} ,`;
  const extra = createSiteServer({ root: outDir });
  if (previous === undefined) delete process.env.MCP_EXTRA_ORIGINS;
  else process.env.MCP_EXTRA_ORIGINS = previous;
  const plain = createSiteServer({ root: outDir, mcpExtraOrigins: [] });
  const [a, b] = await Promise.all([listen(extra), listen(plain)]);
  const ping = (base, origin) => fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", origin }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
  try {
    const allowed = await ping(a, local);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), local);
    assert.equal((await ping(a, "https://settlens.com")).status, 200, "the production origins still work");
    assert.equal((await ping(a, "http://127.0.0.1:9999")).status, 403);
    assert.equal((await ping(b, local)).status, 403, "not allowed by default");
    // Never derived from Host: a page whose Origin matches the Host header is still refused.
    const { port } = new URL(b);
    assert.equal((await ping(b, `http://127.0.0.1:${port}`)).status, 403);
  } finally {
    await Promise.all([close(extra), close(plain)]);
  }
});

test("POST /api/pilot validates input and records leads (JSON and no-JS form posts)", async () => {
  const store = join(work, "pilot.jsonl");
  const server = createSiteServer({ root: outDir, pilotStore: store, rateLimit: 1000, pilotRateLimit: 1000 });
  const base = await listen(server);
  try {
    const post = (init) => fetch(`${base}/api/pilot`, { redirect: "manual", ...init });
    const bad = await post({ method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /valid JSON/);
    assert.equal((await post(json([1, 2]))).status, 400);
    const missingField = await post(json({ ...lead, company: " " }));
    assert.equal(missingField.status, 400);
    assert.match((await missingField.json()).error, /All fields are required/);
    const badEmail = await post(json({ ...lead, email: "not-an-email" }));
    assert.equal(badEmail.status, 400);
    assert.match((await badEmail.json()).error, /valid email/);
    assert.equal((await post(json({ ...lead, message: "x".repeat(4001) }))).status, 400);
    const tooLarge = await post(json({ ...lead, message: "x".repeat(40_000) }));
    assert.equal(tooLarge.status, 413);

    const ok = await post(json(lead));
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json(), { ok: true });

    const sent = await post(form({ ...lead, source: "/pricing" }));
    assert.equal(sent.status, 303);
    assert.equal(sent.headers.get("location"), "/pricing#pilot-sent");
    const invalid = await post(form({ ...lead, email: "nope", source: "//evil.example" }));
    assert.equal(invalid.status, 303);
    assert.equal(invalid.headers.get("location"), "/contact#pilot-error");

    const lines = (await readFile(store, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].email, "ada@example.com");
    assert.equal(lines[1].page, "/pricing");
    assert.equal(lines[1].source, "settlens-site");
  } finally {
    await close(server);
  }
});

test("POST /api/pilot refuses cross-site posts, other body types and honeypot hits, and caps field sizes", async () => {
  const store = join(work, "pilot-guards.jsonl");
  const server = createSiteServer({ root: outDir, pilotStore: store, pilotRateLimit: 1000 });
  const base = await listen(server);
  try {
    const post = (init) => fetch(`${base}/api/pilot`, { redirect: "manual", ...init });
    const host = new URL(base).host;
    const withHeaders = (init, headers) => ({ ...init, headers: { ...init.headers, ...headers } });
    assert.equal((await post(withHeaders(json(lead), { origin: "https://evil.example" }))).status, 403);
    assert.equal((await post(withHeaders(json(lead), { origin: "null" }))).status, 403);
    assert.equal((await post(withHeaders(json(lead), { "sec-fetch-site": "cross-site" }))).status, 403);
    const crossForm = await post(withHeaders(form(lead), { origin: "https://evil.example" }));
    assert.equal(crossForm.status, 303);
    assert.equal(crossForm.headers.get("location"), "/contact#pilot-error");
    assert.equal((await post({ method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(lead) })).status, 415);
    assert.equal((await post({ method: "POST", body: JSON.stringify(lead) })).status, 415);
    assert.equal((await post(json({ ...lead, name: "x".repeat(201) }))).status, 400);
    assert.equal((await post(json({ ...lead, email: `${"x".repeat(320)}@example.com` }))).status, 400);
    // A bot filling the hidden field is told it succeeded, and nothing is stored.
    assert.equal((await post(json({ ...lead, email: "bot@example.com", website: "https://spam.example" }))).status, 202);
    const botForm = await post(form({ ...lead, email: "bot@example.com", website: "x" }));
    assert.equal(botForm.headers.get("location"), "/contact#pilot-sent");
    // Same-origin browser posts are accepted.
    assert.equal((await post(withHeaders(json(lead), { origin: `http://${host}`, "sec-fetch-site": "same-origin" }))).status, 202);
    const stored = await readFile(store, "utf8");
    assert.doesNotMatch(stored, /bot@example\.com/);
    assert.equal(stored.trim().split("\n").length, 1);
  } finally {
    await close(server);
  }
});

test("pilot submissions have their own strict rate limit, and a full store stops taking leads", async () => {
  const dir = await mkdtemp(join(work, "full-"));
  const store = join(dir, "leads.jsonl");
  const limitedServer = createSiteServer({ root: outDir, pilotStore: join(dir, "limited.jsonl") });
  await writeFile(store, "");
  await truncate(store, 21 * 1024 * 1024); // over the 20 MiB cap
  const full = createSiteServer({ root: outDir, pilotStore: store, pilotRateLimit: 1000 });
  const [l, f] = await Promise.all([listen(limitedServer), listen(full)]);
  try {
    const statuses = [];
    for (let index = 0; index < 6; index += 1) statuses.push((await fetch(`${l}/api/pilot`, json(lead))).status);
    assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429], "5 per 15 minutes by default");
    assert.equal((await fetch(`${l}/health`)).status, 200, "the pilot limit does not affect other routes");
    assert.equal((await fetch(`${f}/api/pilot`, json(lead))).status, 502);
    assert.doesNotMatch(await readFile(store, "utf8"), /ada@example\.com/, "nothing appended to a full store");
  } finally {
    await Promise.all([close(limitedServer), close(full)]);
  }
});

test("the pilot store drops entries older than 365 days, atomically and without losing a lead", async () => {
  const dir = await mkdtemp(join(work, "store-"));
  const store = join(dir, "leads.jsonl");
  const day = 24 * 60 * 60 * 1000;
  const entry = (email, ageDays) => JSON.stringify({ ...lead, email, receivedAt: new Date(Date.now() - ageDays * day).toISOString() });
  await writeFile(store, `${entry("old@example.com", 400)}\n${entry("recent@example.com", 10)}\nnot json\n\n${entry("edge@example.com", 364)}\n`);
  const server = createSiteServer({ root: outDir, pilotStore: store, rateLimit: 1000, pilotRateLimit: 1000 });
  const base = await listen(server);
  try {
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => fetch(`${base}/api/pilot`, json({ ...lead, email: `new${index}@example.com` }))));
    assert.deepEqual(responses.map((response) => response.status), Array(8).fill(202));
    const lines = (await readFile(store, "utf8")).split("\n").filter(Boolean);
    const emails = lines.filter((line) => line !== "not json").map((line) => JSON.parse(line).email);
    assert.ok(!emails.includes("old@example.com"), "expired entry dropped");
    assert.ok(emails.includes("recent@example.com") && emails.includes("edge@example.com") && lines.includes("not json"), "recent and unparseable entries kept");
    assert.deepEqual(emails.filter((email) => email.startsWith("new")).sort(), Array.from({ length: 8 }, (_, index) => `new${index}@example.com`), "concurrent leads all recorded");
    assert.deepEqual(await readdir(dir), ["leads.jsonl"], "no temporary file left");
    assert.equal((await stat(store)).mode & 0o077, 0, "the rewritten store is private to its owner");

    // A store directory the server cannot write to (no temporary file, no rename) still records the lead.
    await chmod(dir, 0o555);
    try {
      assert.equal((await fetch(`${base}/api/pilot`, json({ ...lead, email: "fallback@example.com" }))).status, 202);
    } finally {
      await chmod(dir, 0o755);
    }
    assert.match(await readFile(store, "utf8"), /fallback@example\.com/);
  } finally {
    await close(server);
  }
});

test("pilot intake reports misconfiguration, delivery failures and signs webhooks", async () => {
  const received = [];
  let webhookStatus = 200;
  const webhook = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ body, signature: req.headers["x-settlens-signature"] });
      res.writeHead(webhookStatus).end();
    });
  });
  const webhookUrl = await listen(webhook);
  const unconfigured = createSiteServer({ root: outDir, pilotRateLimit: 1000 });
  assert.throws(() => createSiteServer({ root: outDir, pilotWebhookUrl: `${webhookUrl}/hook` }), /PILOT_WEBHOOK_DISCLOSED=1/);
  const signed = createSiteServer({ root: outDir, pilotWebhookUrl: `${webhookUrl}/hook`, pilotWebhookSecret: "s3cret", pilotWebhookDisclosed: true, pilotRateLimit: 1000 });
  const brokenStore = createSiteServer({ root: outDir, pilotStore: work, pilotRateLimit: 1000 });
  const [a, b, c] = await Promise.all([listen(unconfigured), listen(signed), listen(brokenStore)]);
  try {
    assert.equal((await fetch(`${a}/api/pilot`, json(lead))).status, 503);
    assert.equal((await fetch(`${b}/api/pilot`, json(lead))).status, 202);
    assert.equal(received.length, 1);
    assert.equal(received[0].signature, createHmac("sha256", "s3cret").update(received[0].body).digest("hex"));
    webhookStatus = 500;
    assert.equal((await fetch(`${b}/api/pilot`, json(lead))).status, 502);
    assert.equal((await fetch(`${c}/api/pilot`, json(lead))).status, 502);
  } finally {
    await Promise.all([close(webhook), close(unconfigured), close(signed), close(brokenStore)]);
  }
});

test("rate limiting keys on the last X-Forwarded-For entry only behind a trusted proxy", async () => {
  const proxied = createSiteServer({ root: outDir, pilotStore: join(work, "rl.jsonl"), trustProxy: true, pilotRateLimit: 1 });
  const direct = createSiteServer({ root: outDir, pilotStore: join(work, "rl.jsonl"), trustProxy: false, pilotRateLimit: 1 });
  const [p, d] = await Promise.all([listen(proxied), listen(direct)]);
  const send = (base, xff) => fetch(`${base}/api/pilot`, { ...json(lead), headers: { "content-type": "application/json", "x-forwarded-for": xff } });
  try {
    assert.equal((await send(p, "1.1.1.1, 9.9.9.9")).status, 202);
    assert.equal((await send(p, "1.1.1.1, 9.9.9.9")).status, 429);
    assert.equal((await send(p, "1.1.1.1, 8.8.8.8")).status, 202, "a spoofed first entry does not share or escape the bucket");
    assert.equal((await send(d, "5.5.5.5")).status, 202);
    assert.equal((await send(d, "6.6.6.6")).status, 429, "without a trusted proxy the header is ignored");
    const limitedForm = await fetch(`${d}/api/pilot`, { ...form(lead), redirect: "manual" });
    assert.equal(limitedForm.status, 303);
    assert.equal(limitedForm.headers.get("location"), "/contact#pilot-error");
  } finally {
    await Promise.all([close(proxied), close(direct)]);
  }
});

test("POST /api/scan requires the bearer token and refuses private destinations", async () => {
  const server = createSiteServer({ root: outDir, apiToken: TOKEN, rateLimit: 1000 });
  const base = await listen(server);
  const scan = (body, token = TOKEN) =>
    fetch(`${base}/api/scan`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: typeof body === "string" ? body : JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/scan`, json({ url: "https://example.com" }))).status, 401);
    assert.equal((await scan({ url: "https://example.com" }, "wrong-token")).status, 401);
    assert.equal((await scan({ url: "https://example.com" }, `${TOKEN.slice(0, -1)}x`)).status, 401, "same length, wrong token");
    const noScheme = await fetch(`${base}/api/scan`, { method: "POST", headers: { "content-type": "application/json", authorization: TOKEN }, body: "{}" });
    assert.equal(noScheme.status, 401, "the Bearer scheme is required");
    // Facilitator as a URL string only: the object form would let callers set headers and timeouts.
    for (const facilitator of [{ url: "https://93.184.215.14/", headers: { "x-evil": "1" } }, null, ["https://93.184.215.14/"], "x".repeat(2049)]) {
      const response = await scan({ url: "https://93.184.215.14/paid", facilitator });
      assert.equal(response.status, 400, JSON.stringify(facilitator).slice(0, 40));
      assert.match((await response.json()).error, /facilitator must be a URL string/);
    }
    const privateFacilitator = await scan({ url: "https://93.184.215.14/paid", facilitator: "http://10.0.0.8/" });
    assert.equal(privateFacilitator.status, 400);
    assert.match((await privateFacilitator.json()).error, /Private or non-routable/);
    assert.equal((await scan("{bad")).status, 400);
    assert.match((await (await scan({})).json()).error, /url is required/);
    for (const [url, message] of [
      ["http://127.0.0.1/paid", /Private or non-routable/],
      ["http://localhost/paid", /Local destinations/],
      ["http://[::1]/paid", /Private or non-routable/],
      // Ranges the previous site-local guard let through.
      ["http://100.64.0.1/paid", /Private or non-routable/],
      ["http://[::ffff:127.0.0.1]/paid", /Private or non-routable/],
      ["ftp://example.com/paid", /Only http and https/],
      ["https://user:pw@example.com/paid", /Credentials in the URL/],
      ["not a url", /must be an absolute URL/],
      ["https://settlens-test.invalid/paid", /Could not resolve settlens-test\.invalid/],
    ]) {
      const response = await scan({ url });
      assert.equal(response.status, 400, url);
      assert.match((await response.json()).error, message, url);
    }
  } finally {
    await close(server);
  }
});

test("failed scan authentications are rate limited, and a placeholder or short token disables the network API", async () => {
  const strict = createSiteServer({ root: outDir, apiToken: TOKEN, rateLimit: 3 });
  const placeholder = createSiteServer({ root: outDir, apiToken: "replace-with-a-long-random-token" });
  const short = createSiteServer({ root: outDir, apiToken: "short-token" });
  const [a, b, c] = await Promise.all([listen(strict), listen(placeholder), listen(short)]);
  const scan = (base, token) => fetch(`${base}/api/scan`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: "{}" });
  try {
    const statuses = [];
    for (let index = 0; index < 4; index += 1) statuses.push((await scan(a, "wrong")).status);
    assert.deepEqual(statuses, [401, 401, 401, 429]);
    assert.equal((await scan(b, "replace-with-a-long-random-token")).status, 401);
    assert.equal((await scan(c, "short-token")).status, 401);
    const tools = await fetch(`${b}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer replace-with-a-long-random-token" }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
    assert.ok(!(await tools.json()).result.tools.some(({ name }) => name === "scan_endpoint"), "MCP network tools stay off too");
  } finally {
    await Promise.all([close(strict), close(placeholder), close(short)]);
  }
});

test("/mcp serves MCP Streamable HTTP with the site's security headers", async () => {
  const server = createSiteServer({ root: outDir, apiToken: TOKEN, rateLimit: 1000 });
  const base = await listen(server);
  const rpc = (body, headers = {}) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  const tools = async (headers) => (await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, headers)).json()).result.tools.map(({ name }) => name);
  try {
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "site-test", version: "1" } } });
    assert.equal(init.status, 200);
    assert.match(init.headers.get("content-type"), /^application\/json/);
    assert.equal(init.headers.get("cache-control"), "no-store");
    for (const name of ["x-content-type-options", "x-frame-options", "referrer-policy", "cross-origin-opener-policy"]) assert.ok(init.headers.get(name), name);
    assert.equal((await init.json()).result.serverInfo.name, "settlens");

    const offline = await tools();
    assert.ok(offline.includes("evaluate_payment_requirements"));
    assert.ok(!offline.includes("scan_endpoint") && !offline.includes("scan_facilitator"));
    assert.deepEqual(await tools({ authorization: "Bearer wrong-token" }), offline);
    const network = await tools({ authorization: `Bearer ${TOKEN}` });
    assert.ok(network.includes("scan_endpoint") && network.includes("scan_facilitator"));

    // An MCP client opening an SSE stream: 405 from the transport.
    for (const accept of ["text/event-stream", "text/html, text/event-stream"]) {
      const get = await fetch(`${base}/mcp`, { headers: { accept } });
      assert.equal(get.status, 405, accept);
      assert.equal(get.headers.get("allow"), "POST");
    }
    // Browsers, crawlers and link checkers (Accept */* or none) get the documentation page.
    for (const accept of ["text/html,application/xhtml+xml,*/*;q=0.8", "*/*", undefined]) {
      const page = accept ? await fetch(`${base}/mcp`, { headers: { accept } }) : await rawRequest(base, "/mcp");
      assert.equal(page.status, 200, accept);
      assert.equal(page.headers.get?.("content-type") ?? page.headers["content-type"], "text/html; charset=utf-8", accept);
      assert.equal(page.headers.get?.("vary") ?? page.headers.vary, "Accept, Accept-Encoding", accept);
    }

    const evil = await rpc({ jsonrpc: "2.0", id: 3, method: "ping" }, { origin: "https://evil.example" });
    assert.equal(evil.status, 403);
    assert.equal(evil.headers.get("access-control-allow-origin"), null);
    const cors = await fetch(`${base}/mcp`, { method: "OPTIONS", headers: { origin: "https://claude.ai" } });
    assert.equal(cors.status, 204);
    assert.equal(cors.headers.get("access-control-allow-origin"), "https://claude.ai");

    const notification = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), "");

    const oversized = await rpc({ jsonrpc: "2.0", id: 4, method: "ping", params: { pad: "x".repeat(262_144) } });
    assert.equal(oversized.status, 413);
    assert.ok(oversized.headers.get("x-frame-options"));
  } finally {
    await close(server);
  }
});

test("/mcp rate-limits on the trusted client IP (last X-Forwarded-For entry behind the proxy)", async () => {
  const server = createSiteServer({ root: outDir, trustProxy: true });
  const base = await listen(server);
  const ping = (xff) =>
    fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
  try {
    for (let index = 0; index < 60; index += 1) assert.equal((await ping(`1.1.1.${index}, 9.9.9.9`)).status, 200);
    assert.equal((await ping("1.1.1.1, 9.9.9.9")).status, 429);
    assert.equal((await ping("9.9.9.9, 8.8.8.8")).status, 200, "a spoofed first entry neither shares nor escapes the bucket");
  } finally {
    await close(server);
  }
});

test("the server falls back to a plain 404 when no 404 page was built", async () => {
  const empty = await mkdtemp(join(work, "empty-root-"));
  const server = createSiteServer({ root: empty });
  const base = await listen(server);
  try {
    const response = await fetch(`${base}/anything`);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "Not found.\n");
  } finally {
    await close(server);
  }
});
