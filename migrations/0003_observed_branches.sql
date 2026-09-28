-- Evidence is never rebuilt or removed. Derived chain rows are generation-scoped.
ALTER TABLE ops.active_dataset ADD COLUMN projection_version integer NOT NULL DEFAULT 2;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_version SET DEFAULT 3;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_generation SET DEFAULT 3;

CREATE TABLE ops.chain_jobs (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets,
    generation bigint NOT NULL,
    event_cursor bigint NOT NULL DEFAULT 0,
    error_event_id bigint,
    cut jsonb,
    complete boolean NOT NULL DEFAULT false,
    promoted boolean NOT NULL DEFAULT false,
    PRIMARY KEY (dataset_id, generation)
);
CREATE TABLE ops.chain_cut (
    dataset_id uuid PRIMARY KEY REFERENCES ingest.datasets,
    cut jsonb NOT NULL
);
CREATE TABLE projection.chain_headers (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    hash text NOT NULL,
    parent text NOT NULL,
    height integer NOT NULL CHECK (height >= 0),
    chain_work numeric(78,0) NOT NULL CHECK (chain_work >= 0),
    block_time timestamptz NOT NULL,
    first_event_id bigint NOT NULL,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    conflicted boolean NOT NULL DEFAULT false,
    PRIMARY KEY(dataset_id,generation,hash)
);
CREATE INDEX chain_headers_height ON projection.chain_headers(dataset_id,generation,height DESC,hash DESC);
CREATE TABLE projection.chain_facts (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    event_id bigint NOT NULL,
    hash text NOT NULL,
    kind text NOT NULL,
    slot smallint,
    instance_id text,
    contract integer NOT NULL,
    error text,
    PRIMARY KEY(dataset_id,generation,event_id),
    FOREIGN KEY(dataset_id,event_id) REFERENCES ingest.source_events(dataset_id,source_event_id)
);
CREATE INDEX chain_facts_block ON projection.chain_facts(dataset_id,generation,hash,kind,slot);
CREATE INDEX chain_facts_slot ON projection.chain_facts(dataset_id,generation,slot,hash);
CREATE TABLE projection.chain_members (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    height integer NOT NULL,
    hash text NOT NULL,
    PRIMARY KEY(dataset_id,generation,height),
    UNIQUE(dataset_id,generation,hash)
);
CREATE TABLE projection.chain_state (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    state jsonb NOT NULL,
    PRIMARY KEY(dataset_id,generation)
);
CREATE TABLE projection.chain_revisions (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    revision bigint NOT NULL,
    state jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(dataset_id,generation,revision)
);
CREATE TABLE projection.chain_coverage (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    source_revision bigint NOT NULL,
    result jsonb NOT NULL,
    PRIMARY KEY(dataset_id,generation,source_revision)
);
-- Range-indexed occurrences support bounded block detail and branch replay.
CREATE INDEX tip_observations_run_sequence ON ingest.tip_observations(run_id,capture_seq);
CREATE INDEX chain_coverage_latest ON ingest.coverage_revisions
    (dataset_id,event_contract_version,source,stream,sidechain,sidechain_instance_id,revision_id DESC);

-- Only derived membership and the pending work item require deletion.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_sync') THEN
        GRANT DELETE ON projection.chain_members, ops.chain_cut TO pulse_sync;
    END IF;
END $$;
