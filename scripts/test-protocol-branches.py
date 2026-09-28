"""Extends the isolated published-v6 fixture with forks and delayed global facts."""
import hashlib

def fresh_writer():
    writer=fixture.Fixture()
    writer.event_id=int(sql("monitor_fixture","SELECT max(id) FROM event"))
    writer.sequence=int(sql("monitor_fixture",f"SELECT last_capture_seq FROM extractor_run WHERE run_id='{RUN}'"))
    return writer

def commit_writer(writer):
    writer.statements.append(f"UPDATE extractor_run SET last_capture_seq={writer.sequence} WHERE run_id='{RUN}';")
    sql("monitor_fixture","\n".join(writer.statements))

def select_tip(n):
    writer=fresh_writer();writer.tip(n)
    writer.statements.append(f"UPDATE extractor_status SET last_tip_hash=decode('{fixture.HASHES[n]}','hex'),last_tip_height={fixture.ACTIVATION+n},updated_at=now() WHERE dataset_id='{DATASET}' AND source='enforcer';")
    commit_writer(writer)

def delta(writer,n,messages=()):
    return writer.event("bip300_block_delta","Bip300BlockDelta",dict(header=fixture.header(n),coinbase_txid=hashlib.sha256(f'coinbase-{fixture.HASHES[n]}'.encode()).hexdigest(),coinbase_messages=list(messages),treasury_transitions=[],confirmed_bmm_requests=[]),n)

original=fixture.HASHES[9]
fork=hashlib.sha256(b'pulse-v6-fork').hexdigest()
fixture.HASHES[9]=fork
writer=fresh_writer();delta(writer,9);commit_writer(writer)
sync()
assert get("/api/v1/observatory")["context"]["anchor_hash"]==original,"backfill must not select a fork"
assert get(f"/api/v1/blocks/{fork}")["block"]["membership"]=="alternative"
old_cursor=get("/api/v1/activity?limit=2")["next_cursor"]
select_tip(9);sync()
state=get("/api/v1/observatory")
assert state["context"]["anchor_hash"]==fork,state
assert state["state"]["treasury"]["9"]["value_sats"]=="1000",state
assert state["state"]["bundles"]["9:"+fixture.BUNDLE_A]["bundle"]["vote_count"]==2,state
old_success=[i for i in get("/api/v1/activity?scope=all&limit=200")["items"] if i["data"].get("status")=="succeeded"]
assert old_success and all(i["membership"]=="alternative" for i in old_success),old_success
current_attempt=get("/api/v1/bundle-attempts/"+quote(old_success[0]["entity_id"],safe=""))["items"][0]
assert current_attempt["membership"]=="selected" and current_attempt["data"]["status"]=="pending" and current_attempt["is_current"] is True,current_attempt
error("/api/v1/activity?limit=2&cursor="+old_cursor,409)
fixture.HASHES[9]=original
writer=fresh_writer();writer.event("block_disconnected","BlockDisconnected",dict(block_hash=original,sidechain_number=9),9,slot=9,method="live");commit_writer(writer)
select_tip(9);sync()
assert get("/api/v1/observatory")["state"]["treasury"]["9"]["value_sats"]=="700"
assert len(get("/api/v1/withdrawal-bundles/"+fixture.BUNDLE_A)["items"])==1,"same-block bundle lookup must not include bundle B"
check("fork rollback and A→B→A restore balances/votes, retain alternatives and reset cursors")

# H10 arrives as a slot header only. H11 has a stable bundle snapshot. Its
# provisional identity must continue to resolve when H10's M3 arrives later.
new_bundle="cc"*32
writer=fresh_writer()
writer.event("block_connected","BlockConnected",dict(header=fixture.header(10),sidechain_number=9,bmm_commitment=None,events=[]),10,slot=9)
delta(writer,11)
writer.event("withdrawal_bundle_proposals","WithdrawalBundleProposals",dict(sidechain_number=9,proposals=[dict(m6id=new_bundle,vote_count=1,proposal_height=fixture.ACTIVATION+10)]),11,slot=9,method="poll",snapshot=True)
commit_writer(writer);select_tip(11);sync()
provisional=f"9:{new_bundle}:observed:{fixture.ACTIVATION+10}"
item=get("/api/v1/bundle-attempts/"+quote(provisional,safe=""))["items"][0]
assert item["entity_id"]==provisional,item
assert get("/api/v1/observatory")["state"]["active_complete"] is False
writer=fresh_writer();delta(writer,10,[fixture.message(0,"M3",sidechain_number=9,m6id=new_bundle)]);commit_writer(writer);sync()
resolved=get("/api/v1/bundle-attempts/"+quote(provisional,safe=""))["items"][0]
assert resolved["entity_id"]==f"9:{new_bundle}:{fixture.HASHES[10]}",resolved
assert get("/api/v1/observatory")["state"]["active_complete"] is True
check("late global backfill repairs state and preserves provisional attempt links")

# Unknown builds retain raw evidence and observations, with no old-run current
# auction or verified semantic state inherited by the new run.
new_run="60000000-0000-4000-8000-000000000001"
sql("monitor_fixture",f"""UPDATE extractor_run SET status='completed',finished_at=now(),finish_reason='test restart' WHERE run_id='{RUN}';
INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq,started_at)
SELECT '{new_run}',dataset_id,source,node_commit,'unreviewed-build',monitor_commit,event_contract_version,capabilities,'running',0,now() FROM extractor_run WHERE run_id='{RUN}';
UPDATE extractor_status SET run_id='{new_run}',last_tip_hash=NULL,last_tip_height=NULL WHERE dataset_id='{DATASET}' AND source='enforcer';""")
sync()
unknown=get("/api/v1/observatory")
assert unknown["context"]["semantics_supported"] is False,unknown
assert unknown["observations"]==[],unknown
assert get("/api/v1/bmm/auctions")["state"]!="available"
assert get(f"/api/v1/datasets/{DATASET}/events/{events['auction']}")["payload_json"]
sql("monitor_fixture",f"UPDATE extractor_run SET status='completed',finished_at=now(),finish_reason='test completed' WHERE run_id='{new_run}'; UPDATE extractor_run SET status='running',finished_at=NULL,finish_reason=NULL WHERE run_id='{RUN}'; UPDATE extractor_status SET run_id='{RUN}',last_tip_hash=decode('{fixture.HASHES[11]}','hex'),last_tip_height={fixture.ACTIVATION+11} WHERE dataset_id='{DATASET}' AND source='enforcer';")
sync()
assert get("/api/v1/observatory")["context"]["semantics_supported"]
check("unreviewed run retains evidence without inheriting current snapshots or auction validity")
