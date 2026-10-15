#!/usr/bin/env python3
"""Root-only Settlens host probe, including notification when its container is unavailable."""
import base64
import datetime
import email.message
import json
import os
from pathlib import Path
import smtplib
import ssl
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/opt/settlens-site')
RECIPIENT = 'contact@settlens.com'


def delivery_due(previous, issues, now):
    """Notify on a changed failure, then at most daily; failed sends retry after 15 minutes."""
    if not issues:
        return False
    if previous.get('issues') != issues:
        return True
    interval = 86400 if previous.get('mailAccepted') else 900
    return now - previous.get('lastNotificationAttempt', 0) >= interval


def send_owner_mail(config_file, issues):
    allowed = {'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_FROM', 'SMTP_PASSWORD', 'SMTP_PASSWORD_B64', 'SETTLENS_EMAIL_ENABLED'}
    config = {}
    try:
        # Select only SMTP fields; scan/monitor credentials are never copied or exposed.
        with config_file.open() as source:
            for line in source:
                name, separator, value = line.strip().partition('=')
                if separator and name in allowed:
                    config[name] = value.strip().strip('"\'')
        if config.get('SETTLENS_EMAIL_ENABLED') != '1':
            return False
        password = config.get('SMTP_PASSWORD')
        if 'SMTP_PASSWORD_B64' in config:
            password = base64.b64decode(config['SMTP_PASSWORD_B64'], validate=True).decode('utf-8')
        if not password or any(char in password for char in '\r\n\0'):
            return False
        port = int(config.get('SMTP_PORT', '465'))
        if port not in (465, 587):
            return False
        sender = config.get('SMTP_FROM', config['SMTP_USER'])
        message = email.message.EmailMessage()
        message['From'] = sender
        message['To'] = RECIPIENT
        message['Subject'] = '[Settlens][OPS] Surveillance ou sauvegarde à vérifier'
        message.set_content('Le contrôle opérationnel Settlens signale :\n\n' + '\n'.join(issues) + '\n\nConsulter le service privé Settlens sur settlens-host. Aucun paiement ni contrôle on-chain effectué.\n')
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        client = smtplib.SMTP_SSL(config['SMTP_HOST'], port, timeout=8, context=context) if port == 465 else smtplib.SMTP(config['SMTP_HOST'], port, timeout=8)
        with client:
            if port == 587:
                client.starttls(context=context)
            client.login(config['SMTP_USER'], password)
            refused = client.send_message(message, from_addr=sender, to_addrs=[RECIPIENT])
            return not refused
    except Exception:
        return False  # Never log raw SMTP exceptions, headers, passwords or addresses from stored data.


def probe(root, now):
    issues = []
    try:
        with urllib.request.urlopen('http://127.0.0.1:3318/health', timeout=5) as response:
            if response.status != 200 or json.loads(response.read(1024)).get('ok') is not True:
                issues.append('operations.http_unhealthy')
    except Exception:
        issues.append('operations.http_unavailable')
    try:
        result = subprocess.run(['docker', 'inspect', '--format', '{{.State.Status}} {{.State.Health.Status}} {{.State.StartedAt}}', 'site-settlens-site-1'], capture_output=True, text=True, timeout=6, check=True)
        status, health, started = result.stdout.strip().split()
        if status != 'running' or health != 'healthy':
            issues.append('operations.container_unhealthy')
        if status == 'running':
            result = subprocess.run(['docker', 'exec', 'site-settlens-site-1', 'node', '/app/scripts/ops-health.mjs', '--startup-at=' + started], capture_output=True, text=True, timeout=12)
            if len(result.stdout) > 16384:
                raise ValueError()
            report = json.loads(result.stdout)
            if not report.get('healthy'):
                codes = report.get('issues', [])
                issues.extend(code if isinstance(code, str) and len(code) < 100 and all(char.isalnum() or char in '._-' for char in code) else 'operations.invalid_health_result' for code in codes)
                if not codes:
                    issues.append('operations.monitor_unhealthy')
    except Exception:
        issues.append('operations.private_probe_unavailable')
    backups = list((root / 'backups').glob('data-*.settlens'))
    if not backups or now - max(path.stat().st_mtime for path in backups) > 36 * 3600:
        issues.append('operations.backup_stale')
    if (root / 'ops' / 'backup-failed').exists():
        issues.append('operations.backup_failed')
    return sorted(set(issues))


def main():
    os.umask(0o077)
    now = time.time()
    path = ROOT / 'ops' / 'watchdog-state.json'
    try:
        previous = json.loads(path.read_text()) if path.exists() else {}
    except Exception:
        previous = {}
    issues = probe(ROOT, now)
    state = {**previous, 'version': 1, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'issues': issues, 'healthy': not issues}
    if delivery_due(previous, issues, now):
        state['lastNotificationAttempt'] = now
        state['mailAccepted'] = send_owner_mail(ROOT / 'site' / '.env', issues)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state) + '\n')
    os.replace(temporary, path)
    print(json.dumps({'healthy': not issues, 'issues': issues, 'mailAccepted': state.get('mailAccepted')}))
    return 0 if not issues else 1


if __name__ == '__main__':
    sys.exit(main())
