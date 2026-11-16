-- A replay re-derives every block from its checkpoint to the tip. Until now
-- each one wrote a new block version and copies of its history rows even when
-- they came out identical, so most history rows are copies nobody can see.
-- The sync now skips identical versions and prunes the superseded ones that no
-- admitted cursor can read (apps/sync/src/retention.rs).

-- When a build became the head. The grace a pinned cursor gets counts from the
-- moment its build was replaced, i.e. from the next head's publication, not
-- from when that next build was started.
ALTER TABLE ops.protocol_builds ADD COLUMN IF NOT EXISTS published_at timestamptz;
UPDATE ops.protocol_builds SET published_at = created_at WHERE complete AND published_at IS NULL;

-- Cursors pinned to a build below min_build are refused (409), even if the
-- build itself is still kept (a checkpoint can keep it). The sync raises it
-- before pruning anything only builds below it could read, in one transaction.
CREATE TABLE IF NOT EXISTS ops.protocol_cursor_floor (
    dataset_id uuid NOT NULL,
    generation bigint NOT NULL,
    min_build bigint NOT NULL,
    raised_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_id, generation)
);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_sync') THEN
        GRANT DELETE ON projection.protocol_history, projection.protocol_block_versions TO pulse_sync;
        GRANT SELECT, INSERT, UPDATE ON ops.protocol_cursor_floor TO pulse_sync;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pulse_api') THEN
        GRANT SELECT ON ops.protocol_cursor_floor TO pulse_api;
    END IF;
END $$;
