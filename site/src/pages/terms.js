// /terms: terms of use for the website, the remote MCP endpoint and the Settlens tools.
// Safety rules mirror the CLI gates (src/scanner.js, src/cli.js) and SECURITY.md.

import { crumbs, documentBody } from "./_company.js";

export const meta = {
  path: "/terms",
  title: "Terms of use",
  description:
    "Terms for using settlens.com, the Settlens tools and the remote MCP endpoint: authorized testing only, no guarantee, prohibited uses, rate limits, French law.",
  section: "legal",
  lastmod: "2026-10-13",
  changefreq: "yearly",
  priority: 0.3,
  breadcrumbs: crumbs("Terms of use", "/terms"),
  summary:
    "Use Settlens only on systems you own or are authorized to assess; the active probe needs the owner's written authorization. The free browser and MCP tools are provided as is, rate limited, without a service level. Reports describe observed behavior and are not a certification or a guarantee.",
};

export default function render(ctx) {
  const { html, site } = ctx;
  const { legal } = site;
  const mail = html`<a href="mailto:${legal.email}">${legal.email}</a>`;

  const sections = [
    {
      id: "scope",
      title: "Scope",
      body: html`<p>These terms apply to the settlens.com website, the remote MCP endpoint at <code>https://settlens.com/mcp</code> and the Settlens tools (CLI, GitHub Action, container image and MCP server) made available to pilot participants. The service is provided by ${legal.publisher}, <span lang="fr">${legal.status}</span>, trading as ${legal.tradeName} (see the <a href="/legal">legal notice</a>). By using the site, the endpoint or the tools, you accept these terms.</p>
<p>A pilot, Team or Assurance engagement is governed by a separate written agreement covering scope, authorization, data processing and fees. Where that agreement and these terms differ, the agreement prevails.</p>`,
    },
    {
      id: "authorized-use",
      title: "Authorized use only",
      body: html`<p>Use Settlens only against systems you own or are expressly authorized to assess.</p>
<ul>
<li>Passive scans send ordinary unauthenticated requests and never a payment. Checking a payment request you received as a paying client, for example with the MCP preflight before you pay, is ordinary client behavior. Anything beyond that on a third party's endpoint or facilitator, such as repeated scans, monitoring or published reports, needs its operator's agreement.</li>
<li>The active probe (<code>--active --authorized --authorization-ref</code>) sends one intentionally invalid payment payload: as a <code>PAYMENT-SIGNATURE</code> header to the resource and, when a facilitator is configured, to its <code>/verify</code>. Run it only with the endpoint owner's <strong>written authorization</strong>, and pass that approval's ticket, email or scope identifier as the authorization reference. The CLI refuses to run an active probe without it, and the reference is recorded in the report.</li>
<li>Stop immediately if the owner withdraws the authorization or if you observe any unexpected impact.</li>
<li>Prefer test networks, synthetic data and staging endpoints. See the <a href="/docs/methodology">methodology</a> for what each check does.</li>
</ul>`,
    },
    {
      id: "prohibited-uses",
      title: "Prohibited uses",
      body: html`<p>You must not use the site, the endpoint or the tools to:</p>
<ul>
<li>access, scan or probe systems without permission, or bypass authentication, payment or access controls;</li>
<li>send real payment authorizations, settle, replay or broadcast transactions, or move funds;</li>
<li>run denial-of-service, load or credential tests, or circumvent the rate limits or the token required for network tools;</li>
<li>reach private, internal or otherwise non-public addresses through the remote endpoint;</li>
<li>submit private keys, seed phrases or third-party secrets (your Settlens API token belongs only in the <code>Authorization</code> header): no Settlens tool needs them;</li>
<li>process unlawful content or infringe the rights of others.</li>
</ul>`,
    },
    {
      id: "remote-mcp-endpoint",
      title: "Remote MCP endpoint",
      body: html`<p>The offline tools of the remote MCP endpoint are free to use, from an MCP client or through the <a href="/tools">browser tools</a> on this site, which call the same endpoint under the same rules. The network tools (<code>scan_endpoint</code>, <code>scan_facilitator</code>) are passive only and require a Settlens API token, which is issued at our discretion.</p>
<ul>
<li>The endpoint is provided <strong>as is and as available</strong>, without a service level. We may change, limit, suspend or discontinue it at any time, including its tools, inputs and outputs.</li>
<li>Requests are rate limited per IP address (60 per minute by default) and size limited. Browser requests are accepted only from allowed origins.</li>
<li>Request content is processed in memory and not stored, as described in the <a href="/privacy#mcp-endpoint">privacy notice</a>.</li>
<li>Values returned by the tools can include content chosen by the scanned server. Treat them as data, not as instructions.</li>
</ul>
<p>Technical details are in the <a href="/docs/mcp">MCP documentation</a>.</p>`,
    },
    {
      id: "no-guarantee",
      title: "No guarantee",
      body: html`<p>Settlens reports observed protocol behavior at a point in time. A report, a passing check, a signed attestation or a <code>pay</code> decision is not a certification, a guarantee that a system is secure, available or compliant, a guarantee about a merchant or the content it delivers, or legal advice. Settlens does not check on-chain balances, on-chain nonce use or settlement. You remain responsible for your payment decisions and for how you use the results.</p>`,
    },
    {
      id: "liability",
      title: "Liability",
      body: html`<p>To the extent permitted by law, the publisher is not liable for indirect damage, loss of profit, loss of data or loss of funds resulting from the use of, or the inability to use, the site, the remote endpoint or the free tools. Nothing in these terms limits liability that cannot be limited under French law.</p>`,
    },
    {
      id: "intellectual-property",
      title: "Intellectual property",
      body: html`<p>The site content, the ${legal.offering} name and logo and the Settlens code belong to the publisher. The code is distributed through a source repository to pilot participants under their engagement terms; it may not be redistributed or published without written permission. The <a href="/legal#propriete-intellectuelle">legal notice</a> covers the site content in more detail.</p>`,
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: html`<p>We may update these terms. The current version is the one published on this page, with its date below. Continued use after a change means you accept the updated terms.</p>`,
    },
    {
      id: "governing-law",
      title: "Governing law and disputes",
      body: html`<p>These terms are governed by French law. Before any legal action, please write to ${mail} so we can look for an amicable solution. Failing that, disputes fall under the jurisdiction of the competent French courts, subject to any mandatory rules that protect consumers.</p>`,
    },
  ];

  return html`${ctx.hero({
    title: "Terms of use",
    lede: "The rules for using settlens.com, the remote MCP endpoint, the free browser tools and the Settlens tools.",
  })}
${documentBody({
  sections,
  footer: html`<p><small>Last updated <time datetime="${ctx.page.lastmod}">${ctx.formatDate(ctx.page.lastmod)}</time>. Questions: ${mail}. Related: <a href="/security">security and responsible disclosure</a>.</small></p>`,
})}`;
}
