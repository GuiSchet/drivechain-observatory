"""Reviewed local monitor v6 contract, in separate disposable source/Observatory databases.

Executed after test-branches.py, whose protobuf wire helpers are reused.
"""

def test_v6():
    dataset = "66666666-6666-4666-8666-666666666666"
    run = "77777777-7777-4777-8777-777777777777"
    source_schema = ROOT / "fixtures/upstream/bip300-monitor/shared/schema"

    # First reject identity reuse against the existing v5 record. Only this
    # disposable fixture is mutated; the monitor checkout/deployment is untouched.
    sql("monitor_fixture", (source_schema / "0007_single_active_run.sql").read_text())
    sql("monitor_fixture", f"INSERT INTO schema_version(version) VALUES(7); UPDATE extractor_run SET event_contract_version=6 WHERE run_id='{RUN}'")
    rejected = sync(fail=True)
    assert "pre-v6 dataset" in rejected.stderr + rejected.stdout
    sql("monitor_fixture", f"UPDATE extractor_run SET event_contract_version=5 WHERE run_id='{RUN}'")
    check("v6 rejects reused pre-v6 sidechain identities")

    sql("monitor_fixture", "CREATE DATABASE monitor_v6")
    sql("postgres", "CREATE DATABASE pulse_v6")

    def source(statement, **kwargs):
        return sql("monitor_fixture", statement, db="monitor_v6", **kwargs)

    def local(statement):
        return sql("postgres", statement, db="pulse_v6")

    source((ROOT / "fixtures/0000_source_schema_version.sql").read_text())
    for migration in sorted(source_schema.glob("000[1-7]_*.sql")):
        source(migration.read_text())
    source("INSERT INTO schema_version(version) VALUES(7); GRANT USAGE ON SCHEMA public TO monitor_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor_reader;")
    environment = dict(os.environ,
        PULSE_DATASET_ID=dataset,
        MONITOR_DATABASE_URL=os.environ["MONITOR_DATABASE_URL"].rsplit("/", 1)[0] + "/monitor_v6",
        PULSE_DATABASE_URL="postgres://pulse_sync:change-me-sync@127.0.0.1:55433/pulse_v6")
    admin = dict(environment, PULSE_DATABASE_URL="postgres://pulse_admin:change-me-admin@127.0.0.1:55433/pulse_v6")
    subprocess.run([str(ROOT / "target/debug/pulse-api"), "migrate-only"], env=admin, check=True, capture_output=True)
    local("GRANT USAGE ON SCHEMA ingest,projection,ops TO pulse_sync,pulse_api; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ingest,projection,ops TO pulse_sync; GRANT SELECT ON ALL TABLES IN SCHEMA ingest,projection,ops TO pulse_api; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ops TO pulse_sync;")
    caps = json.dumps(["event_facts", "event_observations", "tip_observations", "snapshot_consistency", "per_worker_health", "mempool_backed_bmm_bid_snapshots"])
    source(f"""INSERT INTO dataset_manifest(dataset_id,network_id,activation_height,activation_block_hash,initial_node_commit,initial_enforcer_commit,initial_monitor_commit,initial_event_contract_version,capabilities,creation_reason)
      VALUES('{dataset}','betanet',967680,'00000000000000030101ba5cfea54b22becc79f95dc6040beb76e01dd9d04042','fixture','fixture','reviewed-v6-worktree',6,{lit(caps)},'isolated Observatory v6 fixture');
      INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq)
      VALUES('{run}','{dataset}','enforcer','fixture','fixture','reviewed-v6-worktree',6,{lit(caps)},'running',0);
      INSERT INTO extractor_status(dataset_id,source,run_id,last_tip_hash,last_tip_height) VALUES('{dataset}','enforcer','{run}',decode('{A}','hex'),970144);
      INSERT INTO extractor_worker_status(run_id,worker,last_success_at) VALUES('{run}','bmm_requests',now()),('{run}','mainchain_tip',now());""")

    def capture(event, consistency="stable", before=A, after=A, height=970144, group_run=run):
        group = "NULL"
        if consistency is not None:
            gid = source(f"""INSERT INTO snapshot_group(dataset_id,run_id,capture_method,started_at,finished_at,tip_before_hash,tip_before_height,tip_after_hash,tip_after_height,consistency,attempts)
              VALUES('{dataset}','{group_run}','poll',now(),now(),decode('{before}','hex'),{height},decode('{after}','hex'),{height},{lit(consistency)},1) RETURNING snapshot_group_id;""").splitlines()[0]
            group = lit(gid)
        source(f"""WITH seq AS (UPDATE extractor_run SET last_capture_seq=last_capture_seq+1 WHERE run_id='{run}' RETURNING last_capture_seq)
          INSERT INTO event_observation(dataset_id,run_id,capture_seq,capture_method,event_id,snapshot_group_id,observed_at)
          SELECT '{dataset}','{run}',last_capture_seq,'poll',{event},{group},now() FROM seq;""")

    def event(kind, name, tag, payload, body):
        stamp = 1790200000000
        enforcer = wire(tag, body)
        envelope = wire(1, enforcer) + wire(10, stamp) + wire(11, wire(1, bytes.fromhex(A)) + wire(2, 970144))
        document = {"timestamp": stamp, "observed_at_block": {"hash": A, "height": 970144}, "monitor_event": {"Enforcer": {"event": {name: payload}}}}
        identifier = source(f"""INSERT INTO event(observed_at,source,kind,block_hash,height,envelope,payload,dataset_id,event_contract_version,envelope_sha256,fact_sha256)
          VALUES(now(),'enforcer',{lit(kind)},decode('{A}','hex'),970144,decode('{envelope.hex()}','hex'),{lit(json.dumps(document))},'{dataset}',6,decode('{hashlib.sha256(envelope).hexdigest()}','hex'),decode('{hashlib.sha256(enforcer).hexdigest()}','hex')) RETURNING id;""").splitlines()[0]
        capture(identifier)
        return identifier

    header = {"hash": A, "previous_hash": FLOOR, "height": 970144, "chain_work": "01" + "00"*31, "timestamp": 1790200000}
    header_wire = wire(1, bytes.fromhex(A)) + wire(2, bytes.fromhex(FLOOR)) + wire(3, 970144) + wire(4, bytes.fromhex(header["chain_work"])) + wire(5, header["timestamp"])
    block = event("bip300_block_delta", "Bip300BlockDelta", 10, {"header": header, "coinbase_txid": "56"*32, "coinbase_messages": [], "treasury_transitions": [], "confirmed_bmm_requests": []}, wire(1, header_wire) + wire(2, bytes.fromhex("56"*32)))
    source(f"""WITH seq AS (UPDATE extractor_run SET last_capture_seq=last_capture_seq+1 WHERE run_id='{run}' RETURNING last_capture_seq)
      INSERT INTO tip_observation(dataset_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at)
      SELECT '{dataset}','{run}',last_capture_seq,'poll',decode('{A}','hex'),970144,now() FROM seq;""")
    bid = {"sidechain_number": 9, "txid": "12"*32, "critical_hash": "34"*32, "bid_sats": 18446744073709551615}
    bid_wire = wire(1, 9) + wire(2, bytes.fromhex(bid["txid"])) + wire(3, bytes.fromhex(bid["critical_hash"])) + wire(4, bid["bid_sats"])
    auction = event("bmm_requests", "BmmRequests", 11, {"previous_mainchain_block_hash": A, "requests": [bid]}, wire(1, bytes.fromhex(A)) + wire(2, bid_wire))
    empty = event("bmm_requests", "BmmRequests", 11, {"previous_mainchain_block_hash": A, "requests": []}, wire(1, bytes.fromhex(A)))
    description = bytes.fromhex("01020304")
    raw = bytes([len(description)]) + description
    description_hash = hashlib.sha256(hashlib.sha256(description).digest()).digest()[::-1]
    sidechain = {"sidechain_number": 9, "raw_description": raw.hex(), "vote_count": 1, "proposal_height": 967989, "activation_height": 968998, "declaration": None, "description_hash": description_hash.hex()}
    active_wire = wire(1, 9) + wire(2, raw) + wire(3, 1) + wire(4, 967989) + wire(5, 968998) + wire(7, description_hash)
    active = event("active_sidechains", "ActiveSidechains", 4, {"sidechains": [sidechain]}, wire(1, active_wire))
    capture(auction)

    source("DELETE FROM schema_version WHERE version=7")
    rejected = sync(fail=True, env=environment)
    assert "schema 7" in rejected.stderr + rejected.stdout
    source("INSERT INTO schema_version(version) VALUES(7)")
    sync(env=environment)
    # An explicit different UUID never switches the existing Observatory database.
    mismatch = dict(environment, PULSE_DATABASE_URL=os.environ["PULSE_DATABASE_URL"])
    result = sync(fail=True, env=mismatch)
    assert "active dataset differs" in result.stdout + result.stderr
    assert get("/api/v1/meta")["meta"]["dataset_id"] == DATASET

    api_environment = dict(environment, PULSE_DATABASE_URL="postgres://pulse_api:change-me-api@127.0.0.1:55433/pulse_v6", PULSE_API_BIND="127.0.0.1:18081")
    api = subprocess.Popen([str(ROOT / "target/debug/pulse-api")], env=api_environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def read(path):
        with urllib.request.urlopen("http://127.0.0.1:18081" + path, timeout=10) as response:
            return json.load(response)
    try:
        for _ in range(40):
            try:
                read("/health/ready")
                break
            except (urllib.error.URLError, json.JSONDecodeError):
                time.sleep(.1)
        assert read("/api/v1/meta")["current_run"]["event_contract_version"] == 6
        assert read(f"/api/v1/blocks/{A}")["block"]["chain_work"] == "1"
        assert read(f"/api/v1/datasets/{dataset}/events/{block}")["interpretation_error"] is None
        evidence = read(f"/api/v1/datasets/{dataset}/events/{active}")
        assert description_hash.hex() in evidence["payload_json"]
        assert evidence["event_contract_version"] == 6
        assert read("/api/v1/bmm/auctions")["state"] == "available"
        assert read("/api/v1/bmm/auctions")["requests"][0]["bid_sats"] == str(bid["bid_sats"])
        capture(empty)
        sync(env=environment)
        assert read("/api/v1/bmm/auctions")["state"] == "empty"
        previous_run = "88888888-8888-4888-8888-888888888888"
        source(f"""INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq,finished_at)
          SELECT '{previous_run}',dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,'completed',0,now() FROM extractor_run WHERE run_id='{run}';""")
        for invalid in [{"consistency": None}, {"consistency": "changed"}, {"before": B}, {"after": B}, {"height": 970145}, {"group_run": previous_run}]:
            capture(auction, **invalid)
            sync(env=environment)
            sample = read("/api/v1/bmm/auctions")
            assert sample["state"] == "inconsistent_snapshot", (invalid, sample)
            assert sample["source_event_id"] == auction
        capture(auction)
        sync(env=environment)
        assert read("/api/v1/bmm/auctions")["state"] == "available"
        source(f"UPDATE extractor_run SET event_contract_version=7 WHERE run_id='{run}'")
        sync(fail=True, env=environment)
        assert read("/api/v1/status")["sync_mode"] == "incompatible"
        source(f"UPDATE extractor_run SET event_contract_version=6 WHERE run_id='{run}'")
        sync(env=environment)
        check("v6/schema 7: separate dataset, block explorer, lossless description_hash, stable BMM groups, recovery and future-contract rejection")
    finally:
        api.terminate()
        api.wait(timeout=10)

test_v6()
