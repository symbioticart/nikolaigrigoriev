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
# It is interpolated into a JSON body below; anything that is not a commit hash
# has no business being there.
case "$SHA" in
  *[!0-9a-fA-F]* | "") echo "not a commit hash: $SHA"; exit 1 ;;
esac
echo "asking for ${SHA:0:7}"

# `set -e` and pipelines do not mix: a grep that matches nothing kills the whole
# script inside the assignment, so every careful check written below it — the
# empty-response guard, the wait loop, the verification — never runs at all. The
# pipe's failure is swallowed deliberately and the emptiness handled by hand.
field() { grep -oE "\"$1\":\"[^\"]+\"" | head -1 | cut -d'"' -f4 || true; }

dep=$(curl -fsS -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" "$API/deploys" \
  -d "{\"commitId\":\"$SHA\"}" | field id || true)
[ -n "$dep" ] || { echo "Render did not accept the deploy"; exit 1; }
echo "deploy $dep"

status=""
for _ in $(seq 1 60); do
  status=$(curl -fsS -H "Authorization: Bearer $RENDER_API_KEY" "$API/deploys/$dep" | field status || true)
  case "$status" in
    live) break ;;
    build_failed|update_failed|canceled|pre_deploy_failed) echo "deploy $status"; exit 1 ;;
    "") echo "Render did not say — asking again" ;;
  esac
  sleep 15
done
[ "$status" = "live" ] || { echo "the deploy never settled (last status: ${status:-none})"; exit 1; }
echo "standing"

# And prove it. The site reports the commit it is running; if that is not the one
# we asked for, the deploy succeeded at carrying the wrong thing.
if [ -n "${VERIFY_URL:-}" ]; then
  for _ in $(seq 1 20); do
    got=$(curl -fsS -m 20 "$VERIFY_URL/health" 2>/dev/null | field buildCommit || true)
    [ "$got" = "$SHA" ] && { echo "standing on ${SHA:0:7}"; exit 0; }
    sleep 10
  done
  echo "asked for ${SHA:0:7}, the site answers ${got:-nothing} — the wrong commit is live"
  exit 1
fi
exit 0
