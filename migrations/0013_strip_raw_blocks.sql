-- Node mainchain_block events are imported without their raw block body; the
-- Observatory only reads the header. Bring rows imported before that change to
-- the same shape. Both source hashes are kept and still cover the full block.
-- Idempotent: stripped rows already have an empty envelope.
UPDATE ingest.source_events
   SET envelope = '\x'::bytea,
       payload = payload #- '{monitor_event,Node,event,MainchainBlock,raw_block}'
 WHERE source = 'node'
   AND kind = 'mainchain_block'
   AND octet_length(envelope) > 0;
