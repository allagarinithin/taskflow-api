#!/usr/bin/env bash
# Sends a pipeline notification to the team alert channel (alert-receiver, optionally forwarded to Slack).
STATUS="${1:-INFO}"
MESSAGE="${2:-}"
payload="$(jq -n --arg s "$STATUS" --arg j "${JOB_NAME:-local}" --arg b "${BUILD_NUMBER:-0}" \
  --arg u "${BUILD_URL:-}" --arg m "$MESSAGE" '{status:$s, job:$j, build:$b, url:$u, message:$m}')"
curl -fsS -m 5 -X POST -H 'Content-Type: application/json' -d "$payload" \
  "${ALERT_WEBHOOK:-http://alert-receiver:5001/jenkins}" >/dev/null \
  && echo "Team notified: [$STATUS] $MESSAGE" \
  || echo "WARN: alert channel unreachable (monitoring stack not running yet?)"
exit 0
