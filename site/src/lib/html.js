// Tiny HTML templating: every interpolation is escaped unless wrapped in raw().

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Marks a trusted string as HTML. Only for markup you wrote or already escaped. */
export function raw(value) {
  return value instanceof SafeHtml ? value : new SafeHtml(String(value ?? ""));
}

function serialize(value) {
  if (value == null || value === false || value === true) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join("");
  return escape(value);
}

/**
 * Tagged template: html`<p>${text}</p>`. Arrays are joined, null/false/true render
 * nothing, nested html`` results and raw() values are inserted as-is.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += serialize(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Joins truthy class names: cx("card", featured && "card--featured"). */
export function cx(...names) {
  return names.filter(Boolean).join(" ");
}

export function toHtmlString(value) {
  return serialize(value);
}

export function stripTags(markup) {
  return String(markup)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(text) {
  return (
    String(text)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/** JSON for a <script type="application/ld+json"> block, safe against </script> breakout. */
export function jsonLd(data) {
  return raw(
    `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`,
  );
}
