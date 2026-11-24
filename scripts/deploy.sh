#!/usr/bin/env bash
# Zero-fuss redeploy on the VPS: pull, rebuild, restart, prune.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose build --pull
docker compose up -d
docker image prune -f
docker compose ps
