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
(cd fixtures/v9 && sha256sum --check SHA256SUMS)
cargo build --workspace --offline --locked
if [ "${PULSE_BROWSER_TESTS:-0}" = 1 ]; then
  NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18080 npm --prefix apps/web run build
fi
compose up -d --wait --wait-timeout 90 postgres monitor_fixture || { compose logs --tail 70 postgres monitor_fixture; exit 1; }
# Prove that container replacement preserves data in the named volume. All
# objects belong to this disposable project; cleanup removes only its volumes.
compose exec -T postgres psql -U pulse_admin -d drivechain_pulse -v ON_ERROR_STOP=1 -c   "CREATE TABLE public.volume_probe(value text); INSERT INTO public.volume_probe VALUES ('persisted');" >/dev/null
compose up -d --wait --wait-timeout 90 --force-recreate postgres
probe=$(compose exec -T postgres psql -XAt -U pulse_admin -d drivechain_pulse -c 'SELECT value FROM public.volume_probe')
[ "$probe" = persisted ] || { echo 'PostgreSQL data did not survive container replacement' >&2; exit 1; }
compose exec -T postgres psql -U pulse_admin -d drivechain_pulse -c 'DROP TABLE public.volume_probe' >/dev/null
echo 'PASS PostgreSQL18 named-volume persistence across container replacement'
PULSE_DATABASE_URL='postgres://pulse_admin:change-me-admin@127.0.0.1:55433/drivechain_pulse' "$build_dir/debug/pulse-api" migrate-only
PULSE_DATABASE_URL='postgres://pulse_api:change-me-api@127.0.0.1:55433/drivechain_pulse' PULSE_API_BIND='127.0.0.1:18080' PULSE_CORS_ORIGIN='http://127.0.0.1:13000' "$build_dir/debug/pulse-api" &
api_pid=$!
ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18080/health/ready >/dev/null; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || { echo 'API readiness timed out' >&2; exit 1; }
python3 scripts/test-official-protocol.py

# Prove paired dump/restore with real PostgreSQL, including evidence and projection.
# Both databases belong only to this disposable Compose project.
for service in monitor_fixture postgres; do
  if [ "$service" = monitor_fixture ]; then
    owner=monitor_owner; database=bip300_monitor
    # Content checksums, not only counts: a restore must reproduce the evidence.
    probe='SELECT (SELECT max(version) FROM schema_version),(SELECT count(*)||chr(47)||md5(string_agg(id||encode(fact_sha256,chr(104)||chr(101)||chr(120)),chr(44) ORDER BY id)) FROM event),(SELECT count(*)||chr(47)||md5(string_agg(observation_id||chr(58)||event_id||chr(58)||capture_seq,chr(44) ORDER BY observation_id)) FROM event_observation),(SELECT md5(string_agg(row_data::text,chr(44) ORDER BY revision_id)) FROM history_coverage_revision),(SELECT string_agg(dataset_id::text,chr(44) ORDER BY dataset_id) FROM dataset_manifest)'
  else
    owner=pulse_admin; database=drivechain_pulse
    probe='SELECT (SELECT count(*)||chr(47)||md5(string_agg(source_event_id||encode(fact_sha256,chr(104)||chr(101)||chr(120)),chr(44) ORDER BY source_event_id)) FROM ingest.source_events),(SELECT count(*)||chr(47)||md5(string_agg(observation_id||chr(58)||source_event_id,chr(44) ORDER BY observation_id)) FROM ingest.event_observations),(SELECT count(*)||chr(47)||md5(string_agg(observation_id||chr(58)||ordinal||chr(58)||md5(data::text),chr(44) ORDER BY observation_id,ordinal)) FROM projection.snapshot_history),(SELECT count(*)||chr(47)||md5(string_agg(build_id||chr(58)||md5(state::text),chr(44) ORDER BY build_id)) FROM ops.protocol_builds),(SELECT string_agg(dataset_id::text,chr(44) ORDER BY dataset_id) FROM ops.active_dataset)'
  fi
  compose exec -T "$service" pg_dump -U "$owner" -d "$database" -Fc -f /tmp/paired-test.dump
  compose exec -T "$service" createdb -U "$owner" restore_probe
  compose exec -T "$service" pg_restore --exit-on-error -U "$owner" -d restore_probe /tmp/paired-test.dump
  before=$(compose exec -T "$service" psql -XAt -U "$owner" -d "$database" -c "$probe")
  after=$(compose exec -T "$service" psql -XAt -U "$owner" -d restore_probe -c "$probe")
  [ "$before" = "$after" ] || { echo "Backup mismatch: $service" >&2; exit 1; }
  echo "PASS paired dump/restore $service: $after"
done
