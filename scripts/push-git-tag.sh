#!/usr/bin/env bash
# Creates and pushes an annotated release tag: v<version>-build<N>
# Env: GIT_USER / GIT_TOKEN (Jenkins "github-creds"), APP_VERSION, BUILD_NUMBER, IMAGE, IMAGE_TAG
set -euo pipefail
TAG="v${APP_VERSION}-build${BUILD_NUMBER}"
git config user.email "jenkins@taskflow.local"
git config user.name "Jenkins CI"
git tag -a "$TAG" -m "TaskFlow release $TAG (image ${IMAGE}:${IMAGE_TAG})" 2>/dev/null || echo "Tag $TAG already exists locally"
REMOTE="$(git config --get remote.origin.url)"
REMOTE="${REMOTE#https://}"
REMOTE="${REMOTE#*@}"          # strip any embedded credentials
git push "https://${GIT_USER}:${GIT_TOKEN}@${REMOTE}" "refs/tags/${TAG}"
echo "Pushed release tag $TAG"
