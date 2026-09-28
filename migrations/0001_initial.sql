CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS projection;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ingest.datasets (
    dataset_id uuid PRIMARY KEY,
    network_id text NOT NULL,
    activation_height integer NOT NULL CHECK (activation_height >= 0),
    activation_block_hash text NOT NULL,
    initial_node_commit text NOT NULL,
    initial_enforcer_commit text NOT NULL,
    initial_monitor_commit text NOT NULL,
    initial_event_contract_version integer NOT NULL
        CHECK (initial_event_contract_version > 0),
    capabilities jsonb NOT NULL,
    creation_reason text NOT NULL,
    source_created_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest.extractor_runs (
    run_id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    source text NOT NULL,
    node_commit text NOT NULL,
    enforcer_commit text NOT NULL,
    monitor_commit text NOT NULL,
    event_contract_version integer NOT NULL CHECK (event_contract_version > 0),
    capabilities jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    last_capture_seq bigint NOT NULL CHECK (last_capture_seq >= 0),
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    finish_reason text,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest.source_events (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    source_event_id bigint NOT NULL,
    event_contract_version integer NOT NULL CHECK (event_contract_version > 0),
    observed_at timestamptz NOT NULL,
    source_ingested_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL,
    kind text NOT NULL,
    sidechain smallint CHECK (sidechain BETWEEN 0 AND 255),
    sidechain_instance_id text,
    block_hash bytea,
    height integer CHECK (height IS NULL OR height >= 0),
    envelope bytea NOT NULL,
    envelope_sha256 bytea,
    payload jsonb NOT NULL,
    interpretation_error text,
    PRIMARY KEY (dataset_id, source_event_id),
    CONSTRAINT source_event_block_hash_size
        CHECK (block_hash IS NULL OR octet_length(block_hash) = 32),
    CONSTRAINT source_event_envelope_hash_size
        CHECK (envelope_sha256 IS NULL OR octet_length(envelope_sha256) = 32)
);

CREATE INDEX IF NOT EXISTS source_events_by_kind
    ON ingest.source_events (dataset_id, kind, source_event_id DESC);
CREATE INDEX IF NOT EXISTS source_events_by_height
    ON ingest.source_events (dataset_id, height DESC, source_event_id DESC)
    WHERE height IS NOT NULL;
CREATE INDEX IF NOT EXISTS source_events_by_block
    ON ingest.source_events (dataset_id, block_hash)
    WHERE block_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingest.snapshot_groups (
    snapshot_group_id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    run_id uuid NOT NULL REFERENCES ingest.extractor_runs(run_id),
    capture_method text NOT NULL,
    started_at timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    tip_before_hash bytea NOT NULL CHECK (octet_length(tip_before_hash) = 32),
    tip_before_height integer NOT NULL CHECK (tip_before_height >= 0),
    tip_after_hash bytea NOT NULL CHECK (octet_length(tip_after_hash) = 32),
    tip_after_height integer NOT NULL CHECK (tip_after_height >= 0),
    consistency text NOT NULL CHECK (consistency IN ('stable', 'changed')),
    attempts integer NOT NULL CHECK (attempts > 0),
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest.event_observations (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    observation_id bigint NOT NULL,
    run_id uuid NOT NULL REFERENCES ingest.extractor_runs(run_id),
    capture_seq bigint NOT NULL CHECK (capture_seq > 0),
    capture_method text NOT NULL,
    source_event_id bigint NOT NULL,
    snapshot_group_id uuid REFERENCES ingest.snapshot_groups(snapshot_group_id),
    observed_at timestamptz NOT NULL,
    source_ingested_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, observation_id),
    UNIQUE (run_id, capture_seq),
    FOREIGN KEY (dataset_id, source_event_id)
        REFERENCES ingest.source_events(dataset_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS event_observations_by_event
    ON ingest.event_observations (dataset_id, source_event_id, observation_id);

CREATE TABLE IF NOT EXISTS ingest.tip_observations (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    tip_observation_id bigint NOT NULL,
    run_id uuid NOT NULL REFERENCES ingest.extractor_runs(run_id),
    capture_seq bigint NOT NULL CHECK (capture_seq > 0),
    capture_method text NOT NULL,
    tip_hash bytea NOT NULL CHECK (octet_length(tip_hash) = 32),
    tip_height integer NOT NULL CHECK (tip_height >= 0),
    previous_observed_hash bytea,
    previous_observed_height integer,
    observed_at timestamptz NOT NULL,
    source_ingested_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, tip_observation_id),
    UNIQUE (run_id, capture_seq),
    CONSTRAINT tip_previous_pair CHECK (
        (previous_observed_hash IS NULL) = (previous_observed_height IS NULL)
    ),
    CONSTRAINT tip_previous_hash_size CHECK (
        previous_observed_hash IS NULL OR octet_length(previous_observed_hash) = 32
    )
);

CREATE TABLE IF NOT EXISTS ingest.coverage_revisions (
    revision_id bigint PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    event_contract_version integer NOT NULL,
    source text NOT NULL,
    stream text NOT NULL,
    sidechain smallint,
    sidechain_instance_id text,
    operation text NOT NULL,
    row_data jsonb NOT NULL,
    changed_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest.extractor_status (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    source text NOT NULL,
    run_id uuid NOT NULL REFERENCES ingest.extractor_runs(run_id),
    last_tip_hash bytea,
    last_tip_height integer,
    last_error text,
    source_updated_at timestamptz NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, source),
    CONSTRAINT extractor_status_tip_pair CHECK (
        (last_tip_hash IS NULL) = (last_tip_height IS NULL)
    ),
    CONSTRAINT extractor_status_tip_hash_size CHECK (
        last_tip_hash IS NULL OR octet_length(last_tip_hash) = 32
    )
);

CREATE TABLE IF NOT EXISTS projection.blocks (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    block_hash bytea NOT NULL CHECK (octet_length(block_hash) = 32),
    height integer NOT NULL CHECK (height >= 0),
    previous_hash bytea,
    chain_work numeric(78, 0),
    block_time timestamptz,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    branch_status text NOT NULL DEFAULT 'provisional'
        CHECK (branch_status IN ('resolved', 'provisional', 'ambiguous', 'disconnected')),
    projection_version integer NOT NULL,
    PRIMARY KEY (dataset_id, block_hash)
);

CREATE INDEX IF NOT EXISTS blocks_by_height
    ON projection.blocks (dataset_id, height DESC, block_hash);

CREATE TABLE IF NOT EXISTS projection.network_state (
    dataset_id uuid PRIMARY KEY REFERENCES ingest.datasets(dataset_id),
    selected_tip_hash bytea,
    selected_tip_height integer,
    selected_tip_observed_at timestamptz,
    branch_status text NOT NULL DEFAULT 'provisional',
    updated_at timestamptz NOT NULL DEFAULT now(),
    projection_version integer NOT NULL,
    CONSTRAINT network_state_tip_pair CHECK (
        (selected_tip_hash IS NULL) = (selected_tip_height IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS projection.sidechain_instances (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    instance_id text NOT NULL,
    slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 255),
    raw_description bytea NOT NULL,
    description_sha256d bytea NOT NULL
        CHECK (octet_length(description_sha256d) = 32),
    proposal_height integer NOT NULL CHECK (proposal_height >= 0),
    activation_height integer NOT NULL CHECK (activation_height >= proposal_height),
    title text,
    description text,
    is_current boolean NOT NULL DEFAULT false,
    first_seen_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    projection_version integer NOT NULL,
    PRIMARY KEY (dataset_id, instance_id)
);

CREATE INDEX IF NOT EXISTS sidechain_instances_by_slot
    ON projection.sidechain_instances
        (dataset_id, slot, is_current DESC, activation_height DESC);

CREATE TABLE IF NOT EXISTS ops.sync_cursors (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    stream text NOT NULL,
    cursor_value bigint NOT NULL DEFAULT 0 CHECK (cursor_value >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, stream)
);

CREATE TABLE IF NOT EXISTS ops.source_status (
    dataset_id uuid PRIMARY KEY REFERENCES ingest.datasets(dataset_id),
    source_reachable boolean NOT NULL DEFAULT false,
    sync_mode text NOT NULL DEFAULT 'bootstrap'
        CHECK (sync_mode IN (
            'bootstrap', 'catching_up', 'following', 'interrupted', 'incompatible'
        )),
    last_source_contact_at timestamptz,
    last_error text,
    last_projection_update_at timestamptz,
    source_schema_version integer,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.pulse_updates (
    revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    projection_generation bigint NOT NULL,
    source_event_id bigint,
    changed jsonb NOT NULL,
    activity jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pulse_updates_by_dataset
    ON ops.pulse_updates (dataset_id, revision);
