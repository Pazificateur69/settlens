import { AUTHOR, repoFile } from "./_shared.js";
import { CASES, RESULTS } from "../tools/_policy-demo.js";
import { curlCommand } from "../tools/_shared.js";

export const meta = {
  path: "/blog/check-x402-payment-policy",
  title: "Test x402 payment terms before a release",
  label: "Payment-policy regression guide",
  description: "Reproduce five x402 V2 payment-policy checks with a free browser demo, curl and a small Node.js CI example. No account, wallet or payment key needed.",
  lede: "A well-formed 402 can still ask for a price or recipient you did not approve. Keep the policy fixed, change one term, and inspect the decision yourself.",
  section: "blog", lastmod: "2026-10-15", datePublished: "2026-10-15", dateModified: "2026-10-15",
  author: AUTHOR, tags: ["x402", "Testing", "Guide", "CI"],
  summary: "Reproduce five synthetic x402 V2 cases through the public Settlens evaluator: approved terms, a higher price, another recipient, another resource and a missing recipient policy. Use the browser or curl, then run the same reviewed fixtures in CI without a wallet or private CLI.",
  sources: [
    { title: "x402 V2 HTTP transport", url: "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md", publisher: "x402 Foundation" },
    { title: "x402 protocol specification, version 2", url: "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md", publisher: "x402 Foundation" },
  ],
  related: ["/blog/how-to-test-x402-endpoint", "/blog/detecting-x402-payment-drift", "/learn/agent-spending-policy"],
};

export default function render(ctx) {
  const { html, codeBlock, table } = ctx;
  return html`<h2 id="video">See three decisions in 60 seconds</h2>
<figure><video class="demo-video" controls preload="none" poster="/assets/x402-policy-demo-poster.png" aria-label="Synthetic x402 payment-policy demonstration, with a text explanation below"><source src="/assets/x402-policy-demo.mp4" type="video/mp4"><p><a href="/assets/x402-policy-demo.mp4">Download the demonstration</a>.</p></video><figcaption>Three still captures of real browser-checker responses, edited to 20 seconds each. Synthetic examples, recorded October 15, 2026. No audio, live merchant incident, signature or payment. The steps below are the text equivalent.</figcaption></figure>
<p><a href="/tools/x402-checker#guided-demo">Try the same three steps yourself</a>, or <a href="/assets/x402-policy-demo.mp4" download>download the 60-second video</a>.</p>
<h2 id="browser">Reproduce it in your browser</h2>
<ol><li>Open the <a href="/tools/x402-checker#checker">free checker</a>, select <strong>Load sample</strong>, then <strong>Check the request</strong>. The expected decision is <code>pay</code> under the complete example policy.</li>
<li>Select <strong>Price doubles</strong>, then check again. The quote is now <code>20000</code> atomic units, above the unchanged <code>10000</code> ceiling. Expected decision: <code>do_not_pay</code>.</li>
<li>Select <strong>Recipient changes</strong>, then check again. The recipient differs from the unchanged allowlist. Expected decision: <code>do_not_pay</code>.</li></ol>
<p>The policy belongs to the reviewer. Copying an untrusted quote into its own allowlist would defeat the check. A change may be intentional: review it before updating the policy.</p>
${table({ caption: "Expected results from the same evaluator used by the public checker", head: ["Synthetic case", "Decision", "Failed or warned checks"], rows: CASES.map((example, index) => [example.name, example.expected, RESULTS[index].checks.filter((check) => ["fail", "warn"].includes(check.status)).map((check) => check.id).join(", ") || "None"]) })}
<p>The approved fixture uses the specification’s Base Sepolia example (<code>eip155:84532</code>). These are illustrative terms, not a payment destination to fund. A <code>pay</code> decision means that an option meets the supplied policy and evaluated checks; it is not an instruction to transfer funds or a security guarantee.</p>
<h2 id="curl">Run the same check with curl</h2>
<p>This public call needs no token, account or access to the private Settlens CLI. It evaluates supplied data in memory; it never requests <code>api.example.com</code>. Do not include credentials, private keys, seed phrases or confidential payloads. See the <a href="/privacy#mcp-endpoint">processing and rate-limit details</a>.</p>
${codeBlock({ lang: "shell", title: "Approved synthetic quote and a complete policy", code: curlCommand("evaluate_payment_requirements", CASES[0].arguments), wrap: true })}
<p>In <code>result.structuredContent</code>, inspect <code>decision</code>, <code>acceptable</code>, <code>reasons</code> and <code>checks</code>. Keep the policy unchanged and replace only <code>payment_required.accepts[0].amount</code> with <code>"20000"</code> to reproduce the price case.</p>
<h2 id="ci">Keep reviewed cases in CI</h2>
<p>Download the <a href="/assets/x402-policy-cases.json" download>five synthetic fixtures</a> and the <a href="/assets/x402-policy-regression.cjs" download>small Node.js runner</a>. Review both before using them. With Node.js 20.19 or newer:</p>
${codeBlock({ lang: "shell", title: "Run the public example", code: "curl --fail --show-error -O https://settlens.com/assets/x402-policy-cases.json\ncurl --fail --show-error -O https://settlens.com/assets/x402-policy-regression.cjs\nnode x402-policy-regression.cjs x402-policy-cases.json" })}
<p>The runner exits nonzero on an unexpected decision, an HTTP failure, timeout or evaluator error. Its full source is below. The public evaluator is limited to 60 requests per minute per IP; each run makes five requests. Availability and shared CI egress limits can fail this job too.</p>
${codeBlock({ lang: "javascript", title: "x402-policy-regression.cjs", code: repoFile("site/assets/x402-policy-regression.cjs"), wrap: true })}
<p>Commit reviewed fixtures and the runner to your own repository. For example, after checking out your code and selecting a supported Node.js version, add this step to your existing workflow:</p>
${codeBlock({ lang: "yaml", title: "GitHub Actions step", code: "- name: Check reviewed x402 fixtures\n  run: node x402-policy-regression.cjs x402-policy-cases.json" })}
<h2 id="scope">What this example establishes</h2>
<p>This is a regression check for supplied challenges and policy decisions. The synthetic fixtures alone do not test a deployed merchant. For your release, capture a challenge from an endpoint you are authorized to test, review its terms independently, and decide which controlled changes must be refused. Never automatically refresh an approved reference from unreviewed live data.</p>
<p>It does not establish live HTTP behavior, signatures, balances, nonce use, on-chain settlement or overall payment safety. The exported decision JSON is unsigned. For a scoped endpoint scan, monitoring reference and private CLI/CI integration, <a href="/contact#pilot-request">request a technical pilot</a>.</p>`;
}
