-- The sync looks for an unfinished protocol build on every cycle. Almost every
-- build is complete, so without a partial index that lookup reads the table.
CREATE INDEX IF NOT EXISTS protocol_builds_pending
    ON ops.protocol_builds(dataset_id, generation, build_id DESC) WHERE NOT complete;
-- Deleting a superseded build checks this foreign key, and the retention pass
-- asks whether any block version still cites the build.
CREATE INDEX IF NOT EXISTS protocol_block_versions_build
    ON projection.protocol_block_versions(build_id);
-- The stream and response metadata read updates by generation.
CREATE INDEX IF NOT EXISTS pulse_updates_by_generation
    ON ops.pulse_updates(dataset_id, projection_generation, revision);
-- The sync prunes builds nothing reads and updates past the replay window
-- (apps/sync/src/retention.rs), and drops a build it opened for nothing.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_sync') THEN
        GRANT DELETE ON ops.protocol_builds, ops.pulse_updates TO pulse_sync;
    END IF;
END $$;
