#!/usr/bin/env node
// Tells IndexNow (Bing, Yandex, Seznam, Naver, Yep; not Google, which reads the sitemap) which URLs changed.
// Run by the operator after a successful deploy, never by the build or the pages.
//
//   node site/tools/indexnow.mjs --since=2026-10-13      URLs of the live sitemap whose lastmod is on or after that day
//   node site/tools/indexnow.mjs                         every URL of the sitemap (first submission only)
//   node site/tools/indexnow.mjs --dry-run [...]         print the request without sending it
//   --sitemap=<file|https URL>                           another sitemap (default: https://settlens.com/sitemap.xml)
//
// The key is site/src/data/indexnow-key.txt, which the site serves at /<key>.txt: deploy before submitting.

import { readFile } from "node:fs/promises";
import { INDEXNOW_KEY_FILE } from "../build.js";
import { site } from "../src/data/site.js";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000; // IndexNow limit per request

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = args.includes("--dry-run");
const since = option("since");
if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since must be YYYY-MM-DD.");

const sitemap = option("sitemap") ?? `${site.origin}/sitemap.xml`;
const xml = /^https:\/\//.test(sitemap) ? await (await fetch(sitemap, { signal: AbortSignal.timeout(10_000) })).text() : await readFile(sitemap, "utf8");
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, block]) => ({
  url: /<loc>([^<]+)<\/loc>/.exec(block)?.[1]?.replaceAll("&amp;", "&"),
  lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1],
}));
const host = new URL(site.origin).host;
const urlList = entries.filter((entry) => entry.url && new URL(entry.url).host === host && (!since || (entry.lastmod ?? "") >= since)).map((entry) => entry.url);
if (urlList.length > MAX_URLS) throw new Error(`${urlList.length} URLs: IndexNow takes at most ${MAX_URLS} per request.`);

const key = (await readFile(INDEXNOW_KEY_FILE, "utf8")).trim();
const keyLocation = `${site.origin}/${key}.txt`;
const body = { host, key, keyLocation, urlList };

if (!urlList.length) {
  console.log("No URL to submit.");
} else if (dryRun) {
  console.log(`POST ${ENDPOINT}\n${JSON.stringify(body, null, 2)}`);
} else {
  // IndexNow fetches the key file to prove ownership: check it is live first.
  const live = await fetch(keyLocation, { signal: AbortSignal.timeout(10_000) }).then((response) => (response.ok ? response.text() : ""), () => "");
  if (live.trim() !== key) {
    console.error(`${keyLocation} does not serve the key yet: deploy the site first.`);
    process.exitCode = 1;
  } else {
    const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    console.log(`IndexNow answered HTTP ${response.status} for ${urlList.length} URL(s).`);
    if (response.status !== 200 && response.status !== 202) process.exitCode = 1;
  }
}
