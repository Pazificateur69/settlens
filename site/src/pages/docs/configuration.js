// Configuration reference. Field tables are generated from schemas/settlens-config.schema.json and
// the example file is read from the repository; the fuller example is validated with the real loader.

import { normalizeTarget } from "../../../../src/config.js";
import { repoFile, repoJson, schemaTable } from "./_shared.js";

export const meta = {
  path: "/docs/configuration",
  title: "Configuration file reference",
  label: "Configuration",
  heading: "Configuration",
  lede: "The JSON file that settlens check, settlens monitor and the GitHub Action read: every field, its rules and how it combines with command-line options.",
  description: "Settlens configuration reference: targets, defaults, policy, facilitator and headers, generated from the JSON Schema, with examples and validation rules.",
  section: "docs",
  lastmod: "2026-10-13",
  order: 4,
  icon: "file",
  summary: "A Settlens configuration is a JSON file (version 1) listing 1 to 100 targets, with optional shared defaults, a failOn threshold and an output directory. Each target can set a policy (expected), a facilitator and custom headers. settlens check, settlens monitor and the GitHub Action read it.",
  sources: [
    { title: "x402 Protocol Specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
    { title: "CAIP-2: Blockchain ID Specification", url: "https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md", publisher: "Chain Agnostic Standards Alliance" },
  ],
};

// Field descriptions keyed by "<table>.<field>"; a `description` in the schema takes precedence.
const DESCRIPTIONS = {
  root: {
    version: "Format version of the file.",
    failOn: "Lowest severity of a failing check that makes settlens check exit 1; none never fails. Default high. --fail-on overrides it.",
    output: "Directory for report files. Default reports. --out overrides it.",
    defaults: "Fields applied to every target before the target's own fields.",
    targets: "The paid resources to assess.",
  },
  target: {
    name: "Label used in the console and the report. Defaults to the URL hostname.",
    url: "The paid resource to request. Credentials inside the URL are refused.",
    method: "HTTP method, upper-cased before use. Default GET.",
    headers: "Extra request headers, for example authentication for a staging gateway. Values never reach a report; the destination host must be allowlisted.",
    body: "Request body, sent as is. Refused with GET and HEAD.",
    timeoutMs: "Per-request timeout in milliseconds. Default 8000. --timeout overrides it.",
    repeat: "Identical passive requests used to compare payment terms. Default 2; 1 skips the stability check. --repeat overrides it.",
    expected: "Local policy and binding expectations for this target.",
    facilitator: "Facilitator to cross-check with GET /supported: a base URL, or an object.",
  },
  expected: {
    resourceUrl: "URL that resource.url must equal. Defaults to the target url; set it when the canonical resource URL differs from the URL requested.",
    schemes: "Allowed schemes, compared case-insensitively.",
    networks: "Allowed CAIP-2 networks, compared case-insensitively, for example eip155:8453.",
    payTo: "Allowed recipients. EVM hex addresses compare case-insensitively; other formats, such as Solana base58, compare exactly.",
    assets: "Allowed assets (token contract addresses or mints). EVM hex addresses compare case-insensitively; other formats compare exactly.",
    maxAmount: "Ceiling for every advertised amount, in the asset's atomic units.",
  },
  facilitator: {
    name: "Label for the facilitator. Defaults to its hostname.",
    url: "Base URL. Settlens requests <url>/supported (and <url>/verify during an authorized active probe).",
    timeoutMs: "Per-request timeout in milliseconds. The loader accepts at most 300000.",
    headers: "Extra request headers for the facilitator, under the same rules as target headers.",
  },
};

// A fuller example; render() checks it with the real loader so it cannot drift into an invalid file.
const FULL_EXAMPLE = {
  version: 1,
  failOn: "high",
  output: "reports",
  defaults: {
    timeoutMs: 8000,
    repeat: 2,
    expected: {
      schemes: ["exact"],
      networks: ["eip155:8453"],
      payTo: ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"],
      assets: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"], // USDC on Base
      maxAmount: "10000",
    },
  },
  targets: [
    {
      name: "weather-api",
      url: "https://api.merchant.example/v1/weather?city=paris",
      facilitator: "https://facilitator.example",
    },
    {
      name: "staging-report",
      url: "https://staging.merchant.example/v1/report",
      method: "POST",
      body: '{"period":"2026-Q3"}',
      headers: { Authorization: "Bearer ${ASSESSMENT_TOKEN}" },
      facilitator: { name: "staging-facilitator", url: "https://facilitator.example", timeoutMs: 5000 },
    },
  ],
};

/** Indented outline of the file, generated from the schema's property names. */
function outline(schema) {
  const keys = (node) => Object.keys(node.properties ?? {});
  const defs = schema.$defs;
  const facilitatorObject = defs.facilitator.oneOf.find((option) => option.type === "object");
  return [
    "{",
    `  ${keys(schema).filter((key) => !["defaults", "targets"].includes(key)).join(", ")}`,
    `  defaults: { ${keys(defs.targetDefaults).join(", ")} }`,
    "  targets: [",
    `    { ${keys(defs.target).join(", ")} }`,
    "  ]",
    "}",
    "",
    `expected:    { ${keys(defs.expected).join(", ")} }`,
    `facilitator: "<base-url>" or { ${keys(facilitatorObject).join(", ")} }`,
    "headers:     { \"Header-Name\": \"value\", … }",
  ].join("\n");
}

export default function render(ctx) {
  const { html, codeBlock, callout, find } = ctx;
  const policyGuide = find("/learn/agent-spending-policy"); // written separately: linked once it exists
  const schema = repoJson("schemas/settlens-config.schema.json");
  const defs = schema.$defs;
  const anchors = { target: "target-fields", targetDefaults: "defaults", expected: "expected", facilitator: "facilitator" };
  const facilitatorObject = defs.facilitator.oneOf.find((option) => option.type === "object");
  if (!facilitatorObject) throw new Error("settlens-config.schema.json: facilitator object form not found.");
  const expectedKeys = Object.keys(defs.expected.properties);
  const hasAssets = expectedKeys.includes("assets");
  const defaultKeys = Object.keys(defs.targetDefaults.properties);
  const headers = defs.headers;

  // Self-check: the fuller example must pass the same validation as settlens check.
  FULL_EXAMPLE.targets.forEach((target, index) => normalizeTarget({ ...FULL_EXAMPLE.defaults, ...target }, index));

  return html`<p><code>settlens check</code>, <code>settlens monitor</code> and the <a href="/docs/github-action">GitHub Action</a> read their targets from a JSON file. The tables on this page are generated from the JSON Schema shipped in the repository (<code>schemas/settlens-config.schema.json</code>), so they match the version of Settlens that built this site. The loader in <code>src/config.js</code> applies the same rules, except two that only a schema-aware editor reports (unique entries in each list, and the CAIP-2 format of <code>expected.networks</code>), plus a few the schema cannot express, listed under <a href="#validation">Validation</a>.</p>

<h2 id="example">The example file</h2>
<p>The repository ships <code>settlens.config.example.json</code>, which targets the local demo server:</p>
${codeBlock({ lang: "json", title: "settlens.config.example.json", code: repoFile("settlens.config.example.json") })}
<ol>
  <li><code>version</code> is required and must be <code>1</code>.</li>
  <li><code>failOn</code> and <code>output</code> set the CI threshold and the report directory for the whole file.</li>
  <li><code>defaults</code> holds values shared by every target, here the method, the timeout and the number of samples.</li>
  <li>Each entry of <code>targets</code> names one paid resource. This one also cross-checks the demo facilitator and pins a policy: scheme, network, recipient, asset, ceiling and the exact resource URL.</li>
</ol>
<p>Copy it, point it at your own endpoints, then run it. Start the demo server first (<code>npm run demo:server</code>) to try the file as is:</p>
${codeBlock({ lang: "shell", title: "Run a configuration", code: `cp settlens.config.example.json settlens.config.json
settlens check --config settlens.config.json` })}

<h2 id="structure">Structure</h2>
${codeBlock({ lang: "text", title: "Outline (generated from the schema)", code: outline(schema), copy: false })}

<h2 id="top-level-fields">Top-level fields</h2>
${schemaTable(ctx, { root: schema, node: schema, caption: "Top-level fields", anchors, descriptions: DESCRIPTIONS.root })}
<p>Any other top-level field is rejected, including <code>$schema</code>: point your editor at the schema file through its own settings rather than inside the config.</p>

<h2 id="target-fields">Target fields</h2>
${schemaTable(ctx, { root: schema, node: defs.target, caption: "Fields of each entry in targets", anchors, descriptions: DESCRIPTIONS.target })}

<h2 id="defaults">Defaults</h2>
<p><code>defaults</code> accepts the target fields except <code>name</code> and <code>url</code>: ${defaultKeys.map((key, index) => html`${index ? ", " : ""}<code>${key}</code>`)}. Each target is built as <code>{ ...defaults, ...target }</code>, a shallow merge: a target that sets <code>headers</code> or <code>expected</code> replaces the whole default object instead of adding to it.</p>

<h2 id="expected">Expected: policy and binding</h2>
${schemaTable(ctx, { root: schema, node: defs.expected, caption: "Fields of expected", anchors, descriptions: DESCRIPTIONS.expected })}
<p>In a scan, the server must only <em>advertise</em> allowed terms: each policy check fails as soon as one advertised option falls outside the policy, even if another option would be acceptable. Fields you leave out are not checked. The resulting checks are listed under <a href="/docs/checks#policy-checks">policy checks</a>.${policyGuide ? html` Why each constraint matters, and what a per-request policy cannot cover: <a href="${policyGuide.path}">${policyGuide.title}</a>.` : ""}</p>
${hasAssets
  ? callout({ tone: "info", title: "Pair maxAmount with assets", body: html`<p><code>maxAmount</code> is a number of atomic units, and tokens use different decimals: 10000 is 0.01 of a 6-decimal token and far less of an 18-decimal one. Set <code>assets</code> together with <code>maxAmount</code> so the ceiling refers to a known token.</p>` })
  : callout({ tone: "info", title: "maxAmount is in atomic units", body: html`<p><code>maxAmount</code> is compared with each advertised <code>amount</code> as an integer of atomic units, and the asset itself is not constrained. Tokens use different decimals (10000 is 0.01 of a 6-decimal token), so keep the networks and recipients pinned and review the asset of each option.</p>` })}

<h2 id="facilitator">Facilitator</h2>
<p><code>facilitator</code> is either a base URL string (<code>"https://facilitator.example"</code>) or an object. Settlens appends <code>/supported</code> unless the URL already ends with it, adds the facilitator checks, and checks that every scheme and network the resource advertises is supported.</p>
${schemaTable(ctx, { root: schema, node: facilitatorObject, caption: "Fields of the facilitator object", anchors, descriptions: DESCRIPTIONS.facilitator })}

<h2 id="headers">Headers and secrets</h2>
<ul>
  <li>At most ${headers.maxProperties} headers per target or facilitator, each value a string of at most ${headers.additionalProperties.maxLength} characters without line breaks. Names must be valid HTTP header tokens.</li>
  <li><code>PAYMENT-SIGNATURE</code> is refused in any letter case: Settlens never forwards a real payment authorization.</li>
  <li>Every host that receives a custom header must be allowlisted outside the file, with <code>SETTLENS_ALLOWED_HOSTS</code> (comma-separated exact hostnames) or the Action's <code>allowed-hosts</code> input. Otherwise the run stops with <code>Custom headers require an explicit allowed host.</code> This keeps an edited config from sending CI secrets to a new host.</li>
  <li>Reports record header names only, never values.</li>
</ul>

<h2 id="environment-variables">Environment variables</h2>
<p>Any string in the file can reference an environment variable as <code>\${NAME}</code>, where <code>NAME</code> uses uppercase letters, digits and underscores. Values are expanded when the file is loaded; a missing variable stops the run with <code>Environment variable NAME is required by the config.</code> Use it for tokens in headers. Do not put secrets in URLs: target URLs appear in reports, with only common secret query parameters redacted.</p>
${codeBlock({ lang: "json", title: "A header filled from the environment", code: `"headers": {
  "Authorization": "Bearer \${ASSESSMENT_TOKEN}"
}` })}

<h2 id="precedence">Precedence</h2>
<ul>
  <li>Report directory: <code>--out</code>, then <code>output</code>, then <code>reports</code>.</li>
  <li>Failure threshold: <code>--fail-on</code>, then <code>failOn</code>, then <code>high</code>.</li>
  <li>Timeout: <code>--timeout</code>, then the target's <code>timeoutMs</code> (after defaults), then 8000 ms. Facilitator requests use <code>--timeout</code>, then the facilitator object's own <code>timeoutMs</code>, then 8000 ms; the target's <code>timeoutMs</code> does not apply to them.</li>
  <li>Samples: <code>--repeat</code>, then the target's <code>repeat</code>, then 2.</li>
  <li>Active probe: only from the command line (<code>--active --authorized --authorization-ref</code>), never from the file.</li>
</ul>

<h2 id="validation">Validation</h2>
<p>The file is checked before any request is sent. A problem exits with code 2 and one message. Some real messages:</p>
${codeBlock({ lang: "text", title: "Validation messages", copy: false, code: `Settlens error: Config contains unsupported field(s): $schema.
Settlens error: Config version must equal 1.
Settlens error: Target 0 must not provide a body for GET.
Settlens error: Target 0 expected.maxAmount must be an integer string.
Settlens error: Target 0 has an invalid URL: Target 0 URL credentials are forbidden; use reviewed headers.
Settlens error: Target 0 must not provide PAYMENT-SIGNATURE. Settlens never sends real payment authorizations.
Settlens error: Environment variable ASSESSMENT_TOKEN is required by the config.` })}
<p>The loader also requires 1 to 100 targets, rejects unknown fields at every level, accepts only <code>http</code> and <code>https</code> URLs, and requires <code>maxAmount</code> to be a string of digits so large atomic amounts keep their precision.</p>

<h2 id="full-example">A fuller example</h2>
<p>Two targets that share a policy through <code>defaults</code> (USDC on Base mainnet, at most 0.01 USDC), one of them behind an authenticated staging gateway. Run it with <code>SETTLENS_ALLOWED_HOSTS=staging.merchant.example</code> and <code>ASSESSMENT_TOKEN</code> set.</p>
${codeBlock({ lang: "json", title: "settlens.config.json", code: JSON.stringify(FULL_EXAMPLE, null, 2) })}
<p>The second target sets its own <code>headers</code> and <code>facilitator</code>; it still inherits <code>expected</code>, <code>timeoutMs</code> and <code>repeat</code> from <code>defaults</code>.</p>
<p>Next: run the file in CI with the <a href="/docs/github-action">GitHub Action</a>, watch it with <a href="/docs/monitor">Monitor</a>, or look up a finding in the <a href="/docs/checks">check catalog</a>.</p>`;
}
