# Legacy content (previous hand-written site)

Text extracted from the static pages that `site/build.js` replaced. These files are
**source material only**: the build never reads them and nothing here is published.
Reuse the facts, never the claims flagged below, and re-check every sentence against the
capability truth table in `site/src/README.md`.

| File | Former URL | New route |
|---|---|---|
| `index.md` | `/` | `/` |
| `contact.md` | `/contact.html` | `/contact` |
| `privacy.md` | `/privacy.html` | `/privacy` |
| `terms.md` | `/terms.html` | `/terms` |
| `cookies.md` | `/cookies.html` | `/cookies` |
| `blog/index.md` | `/blog/` | `/blog` |
| `blog/x402-security-failure-modes.md` | `/blog/x402-security-failure-modes.html` | `/blog/x402-security-failure-modes` |
| `blog/how-to-test-x402-endpoint.md` | `/blog/how-to-test-x402-endpoint.html` | `/blog/how-to-test-x402-endpoint` |
| `blog/agentic-payments-what-breaks.md` | `/blog/agentic-payments-what-breaks.html` | `/blog/agentic-payments-what-breaks` |
| `docs/index.md` | `/docs/` | `/docs` |
| `docs/api.md` | `/docs/api.html` | `/docs/cli` and `/docs/api` |
| `docs/methodology.md` | `/docs/methodology.html` | `/docs/methodology` |
| `docs/security.md` | `/docs/security.html` | `/docs/security` and `/security` |
| `docs/evidence.md` | `/docs/evidence.html` | `/docs/evidence` |
| `docs-md/*.md` | served raw as `/docs/*.md` | sources for `/docs/methodology`, `/docs/security`, `/docs/evidence` |

The server 301-redirects the old `.html` and trailing-slash URLs to the new clean URLs.

## Claims in the old pages that must NOT be reused

These contradict what the code does (see the truth table):

- **Old home demo terminal** (`index.md`): "Settlement verification complete — tx confirmed",
  "Replay protection enforced — nonce · expiry", "discovering payment surface … 3 routes found",
  "Facilitator reachable 142 ms", "8 checks passed". Settlens never calls `/settle`, does not
  verify settlement or transactions, does not check on-chain nonce use or replay, and does not
  discover routes. The output was invented. Use real CLI output (see `site/src/pages/index.js`).
- **Old home cards and steps**: "Settlement gaps — verify that a successful response corresponds
  to a real, bound transaction", "From request to verified settlement", "Verify — exercise
  settlement". Not supported.
- **Old home meta description**: "Test implementations for … replay … and settlement failures".
  Replay is only covered as authorization freshness (`validAfter` / `validBefore` in
  `verify-payment`) and stable payment terms across requests; settlement is out of scope.
- **`blog/x402-security-failure-modes.md`, section 5**: general advice about reusable nonces is
  fine as education, but do not imply Settlens detects nonce reuse.
- **`privacy.md`**: "Settlens is currently a pre-incorporation project" is outdated. The publisher
  is Alessandro Gagliardi, entrepreneur individuel (EI), trade name Pazent (see `site/src/data/site.js`).
- **Old canonical URLs** ending in `.html` or `/`: use the clean paths in the table above.
