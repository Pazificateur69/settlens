// UI components. Each returns SafeHtml and is documented with a usage example in
// site/src/README.md and rendered on /styleguide. Text arguments are escaped; pass
// html`` (or raw()) when an argument must contain markup.

import { site } from "../data/site.js";
import { cx, html, jsonLd, raw, slugify, stripTags, toHtmlString } from "./html.js";
import { highlight, LANGUAGE_LABELS, normalizeLanguage } from "./highlight.js";
import { icon } from "./icons.js";

const absolute = (path) => (/^https?:/.test(path) ? path : `${site.origin}${path}`);
// Text for attribute values: an html`` argument would otherwise be inserted unescaped inside the quotes.
const plain = (value) => stripTags(toHtmlString(value));
// stripTags turns inline tags into spaces: "x402</a>." would read "x402 ." in structured data.
const plainSentence = (value) => plain(value).replace(/\s+([.,;:!?)])/g, "$1");

/** button({ label: "Request a pilot", href: "/contact" }) — a link styled as a button; omit href for a <button>. */
export function button({ label, href, variant = "primary", size, icon: iconName, type = "button", attrs } = {}) {
  const className = cx("btn", `btn--${variant}`, size && `btn--${size}`);
  const content = html`<span>${label}</span>${iconName ? icon(iconName) : ""}`;
  if (href) return html`<a class="${className}" href="${href}" ${attrs ? raw(attrs) : ""}>${content}</a>`;
  return html`<button class="${className}" type="${type}" ${attrs ? raw(attrs) : ""}>${content}</button>`;
}

// One primary action per band: the first hero and CTA-band action. Section actions are secondary unless
// an action passes variant: "primary" itself.
function actionsRow(actions = [], lead = "primary") {
  if (!actions.length) return "";
  return html`<div class="actions">${actions.map((action, index) => button({ variant: index === 0 ? lead : "secondary", ...action }))}</div>`;
}

/** hero({ title, lede, actions: [{ label, href }], aside }) — the page's <h1>. Use once, at the top. */
export function hero({ title, lede, actions = [], aside, note, align = aside ? "split" : "center" } = {}) {
  return html`<section class="${cx("hero", `hero--${align}`)}">
  <div class="container hero__inner">
    <div class="hero__copy">
      <h1 class="hero__title">${title}</h1>
      ${lede ? html`<p class="hero__lede">${lede}</p>` : ""}
      ${actionsRow(actions)}
      ${note ? html`<p class="hero__note">${note}</p>` : ""}
    </div>
    ${aside ? html`<div class="hero__aside">${aside}</div>` : ""}
  </div>
</section>`;
}

/** section({ title, lede, body, id, tone: "default"|"raised", width: "default"|"narrow"|"wide" }) */
export function section({ title, lede, body, id, tone = "default", width = "default", align = "start", actions } = {}) {
  const headingId = title ? `${id ?? slugify(stripTags(toHtmlString(title)))}-heading` : undefined;
  return html`<section class="${cx("section", tone !== "default" && `section--${tone}`)}"${id ? html` id="${id}"` : ""}${headingId ? html` aria-labelledby="${headingId}"` : ""}>
  <div class="${cx("container", width !== "default" && `container--${width}`)}">
    ${title ? html`<header class="${cx("section__head", align === "center" && "section__head--center")}">
      <h2 class="section__title" id="${headingId}">${title}</h2>
      ${lede ? html`<p class="section__lede">${lede}</p>` : ""}
    </header>` : ""}
    ${body ?? ""}
    ${actionsRow(actions, "secondary")}
  </div>
</section>`;
}

/** container(body, { width }) — horizontal page gutter and max width, for content outside section(). */
export function container(body, { width = "default" } = {}) {
  return html`<div class="${cx("container", width !== "default" && `container--${width}`)}">${body}</div>`;
}

/** split({ main, aside, reverse }) — two columns that stack on small screens. */
export function split({ main, aside, reverse = false } = {}) {
  return html`<div class="${cx("split", reverse && "split--reverse")}"><div class="split__main">${main}</div><div class="split__aside">${aside}</div></div>`;
}

/** prose(body) — long-form typography for paragraphs, lists, inline code and tables. */
export function prose(body) {
  return html`<div class="prose">${body}</div>`;
}

/** cards([{ title, body, href, icon, tag }], { columns: 2|3|4 }) — boxed, optionally linked tiles. */
export function cards(items, { columns = 3, headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return html`<ul class="${cx("cards", `cards--${columns}`)}" role="list">${items.map(
    (item) => html`<li class="${cx("card", item.href && "card--link")}">
      ${item.icon ? html`<span class="card__icon">${icon(item.icon)}</span>` : ""}
      <${raw(h)} class="card__title">${item.href ? html`<a class="card__link" href="${item.href}">${item.title}</a>` : item.title}</${raw(h)}>
      ${item.body ? html`<p class="card__body">${item.body}</p>` : ""}
      ${item.tag ? html`<p class="card__meta">${badge(item.tag)}</p>` : ""}
      ${item.href ? html`<span class="card__arrow">${icon("arrow-right")}</span>` : ""}
    </li>`,
  )}</ul>`;
}

/** featureGrid([{ title, body, icon }], { columns }) — unboxed feature list with hairline rules. */
export function featureGrid(items, { columns = 3, headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return html`<ul class="${cx("features", `features--${columns}`)}" role="list">${items.map(
    (item) => html`<li class="feature">
      ${item.icon ? html`<span class="feature__icon">${icon(item.icon)}</span>` : ""}
      <${raw(h)} class="feature__title">${item.title}</${raw(h)}>
      <p class="feature__body">${item.body}</p>
      ${item.href ? html`<a class="feature__link" href="${item.href}">${item.linkLabel ?? "Learn more"}${icon("arrow-right")}</a>` : ""}
    </li>`,
  )}</ul>`;
}

/** steps([{ title, body }]) — an ordered procedure; numbers are meaningful here. */
export function steps(items, { headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return html`<ol class="steps" role="list">${items.map(
    (item, index) => html`<li class="step">
      <span class="step__index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <div class="step__content">
        <${raw(h)} class="step__title">${item.title}</${raw(h)}>
        ${item.body ? html`<div class="step__body">${typeof item.body === "string" ? html`<p>${item.body}</p>` : item.body}</div>` : ""}
      </div>
    </li>`,
  )}</ol>`;
}

const CALLOUT_ICONS = { info: "info", note: "file", success: "check-circle", warning: "alert", danger: "x-circle" };

/** callout({ tone: "info"|"note"|"success"|"warning"|"danger", title, body }) */
export function callout({ tone = "info", title, body } = {}) {
  if (!CALLOUT_ICONS[tone]) throw new Error(`Unknown callout tone "${tone}".`);
  return html`<div class="${cx("callout", `callout--${tone}`)}" role="note">
  <span class="callout__icon">${icon(CALLOUT_ICONS[tone])}</span>
  <div class="callout__content">
    ${title ? html`<p class="callout__title">${title}</p>` : ""}
    ${typeof body === "string" ? html`<p>${body}</p>` : (body ?? "")}
  </div>
</div>`;
}

/** codeBlock({ code, lang: "shell"|"json"|"yaml"|..., title, copy, wrap }) — copy button appears with JS; wrap: true breaks long lines (base64, minified JSON, one-line commands) instead of scrolling. */
export function codeBlock({ code, lang = "text", title, copy = true, wrap = false } = {}) {
  const language = normalizeLanguage(lang);
  const label = LANGUAGE_LABELS[language] ?? language.toUpperCase();
  return html`<figure class="${cx("code", wrap && "code--wrap")}">
  <figcaption class="code__bar">
    <span class="code__lang">${label}</span>${title ? html`<span class="code__title">${title}</span>` : ""}
    ${copy ? html`<button class="code__copy" type="button" data-copy hidden aria-label="Copy code${title ? ` (${plain(title)})` : ""}">${icon("copy", { className: "code__copy-icon" })}${icon("check", { className: "code__copy-done" })}<span data-copy-label>Copy</span></button>` : ""}
  </figcaption>
  <pre class="code__pre"${wrap ? "" : raw(' tabindex="0"')}><code class="language-${language}">${raw(highlight(String(code).replace(/^\n+|\s+$/g, ""), language))}</code></pre>
</figure>`;
}

/** terminal({ title, lines: [{ text, kind: "cmd"|"cont"|"out"|"pass"|"fail"|"warn"|"skip"|"muted" }] }) — static CLI transcript; "cont" continues a command without a prompt. */
export function terminal({ title = "Terminal", lines = [], replay = true } = {}) {
  return html`<figure class="terminal"${replay ? raw(" data-replay") : ""}>
  <figcaption class="terminal__bar"><span class="terminal__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="terminal__title">${title}</span></figcaption>
  <pre class="terminal__body"><code>${lines.map(
    (line) =>
      html`<span class="${cx("t-line", `t-${line.kind ?? "out"}`)}">${line.kind === "cmd" ? html`<span class="t-prompt" aria-hidden="true">$ </span>` : ""}${line.text || " "}</span>\n`,
  )}</code></pre>
</figure>`;
}

/** table({ caption, head: ["Col", ...], rows: [["cell", ...]], rowHeaders }) — below 48rem each row stacks into a card of label/value pairs. */
export function table({ caption, head = [], rows = [], rowHeaders = false, numeric = [] } = {}) {
  // The column header repeated on each cell, shown as its label when rows stack on small screens.
  const label = (column) => (head[column] && plain(head[column]) ? html` data-label="${plain(head[column])}"` : "");
  // A row header that is one short token (an ID such as PAY-01) never wraps; longer labels still do.
  const cell = (value, column) =>
    rowHeaders && column === 0
      ? html`<th scope="row"${/^\S{1,24}$/.test(plain(value)) ? raw(' class="table__id"') : ""}>${value}</th>`
      : html`<td${numeric.includes(column) ? raw(' class="num"') : ""}${label(column)}>${value}</td>`;
  return html`<div class="table-wrap" role="region" aria-label="${caption ? plain(caption) : "Table"}" tabindex="0">
  <table class="table">
    ${caption ? html`<caption>${caption}</caption>` : ""}
    ${head.length ? html`<thead><tr>${head.map((label, column) => html`<th scope="col"${numeric.includes(column) ? raw(' class="num"') : ""}>${label}</th>`)}</tr></thead>` : ""}
    <tbody>${rows.map((row) => html`<tr>${row.map(cell)}</tr>`)}</tbody>
  </table>
</div>`;
}

const comparisonValue = (value) => {
  if (value === true) return html`<span class="cmp cmp--yes">${icon("check", { label: "Yes" })}</span>`;
  if (value === false) return html`<span class="cmp cmp--no">${icon("minus", { label: "No" })}</span>`;
  return value;
};

/** comparisonTable({ caption, columns: ["", "Settlens", "Manual"], rows: [{ label, values: [true, false] }], highlight: 1 }) */
export function comparisonTable({ caption, columns = [], rows = [], highlight = 1 } = {}) {
  return html`<div class="table-wrap" role="region" aria-label="${caption ? plain(caption) : "Comparison"}" tabindex="0">
  <table class="table table--compare">
    ${caption ? html`<caption>${caption}</caption>` : ""}
    <thead><tr>${columns.map((label, index) => html`<th scope="col"${index === highlight ? raw(' class="is-highlight"') : ""}>${label}</th>`)}</tr></thead>
    <tbody>${rows.map(
      (row) =>
        html`<tr><th scope="row">${row.label}</th>${row.values.map((value, index) => html`<td${index + 1 === highlight ? raw(' class="is-highlight"') : ""}>${comparisonValue(value)}</td>`)}</tr>`,
    )}</tbody>
  </table>
</div>`;
}

/** faq([{ q, a }]) — accordion plus FAQPage JSON-LD. Use at most once per page. */
export function faq(items) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: plainSentence(item.q),
      acceptedAnswer: { "@type": "Answer", text: plainSentence(item.a) },
    })),
  };
  return html`<div class="faq">${items.map(
    (item) => html`<details class="faq__item">
    <summary class="faq__q"><span>${item.q}</span>${icon("chevron-down", { className: "faq__chevron" })}</summary>
    <div class="faq__a">${typeof item.a === "string" ? html`<p>${item.a}</p>` : item.a}</div>
  </details>`,
  )}</div>${jsonLd(data)}`;
}

/** cta({ title, body, actions: [{ label, href }] }) — closing call-to-action band (contains an <h2>). */
export function cta({ title, body, actions = [] } = {}) {
  return html`<section class="cta-band" aria-labelledby="${slugify(stripTags(toHtmlString(title)))}-cta">
  <div class="container">
    <div class="cta-band__inner">
      <div class="cta-band__copy">
        <h2 class="cta-band__title" id="${slugify(stripTags(toHtmlString(title)))}-cta">${title}</h2>
        ${body ? html`<p class="cta-band__body">${body}</p>` : ""}
      </div>
      ${actionsRow(actions)}
    </div>
  </div>
</section>`;
}

/** pricingCards([{ name, price, period, description, features, cta: { label, href }, featured, badge }]) */
export function pricingCards(plans) {
  return html`<ul class="pricing" role="list">${plans.map(
    (plan) => html`<li class="${cx("plan", plan.featured && "plan--featured")}">
    <div class="plan__head">
      <h3 class="plan__name">${plan.name}</h3>
      ${plan.badge ? badge(plan.badge, { tone: plan.featured ? "accent" : "neutral" }) : ""}
    </div>
    <p class="plan__price"><span class="plan__amount">${plan.price}</span>${plan.period ? html`<span class="plan__period">${plan.period}</span>` : ""}</p>
    ${plan.description ? html`<p class="plan__desc">${plan.description}</p>` : ""}
    ${plan.cta ? button({ variant: plan.featured ? "primary" : "secondary", ...plan.cta }) : ""}
    <ul class="plan__features" role="list">${(plan.features ?? []).map((feature) => html`<li>${icon("check")}<span>${feature}</span></li>`)}</ul>
    ${plan.note ? html`<p class="plan__note">${plan.note}</p>` : ""}
  </li>`,
  )}</ul>`;
}

/** badge("Passive", { tone: "neutral"|"accent"|"success"|"warning"|"danger"|"info" }) */
export function badge(text, { tone = "neutral", shape = "badge" } = {}) {
  return html`<span class="${cx("badge", `badge--${tone}`, shape === "pill" && "badge--pill")}">${text}</span>`;
}

/** pill("x402 V2") — rounded tag; same options as badge(). */
export function pill(text, options = {}) {
  return badge(text, { ...options, shape: "pill" });
}

/** stats([{ value, label, detail }]) — a definition list of facts. Only verifiable facts, never invented metrics. */
export function stats(items) {
  return html`<dl class="stats">${items.map(
    (item) => html`<div class="stat"><dt class="stat__label">${item.label}</dt><dd class="stat__value">${item.value}</dd>${item.detail ? html`<dd class="stat__detail">${item.detail}</dd>` : ""}</div>`,
  )}</dl>`;
}

/** stat({ value, label, detail }) — a single fact; same markup as stats(). */
export function stat(item) {
  return stats([item]);
}

/** diagram({ svg, svgNarrow, label, caption }) — wraps inline SVG drawn with the d-* classes; label is the accessible description. svgNarrow (optional) is a stacked version shown instead below 40rem. */
export function diagram({ svg, svgNarrow, label, caption, size = "default" } = {}) {
  if (!label) throw new Error("diagram() requires a label describing what the diagram shows.");
  const hidden = (markup) => String(markup).replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"');
  return html`<figure class="${cx("diagram", size !== "default" && `diagram--${size}`, svgNarrow && "diagram--has-narrow")}">
  <div class="diagram__canvas" role="img" aria-label="${plain(label)}" tabindex="0">${raw(hidden(svg))}${svgNarrow ? html`<div class="diagram__narrow">${raw(hidden(svgNarrow))}</div>` : ""}</div>
  ${caption ? html`<figcaption class="diagram__caption">${caption}</figcaption>` : ""}
</figure>`;
}

/** breadcrumbs([{ name, path }]) — last item is the current page. Emits BreadcrumbList JSON-LD. */
export function breadcrumbs(items) {
  if (!items?.length) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
  return html`<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items.map((item, index) =>
    index === items.length - 1
      ? html`<li><span aria-current="page">${item.name}</span></li>`
      : html`<li><a href="${item.path}">${item.name}</a>${icon("chevron-right", { className: "breadcrumbs__sep" })}</li>`,
  )}</ol></nav>${jsonLd(data)}`;
}

/** toc([{ id, text, level }]) — "On this page" navigation; renders nothing for fewer than two headings. */
export function toc(headings, { title = "On this page", className } = {}) {
  if (!headings || headings.length < 2) return "";
  return html`<nav class="${cx("toc", className)}" aria-label="${title}">
  <p class="toc__title">${title}</p>
  <ol class="toc__list" role="list">${headings.map((heading) => html`<li class="${cx("toc__item", heading.level === 3 && "toc__item--sub")}"><a href="#${heading.id}" data-toc-link>${breakable(heading.text)}</a></li>`)}</ol>
</nav>`;
}

/** prevNext({ prev: { title, path }, next: { title, path } }) — sequential navigation for docs. */
export function prevNext({ prev, next } = {}) {
  if (!prev && !next) return "";
  return html`<nav class="prev-next" aria-label="Previous and next pages">
  ${prev ? html`<a class="prev-next__link prev-next__link--prev" href="${prev.path}" rel="prev"><span class="prev-next__dir">${icon("arrow-left")}Previous</span><span class="prev-next__title">${prev.title}</span></a>` : ""}
  ${next ? html`<a class="prev-next__link prev-next__link--next" href="${next.path}" rel="next"><span class="prev-next__dir">Next${icon("arrow-right")}</span><span class="prev-next__title">${next.title}</span></a>` : ""}
</nav>`;
}

/** formatDate("2026-10-13") → "Oct 13, 2026" (UTC, en-US). */
export function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** postList(ctx.posts(), { headingLevel, variant: "index" }) — blog entries: date, title, description, tags, reading time. "index": editorial layout, meta in a left column from 64rem. */
export function postList(posts, { headingLevel = 2, variant } = {}) {
  const h = `h${headingLevel}`;
  return html`<ol class="${cx("post-list", variant && `post-list--${variant}`)}" role="list">${posts.map(
    (post) => html`<li class="post-card">
    <p class="post-card__meta"><time datetime="${post.datePublished}">${formatDate(post.datePublished)}</time>${post.readingMinutes ? html`<span>${post.readingMinutes} min read</span>` : ""}</p>
    <${raw(h)} class="post-card__title"><a href="${post.path}">${post.heading ?? post.title}</a></${raw(h)}>
    <p class="post-card__desc">${post.description}</p>
    ${post.tags?.length ? html`<p class="post-card__tags">${post.tags.map((tag) => pill(tag))}</p>` : ""}
  </li>`,
  )}</ol>`;
}

/** keyValues([{ term, value }]) — labelled facts such as legal or contact details. */
export function keyValues(items) {
  return html`<dl class="kv">${items.map((item) => html`<div class="kv__row"><dt>${item.term}</dt><dd>${item.value}</dd></div>`)}</dl>`;
}

/** pilotForm({ source: "/contact" }) — posts JSON with JS, or a plain form post without JS (303 back to source#pilot-sent). */
export function pilotForm({ source = "/contact", submitLabel = "Request a pilot", messageHint, messagePlaceholder = "" } = {}) {
  return html`<form class="form" action="/api/pilot" method="post" data-pilot-form>
  <p class="form__flash form__flash--ok" id="pilot-sent" tabindex="-1">${icon("check-circle")}<span>Thanks, your request was received. We reply by email from ${site.email}.</span></p>
  <p class="form__flash form__flash--error" id="pilot-error" tabindex="-1">${icon("alert")}<span>Your request could not be sent. Check the fields and try again, or email ${site.email}.</span></p>
  <input type="hidden" name="source" value="${source}">
  <div class="form__hp" aria-hidden="true"><label for="pilot-website">Leave this field empty</label><input id="pilot-website" name="website" tabindex="-1" autocomplete="off"></div>
  <div class="form__row">
    <div class="field"><label class="field__label" for="pilot-name">Name</label><input class="field__input" id="pilot-name" name="name" autocomplete="name" required maxlength="200"></div>
    <div class="field"><label class="field__label" for="pilot-email">Work email</label><input class="field__input" id="pilot-email" name="email" type="email" autocomplete="email" required maxlength="320"></div>
  </div>
  <div class="field"><label class="field__label" for="pilot-company">Company</label><input class="field__input" id="pilot-company" name="company" autocomplete="organization" required maxlength="200"></div>
  <div class="field"><label class="field__label" for="pilot-message">What do you want checked?</label><textarea class="field__input" id="pilot-message" name="message" rows="5" required maxlength="4000" placeholder="${messagePlaceholder}" aria-describedby="pilot-message-hint"></textarea><p class="field__hint" id="pilot-message-hint">${messageHint ?? "Endpoints, facilitators or agent flows in scope, and the engagement you have in mind (pilot, Team or Assurance). Never include secrets, private keys or wallet seeds."}</p></div>
  <div class="form__footer">
    ${button({ label: submitLabel, type: "submit", icon: "arrow-right" })}
    <p class="form__note">We use these details only to reply. See the <a href="/privacy">privacy notice</a>.</p>
  </div>
  <p class="form__status" role="status" aria-live="polite" data-form-status></p>
</form>`;
}

/** toCard(page) — maps a page record (from ctx.pages / ctx.children) to a cards() item. */
export function toCard(page) {
  return { title: page.label ?? page.heading ?? page.title, body: page.description, href: page.path, icon: page.icon };
}

/* ---------- Product visuals and answer blocks ---------- */

// Long identifiers (policy.maximum_amount, security.invalid_signature_fail_closed) may break after "." and "_".
const breakable = (text) => html`${String(text).split(/(?<=[._])/).map((part, index) => (index ? html`<wbr>${part}` : part))}`;
const caption = (text) => (text ? html`<figcaption class="visual__caption">${text}</figcaption>` : "");
const STATUS_ICONS = { pass: ["check-circle", "Pass"], warn: ["alert", "Warning"], fail: ["x-circle", "Fail"] };
const SEVERITY_TONES = { critical: "danger", high: "warning", medium: "info", low: "neutral", info: "neutral" };

function panelFrame({ title, meta, kind, caption: text }, body) {
  return html`<figure class="${cx("visual", kind && `visual--${kind}`)}"><div class="panel"><div class="panel__bar"><span class="panel__dot" aria-hidden="true"></span><span class="panel__title">${breakable(title)}</span>${meta ? html`<span class="panel__meta">${meta}</span>` : ""}</div>${body}</div>${caption(text)}</figure>`;
}

/** panel({ title, meta, body, caption }) — the shared chrome of product visuals: a titled bar over real output. body: string or html. */
export function panel({ title, meta, body, caption: text } = {}) {
  return panelFrame({ title, meta, caption: text }, html`<div class="panel__body">${typeof body === "string" ? html`<p>${body}</p>` : (body ?? "")}</div>`);
}

/** inspector({ title, meta, request: { label, call, response }, rows: [{ field, value, check, status: "pass"|"warn"|"fail" }], decision: { value, tone, reason }, caption }) — one payment request checked field by field. Real data only. */
export function inspector({ title, meta, request, rows = [], decision, caption: text } = {}) {
  return panelFrame(
    { title, meta, kind: "inspector", caption: text },
    html`${request ? html`<p class="inspector__req"><span>${request.label}</span><code>${request.call}</code>${icon("arrow-right")}<span class="sr-only">received</span><code>${request.response}</code></p>` : ""}<dl class="inspector__rows">${rows.map((row) => {
      const status = STATUS_ICONS[row.status];
      if (!status) throw new Error(`inspector(): unknown status "${row.status}".`);
      return html`<div class="${cx("inspector__row", `is-${row.status}`)}"><dt>${breakable(row.field)}</dt><dd class="inspector__val"><code>${row.value}</code></dd><dd class="inspector__check">${icon(status[0], { label: status[1] })}<code>${breakable(row.check)}</code></dd></div>`;
    })}</dl>${decision ? html`<div class="inspector__decision"><span class="inspector__label">decision</span>${badge(decision.value, { tone: decision.tone })}<p>${decision.reason}</p></div>` : ""}`,
  );
}

/** reportPreview({ file, meta, mode, target, summary: { pass, fail, warn, skip }, findings: [{ id, severity, message }], facts: [{ term, value }], caption }) — a Settlens JSON report at a glance, from a recorded run. */
export function reportPreview({ file, meta, mode, target, summary: counts = {}, findings = [], facts = [], caption: text } = {}) {
  return panelFrame(
    { title: file, meta, kind: "report", caption: text },
    html`<div class="report__head"><p class="report__target">${badge(mode, { tone: mode === "passive" ? "neutral" : "warning" })}<code>${target}</code></p><dl class="report__counts">${["pass", "fail", "warn", "skip"].map((key) => html`<div class="is-${key}"><dt>${key}</dt><dd>${counts[key] ?? 0}</dd></div>`)}</dl></div>${findings.length ? html`<ul class="report__findings" role="list">${findings.map((finding) => html`<li class="report__finding">${badge(finding.severity, { tone: SEVERITY_TONES[finding.severity] ?? "neutral" })}<code>${breakable(finding.id)}</code><p>${finding.message}</p></li>`)}</ul>` : ""}${facts.length ? html`<dl class="report__foot">${facts.map((fact) => html`<div><dt>${fact.term}</dt><dd>${fact.value}</dd></div>`)}</dl>` : ""}`,
  );
}

/** verdicts({ title, meta, items: [{ decision, tone, when, detail }], caption }) — one request evaluated under several policies. */
export function verdicts({ title, meta, items = [], caption: text } = {}) {
  return panelFrame(
    { title, meta, kind: "verdicts", caption: text },
    html`<ul class="verdicts__list" role="list">${items.map((item) => html`<li class="verdicts__item">${badge(item.decision, { tone: item.tone })}<div><p class="verdicts__when">${item.when}</p>${item.detail ? html`<p class="verdicts__why">${item.detail}</p>` : ""}</div></li>`)}</ul>`,
  );
}

/** summary({ text, label }) — the answer-first "In short" block. Layouts render it from meta.summary; one per page (fixed id). */
export function summary({ text, label = "In short" } = {}) {
  if (!text) return "";
  return html`<section class="summary" aria-labelledby="in-short"><p class="summary__label" id="in-short">${label}</p><p class="summary__text">${text}</p></section>`;
}

/** sources([{ title, url, publisher }], { title }) — primary sources cited by the page, as an <h2> section (id "sources"). Layouts render it from meta.sources. */
export function sources(items = [], { title = "Sources" } = {}) {
  if (!items.length) return "";
  const host = (url) => new URL(url).hostname.replace(/^www\./, "");
  return html`<section class="sources" aria-labelledby="sources"><h2 class="sources__title" id="sources">${title}</h2><ol class="sources__list" role="list">${items.map((item) => html`<li><span><a href="${item.url}">${item.title}</a><span class="sources__meta">${item.publisher ? `${item.publisher} · ` : ""}${host(item.url)}</span></span></li>`)}</ol></section>`;
}
