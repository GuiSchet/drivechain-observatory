"""Local-only integration tests. Run through verify-local.sh (isolated databases)."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATASET = os.environ["PULSE_DATASET_ID"]
RUN = "22222222-2222-4222-8222-222222222222"
BASE = "http://127.0.0.1:18080"
COMPOSE = ["docker", "compose", "-p", os.environ["PULSE_TEST_COMPOSE_PROJECT"], "--env-file", "deploy/.env.example", "-f", "deploy/compose.yaml", "-f", "deploy/compose.dev.yaml"]

def sql(service, statement, *, db=None, user=None, fail=False):
    source = service == "monitor_fixture"
    command = COMPOSE + ["exec", "-T", service, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", user or ("monitor_owner" if source else "pulse_admin"), "-d", db or ("bip300_monitor" if source else "drivechain_pulse")]
    result = subprocess.run(command, input=statement, text=True, capture_output=True, cwd=ROOT)
    if fail:
        assert result.returncode != 0, "Expected restricted write to fail"
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()

def sync(*args, fail=False, env=None):
    result = subprocess.run([str(ROOT / "target/debug/pulse-sync"), "--once", *args], capture_output=True, text=True, env=env)
    assert (result.returncode != 0) == fail, result.stdout + result.stderr
    return result

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as response:
        return json.load(response)

def sse(cursor, count=1):
    frames = []
    request = urllib.request.Request(BASE + "/api/v1/stream", headers={"Last-Event-ID": cursor})
    with urllib.request.urlopen(request, timeout=12) as response:
        current = {}
        for raw in response:
            line = raw.decode().rstrip("\r\n")
            if not line:
                if "event" in current:
                    frames.append(current)
                    if len(frames) == count:
                        return frames
                current = {}
            elif not line.startswith(":") and ":" in line:
                key, value = line.split(":", 1)
                current[key] = value.lstrip()
    return frames

def check(name):
    print("PASS " + name, flush=True)

# An out-of-order reference is pending at occurrence 2. A later replay must not
# leap over it, even though its fact is already available.
sync("--batch-size", "2", "--max-pages-per-cycle", "1")
assert sql("postgres", "SELECT cursor_value FROM ops.sync_cursors WHERE stream='event_observations'") == "1"
assert get("/api/v1/status")["sync_mode"] == "catching_up"
sync()
assert sql("postgres", "SELECT count(*) FROM ingest.event_observations") == "5"
assert sql("postgres", "SELECT count(*) FROM ingest.source_events WHERE fact_sha256 IS NOT NULL") == "5"
assert get("/api/v1/meta")["current_run"]["event_contract_version"] == 5
assert get("/api/v1/meta")["dataset"]["network_id"] == "betanet"
assert get("/api/v1/meta")["native_asset"] == {"symbol": "sats", "decimals": 0}
assert get("/api/v1/coverage")["streams"][0]["start_height"] == 967680
assert get("/api/v1/coverage")["local_status"] == "imported_branch_unverified"
check("v5 contract, exact identity, coverage and safe occurrence prefix")

# A -> empty -> A selects the last occurrence, not the newest fact ID.
auction = get("/api/v1/bmm/auctions")
assert auction["state"] == "available", auction
assert auction["source_event_id"] == "3" and auction["observation_id"] == "5"
assert auction["requests"][0]["bid_sats"] == "18446744073709551615"
evidence = get(f"/api/v1/datasets/{DATASET}/events/3")
assert "18446744073709551615" in evidence["payload_json"]
assert len(evidence["occurrences"]) == 2
assert get(f"/api/v1/datasets/{DATASET}/events/5")["event_contract_version"] == 4
revision = get("/api/v1/meta")["meta"]["pulse_revision"]
sync()
assert get("/api/v1/meta")["meta"]["pulse_revision"] == revision
check("A -> B -> A, legacy evidence, lossless u64 and restart idempotency")
if os.environ.get("PULSE_BROWSER_TESTS") == "1":
    subprocess.run(["node", "scripts/test-browser.mjs"], check=True, cwd=ROOT)
    sql("monitor_fixture", "UPDATE extractor_worker_status SET last_success_at=now(),updated_at=now(); UPDATE event_observation SET observed_at=now()")
    sync()

# A successful empty poll is observable even without new facts.
def occurrence(event):
    sql("monitor_fixture", f"""WITH seq AS (UPDATE extractor_run SET last_capture_seq=last_capture_seq+1 WHERE run_id='{RUN}' RETURNING last_capture_seq)
      INSERT INTO event_observation (dataset_id,run_id,capture_seq,capture_method,event_id,observed_at)
      SELECT '{DATASET}','{RUN}',last_capture_seq,'poll',{event},now() FROM seq;""")
occurrence(4)
sync()
assert get("/api/v1/bmm/auctions")["state"] == "empty"
assert get("/api/v1/meta")["meta"]["pulse_revision"] != revision
occurrence(3)
sync()
sql("monitor_fixture", "UPDATE extractor_worker_status SET consecutive_failures=3,last_error='fixture RPC unavailable',last_failure_at=now() WHERE worker='bmm_requests'")
sync()
assert get("/api/v1/bmm/auctions")["state"] == "rpc_error"
workers = {w["worker"]: w for w in get("/api/v1/status")["extractors"][0]["workers"]}
assert workers["mainchain_tip"]["state"] == "healthy" and workers["bmm_requests"]["state"] == "degraded"
sql("monitor_fixture", "UPDATE extractor_worker_status SET consecutive_failures=0,last_error=NULL,last_success_at=now()")
sync()
check("empty polls, repeat observations and independent worker health")

# Mutable coverage must invalidate clients without a new source event.
before = get("/api/v1/meta")["meta"]["pulse_revision"]
sql("monitor_fixture", "UPDATE history_coverage SET updated_at=now(),rows_recorded=2465")
sync()
assert get("/api/v1/meta")["meta"]["pulse_revision"] != before
sql("postgres", "UPDATE ops.source_status SET last_cycle_at=now()-interval '2 minutes'")
assert get("/api/v1/status")["sync_stale"] is True
assert get("/api/v1/bmm/auctions")["state"] == "stale"
assert get("/api/v1/overview")["source_events_imported"] == "5"
sync()
check("coverage-only revisions and freshness expiration")

# Reader and API roles cannot write, even through their direct SQL sessions.
sql("monitor_fixture", "DELETE FROM event WHERE false", user="monitor_reader", fail=True)
sql("postgres", "DELETE FROM ingest.source_events WHERE false", user="pulse_api", fail=True)
check("source and API read-only roles")

# Replay is scoped, complete beyond one page and duplicates no revisions.
base_revision = get("/api/v1/meta")["meta"]["pulse_revision"]
sql("postgres", f"INSERT INTO ops.pulse_updates (dataset_id,projection_generation,changed) SELECT '{DATASET}',3,'[\"status\"]' FROM generate_series(1,1101)")
frames = sse(f"{DATASET}:3:{base_revision}", 1101)
ids = [int(frame["id"].rsplit(":", 1)[1]) for frame in frames]
assert len(ids) == 1101 and ids == sorted(set(ids))
for cursor in [f"{DATASET}:1:0", "33333333-3333-4333-8333-333333333333:3:0", "42", f"{DATASET}:3:99999999"]:
    assert sse(cursor)[0]["event"] == "reset_required"
# A subscriber at the current snapshot gets a later commit, with no race.
last = get("/api/v1/meta")["meta"]["pulse_revision"]
with concurrent.futures.ThreadPoolExecutor() as executor:
    pending = executor.submit(sse, f"{DATASET}:3:{last}")
    time.sleep(0.3)
    sql("postgres", f"INSERT INTO ops.pulse_updates (dataset_id,projection_generation,changed) VALUES ('{DATASET}',3,'[\"status\"]')")
    frame = pending.result(timeout=15)[0]
    assert frame["event"] == "update" and int(frame["id"].rsplit(":", 1)[1]) > int(last)
sql("postgres", f"UPDATE ops.active_dataset SET replay_floor={last}")
assert sse(f"{DATASET}:3:0")[0]["event"] == "reset_required"
sql("postgres", "UPDATE ops.active_dataset SET projection_generation=4,replay_floor=0")
assert sse(f"{DATASET}:3:{last}")[0]["event"] == "reset_required"
sql("postgres", "UPDATE ops.active_dataset SET projection_generation=3,replay_floor=0")
check("1101-frame SSE replay, boundary handoff, reset, retention and generations")

# Unknown fields/kinds remain lossless even beyond the u64 range.
sql("monitor_fixture", f"INSERT INTO event (observed_at,source,kind,envelope,payload,dataset_id,event_contract_version,fact_sha256) VALUES (now(),'enforcer','future_kind',decode('fefe','hex'),'{{\"counter\":340282366920938463463374607431768211455}}','{DATASET}',5,decode(repeat('dd',32),'hex'))")
unknown = sql("monitor_fixture", "SELECT max(id) FROM event")
sync()
unknown_evidence = get(f"/api/v1/datasets/{DATASET}/events/{unknown}")
assert "340282366920938463463374607431768211455" in unknown_evidence["payload_json"]
assert unknown_evidence["interpretation_error"] is None
with urllib.request.urlopen(BASE + f"/api/v1/datasets/{DATASET}/events/{unknown}/raw", timeout=10) as response:
    assert "340282366920938463463374607431768211455" in response.read().decode()
check("unknown kinds and arbitrary-precision raw JSON preservation")

# Invalid known facts remain as evidence without promoting their completeness.
before_invalid_revision = get("/api/v1/meta")["meta"]["pulse_revision"]
sql("monitor_fixture", f"INSERT INTO event (observed_at,source,kind,block_hash,height,envelope,payload,dataset_id,event_contract_version,fact_sha256) VALUES (now(),'bmm_requests_fixture','bmm_requests',decode(repeat('ab',32),'hex'),970144,decode('ff','hex'),'{{}}','{DATASET}',5,decode(repeat('ee',32),'hex'))")
malformed = sql("monitor_fixture", "SELECT max(id) FROM event")
occurrence(malformed)
sync()
assert get("/api/v1/bmm/auctions")["state"] == "interpretation_error"
progress = {p["name"]: p for p in get("/api/v1/status")["progress"]}
assert progress["bmm"]["error_event_id"] == malformed and progress["blocks"]["error_event_id"] is None
assert get("/api/v1/coverage")["local_status"] == "imported_branch_unverified"
assert get(f"/api/v1/datasets/{DATASET}/events/{malformed}")["interpretation_error"]
public_watermark = get("/api/v1/meta")["meta"]["data_as_of_event_id"]
assert sql("postgres", f"SELECT NOT EXISTS(SELECT 1 FROM ops.pulse_updates WHERE dataset_id='{DATASET}' AND revision>{before_invalid_revision} AND source_event_id>{public_watermark})") == "t", "SSE must not publish an import/scan frontier beyond REST completeness"
check("invalid evidence retained, only dependent projection completeness stops")

# Source identity/contract and continuity changes are explicit failures, and
# --once must have a failing exit code. Historical REST remains usable.
bad = dict(os.environ, PULSE_NETWORK_ID="alphanet")
sync(fail=True, env=bad)
assert get("/api/v1/status")["sync_mode"] == "incompatible"
sql("monitor_fixture", f"UPDATE extractor_run SET event_contract_version=4 WHERE run_id='{RUN}'")
sync(fail=True)
assert get("/api/v1/status")["sync_mode"] == "incompatible"
sql("monitor_fixture", f"UPDATE extractor_run SET event_contract_version=5 WHERE run_id='{RUN}'")
sql("monitor_fixture", f"UPDATE event SET envelope=decode('ffff','hex') WHERE id={malformed}")
sync(fail=True)
assert get("/api/v1/status")["sync_mode"] == "incompatible"
sql("monitor_fixture", f"UPDATE event SET envelope=decode('ff','hex') WHERE id={malformed}")
sync()
# A wrong endpoint exercises connection recovery without touching the source.
bad = dict(os.environ, MONITOR_DATABASE_URL="postgres://monitor_reader:monitor_reader_dev@127.0.0.1:1/bip300_monitor?connect_timeout=1")
sync(fail=True, env=bad)
assert get("/api/v1/status")["source_reachable"] is False
assert get("/api/v1/overview")["source_events_imported"] == "7"
sync()
check("identity/contract gates, restore witness, source outage and --once errors")

# Upgrade the initial schema with evidence already present. The occurrence
# cursor is rewound so the corrected importer can recover old skipped rows.
sql("postgres", "CREATE DATABASE pulse_upgrade")
sql("postgres", (ROOT / "migrations/0001_initial.sql").read_text(), db="pulse_upgrade")
sql("postgres", f"""INSERT INTO ingest.datasets (dataset_id,network_id,activation_height,activation_block_hash,initial_node_commit,initial_enforcer_commit,initial_monitor_commit,initial_event_contract_version,capabilities,creation_reason,source_created_at)
 VALUES ('{DATASET}','betanet',967680,'checkpoint','node','enforcer','monitor',4,'[]','upgrade fixture',now());
 INSERT INTO ingest.source_events (dataset_id,source_event_id,event_contract_version,observed_at,source_ingested_at,source,kind,envelope,payload) VALUES ('{DATASET}',1,4,now(),now(),'enforcer','unknown',decode('1234','hex'),'{{}}');
 INSERT INTO ops.sync_cursors VALUES ('{DATASET}','event_observations',12,now());""", db="pulse_upgrade")
sql("postgres", (ROOT / "migrations/0002_betanet_v5.sql").read_text(), db="pulse_upgrade")
assert sql("postgres", "SELECT encode(envelope,'hex') FROM ingest.source_events", db="pulse_upgrade") == "1234"
assert sql("postgres", "SELECT cursor_value FROM ops.sync_cursors", db="pulse_upgrade") == "0"
sql("postgres", f"INSERT INTO ops.active_dataset(dataset_id) VALUES('{DATASET}')", db="pulse_upgrade")
sql("postgres", (ROOT / "migrations/0003_observed_branches.sql").read_text(), db="pulse_upgrade")
assert sql("postgres", "SELECT projection_generation||':'||projection_version FROM ops.active_dataset", db="pulse_upgrade") == "2:2"
assert sql("postgres", "SELECT encode(envelope,'hex') FROM ingest.source_events", db="pulse_upgrade") == "1234"
check("additive upgrade preserves old evidence, old generation and repairs occurrence cursor")
print("All Observatory v5 integration scenarios passed.")
exec(compile((ROOT / "scripts/test-branches.py").read_text(), "test-branches.py", "exec"))
exec(compile((ROOT / "scripts/test-v6.py").read_text(), "test-v6.py", "exec"))
if os.environ.get("PULSE_SCALE_TESTS") == "1":
    exec(compile((ROOT / "scripts/test-scale.py").read_text(), "test-scale.py", "exec"))
