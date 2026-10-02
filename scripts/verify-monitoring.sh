#!/usr/bin/env bash
# Verifies the monitoring stack end-to-end and prints a live production health snapshot.
set -euo pipefail
PROM="${PROMETHEUS_URL:-http://prometheus:9090}"
AM="${ALERTMANAGER_URL:-http://alertmanager:9093}"
GRAFANA="${GRAFANA_URL:-http://grafana:3000}"
JOB="taskflow-production"
mkdir -p reports/monitoring

wait_for() {  # $1 name, $2 url
  for _ in $(seq 1 40); do
    if curl -fsS -m 3 "$2" >/dev/null 2>&1; then echo "  [ok] $1 is up"; return 0; fi
    sleep 3
  done
  echo "  [FAIL] $1 did not become ready ($2)"; return 1
}
promq() {  # instant query -> first value (or n/a)
  curl -fsS -G "$PROM/api/v1/query" --data-urlencode "query=$1" | jq -r '.data.result[0].value[1] // "n/a"'
}

echo "==> Monitoring stack"
wait_for Prometheus   "$PROM/-/ready"
wait_for Alertmanager "$AM/-/ready"
wait_for Grafana      "$GRAFANA/api/health"

echo "==> Waiting for Prometheus to scrape production"
up="0"
for _ in $(seq 1 20); do
  up="$(promq "up{job=\"$JOB\"}")"
  [ "$up" = "1" ] && break
  sleep 3
done
if [ "$up" != "1" ]; then
  echo "  [FAIL] production target is not up"
  curl -fsS "$PROM/api/v1/targets" | jq '.data.activeTargets[] | {job: .labels.job, health, lastError}'
  exit 1
fi
echo "  [ok] production target scraped successfully"

live_version="$(curl -fsS -G "$PROM/api/v1/query" --data-urlencode "query=taskflow_app_info{job=\"$JOB\"}" | jq -r '.data.result[0].metric.version // "n/a"')"
rules="$(curl -fsS "$PROM/api/v1/rules" | jq '[.data.groups[].rules[]] | length')"
[ "$rules" -ge 1 ] || { echo "  [FAIL] no alert rules loaded"; exit 1; }

echo "==> Live production snapshot"
printf '  %-28s %s\n' "Release being monitored" "$live_version"
printf '  %-28s %s\n' "Expected release" "${IMAGE_TAG:-n/a}"
printf '  %-28s %s\n' "Alert rules loaded" "$rules"
printf '  %-28s %s\n' "Request rate (req/s, 5m)" "$(promq "sum(rate(http_requests_total{job=\"$JOB\"}[5m]))")"
printf '  %-28s %s\n' "5xx error ratio (5m)" "$(promq "sum(rate(http_requests_total{job=\"$JOB\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"$JOB\"}[5m]))")"
printf '  %-28s %s\n' "p95 latency (s, 5m)" "$(promq "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job=\"$JOB\"}[5m])))")"
printf '  %-28s %s\n' "Resident memory (bytes)" "$(promq "process_resident_memory_bytes{job=\"$JOB\"}")"
echo "==> Currently firing alerts"
curl -fsS "$AM/api/v2/alerts?active=true" | jq -r 'if length == 0 then "  none" else .[] | "  \(.labels.alertname) [\(.labels.severity)] \(.labels.job // "")" end'

curl -fsS "$PROM/api/v1/targets" | jq '{targets: [.data.activeTargets[] | {job: .labels.job, health}]}' > reports/monitoring/targets.json
echo "==> Monitoring verified. Grafana: http://localhost:3002  Prometheus: http://localhost:9090  Alertmanager: http://localhost:9093"
