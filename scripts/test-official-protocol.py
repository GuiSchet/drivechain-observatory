"""Official-source v9 integration, with a real read-only source and public API."""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("fixture",ROOT/"fixtures/v9.py")
fixture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
DATASET,RUN=fixture.DATASET,fixture.RUN
BASE="http://127.0.0.1:"+os.environ.get("PULSE_TEST_API_PORT","18080")
COMPOSE=["docker","compose","-p",os.environ["PULSE_TEST_COMPOSE_PROJECT"],"--env-file","deploy/.env.example","-f","deploy/compose.yaml","-f","deploy/compose.dev.yaml"]

def sql(service,statement,*,user=None,fail=False):
    source=service=="monitor_fixture"
    p=subprocess.run(COMPOSE+["exec","-T",service,"psql","-XAt","-v","ON_ERROR_STOP=1","-U",user or ("monitor_owner" if source else "pulse_admin"),"-d","bip300_monitor" if source else "drivechain_pulse"],input=statement,text=True,capture_output=True,cwd=ROOT)
    assert (p.returncode!=0)==fail,p.stderr
    return p.stdout.strip()
def sync(*args,fail=False,env=None):
    p=subprocess.run([str(Path(os.environ.get("CARGO_TARGET_DIR", ROOT/"target"))/"debug/pulse-sync"),"--once",*args],env=env,capture_output=True,text=True)
    assert (p.returncode!=0)==fail,p.stdout+p.stderr
    return p
def get(path):
    with urllib.request.urlopen(BASE+path,timeout=15) as r:return json.load(r)
def check(name):print("PASS "+name,flush=True)
def error(path,status):
    try:get(path)
    except urllib.error.HTTPError as e:
        assert e.code==status,e.read()
        return
    raise AssertionError("expected HTTP "+str(status))

def settle():
    for _ in range(30):
        sync()
        if get("/api/v1/status")["sync_mode"]=="following":return
    raise AssertionError(get("/api/v1/status"))

def writer():
    f=fixture.Fixture()
    f.event_id=int(sql("monitor_fixture","SELECT max(id) FROM event"))
    f.sequence=int(sql("monitor_fixture",f"SELECT last_capture_seq FROM extractor_run WHERE run_id='{RUN}'"))
    f.node_sequence=int(sql("monitor_fixture",f"SELECT last_capture_seq FROM extractor_run WHERE run_id='{fixture.NODE_RUN}'"))
    return f

def commit(f,n=9):
    f.finish(n);sql("monitor_fixture","\n".join(f.statements));settle()

# A page bounded by bytes keeps the cycle paging: with a one-byte budget every
# page is a single (oversized) event, and one cycle still imports them all.
sync("--event-page-bytes","1","--max-pages-per-cycle","1000")
assert sql("postgres","SELECT cursor_value FROM ops.sync_cursors WHERE stream='source_events'")==sql("monitor_fixture","SELECT max(id) FROM event")
check("byte-bounded event pages import oversized events one at a time")
sync("--batch-size","2","--max-pages-per-cycle","1")
settle()
# Node raw blocks are imported without their body; both source hashes stay verbatim.
BLOCKS="FROM {table} WHERE source='node' AND kind='mainchain_block'"
shape=sql("postgres","SELECT count(*),bool_and(octet_length(envelope)=0),bool_and(NOT payload #> '{monitor_event,Node,event,MainchainBlock}' ? 'raw_block') "+BLOCKS.format(table="ingest.source_events"))
assert shape.split("|")[0]!="0" and shape.endswith("|t|t"),shape
hashes="string_agg({id}||':'||encode(fact_sha256,'hex')||':'||encode(envelope_sha256,'hex'),',' ORDER BY {id}) "
source_hashes=sql("monitor_fixture","SELECT "+hashes.format(id="id")+BLOCKS.format(table="event"))
imported_hashes=sql("postgres","SELECT "+hashes.format(id="source_event_id")+BLOCKS.format(table="ingest.source_events"))
assert source_hashes==imported_hashes,(source_hashes,imported_hashes)
block_event=imported_hashes.split(":")[0]
evidence=get(f"/api/v1/datasets/{DATASET}/events/{block_event}")
assert evidence["raw_block_omitted"] and evidence["envelope_hex"]=="" and "raw_block" not in evidence["payload_json"],evidence
other=sql("postgres","SELECT min(source_event_id) FROM ingest.source_events WHERE kind<>'mainchain_block'")
assert not get(f"/api/v1/datasets/{DATASET}/events/{other}")["raw_block_omitted"]
# The migration strips rows imported in full before this change, and is idempotent.
sql("postgres",f"UPDATE ingest.source_events SET envelope='\\x01'::bytea, payload=jsonb_set(payload,'{{monitor_event,Node,event,MainchainBlock,raw_block}}','\"00\"') WHERE source_event_id={block_event}")
strip=(ROOT/"migrations/0013_strip_raw_blocks.sql").read_text()
sql("postgres",strip);sql("postgres",strip)
assert sql("postgres","SELECT count(*) "+BLOCKS.format(table="ingest.source_events")+" AND (octet_length(envelope)>0 OR payload #> '{monitor_event,Node,event,MainchainBlock}' ? 'raw_block')")=="0"
settle()
check("node raw blocks import as headers with verbatim source hashes")
# A long cycle that commits pages is alive, even after an earlier failed cycle.
sql("postgres","UPDATE ops.source_status SET sync_mode='interrupted',source_reachable=false,last_cycle_at=now()-interval '10 minutes'; UPDATE ops.sync_cursors SET updated_at=now()-interval '11 minutes'")
status=get("/api/v1/status")
assert status["sync_mode"]=="interrupted" and not status["source_reachable"],status
sql("postgres","UPDATE ops.sync_cursors SET updated_at=now() WHERE stream='source_events'")
status=get("/api/v1/status")
assert status["sync_mode"]=="catching_up" and status["source_reachable"] and not status["sync_stale"],status
settle()
assert all(int(c["imported_through"])<=int(c["source_high_water"]) for c in get("/api/v1/status")["cursors"]),get("/api/v1/status")["cursors"]
check("page progress keeps status live; high water never trails the cursor")
meta=get("/api/v1/meta")
assert meta["meta"]["projection_version"]==8,meta
assert meta["current_run"]["event_contract_version"]==9
state=get("/api/v1/observatory")
assert state["context"]["state"]=="available",state
assert state["context"]["branch"]["joint_source_status"]=="matched",state
assert not state["context"]["semantics_supported"]
assert state["state"]["treasury"]["9"]["value_sats"]=="700",state
assert state["state"]["active"]["9"]["declaration"]["declaration"]["V0"]["title"]==fixture.TITLE,state
assert all(x["hash"] is None and x["height"] is None and x["quality"]=="tip_matched" for x in state["observations"]),state
for resource in ["sidechain-instances","withdrawal-bundles","ctip/history"]:
    # Snapshot rows only; block outcomes in the bundle list are anchored facts.
    items=[x for x in get("/api/v1/"+resource)["items"] if x["kind"]!="bundle_outcome"]
    assert items and all(x["hash"] is None and x["height"] is None for x in items),(resource,items)
    assert all(x["data"]["observation_window"]["atomicity_proven"] is False for x in items)
assert get("/api/v1/protocol-messages")["items"]==[]
assert len(get("/api/v1/deposits")["items"])==1
instance_ctips=get("/api/v1/sidechain-instances/"+quote(fixture.INSTANCE,safe="")+"/ctip")["items"]
assert instance_ctips and all(x["data"]["observation_window"]["sidechain_instance_id"]==fixture.INSTANCE for x in instance_ctips),instance_ctips
bundles=get("/api/v1/withdrawal-bundles?scope=all")["items"]
assert {x["kind"] for x in bundles}=={"bundle","bundle_outcome"},bundles
outcome=next(x for x in bundles if x["kind"]=="bundle_outcome")
assert "Succeeded" in outcome["data"]["state"] and outcome["data"]["m6id"]==fixture.BUNDLE_A,outcome
pending=next(x for x in bundles if x["kind"]=="bundle")
attempt=get("/api/v1/bundle-attempts?scope=all&key="+quote(pending["entity_id"],safe=""))["items"]
assert attempt and attempt[0]["entity_id"]==pending["entity_id"],attempt
gaps=get("/api/v1/coverage")["transition_gaps"]
assert gaps and gaps[0]["gap_start_height"]==fixture.ACTIVATION+7 and gaps[0]["gap_end_height"]==fixture.ACTIVATION+9,gaps
check("official observations, unanchored windows, no rules replay")
for path in ["/api/v1/status","/api/v1/coverage","/api/v1/blocks","/api/v1/events","/api/v1/bmm/commitments","/api/v1/bmm/confirmed","/api/v1/bmm/history","/api/v1/activity"]:get(path)
block=get("/api/v1/blocks/"+fixture.HASHES[9])["block"]
assert block["chain_work"]=="10" and block["block_work"]=="1",block
bmm=get("/api/v1/bmm?slot=9")
assert bmm["slots"][0]["eligible"] is None and bmm["slots"][0]["rate"] is None,bmm
check("node absolute work and unknown historical BMM eligibility")
def order_height(x):
    return x["height"] if x["height"] is not None else (x["data"].get("observation_window") or {}).get("reference_tip_height",-1)
def pages(path):
    items,cursor=[],None
    while True:
        page=get(path+("&cursor="+cursor if cursor else ""))
        items+=page["items"];cursor=page.get("next_cursor")
        if not cursor:return items
by_block=get("/api/v1/activity?order=block&scope=all&limit=200")["items"]
assert by_block and [order_height(x) for x in by_block]==sorted((order_height(x) for x in by_block),reverse=True),by_block
assert [x["id"] for x in pages("/api/v1/activity?order=block&scope=all&limit=1")]==[x["id"] for x in by_block]
assert [x["id"] for x in pages("/api/v1/deposits?limit=1")]==[x["id"] for x in get("/api/v1/deposits?order=block&limit=200")["items"]]
error("/api/v1/activity?order=height",400)
check("histories sort by block height with a stable cursor")
def content(x):return {k:v for k,v in x["data"].items() if k not in ("observation_window","occurrences")}
every=get("/api/v1/activity?scope=all&limit=200")["items"]
changed=get("/api/v1/activity?changes=true&scope=all&limit=200")["items"]
assert changed and {x["id"] for x in changed}<={x["id"] for x in every},changed
for entity in {x["entity_id"] for x in changed}:
    rows=sorted((x for x in every if x["entity_id"]==entity),key=lambda x:int((x["evidence"][0].get("observation_id") or 0)))
    kept=[x for i,x in enumerate(rows) if i==0 or content(x)!=content(rows[i-1])]
    assert {x["id"] for x in kept}=={x["id"] for x in changed if x["entity_id"]==entity},(entity,kept)
    # A kept row reports the latest read and total occurrences of the repeats it stands for.
    for x in (y for y in changed if y["entity_id"]==entity):
        start=next(i for i,r in enumerate(rows) if r["id"]==x["id"])
        end=next((i for i in range(start+1,len(rows)) if content(rows[i])!=content(rows[i-1])),len(rows))
        group=rows[start:end]
        assert x["observed_at"]==max(r["observed_at"] for r in group),(x,group)
        assert int(x["data"]["occurrences"])==sum(int(r["data"]["occurrences"]) for r in group),(x,group)
kinds=get("/api/v1/activity?kind=deposit,bundle_outcome&scope=all&limit=200")["items"]
assert kinds and {x["kind"] for x in kinds}<={"deposit","bundle_outcome"},kinds
assert len(kinds)==len(get("/api/v1/activity?kind=deposit&scope=all&limit=200")["items"])+len(get("/api/v1/activity?kind=bundle_outcome&scope=all&limit=200")["items"])
check("change-only histories and several kinds per query")
# New upstream source SHA is provenance, never a compatibility allowlist.
sql("monitor_fixture",f"UPDATE extractor_run SET enforcer_commit=repeat('a',40) WHERE run_id='{RUN}'")
settle();assert get("/api/v1/status")["sync_mode"]=="following"
check("compatible official update accepted without hardcoded SHA")
# Same immutable snapshot fact, newer changed occurrence: no fallback to old state.
event=fixture.fixture().events["ctip-9"]
f=writer();f.observe(event,9,consistency="changed");commit(f)
state=get("/api/v1/observatory")
assert "9" not in state["state"]["treasury"],state
latest=next(x for x in state["observations"] if x["kind"]=="ctip")
assert latest["quality"]=="unknown" and latest["hash"] is None,latest
# Fact lists report the quality and time of the latest occurrence too.
fact=next(x for x in get("/api/v1/observations?kind=ctip_snapshot")["items"] if x["kind"]=="ctip_snapshot")
assert fact["quality"]=="unknown" and fact["evidence"][0]["observation_id"],fact
assert fact["observed_at"]>=fact["first_observed_at"],fact
f=writer();f.observe(event,9);commit(f)
assert get("/api/v1/observatory")["state"]["treasury"]["9"]["value_sats"]=="700"
fact=next(x for x in get("/api/v1/observations")["items"] if x["kind"]=="ctip_snapshot")
assert fact["quality"]=="tip_matched",fact
assert all(x["quality"]=="observed" for x in get("/api/v1/chain-info")["items"])
check("latest changed occurrence cannot borrow quality from a prior occurrence")
# Time filtering uses the newer occurrence, not immutable fact creation time.
latest=get("/api/v1/ctip/history?slot=9&limit=1")["items"][0]
filtered=get("/api/v1/ctip/history?slot=9&from_time="+quote(latest["observed_at"],safe=""))["items"]
assert len(filtered)==1 and filtered[0]["id"]==latest["id"],filtered
assert not get("/api/v1/ctip/history?slot=9&time_basis=block&from_time="+quote(latest["observed_at"],safe=""))["items"]
check("repeated snapshot time filters use occurrence time; block filters exclude unanchored reads")
# Invalid latest response must hide earlier valid state, even with matching tips.
f=writer();f.event("ctip","Ctip",dict(sidechain_number=9,ctip=dict(txid="ab",vout=0,value_sats=701)),9,slot=9,snapshot=True,method="poll");commit(f)
state=get("/api/v1/observatory")
assert "9" not in state["state"]["treasury"],state
assert next(x for x in state["observations"] if x["kind"]=="ctip")["quality"]=="unknown",state
f=writer();f.observe(event,9);commit(f)
assert get("/api/v1/observatory")["state"]["treasury"]["9"]["value_sats"]=="700"
state=get("/api/v1/observatory")
treasury=next(x for x in state["context"]["families"] if x["family"]=="treasury")
assert state["context"]["state"]=="partial" and treasury["first_error_event_id"],state["context"]
check("invalid latest response cannot resurrect prior state")
# Re-reading an unchanged value adds occurrences, not history rows.
before=get("/api/v1/ctip/history?slot=9")["items"]
f=writer();f.observe(event,9);f.observe(event,9);commit(f)
after=get("/api/v1/ctip/history?slot=9")["items"]
assert len(after)==len(before),(before,after)
assert int(after[0]["data"]["occurrences"])==int(before[0]["data"]["occurrences"])+2,(before[0],after[0])
assert after[0]["observed_at"]>=before[0]["observed_at"] and after[0]["first_observed_at"]==before[0]["first_observed_at"]
# The M6 identifier is the display-order bundle txid and is searchable as such.
assert get("/api/v1/withdrawal-bundles?q="+fixture.BUNDLE_B)["items"],"bundle search"
check("unchanged snapshots extend their history row; m6id searchable")
if os.environ.get("PULSE_BROWSER_TESTS")=="1":
    subprocess.run(["node","scripts/test-official-browser.mjs"],cwd=ROOT,check=True)
# Node observations do not promote the enforcer branch.
f=writer();f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(10),raw_block="00"),10,source="node");f.tip(10,source="node");commit(f)
branch=get("/api/v1/status")["branch"]
assert branch["tip_hash"]==fixture.HASHES[9] and branch["node_tip_hash"]==fixture.HASHES[10] and branch["joint_source_status"]=="different_tips",branch
check("node advances independently without moving enforcer branch")
f=writer();f.tip(10);commit(f,10)
assert get("/api/v1/status")["branch"]["joint_source_status"]=="matched"
# The enforcer reports block 11 before the node header arrives: the selected
# branch and its protocol state are kept, never wiped or marked ambiguous.
f=writer();f.tip(11);commit(f,10)
branch=get("/api/v1/status")["branch"]
assert branch["tip_hash"]==fixture.HASHES[11] and branch["basis"]=="tip_header_missing" and branch["status"]!="ambiguous",branch
assert get("/api/v1/blocks/"+fixture.HASHES[10])["block"]["membership"]=="selected"
# Partial: an earlier test recorded an invalid CTIP fact, which bounds its family.
assert get("/api/v1/observatory")["context"]["state"] in ("available","partial")
f=writer();f.event("block_connected","BlockConnected",dict(header=fixture.official_header(11),sidechain_number=9,events=[]),11,slot=9,method="live");commit(f,10)
assert get("/api/v1/status")["branch"]["status"]!="ambiguous"
f=writer();f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(11),raw_block="00"),11,source="node");f.tip(11,source="node");f.tip(11);commit(f,11)
branch=get("/api/v1/status")["branch"]
assert branch["status"]=="resolved" and branch["joint_source_status"]=="matched",branch
assert get("/api/v1/blocks/"+fixture.HASHES[11])["block"]["membership"]=="selected"
check("an enforcer tip ahead of the node header keeps the selected branch")
# Enforcer stream can be stopped while node data is imported.
sql("monitor_fixture",f"UPDATE extractor_run SET status='failed',finished_at=now(),finish_reason='test offline' WHERE run_id='{RUN}'")
f=writer();f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(12),raw_block="00"),12,source="node");f.tip(12,source="node");commit(f,11)
assert get("/api/v1/blocks/"+fixture.HASHES[12])["block"]["membership"]!="selected"
check("node evidence remains importable during enforcer outage")
# Read-only source user cannot write.
sql("monitor_fixture","DELETE FROM event",user="monitor_reader",fail=True)
# The sync role appends evidence; it can annotate events but never rewrite them.
sql("postgres","UPDATE ingest.event_observations SET capture_seq=capture_seq",user="pulse_sync",fail=True)
sql("postgres","UPDATE ingest.source_events SET envelope=envelope",user="pulse_sync",fail=True)
sql("postgres","UPDATE ingest.source_events SET interpretation_error=interpretation_error WHERE false",user="pulse_sync")
# A rewritten dataset manifest is not silently adopted.
caps=sql("monitor_fixture",f"SELECT capabilities FROM dataset_manifest WHERE dataset_id='{DATASET}'")
sql("monitor_fixture",f"UPDATE dataset_manifest SET capabilities=capabilities||'[\"rewritten\"]' WHERE dataset_id='{DATASET}'")
p=sync(fail=True);assert "manifest changed" in p.stdout+p.stderr,p.stdout+p.stderr
sql("monitor_fixture",f"UPDATE dataset_manifest SET capabilities='{caps}' WHERE dataset_id='{DATASET}'");settle()
check("source credentials remain read-only")
# Restore source for reorg and conflict cases.
sql('monitor_fixture',f"UPDATE extractor_run SET status='running',finished_at=NULL,finish_reason=NULL WHERE run_id='{RUN}'")
# A new node fork remains alternative until the enforcer reports the same tip.
original=fixture.HASHES[10]
fixture.HASHES[10]='da'*32
f=writer();f.event('mainchain_block','MainchainBlock',dict(header=fixture.header(10),raw_block='01'),10,source='node');f.tip(10,source='node');commit(f,10)
assert get('/api/v1/status')['branch']['tip_hash']==fixture.HASHES[11]
f=writer();f.tip(10);commit(f,10)
branch=get('/api/v1/status')['branch']
assert branch['tip_hash']==fixture.HASHES[10] and branch['joint_source_status']=='matched',branch
assert get('/api/v1/blocks/'+original)['block']['membership']=='alternative'
assert get('/api/v1/blocks/'+fixture.HASHES[9])['block']['membership']=='selected'
check('one-block reorg retains old evidence and shares certified ancestor')
# Distinct content for the same immutable block is not silently selected.
f=writer();f.event('mainchain_block','MainchainBlock',dict(header=fixture.header(10),raw_block='02'),10,source='node');commit(f,10)
branch=get('/api/v1/status')['branch']
assert branch['status']=='ambiguous',branch
check('conflicting node fact blocks branch certification')
# A row committed behind the import cursor is a loud incompatibility, never a
# silently skipped fact or a foreign-key stall.
f=writer();late=f.event_id+1;f.event_id+=1
f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(13),raw_block="00"),13,source="node");commit(f,10)
f=writer();f.event_id=late-1
f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(14),raw_block="00"),14,source="node");f.finish(10)
sql("monitor_fixture","\n".join(f.statements[:-1]))
p=sync(fail=True)
assert "committed behind the import cursor" in p.stdout+p.stderr,p.stdout+p.stderr
assert get("/api/v1/status")["sync_mode"]=="incompatible"
sql("monitor_fixture",f"DELETE FROM event_observation WHERE event_id={late}; DELETE FROM event WHERE id={late}")
settle()
check("a row committed behind the import cursor stops sync loudly")
# Rewriting an already imported monitor row is detected and recorded.
def tampered(stream,change,restore):
    sql("monitor_fixture",change)
    p=sync(fail=True)
    assert "content differs" in p.stdout+p.stderr and stream in p.stdout+p.stderr,p.stdout+p.stderr
    sql("monitor_fixture",restore);settle()
first_event=sql("monitor_fixture","SELECT min(id) FROM event")
tampered("source_events",f"UPDATE event SET envelope_sha256=sha256('x') WHERE id={first_event}",
    f"UPDATE event SET envelope_sha256=sha256(envelope) WHERE id={first_event}")
first_observation=sql("monitor_fixture","SELECT min(observation_id) FROM event_observation")
tampered("event_observations",f"UPDATE event_observation SET capture_seq=capture_seq+100000 WHERE observation_id={first_observation}",
    f"UPDATE event_observation SET capture_seq=capture_seq-100000 WHERE observation_id={first_observation}")
group=sql("monitor_fixture","SELECT snapshot_group_id FROM event_observation WHERE snapshot_group_id IS NOT NULL ORDER BY observation_id LIMIT 1")
original=sql("monitor_fixture",f"SELECT consistency FROM snapshot_group WHERE snapshot_group_id='{group}'")
tampered("event_observations",f"UPDATE snapshot_group SET consistency='unknown' WHERE snapshot_group_id='{group}'",
    f"UPDATE snapshot_group SET consistency='{original}' WHERE snapshot_group_id='{group}'")
first_tip=sql("monitor_fixture","SELECT min(tip_observation_id) FROM tip_observation")
tampered("tip_observations",f"UPDATE tip_observation SET capture_seq=capture_seq+100000 WHERE tip_observation_id={first_tip}",
    f"UPDATE tip_observation SET capture_seq=capture_seq-100000 WHERE tip_observation_id={first_tip}")
first_revision=sql("monitor_fixture","SELECT min(revision_id) FROM history_coverage_revision")
tampered("coverage_revisions",f"UPDATE history_coverage_revision SET row_data=row_data||'{{\"tampered\":1}}' WHERE revision_id={first_revision}",
    f"UPDATE history_coverage_revision SET row_data=row_data-'tampered' WHERE revision_id={first_revision}")
assert int(sql("postgres","SELECT count(*) FROM ingest.import_conflicts"))==5
check("rewritten imported rows are detected in every audited stream")
