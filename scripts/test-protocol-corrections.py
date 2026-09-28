"""Regression cases for projection v5, in verify-local's disposable database.

Corrupt JSON is injected before import to exercise interpretation failures; the
ordinary fixture continues to supply wire envelopes and immutable source IDs.
"""


def observation(event, n, *, run=RUN, snapshot=False, consistency="stable", old=False):
    seq = int(sql("monitor_fixture", f"SELECT last_capture_seq FROM extractor_run WHERE run_id='{run}'")) + 1
    group = f"71000000-0000-4000-8000-{int(sql('monitor_fixture','SELECT count(*)+1 FROM snapshot_group')):012d}"
    h = fixture.HASHES[n]
    statements = []
    if snapshot:
        statements.append(f"INSERT INTO snapshot_group(snapshot_group_id,dataset_id,run_id,capture_method,started_at,finished_at,tip_before_hash,tip_before_height,tip_after_hash,tip_after_height,consistency,attempts) VALUES('{group}','{DATASET}','{run}','poll',now(),now(),decode('{h}','hex'),{fixture.ACTIVATION+n},decode('{h}','hex'),{fixture.ACTIVATION+n},'{consistency}',1);")
    when = "now()-interval '1 hour'" if old else "now()"
    statements.append(f"UPDATE extractor_run SET last_capture_seq={seq} WHERE run_id='{run}'; INSERT INTO event_observation(dataset_id,run_id,capture_seq,capture_method,event_id,snapshot_group_id,observed_at) VALUES('{DATASET}','{run}',{seq},'poll',{event},{fixture.lit(group) if snapshot else 'NULL'},{when});")
    sql("monitor_fixture", "\n".join(statements))


def extra_run(identifier, commit):
    sql("monitor_fixture", f"INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq,started_at,finished_at,finish_reason) SELECT '{identifier}',dataset_id,source,node_commit,'{commit}',monitor_commit,6,capabilities,'completed',0,now(),now(),'correction fixture' FROM extractor_run WHERE run_id='{RUN}';")


def imported_state():
    return get("/api/v1/observatory")


def assert_watermark_at_cut():
    c = imported_state()["context"]
    assert c["state"] == "available", c
    assert c["meta"]["data_as_of_event_id"] == c["source_event_cut"], c
    assert all(f["first_error_event_id"] is None for f in c["families"]), c


def rebuild_local(*, fail=False, fresh=False):
    env = dict(os.environ)
    env.pop("MONITOR_DATABASE_URL", None)
    result = subprocess.run([str(ROOT/"target/debug/pulse-sync"),"rebuild","--dataset-id",DATASET,*(["--fresh"] if fresh else [])],env=env,capture_output=True,text=True)
    assert (result.returncode != 0) == fail, result.stdout + result.stderr
    return result


# An old observation with a different parent must remain stale.
# Browser checks can outlast worker freshness; model a healthy worker separately.
sql("monitor_fixture",f"UPDATE extractor_worker_status SET last_success_at=now(),updated_at=now() WHERE run_id='{RUN}';")
observation(events["auction"], 9, snapshot=True, old=True)
sync()
assert get("/api/v1/bmm/auctions")["state"] == "stale"
observation(events["auction"], 9, snapshot=True)
sync()
assert get("/api/v1/bmm/auctions")["state"] == "awaiting_current_parent"
check("expired auction is not relabeled as awaiting current parent")

# Root header errors and unstable snapshots must not erase protocol state.
baseline = imported_state()["state"]
writer = fresh_writer()
bad_header = dict(fixture.header(11), height=fixture.ACTIVATION+12)
writer.event("chain_tip", "ChainTip", dict(header=bad_header), 11)
bad_bundle = writer.event("withdrawal_bundle_proposals", "WithdrawalBundleProposals", dict(sidechain_number=7, proposals=[dict(m6id="dd"*32,vote_count=1,proposal_height=fixture.ACTIVATION+10)]),11,slot=7,snapshot=True)
bad_bid = writer.event("bmm_requests", "BmmRequests", dict(previous_mainchain_block_hash=fixture.HASHES[11],requests=[dict(sidechain_number=7,txid="ee"*32,critical_hash="ff"*32,bid_sats=1)]),11,snapshot=True)
writer.statements += [
    f"UPDATE event SET payload=jsonb_set(payload,'{{monitor_event,Enforcer,event,WithdrawalBundleProposals,proposals,0,m6id}}','\"invalid-hex\"') WHERE id={bad_bundle};",
    f"UPDATE event SET payload=jsonb_set(payload,'{{monitor_event,Enforcer,event,BmmRequests,requests,0,txid}}','\"invalid-hex\"') WHERE id={bad_bid};",
    f"UPDATE snapshot_group SET consistency='changed' WHERE snapshot_group_id IN (SELECT snapshot_group_id FROM event_observation WHERE event_id IN ({bad_bundle},{bad_bid}));",
]
commit_writer(writer); sync()
assert imported_state()["state"] == baseline
assert get("/api/v1/status")["branch"]["status"] != "ambiguous"
assert_watermark_at_cut()
assert sql("postgres",f"SELECT error_event_id IS NOT NULL FROM ops.projection_progress WHERE dataset_id='{DATASET}' AND name='bmm'") == "t", "exercise the legacy latch"
check("malformed redundant header and unstable state/mempool snapshots remain diagnostics")

# Reviewed evidence arriving only as occurrences repairs an already imported gap.
unreviewed = "72000000-0000-4000-8000-000000000001"
extra_run(unreviewed, "unreviewed-build")
writer = fresh_writer(); pending = delta(writer,12)
# Archive this occurrence under an unreviewed run before it is imported.
writer.statements.append(f"UPDATE event_observation SET run_id='{unreviewed}',capture_seq=1 WHERE event_id={pending}; UPDATE extractor_run SET last_capture_seq=1 WHERE run_id='{unreviewed}';")
commit_writer(writer); select_tip(12); sync()
assert imported_state()["state"]["active_complete"] is False
cut = imported_state()["context"]["source_event_cut"]
observation(pending,12)
sync()
assert imported_state()["context"]["source_event_cut"] == cut
assert imported_state()["state"]["active_complete"] is True
assert_watermark_at_cut()
check("reviewed re-observation repairs an old global gap without a new fact")

# Unreviewed malformed facts and contradictory parameters do not poison rules.
writer = fresh_writer()
wrong = dict(fixture.CONSTANTS,withdrawal_bundle_inclusion_threshold=99)
param = writer.event("chain_info","ChainInfo",dict(network=2,raw_network=2,bip300_constants=wrong),12,snapshot=True)
bad = writer.event("ctip","Ctip",dict(sidechain_number=7,ctip=dict(txid="ab"*32,vout=0,value_sats=1)),12,slot=7,snapshot=True)
writer.statements += [f"UPDATE event SET payload=jsonb_set(payload,'{{monitor_event,Enforcer,event,Ctip,ctip,txid}}','\"invalid-hex\"') WHERE id={bad};"]
for seq, event in enumerate([param,bad],2):
    writer.statements.append(f"UPDATE snapshot_group SET run_id='{unreviewed}' WHERE snapshot_group_id IN (SELECT snapshot_group_id FROM event_observation WHERE event_id={event}); UPDATE event_observation SET run_id='{unreviewed}',capture_seq={seq} WHERE event_id={event};")
writer.statements.append(f"UPDATE extractor_run SET last_capture_seq=3 WHERE run_id='{unreviewed}';")
commit_writer(writer); sync()
assert imported_state()["context"]["semantics_supported"] is True
assert_watermark_at_cut()
check("unreviewed errors and constants do not cap completeness or disable rules")

# Reviewed restart with no startup parameters yet reuses verified constants.
reviewed = "72000000-0000-4000-8000-000000000002"
extra_run(reviewed, fixture.ENFORCER)
versions = sql("postgres",f"SELECT count(*) FROM projection.protocol_block_versions WHERE dataset_id='{DATASET}'")
sql("monitor_fixture",f"UPDATE extractor_run SET status='completed',finished_at=now(),finish_reason='fixture restart' WHERE run_id='{RUN}'; UPDATE extractor_status SET run_id='{reviewed}' WHERE dataset_id='{DATASET}' AND source='enforcer'; UPDATE extractor_run SET status='running',finished_at=NULL,finish_reason=NULL,last_capture_seq=1 WHERE run_id='{reviewed}'; INSERT INTO tip_observation(dataset_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at) VALUES('{DATASET}','{reviewed}',1,'startup',decode('{fixture.HASHES[12]}','hex'),{fixture.ACTIVATION+12},now());")
sync()
assert imported_state()["context"]["semantics_supported"] is True
assert sql("postgres",f"SELECT count(*) FROM projection.protocol_block_versions WHERE dataset_id='{DATASET}'") == versions
# A newly anchored but identical parameter fact must not dirty the full history.
writer=fresh_writer(); same=writer.event("chain_info","ChainInfo",dict(network=2,raw_network=2,bip300_constants=fixture.CONSTANTS),12,snapshot=True)
commit_writer(writer)
observation(same,12,run=reviewed,snapshot=True)
sync()
assert imported_state()["context"]["semantics_supported"] is True
assert sql("postgres",f"SELECT count(*) FROM projection.protocol_block_versions WHERE dataset_id='{DATASET}'") == versions
sql("monitor_fixture",f"UPDATE extractor_status SET run_id='{RUN}' WHERE dataset_id='{DATASET}' AND source='enforcer'; UPDATE extractor_run SET status='completed',finished_at=now(),finish_reason='fixture restart finished' WHERE run_id='{reviewed}'; UPDATE extractor_run SET status='running',finished_at=NULL,finish_reason=NULL WHERE run_id='{RUN}';")
sync()
check("reviewed restart and identical constants preserve rules without full replay")

# Missing selected tip header is blocking, but independent valid evidence repairs it.
writer=fresh_writer()
writer.event("chain_tip","ChainTip",dict(header=dict(fixture.header(13),height=fixture.ACTIVATION+14)),13)
commit_writer(writer); select_tip(13); sync()
assert get("/api/v1/status")["branch"]["status"] == "ambiguous"
rebuild_local(fail=True)
writer=fresh_writer(); delta(writer,13); commit_writer(writer); sync()
assert get("/api/v1/status")["branch"]["status"] == "resolved"
assert_watermark_at_cut()
# Fresh is needed because the failed attempt correctly keeps its old fixed cut.
before=imported_state()["state"]
rebuild_local(fresh=True)
assert imported_state()["state"] == before
check("valid independent header repairs selected branch and enables rebuild promotion")

# Stable malformed snapshot is a historical error in its family, not all slots.
observation(bad_bundle,11,snapshot=True)
sync()
assert imported_state()["state"]["bundle_complete"] == before["bundle_complete"]
context=imported_state()["context"]
assert context["state"] == "partial"
assert {f["family"] for f in context["families"] if f["first_error_event_id"]} == {"bundles"}
assert int(context["meta"]["data_as_of_event_id"]) == bad_bundle-1
assert sql("postgres",f"SELECT source_event_id FROM ops.pulse_updates WHERE dataset_id='{DATASET}' ORDER BY revision DESC LIMIT 1") == str(bad_bundle-1)
# Published diagnostics must stay pinned while another branch is being built.
gen=int(context["meta"]["projection_generation"])
saved_branch=sql("postgres",f"SELECT state FROM projection.chain_state WHERE dataset_id='{DATASET}' AND generation={gen}")
sql("postgres",f"DELETE FROM projection.chain_members WHERE dataset_id='{DATASET}' AND generation={gen} AND hash='{fixture.HASHES[11]}'; UPDATE projection.chain_state SET state=jsonb_set(state,'{{processing}}','true') WHERE dataset_id='{DATASET}' AND generation={gen};")
assert imported_state()["context"]["state"] == "catching_up"
assert imported_state()["context"]["meta"]["data_as_of_event_id"] == str(bad_bundle-1)
sql("postgres",f"INSERT INTO projection.chain_members VALUES('{DATASET}',{gen},{fixture.ACTIVATION+11},'{fixture.HASHES[11]}'); UPDATE projection.chain_state SET state={fixture.lit(saved_branch)}::jsonb WHERE dataset_id='{DATASET}' AND generation={gen};")
before=imported_state()["state"]
# Simulate an upgrade with incompatible staging work left by the old binary.
active=int(imported_state()["context"]["meta"]["projection_generation"])
sql("postgres",f"UPDATE ops.active_dataset SET projection_version=4 WHERE dataset_id='{DATASET}'; INSERT INTO ops.chain_jobs(dataset_id,generation,event_cursor,implementation_version) VALUES('{DATASET}',{active+1},999999999,4);")
sync(fail=True)
rebuild_local()
assert int(imported_state()["context"]["meta"]["projection_generation"]) == active+2
assert imported_state()["state"] == before
assert imported_state()["context"]["meta"]["data_as_of_event_id"] == str(bad_bundle-1)
check("stable snapshot error caps only relevant completeness; incremental and rebuild agree")

# A real valid-header contradiction must remain ambiguous and cannot be promoted.
writer=fresh_writer()
writer.event("chain_tip","ChainTip",dict(header=dict(fixture.header(13),timestamp=1799999999)),13)
commit_writer(writer); sync()
assert get("/api/v1/status")["branch"]["status"] == "ambiguous"
generation=imported_state()["context"]["meta"]["projection_generation"]
rebuild_local(fail=True)
assert imported_state()["context"]["meta"]["projection_generation"] == generation
check("contradictory valid headers still block certification and preserve active generation")

# The same contradictory parameters become actionable only when reviewed.
observation(param,12,snapshot=True)
sync()
assert imported_state()["context"]["semantics_supported"] is False
assert any(f["family"] == "parameters" and f["first_error_event_id"] for f in imported_state()["context"]["families"])
assert imported_state()["context"]["semantics_issue"]
check("reviewed parameter contradiction disables derived rules with an explanation")
