#!/usr/bin/env bash
# Carry the current commit to a service and wait until it is standing.
#
# A commit is not a deployment: the automatic hook has been unreliable, and a
# change that never reaches the server is a change that did not happen. So the
# deploy is asked for explicitly, and this waits to see it live rather than
# assuming.
set -euo pipefail
SERVICE="${1:?which service}"
: "${RENDER_API_KEY:?no key — cannot reach Render}"
API="https://api.render.com/v1/services/$SERVICE"

dep=$(curl -fsS -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" "$API/deploys" -d '{}' \
  | grep -oE '"id":"dep-[a-z0-9]+"' | head -1 | cut -d'"' -f4)
[ -n "$dep" ] || { echo "Render did not accept the deploy"; exit 1; }
echo "deploy $dep"

for _ in $(seq 1 60); do
  s=$(curl -fsS -H "Authorization: Bearer $RENDER_API_KEY" "$API/deploys/$dep" \
    | grep -oE '"status":"[a-z_]+"' | head -1 | cut -d'"' -f4)
  case "$s" in
    live) echo "standing"; exit 0 ;;
    build_failed|update_failed|canceled|pre_deploy_failed) echo "deploy $s"; exit 1 ;;
  esac
  sleep 15
done
echo "the deploy never settled"; exit 1
