#!/usr/bin/env bash
# One-off SonarQube configuration as code: project, custom quality gate,
# "new code" definition (trend tracking) and the Jenkins webhook.
# Usage (from your machine):  SONAR_ADMIN_TOKEN=<admin user token> bash scripts/sonar-setup.sh
set -uo pipefail
SONAR_URL="${SONAR_URL:-http://localhost:9000}"
: "${SONAR_ADMIN_TOKEN:?export SONAR_ADMIN_TOKEN=<token generated for the admin user>}"
PROJECT_KEY="taskflow-api"
GATE="TaskFlow Gate"
JENKINS_WEBHOOK="${JENKINS_WEBHOOK:-http://jenkins:8080/sonarqube-webhook/}"

api() { local method="$1" endpoint="$2"; shift 2; curl -fsS -u "${SONAR_ADMIN_TOKEN}:" -X "$method" "$SONAR_URL/api/$endpoint" "$@"; }

echo "==> Waiting for SonarQube at $SONAR_URL"
until curl -fsS "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; do sleep 5; done

api POST projects/create --data-urlencode "project=$PROJECT_KEY" --data-urlencode "name=TaskFlow API" >/dev/null \
  && echo "  + project $PROJECT_KEY" || echo "  = project already exists"
api POST qualitygates/create --data-urlencode "name=$GATE" >/dev/null \
  && echo "  + quality gate '$GATE'" || echo "  = quality gate already exists"

add_condition() {  # metric op threshold
  if api POST qualitygates/create_condition --data-urlencode "gateName=$GATE" \
       --data-urlencode "metric=$1" --data-urlencode "op=$2" --data-urlencode "error=$3" >/dev/null 2>&1; then
    echo "  + condition: $1 $2 $3"
  else
    echo "  = condition $1 skipped (exists or not supported by this SonarQube mode)"
  fi
}
echo "==> Quality gate conditions"
add_condition coverage LT 80
add_condition new_coverage LT 80
add_condition duplicated_lines_density GT 3
add_condition new_duplicated_lines_density GT 3
add_condition new_violations GT 5
# Ratings: 1 = A. Standard-mode and MQR-mode metric names (whichever this server supports)
add_condition sqale_rating GT 1
add_condition reliability_rating GT 1
add_condition security_rating GT 1
add_condition software_quality_maintainability_rating GT 1
add_condition software_quality_reliability_rating GT 1
add_condition software_quality_security_rating GT 1

api POST qualitygates/select --data-urlencode "gateName=$GATE" --data-urlencode "projectKey=$PROJECT_KEY" >/dev/null \
  && echo "  + gate assigned to project"
api POST new_code_periods/set --data-urlencode "project=$PROJECT_KEY" --data-urlencode "type=PREVIOUS_VERSION" >/dev/null \
  && echo "  + new code = changes since previous version (enables trend tracking)"

if api GET webhooks/list | grep -q "$JENKINS_WEBHOOK"; then
  echo "  = Jenkins webhook already configured"
else
  api POST webhooks/create --data-urlencode "name=Jenkins" --data-urlencode "url=$JENKINS_WEBHOOK" >/dev/null \
    && echo "  + webhook -> $JENKINS_WEBHOOK"
fi
echo "==> SonarQube configured"
