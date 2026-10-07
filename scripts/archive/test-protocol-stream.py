"""SSE replay boundaries on the v6 generation and exact unknown evidence."""
def sse(cursor,count=1):
    request=urllib.request.Request(BASE+'/api/v1/stream',headers={'Last-Event-ID':cursor})
    frames=[]
    with urllib.request.urlopen(request,timeout=15) as response:
        current={}
        for raw in response:
            line=raw.decode().rstrip('\r\n')
            if not line:
                if 'event' in current:
                    frames.append(current)
                    if len(frames)==count:return frames
                current={}
            elif not line.startswith(':') and ':' in line:
                key,value=line.split(':',1);current[key]=value.lstrip()
    return frames

meta=get('/api/v1/meta')['meta'];generation=meta['projection_generation'];revision=meta['pulse_revision']
cursor=f'{DATASET}:{generation}:{revision}'
sql('postgres',f"""INSERT INTO ops.pulse_updates(dataset_id,projection_generation,source_event_id,changed,activity)
SELECT '{DATASET}',{generation},NULL,'["status"]','[{{"kind":"block_observed","animation_eligible":true,"height":1,"hash":"historical"}}]'::jsonb FROM generate_series(1,1101);""")
frames=sse(cursor,1101)
assert all(f['event']=='update' for f in frames),frames[-1]
ids=[int(f['id'].split(':')[-1]) for f in frames]
assert len(set(ids))==1101 and ids==sorted(ids)
assert all(json.loads(f['data'])['activity'][0]['animation_eligible'] is False for f in frames)
assert sse('invalid')[0]['event']=='reset_required'
assert sse(f'{DATASET}:{int(generation)+99}:0')[0]['event']=='reset_required'
check('1101-frame SSE replay, scoped resets and suppressed historical animation')

# A future unrecognized fact remains available as exact JSON even when no typed
# projection understands it. The synthetic envelope is explicitly test-only.
raw='{"future_exact_integer":340282366920938463463374607431768211455}'
identifier=int(sql('monitor_fixture','SELECT max(id)+1 FROM event'))
digest=__import__('hashlib').sha256(b'future v6 fixture').hexdigest()
sql('monitor_fixture',f"INSERT INTO event(id,observed_at,source,kind,envelope,payload,dataset_id,event_contract_version,envelope_sha256,fact_sha256) OVERRIDING SYSTEM VALUE VALUES({identifier},now(),'enforcer','future_kind',decode('1234','hex'),'{raw}','{DATASET}',7,decode('{__import__('hashlib').sha256(bytes.fromhex('1234')).hexdigest()}','hex'),decode('{digest}','hex'));")
sync()
unknown=get(f'/api/v1/datasets/{DATASET}/events/{identifier}')
assert '340282366920938463463374607431768211455' in unknown['payload_json']
with urllib.request.urlopen(BASE+f'/api/v1/datasets/{DATASET}/events/{identifier}/raw') as response:assert b'340282366920938463463374607431768211455' in response.read()
check('unknown v7 facts preserve arbitrary-precision raw JSON')
