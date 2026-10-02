#!/usr/bin/env bash
# Non-destructive production smoke test (no test data written to production).
# Usage: smoke-test.sh <base-url> [expected-version]
set -euo pipefail
BASE="${1:?usage: smoke-test.sh <base-url> [expected-version]}"
EXPECTED="${2:-}"
fail() { echo "SMOKE FAIL: $1"; exit 1; }

health="$(curl -fsS -m 5 "$BASE/health")" || fail "/health unreachable"
version="$(echo "$health" | jq -r .version)"
echo "  /health -> $health"
[ -z "$EXPECTED" ] || [ "$version" = "$EXPECTED" ] || fail "expected version $EXPECTED but got $version"

[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/ready")" = "200" ] || fail "/ready not 200"
echo "  /ready  -> 200"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tasks")" = "401" ] || fail "API not protected"
echo "  /api/tasks (anonymous) -> 401 (auth enforced)"
curl -fsS "$BASE/metrics" | grep -q taskflow_app_info || fail "/metrics missing app info"
echo "  /metrics -> exposes taskflow_app_info"
echo "SMOKE PASS: $BASE is serving $version"
