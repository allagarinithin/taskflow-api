#!/usr/bin/env bash
# Zero-touch deployment with health verification and automatic rollback.
# Usage: deploy.sh <staging|production> <image-tag>
# Env:   JWT_SECRET, CHAOS_TOKEN (from Jenkins credentials)
#        JWT_SECRET_OVERRIDE (optional, used only by the rollback drill)
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <staging|production> <image-tag>}"
NEW_TAG="${2:?usage: deploy.sh <staging|production> <image-tag>}"
case "$ENVIRONMENT" in staging|production) ;; *) echo "Unknown environment: $ENVIRONMENT"; exit 2 ;; esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../deploy/docker-compose.${ENVIRONMENT}.yml"
CONTAINER="taskflow-${ENVIRONMENT}"
HEALTH_URL="http://${CONTAINER}:3000/health"
STATE_DIR="${DEPLOY_STATE_DIR:-${JENKINS_HOME:-$HOME}/deploy-state}"
STATE_FILE="$STATE_DIR/${ENVIRONMENT}.tag"
HISTORY_FILE="$STATE_DIR/${ENVIRONMENT}.history"
mkdir -p "$STATE_DIR"
PREVIOUS_TAG="$(cat "$STATE_FILE" 2>/dev/null || true)"

compose_up() {  # $1 = image tag, $2 = JWT secret
  IMAGE_TAG="$1" JWT_SECRET="$2" docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
}

health_check() {  # waits until /health reports exactly the expected version
  local expected="$1" body version
  for attempt in $(seq 1 30); do
    body="$(curl -fsS -m 3 "$HEALTH_URL" 2>/dev/null || true)"
    version="$(echo "$body" | jq -r '.version // empty' 2>/dev/null || true)"
    if [ "$version" = "$expected" ]; then
      echo "    healthy after ${attempt} check(s): $body"
      return 0
    fi
    echo "    waiting for $CONTAINER ($attempt/30) - reported version: '${version:-none}'"
    sleep 2
  done
  return 1
}

log_history() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 $2 (build ${BUILD_NUMBER:-manual})" >> "$HISTORY_FILE"; }

echo "==> Deploying $NEW_TAG to $ENVIRONMENT (currently: ${PREVIOUS_TAG:-nothing deployed})"
if compose_up "$NEW_TAG" "${JWT_SECRET_OVERRIDE:-$JWT_SECRET}" && health_check "$NEW_TAG"; then
  echo "$NEW_TAG" > "$STATE_FILE"
  log_history DEPLOYED "$NEW_TAG"
  echo "==> SUCCESS: $ENVIRONMENT is running $NEW_TAG"
  exit 0
fi

echo "!!  $NEW_TAG FAILED health verification on $ENVIRONMENT. Recent container logs:"
docker logs --tail 30 "$CONTAINER" 2>&1 || true
log_history FAILED "$NEW_TAG"

if [ -n "$PREVIOUS_TAG" ]; then
  echo "==> AUTOMATIC ROLLBACK to last known-good release $PREVIOUS_TAG"
  if compose_up "$PREVIOUS_TAG" "$JWT_SECRET" && health_check "$PREVIOUS_TAG"; then
    log_history ROLLED_BACK "$PREVIOUS_TAG"
    echo "==> Rollback succeeded: $ENVIRONMENT restored to $PREVIOUS_TAG"
  else
    echo "!!  Rollback FAILED - manual intervention required"
  fi
else
  echo "!!  No previous release recorded - nothing to roll back to"
fi
exit 1
