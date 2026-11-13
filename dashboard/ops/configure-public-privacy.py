#!/usr/bin/env python3
"""Make only /datenschutz.html publicly reachable (App Store privacy URL); keep the website password gate."""
from pathlib import Path
import argparse
import shutil
import subprocess

MARKER = ' # D21 managed public privacy page'
BLOCK = ''' # D21 managed public privacy page
 location = /datenschutz.html {
  auth_basic off;
  limit_except GET HEAD { deny all; }
  proxy_pass http://127.0.0.1:8088/datenschutz.html;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Authorization "";
  proxy_set_header Cookie "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 15s;
 }
'''

def render(config):
    if MARKER in config:
        if BLOCK not in config:
            raise ValueError('Existing privacy page block differs; inspect before changing it.')
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
        print('Ready: only /datenschutz.html becomes public; website password gate remains. Use --apply to activate.')
    elif updated == original:
        subprocess.run(['nginx', '-t'], check=True)
        print('Public privacy page already configured.')
    else:
        backup = path.with_name(path.name + '.before-public-privacy')
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
        print('Public privacy page active; website access unchanged.')
