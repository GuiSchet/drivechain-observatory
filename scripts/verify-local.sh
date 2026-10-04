#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
export PULSE_TEST_COMPOSE_PROJECT="drivechain-observatory-e2e-$$"
export PULSE_DATASET_ID=11111111-1111-4111-8111-111111111111
export MONITOR_DATABASE_URL='postgres://monitor_reader:monitor_reader_dev@127.0.0.1:55434/bip300_monitor'
export PULSE_DATABASE_URL='postgres://pulse_sync:change-me-sync@127.0.0.1:55433/drivechain_pulse'
build_dir=${CARGO_TARGET_DIR:-target}
api_pid=
compose() {
  docker compose -p "$PULSE_TEST_COMPOSE_PROJECT" --env-file deploy/.env.example -f deploy/compose.yaml -f deploy/compose.dev.yaml "$@"
}
cleanup() {
  if [ -n "$api_pid" ]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cargo build --workspace --offline --locked
if [ "${PULSE_BROWSER_TESTS:-0}" = 1 ]; then
  NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18080 npm --prefix apps/web run build
fi
compose up -d --wait --wait-timeout 90 postgres monitor_fixture || { compose logs --tail 70 postgres monitor_fixture; exit 1; }
PULSE_DATABASE_URL='postgres://pulse_admin:change-me-admin@127.0.0.1:55433/drivechain_pulse' "$build_dir/debug/pulse-api" migrate-only
PULSE_DATABASE_URL='postgres://pulse_api:change-me-api@127.0.0.1:55433/drivechain_pulse' PULSE_API_BIND='127.0.0.1:18080' PULSE_CORS_ORIGIN='http://127.0.0.1:13000' "$build_dir/debug/pulse-api" &
api_pid=$!
ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18080/health/ready >/dev/null; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || { echo 'API readiness timed out' >&2; exit 1; }
python3 scripts/test-protocol.py
