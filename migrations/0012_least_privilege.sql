-- Imported evidence is append-only for the sync role: only the state tables
-- it upserts and two annotation columns of source events remain updatable.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_sync') THEN
        REVOKE UPDATE ON ingest.source_events, ingest.event_observations, ingest.tip_observations,
            ingest.snapshot_groups, ingest.coverage_revisions, ingest.observation_failures,
            ingest.import_conflicts FROM pulse_sync;
        GRANT UPDATE (interpretation_error, fact_sha256) ON ingest.source_events TO pulse_sync;
        GRANT UPDATE ON ingest.datasets, ingest.extractor_runs, ingest.extractor_status,
            ingest.worker_status TO pulse_sync;
    END IF;
END $$;
-- An occurrence and its snapshot group always belong to the same dataset.
ALTER TABLE ingest.snapshot_groups
    ADD CONSTRAINT snapshot_groups_dataset_identity UNIQUE (dataset_id, snapshot_group_id);
ALTER TABLE ingest.event_observations
    DROP CONSTRAINT IF EXISTS event_observations_snapshot_group_id_fkey,
    ADD CONSTRAINT event_observations_snapshot_group_dataset
        FOREIGN KEY (dataset_id, snapshot_group_id)
        REFERENCES ingest.snapshot_groups(dataset_id, snapshot_group_id);
