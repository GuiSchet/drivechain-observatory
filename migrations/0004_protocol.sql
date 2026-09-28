-- Fresh v6 projections. Evidence and prior generations are retained.
ALTER TABLE ops.active_dataset ALTER COLUMN projection_version SET DEFAULT 4;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_generation SET DEFAULT 4;
CREATE TABLE projection.protocol_facts (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    event_id bigint NOT NULL,
    ordinal integer NOT NULL,
    family text NOT NULL,
    kind text NOT NULL,
    entity_key text NOT NULL,
    slot smallint,
    hash text,
    height integer,
    search_terms text[] NOT NULL,
    data jsonb NOT NULL,
    error text,
    PRIMARY KEY(dataset_id,generation,event_id,ordinal),
    FOREIGN KEY(dataset_id,event_id) REFERENCES ingest.source_events(dataset_id,source_event_id)
);
CREATE INDEX protocol_kind_page ON projection.protocol_facts(dataset_id,generation,kind,event_id DESC,ordinal DESC);
CREATE INDEX protocol_slot_page ON projection.protocol_facts(dataset_id,generation,slot,event_id DESC,ordinal DESC);
CREATE INDEX protocol_block ON projection.protocol_facts(dataset_id,generation,hash,event_id,ordinal);
CREATE INDEX protocol_height ON projection.protocol_facts(dataset_id,generation,height,event_id);
CREATE INDEX protocol_search ON projection.protocol_facts USING gin(search_terms);
CREATE INDEX protocol_entities ON projection.protocol_facts(dataset_id,generation,kind,entity_key,event_id DESC);
CREATE INDEX protocol_errors ON projection.protocol_facts(dataset_id,generation,family,event_id) WHERE error IS NOT NULL;
CREATE TABLE ops.protocol_jobs (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    event_cursor bigint NOT NULL DEFAULT 0,
    dirty_height integer,
    PRIMARY KEY(dataset_id,generation)
);
CREATE TABLE ops.protocol_builds (
    build_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    cut jsonb NOT NULL,
    branch_revision text NOT NULL,
    cursor_height integer NOT NULL,
    state jsonb NOT NULL,
    complete boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protocol_build_latest ON ops.protocol_builds(dataset_id,generation,build_id DESC);
CREATE TABLE projection.protocol_head (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    build_id bigint NOT NULL REFERENCES ops.protocol_builds,
    PRIMARY KEY(dataset_id,generation)
);
-- An empty block version supersedes all changes previously derived at that
-- block, while readers pinned to the previous head retain their old results.
CREATE TABLE projection.protocol_block_versions (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    hash text NOT NULL,
    height integer NOT NULL,
    build_id bigint NOT NULL REFERENCES ops.protocol_builds,
    PRIMARY KEY(dataset_id,generation,hash,build_id)
);
CREATE INDEX protocol_versions_height ON projection.protocol_block_versions(dataset_id,generation,height DESC,build_id DESC);
CREATE TABLE projection.protocol_history (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    build_id bigint NOT NULL,
    hash text NOT NULL,
    height integer NOT NULL,
    ordinal integer NOT NULL,
    kind text NOT NULL,
    entity_key text NOT NULL,
    slot smallint,
    data jsonb NOT NULL,
    quality text NOT NULL,
    evidence jsonb NOT NULL,
    issue text,
    PRIMARY KEY(dataset_id,generation,build_id,hash,ordinal)
);
CREATE INDEX protocol_history_page ON projection.protocol_history(dataset_id,generation,kind,height DESC,hash,ordinal);
CREATE INDEX protocol_history_entity ON projection.protocol_history(dataset_id,generation,kind,entity_key,height DESC);
CREATE INDEX protocol_history_slot ON projection.protocol_history(dataset_id,generation,slot,height DESC);
CREATE TABLE projection.protocol_checkpoints (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    build_id bigint NOT NULL,
    hash text NOT NULL,
    height integer NOT NULL,
    state jsonb NOT NULL,
    PRIMARY KEY(dataset_id,generation,build_id,hash)
);
CREATE INDEX protocol_checkpoints_height ON projection.protocol_checkpoints(dataset_id,generation,height DESC,build_id DESC);
CREATE TABLE projection.protocol_aliases (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    kind text NOT NULL,
    alias text NOT NULL,
    target text NOT NULL,
    hash text NOT NULL,
    PRIMARY KEY(dataset_id,generation,kind,alias,target)
);
