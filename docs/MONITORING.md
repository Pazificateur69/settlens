# Continuous monitoring and notifications

## CLI and CI

```sh
npm ci --ignore-scripts
npm run quality
node src/cli.js monitor --config settlens.config.json --history .settlens/monitor.json
node src/cli.js history --history .settlens/monitor.json --format html --out history.html
```

Use `--history` or legacy `--state`, never both. Missing files create a baseline;
corrupt or unreadable files fail closed. Atomic writes use mode 0600 and a writer
heartbeat lock. A crashed writer’s stale lock recovers after 30 seconds; never remove a live lock manually.
Journals retain up to 200 runs / 90 days. Latest baselines remain until targets are
removed. History digests detect edits, not authenticity: an attacker with write
access can recompute a digest. Sign exported evidence when observer identity matters.

Changes in advertised amount, payTo, asset, network, scheme, resource URL or
protocol version alert at high severity; timeout/extra metadata at medium.
They are independent of check-status regressions. Legacy state mode stores fingerprints; journal mode additionally retains validated scheme/network/address/atomic-amount/timeout values for review, capped at 32 displayed options. Arbitrary extra metadata stays fingerprinted; incomplete values cannot authorize a price range.
Option order and rotating Solana blockhash metadata are ignored. Rebinding fields
between otherwise identical sets of options is detected. Outages preserve the last
observable terms. A first legacy state run records a comparison baseline. Journal mode opens incidents on initial findings and gates CI on all active findings above the threshold, including acknowledged ones. HTTPS requests do not imply on-chain validity.

`examples/monitor-workflow.yml` restores the latest journal artifact, serializes
runs, and uploads state even after a blocking alert. Artifact expiration or manual
deletion starts a new baseline; use a persistent runner for uninterrupted retention.
The private pilot code must be available in the runner's checkout.

## Approvals, incidents and delivery durability

A last observation is not an approval. The private workspace shows latest and
approved terms separately; approval requires the reviewed current SHA-256 digest,
a successful observation and no high/critical failed checks. Stale approval requests
fail with409. Owner approvals and configuration changes are retained in a bounded
500-action journal. Name/policy edits preserve target identity, history and approvals;
a different URL requires a separate target. Editing `expected` or `pricePolicy`
marks the previous observation `requiresRescan`: approval fails with409 until
a fresh scan evaluates the revised policy. Changing only the name does not require
a rescan. Existing history and approved references remain available for review.

```sh
node src/cli.js history --history .settlens/monitor.json
node src/cli.js reference --history .settlens/monitor.json --target https://merchant.example/paid --digest <reviewed-digest>
node src/cli.js incidents --history .settlens/monitor.json
node src/cli.js incidents --history .settlens/monitor.json --incident <id> --status acknowledged --comment "Investigating"
node src/cli.js notifications --history .settlens/monitor.json
node src/cli.js notifications --history .settlens/monitor.json --retry <id>
```

The fixed policy alerts on any approved-term change. An explicit target
`pricePolicy: { "mode": "range", "minAmount": "9000", "maxAmount": "15000" }`
permits only bounded atomic prices while keeping the other bound option fields
unchanged. Bounds apply on every observable run, including the first run before
any reference is approved and runs where the price has not changed.
`expected.maxAmount` remains an independent scan policy ceiling.

Incidents are open, acknowledged or resolved. Acknowledgement pauses reminders,
not CI blocking. Escalation reopens an incident; passing observations establish
recovery. Missing/skipped checks and unobservable terms cannot prove recovery.
Removal of a target closes its active incidents with an explicit removal reason.
Open incidents remind daily by default; `MONITOR_REMINDER_MS=0` disables reminders,
otherwise configure1 hour–30 days. Up to2000 active incidents and50 bounded owner
comments per incident are supported. Resolved incidents expire after90 days.

Observation, incident transitions and monitor delivery jobs commit atomically.
Pilot emails enter a separate durable queue before the secondary lead-file append.
Every minute the site retries due deliveries; CLI/CI drains only configured channels
when invoked. Merely viewing notifications without mail/webhook settings consumes
no attempts. Jobs back off1/2/4/8/16/32/60/60 minutes and stop after8 failures;
explicit retry resets this budget. Sending leases expire after2 minutes to recover
an interrupted sender. Each queue keeps at most200 pending/failed and200 recent
completed summaries. Oversize/full queues fail closed rather than drop pending jobs.
The JSON journal is capped at8 MiB; oldest observations may be removed early to
fit while active incidents, approved references and pending jobs are preserved.

This is at-least-once delivery: an acceptance response lost after the remote system
acted can result in duplicate email. Acceptance does not prove inbox placement.
Webhooks carry a stable `eventId` in the signed JSON and `x-settlens-event-id` header;
receivers must deduplicate the signed value. Secrets/destinations are runtime config,
never queue payloads. Delivered payloads are deleted; monitoring payloads expire
at90 days and pending/failed pilot payloads at365 days. Expiry purges persist to disk.
The dashboard exposes delivery metadata, not queued lead content or transport secrets.

## Private workspace

`/dashboard` is an optional single-owner workspace, not a multi-tenant SaaS portal.
Its guided checklist distinguishes endpoint setup, complete explicit policy,
observable scan, owner-approved reference and available CLI/CI instructions.
The optional amount converter requires token decimals explicitly and refuses
rounding; it never infers decimals from a symbol or changes policy automatically.
Downloadable configuration is checked against the real CLI configuration loader.
`/api/monitor/export?format=json` exports observation history only.
`format=journal` exports a CLI-compatible private journal with approved references,
state and history; its notification outbox is cleared to avoid replaying dashboard
deliveries, and its host heartbeat is excluded. Protect both downloaded files.
Place the journal at the CLI's `--history` path before running the generated command.
Configuration alone starts a new baseline; neither a download nor approval proves
that CI has run. See [data recovery and operational checks](RECOVERY.md) for full
data backups that preserve notification jobs, which have different semantics.
Set `SETTLENS_MONITOR_TOKEN` to a dedicated random credential, separate from the
scan API token, and `MONITOR_STORE` to a writable file (compose uses `/data/monitor.json`).
Never share production tokens in chat, logs or browser storage.
The token is exchanged for an HttpOnly, Secure, SameSite=Strict one-hour cookie.
No data is included in the unauthenticated dashboard shell. Mutations require the
fixed origin; public-only destinations are checked before every request.

Scheduling is disabled by default. `MONITOR_INTERVAL_MS=900000` enables a run every
15 minutes; the minimum is one minute. Runs do not overlap. At most 20 GET endpoints
are supported. Requests are passive, bounded and never follow redirects.
Set `MONITOR_FAIL_ON` (default high) and optional `MONITOR_WEBHOOK_URL` /
`MONITOR_WEBHOOK_SECRET` for alerts. Local development uses an explicit
`MONITOR_ORIGIN=http://localhost:8080`; production stays `https://settlens.com`.

## Email to the owner

Both notifications go only to **contact@settlens.com**:
- `[Settlens][PILOTE] Nouvelle demande`: submitted lead details; Reply-To is the visitor.
- `[Settlens][ALERTE] N changement(s) détecté(s)`: only changes at or above the threshold.

On the server, edit `/opt/settlens-site/site/.env` (mode 600) with:

```dotenv
SETTLENS_EMAIL_ENABLED=1
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=contact@settlens.com
SMTP_FROM=contact@settlens.com
SMTP_PASSWORD=<configure-in-the-protected-server-file-only>
```

Hostinger documents SMTP 465 with implicit TLS, or 587 with STARTTLS:
https://support.hostinger.com/en/articles/1575756-how-to-get-email-account-configuration-details-for-hostinger-email
TLS certificate validation remains enabled. SMTP logging, file attachments and URL
content fetching are disabled. Credentials are never returned by the API.
No email is sent until this configuration is enabled. SMTP failures produce a generic
error, not message content or credentials. The pilot store remains the fallback when
email fails; no automatic email retry is attempted to avoid duplicate deliveries.

After configuring and rebuilding the image, test SMTP from within the Settlens container:

```sh
docker compose -f site/docker-compose.yml exec settlens-site node scripts/send-email-check.mjs
```

This sends `[Settlens][TEST]` to contact@settlens.com. SMTP acceptance is not proof of
inbox delivery: check the inbox/spam folder. Pilot mail copies follow mailbox retention;
the server pilot store prunes after 365 days. Notifications and sessions are described
in `/privacy` and `/cookies`; third-party CRM forwarding still requires separate disclosure.

## Signed webhook

```sh
node src/cli.js monitor --config settlens.config.json --history .settlens/monitor.json \
  --webhook https://receiver.example/hook --webhook-secret-env MONITOR_WEBHOOK_SECRET
```

`x-settlens-signature` is `sha256=<HMAC-SHA256(secret, timestamp + "." + exactBody)>`;
`x-settlens-timestamp` is Unix seconds. Receivers must verify the exact body, compare
signatures in constant time, and reject stale timestamps. Timeout, network errors and
non-2xx responses are failures. Secret URLs and remote error strings are not printed.

## Deployment mail relay on settlens-host

settlens-host cannot reach Hostinger MX port 25. A dedicated relay on settlens-host accepts only
TLS requests through a restricted SSH tunnel from settlens-host, authenticated with a separate random token.
It delivers only to contact@settlens.com over STARTTLS with hostname/certificate
validation. Subjects are restricted to Settlens PILOTE, ALERTE, TEST and ACCES.
It does not alter Plesk mail configuration, other applications, their containers or vhosts.

Source: `site/mail-relay.py`, service: `site/settlens-mail-relay.service`.
Runtime on settlens-host: `/opt/settlens-mail-relay`; localhost port 3339; systemd DynamicUser and
LoadCredential hold the dedicated relay token and TLS key. Its private certificate
is trusted explicitly by Settlens (`/data/relay-ca.pem`) without disabling validation.
The relay's certificate expiry must be checked and the certificate/key renewed
before expiry; updating the trusted certificate on settlens-host is required when replacing it.

Protected settlens-host settings:

```dotenv
SETTLENS_EMAIL_ENABLED=1
SETTLENS_MAIL_RELAY_URL=https://195.35.28.51:3339/email
SETTLENS_MAIL_RELAY_TOKEN=<configured-on-the-server-only>
SETTLENS_MAIL_RELAY_CA=/data/relay-ca.pem
SETTLENS_EMAIL_LOGIN=1
```

The mailbox password is not needed in relay mode. `/dashboard` offers an email-code
button. Codes go only to contact@settlens.com, expire after ten minutes, allow at most
five guesses globally, and work once. Sign-in code requests are rate-limited; the API
never returns the code. The dedicated permanent token remains a protected CLI fallback.
`[Settlens][ACCES]` messages are authentication messages, separate from pilot and alert emails.

The production link uses `settlens-mail-tunnel.service` on settlens-host. Its dedicated SSH
key is stored only in `/opt/settlens-site/mail-tunnel`, and settlens-host's `settlens-relay`
account permits local forwarding only to 127.0.0.1:3339, with no shell, TTY, password,
agent, X11 or remote forwarding. Existing user SSH keys are unchanged. The Unix socket
`/data/mail-relay.sock` is mode 600, owned by the container's uid 1000; TLS certificate
validation and the relay bearer credential remain required over the tunnel.
Protected setting: `SETTLENS_MAIL_RELAY_SOCKET=/data/mail-relay.sock`.


## Deliverability and authenticated SMTP

The legacy direct-MX relay is restricted to the owner mailbox but is not an
authenticated outbound service. Its VPS address is not authorized by the published
Hostinger SPF, and it adds no DKIM signature. Successful SMTP acceptance does not
establish SPF/DKIM/DMARC success. Never use that path for external outreach or
add a shared VPS address to SPF merely to bypass this failure.

Prefer `smtp.hostinger.com:465` with certificate-validated TLS and a dedicated
Hostinger mailbox app password. `scripts/configure-owner-smtp.py`, run interactively
as root on settlens-host, verifies credentials without sending, then appends configuration
to the existing protected `.env`; it never reads/copies the API token. The optional
`SMTP_PASSWORD_B64` prevents dotenv special-character interpolation; base64 is not
encryption and the value is still a secret. The installer disables relay selection
and restarts only Settlens. Enter credentials directly in the SSH terminal, never
chat or a command argument. DNS enforcement must wait until all legitimate sending
paths authenticate. Mail-Tester scores are diagnostics, not guaranteed inbox placement.


Live deployment verified on 2026-10-14: owner notifications use authenticated
Hostinger SMTP on port 465 with certificate validation. The received owner test
passed SPF, DKIM and DMARC; a separate plain-text SMTP diagnostic scored 10/10 on
Mail-Tester (https://mail-tester.com/test-hvk3gd9zp). This does not guarantee inbox
placement with other recipients. DMARC is now `p=quarantine` with aggregate reports
to contact@settlens.com. The legacy Settlens relay and tunnel services are disabled;
keep their fixed-recipient restriction if maintaining their source for rollback.
