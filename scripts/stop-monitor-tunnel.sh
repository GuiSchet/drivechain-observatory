#!/usr/bin/env bash
set -euo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$project_dir"

compose_project="${PULSE_COMPOSE_PROJECT:-drivechain-observatory-live}"

docker compose \
  -p "$compose_project" \
  --env-file deploy/.env.example \
  -f deploy/compose.yaml \
  down --remove-orphans

echo "Drivechain - Observatory containers and SSH tunnel stopped; local database volume preserved"
