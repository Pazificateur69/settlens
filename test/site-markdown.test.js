import test from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, minifyCss, ogSlug, pngSize } from "../site/build.js";

const BASE = "https://settlens.com/docs/cli";
const md = (markup) => htmlToMarkdown(markup, BASE);

test("htmlToMarkdown converts headings, paragraphs, inline markup and links", () => {
  assert.equal(
    md('<h2 id="x">Exit <code>codes</code></h2><p>Read <a href="/docs/checks#binding">the checks</a>, <strong>always</strong> and <em>offline</em>. See <a href="#synopsis">synopsis</a> or <a href="mailto:a@b.c">mail</a>.</p>'),
    "## Exit `codes`\n\nRead [the checks](https://settlens.com/docs/checks#binding), **always** and _offline_. See [synopsis](https://settlens.com/docs/cli#synopsis) or [mail](mailto:a@b.c).\n",
  );
  // Entities are decoded, then text that would read as Markdown or HTML is escaped.
  assert.equal(md("<p>A &lt;h1&gt; tag, a * star, [brackets], snake_case and _edge_ &amp; &#x2713; &#8212;&nbsp;x</p>"), "A \\<h1> tag, a \\* star, \\[brackets\\], snake_case and \\_edge\\_ & ✓ — x\n");
  assert.equal(md("<p>1. not a list</p><p># not a heading</p>"), "1\\. not a list\n\n\\# not a heading\n");
  // Elements written side by side get a space; text next to an element is joined as written.
  assert.equal(md('<div><a href="/a">One</a><a href="/b">Two</a></div><p><span>neutral</span><span>accent</span> <code>x</code>.</p>'), "[One](https://settlens.com/a) [Two](https://settlens.com/b)\n\nneutral accent `x`.\n");
  assert.equal(md("<p>Line one<br>line two<br></p>"), "Line one\\\nline two\n");
  assert.equal(md("<p><em>N</em><sup>1−<em>k</em></sup> and 2<sup>256</sup></p>"), "_N_^(1−_k_) and 2^(256)\n");
  assert.equal(md('<p><code>a`b</code> <img src="/assets/x.png" alt="Logo"> <img src="/y.png" alt=""></p>'), "``a`b`` ![Logo](https://settlens.com/assets/x.png)\n");
  assert.equal(md("<p><a href=\"/x\"></a><strong> </strong></p>"), "");
});

test("htmlToMarkdown converts lists, code blocks, terminals, tables, quotes, FAQ and definition lists", () => {
  assert.equal(md("<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>"), "- One\n- Two\n  - Nested\n");
  assert.equal(
    md('<ol class="steps"><li class="step"><span class="step__index" aria-hidden="true">01</span><div><h3>Scan</h3><p>Body.</p></div></li></ol>'),
    "1. **Scan**\n\n   Body.\n",
  );
  assert.equal(
    md('<figure class="code"><figcaption class="code__bar"><span class="code__lang">Shell</span><span class="code__title">Passive scan</span><button class="code__copy" hidden>Copy</button></figcaption><pre class="code__pre"><code class="language-shell"><span class="tok">settlens</span> scan \\\n  --x &amp;&amp; echo "```"</code></pre></figure>'),
    '**Passive scan**\n\n````shell\nsettlens scan \\\n  --x && echo "```"\n````\n',
  );
  assert.equal(
    md('<figure class="terminal"><figcaption class="terminal__bar"><span class="terminal__dots" aria-hidden="true"><i></i></span><span class="terminal__title">Demo</span></figcaption><pre class="terminal__body"><code><span class="t-line t-cmd"><span class="t-prompt" aria-hidden="true">$ </span>settlens scan</span>\n<span class="t-line">13 pass</span>\n</code></pre></figure>'),
    "**Demo**\n\n```text\n$ settlens scan\n13 pass\n```\n",
  );
  assert.equal(
    md('<div class="table-wrap" role="region"><table><caption>Exit <code>codes</code></caption><thead><tr><th>Code</th><th>Meaning</th></tr></thead><tbody><tr><th scope="row">0</th><td>a | b<br>c</td></tr><tr><td>1</td></tr></tbody></table></div>'),
    "_Exit `codes`_\n\n| Code | Meaning |\n| --- | --- |\n| 0 | a \\| b; c |\n| 1 |  |\n",
  );
  assert.equal(md('<td><span class="cmp"><svg role="img" aria-label="Yes"><path/></svg></span></td>'), "Yes\n");
  assert.equal(md('<blockquote><p>Quoted.</p><p>Twice.</p></blockquote>'), "> Quoted.\n>\n> Twice.\n");
  assert.equal(
    md('<div class="callout callout--warning" role="note"><span class="callout__icon"><svg aria-hidden="true"></svg></span><div><p class="callout__title">Authorized only</p><p>Body.</p></div></div>'),
    "> **Authorized only**\n>\n> Body.\n",
  );
  assert.equal(md('<details class="faq__item"><summary><span>Does it pay?</span><svg aria-hidden="true"></svg></summary><div><p>No.</p></div></details>'), "**Does it pay?**\n\nNo.\n");
  assert.equal(md('<dl class="stats"><div class="stat"><dt>Keys</dt><dd>0</dd><dd>None needed</dd></div></dl><dl><dd>orphan</dd></dl>'), "- **Keys:** 0 — None needed\n\n- orphan\n");
  // Glossary terms are already bold: one pair of ** only.
  assert.equal(md('<dl><dt><dfn id="accepts"><strong>accepts</strong></dfn></dt><dd>The options.</dd></dl>'), "- **accepts:** The options.\n");
  assert.equal(
    md('<figure class="diagram"><div class="diagram__canvas" role="img" aria-label="Flow: A to B." tabindex="0"><svg aria-hidden="true"><text>A</text></svg></div><figcaption>The <code>402</code> flow.</figcaption></figure><hr>'),
    "_Diagram: Flow: A to B._\n\n_The `402` flow._\n\n---\n",
  );
});

test("htmlToMarkdown drops chrome, controls, hidden content and scripts", () => {
  const out = md(`<nav class="breadcrumbs"><a href="/">Home</a></nav><a class="skip-link" href="#main">Skip</a>
<details class="toc-mobile"><summary>On this page</summary></details><aside>TOC</aside>
<form action="/api/pilot"><label>Name</label><input name="name"><button>Send</button></form>
<p hidden>Hidden</p><p aria-hidden="true">Decor</p><svg><text>Art</text></svg>
<script type="application/ld+json">{"a":"<p>x</p>"}</script><style>p{}</style><template><p>T</p></template><!-- note -->
<p>Kept <b>bold</b></p></div></span>`);
  assert.equal(out, "Kept **bold**\n");
  assert.equal(htmlToMarkdown(""), "");
  assert.equal(htmlToMarkdown('<p><a href="/a b(c)">x</a></p>'), "[x](https://settlens.com/a%20b%28c%29)\n");
});

test("minifyCss strips comments and whitespace outside strings only", () => {
  assert.equal(minifyCss('/* x */ .prose :where(h2) , a > b { width: calc(1rem + 2px); content: "a  ;  b"; }'), '.prose :where(h2),a > b{width:calc(1rem + 2px);content:"a  ;  b"}');
  assert.equal(minifyCss("/* don't */ a { content: '/* kept */'; }\n@media (min-width: 64rem) { a { color: red } }"), "a{content:'/* kept */'}@media (min-width:64rem){a{color:red}}");
});

test("pngSize reads the IHDR chunk and ogSlug maps paths to file names", () => {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(1200, 16);
  header.writeUInt32BE(630, 20);
  assert.deepEqual(pngSize(header), { width: 1200, height: 630 });
  assert.throws(() => pngSize(Buffer.from("GIF89a")), /not a PNG/);
  assert.deepEqual(["/", "/pricing", "/docs/cli"].map(ogSlug), ["home", "pricing", "docs--cli"]);
});
