"""Opt-in local stress fixture; executed inside verify-local's disposable project.
Payloads exercise the projection contract; envelopes are explicitly synthetic
benchmark markers, not evidence for protocol interpretation.
"""
SCALE = "44444444-4444-4444-8444-444444444444"
SCALE_RUN = "55555555-5555-4555-8555-555555555555"
started = time.monotonic()
sql("postgres", f"""
INSERT INTO ingest.datasets SELECT '{SCALE}',network_id,0,repeat('00',32),initial_node_commit,initial_enforcer_commit,initial_monitor_commit,5,capabilities,'synthetic scale fixture',now(),now() FROM ingest.datasets WHERE dataset_id='{DATASET}';
INSERT INTO ingest.extractor_runs(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq,started_at)
VALUES('{SCALE_RUN}','{SCALE}','enforcer','fixture','fixture','fixture',5,'[]','running',1,now());
INSERT INTO ingest.extractor_status(dataset_id,source,run_id,last_tip_hash,last_tip_height,source_updated_at) VALUES('{SCALE}','enforcer','{SCALE_RUN}',decode(lpad(to_hex(10000),64,'0'),'hex'),10000,now());
INSERT INTO ingest.source_events(dataset_id,source_event_id,event_contract_version,observed_at,source_ingested_at,source,kind,block_hash,height,envelope,payload)
SELECT '{SCALE}',n,5,now(),now(),'scale_fixture',CASE WHEN n%100=0 THEN 'bip300_block_delta' ELSE 'future_kind' END,
 CASE WHEN n%100=0 THEN decode(lpad(to_hex(n/100),64,'0'),'hex') END,CASE WHEN n%100=0 THEN n/100 END,decode('00','hex'),
 CASE WHEN n%100=0 THEN jsonb_build_object('monitor_event',jsonb_build_object('Enforcer',jsonb_build_object('event',jsonb_build_object('Bip300BlockDelta',jsonb_build_object('header',jsonb_build_object(
 'hash',lpad(to_hex(n/100),64,'0'),'previous_hash',lpad(to_hex(n/100-1),64,'0'),'height',n/100,
 'chain_work',lpad(to_hex((n/100)%256),2,'0')||lpad(to_hex((n/100)/256),2,'0')||repeat('00',30),'timestamp',1790200000)))))) ELSE '{{}}'::jsonb END FROM generate_series(1,1000000) n;
INSERT INTO ingest.tip_observations(dataset_id,tip_observation_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at,source_ingested_at) VALUES('{SCALE}',1,'{SCALE_RUN}',1,'poll',decode(lpad(to_hex(10000),64,'0'),'hex'),10000,now(),now());
INSERT INTO ingest.coverage_revisions(revision_id,dataset_id,event_contract_version,source,stream,operation,row_data,changed_at) VALUES(1,'{SCALE}',5,'enforcer','bip300_delta','insert',jsonb_build_object('coverage_start_height',1,'covered_tip_height',10000,'target_tip_height',10000,'covered_tip_hash',lpad(to_hex(10000),64,'0'),'status','complete'),now());
INSERT INTO ops.sync_cursors(dataset_id,stream,cursor_value) VALUES('{SCALE}','source_events',1000000),('{SCALE}','event_observations',0),('{SCALE}','tip_observations',1),('{SCALE}','coverage_revisions',1);
INSERT INTO ops.source_status(dataset_id,sync_mode,source_reachable,last_cycle_at,source_event_high_water,source_observation_high_water,source_tip_high_water,source_coverage_high_water) VALUES('{SCALE}','following',true,now(),1000000,0,1,1);
UPDATE ops.active_dataset SET dataset_id='{SCALE}',projection_generation=3,projection_version=3,replay_floor=0;
ANALYZE ingest.source_events;
""")
seed_seconds = time.monotonic() - started
assert get(f"/api/v1/blocks/{B}?dataset={DATASET}")["meta"]["projection_generation"]=="4", "historical lookups must never expose a failed staging generation"
command = [str(ROOT / "target/debug/pulse-sync"), "rebuild", "--dataset-id", SCALE]
environment = dict(os.environ, PULSE_SYNC_BATCH_SIZE="500")
environment.pop("MONITOR_DATABASE_URL", None)
process = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
# Kill only our child after it reports a durable checkpoint.
try:
    for line in process.stdout:
        if "reconstruction checkpoint saved" in line:
            process.terminate()
            break
    process.wait(timeout=20)
finally:
    if process.poll() is None:
        process.kill()
        process.wait()
assert get("/api/v1/meta")["meta"]["projection_generation"] == "3"
saved = int(sql("postgres", f"SELECT event_cursor FROM ops.chain_jobs WHERE dataset_id='{SCALE}' AND generation=4"))
assert 0 < saved < 1000000, saved
started = time.monotonic()
environment["PULSE_SYNC_BATCH_SIZE"] = "10000"
result = subprocess.run(command, env=environment, text=True, capture_output=True)
assert result.returncode == 0, result.stdout + result.stderr
rebuild_seconds = time.monotonic() - started
assert get("/api/v1/meta")["meta"]["projection_generation"] == "4"
assert get("/api/v1/blocks")["branch"]["status"] == "resolved"
assert int(sql("postgres", f"SELECT count(*) FROM ingest.source_events WHERE dataset_id='{SCALE}'")) == 1000000
assert int(sql("postgres", f"SELECT count(*) FROM projection.chain_members WHERE dataset_id='{SCALE}' AND generation=4")) == 10000
plan = sql("postgres", f"EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) WITH page AS MATERIALIZED (SELECT * FROM projection.chain_headers WHERE dataset_id='{SCALE}' AND generation=4 ORDER BY height DESC,hash DESC LIMIT 51) SELECT h.*,m.selected FROM page h LEFT JOIN LATERAL(SELECT true AS selected FROM projection.chain_members m WHERE (m.dataset_id,m.generation,m.hash)=(h.dataset_id,h.generation,h.hash) LIMIT 1) m ON true ORDER BY h.height DESC,h.hash DESC")
assert "Index Scan" in plan or "Index Only Scan" in plan, plan
latencies=[]
for scope in ["all","selected"]:
    for _ in range(20):
        before=time.monotonic()
        page=get("/api/v1/blocks?scope="+scope)
        assert len(page["blocks"]) == 50
        latencies.append((time.monotonic()-before)*1000)
assert max(latencies)<1000, f"bounded lists regressed, possibly after generic-plan reuse: {latencies}"
# Call the same projector directly for a single incremental extension on this
# million-event database; the test guards the disposable fixture identity.
environment["PULSE_SCALE_DATASET"] = SCALE
incremental = subprocess.run(["cargo","test","--offline","--locked","-p","pulse-sync","scale_incremental","--","--ignored","--nocapture"], env=environment, text=True, capture_output=True, cwd=ROOT)
assert incremental.returncode == 0, incremental.stdout+incremental.stderr
report = {"events":1000000,"headers":10000,"seed_seconds":round(seed_seconds,3),"resumed_rebuild_seconds":round(rebuild_seconds,3),"list_p95_ms":round(sorted(latencies)[int(.95*(len(latencies)-1))],3),"incremental":incremental.stdout,"block_list_query_plan":json.loads(plan)}
Path("/tmp/drivechain-observatory-scale.json").write_text(json.dumps(report,indent=2))
print(f"PASS scale: 1,000,000 events, interrupted/resumed rebuild {rebuild_seconds:.2f}s, list p95 {report['list_p95_ms']:.2f}ms",flush=True)
print(incremental.stdout,flush=True)
