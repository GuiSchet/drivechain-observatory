-- A fresh generation interprets v7 work; prior generations remain evidence.
ALTER TABLE ops.active_dataset ALTER COLUMN projection_version SET DEFAULT 6;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_generation SET DEFAULT 6;
ALTER TABLE ops.chain_jobs ALTER COLUMN implementation_version SET DEFAULT 6;
ALTER TABLE projection.chain_headers ADD COLUMN block_work numeric;
ALTER TABLE ingest.snapshot_groups ADD COLUMN revision_before text;
ALTER TABLE ingest.snapshot_groups ADD COLUMN revision_after text;

-- Quality belongs to an occurrence, even when two occurrences share one fact.
CREATE VIEW ingest.state_snapshot_stable AS
SELECT o.*,g.tip_before_hash,g.tip_before_height,g.revision_before
FROM ingest.event_observations o
JOIN ingest.snapshot_groups g USING(dataset_id,snapshot_group_id,run_id)
WHERE g.consistency='stable' AND g.tip_before_hash=g.tip_after_hash
  AND g.tip_before_height=g.tip_after_height
  AND g.revision_before IS NOT NULL AND g.revision_before=g.revision_after;

CREATE INDEX source_block_identity ON ingest.source_events
    (dataset_id,block_hash,event_contract_version,source,kind,sidechain,sidechain_instance_id)
    WHERE kind IN ('block_connected','bip300_block_delta');

CREATE TABLE ingest.observation_failures (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    failure_id bigint NOT NULL,
    run_id uuid NOT NULL REFERENCES ingest.extractor_runs(run_id),
    worker text NOT NULL,
    observed_at timestamptz NOT NULL,
    error text NOT NULL,
    PRIMARY KEY(dataset_id,failure_id)
);
CREATE INDEX observation_failures_time ON ingest.observation_failures(dataset_id,observed_at DESC,failure_id DESC);

CREATE INDEX snapshot_groups_quality_time ON ingest.snapshot_groups(dataset_id,started_at) INCLUDE(consistency);
