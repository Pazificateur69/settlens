// Shared parts of the free browser tools (/tools/*). Files starting with "_" are not pages.
// Each tool page is a form that site/src/assets/tools.js sends to the same-origin MCP endpoint (POST
// /mcp, tools/call); without JavaScript the buttons stay disabled and a notice points to MCP and curl.

import { VERSION } from "../../../../src/constants.js";
import { createMcpServer } from "../../../../src/mcp.js";

// Same configuration as the public endpoint https://settlens.com/mcp without a token: offline tools only.
const server = createMcpServer({ mode: "remote" });

/** Runs one offline tool at build time exactly as the endpoint would; any error fails the build. */
export async function runTool(name, args) {
  const response = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  if (response.error || response.result.isError) throw new Error(`pages/tools: ${name} failed: ${JSON.stringify(response)}`);
  return response.result.structuredContent;
}

/** The same call as a terminal command against the public endpoint (no Origin header, so no browser restriction). */
export const curlCommand = (name, args) => `curl -s https://settlens.com/mcp \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}'`;

/** WebApplication node for a tool page. Free and browser-based; never an offers node. */
export const webApplication = ({ path, name, description, featureList }) => ({
  "@type": "WebApplication",
  "@id": `https://settlens.com${path}#app`,
  name,
  url: `https://settlens.com${path}`,
  description,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any operating system with a modern web browser",
  browserRequirements: "Requires JavaScript",
  isAccessibleForFree: true,
  softwareVersion: VERSION,
  featureList,
  publisher: { "@id": "https://settlens.com/#organization" },
  isPartOf: { "@id": "https://settlens.com/#software" },
});

/**
 * One labelled control. kind: "header" (Base64 or JSON), "json", "list" (comma or space separated),
 * "time" (Unix seconds or ISO 8601) or omitted (plain text). arg is the tool argument path ("policy.pay_to").
 */
export function field(ctx, { id, label, hint, arg, kind, multiline, rows = 5, type = "text", required, maxlength, inputmode }) {
  const { html } = ctx;
  const attrs = html`class="field__input" id="${id}" name="${arg.replace("policy.", "")}" data-arg="${arg}"${kind ? html` data-type="${kind}"` : ""}${required ? html` required` : ""}${maxlength ? html` maxlength="${maxlength}"` : ""}${inputmode ? html` inputmode="${inputmode}"` : ""}${hint ? html` aria-describedby="${id}-hint"` : ""} spellcheck="false" autocomplete="off" autocapitalize="off"`;
  return html`<div class="field"><label class="field__label" for="${id}">${label}</label>${multiline ? html`<textarea ${attrs} rows="${rows}"></textarea>` : html`<input ${attrs} type="${type}">`}${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ""}</div>`;
}

/** The tool form with its status line and no-JS notice; tools.js renders into resultArea(ctx, id). */
export function toolForm(ctx, { tool, id, fields, submitLabel, sample, scenarios = [] }) {
  const { html } = ctx;
  return html`<form class="form" data-tool="${tool}" data-result="${id}-result">
  ${scenarios.length ? html`<div class="field" role="group" aria-labelledby="${id}-scenarios">
    <p class="field__label" id="${id}-scenarios">Try a payment change</p>
    <p class="field__hint">Each button replaces the form with an illustrative request and spending policy. Then check the request to see the verdict. No payment is sent.</p>
    <div class="actions">${scenarios.map(({ label, sample: values }) => ctx.button({ label, variant: "secondary", attrs: `disabled data-needs-js data-tool-sample data-sample-label="${ctx.escape(label)}" data-sample="${ctx.escape(JSON.stringify(values))}"` }))}</div>
  </div>` : ""}
  ${fields}
  <div class="form__footer">
    ${ctx.button({ label: submitLabel, type: "submit", icon: "arrow-right", attrs: "disabled data-needs-js" })}
    ${ctx.button({ label: "Load sample", variant: "secondary", attrs: `disabled data-needs-js data-tool-sample data-sample="${ctx.escape(JSON.stringify(sample))}"` })}
    <p class="form__note">Sent to <code>settlens.com/mcp</code>, processed in memory and not stored. <a href="/privacy#mcp-endpoint">Privacy</a>.</p>
  </div>
  <p class="form__status" role="status" aria-live="polite" data-tool-status></p>
  <noscript><p class="form__status is-error">This tool needs JavaScript in your browser. Without it, run the same check from an MCP client or a terminal: see <a href="#from-your-agent">use it from your agent</a>.</p></noscript>
</form>`;
}

/** Where tools.js renders the result (its reserved height avoids a layout shift); the placeholder returns on errors. */
export const resultArea = (ctx, id, placeholder) => ctx.html`<div class="tool__result" id="${id}-result"><p class="field__hint">${placeholder}</p></div>`;
