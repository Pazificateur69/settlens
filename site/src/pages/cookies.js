import { CONTENT_SECURITY_POLICY } from "../../server.js";
import { crumbs, documentBody } from "./_company.js";
export const meta = {
  path: "/cookies", title: "Cookie notice", label: "Cookie notice",
  description: "Public pages use no cookies or analytics. Private monitoring uses one secure session cookie after sign-in; learn its purpose, lifetime and storage rules.",
  section: "legal", lastmod: "2026-10-14", changefreq: "yearly", priority: 0.2,
  breadcrumbs: crumbs("Cookie notice", "/cookies"),
  summary: "Public Settlens pages and free tools use no tracking cookies or browser storage. Signing into private monitoring sets one HttpOnly, Secure, SameSite=Strict cookie, scoped to the monitoring API and expiring after one hour. No analytics or advertising runs.",
};
export default function render(ctx) {
  const { html } = ctx;
  return html`${ctx.hero({ title: "Cookies and private sessions", lede: "Public pages have no tracking. Private sign-in uses a short-lived session." })}${documentBody({ sections: [
    { id: "public-pages", title: "Public pages and free tools", body: html`<p>Public pages, the pilot form and the MCP endpoint set no cookies. Scripts use no local storage, session storage or IndexedDB. There is no analytics, advertising pixel, session recording or third-party browser resource.</p>` },
    { id: "private-session", title: "Private monitoring session", body: html`<p>After you sign in to the private monitoring workspace, the server sets <code>settlens_monitor</code>. It contains an opaque random session identifier, not an access token, email address or payment data. Sign-in can use a one-time code emailed only to contact@settlens.com; that code expires after ten minutes and is consumed on use. Its purpose is to authenticate monitoring API requests.</p><ul><li>Path: <code>/api/monitor</code>.</li><li>Lifetime: one hour; signing out revokes the session and clears the cookie.</li><li>Flags: <code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Strict</code>.</li><li>Sessions are held in server memory and disappear when the server restarts.</li></ul><p>The workspace requires JavaScript. CLI monitoring and history exports are also available.</p>` },
    { id: "security", title: "Browser resource policy", body: ctx.codeBlock({ lang: "http", title: "Content Security Policy", code: CONTENT_SECURITY_POLICY, wrap: true }) },
    { id: "server-data", title: "Server-side data", body: html`<p>Pilot submissions, private monitoring observations and technical error logs are described in the <a href="/privacy">privacy notice</a>. Email notifications, when enabled, go to contact@settlens.com through our Hostinger mailbox.</p>` },
  ], footer: html`<p>Last updated ${ctx.formatDate(ctx.page.lastmod)}. Contact <a href="mailto:${ctx.site.email}">${ctx.site.email}</a> with questions.</p>` })}`;
}
