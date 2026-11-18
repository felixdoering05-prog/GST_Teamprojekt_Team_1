#!/bin/sh
# Install as /usr/local/bin/d21-auto-deploy. Used only as an SSH forced command.
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
    'deploy '*) commit=${SSH_ORIGINAL_COMMAND#deploy } ;;
    *) echo 'Only deploy <full commit SHA> is permitted.' >&2; exit 64 ;;
esac
case "$commit" in ''|*[!a-f0-9]*) exit 64 ;; esac
[ "${#commit}" -eq 40 ] || exit 64
export D21_REPO_DIR=/opt/gst D21_DEPLOY_COMMIT="$commit"
exec /usr/local/bin/d21-deploy
