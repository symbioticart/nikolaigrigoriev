#!/usr/bin/env bash
# Carry THIS commit to a service and wait until it is the one standing.
#
# A commit is not a deployment: the automatic hook has been unreliable, and a
# change that never reaches the server is a change that did not happen. So the
# deploy is asked for explicitly, and this waits to see it live rather than
# assuming.
#
# It also names the commit, which it did not use to. On 15 August the morning
# job pushed the day's paintings and asked for a deploy three seconds later;
# Render resolved the branch on its own and built the commit before it. The
# deploy went green, the site carried yesterday's paintings for a whole day, and
# nothing in the pipeline could tell, because "it deployed" was measured as
# `status == live` and never as "live on what".
set -euo pipefail
SERVICE="${1:?which service}"
: "${RENDER_API_KEY:?no key — cannot reach Render}"
API="https://api.render.com/v1/services/$SERVICE"

SHA="${2:-$(git rev-parse HEAD)}"
SHORT="${SHA:0:7}"
echo "asking for $SHORT"

dep=$(curl -fsS -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" "$API/deploys" \
  -d "{\"commitId\":\"$SHA\"}" \
  | grep -oE '"id":"dep-[a-z0-9]+"' | head -1 | cut -d'"' -f4)
[ -n "$dep" ] || { echo "Render did not accept the deploy"; exit 1; }
echo "deploy $dep"

for _ in $(seq 1 60); do
  s=$(curl -fsS -H "Authorization: Bearer $RENDER_API_KEY" "$API/deploys/$dep" \
    | grep -oE '"status":"[a-z_]+"' | head -1 | cut -d'"' -f4)
  case "$s" in
    live) echo "standing"; break ;;
    build_failed|update_failed|canceled|pre_deploy_failed) echo "deploy $s"; exit 1 ;;
  esac
  sleep 15
done
[ "${s:-}" = "live" ] || { echo "the deploy never settled"; exit 1; }

# And prove it. The site reports the commit it is running; if that is not the
# one we asked for, the deploy succeeded at carrying the wrong thing.
if [ -n "${VERIFY_URL:-}" ]; then
  for _ in $(seq 1 20); do
    got=$(curl -fsS -m 20 "$VERIFY_URL/health" 2>/dev/null \
      | grep -oE '"buildSha":"[a-f0-9]+"' | head -1 | cut -d'"' -f4 || true)
    [ "$got" = "$SHORT" ] && { echo "standing on $SHORT"; exit 0; }
    sleep 10
  done
  echo "asked for $SHORT, the site answers ${got:-nothing} — the wrong commit is live"
  exit 1
fi
exit 0
