#!/usr/bin/env bash
# Generates release notes (changes since the previous release tag) for the archive.
set -euo pipefail
mkdir -p reports/release
OUT="reports/release/release-notes.md"
PREV_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
{
  echo "# TaskFlow API release ${APP_VERSION} (build ${BUILD_NUMBER:-manual})"
  echo
  echo "- **Image:** \`${IMAGE}:${IMAGE_TAG}\` (also tagged \`${APP_VERSION}\` and \`production\`)"
  echo "- **Commit:** \`$(git rev-parse HEAD)\`"
  echo "- **Released:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- **Previous release tag:** ${PREV_TAG:-none}"
  echo
  echo "## Changes"
  if [ -n "$PREV_TAG" ]; then
    git log --pretty='- %h %s (%an)' "${PREV_TAG}..HEAD"
  else
    git log -n 15 --pretty='- %h %s (%an)'
  fi
} > "$OUT"
cat "$OUT"
