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

sync("--batch-size","2","--max-pages-per-cycle","1")
settle()
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
    items=get("/api/v1/"+resource)["items"]
    assert items and all(x["hash"] is None and x["height"] is None for x in items),(resource,items)
    assert all(x["data"]["observation_window"]["atomicity_proven"] is False for x in items)
assert get("/api/v1/protocol-messages")["items"]==[]
assert len(get("/api/v1/deposits")["items"])==1
instance_ctips=get("/api/v1/sidechain-instances/"+quote(fixture.INSTANCE,safe="")+"/ctip")["items"]
assert instance_ctips and all(x["data"]["observation_window"]["sidechain_instance_id"]==fixture.INSTANCE for x in instance_ctips),instance_ctips
check("official observations, unanchored windows, no rules replay")
for path in ["/api/v1/status","/api/v1/coverage","/api/v1/blocks","/api/v1/events","/api/v1/bmm/commitments","/api/v1/bmm/confirmed","/api/v1/bmm/history","/api/v1/activity"]:get(path)
block=get("/api/v1/blocks/"+fixture.HASHES[9])["block"]
assert block["chain_work"]=="10" and block["block_work"]=="1",block
bmm=get("/api/v1/bmm?slot=9")
assert bmm["slots"][0]["eligible"] is None and bmm["slots"][0]["rate"] is None,bmm
check("node absolute work and unknown historical BMM eligibility")
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
f=writer();f.observe(event,9);commit(f)
assert get("/api/v1/observatory")["state"]["treasury"]["9"]["value_sats"]=="700"
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
check("invalid latest response cannot resurrect prior state")
if os.environ.get("PULSE_BROWSER_TESTS")=="1":
    subprocess.run(["node","scripts/test-official-browser.mjs"],cwd=ROOT,check=True)
# Node observations do not promote the enforcer branch.
f=writer();f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(10),raw_block="00"),10,source="node");f.tip(10,source="node");commit(f)
branch=get("/api/v1/status")["branch"]
assert branch["tip_hash"]==fixture.HASHES[9] and branch["node_tip_hash"]==fixture.HASHES[10] and branch["joint_source_status"]=="different_tips",branch
check("node advances independently without moving enforcer branch")
f=writer();f.tip(10);commit(f,10)
assert get("/api/v1/status")["branch"]["joint_source_status"]=="matched"
# Enforcer stream can be stopped while node data is imported.
sql("monitor_fixture",f"UPDATE extractor_run SET status='failed',finished_at=now(),finish_reason='test offline' WHERE run_id='{RUN}'")
f=writer();f.event("mainchain_block","MainchainBlock",dict(header=fixture.header(11),raw_block="00"),11,source="node");f.tip(11,source="node");commit(f,10)
assert get("/api/v1/blocks/"+fixture.HASHES[11])["block"]["membership"]!="selected"
check("node evidence remains importable during enforcer outage")
# Read-only source user cannot write.
sql("monitor_fixture","DELETE FROM event",user="monitor_reader",fail=True)
check("source credentials remain read-only")
# Restore source for reorg and conflict cases.
sql('monitor_fixture',f"UPDATE extractor_run SET status='running',finished_at=NULL,finish_reason=NULL WHERE run_id='{RUN}'")
# A new node fork remains alternative until the enforcer reports the same tip.
original=fixture.HASHES[10]
fixture.HASHES[10]='da'*32
f=writer();f.event('mainchain_block','MainchainBlock',dict(header=fixture.header(10),raw_block='01'),10,source='node');f.tip(10,source='node');commit(f,10)
assert get('/api/v1/status')['branch']['tip_hash']==original
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
