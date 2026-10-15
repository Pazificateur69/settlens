# Settlens website

`site/build.js` generates the static site into `site/public` (Node stdlib only, no runtime
dependencies) and `site/server.js` serves it with clean URLs, strict security headers, the pilot
intake, the authenticated scan API and the MCP endpoint (`/mcp`). Authoring rules for pages are in
`site/src/README.md`.

```bash
npm run site:build   # strict build: fails on any broken link, missing page, CSP violation or JSON-LD conflict
npm run site:dev     # drafting build (tolerates routes that have no page yet), then serve on 127.0.0.1:8080
```

A build writes into a temporary sibling directory and swaps it into place with a rename, so the
served directory is never half-built, even when two builds run at once. It only ever replaces a
directory that carries its `.settlens-build` marker.

Besides the pages, every build writes:

| Output | What it is |
| --- | --- |
| `assets/site.<hash>.css` | `site.css` minified, with the font URL rewritten (budget: under 60,000 bytes, tested on this file) |
| `assets/inter.<hash>.woff2`, `assets/LICENSE-Inter.txt` | The self-hosted Inter font, fingerprinted (`immutable` cache), and its OFL licence |
| `assets/tools.<hash>.js` | Only when `site/src/assets/tools.js` exists; loaded only by pages with `meta.scripts: ["tools"]` |
| `*.br`, `*.gz` | Brotli (quality 11) and gzip (level 9) copies of every text file of 1 KiB or more, served by negotiation |
| `<path>.md`, `index.md` | A Markdown alternate of every indexable page, converted from its rendered content |
| `llms.txt`, `llms-full.txt` | Agent index (links to the `.md` alternates) and the whole site as Markdown, most important pages first |
| `robots.txt` | `*` plus one explicit group for AI assistant, search and training crawlers (same rules, `Disallow: /api/` repeated) |
| `speculation-rules.json` | Prerender rules for same-origin page links, announced by the `Speculation-Rules` response header |
| `<key>.txt` | IndexNow ownership file (`site/src/data/indexnow-key.txt`, committed, public by design) |
| `assets/og/<slug>.png` | Per-page Open Graph images, when `site/tools/og.mjs` has generated them |

`node site/build.js <dir> --require-summary` also fails on any indexable, non-legal page without a
`meta.summary`: run it to see which pages still need one before making it the default.

## Production on settlens-host

Application-only operational services and data-only encrypted recovery are described
in [docs/RECOVERY.md](../docs/RECOVERY.md). Their root-only host paths are
`/opt/settlens-site/ops` and `/opt/settlens-site/backups`; systemd units are the
`settlens-data-backup` and `settlens-ops-watchdog` services/timers. These mechanisms
do not copy `.env` or require changes to other applications, nginx or Plesk accounts.

The container runs on settlens-host behind the host nginx, bound to `127.0.0.1:3318`. The Docker image
(`site/Dockerfile`) runs the same strict build at image build time, as a non-root user with
root-owned, read-only code.

| Path on settlens-host | Content |
| --- | --- |
| `/opt/settlens-site` | Build context: `package.json`, `package-lock.json`, `src/`, `site/`, `schemas/`, `action.yml`, `settlens.config.example.json`, `CHANGELOG.md`, `examples/github-workflow.yml` |
| `/opt/settlens-site/site/.env` | Secrets read by `docker-compose.yml` (`SETTLENS_API_TOKEN`, optional `PILOT_WEBHOOK_*`, which also needs `PILOT_WEBHOOK_DISCLOSED=1`), mode 600 |
| `/opt/settlens-site/data` | Mounted on `/data`: the pilot store `pilot-leads.jsonl`. Writable by uid 1000 (`node` in the image) |
| `/etc/nginx/conf.d/settlens.conf` | Reverse proxy to `127.0.0.1:3318`; source of truth: `site/nginx/settlens.conf` (install with `install -m 644`, then `nginx -t && systemctl reload nginx`) |
| `/opt/settlens` | Unrelated July 2026 CLI release (0.2.0): leave it alone |
| `/opt/settlens-web` | Existing `settlens-web-tls` timer that renews the TLS certificate |

`.dockerignore` keeps `site/.env`, `data/`, `site/public` and every other file not listed above out
of the build context. The pages render some repository files at build time; `test/site.test.js`
fails when the Dockerfile does not copy one of them.

### Deploy

1. Sync the build context from the repository root (`--delete` drops files removed locally, so a
   deleted page cannot keep being built; the excluded paths are never touched):

   ```bash
   # macOS openrsync has no --chmod: make sure local files are world-readable (og-image.png was 0600).
   rsync -rtR --delete --exclude=site/public --exclude=site/.env --exclude='site/.public.tmp-*' \
     .dockerignore package.json package-lock.json CHANGELOG.md action.yml settlens.config.example.json \
     examples/github-workflow.yml schemas src scripts site settlens-host:/opt/settlens-site/
   ```

2. First deployment only, on settlens-host: create the data directory and the secrets file.

   ```bash
   install -d -m 700 -o 1000 -g 1000 /opt/settlens-site/data
   install -m 600 /opt/settlens-site/site/.env.example /opt/settlens-site/site/.env
   # edit /opt/settlens-site/site/.env: SETTLENS_API_TOKEN=$(openssl rand -hex 32)
   ```

   The directory itself (not only the file) must be writable by uid 1000: the daily retention pass
   rewrites the store through a temporary file and a rename. A token left at the placeholder, or
   shorter than 32 characters, disables `/api/scan` and the MCP network tools (logged at startup).

3. Build and start. The image build fails, and the running container is left untouched, if any page,
   link or check is broken.

   ```bash
   cd /opt/settlens-site
   docker image tag settlens-site:0.5.0 settlens-site:rollback 2>/dev/null || true   # keep the running image
   docker compose -f site/docker-compose.yml build
   docker compose -f site/docker-compose.yml up -d
   curl -fsS http://127.0.0.1:3318/health        # {"ok":true}
   ```

   Roll back with `docker image tag settlens-site:rollback settlens-site:0.5.0` followed by the same
   `up -d`.

4. nginx: `/etc/nginx/conf.d/settlens.conf` proxies to the container and **overwrites**
   `X-Forwarded-For` with `$remote_addr`. The server keys rate limits on the last `X-Forwarded-For`
   entry (`TRUST_PROXY=1`), so that entry must always be the address nginx saw, never a value the
   client sent.

   ```nginx
   # Dynamic responses (/mcp, /api/*) only: pages and files arrive precompressed from the server.
   gzip on;
   gzip_vary on;
   gzip_proxied any;
   gzip_comp_level 6;
   gzip_min_length 1024;
   gzip_types text/css text/javascript application/javascript application/json application/manifest+json application/xml image/svg+xml text/plain;

   location / {
       gzip off;   # the server already sent br or gzip (with Vary: Accept-Encoding)
       proxy_pass http://127.0.0.1:3318;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

   `Host` must stay the public host name: the pilot intake compares it with the browser's
   `Origin` to refuse cross-site submissions. The server already sends `Strict-Transport-Security`,
   the other security headers and `Speculation-Rules`; do not add them again in nginx. The server
   picks the build's `.br` or `.gz` copy from `Accept-Encoding` (nginx forwards it unchanged; never
   add `proxy_set_header Accept-Encoding ""`), so brotli needs no nginx module, and each encoding
   keeps its own strong ETag.

   Apply with `nginx -t && systemctl reload nginx`, then check:

   ```bash
   curl -sI -H 'Accept-Encoding: br' https://settlens.com/ | grep -iE 'content-encoding|vary'     # br, Accept-Encoding
   curl -sI -H 'Accept-Encoding: gzip' https://settlens.com/ | grep -i content-encoding           # gzip
   curl -sI https://settlens.com/ | grep -i speculation-rules                                     # "/speculation-rules.json"
   curl -sI https://settlens.com/speculation-rules.json | grep -i content-type                   # application/speculationrules+json
   curl -sI https://settlens.com/docs/cli.md | grep -iE '^(content-type|link|x-robots-tag)'        # text/markdown, rel="canonical" (no x-robots-tag)
   ```

   TLS stays with the existing `settlens-web-tls`
   timer under `/opt/settlens-web`: this procedure does not change certificates, so keep the
   `ssl_certificate` lines already in `settlens.conf` (`systemctl list-timers 'settlens-web-tls*'`
   shows the next renewal).

5. Tell IndexNow (Bing, Yandex, Seznam, Naver, Yep; Google reads the sitemap) which pages changed,
   once the new image is live:

   ```bash
   node site/tools/indexnow.mjs --since=2026-10-13 --dry-run   # the URLs whose lastmod is on or after that day
   node site/tools/indexnow.mjs --since=2026-10-13             # POST to api.indexnow.org; 200 or 202 is success
   ```

   It reads the live sitemap (`--sitemap=<file|url>` for another one), checks that
   `https://settlens.com/<key>.txt` serves the key, and submits at most 10,000 URLs. Submit only
   changed pages: without `--since` it sends every URL, which is meant for the first submission.

## Open Graph images

`site/tools/og.mjs` renders one 1200×630 PNG per indexable page (title, section, summary or
description, in Inter on the site colours) with the local Chrome in headless mode, into
`site/src/assets/og/<slug>.png` (`/` → `home`, `/docs/cli` → `docs--cli`), and records the title of
each image in `site/src/data/og-manifest.json`. The build publishes the images under `/assets/og/`
and points `og:image` at them; a page without one keeps `/assets/og-image.jpg`. Commit the PNGs and
the manifest: the Docker build never runs Chrome.

```bash
node site/tools/og.mjs                         # every indexable page (removes images of deleted pages)
node site/tools/og.mjs --only=/pricing,/mcp    # after a title change on those pages
node site/tools/og.mjs --only=/ --out=/tmp/og  # trial run outside the repository
```

`CHROME=/path/to/chrome` overrides the browser. Once the manifest lists any image, `npm run quality`
fails when an indexable page has no image or its title changed since the image was rendered.

## Local testing of the browser tools

`/mcp` refuses browser requests from origins other than `https://settlens.com` and
`https://claude.ai` (DNS-rebinding protection). To call it from a local build, start the server
with the local origin allowed, never in production:

```bash
MCP_EXTRA_ORIGINS=http://127.0.0.1:8080 npm run site:dev
```

The list is comma-separated and never derived from the request's `Host` (under DNS rebinding an
attacker's `Origin` and `Host` match).

## Pilot form

The form posts to `/api/pilot`: JSON from the browser script, or a plain form post when JavaScript
is off (the server answers with a 303 back to the page and a `#pilot-sent` / `#pilot-error` anchor).
Configure `PILOT_STORE` (JSON lines file) and/or `PILOT_WEBHOOK_URL` (CRM, n8n, Make or an internal
mail gateway) with an optional `PILOT_WEBHOOK_SECRET`. The browser never holds secrets.
`/privacy` states that pilot requests are not forwarded to any form, CRM or messaging service, so
the server refuses to start when `PILOT_WEBHOOK_URL` is set without `PILOT_WEBHOOK_DISCLOSED=1`:
update the privacy notice to name the webhook recipient first, then set that flag.

Retention: at startup and then once a day, the server rewrites `PILOT_STORE` without the entries
whose `receivedAt` is more than 365 days old (temporary file + rename, mode 600). Submissions are
appended (mode 600). Above 20 MiB the store takes no new lead (the webhook, if configured, still
delivers it) and the server logs an `ALERT pilot store is over` line: clean the store. Leads that
the webhook already delivered elsewhere follow that system's retention.

Abuse controls: 5 submissions per 15 minutes per client address, cross-site posts refused (the
browser's `Origin` must match `Host`), JSON or form bodies only, field limits matching the form
(`name` and `company` 200, `email` 320, `message` 4000 characters), and a hidden honeypot field.

## Scan API

`POST /api/scan` is for server-to-server clients only. It reuses the production scanner in passive
mode and enforces bearer authentication (`SETTLENS_API_TOKEN`, compared through SHA-256 digests so
neither its content nor its length leaks), rate limiting, DNS/private-network checks, short timeouts,
bounded payloads and no redirects. `facilitator` is accepted only as a URL string: callers cannot
set facilitator headers or timeouts. Never put the token in browser code.

Environment variables are documented in `.env.example`. Rotate the API and webhook secrets regularly.

## Optional monitoring and mail

Sync `scripts/` with `src/` and `site/` for the mail test command. Compose keeps the
monitor journal under `/data/monitor.json`; it is disabled until a dedicated
`SETTLENS_MONITOR_TOKEN` is configured. Scheduling is opt-in via `MONITOR_INTERVAL_MS`.
Email is opt-in via `SETTLENS_EMAIL_ENABLED=1` and protected SMTP variables. See
`docs/MONITORING.md` for setup and the test command. Never print the `.env` file.
The API token must not be reused for dashboard sign-in. Configure HTTPS origin only.

Production relay mode uses the dedicated `settlens-mail-relay.service` on settlens-host,
with source `site/mail-relay.py`, explicit TLS trust and a separate protected token.
It is restricted to settlens-host and contact@settlens.com. No shared Postfix settings are changed.
One-time owner email codes are enabled with `SETTLENS_EMAIL_LOGIN=1`.


### Durable notifications and approvals

Keep `/data` persistent. Existing version1 journals are extended in place without
resetting observations or history. No observed terms are auto-approved during upgrade.
Monitoring delivery jobs share the journal transaction; pilot jobs live in
`pilot-leads.jsonl.notifications.json`. Both stay uid1000, mode600 inside data mode700.
The writer uses proper-lockfile4.1.2 with a10-second heartbeat and30-second stale
recovery. Do not manually remove a live lock or run writers with different timings.
`MONITOR_REMINDER_MS` defaults to86400000, supports0 or3600000–2592000000.
The timer retries deliveries each minute even with no scan targets. Inspect delivery
status in the authenticated dashboard; acceptance does not prove inbox placement.
Queues are bounded and duplicates are possible after lost acceptance responses.
Do not reset a corrupt/full journal; export and investigate its state.


### Authenticated owner SMTP migration

The direct-MX relay's unsigned mail currently SPF-softfails. Keep its fixed-recipient
restriction; do not use it for outreach. To migrate, deploy the SMTP_PASSWORD_B64
support first, then run `python3 /opt/settlens-site/scripts/configure-owner-smtp.py`
in an interactive root SSH terminal on settlens-host. The owner enters the app password
with echo disabled; the installer verifies authentication before appending mode600
config and recreating only settlens-site. No existing environment bytes are copied.
Retest actual received Authentication-Results before increasing DMARC enforcement.


Live deployment verified on 2026-10-14: owner notifications use authenticated
Hostinger SMTP on port 465 with certificate validation. The received owner test
passed SPF, DKIM and DMARC; a separate plain-text SMTP diagnostic scored 10/10 on
Mail-Tester (https://mail-tester.com/test-hvk3gd9zp). This does not guarantee inbox
placement with other recipients. DMARC is now `p=quarantine` with aggregate reports
to contact@settlens.com. The legacy Settlens relay and tunnel services are disabled;
keep their fixed-recipient restriction if maintaining their source for rollback.
