#!/usr/bin/env python3
"""Grant the dedicated worker group read-only access to the Gemini key (no key output)."""
import os
from pathlib import Path

if os.geteuid() != 0:
    raise SystemExit('Als Serveradministrator ausführen.')
root = Path(__file__).resolve().parents[1]
config = {}
for line in (root / '.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        name, value = line.split('=', 1)
        config[name] = value.strip().strip('"').strip("'")
directory = Path(config.get('D21_AI_CONFIG_DIR', './private-ai'))
if not directory.is_absolute():
    directory = root / directory
key = directory / 'gemini-api-key'
if key.is_symlink() or not key.is_file() or key.stat().st_uid != 0 or directory.stat().st_uid != 0:
    raise SystemExit('Erwartet wird ein vorhandener, root-eigener Schlüssel in root-eigenem Ordner.')
# Group 61021 exists only in the worker container; other server users get no access.
os.chown(directory, -1, 61021)
os.chmod(directory, 0o710)
os.chown(key, -1, 61021)
os.chmod(key, 0o640)
print('Leserecht für den Plan-Worker eingerichtet. Schlüssel bleibt verborgen.')
