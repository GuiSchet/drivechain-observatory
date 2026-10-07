-- Imported evidence is a copy of immutable monitor rows. A source row whose
-- content no longer matches its copy is recorded here and stops the sync.
CREATE TABLE ingest.import_conflicts (
    conflict_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    stream text NOT NULL,
    first_source_id text NOT NULL,
    last_source_id text NOT NULL,
    detail text NOT NULL,
    detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_conflicts_dataset ON ingest.import_conflicts(dataset_id, conflict_id);
-- Rotating content audit: the next id range of each stream to compare.
CREATE TABLE ops.import_audit (
    dataset_id uuid NOT NULL REFERENCES ingest.datasets(dataset_id),
    stream text NOT NULL,
    next_id bigint NOT NULL DEFAULT 1,
    PRIMARY KEY (dataset_id, stream)
);
