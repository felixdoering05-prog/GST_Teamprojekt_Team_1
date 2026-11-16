#!/usr/bin/env python3
"""Publish the account-authenticated dashboard at a supported project domain; keep the landing domain separate."""
from pathlib import Path
import argparse
import shutil
import socket
import subprocess

DOMAIN = 'titanfs.de'
WWW = 'www.' + DOMAIN
SERVER_IP = '185.56.151.249'
WEBROOT = Path('/var/www/letsencrypt')
CONFIG = Path('/etc/nginx/conf.d/titanfs.conf')
CERT_DIR = Path('/etc/letsencrypt/live') / DOMAIN
MARKER = '# D21 managed dashboard domain titanfs.de'


SUPPORTED_DOMAINS = ('titanfs.de', 'nala-solutions.de')


def select_domain(name):
    """Select an isolated host configuration; never overwrite another domain's file/certificate."""
    if name not in SUPPORTED_DOMAINS:
        raise ValueError('Unsupported dashboard domain')
    global DOMAIN, WWW, CONFIG, CERT_DIR, MARKER
    DOMAIN = name
    WWW = 'www.' + name
    CONFIG = Path('/etc/nginx/conf.d') / (name.removesuffix('.de') + '.conf')
    CERT_DIR = Path('/etc/letsencrypt/live') / name
    MARKER = '# D21 managed dashboard domain ' + name


def render(include_tls=True, include_www=False):
    names = DOMAIN + (' ' + WWW if include_www else '')
    config = f'''{MARKER}
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
        return config
    if include_www:
        config += f'''server {{
 listen 443 ssl http2;
 server_name {WWW};
 ssl_certificate {CERT_DIR}/fullchain.pem;
 ssl_certificate_key {CERT_DIR}/privkey.pem;
 return 301 https://{DOMAIN}$request_uri;
}}
'''
    return config + f'''server {{
 listen 443 ssl http2;
 server_name {DOMAIN};
 ssl_certificate {CERT_DIR}/fullchain.pem;
 ssl_certificate_key {CERT_DIR}/privkey.pem;
 client_max_body_size 26m;
 add_header Strict-Transport-Security "max-age=86400" always;
 # The website uses its existing account/session authentication, without a Basic-Auth popup.
 auth_basic off;
 location ^~ /api/v1/ {{
  proxy_pass http://127.0.0.1:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Authorization "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 125s;
 }}
 location ^~ /app-api/v1/ {{
  proxy_pass http://127.0.0.1:8088/api/v1/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Authorization "";
  proxy_set_header X-Forwarded-For "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 125s;
 }}
 location = /api/health {{ proxy_pass http://127.0.0.1:8088; }}
 location ^~ /api/ {{ return 404; }}
 location / {{
  proxy_pass http://127.0.0.1:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Authorization "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 125s;
 }}
}}
'''


def resolves_here(name):
    try:
        return {info[4][0] for info in socket.getaddrinfo(name, 443)} == {SERVER_IP}
    except socket.gaierror:
        return False


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
    parser.add_argument('--domain', choices=SUPPORTED_DOMAINS, default='titanfs.de')
    args = parser.parse_args()
    if args.domain != DOMAIN:
        select_domain(args.domain)
    if not resolves_here(DOMAIN):
        raise SystemExit(f'{DOMAIN}: A muss nur auf {SERVER_IP} zeigen; abweichende AAAA-Eintraege entfernen. Keine Serveraenderung.')
    include_www = resolves_here(WWW)
    if not args.apply:
        print(f'Bereit: Dashboard mit Account-Anmeldung auf https://{DOMAIN}. Mit --apply aktivieren.')
        return
    previous = CONFIG.read_text() if CONFIG.exists() else None
    if previous is not None and MARKER not in previous:
        raise SystemExit(f'{CONFIG} wird nicht von diesem Skript verwaltet; nichts geaendert.')
    # Verify that the existing website service is available before changing public routing.
    with socket.create_connection(('127.0.0.1', 8088), timeout=5):
        pass
    if previous is not None:
        shutil.copy2(CONFIG, CONFIG.with_name(CONFIG.name + '.before-update'))
    WEBROOT.mkdir(parents=True, exist_ok=True)
    try:
        if not (CERT_DIR / 'fullchain.pem').exists():
            activate(render(False, include_www), previous)
        certbot = ['certbot', 'certonly', '--webroot', '-w', str(WEBROOT), '--cert-name', DOMAIN,
                   '--non-interactive', '--agree-tos', '--register-unsafely-without-email',
                   '--keep-until-expiring', '--expand', '--deploy-hook', 'systemctl reload nginx']
        for name in [DOMAIN] + ([WWW] if include_www else []):
            certbot += ['-d', name]
        subprocess.run(certbot, check=True)
        activate(render(True, include_www), previous)
    except Exception:
        restore(previous)
        raise
    print(f'Aktiv: https://{DOMAIN}/ — Dashboard mit Account-Anmeldung. Landingpage und bisheriger App-Zugang bleiben erhalten.')


if __name__ == '__main__':
    main()
