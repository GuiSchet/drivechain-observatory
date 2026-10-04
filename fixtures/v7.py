"""Observer v7 fixture with real protobuf envelopes, generated from the .proto.

No monitor process or network is required. Thresholds are deliberately small
so boundary behavior can be tested in a short deterministic observed chain.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET = "11111111-1111-4111-8111-111111111111"
RUN = "22222222-2222-4222-8222-222222222222"
MONITOR = "ecf5b8290e6b5501508a4a3913bd93c83728cca1"
ENFORCER = "9b2a15621469a88ea5d3b8f1dcd5ee1bb21e0ac4"
ACTIVATION = 967680
CHECKPOINT = "00000000000000030101ba5cfea54b22becc79f95dc6040beb76e01dd9d04042"
HASHES = [CHECKPOINT] + [hashlib.sha256(f"pulse-v7-block-{n}".encode()).hexdigest() for n in range(1, 30)]
CAPS = ["absolute_chain_work", "mempool_readiness_generation", "global_mainchain_transitions", "certified_hash_history", "immutable_fact_conflicts", "snapshot_state_revision", "event_facts", "event_observations", "tip_observations", "snapshot_consistency", "extractor_status", "per_worker_health", "resumable_sidechain_history", "resumable_global_bip300_history", "raw_bip300_coinbase_scripts", "resolved_m1_m8_deltas", "treasury_transitions", "live_bmm_bid_snapshots", "mempool_backed_bmm_bid_snapshots", "bip300_description_hash_identity", "stable_parent_bmm_snapshots", "validated_chain_identity", "orphan_run_reconciliation"]
CONSTANTS = dict(withdrawal_bundle_max_age=6, withdrawal_bundle_inclusion_threshold=2, used_sidechain_slot_proposal_max_age=10, used_sidechain_slot_activation_threshold=3, unused_sidechain_slot_proposal_max_age=8, unused_sidechain_slot_activation_threshold=2, activation_height=ACTIVATION)
TITLE = "Pulse Test Chain"
DESCRIPTION = "Deterministic observer fixture"
desc = b"\0" + bytes([len(TITLE)]) + TITLE.encode() + DESCRIPTION.encode() + bytes.fromhex("11"*32 + "22"*20)
RAW_DESCRIPTION = (bytes([len(desc)]) + desc).hex()
DESCRIPTION_HASH = hashlib.sha256(hashlib.sha256(desc).digest()).digest()[::-1].hex()
DECLARATION = {"declaration": {"V0": {"title": TITLE, "description": DESCRIPTION, "hash_id_1": "11"*32, "hash_id_2": "22"*20}}}
BUNDLE_A, BUNDLE_B = "aa"*32, "bb"*32
COMMITMENT = "cc"*32

def lit(s):
    return "'" + str(s).replace("'", "''") + "'"

def wire(n, value):
    def varint(v):
        b = bytearray()
        while v > 127:
            b.append((v & 127) | 128)
            v >>= 7
        b.append(v)
        return bytes(b)
    if isinstance(value, int):
        return varint(n << 3) + varint(value)
    return varint(n << 3 | 2) + varint(len(value)) + value

def schemas():
    result = {}
    for filename in ["event.proto", "enforcer_extractor.proto"]:
        source = (ROOT / "fixtures/v7/proto" / filename).read_text()
        current, oneof = None, None
        for line in source.splitlines():
            line = line.split("//")[0].strip()
            if match := re.match(r"message (\w+) \{", line):
                current = match[1]
                result[current] = []
            elif match := re.match(r"oneof (\w+) \{", line):
                oneof = match[1]
            elif line == "}":
                if oneof:
                    oneof = None
                else:
                    current = None
            elif current and (match := re.match(r"(?:(optional|repeated) )?([\w.]+) (\w+) = (\d+);", line)):
                result[current].append((match[2].split(".")[-1], match[3], int(match[4]), match[1] == "repeated", oneof))
    return result

SCHEMAS = schemas()
def protobuf(name, value):
    out = b""
    for typ, key, number, repeated, oneof in SCHEMAS[name]:
        if oneof:
            union = value.get(oneof) or {}
            item = next((v for k, v in union.items() if k.lower().replace("_", "") == key.replace("_", "").removesuffix("event")), None)
        else:
            item = value.get(key)
        if item is None:
            continue
        for item in item if repeated else [item]:
            if typ in SCHEMAS:
                item = protobuf(typ, item)
            elif typ == "bytes":
                item = bytes.fromhex(item)
            elif typ == "string":
                item = item.encode()
            elif isinstance(item, bool):
                item = int(item)
            out += wire(number, item)
    return out

def transaction(previous, amount, payout=None):
    outputs = [(amount, b"\x51")] + ([(payout, b"\x51")] if payout is not None else [])
    raw = bytes.fromhex("0200000001") + bytes.fromhex(previous)[::-1] + bytes.fromhex("0000000000ffffffff") + bytes([len(outputs)])
    for value, script in outputs:
        raw += value.to_bytes(8, "little") + bytes([len(script)]) + script
    raw += b"\0"*4
    return hashlib.sha256(hashlib.sha256(raw).digest()).digest()[::-1].hex(), raw.hex()

DEPOSIT_TXID, DEPOSIT_TX = transaction("01"*32, 1000)
WITHDRAW_TXID, WITHDRAW_TX = transaction(DEPOSIT_TXID, 700, 250)
CTIP1 = dict(txid=DEPOSIT_TXID, vout=0, value_sats=1000)
CTIP2 = dict(txid=WITHDRAW_TXID, vout=0, value_sats=700)
INSTANCE = f"9:{ACTIVATION+1}:{ACTIVATION+4}:{DESCRIPTION_HASH}"

def header(n, hash=None, parent=None):
    return dict(hash=hash or HASHES[n], previous_hash=parent or (HASHES[n-1] if n else "01"*32), height=ACTIVATION+n, block_work=(1).to_bytes(32,"little").hex(), cumulative_work=(n+1).to_bytes(32,"little").hex(), timestamp=1790262000+n*600)

def message(vout, typ, **data):
    return dict(vout=vout, raw_script_pubkey="6a00", accepted=True, message={typ:data})

def m4(up=None, down=(), action=2):
    return message(1,"M4",mode=2,raw_votes=[0 if action==2 else 65534],effects=[dict(sidechain_number=9,action=action,upvoted_m6id=up,downvoted_m6ids=list(down))])

class Fixture:
    def __init__(self):
        self.sequence = 0
        self.event_id = 0
        self.statements = []
        self.events = {}
    def event(self, kind, variant, payload, n, *, slot=None, method="backfill", snapshot=False, label=None):
        self.event_id += 1
        identifier = self.event_id
        doc = dict(timestamp=1790262000000+n*600000, observed_at_block={"hash":HASHES[n],"height":ACTIVATION+n}, monitor_event={"Enforcer":{"event":{variant:payload}}})
        envelope = protobuf("Event", doc)
        body = protobuf("EnforcerEvent", {"event":{variant:payload}})
        assert envelope and body, (kind, variant)
        self.statements.append(f"INSERT INTO event(id,observed_at,source,kind,sidechain,block_hash,height,envelope,payload,dataset_id,event_contract_version,envelope_sha256,fact_sha256,sidechain_instance_id,previous_hash) OVERRIDING SYSTEM VALUE VALUES({identifier},now(),'enforcer',{lit(kind)},{slot if slot is not None else 'NULL'},decode('{HASHES[n]}','hex'),{ACTIVATION+n},decode('{envelope.hex()}','hex'),{lit(json.dumps(doc))},'{DATASET}',7,decode('{hashlib.sha256(envelope).hexdigest()}','hex'),decode('{hashlib.sha256(body).hexdigest()}','hex'),{lit(INSTANCE) if slot==9 and n>=4 else 'NULL'},{('decode('+lit(payload['header']['previous_hash'])+','+lit('hex')+')') if 'header' in payload else 'NULL'});")
        self.observe(identifier,n,method,snapshot)
        self.events[label or f"{kind}-{n}"] = identifier
        return identifier
    def observe(self, event, n, method="poll", snapshot=True, consistency="stable"):
        self.sequence += 1
        gid = f"30000000-0000-4000-8000-{self.sequence:012d}"
        if snapshot:
            self.statements.append(f"INSERT INTO snapshot_group(snapshot_group_id,dataset_id,run_id,capture_method,started_at,finished_at,tip_before_hash,tip_before_height,tip_after_hash,tip_after_height,consistency,attempts,revision_before,revision_after) VALUES('{gid}','{DATASET}','{RUN}',{lit(method)},now(),now(),decode('{HASHES[n]}','hex'),{ACTIVATION+n},decode('{HASHES[n]}','hex'),{ACTIVATION+n},{lit(consistency)},1,'fixture:1','fixture:1');")
        self.statements.append(f"INSERT INTO event_observation(dataset_id,run_id,capture_seq,capture_method,event_id,snapshot_group_id,observed_at) VALUES('{DATASET}','{RUN}',{self.sequence},{lit(method)},{event},{lit(gid) if snapshot else 'NULL'},now());")
    def tip(self,n):
        self.sequence += 1
        self.statements.append(f"INSERT INTO tip_observation(dataset_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at) VALUES('{DATASET}','{RUN}',{self.sequence},'poll',decode('{HASHES[n]}','hex'),{ACTIVATION+n},now());")

def fixture():
    f = Fixture()
    caps = lit(json.dumps(CAPS))
    f.statements += [f"INSERT INTO schema_version(version) VALUES(8) ON CONFLICT DO NOTHING;",
        f"INSERT INTO dataset_manifest(dataset_id,network_id,activation_height,activation_block_hash,initial_node_commit,initial_enforcer_commit,initial_monitor_commit,initial_event_contract_version,capabilities,creation_reason) VALUES('{DATASET}','betanet',{ACTIVATION},'{CHECKPOINT}','ca64033c137457a3c8ca394186759819a2ab0694','{ENFORCER}','{MONITOR}',7,{caps},'Fresh v7 protocol integration fixture');",
        f"INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq) VALUES('{RUN}','{DATASET}','enforcer','ca64033c137457a3c8ca394186759819a2ab0694','{ENFORCER}','{MONITOR}',7,{caps},'running',0);"]
    f.event("chain_info","ChainInfo",dict(network=2,raw_network=2,bip300_constants=CONSTANTS),0,method="startup",snapshot=True)
    f.event("chain_tip","ChainTip",dict(header=header(0)),0,method="startup")
    f.event("active_sidechains","ActiveSidechains",dict(sidechains=[]),0,method="startup",snapshot=True)
    f.event("sidechain_proposals","SidechainProposals",dict(proposals=[]),0,method="startup",snapshot=True)
    for n in range(10):
        messages, transitions, requests = [], [], []
        if n==1: messages=[message(1,"M1",sidechain_number=9,description=RAW_DESCRIPTION,description_hash=DESCRIPTION_HASH)]
        if n in (2,3,4): messages=[message(1,"M2",sidechain_number=9,description_hash=DESCRIPTION_HASH,effect=2 if n==4 else 1)]
        if n==5:
            messages=[message(1,"M3",sidechain_number=9,m6id=BUNDLE_A),message(2,"M7",sidechain_number=9,hstar=COMMITMENT)]
            transitions=[dict(kind=1,sidechain_number=9,previous_ctip=None,new_ctip=CTIP1,sequence_number=0,delta_sats=1000,payout_sats=None,fee_sats=None,m6id=None,sidechain_address="abcd",transaction=DEPOSIT_TX,proposal_height=None,terminal_height=ACTIVATION+n)]
        if n==6:
            messages=[m4(BUNDLE_A)]
            requests=[dict(sidechain_number=9,txid="ee"*32,transaction=DEPOSIT_TX,hstar=COMMITMENT,previous_mainchain_block_hash=HASHES[5],fee_sats=None)]
        if n==7: messages=[m4(None,[BUNDLE_A],action=1),message(2,"M3",sidechain_number=9,m6id=BUNDLE_B)]
        if n in (8,9): messages=[m4(BUNDLE_A,[BUNDLE_B])]
        if n==9:
            transitions=[dict(kind=2,sidechain_number=9,previous_ctip=CTIP1,new_ctip=CTIP2,sequence_number=1,delta_sats=300,payout_sats=250,fee_sats=50,m6id=BUNDLE_A,sidechain_address=None,transaction=WITHDRAW_TX,proposal_height=ACTIVATION+5,terminal_height=ACTIVATION+n)]
        f.event("bip300_block_delta","Bip300BlockDelta",dict(header=header(n),coinbase_txid=f"{n+50:02x}"*32,coinbase_messages=messages,treasury_transitions=transitions,confirmed_bmm_requests=requests),n)
        if n>=4:
            events=[]
            if n==5:events=[{"event":{"Deposit":dict(sequence_number=0,outpoint=dict(txid=DEPOSIT_TXID,vout=0),address="abcd",value_sats=1000)}},{"event":{"WithdrawalBundle":dict(m6id=BUNDLE_A,state={"Submitted":{}})}}]
            if n==7:events=[{"event":{"WithdrawalBundle":dict(m6id=BUNDLE_B,state={"Submitted":{}})}}]
            if n==9:events=[{"event":{"WithdrawalBundle":dict(m6id=BUNDLE_A,state={"Succeeded":dict(sequence_number=1,transaction=WITHDRAW_TX)})}}]
            f.event("block_connected","BlockConnected",dict(header=header(n),sidechain_number=9,bmm_commitment=COMMITMENT if n==5 else None,events=events),n,slot=9)
        if n==4:
            a=dict(sidechain_number=9,raw_description=RAW_DESCRIPTION,description_hash=DESCRIPTION_HASH,vote_count=3,proposal_height=ACTIVATION+1,activation_height=ACTIVATION+4,declaration=DECLARATION)
            f.event("active_sidechains","ActiveSidechains",dict(sidechains=[a]),n,method="poll",snapshot=True)
            f.event("sidechain_proposals","SidechainProposals",dict(proposals=[]),n,method="poll",snapshot=True)
            f.event("ctip","Ctip",dict(sidechain_number=9,ctip=None),n,slot=9,method="poll",snapshot=True)
            f.event("withdrawal_bundle_proposals","WithdrawalBundleProposals",dict(sidechain_number=9,proposals=[]),n,slot=9,method="poll",snapshot=True)
    f.event("ctip","Ctip",dict(sidechain_number=9,ctip=dict(**CTIP2,sequence_number=1)),9,slot=9,method="poll",snapshot=True)
    f.event("withdrawal_bundle_proposals","WithdrawalBundleProposals",dict(sidechain_number=9,proposals=[dict(m6id=BUNDLE_B,vote_count=0,proposal_height=ACTIVATION+7)]),9,slot=9,method="poll",snapshot=True)
    bid=dict(sidechain_number=9,txid="12"*32,critical_hash=COMMITMENT,bid_sats=18446744073709551615)
    auction=f.event("bmm_requests","BmmRequests",dict(observer_session="fixture",mempool_generation=1,previous_mainchain_block_hash=HASHES[9],requests=[bid]),9,method="poll",snapshot=True,label="auction")
    f.event("bmm_requests","BmmRequests",dict(observer_session="fixture",mempool_generation=1,previous_mainchain_block_hash=HASHES[9],requests=[]),9,method="poll",snapshot=True,label="empty")
    f.observe(auction,9)
    f.tip(9)
    f.statements += [f"UPDATE extractor_run SET last_capture_seq={f.sequence} WHERE run_id='{RUN}';",
        f"INSERT INTO extractor_status(dataset_id,source,run_id,last_tip_hash,last_tip_height) VALUES('{DATASET}','enforcer','{RUN}',decode('{HASHES[9]}','hex'),{ACTIVATION+9});",
        f"INSERT INTO extractor_worker_status(run_id,worker,last_success_at) VALUES('{RUN}','mainchain_tip',now()),('{RUN}','bmm_requests',now()),('{RUN}','mainchain_events',now());",
        f"INSERT INTO sidechain_instance(dataset_id,sidechain_instance_id,sidechain,raw_description,description_sha256d,proposal_height,activation_height) VALUES('{DATASET}','{INSTANCE}',9,decode('{RAW_DESCRIPTION}','hex'),decode('{DESCRIPTION_HASH}','hex'),{ACTIVATION+1},{ACTIVATION+4});",
        f"INSERT INTO current_sidechain_instance(dataset_id,sidechain,sidechain_instance_id,observed_at) VALUES('{DATASET}',9,'{INSTANCE}',now());",
        f"INSERT INTO history_coverage(dataset_id,event_contract_version,source,stream,coverage_start_height,covered_tip_hash,covered_tip_height,target_tip_hash,target_tip_height,status,effective_page_blocks,completed_at) VALUES('{DATASET}',7,'enforcer','bip300_delta',{ACTIVATION},decode('{HASHES[9]}','hex'),{ACTIVATION+9},decode('{HASHES[9]}','hex'),{ACTIVATION+9},'complete',128,now());",
        f"SELECT setval(pg_get_serial_sequence('event','id'),{f.event_id},true);"]
    instance = next(s for s in f.statements if s.startswith("INSERT INTO sidechain_instance("))
    f.statements.remove(instance)
    f.statements.insert(3, instance)
    return f

if __name__=="__main__":
    f=fixture()
    Path(__file__).with_name("0010_v7_fixture.sql").write_text("-- Generated by fixtures/v7.py from the published protobuf contract.\n"+"\n".join(f.statements)+"\n")
