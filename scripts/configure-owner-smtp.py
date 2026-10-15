#!/usr/bin/env python3
"""Run interactively as root on settlens-host. Never reads/copies the existing API token."""
import base64
import getpass
import os
from pathlib import Path
import smtplib
import ssl
import stat
import subprocess
import sys
ENV = Path("/opt/settlens-site/site/.env")
COMPOSE = ["docker", "compose", "-f", "/opt/settlens-site/site/docker-compose.yml"]
OWNER = "contact@settlens.com"

def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        print("Run as root in an interactive SSH terminal; do not pipe a password.")
        return 1
    info = ENV.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o777 != 0o600:
        print("The existing Settlens environment must be a root-owned mode600 regular file.")
        return 1
    password = getpass.getpass("Hostinger app password for contact@settlens.com (hidden): ")
    if not password or len(password.encode("utf8")) > 8000 or any(char in password for char in "\r\n\0"):
        print("Invalid password input; configuration unchanged.")
        return 1
    try:
        with smtplib.SMTP_SSL("smtp.hostinger.com", 465, timeout=10, context=ssl.create_default_context()) as smtp:
            smtp.ehlo()
            smtp.login(OWNER, password)
    except Exception:
        print("Hostinger authentication was not confirmed; configuration unchanged.")
        return 1
    encoded = base64.b64encode(password.encode("utf8")).decode("ascii")
    # Base64 is storage encoding, NOT encryption. It avoids dotenv interpolation of $/#/quotes.
    # O_APPEND leaves all earlier bytes untouched, including SETTLENS_API_TOKEN.
    settings = "\n# Authenticated owner-only SMTP; configured interactively.\n" + "\n".join([
        "SETTLENS_EMAIL_ENABLED=1", "SETTLENS_MAIL_RELAY_URL=", "SMTP_HOST=smtp.hostinger.com",
        "SMTP_PORT=465", "SMTP_USER=" + OWNER, "SMTP_FROM=" + OWNER, "SMTP_PASSWORD_B64=" + encoded,
    ]) + "\n"
    fd = os.open(ENV, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    try:
        with os.fdopen(fd, "a", encoding="utf8") as stream:
            stream.write(settings)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        password = None
        encoded = None
        settings = None
    print("SMTP authentication confirmed; credential saved only in the protected server environment.")
    result = subprocess.run(COMPOSE + ["up", "-d", "--no-deps", "settlens-site"], check=False)
    if result.returncode:
        print("Settlens restart failed; fix its deployment before sending mail.")
        return 1
    print("Only the Settlens service was restarted. No test mail was sent.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
