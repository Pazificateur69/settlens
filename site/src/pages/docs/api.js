// HTTP scan API reference. Behavior follows scanApi() in site/server.js and src/net-guard.js;
// the responses below were captured from a local server started with SETTLENS_API_TOKEN set.

export const meta = {
  path: "/docs/api",
  title: "HTTP scan API reference",
  label: "HTTP API",
  heading: "HTTP scan API",
  lede: "Run a passive Settlens scan from your own backend with one authenticated POST request and get the JSON report back.",
  description: "Settlens HTTP scan API: POST /api/scan with a bearer token, request fields, the JSON report response, errors, rate limits and destination (SSRF) rules.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 10,
  icon: "layers",
  summary: "POST /api/scan on settlens.com runs the same passive scan as settlens scan on one public URL, with an optional facilitator, and returns the JSON report. It needs a bearer token issued to pilots, allows 30 requests per minute per client IP, refuses private destinations and never runs the active probe.",
  sources: [
    { title: "RFC 6750: The OAuth 2.0 Authorization Framework: Bearer Token Usage", url: "https://www.rfc-editor.org/rfc/rfc6750.html", publisher: "IETF" },
    { title: "RFC 6890: Special-Purpose IP Address Registries", url: "https://www.rfc-editor.org/rfc/rfc6890.html", publisher: "IETF" },
  ],
};

const REQUEST = `POST /api/scan HTTP/1.1
Host: settlens.com
Authorization: Bearer <your API token>
Content-Type: application/json

{ "url": "https://api.merchant.example/v1/weather", "facilitator": "https://facilitator.example" }`;

const CURL = `curl -sS https://settlens.com/api/scan \\
  -H "Authorization: Bearer $SETTLENS_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.merchant.example/v1/weather"}' \\
  -o report.json`;

const RESPONSE = `HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
cache-control: no-store

{
  "schemaVersion": 1,
  "reportId": "a01d0965",
  "product": "Settlens",
  "metadata": { "source": "settlens-web-api" },
  "scope": { "targetCount": 1, "activeTargetCount": 0, "settlementCalls": 0, "privateKeysUsed": 0 },
  "summary": { "pass": 3, "fail": 2, "warn": 0, "skip": 1 },
  "targets": [
    {
      "mode": "passive",
      "checks": [
        { "id": "transport.status_402", "status": "fail", "severity": "high",
          "message": "Expected HTTP 402 but received HTTP 200.", "…": "…" }
      ],
      "…": "…"
    }
  ],
  "integrity": {
    "algorithm": "sha256",
    "canonicalization": "settlens-stable-json-v2",
    "digest": "eb165ca0664092eee3f321d0b4643de8b4df02eae3f4a143033d09c315645bad"
  }
}`;

export default function render(ctx) {
  const { html, codeBlock, table, callout, faq } = ctx;
  return html`<p>The Settlens website exposes one scan endpoint for server-to-server use. It runs the same passive scan as <a href="/docs/cli#scan"><code>settlens scan</code></a> on a public URL and returns the JSON report, with its <a href="/docs/reports#integrity">integrity digest</a>, in the response body. It never sends a payment signature, never runs the active probe and never calls <code>/settle</code>.</p>
${callout({ tone: "info", title: "Looking for the agent interface?", body: html`<p>AI agents should use the <a href="/docs/mcp">MCP server</a> instead: its remote endpoint at <code>https://settlens.com/mcp</code> offers the offline verification tools publicly and the passive network tools with the same token as this API.</p>` })}

<h2 id="authentication">Authentication</h2>
<p>Every request needs <code>Authorization: Bearer &lt;token&gt;</code>; the <code>Bearer</code> scheme is required. The token is compared in constant time with the one configured on the server; a missing or wrong token gets <code>401</code>. A server with no token, a placeholder token or one shorter than 32 characters disables the API and answers <code>401</code> to everyone. Tokens are not self-service: ask for one with your <a href="/contact">pilot request</a>. Call the API from a backend only: it sends no CORS headers, and a token in browser code is a token anyone can read.</p>

<h2 id="request">Request</h2>
${codeBlock({ lang: "http", title: "POST /api/scan", code: REQUEST, copy: false })}
${table({
  caption: "Request body fields (JSON object, at most 32 KiB)",
  head: ["Field", "Required", "Description"],
  rows: [
    ["url", "Yes", "The paid resource to scan: an absolute http or https URL of at most 2048 characters that passes the destination rules below."],
    ["facilitator", "No", "Base URL of a facilitator to cross-check with GET /supported: a string of at most 2048 characters (an object is refused) that passes the same destination rules."],
  ],
  rowHeaders: true,
})}
<p>The scan is fixed: <code>GET</code>, no custom headers, two samples, an 8000 ms timeout per request and no local policy, so policy checks do not run. To scan with a policy, custom headers or the authorized active probe, use the <a href="/docs/cli">CLI</a> in your own environment.</p>
${codeBlock({ lang: "shell", title: "With curl", code: CURL })}

<h2 id="response">Response</h2>
<p>A successful call answers <code>200</code> with the complete report: the same schema as the CLI's JSON report, with <code>metadata.source</code> set to <code>settlens-web-api</code>. Findings are part of the report, not HTTP errors: an endpoint that is not an x402 resource still gets <code>200</code> and a report with failing checks. Excerpt of a real call against a public page that does not ask for payment:</p>
${codeBlock({ lang: "http", title: "200 OK (excerpt)", code: RESPONSE, copy: false })}
<p>Save the body as a file and it verifies like any other report: <code>settlens verify-report report.json</code>. Field reference: <a href="/docs/reports#json">JSON report</a>.</p>

<h2 id="errors">Errors</h2>
<p>Errors are JSON objects with a single <code>error</code> message.</p>
${table({
  caption: "Error responses",
  head: ["Status", "When", "Example body"],
  rows: [
    ["400", "Body is not a JSON object, url is missing or too long, facilitator is not a URL string of at most 2048 characters, or a destination is refused", '{"error":"Private or non-routable destinations are not allowed."}'],
    ["401", "Missing or wrong bearer token", '{"error":"Authentication required."}'],
    ["405", "Any method other than POST (with Allow: POST)", '{"error":"Method not allowed."}'],
    ["413", "Body larger than 32 KiB", '{"error":"Request body is too large."}'],
    ["429", "More than 30 requests in 60 seconds from one client IP, failed authentications included", '{"error":"Rate limit exceeded."}'],
    ["500", "Unexpected server error", '{"error":"Internal server error."}'],
  ],
  rowHeaders: true,
})}
<p>Other destination messages you may see: <code>Only http and https destinations are allowed.</code>, <code>Only ports 80 and 443 are allowed.</code>, <code>Credentials in the URL are not allowed.</code>, <code>Local destinations are not allowed.</code>, <code>The destination resolves to a private or non-routable address.</code> and <code>Could not resolve &lt;host&gt;: …</code>.</p>

<h2 id="limits">Limits</h2>
<ul>
  <li>30 requests per client IP per 60-second window. Requests rejected with <code>401</code> count too.</li>
  <li>Request bodies up to 32 KiB; <code>url</code> up to 2048 characters.</li>
  <li>Each scan makes up to two requests to the target (one when the first answer has no <code>PAYMENT-REQUIRED</code>), plus one to <code>/supported</code> when a facilitator is given, each with an 8000 ms timeout and a 1 MiB cap on the body read.</li>
</ul>

<h2 id="destination-rules">Destination rules (SSRF protection)</h2>
<p>The API makes requests from Settlens' server, so it only reaches public destinations. Before any request, the target and facilitator URLs are checked:</p>
<ul>
  <li>Only <code>http</code> and <code>https</code>, on ports 80 and 443 only, with no credentials in the URL.</li>
  <li>No <code>localhost</code>, and no host name ending in <code>.local</code> or <code>.internal</code>.</li>
  <li>An IP literal, and every address a host name resolves to, must be publicly routable. Refused IPv4 ranges include private networks (10/8, 172.16/12, 192.168/16), loopback (127/8), link-local (169.254/16, which covers cloud metadata services), shared CGNAT space (100.64/10), documentation, benchmarking, multicast and reserved ranges. For IPv6 only global unicast is accepted, without documentation and Teredo prefixes, and an IPv4 address embedded in IPv6 (mapped, NAT64 or 6to4) must itself be public.</li>
  <li>Redirects are never followed, so a public URL cannot bounce the request to an internal one.</li>
</ul>
<p>The HTTP client resolves the host again when it connects, after the check. That gap is accepted because the API is authenticated, passive and follows no redirects.</p>

<h2 id="not-an-api">What is not an API</h2>
<p><code>/api/pilot</code> receives the website's pilot request form. It is not a public API and has no stability guarantees; use the <a href="/contact">contact page</a> to reach the team.</p>

<h2 id="faq">Questions</h2>
${faq([
  { q: "Can the API run the active probe?", a: "No. The API only runs passive scans. The authorized active probe is available only in the CLI, where you run it yourself with --active --authorized --authorization-ref." },
  { q: "Can I scan an endpoint on my private network?", a: "Not through the API: private, loopback, link-local and other non-public destinations are refused. Run the CLI or the GitHub Action inside your network instead." },
  { q: "Does the API store the reports?", a: "The endpoint returns the report in the response and does not write it anywhere. Keep the response body if you need it as evidence." },
])}`;
}
