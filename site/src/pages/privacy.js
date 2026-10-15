// /privacy: GDPR privacy notice for settlens.com. Facts come from site/server.js (pilot intake,
// rate limits, private session cookie), src/mcp-http.js (remote MCP endpoint), site/src/assets/tools.js (browser tools),
// site/nginx/settlens.conf (access_log off, error_log warn) and site/docker-compose.yml (bounded
// container logs), and site.legal in data/site.js. Turning access logs on requires updating #server-logs first.
// error_log at "warn" also records nginx's temporary-file buffering warnings (large request or response bodies).

import { crumbs, documentBody } from "./_company.js";

export const meta = {
  path: "/privacy",
  title: "Privacy notice",
  description:
    "How settlens.com handles pilot requests, monitoring data, technical logs and private session cookies, with no analytics and contact details for data requests.",
  section: "legal",
  lastmod: "2026-10-14",
  changefreq: "yearly",
  priority: 0.3,
  breadcrumbs: crumbs("Privacy notice", "/privacy"),
  summary:
    "Settlens stores pilot requests and configured private monitoring observations. Enabled notifications go to contact@settlens.com through Hostinger Email. Public pages run no analytics; private sign-in uses a one-hour session cookie. Data requests go to contact@settlens.com.",
};

export default function render(ctx) {
  const { html, site } = ctx;
  const { legal } = site;
  const mail = html`<a href="mailto:${legal.email}">${legal.email}</a>`;

  const sections = [
    {
      id: "summary",
      title: "Key points",
      body: html`<ul>
<li>The public site asks you for what you type into the <a href="/contact">pilot request form</a>: name, work email, company and message. Stored requests older than 12 months are deleted automatically.</li>
<li>No access log of your visits is kept. The proxy's error log only records technical problems, such as a request that fails, hits a rate or size limit, or is large enough to be buffered to disk, with the IP address, time and requested address.</li>
<li>Public pages use no tracking cookies, analytics, advertising, third-party scripts or newsletter. The private monitoring workspace uses a session cookie when you sign in.</li>
<li>Requests to the remote MCP endpoint, including what the free browser tools send, are processed in memory to produce the answer and are not stored.</li>
<li>You can access, correct or delete your data at any time by writing to ${mail}.</li>
</ul>`,
    },
    {
      id: "controller",
      title: "Who is responsible for your data",
      body: html`<p>The data controller is ${legal.publisher}, <span lang="fr">${legal.status}</span>, trading as ${legal.tradeName}, which offers ${legal.offering}. Address: ${legal.address.street}, ${legal.address.postalCode} ${legal.address.city}, ${legal.address.country}. Email: ${mail}. Full publisher details are in the <a href="/legal">legal notice</a>.</p>`,
    },
    {
      id: "data-we-collect",
      title: "What we collect and why",
      body: html`<h3 id="pilot-requests">Pilot requests</h3>
<p>When you submit the pilot request form, we receive the name, work email, company and message you enter, the page you sent it from and the time it was received. We use them only to reply to you, scope the assessment you ask about and prepare a proposal. The request is saved on our server; enabled email notifications are also recorded in a private retry queue until delivery is confirmed or its 365-day retention expires. When email notifications are enabled, a copy is sent to contact@settlens.com through our dedicated Settlens relay and Hostinger Email, our mailbox provider, with your address as Reply-To so we can respond. It is not sent to an external form or CRM service. When it starts and then once a day, the server deletes the stored requests received more than 12 months earlier.</p>
<h3 id="email">Email</h3>
<p>We reply from ${mail}, and the messages you exchange with that address, including your email address and anything you write, are kept in that mailbox.</p>
<h3 id="server-logs">Technical server logs</h3>
<p>The reverse proxy in front of settlens.com keeps no access log: reading pages, sending the pilot form and calling the MCP endpoint are not logged one by one. Two technical logs remain. The proxy's error log records technical problems and warnings: requests refused by a rate or size limit, requests the application could not answer, and requests or responses large enough that the proxy buffers them in a temporary file. Each entry includes the client IP address, the date and time, the request line (method and requested address) and, when your browser sends it, the referring page. The application log records start-up, warning and error messages, never the pilot requests you send; its size is capped and older entries are overwritten. These logs are used to operate the site, investigate errors and protect it against abuse.</p>
<h3 id="mcp-endpoint">Remote MCP endpoint</h3>
<p>When an AI agent or MCP client calls <code>https://settlens.com/mcp</code>, the request content (for example a <code>PAYMENT-REQUIRED</code> value, a URL or a report) is processed in memory to compute the result and is then discarded: the server keeps no copy of the content of your requests or of the results. The <a href="/tools">free tools</a> on this site work the same way: your browser sends what you paste to this endpoint, where it is processed in memory and not stored, and nothing is saved in your browser. A large request can be buffered briefly in a temporary file by the proxy, which deletes it when the request ends. Like any other request, a call appears in the proxy's error log only in the cases described above, for example when it fails, exceeds a rate limit or is unusually large. If an unexpected internal error occurs, only the error message is written to the application log. To enforce rate limits, the client IP address is counted in memory only. See the <a href="/mcp">MCP server page</a> for what the tools do.</p>
<h3 id="private-monitoring">Private monitoring workspace</h3>
<p>The optional private workspace stores configured endpoint names, URLs and policies, the latest check baseline, and up to 200 observation runs from the last 90 days. Payment terms include SHA-256 fingerprints and validated scheme, network, address, atomic amount and timeout values used to review changes; arbitrary response text and extra metadata are not retained as raw fields. Approved references remain until the endpoint is removed. Incidents, bounded owner comments and the last 500 owner actions are also stored. Resolved incidents expire after 90 days. Pending monitor notification payloads expire after 90 days and pending pilot notification payloads after 365 days; confirmed-delivery payloads are removed immediately. Notification status records contain no transport credentials. Retention is enforced when the journal is read and persisted on the next write; configured targets and their latest baselines remain until removed. When enabled, blocking change notifications are emailed to contact@settlens.com through Hostinger Email. These messages may contain endpoint URLs and finding identifiers; mailbox retention is separate. Removing a target removes its current baseline but past observations remain subject to retention. Sign-in uses a dedicated access token or a one-time code emailed only to contact@settlens.com. Codes expire after ten minutes, are held as hashes in server memory, and are consumed on use; they are never returned by the API. Access tokens are not stored in browser storage. The opaque session cookie is HttpOnly, Secure, SameSite=Strict, scoped to the monitoring API, and expires after one hour. Sessions are held in server memory and disappear on restart or sign-out. Monitoring is a single-owner workspace, not a shared customer portal.</p>
<h3 id="rate-limits">Rate limiting</h3>
<p>The pilot form and the MCP endpoint limit how many requests one IP address can make in a short period. The counters are kept in memory only and are never written to disk; a request refused by a limit can be recorded in the proxy's error log described above.</p>`,
    },
    {
      id: "legal-basis",
      title: "Legal bases and retention",
      body: ctx.table({
        caption: "Purposes, legal bases under the GDPR and retention periods",
        head: ["Purpose", "Data", "Legal basis", "Retention"],
        rowHeaders: true,
        rows: [
          [
            "Reply to a pilot request and prepare a proposal",
            "Name, work email, company, message, page, time received",
            "Steps taken at your request before entering into a contract (GDPR art. 6(1)(b))",
            "12 months: older stored requests are deleted automatically (checked when the server starts and then daily). If an engagement follows, the correspondence it needs is kept for as long as the engagement and the applicable legal obligations require.",
          ],
          [
            "Operate and secure the website",
            "Technical logs: error-log entries for requests that fail, hit a limit or are buffered to disk (IP address, date and time, request line, referring page) and application error messages",
            "Our legitimate interest in running a secure, working website (GDPR art. 6(1)(f))",
            "A limited period set by the hosting configuration, then deleted",
          ],
          [
            "Answer requests to the remote MCP endpoint and the free browser tools",
            "Request content, IP address for rate limiting",
            "Our legitimate interest in providing the tool you call and protecting it from abuse (GDPR art. 6(1)(f))",
            "Request content is not stored. A call that appears in the proxy's error log follows the log retention above.",
          ],
        ],
      }),
    },
    {
      id: "recipients",
      title: "Who receives your data",
      body: html`<p>Your data is read only by the publisher, ${legal.publisher}. Two providers store it on our behalf as processors: our hosting provider, ${legal.host.name} (${legal.host.city}, ${legal.host.country}), for pilot requests and server logs, and Hostinger, which hosts the ${mail} mailbox, for the emails we exchange. We do not sell or rent personal data and do not share it with advertisers or data brokers. It is disclosed to public authorities only when the law requires it.</p>`,
    },
    {
      id: "storage",
      title: "Where your data is stored",
      body: html`<p>Pilot requests are stored on our server, rented from ${legal.host.name} and located in the European Union. Emails sent to or from ${mail} are stored by our mailbox provider, Hostinger. Encrypted recovery copies of pilot requests, private monitoring data and notification queues are retained for at most 30 days on the server and may also be kept on the publisher's device, limited to seven archives and 200 MiB. Recovery copies can temporarily retain data deleted from the active store until those copies expire. Restoration tests use a private temporary directory and remove the restored data when the test ends. Server access and SMTP credentials are excluded from these archives. See the <a href="/security#infrastructure">security page</a> for how the site is hosted and protected.</p>`,
    },
    {
      id: "cookies",
      title: "Cookies, analytics and tracking",
      body: html`<p>Public pages set no cookies and use no browser storage, analytics, advertising pixels, session recording or third-party resources. Signing into the private monitoring workspace sets one session cookie; it does not track public browsing. Its Content Security Policy only allows files served by settlens.com itself. Details are in the <a href="/cookies">cookie notice</a>.</p>`,
    },
    {
      id: "no-marketing",
      title: "No newsletter, no profiling",
      body: html`<p>We do not run a newsletter or send marketing emails, and we make no automated decisions or profiles about the people who contact us.</p>`,
    },
    {
      id: "your-rights",
      title: "Your rights",
      body: html`<p>Under the GDPR you have the right to:</p>
<ul>
<li><strong>access</strong> the personal data we hold about you;</li>
<li><strong>rectification</strong> of inaccurate or incomplete data;</li>
<li><strong>erasure</strong> of your data;</li>
<li><strong>restriction</strong> of processing;</li>
<li><strong>object</strong> to processing based on our legitimate interest;</li>
<li><strong>portability</strong> of the data you gave us, in a structured, machine-readable format.</li>
</ul>
<p>To use any of these rights, write to ${mail}. We answer within one month, as the GDPR requires, and may ask you to confirm your identity first. Under French law you can also give instructions about what happens to your data after your death.</p>`,
    },
    {
      id: "complaints",
      title: "Complaints",
      body: html`<p>If you think your data has not been handled correctly, please tell us first at ${mail}. You can also lodge a complaint with the French data protection authority, the Commission nationale de l'informatique et des libertés (CNIL), at <a href="https://www.cnil.fr/fr/plaintes">cnil.fr/fr/plaintes</a>, or with the supervisory authority of the EU country where you live or work.</p>`,
    },
    {
      id: "changes",
      title: "Changes to this notice",
      body: html`<p>When this notice changes, we update it on this page and change the date below. A change that adds a new kind of data collection, such as analytics, would be published here before it takes effect.</p>`,
    },
  ];

  return html`${ctx.hero({
    title: "Privacy notice",
    lede: "What personal data settlens.com collects, why, how long it is kept and how to use your rights.",
  })}
${documentBody({
  sections,
  footer: html`<p><small>Last updated <time datetime="${ctx.page.lastmod}">${ctx.formatDate(ctx.page.lastmod)}</time>. Questions: ${mail}.</small></p>`,
})}`;
}
