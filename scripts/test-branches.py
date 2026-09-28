"""Executed by test-integration.py with its isolated SQL/API helpers."""
import hashlib
from urllib.parse import quote

A = "ab" * 32
FLOOR = "aa" * 32
B = "bc" * 32
C = "cd" * 32

def varint(n):
    out = bytearray()
    while n > 127:
        out.append((n & 127) | 128)
        n >>= 7
    out.append(n)
    return bytes(out)

def wire(tag, value):
    if isinstance(value, int):
        return varint(tag << 3) + varint(value)
    return varint(tag << 3 | 2) + varint(len(value)) + value

def lit(value):
    return "'" + value.replace("'", "''") + "'"

def fact(kind, h, parent=None, height=None, work=1, slot=9, method="backfill", anchor_height=None):
    now = 1790200000000
    if kind == "block_disconnected":
        name, tag = "BlockDisconnected", 7
        payload = {"block_hash": h, "sidechain_number": slot}
        body = wire(1, bytes.fromhex(h)) + wire(2, slot)
    else:
        hdr = {"hash": h, "previous_hash": parent, "height": height, "chain_work": work.to_bytes(32, "little").hex(), "timestamp": now // 1000}
        hdr_wire = wire(1, bytes.fromhex(h)) + wire(2, bytes.fromhex(parent)) + wire(3, height) + wire(4, work.to_bytes(32, "little")) + wire(5, now // 1000)
        if kind == "block_connected":
            name, tag = "BlockConnected", 6
            payload = {"header": hdr, "sidechain_number": slot, "bmm_commitment": None, "events": []}
            body = wire(1, hdr_wire) + wire(2, slot)
        else:
            name, tag = "Bip300BlockDelta", 10
            payload = {"header": hdr, "coinbase_txid": "56" * 32, "coinbase_messages": [], "treasury_transitions": [], "confirmed_bmm_requests": []}
            body = wire(1, hdr_wire) + wire(2, bytes.fromhex("56" * 32))
            slot = None
    enforcer = wire(tag, body)
    anchor_height = height if anchor_height is None else anchor_height
    anchor = wire(1, bytes.fromhex(h)) + (wire(2, anchor_height) if anchor_height is not None else b"")
    envelope = wire(1, enforcer) + wire(10, now) + wire(11, anchor)
    document = {"timestamp": now, "observed_at_block": {"hash": h, "height": anchor_height}, "monitor_event": {"Enforcer": {"event": {name: payload}}}}
    digest = hashlib.sha256(enforcer).hexdigest()
    event = sql("monitor_fixture", f"""INSERT INTO event(observed_at,source,kind,sidechain,block_hash,height,envelope,payload,dataset_id,event_contract_version,envelope_sha256,fact_sha256,sidechain_instance_id)
      VALUES(to_timestamp({now}/1000.0),'enforcer',{lit(kind)},{slot if slot is not None else 'NULL'},decode('{h}','hex'),{anchor_height if anchor_height is not None else 'NULL'},decode('{envelope.hex()}','hex'),{lit(json.dumps(document))},'{DATASET}',5,decode('{hashlib.sha256(envelope).hexdigest()}','hex'),decode('{digest}','hex'),{'NULL' if slot is None else lit('betanet-slot-9-fixture')}) RETURNING id;""").splitlines()[0]
    observe(event, method)
    return event

def observe(event, method="live"):
    sql("monitor_fixture", f"""WITH seq AS (UPDATE extractor_run SET last_capture_seq=last_capture_seq+1 WHERE run_id='{RUN}' RETURNING last_capture_seq)
      INSERT INTO event_observation(dataset_id,run_id,capture_seq,capture_method,event_id,observed_at) SELECT '{DATASET}','{RUN}',last_capture_seq,{lit(method)},{event},now() FROM seq;""")

def tip(h, height):
    sql("monitor_fixture", f"""WITH seq AS (UPDATE extractor_run SET last_capture_seq=last_capture_seq+1 WHERE run_id='{RUN}' RETURNING last_capture_seq)
      INSERT INTO tip_observation(dataset_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at) SELECT '{DATASET}','{RUN}',last_capture_seq,'poll',decode('{h}','hex'),{height},now() FROM seq;
      UPDATE extractor_status SET last_tip_hash=decode('{h}','hex'),last_tip_height={height},updated_at=now() WHERE dataset_id='{DATASET}' AND source='enforcer';""")

def branch():
    return get("/api/v1/status")["branch"]

def error_status(path, status):
    try:
        get(path)
        raise AssertionError("Expected HTTP " + str(status))
    except urllib.error.HTTPError as e:
        assert e.code == status, e.read()
        return json.load(e)

def rebuild(*, fail=False, batch=2, fresh=False):
    environment = dict(os.environ, PULSE_SYNC_BATCH_SIZE=str(batch))
    environment.pop("MONITOR_DATABASE_URL", None)
    result = subprocess.run([str(ROOT / "target/debug/pulse-sync"), "rebuild", "--dataset-id", DATASET, *(["--fresh"] if fresh else [])], env=environment, text=True, capture_output=True)
    assert (result.returncode != 0) == fail, result.stdout + result.stderr
    return result

# The existing fixture claims more history than it contains. Bound the source
# range to two blocks, then actually repair its missing parent locally.
sql("monitor_fixture", "UPDATE history_coverage SET coverage_start_height=970143")
sync()
assert branch()["status"] == "provisional"
assert get("/api/v1/coverage")["streams"][0]["verification"]["first_gap_height"] == 970143
fact("bip300_block_delta", FLOOR, "01" * 32, 970143, 0)
sync()
assert branch()["tip_hash"] == A and branch()["status"] == "resolved", branch()
assert branch()["checkpoint_status"] == "unobserved"
assert get("/api/v1/coverage")["streams"][0]["verification"]["status"] == "verified"
check("gap repair verifies the bounded branch without claiming an absent checkpoint")

# Slot coverage cannot borrow the global delta stream's completeness.
sql("monitor_fixture", f"""INSERT INTO history_coverage(dataset_id,event_contract_version,source,stream,sidechain,sidechain_instance_id,coverage_start_height,covered_tip_hash,covered_tip_height,target_tip_hash,target_tip_height,status,effective_page_blocks,completed_at)
 VALUES('{DATASET}',5,'enforcer','block',9,'betanet-slot-9-fixture',970143,decode('{A}','hex'),970144,decode('{A}','hex'),970144,'complete',128,now());""")
sync()
slot_coverage = next(s for s in get("/api/v1/coverage")["streams"] if s["slot"] == 9)
assert slot_coverage["verification"]["status"] == "gap"
fact("block_connected", FLOOR, "01" * 32, 970143, 0)
sync()
assert all(s["verification"]["status"] == "verified" for s in get("/api/v1/coverage")["streams"])
assert get("/api/v1/coverage")["local_status"] == "branch_verified", "BMM errors cannot invalidate independently verified block coverage"
assert int(get("/api/v1/blocks")["meta"]["data_as_of_event_id"])>int(get("/api/v1/meta")["meta"]["data_as_of_event_id"]), "block completeness is independent of failed BMM projection"
check("global and per-slot coverage are independently certified")

b_event = fact("block_connected", B, A, 970145, 255, method="live")
sync()
assert branch()["tip_hash"] == B and branch()["status"] == "provisional", branch()
tip(B, 970145)
sync()
assert branch()["status"] == "resolved", branch()
fact("bip300_block_delta", C, A, 970145, 256)
sync()
assert branch()["tip_hash"] == B, "late, higher-work backfill must not replace the observed tip"
assert get(f"/api/v1/blocks/{C}")["block"]["chain_work"] == "256"
assert get(f"/api/v1/blocks/{B}")["block"]["chain_work"] == "255"
assert get(f"/api/v1/blocks/{C}")["block"]["membership"] == "alternative"
check("live extensions are provisional and higher numeric work alone cannot replace the tip")

first = get("/api/v1/blocks?limit=1")
assert first["blocks"][0]["hash"] == B and first["next_cursor"]
second = get("/api/v1/blocks?limit=1&cursor=" + quote(first["next_cursor"]))
assert second["blocks"][0]["hash"] == A
assert len(get("/api/v1/blocks?scope=all&height=970145")["blocks"]) == 2
assert len(get("/api/v1/blocks?scope=all&slot=9&height=970145")["blocks"]) == 1
error_status("/api/v1/blocks?limit=201", 400)
error_status("/api/v1/blocks?slot=256", 400)
error_status("/api/v1/blocks?limit=garbage", 400)
error_status("/api/v1/blocks?dataset=garbage", 400)
error_status("/api/v1/blocks?cursor=garbage", 400)
error_status("/api/v1/blocks/not-a-hash", 400)
error_status("/api/v1/blocks/" + "ff"*32, 404)
tip(C, 970145)
sync()
assert get(f"/api/v1/blocks/{B}")["block"]["membership"] == "alternative"
assert error_status("/api/v1/blocks?limit=1&cursor=" + quote(first["next_cursor"]), 409)["code"] == "cursor_reset_required"
check("fork membership, height/slot filters, bounded keysets and branch cursor resets")

# Several tip transitions in one page must all survive, including a deduped return.
before_revision = int(branch()["revision"])
tip(B, 970145)
tip(C, 970145)
tip(B, 970145)
sync()
assert branch()["tip_hash"] == B and int(branch()["revision"]) >= before_revision + 3
history = sql("postgres", f"SELECT state->>'tip_hash' FROM projection.chain_revisions WHERE dataset_id='{DATASET}' AND generation=3 AND revision>{before_revision} ORDER BY revision")
assert history.splitlines()[:3] == [B, C, B], history
# An unknown disconnect lacks height and header, but stays valid evidence.
disconnect_unknown = fact("block_disconnected", "f0"*32, method="live")
sync()
assert branch()["status"] == "resolved"
assert get(f"/api/v1/datasets/{DATASET}/events/{disconnect_unknown}")["interpretation_error"] is None
# Disconnect the selected branch, retain membership with uncertainty, then restore it.
disconnect_b = fact("block_disconnected", B, method="live")
observe(3, "poll")
sync()
assert branch()["status"] == "ambiguous"
assert get("/api/v1/bmm/auctions")["state"] == "branch_unresolved"
assert any(o["kind"] == "block_disconnected" for o in get(f"/api/v1/blocks/{B}")["observations"])
observe(b_event)
tip(B, 970145)
sync()
assert branch()["status"] == "resolved"
check("A-B-A history, disconnect without height, BMM ambiguity and deduplicated reconnection")

# Rebuild from local evidence with a different page size; no source credentials.
expected = branch()
old_cursor = get("/api/v1/blocks?limit=1")["next_cursor"]
raw_before = get(f"/api/v1/datasets/{DATASET}/events/{b_event}")["envelope_hex"]
rebuild()
assert get("/api/v1/meta")["meta"]["projection_generation"] == "4"
actual = branch()
for key in ["status", "tip_hash", "tip_height", "verified_from_height", "missing_parent", "checkpoint_status", "capture_seq", "processed_events", "processed_observations", "processed_tips", "processed_coverage"]:
    assert actual[key] == expected[key], (key, actual, expected)
assert get(f"/api/v1/datasets/{DATASET}/events/{b_event}")["envelope_hex"] == raw_before
error_status("/api/v1/blocks?limit=1&cursor=" + quote(old_cursor), 409)
assert sql("postgres", "SELECT count(*)>0 FROM projection.chain_headers WHERE generation=3") == "t"
sync()
check("offline reconstruction matches incremental results, retains evidence and invalidates old generation cursors")

# A new run starts a fresh capture-sequence namespace; old high sequences cannot win.
old_run = RUN
RUN = "33333333-3333-4333-8333-333333333333"
sql("monitor_fixture", f"""UPDATE extractor_run SET status='completed',finished_at=now() WHERE run_id='{old_run}';
 INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq)
 SELECT '{RUN}',dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,'running',0 FROM extractor_run WHERE run_id='{old_run}';
 UPDATE extractor_status SET run_id='{RUN}' WHERE dataset_id='{DATASET}';
 INSERT INTO extractor_worker_status(run_id,worker,last_success_at) VALUES('{RUN}','mainchain_tip',now()),('{RUN}','bmm_requests',now());""")
tip(A, 970144)
sync()
assert branch()["run_id"] == RUN and branch()["tip_hash"] == A and branch()["capture_seq"] == "1"
check("run changes cannot inherit the previous run's capture order")

# A known checkpoint contradiction is branch uncertainty, not a new network identity.
bad_checkpoint="ef"*32
fact("bip300_block_delta",bad_checkpoint,"ee"*32,967680,1)
tip(bad_checkpoint,967680)
sync()
assert branch()["checkpoint_status"]=="mismatch" and branch()["status"]=="ambiguous"
tip(A,970144)
sync()
assert branch()["status"]=="resolved"
check("checkpoint mismatches are explicit and a later compatible tip reconciles them")

# Contradictory immutable headers are preserved, never silently overwritten.
conflicting = fact("block_connected", B, A, 970145, 999, method="live")
sync()
assert branch()["status"] == "ambiguous"
assert get(f"/api/v1/blocks/{B}")["block"]["chain_work"] == "255"
assert get(f"/api/v1/blocks/{B}")["block"]["conflicted"]
assert get(f"/api/v1/datasets/{DATASET}/events/{conflicting}")["interpretation_error"]
progress={p["name"]:p for p in get("/api/v1/status")["progress"]}
assert int(progress["branches"]["processed_event_id"])<int(conflicting)
assert progress["branches"]["error_event_id"]==conflicting
rebuild(fail=True)
rebuild(fail=True,fresh=True)
assert sql("postgres",f"SELECT max(generation) FROM ops.chain_jobs WHERE dataset_id='{DATASET}'")=="6"
assert get("/api/v1/meta")["meta"]["projection_generation"] == "4"
assert get(f"/api/v1/datasets/{DATASET}/events/{conflicting}")["payload_json"]
check("conflicting headers freeze chain completeness and prevent failed rebuild promotion")
print("All branch/explorer integration scenarios passed.", flush=True)
