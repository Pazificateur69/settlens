import { cx, html, raw } from "./html.js";

// One authored set: 24px grid, 1.75 stroke, round joins. Strokes use currentColor (see .icon in site.css).
const PATHS = {
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  "chevron-right": '<path d="M9 6l6 6-6 6"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  minus: '<path d="M6 12h12"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.75v.01"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17.25v.01"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8.25 12.25l2.5 2.5 5-5.25"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6L12 3z"/>',
  "shield-check":
    '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6L12 3z"/><path d="M8.75 12l2.25 2.25 4.25-4.5"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  branch:
    '<circle cx="6" cy="6" r="2.25"/><circle cx="6" cy="18" r="2.25"/><circle cx="18" cy="8" r="2.25"/><path d="M6 8.25v7.5M18 10.25v.5c0 3.5-3 4.5-9.9 6.1"/>',
  activity: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  seal: '<circle cx="12" cy="9.5" r="6"/><path d="M8.6 14.4 7 21l5-2.5 5 2.5-1.6-6.6"/>',
  signature: '<path d="M3 16.5c3-1 4-7 6-7s1 6 3 6 2-3 3-3 1 2 3 2h3M3 20.5h18"/>',
  chip:
    '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  book: '<path d="M5 16.5V7.5a3 3 0 0 1 3-3h11v12H8a3 3 0 0 0-3 3 3 3 0 0 0 3 3h11v-3"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2 2M14.5 8.5l1.5 1.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  rss: '<path d="M5 5.5A13.5 13.5 0 0 1 18.5 19M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.25"/>',
  external:
    '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  layers: '<path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5z"/><path d="M3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/**
 * icon("check") → decorative SVG (aria-hidden).
 * icon("check", { label: "Passed" }) → meaningful SVG with an accessible name.
 */
export function icon(name, { label, className = "" } = {}) {
  const paths = PATHS[name];
  if (!paths) throw new Error(`Unknown icon "${name}". Available: ${ICON_NAMES.join(", ")}`);
  const a11y = label ? html`role="img" aria-label="${label}"` : raw('aria-hidden="true"');
  return html`<svg class="${cx("icon", className)}" viewBox="0 0 24 24" width="24" height="24" ${a11y} focusable="false">${raw(paths)}</svg>`;
}
