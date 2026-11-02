# Official stable image, version 2.45.7, pinned on 2026-11-02.
FROM docker.n8n.io/n8nio/n8n@sha256:9a8d8dcea75667496695d7810d7e1fe018a65efb36cc499d347f3931b3957b5d
COPY --chown=node:node workflows /opt/d21-workflows
COPY --chown=node:node start.sh /opt/d21-start.sh
ENTRYPOINT ["tini", "--", "/bin/sh", "/opt/d21-start.sh"]
