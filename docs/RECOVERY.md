# Operational checks and data recovery

These mechanisms protect Settlens application data. They do not establish payment
settlement, guarantee inbox delivery or replace a tested rebuild of the entire host.

## Data-only encrypted backups

`scripts/recovery.mjs` includes only `monitor.json`, `pilot-leads.jsonl` and
`pilot-leads.jsonl.notifications.json`. Missing optional files are allowed; no-data,
invalid journals, partial lead records, symlinks and busy writers fail closed.
Monitor and notification captures take the same writer locks as the application.
The lead file is a bounded, stable complete JSONL capture. Files are captured
individually; this is not a cross-file database transaction. The pilot queue is
the authoritative delivery receipt if an append was interrupted.

Archives use an RSA-OAEP SHA-256 wrapped random AES-256-GCM key, authenticated
metadata and compressed data. The server receives only the public recovery key.
The private recovery key remains in an owner-only directory on the operator's Mac.
No `.env`, SMTP password, scan/monitor token, signing key or source code is included.
This provides encryption and corruption detection; it is not a signed attestation
of archive provenance. Restore only archives from the protected backup locations.

```sh
umask 077
mkdir -p .settlens/recovery
node scripts/recovery.mjs keygen --private=.settlens/recovery/private.pem --public=.settlens/recovery/public.pem
node scripts/recovery.mjs backup --data-dir=.settlens/data --public=.settlens/recovery/public.pem --out=.settlens/recovery/data.settlens
node scripts/recovery.mjs restore --archive=.settlens/recovery/data.settlens --private=.settlens/recovery/private.pem --destination=.settlens/restored-new
```

Keys and existing archives are never replaced. Restoration authenticates the
encrypted stream before decompressing it, bounds both ciphertext and plaintext,
validates history digests and allows only the three known filenames. It writes
mode600 files to a **new** mode700 directory and never overwrites live data.
Failed restoration removes its private staging files. Pending notification jobs
retain their status; review them before reconnecting SMTP, because at-least-once
delivery can repeat a mail after a lost response. Application retention must run
before restored data is put back into service.

Production runs `settlens-data-backup.timer` daily at03:20UTC, with up to five minutes
of jitter. The root-only `/opt/settlens-site/backups` directory retains encrypted
archives for at most30 days. A failure creates an operator marker and activates
the Settlens watchdog. No container stop, shared-host cleanup or other app is used.

`scripts/sync-recovery.mjs --directory=OWNER_ONLY_DIR --private=PRIVATE_KEY_FILE`
copies the newest encrypted archive from `settlens-host`, verifies a restoration in a
disposable private directory and removes the restored plaintext. A receipt keeps
only the archive name, ciphertext digest, verification time and number of files.
Local copies are limited to seven archives /200MiB and30 days. The operator's
periodic local check must be running to maintain this off-host copy. A local check
cannot run while the Mac is unavailable; server backups continue independently.

The encrypted copy and private key must both survive a host loss. Losing the key
makes these archives unreadable. Host rebuilds still require independent DNS,
TLS and protected SMTP/access configuration; credentials are deliberately absent
from the archive. Maintain an owner-controlled recovery copy of the private key
through the owner's credential-management process; never place it in Git or chat.

## Operational failure alerts

The protected journal records a heartbeat at manual/scheduled attempt, completion
and failure. `scripts/ops-health.mjs` returns only counts, timestamps and fixed issue
codes for missed scheduled runs, overdue senders and failed notification jobs.
Monitoring disabled or without targets is reported without pretending it ran.

`settlens-ops-watchdog.timer` probes every five minutes: application HTTP health,
only the Settlens container state, the private operational probe and backup freshness
(36-hour bound). Failure mail goes only to **contact@settlens.com**, with
`[Settlens][OPS]`. Changed failures notify immediately; unchanged accepted alerts
remind at most daily, and unconfirmed mail retries after15 minutes. Raw exceptions,
endpoint details and credentials are not included. SMTP acceptance does not prove
inbox delivery. If the entire host or its SMTP provider is unavailable, this host
watchdog cannot deliver an alert; the separate local check reports that failure
through Codex when it can run.

## Restore drill and service restart

1. Copy and validate a trusted encrypted archive with the private key locally.
2. Restore into a new protected directory and check references, history and queue
   counts without printing pilot messages or credentials.
3. For an actual recovery, stop only the Settlens service, preserve current data,
   apply application retention and review pending deliveries before using the
   restored files. Preserve owner permissions and mode600/700.
4. Restart only Settlens. Verify HTTP health, unauthenticated API401, journal
   readability, expected approved digests and the operational probe. Session
   cookies are intentionally invalid after restart; sign in again.

The automated restore drill does not replace production data or send mail.
