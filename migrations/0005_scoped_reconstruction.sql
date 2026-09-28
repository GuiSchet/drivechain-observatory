-- New semantics require fresh derived generations; source evidence is untouched.
ALTER TABLE ops.active_dataset ALTER COLUMN projection_version SET DEFAULT 5;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_generation SET DEFAULT 5;
-- Staging jobs created by an older binary must never resume under new semantics.
ALTER TABLE ops.chain_jobs ADD COLUMN implementation_version integer NOT NULL DEFAULT 4;
ALTER TABLE ops.chain_jobs ALTER COLUMN implementation_version SET DEFAULT 5;
CREATE INDEX protocol_snapshot_errors ON projection.protocol_facts(dataset_id,generation,event_id)
    WHERE error IS NOT NULL AND ordinal=0;
