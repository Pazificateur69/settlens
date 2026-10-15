// Page chrome (document, header, footer) and the three main layouts: page, article, docs.

import { site } from "../data/site.js";
import { breadcrumbs, button, cards, formatDate, pill, prevNext, sources, summary, toCard, toc } from "./components.js";
import { cx, escape, html, jsonLd, raw, slugify, stripTags } from "./html.js";
import { icon } from "./icons.js";

const WORDS_PER_MINUTE = 230;

/** Adds ids to <h2>/<h3> that lack one and returns the headings for a table of contents. */
export function processHeadings(markup) {
  const headings = [];
  const used = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const out = markup.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (whole, level, attrs = "", inner) => {
    const text = stripTags(inner);
    let id = attrs.match(/\sid="([^"]+)"/)?.[1];
    if (!id) {
      const base = slugify(text);
      id = base;
      for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
      used.add(id);
      whole = `<h${level} id="${id}"${attrs}>${inner}</h${level}>`;
    }
    headings.push({ level: Number(level), id, text });
    return whole;
  });
  return { html: out, headings };
}

export function readingMinutes(markup) {
  const words = stripTags(markup).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

const isActive = (current, path) => current === path || (path !== "/" && current.startsWith(`${path}/`));
// "page" for the exact page, "true" for the section the page belongs to (the link that carries the visual underline).
const currentAttr = (current, path) => (current === path ? raw(' aria-current="page"') : isActive(current, path) ? raw(' aria-current="true"') : "");

function header(page) {
  return html`<header class="site-header">
  <div class="${cx("container", page.layout === "docs" && "container--wide", "site-header__inner")}">
    <a class="brand" href="/"><img src="/assets/logo-horizontal-white.svg" alt="Settlens" width="133" height="32"></a>
    <a class="nav-toggle" href="#site-map" data-nav-fallback>${icon("menu")}<span>Menu</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" data-nav-toggle hidden>${icon("menu", { className: "nav-toggle__open" })}${icon("x", { className: "nav-toggle__close" })}<span>Menu</span></button>
    <nav class="primary-nav" id="primary-nav" aria-label="Primary">
      <ul class="primary-nav__list" role="list">${site.nav.map(
        (item) =>
          html`<li><a class="${cx("primary-nav__link", isActive(page.path, item.path) && "is-active")}" href="${item.path}"${currentAttr(page.path, item.path)}>${item.label}</a></li>`,
      )}</ul>
      ${button({ label: site.cta.label, href: site.cta.path, size: "sm" })}
    </nav>
  </div>
</header>`;
}

function footer(page, year) {
  return html`<footer class="site-footer" id="site-map">
  <div class="container">
    <div class="site-footer__top">
      <div class="site-footer__brand">
        <a class="brand" href="/"><img src="/assets/logo-horizontal-white.svg" alt="Settlens" width="133" height="32" loading="lazy"></a>
        <p>${site.tagline}</p>
        <p><a class="site-footer__mail" href="mailto:${site.email}">${icon("mail")}${site.email}</a></p>
      </div>
      <nav class="site-footer__nav" aria-label="Site map">${site.footer.map(
        (column) => html`<div class="footer-col">
        <h2 class="footer-col__title">${column.title}</h2>
        <ul role="list">${column.links.map((link) => html`<li><a href="${link.path}"${page.path === link.path ? raw(' aria-current="page"') : ""}>${link.label}</a></li>`)}</ul>
      </div>`,
      )}</nav>
    </div>
    <div class="site-footer__bottom">
      <p>© ${year} ${site.name}. ${site.legal.offering} is offered by ${site.legal.tradeName}, the trade name of ${site.legal.publisher}, a sole proprietor registered in ${site.legal.address.country} (EI, SIREN ${site.legal.siren.replace(/(\d{3})(?=\d)/g, "$1 ")}).</p>
      <p>CLI v${site.version} · <a href="/rss.xml">${icon("rss")}RSS</a></p>
    </div>
  </div>
</footer>`;
}

function organization() {
  const { legal } = site;
  return {
    "@type": "Organization",
    "@id": `${site.origin}/#organization`,
    name: site.name,
    url: `${site.origin}/`,
    logo: { "@type": "ImageObject", url: `${site.origin}/assets/logo-mark.png`, width: 512, height: 512 },
    email: site.email,
    contactPoint: { "@type": "ContactPoint", contactType: "sales", email: site.email, availableLanguage: ["en", "fr"] },
    description: site.tagline,
    address: {
      "@type": "PostalAddress",
      streetAddress: legal.address.street,
      postalCode: legal.address.postalCode,
      addressLocality: legal.address.city,
      addressCountry: legal.address.countryCode,
    },
  };
}

function author(page) {
  if (!page.author) return { "@id": `${site.origin}/#organization` };
  return typeof page.author === "string" ? { "@type": "Person", name: page.author } : { "@type": "Person", ...page.author };
}

const absolute = (url) => (/^https?:/.test(url) ? url : `${site.origin}${url}`);

// Per-page Open Graph image from the build (page.ogImage), else the site default.
function ogImage(page) {
  if (!page.ogImage) return { url: absolute(site.ogImage.path), width: site.ogImage.width, height: site.ogImage.height, alt: site.ogImage.alt };
  return { alt: `${page.heading ?? page.title}: ${site.name}`, ...page.ogImage, url: absolute(page.ogImage.url) };
}

function pageNode(page) {
  const base = {
    "@id": `${page.url}#webpage`,
    url: page.url,
    name: page.heading ?? page.title,
    description: page.description,
    inLanguage: site.lang,
    isPartOf: { "@id": `${site.origin}/#website` },
    ...(page.summary ? { abstract: page.summary } : {}),
    ...(page.sources?.length
      ? { citation: page.sources.map((source) => ({ "@type": "CreativeWork", name: source.title, url: source.url, ...(source.publisher ? { publisher: { "@type": "Organization", name: source.publisher } } : {}) })) }
      : {}),
  };
  if (page.layout === "article" || page.layout === "docs") {
    return {
      ...base,
      "@type": page.schemaType ?? (page.layout === "docs" ? "TechArticle" : page.path.startsWith("/blog/") ? "BlogPosting" : "Article"),
      headline: page.heading ?? page.title,
      datePublished: page.datePublished ?? page.lastmod,
      dateModified: page.dateModified ?? page.lastmod,
      author: author(page),
      publisher: { "@id": `${site.origin}/#organization` },
      image: ogImage(page).url,
      mainEntityOfPage: page.url,
      ...(page.tags?.length ? { keywords: page.tags.join(", ") } : {}),
    };
  }
  // meta.schemaType: a more specific WebPage type (ContactPage, AboutPage, CollectionPage...).
  return { ...base, "@type": page.schemaType ?? "WebPage", dateModified: page.lastmod };
}

// The 404 document is served at every unknown URL: it names no canonical URL and no page entity.
const isNotFound = (page) => page.path === "/404";

export function pageGraph(page) {
  const extra = [page.jsonLd ?? []].flat().map(({ "@context": _context, ...node }) => node);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      { "@type": "WebSite", "@id": `${site.origin}/#website`, url: `${site.origin}/`, name: site.name, description: site.description, inLanguage: site.lang, publisher: { "@id": `${site.origin}/#organization` } },
      ...(isNotFound(page) ? [] : [pageNode(page)]),
      ...extra,
    ],
  };
}

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

function head(page, assets) {
  const image = ogImage(page);
  const isArticle = page.ogType === "article";
  // build.js fails the build when a page asks for "tools" and site/src/assets/tools.js is missing.
  const tools = page.scripts?.includes("tools") && assets.tools;
  return html`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.documentTitle}</title>
<meta name="description" content="${page.description}">
${isNotFound(page) ? "" : html`<link rel="canonical" href="${page.url}">\n`}
<meta name="robots" content="${page.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1"}">
<meta name="theme-color" content="${site.themeColor}">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/logo-mark.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${site.name} blog" href="/rss.xml">
${page.markdownUrl ? html`<link rel="alternate" type="text/markdown" href="${page.markdownUrl}" title="${page.documentTitle} (Markdown)">\n` : ""}${assets.font ? html`<link rel="preload" href="${assets.font}" as="font" type="font/woff2" crossorigin>\n` : ""}<link rel="stylesheet" href="${assets.css}">
<script src="${assets.js}" defer></script>
${tools ? html`<script src="${assets.tools}" defer></script>\n` : ""}<meta property="og:type" content="${isArticle ? "article" : "website"}">
<meta property="og:site_name" content="${site.name}">
<meta property="og:locale" content="${site.locale}">
${isNotFound(page) ? "" : html`<meta property="og:url" content="${page.url}">\n`}<meta property="og:title" content="${page.documentTitle}">
<meta property="og:description" content="${page.description}">
<meta property="og:image" content="${image.url}">
<meta property="og:image:type" content="${IMAGE_TYPES[image.url.slice(image.url.lastIndexOf("."))]}">
<meta property="og:image:width" content="${image.width}">
<meta property="og:image:height" content="${image.height}">
<meta property="og:image:alt" content="${image.alt}">
${isArticle && page.datePublished ? html`<meta property="article:published_time" content="${page.datePublished}">\n` : ""}${isArticle ? html`<meta property="article:modified_time" content="${page.dateModified ?? page.lastmod}">\n` : ""}${isArticle ? (page.tags ?? []).map((tag) => html`<meta property="article:tag" content="${tag}">\n`) : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${page.documentTitle}">
<meta name="twitter:description" content="${page.description}">
<meta name="twitter:image" content="${image.url}">
<meta name="twitter:image:alt" content="${image.alt}">
${jsonLd(pageGraph(page))}`;
}

/** Full HTML document around a rendered <main> body. */
export function documentShell({ page, main, assets, year }) {
  return `<!doctype html>
<html lang="${site.lang}" dir="ltr">
<head>
${head(page, assets)}
</head>
<body>
<a class="skip-link" href="${page.layout === "docs" ? "#content" : "#main"}">Skip to content</a>
${header(page)}
<main class="${escape(`main main--${page.layout}`)}" id="main" tabindex="-1">
${main}
</main>
${footer(page, year)}
</body>
</html>
`;
}

function crumbsBlock(crumbs) {
  return crumbs?.length ? html`<div class="container crumbs">${breadcrumbs(crumbs)}</div>` : "";
}

// End of the leading hero <section> (nested sections counted), or 0 when the body does not start with one.
function heroEnd(body) {
  if (!/^\s*<section class="hero[\s"]/.test(body)) return 0;
  const tag = /<(\/?)section\b[^>]*>/g;
  let depth = 0;
  for (let match; (match = tag.exec(body)); ) {
    depth += match[1] ? -1 : 1;
    if (!depth) return tag.lastIndex;
  }
  return 0;
}

// Page layout: "In short" right after the hero, sources just before the closing CTA band (or at the end).
function pageLayout({ page, body, crumbs }) {
  let markup = String(body);
  if (page.sources?.length) {
    const band = html`<div class="container sources-band">${sources(page.sources)}</div>`;
    const cta = markup.lastIndexOf('<section class="cta-band"');
    markup = cta < 0 ? `${markup}${band}` : `${markup.slice(0, cta)}${band}\n${markup.slice(cta)}`;
  }
  if (page.summary) {
    const at = heroEnd(markup);
    markup = `${markup.slice(0, at)}\n${html`<div class="container answer-band">${summary({ text: page.summary })}</div>`}\n${markup.slice(at)}`;
  }
  return html`${crumbsBlock(crumbs)}${raw(markup)}`;
}

// Article and docs: the Sources section closes the prose and gets a table-of-contents entry.
const withSources = (page, headings) => (page.sources?.length && headings.length ? [...headings, { level: 2, id: "sources", text: "Sources" }] : headings);

function articleMeta(page) {
  const parts = [];
  if (page.datePublished) parts.push(html`<span>Published <time datetime="${page.datePublished}">${formatDate(page.datePublished)}</time></span>`);
  const updated = page.dateModified ?? page.lastmod;
  if (updated && updated !== page.datePublished) parts.push(html`<span>Updated <time datetime="${updated}">${formatDate(updated)}</time></span>`);
  parts.push(html`<span>${icon("clock")}${page.readingMinutes ?? 1} min read</span>`);
  if (page.author) {
    const name = typeof page.author === "string" ? page.author : page.author.name;
    // An author url on this site (blog AUTHOR → /about) becomes a relative byline link.
    const href = page.author.url?.startsWith(site.origin) ? page.author.url.slice(site.origin.length) || "/" : page.author.url;
    parts.push(html`<span>By ${href ? html`<a href="${href}">${name}</a>` : name}</span>`);
  }
  return html`<p class="article__meta">${parts}</p>`;
}

function relatedPages(page, ctx) {
  if (page.related) return page.related.map((path) => ctx.find(path) ?? { path, title: path, description: "" });
  return ctx.pages
    .filter((other) => other.section === page.section && other.path !== page.path && other.layout === "article" && !other.noindex)
    .sort((a, b) => String(b.datePublished ?? b.lastmod).localeCompare(String(a.datePublished ?? a.lastmod)))
    .slice(0, 3);
}

function mobileToc(headings) {
  const nav = toc(headings);
  return nav ? html`<details class="toc-mobile"><summary>On this page${icon("chevron-down")}</summary>${nav}</details>` : "";
}

function articleLayout({ page, body, headings: bodyHeadings, crumbs, ctx }) {
  const related = relatedPages(page, ctx);
  const headings = withSources(page, bodyHeadings);
  return html`<article class="article">
  <header class="container article__head">
    ${crumbs?.length ? breadcrumbs(crumbs) : ""}
    <h1 class="article__title">${page.h1 ?? page.heading ?? page.title}</h1>
    <p class="article__lede">${page.lede ?? page.description}</p>
    ${articleMeta(page)}
    ${page.tags?.length ? html`<p class="article__tags">${page.tags.map((tag) => pill(tag))}</p>` : ""}
    ${summary({ text: page.summary })}
  </header>
  <div class="container article__grid">
    <div class="article__body">
      ${mobileToc(headings)}
      <div class="prose">${raw(body)}${sources(page.sources)}</div>
    </div>
    <aside class="article__aside" aria-label="On this page">${toc(headings, { className: "toc--sticky" })}</aside>
  </div>
  <footer class="container article__foot">
    ${related.length ? html`<section class="related" aria-labelledby="related-heading"><h2 class="related__title" id="related-heading">Related reading</h2>${cards(related.map(toCard), { columns: 3 })}</section>` : ""}
    <div class="article__cta">
      <p>Want this checked on your own x402 endpoints, or before your agent pays?</p>
      <div class="actions">${button({ label: "Request a pilot", href: site.cta.path, icon: "arrow-right" })}${button({ label: "Try the free MCP tools", href: "/mcp", variant: "secondary" })}</div>
    </div>
  </footer>
</article>`;
}

/** Docs sidebar groups limited to pages that exist, plus any unlisted docs pages under "More". */
export function docsGroups(pages) {
  const docs = pages.filter((page) => page.path === "/docs" || page.path.startsWith("/docs/"));
  const listed = new Set(site.docsNav.flatMap((group) => group.paths));
  const byPath = new Map(docs.map((page) => [page.path, page]));
  const groups = site.docsNav
    .map((group) => ({ title: group.title, pages: group.paths.map((path) => byPath.get(path)).filter(Boolean) }))
    .filter((group) => group.pages.length);
  const extra = docs.filter((page) => !listed.has(page.path)).sort((a, b) => a.path.localeCompare(b.path));
  if (extra.length) groups.push({ title: "More", pages: extra });
  return groups;
}

function docsNav(groups, current, label) {
  return html`<nav class="docs-nav" aria-label="${label}">${groups.map(
    (group) => html`<div class="docs-nav__group">
    <p class="docs-nav__title">${group.title}</p>
    <ul role="list">${group.pages.map((page) => html`<li><a href="${page.path}"${page.path === current ? raw(' aria-current="page"') : ""}>${page.label ?? page.heading ?? page.title}</a></li>`)}</ul>
  </div>`,
  )}</nav>`;
}

function docsLayout({ page, body, headings: bodyHeadings, crumbs, ctx }) {
  const headings = withSources(page, bodyHeadings);
  const groups = docsGroups(ctx.pages);
  const order = groups.flatMap((group) => group.pages);
  const index = order.findIndex((entry) => entry.path === page.path);
  const link = (entry) => entry && { path: entry.path, title: entry.label ?? entry.heading ?? entry.title };
  return html`<div class="container container--wide docs">
  <aside class="docs__sidebar" aria-label="Documentation">${docsNav(groups, page.path, "Documentation")}</aside>
  <div class="docs__main" id="content" tabindex="-1">
    <details class="docs__mobile-nav"><summary>${icon("book")}Documentation menu${icon("chevron-down")}</summary>${docsNav(groups, page.path, "Documentation menu")}</details>
    ${crumbs?.length ? breadcrumbs(crumbs) : ""}
    <header class="docs__head">
      <h1 class="docs__title">${page.heading ?? page.title}</h1>
      <p class="docs__lede">${page.lede ?? page.description}</p>
    </header>
    ${summary({ text: page.summary })}
    ${mobileToc(headings)}
    <div class="prose">${raw(body)}${sources(page.sources)}</div>
    <p class="docs__updated">Last updated <time datetime="${page.lastmod}">${formatDate(page.lastmod)}</time></p>
    ${prevNext({ prev: link(order[index - 1]), next: index >= 0 ? link(order[index + 1]) : undefined })}
  </div>
  <aside class="docs__toc" aria-label="On this page">${toc(headings, { className: "toc--sticky" })}</aside>
</div>`;
}

export const LAYOUTS = { page: pageLayout, article: articleLayout, docs: docsLayout };

/** Default layout from the path: /docs* → docs, /blog/* and /learn/* → article, otherwise page. */
export function defaultLayout(path) {
  if (path === "/docs" || path.startsWith("/docs/")) return "docs";
  if (/^\/(blog|learn)\/./.test(path)) return "article";
  return "page";
}
