#!/bin/sh
# Installed as d21-deploy on the host. Never remove the database or its volume.
set -eu
cd "${D21_REPO_DIR:-/opt/gst}"
git pull --ff-only
cd dashboard
docker-compose -p d21 rm -sf api web plan-worker
docker-compose -p d21 up --build -d
