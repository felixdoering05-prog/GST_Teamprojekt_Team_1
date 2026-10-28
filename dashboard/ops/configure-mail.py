#!/usr/bin/env python3
"""Run interactively in /opt/gst/dashboard; never prints credentials or sends mail."""
import getpass
import os
from pathlib import Path
import re
import secrets
import shutil
import tempfile
from datetime import datetime, timezone

def atomic(path, value):
    if path.is_symlink():
        raise SystemExit('Symbolischer Link als Zieldatei wird nicht überschrieben.')
    handle, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(handle, 0o600)
        with os.fdopen(handle, 'w') as stream:
            stream.write(value)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def main():
    root = Path('/opt/gst/dashboard')
    if Path.cwd().resolve() != root or os.geteuid() != 0:
        raise SystemExit('Als root in /opt/gst/dashboard ausführen.')
    env = root / '.env'
    if not env.is_file() or env.is_symlink():
        raise SystemExit('Vorhandene reguläre .env wird benötigt.')
    print('Vorhandenes Absenderkonto einrichten. Das Postfach muss bereits existieren.')
    host = input('SMTP-Server des Anbieters: ').strip()
    port = input('Port (465 oder 587) [465]: ').strip() or '465'
    user = input('SMTP-Benutzername: ').strip()
    sender = input('Absender-E-Mail-Adresse: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9.-]+', host) or port not in ('465', '587'):
        raise SystemExit('Ungültiger SMTP-Server oder Port.')
    if not re.fullmatch(r'[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+', sender) or not user or any(x in user for x in '\r\n$'):
        raise SystemExit('Ungültige Absenderadresse oder Benutzername.')
    password = getpass.getpass('SMTP-/App-Passwort (unsichtbar): ')
    if not password or '\n' in password or '\r' in password:
        raise SystemExit('Ein gültiges SMTP-/App-Passwort wird benötigt.')
    folder = root / 'private-mail'
    if folder.is_symlink():
        raise SystemExit('Symbolischer Link als Geheimnisordner wird nicht verwendet.')
    folder.mkdir(mode=0o700, exist_ok=True)
    folder.chmod(0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = Path('/root/d21-mail-backups') / stamp
    backup.mkdir(mode=0o700, parents=True)
    shutil.copy2(env, backup / '.env')
    (backup / '.env').chmod(0o600)
    for name in ('smtp-password', 'reset-secret'):
        path = folder / name
        if path.is_symlink():
            raise SystemExit('Symbolischer Link als Geheimnisdatei wird nicht überschrieben.')
        if path.exists():
            shutil.copy2(path, backup / name)
            (backup / name).chmod(0o600)
    atomic(folder / 'smtp-password', password)
    if not (folder / 'reset-secret').exists():
        atomic(folder / 'reset-secret', secrets.token_hex(32))
    else:
        (folder / 'reset-secret').chmod(0o600)
    updates = {'SMTP_ENABLED':'true', 'SMTP_HOST':host, 'SMTP_PORT':port, 'SMTP_USER':user, 'MAIL_FROM':sender}
    lines = [line for line in env.read_text().splitlines() if line.split('=', 1)[0].strip() not in updates]
    lines += [f'{key}={value}' for key, value in updates.items()]
    atomic(env, '\n'.join(lines) + '\n')
    print('Einstellungen privat gespeichert. Noch keine Mail verschickt und kein Dienst neu gestartet.')
    print('Zum Aktivieren das vorhandene d21-deploy ausführen und dann mit der eigenen Adresse testen.')

if __name__ == '__main__':
    main()
