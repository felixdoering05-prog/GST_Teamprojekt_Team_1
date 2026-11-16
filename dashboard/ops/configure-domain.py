#!/usr/bin/env python3
"""Serve the project under the fixed domain kitrifftgebäude.de (Punycode xn--kitrifftgebude-gib.de).

Same routing as the Cloudflare quick tunnel (/etc/nginx/conf.d/d21-tunnel.conf):
- /app-api/v1/ -> web container /api/v1/ (account sessions, no website password)
- /datenschutz.html public (GET/HEAD only)
- everything else behind the existing website password gate.

Steps with --apply:
1. Check that the domain resolves (A record) to this server.
2. Request a Let's Encrypt certificate with certbot's webroot method (nginx config untouched by certbot).
3. Write /etc/nginx/conf.d/kitrifftgebaeude.conf, test, reload; restore the previous state on failure.
The tunnel and the IP-based configuration stay unchanged so older app versions keep working.
"""
from pathlib import Path
import argparse
import importlib.util
import shutil
import socket
import subprocess

DOMAIN = 'kitrifftgebäude.de'.encode('idna').decode()  # xn--kitrifftgebude-gib.de
WWW = 'www.' + DOMAIN
SERVER_IP = '185.56.151.249'
WEBROOT = Path('/var/www/letsencrypt')
CONFIG = Path('/etc/nginx/conf.d/kitrifftgebaeude.conf')
CERT_DIR = Path('/etc/letsencrypt/live') / DOMAIN
OPS = Path(__file__).resolve().parent


def _block(script):
    spec = importlib.util.spec_from_file_location(script.replace('-', '_')[:-3], OPS / script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BLOCK


# Reuse the exact managed blocks of the tunnel so both entry points behave identically.
MOBILE_API = _block('configure-mobile-api.py')
PRIVACY = _block('configure-public-privacy.py')

HTTP_ONLY = f'''# D21 managed domain {DOMAIN} (kitrifftgebäude.de)
server {{
 listen 80;
 server_name {DOMAIN} {WWW};
 location ^~ /.well-known/acme-challenge/ {{
  root {WEBROOT};
  default_type text/plain;
 }}
 location / {{
  return 301 https://{DOMAIN}$request_uri;
 }}
}}
'''


def render(include_tls=True):
    if not include_tls:
        return HTTP_ONLY
    return HTTP_ONLY + f'''server {{
 listen 443 ssl http2;
 server_name {WWW};
 ssl_certificate {CERT_DIR}/fullchain.pem;
 ssl_certificate_key {CERT_DIR}/privkey.pem;
 return 301 https://{DOMAIN}$request_uri;
}}
server {{
 listen 443 ssl http2;
 server_name {DOMAIN};
 ssl_certificate {CERT_DIR}/fullchain.pem;
 ssl_certificate_key {CERT_DIR}/privkey.pem;
 add_header Strict-Transport-Security "max-age=86400" always;
 client_max_body_size 26m;
 auth_basic "D21 Demo";
 auth_basic_user_file /etc/nginx/d21.htpasswd;
{MOBILE_API}{PRIVACY} location / {{
  proxy_pass http://127.0.0.1:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
 }}
}}
'''


def resolves_here(name):
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(name, 443, socket.AF_INET)}
    except socket.gaierror:
        return False
    return addresses == {SERVER_IP}


def activate(text, previous):
    CONFIG.write_text(text)
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        if previous is None:
            CONFIG.unlink(missing_ok=True)
        else:
            CONFIG.write_text(previous)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    names = [DOMAIN] + ([WWW] if resolves_here(WWW) else [])
    if not resolves_here(DOMAIN):
        raise SystemExit(f'{DOMAIN} zeigt noch nicht (nur) auf {SERVER_IP}. Erst den A-Record bei STRATO setzen.')
    if not args.apply:
        print(f'Bereit: Zertifikat für {", ".join(names)} und Proxy wie im Tunnel. Mit --apply aktivieren.')
        raise SystemExit(0)
    previous = CONFIG.read_text() if CONFIG.exists() else None
    if previous is not None and 'D21 managed domain' not in previous:
        raise SystemExit(f'{CONFIG} existiert und wurde nicht von diesem Skript angelegt; nichts geändert.')
    if previous is not None:
        shutil.copy2(CONFIG, CONFIG.with_name(CONFIG.name + '.before-update'))
    WEBROOT.mkdir(parents=True, exist_ok=True)
    if not (CERT_DIR / 'fullchain.pem').exists():
        activate(HTTP_ONLY, previous)
        previous = HTTP_ONLY
    certbot = ['certbot', 'certonly', '--webroot', '-w', str(WEBROOT), '--cert-name', DOMAIN,
               '--non-interactive', '--agree-tos', '--register-unsafely-without-email', '--keep-until-expiring',
               '--deploy-hook', 'systemctl reload nginx']
    for name in names:
        certbot += ['-d', name]
    subprocess.run(certbot, check=True)
    activate(render(), previous)
    print(f'Aktiv: https://{DOMAIN}/app-api/v1/ (Tunnel und IP-Zugang unverändert).')
