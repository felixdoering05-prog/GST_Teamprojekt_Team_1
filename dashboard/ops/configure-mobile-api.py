#!/usr/bin/env python3
"""Publish only the session-protected app API; retain the website password gate."""
from pathlib import Path
import argparse
import shutil
import subprocess

MARKER = ' # D21 managed mobile API'
BLOCK = ''' # D21 managed mobile API
 location ^~ /app-api/v1/ {
  auth_basic off;
  proxy_pass http://127.0.0.1:8088/api/v1/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Authorization "";
  proxy_set_header X-Forwarded-For "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 125s;
 }
'''

def render(config):
    if MARKER in config:
        if BLOCK not in config:
            raise ValueError('Existing mobile API block differs; inspect before changing it.')
        return config
    if config.count(' location / {') != 1 or 'auth_basic_user_file' not in config:
        raise ValueError('Unexpected proxy configuration; no changes applied.')
    return config.replace(' location / {', BLOCK + ' location / {', 1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    path = Path('/etc/nginx/conf.d/d21-tunnel.conf')
    original = path.read_text()
    updated = render(original)
    if not args.apply:
        print('Ready: app API uses account sessions; website password gate remains. Use --apply to activate.')
    elif updated == original:
        subprocess.run(['nginx', '-t'], check=True)
        print('Mobile API already configured.')
    else:
        backup = path.with_name(path.name + '.before-mobile-api')
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(updated)
        try:
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        except Exception:
            path.write_text(original)
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            raise
        print('Mobile API active; website access unchanged.')
