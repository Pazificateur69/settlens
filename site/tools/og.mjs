#!/usr/bin/env node
// Renders the Open Graph image (1200x630 PNG) of every indexable page with the local Chrome, headless, from the
// template below (Inter, site colors, title, section, summary or description), into site/src/assets/og/<slug>.png,
// and records the title each image shows in site/src/data/og-manifest.json. The build publishes the images; the
// test suite fails when an indexable page has no image or a stale title, so re-run this after a title change.
//
//   node site/tools/og.mjs                       every indexable page (removes images of pages that no longer exist)
//   node site/tools/og.mjs --only=/,/pricing     these pages only; the other images are kept
//   node site/tools/og.mjs --out=<dir>           write the PNGs and og-manifest.json to <dir> (trial run)
//
// CHROME overrides the browser binary. Dev-time only: the Docker build never runs it.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OG_DIR, OG_MANIFEST, ogSlug, ogTitle, pageRecords, pngSize } from "../build.js";
import { escape, stripTags } from "../src/lib/html.js";

const SITE_DIR = fileURLToPath(new URL("..", import.meta.url));
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1200;
const HEIGHT = 630;
const SECTIONS = { "": "", product: "Product", mcp: "MCP server", "use-cases": "Use cases", pricing: "Pricing", docs: "Docs", tools: "Tools", learn: "Learn", blog: "Blog" };

const sectionLabel = (page) => SECTIONS[page.path.split("/")[1]] ?? page.section.charAt(0).toUpperCase() + page.section.slice(1);

function template({ page, fontUrl, logo }) {
  const text = stripTags(String(page.summary ?? page.description));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: "Inter"; src: url("${fontUrl}") format("woff2"); font-weight: 400 800; font-display: block; }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body { display: flex; flex-direction: column; padding: 60px 80px 56px; color: #eaf2f8; font-family: "Inter", sans-serif;
  background: radial-gradient(760px 460px at 100% 0%, rgba(76, 125, 255, 0.22), transparent 70%),
    radial-gradient(640px 420px at 0% 100%, rgba(38, 230, 200, 0.14), transparent 70%), #07111f; }
.logo svg { display: block; height: 46px; width: auto; }
main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.section { color: #26e6c8; font-size: 26px; font-weight: 600; letter-spacing: 0.01em; margin-bottom: 18px; }
h1 { font-size: 64px; line-height: 1.08; font-weight: 700; letter-spacing: -0.022em; text-wrap: balance;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.text { margin-top: 24px; max-width: 980px; font-size: 27px; line-height: 1.42; color: #b4c3d3;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
footer { display: flex; justify-content: space-between; align-items: center; padding-top: 22px; border-top: 1px solid rgba(148, 178, 214, 0.2);
  color: #93a6ba; font-size: 22px; }
.url { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
</style></head>
<body>
<div class="logo">${logo}</div>
<main>${sectionLabel(page) ? `<p class="section">${escape(sectionLabel(page))}</p>` : ""}<h1>${escape(ogTitle(page))}</h1><p class="text">${escape(text)}</p></main>
<footer><span class="url">settlens.com${escape(page.path === "/" ? "" : page.path)}</span><span>x402 payment assurance</span></footer>
</body></html>
`;
}

// Chrome writes the screenshot, logs "<n> bytes written to file", then can linger for a minute before exiting:
// the log line is the signal to stop it.
async function render(html, out, work) {
  const page = join(work, "og.html");
  await writeFile(page, html);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${join(work, "profile")}`, // never the user's profile
    "--force-device-scale-factor=1",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--virtual-time-budget=5000", // lets the font load before the capture
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ];
  await new Promise((done, fail) => {
    const chrome = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    const written = () => /bytes written to file/.test(log);
    const timer = setTimeout(() => chrome.kill(), 60_000);
    const collect = (chunk) => {
      log += chunk;
      if (written()) chrome.kill();
    };
    chrome.stdout.on("data", collect);
    chrome.stderr.on("data", collect);
    chrome.on("error", fail);
    chrome.on("close", () => {
      clearTimeout(timer);
      if (written()) done();
      else fail(new Error(`Chrome produced no screenshot for ${out}:\n${log.slice(-2000)}`));
    });
  });
  const size = pngSize(await readFile(out));
  if (size.width !== WIDTH || size.height !== HEIGHT) throw new Error(`${out} is ${size.width}x${size.height}, expected ${WIDTH}x${HEIGHT}.`);
}

const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
const outArg = args.find((arg) => arg.startsWith("--out="))?.slice(6);
const imageDir = outArg ? resolve(outArg) : OG_DIR;
const manifestFile = outArg ? join(imageDir, "og-manifest.json") : OG_MANIFEST;

const pages = (await pageRecords()).filter((page) => !page.noindex);
const selected = only ? pages.filter((page) => only.includes(page.path)) : pages;
const unknown = (only ?? []).filter((path) => !pages.some((page) => page.path === path));
if (unknown.length) throw new Error(`Not an indexable page: ${unknown.join(", ")}`);

const font = await readFile(join(SITE_DIR, "src/assets/fonts/Inter-latin-var.woff2"));
const fontUrl = `data:font/woff2;base64,${font.toString("base64")}`;
const logo = (await readFile(join(SITE_DIR, "assets/logo-horizontal-white.svg"), "utf8")).replace(/<\?xml[^>]*>/, "");
const manifest = JSON.parse(await readFile(manifestFile, "utf8").catch(() => "{}"));
await mkdir(imageDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), "settlens-og-"));
try {
  for (const page of selected) {
    const slug = ogSlug(page.path);
    await render(template({ page, fontUrl, logo }), join(imageDir, `${slug}.png`), work);
    manifest[slug] = { path: page.path, title: ogTitle(page) };
    console.log(`${page.path} -> ${slug}.png`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
if (!only) {
  // Full run: forget images of pages that no longer exist.
  const current = new Set(pages.map((page) => ogSlug(page.path)));
  for (const slug of Object.keys(manifest)) if (!current.has(slug)) delete manifest[slug];
  for (const name of await readdir(imageDir)) if (name.endsWith(".png") && !current.has(name.slice(0, -4))) await rm(join(imageDir, name));
}
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(manifestFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${selected.length} image(s) in ${imageDir}; manifest ${manifestFile}`);
