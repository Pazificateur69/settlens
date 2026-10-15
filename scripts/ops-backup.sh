#!/bin/sh
# Root-only host entry point. Data is encrypted in the existing non-root Settlens container.
set -eu
umask 077
root=/opt/settlens-site
stamp=$(date -u +%Y%m%dT%H%M%SZ)
capture="$root/data/.recovery-$stamp.settlens"
trap 'touch "$root/ops/backup-failed"; rm -f "$capture"' EXIT
attempt=0
until docker exec -i site-settlens-site-1 node /app/scripts/recovery.mjs backup --data-dir=/data --public=/dev/stdin --out="/data/.recovery-$stamp.settlens" < "$root/ops/recovery-public.pem"; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 3 ] || exit 1
  sleep 5
done
python3 "$root/scripts/ops-store-backup.py" "$capture" "$root/backups/data-$stamp.settlens"
rm -f "$capture" "$root/ops/backup-failed"
# Only our own encrypted data archives; credentials and other project files are excluded.
find "$root/backups" -maxdepth 1 -type f -name 'data-*.settlens' -mtime +29 -delete
trap - EXIT
