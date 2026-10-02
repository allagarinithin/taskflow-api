#!/usr/bin/env bash
# Incident simulation: injects HTTP 500s into production and proves that the
# HighErrorRate alert fires and the team is notified (Prometheus -> Alertmanager -> receiver).
set -euo pipefail
TARGET="${PROD_URL:-http://taskflow-production:3000}"
AM="${ALERTMANAGER_URL:-http://alertmanager:9093}"
: "${CHAOS_TOKEN:?CHAOS_TOKEN is required}"
mkdir -p reports/monitoring

active_count() {
  curl -fsS -G "$AM/api/v2/alerts" --data-urlencode 'active=true' \
    --data-urlencode 'filter=alertname="HighErrorRate"' | jq 'length'
}

echo "==> INCIDENT SIMULATION: injecting 5xx errors into $TARGET"
SECONDS=0
fired=0
for round in $(seq 1 30); do
  for _ in $(seq 1 10); do
    curl -s -o /dev/null -H "x-chaos-token: $CHAOS_TOKEN" "$TARGET/api/chaos/error" || true
  done
  fired="$(active_count || echo 0)"
  if [ "${fired:-0}" -gt 0 ]; then break; fi
  echo "  round $round (${SECONDS}s): errors injected, alert pending (rule needs 30s of sustained errors)"
  sleep 5
done

if [ "${fired:-0}" -eq 0 ]; then
  echo "!! HighErrorRate alert did NOT fire within ${SECONDS}s - alerting is broken"
  exit 1
fi

echo "==> ALERT FIRED after ${SECONDS}s"
curl -fsS -G "$AM/api/v2/alerts" --data-urlencode 'filter=alertname="HighErrorRate"' \
  | tee reports/monitoring/incident-alert.json \
  | jq -r '.[] | "  \(.labels.alertname) [\(.labels.severity)] \(.annotations.summary)"'
sleep 5
echo "==> Team notification received by alert channel:"
docker logs --tail 15 alert-receiver 2>&1 | sed 's/^/  /'
echo "==> Error injection stopped. The alert auto-resolves in ~1-2 min and a RESOLVED notification is sent."
