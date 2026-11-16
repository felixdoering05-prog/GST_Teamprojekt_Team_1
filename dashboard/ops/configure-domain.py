#!/usr/bin/env python3
"""Public project landing page only; no app/dashboard migration."""
from pathlib import Path
import argparse
import shutil
import socket
import subprocess

DOMAIN = 'kitrifftgebäude.de'.encode('idna').decode()
WWW = 'www.' + DOMAIN
SERVER_IP = '185.56.151.249'
WEBROOT = Path('/var/www/letsencrypt')
CONFIG = Path('/etc/nginx/conf.d/kitrifftgebaeude.conf')
CERT_DIR = Path('/etc/letsencrypt/live') / DOMAIN


def render(include_tls=True, include_www=False):
    names = DOMAIN + (' ' + WWW if include_www else '')
    http = f'''# D21 managed domain {DOMAIN} — public landing page only
server {{
 listen 80;
 server_name {names};
 location ^~ /.well-known/acme-challenge/ {{
  root {WEBROOT};
  default_type text/plain;
 }}
 location / {{ return 301 https://{DOMAIN}$request_uri; }}
}}
'''
    if not include_tls:
        return http
    www = f'''server {{
 listen 443 ssl http2;
 server_name {WWW};
 ssl_certificate {CERT_DIR}/fullchain.pem;
 ssl_certificate_key {CERT_DIR}/privkey.pem;
 return 301 https://{DOMAIN}$request_uri;
}}
''' if include_www else ''
    return http + www + f'''server {{
 listen 443 ssl http2;
 server_name {DOMAIN};
 ssl_certificate {CERT_DIR}/fullchain.pem;
 ssl_certificate_key {CERT_DIR}/privkey.pem;
 add_header Strict-Transport-Security "max-age=86400" always;
 auth_basic off;
 location ^~ /api/ {{ return 404; }}
 location ^~ /app-api/ {{ return 404; }}
 location = /datenschutz.html {{
  limit_except GET HEAD {{ deny all; }}
  proxy_pass http://127.0.0.1:8088/datenschutz.html;
 }}
 location ^~ /projekt/ {{
  limit_except GET HEAD {{ deny all; }}
  proxy_pass http://127.0.0.1:8088/projekt/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
 }}
 location / {{
  limit_except GET HEAD {{ deny all; }}
  proxy_pass http://127.0.0.1:8088/projekt/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
 }}
}}
'''


def resolves_here(name):
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(name, 443)}
    except socket.gaierror:
        return False
    return addresses == {SERVER_IP}


def write_config(text):
    temporary = CONFIG.with_suffix('.conf.pending')
    temporary.write_text(text)
    temporary.replace(CONFIG)


def restore(previous):
    if previous is None:
        CONFIG.unlink(missing_ok=True)
    else:
        write_config(previous)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)


def activate(text, previous):
    write_config(text)
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        restore(previous)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not resolves_here(DOMAIN):
        raise SystemExit(f'{DOMAIN}: A muss nur auf {SERVER_IP} zeigen; auch abweichende AAAA-Eintraege pruefen. Keine Serveraenderung.')
    include_www = resolves_here(WWW)
    names = [DOMAIN] + ([WWW] if include_www else [])
    if not args.apply:
        print('Bereit: oeffentliche Landingpage, kein App-/Dashboard-Umzug. Mit --apply aktivieren.')
        return
    previous = CONFIG.read_text() if CONFIG.exists() else None
    if previous is not None and 'D21 managed domain' not in previous:
        raise SystemExit(f'{CONFIG} wird nicht von diesem Skript verwaltet; nichts geaendert.')
    if previous is not None:
        shutil.copy2(CONFIG, CONFIG.with_name(CONFIG.name + '.before-update'))
    WEBROOT.mkdir(parents=True, exist_ok=True)
    try:
        if not (CERT_DIR / 'fullchain.pem').exists():
            activate(render(False, include_www), previous)
        certbot = ['certbot', 'certonly', '--webroot', '-w', str(WEBROOT), '--cert-name', DOMAIN,
                   '--non-interactive', '--agree-tos', '--register-unsafely-without-email',
                   '--keep-until-expiring', '--expand', '--deploy-hook', 'systemctl reload nginx']
        for name in names:
            certbot += ['-d', name]
        subprocess.run(certbot, check=True)
        activate(render(True, include_www), previous)
    except Exception:
        restore(previous)
        raise
    print(f'Aktiv: https://{DOMAIN}/ — oeffentliche Landingpage. App und Dashboard verwenden weiter den bisherigen Zugang.')


if __name__ == '__main__':
    main()
