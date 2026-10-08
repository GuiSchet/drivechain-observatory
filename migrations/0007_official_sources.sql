-- Fresh v8 dataset and projection generation. Prior generations remain archived.
ALTER TABLE ops.active_dataset ALTER COLUMN projection_version SET DEFAULT 7;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_generation SET DEFAULT 7;
ALTER TABLE ops.chain_jobs ALTER COLUMN implementation_version SET DEFAULT 7;
ALTER TABLE ingest.snapshot_groups DROP CONSTRAINT IF EXISTS snapshot_groups_consistency_check;
ALTER TABLE ingest.snapshot_groups ADD CONSTRAINT snapshot_groups_consistency_check CHECK(consistency IN ('stable','changed','unknown','tip_matched'));
ALTER TABLE ops.protocol_jobs ADD COLUMN observation_cursor bigint NOT NULL DEFAULT 0;
CREATE TABLE projection.snapshot_history (
 dataset_id uuid NOT NULL, generation bigint NOT NULL, observation_id bigint NOT NULL,
 ordinal integer NOT NULL, kind text NOT NULL, entity_key text NOT NULL, slot smallint,
 data jsonb NOT NULL,quality text NOT NULL,evidence jsonb NOT NULL,issue text,
 PRIMARY KEY(dataset_id,generation,observation_id,ordinal)
);
CREATE INDEX snapshot_history_entities ON projection.snapshot_history(dataset_id,generation,kind,entity_key,observation_id DESC);
-- No block attribution: snapshot windows are carried in data, never hash/height.
CREATE VIEW projection.observed_history AS
 SELECT p.*,NULL::bigint AS observation_id FROM projection.protocol_history p
 UNION ALL
 SELECT dataset_id,generation,0::bigint AS build_id,NULL::text AS hash,NULL::integer AS height,ordinal,kind,entity_key,slot,data,quality,evidence,issue,observation_id
 FROM projection.snapshot_history;
CREATE VIEW ingest.state_snapshot_tip_matched AS
 SELECT o.*,false AS atomicity_proven FROM ingest.event_observations o
 JOIN ingest.snapshot_groups s USING(dataset_id,run_id,snapshot_group_id)
 WHERE s.consistency='tip_matched' AND s.tip_before_hash=s.tip_after_hash AND s.tip_before_height=s.tip_after_height
 AND s.revision_before IS NULL AND s.revision_after IS NULL;

CREATE TABLE projection.reported_headers (
 dataset_id uuid NOT NULL,generation bigint NOT NULL,event_id bigint NOT NULL,
 hash text NOT NULL,parent text NOT NULL,height integer NOT NULL,block_work numeric NOT NULL,block_time timestamptz NOT NULL,
 PRIMARY KEY(dataset_id,generation,event_id)
);
CREATE INDEX reported_header_hash ON projection.reported_headers(dataset_id,generation,hash);
