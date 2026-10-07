-- Monitor contract 9 records every state reading. An unchanged reading adds
-- an occurrence to the existing history row instead of a duplicate row.
ALTER TABLE projection.snapshot_history
    ADD COLUMN last_observation_id bigint,
    ADD COLUMN occurrences bigint NOT NULL DEFAULT 1;
CREATE TABLE projection.snapshot_streams (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    snapshot_kind text NOT NULL,
    -- -1 for global kinds without a slot.
    slot smallint NOT NULL,
    run_id uuid NOT NULL,
    event_id bigint NOT NULL,
    usable boolean NOT NULL,
    first_observation_id bigint NOT NULL,
    last_observation_id bigint NOT NULL,
    PRIMARY KEY (dataset_id, generation, snapshot_kind, slot, run_id)
);
-- Explicit columns: a view over p.* freezes the column list it was created with.
DROP VIEW projection.observed_history;
CREATE VIEW projection.observed_history AS
 SELECT p.dataset_id,p.generation,p.build_id,p.hash,p.height,p.ordinal,p.kind,p.entity_key,p.slot,p.data,p.quality,p.evidence,p.issue,
        NULL::bigint AS observation_id,NULL::bigint AS last_observation_id,1::bigint AS occurrences
   FROM projection.protocol_history p
 UNION ALL
 SELECT dataset_id,generation,0::bigint AS build_id,NULL::text AS hash,NULL::integer AS height,ordinal,kind,entity_key,slot,data,quality,evidence,issue,
        observation_id,coalesce(last_observation_id,observation_id),occurrences
   FROM projection.snapshot_history;
-- A failed reading ends its stream so the next one starts a new history row.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_sync') THEN
        GRANT DELETE ON projection.snapshot_streams TO pulse_sync;
    END IF;
END $$;
