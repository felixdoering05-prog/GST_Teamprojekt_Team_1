#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Als Serveradministrator ausführen.' >&2; exit 1; }
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -d -m 750 /var/lib/d21-admin
install -d -m 755 /usr/local/libexec
install -m 755 "$source_dir/collect.py" /usr/local/libexec/d21-admin-collect.py
install -m 644 "$source_dir/d21-admin-metrics.service" /etc/systemd/system/d21-admin-metrics.service
install -m 644 "$source_dir/d21-admin-metrics.timer" /etc/systemd/system/d21-admin-metrics.timer
systemctl daemon-reload
systemctl enable --now d21-admin-metrics.timer
systemctl start d21-admin-metrics.service
