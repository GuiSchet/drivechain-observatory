#!/usr/bin/env bash
set -euo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$project_dir"

: "${PULSE_MONITOR_SSH_HOST:?PULSE_MONITOR_SSH_HOST is required}"
: "${PULSE_MONITOR_SSH_USER:?PULSE_MONITOR_SSH_USER is required}"
: "${PULSE_MONITOR_SSH_KEY:?PULSE_MONITOR_SSH_KEY is required}"
: "${PULSE_MONITOR_KNOWN_HOSTS:?PULSE_MONITOR_KNOWN_HOSTS is required}"
: "${PULSE_MONITOR_EXPECTED_FINGERPRINT:?PULSE_MONITOR_EXPECTED_FINGERPRINT is required}"
: "${PULSE_MONITOR_COMPOSE_PROJECT:?Provide the monitor Compose project name}"

if [[ ! "$PULSE_MONITOR_COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "The monitor Compose project name must use lowercase letters, digits, underscores or hyphens" >&2
  exit 1
fi

compose_project="${PULSE_COMPOSE_PROJECT:-drivechain-observatory-live}"
ssh_target="${PULSE_MONITOR_SSH_USER}@${PULSE_MONITOR_SSH_HOST}"

known_host_line="$(
  ssh-keygen -F "$PULSE_MONITOR_SSH_HOST" -f "$PULSE_MONITOR_KNOWN_HOSTS" 2>/dev/null \
    | awk '$2 == "ssh-ed25519" { print; exit }'
)"
if [[ -z "$known_host_line" ]]; then
  echo "No trusted ED25519 host key exists for ${PULSE_MONITOR_SSH_HOST}" >&2
  exit 1
fi

known_fingerprint="$(
  printf '%s\n' "$known_host_line" \
    | ssh-keygen -lf - \
    | awk '{ print $2 }'
)"
if [[ "$known_fingerprint" != "$PULSE_MONITOR_EXPECTED_FINGERPRINT" ]]; then
  echo "The stored host fingerprint does not match the expected fingerprint" >&2
  exit 1
fi

ssh_options=(
  -i "$PULSE_MONITOR_SSH_KEY"
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$PULSE_MONITOR_KNOWN_HOSTS"
  -o ConnectTimeout=15
)

remote_container_id="$(
  ssh "${ssh_options[@]}" "$ssh_target" \
    "docker ps --filter label=com.docker.compose.project='$PULSE_MONITOR_COMPOSE_PROJECT' --filter label=com.docker.compose.service=postgres --format '{{.ID}}' | head -n 1"
)"
if [[ ! "$remote_container_id" =~ ^[a-f0-9]+$ ]]; then
  echo "Could not resolve the monitor PostgreSQL container" >&2
  exit 1
fi

remote_db_ip="$(
  ssh "${ssh_options[@]}" "$ssh_target" \
    "docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' '$remote_container_id'"
)"
if [[ ! "$remote_db_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not resolve the monitor PostgreSQL private container address" >&2
  exit 1
fi

: "${PULSE_MONITOR_READER_PASSWORD:?Provide the existing read-only role password; this helper does not provision the monitor}"
: "${PULSE_DATASET_ID:?Provide the explicit Betanet dataset UUID}"
reader_password="$PULSE_MONITOR_READER_PASSWORD"
# Restrict to URL-safe credentials; operators may instead supply a percent-encoded URL.
if [[ ! "$reader_password" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Use a URL-safe reader password for this helper" >&2
  exit 1
fi

export PULSE_MONITOR_DB_IP="$remote_db_ip"
export MONITOR_DATABASE_URL="postgres://pulse_sync_reader:${reader_password}@ssh-tunnel:5432/bip300_monitor?sslmode=disable"

compose_args=(
  -p "$compose_project"
  --env-file deploy/.env.example
  -f deploy/compose.yaml
  -f deploy/compose.tunnel.yaml
)

docker compose \
  "${compose_args[@]}" \
  up -d --build postgres migrate ssh-tunnel sync api

for _ in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:18080/api/v1/status >/dev/null; then
    echo "Drivechain - Observatory API is ready at http://127.0.0.1:18080"
    echo "SSH tunnel is active inside the isolated Docker egress network"
    exit 0
  fi
  sleep 1
done

echo "Drivechain - Observatory API did not become ready within 60 seconds" >&2
exit 1
