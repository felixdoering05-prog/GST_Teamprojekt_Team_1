#!/bin/sh
set -eu
# Import just once: restarts/deployments must not overwrite editor changes or poll state.
marker=/home/node/.n8n/d21-bootstrap-v1.done
if [ ! -f "$marker" ]; then
  n8n import:workflow --separate --input=/opt/d21-workflows
  n8n publish:workflow --id=D21GithubMonitor1
  n8n publish:workflow --id=D21HealthMonitor1
  n8n export:workflow --all --output=/home/node/.n8n/d21-bootstrap-check.json
  node -e 'const fs = require("fs"); const w = JSON.parse(fs.readFileSync(process.argv[1])); for (const id of ["D21GithubMonitor1", "D21HealthMonitor1"]) { if (!w.some(x => x.id === id && x.active)) throw new Error("Workflow nicht veröffentlicht: " + id); }' /home/node/.n8n/d21-bootstrap-check.json
  rm /home/node/.n8n/d21-bootstrap-check.json
  touch "$marker"
fi
exec n8n start
