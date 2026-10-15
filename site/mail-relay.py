#!/usr/bin/env python3
"""Settlens-only TLS relay. Only the configured peer and recipient are allowed."""
import hashlib
import hmac
import json
import os
import re
import smtplib
import socket
import ssl
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from uuid import uuid4

RECIPIENT = "contact@settlens.com"
MAX_BODY = 65536
EMAIL = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")


def validate_message(value):
    if not isinstance(value, dict) or set(value) - {"subject", "text", "replyTo"}:
        raise ValueError("Invalid message fields")
    subject = value.get("subject")
    text = value.get("text")
    if not isinstance(subject, str) or len(subject) > 200 or "\r" in subject or "\n" in subject or not re.match(r"^\[Settlens\]\[(PILOTE|ALERTE|TEST|ACCES)\] ", subject):
        raise ValueError("Invalid subject")
    if not isinstance(text, str) or len(text) > 50000:
        raise ValueError("Invalid text")
    reply = value.get("replyTo")
    if reply is not None and (not isinstance(reply, str) or len(reply) > 320 or not EMAIL.fullmatch(reply)):
        raise ValueError("Invalid reply address")
    message = EmailMessage()
    message["From"] = RECIPIENT
    message["To"] = RECIPIENT
    message["Subject"] = subject
    message["Message-ID"] = "<settlens-" + uuid4().hex + "@settlens.com>"
    if reply:
        message["Reply-To"] = reply
    message.set_content(text)
    return message


def deliver(message):
    # Resolve IPv4 explicitly: this host has a usable IPv4 SMTP route.
    host = "mx1.hostinger.com"
    with smtplib.SMTP(socket.gethostbyname(host), 25, timeout=10) as client:
        client._host = host  # TLS validates the MX hostname, not its resolved IP.
        client.ehlo()
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
        if client.send_message(message, from_addr=RECIPIENT, to_addrs=[RECIPIENT]):
            raise RuntimeError("Recipient rejected")


def make_handler(token, sender=deliver):
    expected = hashlib.sha256(token.encode()).digest()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # No request, credential or message logging.

        def respond(self, status):
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_POST(self):
            if self.path != "/email":
                return self.respond(404)
            received = self.headers.get("Authorization", "")
            if not received.startswith("Bearer ") or not hmac.compare_digest(expected, hashlib.sha256(received[7:].encode()).digest()):
                return self.respond(401)
            if self.headers.get_content_type() != "application/json":
                return self.respond(415)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_BODY:
                    return self.respond(413)
                payload = self.rfile.read(length)
                if len(payload) != length:
                    return self.respond(400)
                message = validate_message(json.loads(payload))
            except (ValueError, TypeError):
                return self.respond(400)
            try:
                sender(message)
            except Exception:
                print("Settlens mail relay delivery failed", flush=True)
                return self.respond(502)
            self.respond(202)

    return Handler


class RestrictedServer(HTTPServer):
    def __init__(self, address, handler, context, peer):
        self.context, self.peer = context, peer
        self.buckets = {}
        super().__init__(address, handler)

    def get_request(self):
        conn, address = super().get_request()
        conn.settimeout(15)
        now = time.monotonic()
        start, count = self.buckets.get(address[0], (now, 0))
        if now - start >= 60:
            start, count = now, 0
        if address[0] != self.peer or count >= 30:
            conn.close()
            raise OSError("Peer not allowed or rate limited")
        self.buckets[address[0]] = (start, count + 1)
        try:
            return self.context.wrap_socket(conn, server_side=True), address
        except Exception:
            conn.close()
            raise


def main():
    credentials = Path(os.environ["CREDENTIALS_DIRECTORY"])
    token = (credentials / "relay-token").read_text().strip()
    if len(token) < 32:
        raise ValueError("Invalid relay credential")
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain("/opt/settlens-mail-relay/relay-ca.pem", credentials / "tls-key")
    server = RestrictedServer(("127.0.0.1", 3339), make_handler(token), context, "127.0.0.1")
    print("Settlens mail relay ready", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
