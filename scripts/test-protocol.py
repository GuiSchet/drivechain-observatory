"""Fresh v7 integration, with a real read-only source and public API."""
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
spec=importlib.util.spec_from_file_location("fixture",ROOT/"fixtures/v7.py")
fixture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
DATASET,RUN=fixture.DATASET,fixture.RUN
BASE="http://127.0.0.1:18080"
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
def capture(event,*,consistency="stable",height=9):
    n=int(sql("monitor_fixture",f"SELECT last_capture_seq FROM extractor_run WHERE run_id='{RUN}'"))+1
    g=f"40000000-0000-4000-8000-{n:012d}"
    h=fixture.HASHES[height]
    sql("monitor_fixture",f"INSERT INTO snapshot_group(snapshot_group_id,dataset_id,run_id,capture_method,started_at,finished_at,tip_before_hash,tip_before_height,tip_after_hash,tip_after_height,consistency,attempts,revision_before,revision_after) VALUES('{g}','{DATASET}','{RUN}','poll',now(),now(),decode('{h}','hex'),{fixture.ACTIVATION+height},decode('{h}','hex'),{fixture.ACTIVATION+height},'{consistency}',1,'fixture:1','fixture:1'); UPDATE extractor_run SET last_capture_seq={n} WHERE run_id='{RUN}'; INSERT INTO event_observation(dataset_id,run_id,capture_seq,capture_method,event_id,snapshot_group_id,observed_at) VALUES('{DATASET}','{RUN}',{n},'poll',{event},'{g}',now());")

sync("--batch-size","2","--max-pages-per-cycle","1")
assert get("/api/v1/status")["sync_mode"]=="catching_up"
for _ in range(10):
    sync()
    if get("/api/v1/status")["sync_mode"]=="following":break
else:raise AssertionError("sync did not finish")
meta=get("/api/v1/meta")
assert meta["current_run"]["event_contract_version"]==7
assert meta["current_run"]["enforcer_commit"]==fixture.ENFORCER
assert meta["meta"]["projection_version"]==6
state=get("/api/v1/observatory")
assert state["context"]["state"]=="available",state
assert state["state"]["active"]["9"]["declaration"]["declaration"]["V0"]["title"]==fixture.TITLE,state
assert state["state"]["treasury"]["9"]["value_sats"]=="700",state
assert state["state"]["bundles"]["9:"+fixture.BUNDLE_B]["bundle"]["vote_count"]==0
assert "9:"+fixture.BUNDLE_A not in state["state"]["bundles"]
assert all(f["first_error_event_id"] is None for f in state["context"]["families"]),state
check("fresh v7 identity, typed complete state, decreasing votes, exact CTIP")

deposits=get("/api/v1/deposits")["items"]
assert len(deposits)==1,deposits
assert deposits[0]["data"]["value_sats"]=="1000",deposits
assert len(deposits[0]["evidence"])==2,deposits
bundles=get("/api/v1/withdrawal-bundles")["items"]
assert len(bundles)==2,bundles
paid=next(x for x in bundles if x["data"]["status"]=="succeeded")
assert paid["data"]["transition"]["payout_sats"]=="250",paid
assert paid["data"]["transition"]["fee_sats"]=="50",paid
assert get("/api/v1/bundle-attempts/"+quote(paid["entity_id"],safe=""))["items"][0]["entity_id"]==paid["entity_id"]
ctip=get("/api/v1/sidechain-instances/"+quote(fixture.INSTANCE,safe="")+"/ctip")["items"]
assert any(x["data"]["ctip"] is None for x in ctip),ctip
check("global/slot deduplication, payout and fee, stable detail links, explicit no-CTIP")

auctions=get("/api/v1/bmm/auctions")
assert auctions["state"]=="available",auctions
assert auctions["requests"][0]["bid_sats"]=="18446744073709551615"
samples=get("/api/v1/bmm/history")["items"]
assert len(samples)==3 and samples[0]["evidence"][0]["event_id"]==samples[2]["evidence"][0]["event_id"],samples
confirmed=get("/api/v1/bmm/confirmed")["items"]
assert len(confirmed)==1 and confirmed[0]["data"]["fee_sats"] is None,confirmed
check("BMM occurrence history, exact max-u64 bids and unknown confirmed fee")
metric=get("/api/v1/bmm?window_blocks=24&slot=9")["slots"][0]
assert (metric["present"],metric["covered"],metric["eligible"])==(1,6,6),metric
assert metric["coverage"]==1 and metric["rate"]==1/6,metric
assert get("/api/v1/bmm?slot=8")["slots"][0]["rate"] is None
occurrences=get(f"/api/v1/datasets/{DATASET}/events/{fixture.fixture().events['auction']}/occurrences?limit=1")
assert len(occurrences["items"])==1 and occurrences["next_cursor"],occurrences
gid=occurrences["items"][0]["data"]["snapshot_group_id"]
group=get("/api/v1/snapshot-groups/"+gid)["items"][0]
assert group["data"]["tip_before_hash"]==fixture.HASHES[9],group
assert get("/api/v1/runs/"+RUN)["items"][0]["data"]["monitor_commit"]==fixture.MONITOR
check("covered BMM rates, zero-denominator null, occurrence/group/run provenance")

for resource in ["chain-info","events","protocol-messages","sidechain-proposals","sidechain-instances","ctip/history","activity","bmm/commitments"]:
    assert get("/api/v1/"+resource)["items"],resource
assert get("/api/v1/search?q="+fixture.DEPOSIT_TXID)["items"]
assert get("/api/v1/search?q="+quote(fixture.TITLE))["items"]
assert any(i["kind"]=="m4" for i in get("/api/v1/protocol-messages?slot=9")["items"])
with urllib.request.urlopen(BASE+"/docs") as docs:assert b"Drivechain - Observatory API" in docs.read()
page=get("/api/v1/protocol-messages?limit=2")
assert len(page["items"])==2 and page["next_cursor"]
next_page=get("/api/v1/protocol-messages?limit=2&cursor="+page["next_cursor"])
assert not {i["id"] for i in page["items"]}&{i["id"] for i in next_page["items"]}
error("/api/v1/protocol-messages?limit=2&slot=9&cursor="+page["next_cursor"],409)
error("/api/v1/deposits?slot=256",400)
export=get("/api/v1/export?resource=deposits&format=json&slot=9")
assert export["items"]==deposits and not export["truncated"]
with urllib.request.urlopen(BASE+"/api/v1/export?resource=deposits&format=csv") as r:
    assert b"1000" in r.read() and r.headers["x-pulse-truncated"]=="false"
check("all public resources, indexed search, scoped pagination and exports")

if os.environ.get("PULSE_BROWSER_TESTS")=="1":
    subprocess.run(["node","scripts/test-browser-v7.mjs"],cwd=ROOT,check=True)
revision=get("/api/v1/meta")["meta"]["pulse_revision"]
sync()
assert get("/api/v1/meta")["meta"]["pulse_revision"]==revision
sql("monitor_fixture","DELETE FROM event WHERE false",user="monitor_reader",fail=True)
sql("postgres","DELETE FROM ingest.source_events WHERE false",user="pulse_api",fail=True)
check("restart idempotency and read-only source/API roles")

events=fixture.fixture().events
sql("monitor_fixture",f"UPDATE extractor_worker_status SET last_success_at=now(),updated_at=now() WHERE run_id='{RUN}';")
capture(events["empty"])
sync()
assert get("/api/v1/bmm/auctions")["state"]=="empty"
capture(events["auction"],consistency="changed")
sync()
assert get("/api/v1/bmm/auctions")["state"]=="inconsistent_snapshot"
assert get("/api/v1/bmm/history")["items"][0]["quality"]=="unknown"
capture(events["auction"])
sync()
check("empty versus inconsistent snapshot; repeated facts retain per-occurrence validity")

for mutate,restore in [
    ("UPDATE extractor_run SET event_contract_version=5 WHERE status='running'","UPDATE extractor_run SET event_contract_version=7 WHERE status='running'"),
    ("UPDATE dataset_manifest SET initial_event_contract_version=5","UPDATE dataset_manifest SET initial_event_contract_version=7"),
    ("UPDATE dataset_manifest SET capabilities=capabilities-'stable_parent_bmm_snapshots'",f"UPDATE dataset_manifest SET capabilities={fixture.lit(json.dumps(fixture.CAPS))}"),
    ("UPDATE extractor_run SET capabilities=capabilities-'stable_parent_bmm_snapshots'",f"UPDATE extractor_run SET capabilities={fixture.lit(json.dumps(fixture.CAPS))}")]:
    sql("monitor_fixture",mutate);sync(fail=True)
    assert get("/api/v1/status")["sync_mode"]=="incompatible"
    sql("monitor_fixture",restore);sync()
check("v5, mixed identity, and missing v7 capability are rejected")

exec((ROOT/"scripts/test-observation-quality.py").read_text(),globals())
exec((ROOT/"scripts/test-protocol-stream.py").read_text(),globals())
exec((ROOT/"scripts/test-protocol-branches.py").read_text(),globals())

before=get("/api/v1/observatory")["state"]
environment=dict(os.environ)
environment.pop("MONITOR_DATABASE_URL",None)
run=subprocess.run([str(Path(os.environ.get("CARGO_TARGET_DIR", ROOT/"target"))/"debug/pulse-sync"),"rebuild","--dataset-id",DATASET],capture_output=True,text=True,env=environment)
assert run.returncode==0,run.stdout+run.stderr
assert get("/api/v1/observatory")["state"]==before
assert get("/api/v1/deposits")["items"][0]["data"]["value_sats"]=="1000"
check("offline generation reconstruction equals incremental interpretation")
exec((ROOT/"scripts/test-protocol-corrections.py").read_text(),globals())
print("V7 protocol integration passed",flush=True)

if os.environ.get("PULSE_SCALE_TESTS")=="1":
    exec((ROOT/"scripts/test-scale-v7.py").read_text(),globals())
