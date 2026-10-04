"""V7 wire facts and occurrence quality against the read-only imported API."""
writer = fixture.Fixture()
writer.event_id = int(sql('monitor_fixture','SELECT max(id) FROM event'))
writer.sequence = int(sql('monitor_fixture',f"SELECT last_capture_seq FROM extractor_run WHERE run_id='{RUN}'"))
for value in [None,18446744073709551615]:
    writer.event('confirmed_bmm_fees','ConfirmedBmmFees',dict(header=fixture.header(6),source='ecash-node:getblock:3',fees=[dict(sidechain_number=9,txid='ee'*32,fee_sats=value,unavailable_reason='historical_prevouts_unavailable' if value is None else '')]),6)
writer.event('mainchain_transition','MainchainTransition',dict(observer_session='quality-test',sequence=1,action=1,header=fixture.header(9)),9,method='live')
writer.statements.append(f"UPDATE extractor_run SET last_capture_seq={writer.sequence} WHERE run_id='{RUN}';")
writer.statements.append(f"INSERT INTO observation_failure(dataset_id,run_id,worker,error) VALUES('{DATASET}','{RUN}','mainchain_events','sequence gap: test evidence');")
sql('monitor_fixture','\n'.join(writer.statements)); sync()
fees=[i for i in get('/api/v1/bmm/confirmed')['items'] if i['kind']=='confirmed_bmm_fee']
assert {i['data']['fee_sats'] for i in fees}=={None,'18446744073709551615'},fees
assert get('/api/v1/blocks/'+fixture.HASHES[9])['block']['chain_work']=='10'
assert get('/api/v1/blocks/'+fixture.HASHES[9])['block']['block_work']=='1'
failures=get('/api/v1/observation-failures')['items']
assert failures[0]['data']['error']=='sequence gap: test evidence',failures
assert get('/api/v1/coverage')['observation_quality']['failures']=='1'
# A -> B -> A within a read has equal hashes but different revisions.
capture(events['auction'])
sql('monitor_fixture',f"UPDATE snapshot_group SET revision_after='fixture:3' WHERE snapshot_group_id=(SELECT snapshot_group_id FROM event_observation WHERE run_id='{RUN}' ORDER BY capture_seq DESC LIMIT 1)")
sync()
assert get('/api/v1/bmm/auctions')['state']=='inconsistent_snapshot'
assert get('/api/v1/bmm/history')['items'][0]['quality']=='unknown'
capture(events['auction']);sync()
assert get('/api/v1/bmm/auctions')['state']=='available'
check('v7 work, global evidence, durable gaps, exact fee enrichment and ABA snapshot rejection')
