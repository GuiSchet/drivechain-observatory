"""Official-source v9 projection fixture with real protobuf envelopes, generated from the .proto.

No monitor process or network is required. Synthetic headers exercise projection joins; raw-block cryptographic validation
is tested against real serialized blocks in the monitor tests.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET = "11111111-1111-4111-8111-111111111111"
RUN = "22222222-2222-4222-8222-222222222222"
MONITOR = "0" * 40  # Synthetic provenance; never claims a deployed monitor revision.
ENFORCER = "1753fc0c23863bcb39c681e1cfaea2705613516f"
ACTIVATION = 967680
CHECKPOINT = "00000000000000030101ba5cfea54b22becc79f95dc6040beb76e01dd9d04042"
HASHES = [CHECKPOINT] + [hashlib.sha256(f"pulse-v7-block-{n}".encode()).hexdigest() for n in range(1, 30)]
NODE_RUN="33333333-3333-4333-8333-333333333333"
CAPS=["official_enforcer_api","tip_matched_snapshots","bmm_readiness_unknown","event_facts","event_observations","tip_observations","snapshot_consistency","certified_hash_history","immutable_fact_conflicts","per_worker_health","resumable_sidechain_history","node_block_evidence","absolute_chain_work","resumable_node_history","validated_chain_identity","live_bmm_bid_snapshots","extractor_status","observed_bmm_confirmed_fees"]
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
        source = (ROOT / "fixtures/v9/proto" / filename).read_text()
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


class Fixture:
    def __init__(self):
        self.sequence=0;self.node_sequence=0;self.event_id=0;self.statements=[];self.events={}
    def event(self,kind,variant,payload,n,*,slot=None,method="backfill",snapshot=False,label=None,source="enforcer"):
        self.event_id+=1;identifier=self.event_id
        anchored=kind not in ("active_sidechains","sidechain_proposals","ctip","withdrawal_bundle_proposals")
        doc=dict(timestamp=1790262000000+n*600000,observed_at_block={"hash":HASHES[n],"height":ACTIVATION+n} if anchored else None,monitor_event={"Node" if source=="node" else "Enforcer":{"event":{variant:payload}}})
        envelope=protobuf("Event",doc);body=protobuf("NodeEvent" if source=="node" else "EnforcerEvent",{"event":{variant:payload}})
        assert envelope and body,(kind,variant)
        self.statements.append(f"INSERT INTO event(id,observed_at,source,kind,sidechain,block_hash,height,envelope,payload,dataset_id,event_contract_version,envelope_sha256,fact_sha256,sidechain_instance_id,previous_hash) OVERRIDING SYSTEM VALUE VALUES({identifier},now(),{lit(source)},{lit(kind)},{slot if slot is not None else 'NULL'},{('decode('+lit(HASHES[n])+','+lit('hex')+')') if anchored else 'NULL'},{ACTIVATION+n if anchored else 'NULL'},decode('{envelope.hex()}','hex'),{lit(json.dumps(doc))},'{DATASET}',9,decode('{hashlib.sha256(envelope).hexdigest()}','hex'),decode('{hashlib.sha256(body).hexdigest()}','hex'),{lit(INSTANCE) if slot==9 else 'NULL'},{('decode('+lit(payload['header']['previous_hash'])+','+lit('hex')+')') if 'header' in payload else 'NULL'});")
        self.observe(identifier,n,method,snapshot,source=source);self.events[label or f"{kind}-{n}"]=identifier;return identifier
    def observe(self,event,n,method="poll",snapshot=True,consistency="tip_matched",source="enforcer"):
        run,seq=self.next(source);gid=f"30000000-0000-4000-8000-{seq:012d}"
        if snapshot:self.statements.append(f"INSERT INTO snapshot_group(snapshot_group_id,dataset_id,run_id,capture_method,started_at,finished_at,tip_before_hash,tip_before_height,tip_after_hash,tip_after_height,consistency,attempts) VALUES('{gid}','{DATASET}','{run}',{lit(method)},now(),now(),decode('{HASHES[n]}','hex'),{ACTIVATION+n},decode('{HASHES[n if consistency=='tip_matched' else n+1]}','hex'),{ACTIVATION+n if consistency=='tip_matched' else ACTIVATION+n+1},{lit(consistency)},1);")
        self.statements.append(f"INSERT INTO event_observation(dataset_id,run_id,capture_seq,capture_method,event_id,snapshot_group_id,observed_at) VALUES('{DATASET}','{run}',{seq},{lit(method)},{event},{lit(gid) if snapshot else 'NULL'},now());")
    def next(self,source):
        if source=="node":self.node_sequence+=1;return NODE_RUN,self.node_sequence
        self.sequence+=1;return RUN,self.sequence
    def tip(self,n,source="enforcer"):
        run,seq=self.next(source)
        self.statements.append(f"INSERT INTO tip_observation(dataset_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at) VALUES('{DATASET}','{run}',{seq},'poll',decode('{HASHES[n]}','hex'),{ACTIVATION+n},now());")
    def finish(self,n=9):
        for source,run,seq in [("enforcer",RUN,self.sequence),("node",NODE_RUN,self.node_sequence)]:
            self.statements.append(f"UPDATE extractor_run SET last_capture_seq={seq} WHERE run_id='{run}'; INSERT INTO extractor_status(dataset_id,source,run_id,last_tip_hash,last_tip_height) VALUES('{DATASET}','{source}','{run}',decode('{HASHES[n]}','hex'),{ACTIVATION+n}) ON CONFLICT(dataset_id,source) DO UPDATE SET run_id=excluded.run_id,last_tip_hash=excluded.last_tip_hash,last_tip_height=excluded.last_tip_height;")
        self.statements.append(f"SELECT setval(pg_get_serial_sequence('event','id'),{self.event_id},true);")
def official_header(n):
    return {**header(n),"cumulative_work":""}
def fixture():
    f=Fixture();caps=lit(json.dumps(CAPS))
    f.statements=["INSERT INTO schema_version(version) VALUES(7),(8),(9),(10) ON CONFLICT DO NOTHING;",
        f"INSERT INTO dataset_manifest(dataset_id,network_id,activation_height,activation_block_hash,initial_node_commit,initial_enforcer_commit,initial_monitor_commit,initial_event_contract_version,capabilities,creation_reason) VALUES('{DATASET}','betanet',{ACTIVATION},'{CHECKPOINT}','ca64033c137457a3c8ca394186759819a2ab0694','{ENFORCER}','{MONITOR}',9,{caps},'Fresh official-source projection fixture');"]
    for run,source in [(RUN,"enforcer"),(NODE_RUN,"node")]:f.statements.append(f"INSERT INTO extractor_run(run_id,dataset_id,source,node_commit,enforcer_commit,monitor_commit,event_contract_version,capabilities,status,last_capture_seq) VALUES('{run}','{DATASET}','{source}','ca64033c137457a3c8ca394186759819a2ab0694','{ENFORCER}','{MONITOR}',9,{caps},'running',0);")
    f.statements.append(f"INSERT INTO sidechain_instance(dataset_id,sidechain_instance_id,sidechain,raw_description,description_sha256d,proposal_height,activation_height) VALUES('{DATASET}','{INSTANCE}',9,decode('{RAW_DESCRIPTION}','hex'),decode('{DESCRIPTION_HASH}','hex'),{ACTIVATION+1},{ACTIVATION+4});")
    f.event("chain_info","ChainInfo",dict(network=2,raw_network=2,bip300_constants=CONSTANTS),0,method="startup")
    for n in range(10):
        f.event("mainchain_block","MainchainBlock",dict(header=header(n),raw_block="00"),n,source="node")
        if n>=4:
            events=[]
            if n==5:events=[{"event":{"Deposit":dict(sequence_number=0,outpoint=dict(txid=DEPOSIT_TXID,vout=0),address="abcd",value_sats=1000)}}]
            f.event("block_connected","BlockConnected",dict(header=official_header(n),sidechain_number=9,bmm_commitment=COMMITMENT if n==5 else None,events=events),n,slot=9)
    a=dict(sidechain_number=9,raw_description=RAW_DESCRIPTION,description_hash=DESCRIPTION_HASH,vote_count=3,proposal_height=ACTIVATION+1,activation_height=ACTIVATION+4,declaration=DECLARATION)
    f.event("active_sidechains","ActiveSidechains",dict(sidechains=[a]),9,method="poll",snapshot=True)
    f.event("sidechain_proposals","SidechainProposals",dict(proposals=[]),9,method="poll",snapshot=True)
    f.event("ctip","Ctip",dict(sidechain_number=9,ctip=dict(**CTIP2,sequence_number=1)),9,slot=9,method="poll",snapshot=True)
    f.event("withdrawal_bundle_proposals","WithdrawalBundleProposals",dict(sidechain_number=9,proposals=[dict(m6id=BUNDLE_B,vote_count=0,proposal_height=ACTIVATION+7)]),9,slot=9,method="poll",snapshot=True)
    bid=dict(sidechain_number=9,txid="12"*32,critical_hash=COMMITMENT,bid_sats=18446744073709551615)
    auction=f.event("bmm_requests","BmmRequests",dict(previous_mainchain_block_hash=HASHES[9],requests=[bid]),9,method="poll",snapshot=True,label="auction")
    f.event("bmm_requests","BmmRequests",dict(previous_mainchain_block_hash=HASHES[9],requests=[]),9,method="poll",snapshot=True,label="empty")
    f.observe(auction,9);f.tip(9);f.tip(9,source="node");f.finish()
    f.statements += [f"INSERT INTO current_sidechain_instance(dataset_id,sidechain,sidechain_instance_id,observed_at) VALUES('{DATASET}',9,'{INSTANCE}',now());",
        f"INSERT INTO extractor_worker_status(run_id,worker,last_success_at) VALUES('{RUN}','mainchain_tip',now()),('{RUN}','bmm_requests',now()),('{RUN}','mainchain_events',now()),('{RUN}','enforcer_state',now()),('{NODE_RUN}','node_history',now());",
        f"INSERT INTO history_coverage(dataset_id,event_contract_version,source,stream,coverage_start_height,covered_tip_hash,covered_tip_height,target_tip_hash,target_tip_height,status,effective_page_blocks,completed_at) VALUES('{DATASET}',9,'node','mainchain_block',{ACTIVATION},decode('{HASHES[9]}','hex'),{ACTIVATION+9},decode('{HASHES[9]}','hex'),{ACTIVATION+9},'complete',4,now());"]
    return f
if __name__=="__main__":
    Path(__file__).with_name("0012_v9_fixture.sql").write_text("-- Generated by fixtures/v9.py. Synthetic projection evidence.\n"+"\n".join(fixture().statements)+"\n")
