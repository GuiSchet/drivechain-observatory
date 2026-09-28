-- Additive upgrade: keep imported evidence and reset only the unsafe occurrence
-- cursor so installations of the initial slice recover any skipped occurrences.
ALTER TABLE ingest.source_events ADD COLUMN fact_sha256 bytea
    CHECK (fact_sha256 IS NULL OR octet_length(fact_sha256) = 32);
UPDATE ops.sync_cursors SET cursor_value = 0 WHERE stream = 'event_observations';

ALTER TABLE ingest.coverage_revisions DROP CONSTRAINT coverage_revisions_pkey;
ALTER TABLE ingest.coverage_revisions ADD PRIMARY KEY (dataset_id, revision_id);

CREATE TABLE ingest.worker_status (
    run_id uuid NOT NULL REFERENCES ingest.extractor_runs(run_id),
    worker text NOT NULL,
    consecutive_failures integer NOT NULL,
    last_error text,
    last_success_at timestamptz,
    last_failure_at timestamptz,
    source_updated_at timestamptz NOT NULL,
    PRIMARY KEY (run_id, worker)
);

CREATE TABLE ops.active_dataset (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    projection_generation bigint NOT NULL DEFAULT 2 CHECK (projection_generation > 0),
    replay_floor bigint NOT NULL DEFAULT 0 CHECK (replay_floor >= 0)
);

CREATE TABLE ops.projection_progress (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    name text NOT NULL,
    processed_event_id bigint,
    error_event_id bigint,
    PRIMARY KEY (dataset_id, name)
);

CREATE TABLE projection.bmm_snapshots (
    dataset_id uuid NOT NULL,
    source_event_id bigint NOT NULL,
    parent_hash text NOT NULL,
    requests jsonb NOT NULL,
    PRIMARY KEY (dataset_id, source_event_id),
    FOREIGN KEY (dataset_id, source_event_id)
        REFERENCES ingest.source_events(dataset_id, source_event_id)
);

CREATE INDEX event_observations_by_run_latest
    ON ingest.event_observations (dataset_id, run_id, capture_seq DESC)
    INCLUDE (source_event_id, observed_at, observation_id);

ALTER TABLE ops.source_status ADD COLUMN last_cycle_at timestamptz;
ALTER TABLE ops.source_status ADD COLUMN source_event_high_water bigint;
ALTER TABLE ops.source_status ADD COLUMN source_observation_high_water bigint;
ALTER TABLE ops.source_status ADD COLUMN source_tip_high_water bigint;
ALTER TABLE ops.source_status ADD COLUMN source_coverage_high_water bigint;

-- There are no public projections until the v5 synchronizer explicitly selects
-- and validates a dataset. Old evidence stays available by permanent ID.
