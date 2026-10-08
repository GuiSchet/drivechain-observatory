"""Opt-in million-event read-model benchmark, inside verify-local's disposable DB.
Envelopes are synthetic markers. This exercises storage/rebuild, not wire parsing.
"""
SCALE="44444444-4444-4444-8444-444444444444"
SCALE_RUN="55555555-5555-4555-8555-555555555555"
started=time.monotonic()
constants=dict(fixture.CONSTANTS,activation_height=1)
parameters=json.dumps({"monitor_event":{"Enforcer":{"event":{"ChainInfo":{"network":2,"raw_network":2,"bip300_constants":constants}}}}})
sql("postgres",f"""
INSERT INTO ingest.datasets SELECT '{SCALE}',network_id,1,lpad('1',64,'0'),initial_node_commit,initial_enforcer_commit,initial_monitor_commit,6,capabilities,'synthetic v6 scale fixture',now(),now() FROM ingest.datasets WHERE dataset_id='{DATASET}';
INSERT INTO ingest.extractor_runs(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq,started_at)
SELECT '{SCALE_RUN}','{SCALE}','enforcer',node_commit,enforcer_commit,monitor_commit,6,capabilities,'running',10002,now() FROM ingest.extractor_runs WHERE run_id='{RUN}';
INSERT INTO ingest.extractor_status(dataset_id,source,run_id,last_tip_hash,last_tip_height,source_updated_at) VALUES('{SCALE}','enforcer','{SCALE_RUN}',decode(lpad(to_hex(10000),64,'0'),'hex'),10000,now());
INSERT INTO ingest.source_events(dataset_id,source_event_id,event_contract_version,observed_at,source_ingested_at,source,kind,block_hash,height,envelope,payload)
SELECT '{SCALE}',n,6,now(),now(),'enforcer',CASE WHEN n=1 THEN 'chain_info' WHEN n%100=0 THEN 'bip300_block_delta' ELSE 'future_kind' END,
 CASE WHEN n%100=0 THEN decode(lpad(to_hex(n/100),64,'0'),'hex') END,CASE WHEN n%100=0 THEN n/100 END,decode('00','hex'),
 CASE WHEN n=1 THEN {fixture.lit(parameters)}::jsonb
 WHEN n%100=0 THEN jsonb_build_object('monitor_event',jsonb_build_object('Enforcer',jsonb_build_object('event',jsonb_build_object('Bip300BlockDelta',jsonb_build_object('header',jsonb_build_object(
 'hash',lpad(to_hex(n/100),64,'0'),'previous_hash',lpad(to_hex(n/100-1),64,'0'),'height',n/100,
 'chain_work',lpad(to_hex((n/100)%256),2,'0')||lpad(to_hex((n/100)/256),2,'0')||repeat('00',30),'timestamp',1790200000),'coinbase_txid',repeat('aa',32),'coinbase_messages','[]'::jsonb,'treasury_transitions','[]'::jsonb,'confirmed_bmm_requests','[]'::jsonb))))) ELSE '{{}}'::jsonb END FROM generate_series(1,1000000) n;
INSERT INTO ingest.event_observations(dataset_id,observation_id,run_id,capture_seq,capture_method,source_event_id,observed_at,source_ingested_at)
SELECT '{SCALE}',n+1,'{SCALE_RUN}',n+1,'backfill',CASE WHEN n=0 THEN 1 ELSE n*100 END,now(),now() FROM generate_series(0,10000) n;
INSERT INTO ingest.tip_observations(dataset_id,tip_observation_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at,source_ingested_at) VALUES('{SCALE}',1,'{SCALE_RUN}',10002,'poll',decode(lpad(to_hex(10000),64,'0'),'hex'),10000,now(),now());
INSERT INTO ops.sync_cursors(dataset_id,stream,cursor_value) VALUES('{SCALE}','projection_events',1000000),('{SCALE}','source_events',1000000),('{SCALE}','event_observations',10001),('{SCALE}','tip_observations',1),('{SCALE}','coverage_revisions',0);
INSERT INTO ops.source_status(dataset_id,sync_mode,source_reachable,last_cycle_at,source_event_high_water,source_observation_high_water,source_tip_high_water,source_coverage_high_water) VALUES('{SCALE}','following',true,now(),1000000,10001,1,0);
UPDATE ops.active_dataset SET dataset_id='{SCALE}',projection_generation=4,projection_version=4,replay_floor=0;
ANALYZE ingest.source_events;
ANALYZE ingest.event_observations;
""")
seed=time.monotonic()-started
command=[str(ROOT/'target/debug/pulse-sync'),'rebuild','--dataset-id',SCALE]
env=dict(os.environ,PULSE_SYNC_BATCH_SIZE='500');env.pop('MONITOR_DATABASE_URL',None)
process=subprocess.Popen(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
try:
    for line in process.stdout:
        if 'reconstruction checkpoint saved' in line:process.terminate();break
    process.wait(timeout=20)
finally:
    if process.poll() is None:process.kill();process.wait()
assert get('/api/v1/meta')['meta']['projection_generation']=='4'
saved=int(sql('postgres',f"SELECT event_cursor FROM ops.chain_jobs WHERE dataset_id='{SCALE}' AND generation=5"));assert 0<saved<1000000,saved
started=time.monotonic();env['PULSE_SYNC_BATCH_SIZE']='10000'
result=subprocess.run(command,env=env,text=True,capture_output=True);assert result.returncode==0,result.stdout+result.stderr
rebuild=time.monotonic()-started
assert get('/api/v1/meta')['meta']['projection_generation']=='5'
assert get('/api/v1/observatory')['state']['active_complete'] is True
assert int(sql('postgres',f"SELECT count(*) FROM projection.chain_members WHERE dataset_id='{SCALE}' AND generation=5"))==10000
assert int(sql('postgres',f"SELECT count(*) FROM projection.protocol_checkpoints WHERE dataset_id='{SCALE}' AND generation=5"))==10
latencies=[]
for resource in ['blocks?scope=all','blocks?scope=selected','events','protocol-messages','ctip/history','bmm?window_blocks=1008&slot=9']:
    for _ in range(8):
        start=time.monotonic();get('/api/v1/'+resource);latencies.append((time.monotonic()-start)*1000)
assert max(latencies)<2000,latencies
plan=sql('postgres',f"EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT event_id,ordinal FROM projection.protocol_facts WHERE dataset_id='{SCALE}' AND generation=5 AND kind='block_delta' ORDER BY event_id DESC,ordinal DESC LIMIT 51")
assert 'Index' in plan,plan
env['PULSE_SCALE_DATASET']=SCALE
incremental=subprocess.run(['cargo','test','--offline','--locked','-p','pulse-sync','scale_incremental','--','--ignored','--nocapture'],env=env,text=True,capture_output=True,cwd=ROOT)
assert incremental.returncode==0,incremental.stdout+incremental.stderr
print(incremental.stdout,flush=True)
report={'events':1000000,'headers':10000,'seed_seconds':round(seed,3),'resumed_rebuild_seconds':round(rebuild,3),'list_p95_ms':round(sorted(latencies)[int(.95*(len(latencies)-1))],3),'protocol_query_plan':json.loads(plan),'incremental':incremental.stdout}
Path('/tmp/drivechain-observatory-scale-v6.json').write_text(json.dumps(report,indent=2))
print(f"PASS v6 scale: million events, 10000 headers, resumed rebuild {rebuild:.2f}s, list p95 {report['list_p95_ms']}ms",flush=True)
