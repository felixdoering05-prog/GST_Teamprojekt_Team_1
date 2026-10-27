#!/usr/bin/env python3
"""Set the existing D21 reverse-proxy upload limit. Does not change routes or access protection."""
from pathlib import Path
import re, subprocess, datetime
paths=[Path('/etc/nginx/conf.d/d21.conf'),Path('/etc/nginx/conf.d/d21-tunnel.conf')]
originals={p:p.read_text() for p in paths}
for p,content in originals.items():
    if not re.search(r'client_max_body_size\s+\S+;',content):
        raise SystemExit(f'Existing explicit upload limit missing in {p}; inspect before changing.')
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
try:
    for p,content in originals.items():
        p.with_name(p.name+'.before-files-'+stamp).write_text(content)
        p.write_text(re.sub(r'client_max_body_size\s+\S+;', 'client_max_body_size 26m;', content))
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
    for p,content in originals.items(): p.write_text(content)
    subprocess.run(['nginx','-t'],check=False)
    raise
print('Existing D21 proxy limits set to 26 MB; API enforces 25 MB per file.')
