#!/bin/sh
# Installed as d21-deploy on the host. Never remove the database or its volume.
set -eu
umask 077
exec 9>/var/lock/d21-deploy.lock
flock -w 1800 9
cd "${D21_REPO_DIR:-/opt/gst}"
git fetch origin main
target=$(git rev-parse FETCH_HEAD)
if [ -n "${D21_DEPLOY_COMMIT:-}" ] && [ "$target" != "$D21_DEPLOY_COMMIT" ]; then
    echo 'SKIPPED: main has advanced; only its latest tested commit may deploy.'
    exit 0
fi
git diff --quiet && git diff --cached --quiet
git merge --ff-only "$target"
cd dashboard
# The lock covers backup, build, replacement and health checks, including manual deployments.
mkdir -p /var/backups/d21 /var/lib/d21-deploy
if [ "$(cat /var/lib/d21-deploy/last-successful-commit 2>/dev/null || true)" = "$target" ] && curl -fsS --max-time 15 http://127.0.0.1:8088/api/health >/dev/null; then
    echo "ALREADY_DEPLOYED: $target"
    exit 0
fi
database_id=$(docker-compose -p d21 ps -q db)
test -n "$database_id"
backup="/var/backups/d21/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$target.dump"
docker-compose -p d21 exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
test -s "$backup"
docker-compose -p d21 exec -T db pg_restore --list < "$backup" >/dev/null
echo "BACKUP_VERIFIED: $backup"
# Build while the previous application is still serving requests.
docker-compose -p d21 build
docker-compose -p d21 rm -sf api web plan-worker ifc-worker
docker-compose -p d21 up --no-build --no-deps -d api web plan-worker ifc-worker
test "$(docker-compose -p d21 ps -q db)" = "$database_id"
attempt=0
until curl -fsS --max-time 10 http://127.0.0.1:8088/api/health >/dev/null; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 24 ] || { echo 'ERROR: application health check failed'; exit 1; }
    sleep 5
done
for service in api web plan-worker ifc-worker; do
    container=$(docker-compose -p d21 ps -q "$service")
    test -n "$container"
    test "$(docker inspect -f '{{.State.Running}}' "$container")" = true
done
curl -fsS --max-time 20 https://nala-solutions.de/api/health >/dev/null
curl -fsS --max-time 20 https://nala-solutions.de/ >/dev/null
printf '%s\n' "$target" > /var/lib/d21-deploy/last-successful-commit
echo "DEPLOYED: $target (database preserved, health checks passed)"
