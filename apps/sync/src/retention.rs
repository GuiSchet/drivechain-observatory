//! Retention of the sync's own bookkeeping: protocol builds nothing reads any more, and stream updates older than the
//! replay window. Evidence (`ingest.*`) and projections are never pruned here.
use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// How long a superseded build stays readable: an API cursor pins the build it started on.
const BUILD_GRACE: &str = "1 hour";
/// How far back a reconnecting stream client can resume; older cursors get `cursor_expired` and refetch.
const REPLAY_WINDOW: &str = "7 days";
/// Rows per statement, and statements per pass, so a pass never holds the cycle for long.
const BATCH: i64 = 2_000;
const MAX_BATCHES: usize = 10;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Pruned {
    pub builds: u64,
    pub updates: u64,
}

/// One bounded pass. A large backlog is cleared over several passes.
pub async fn prune(pool: &PgPool, d: Uuid) -> Result<Pruned> {
    let mut pruned = Pruned::default();
    for _ in 0..MAX_BATCHES {
        // Complete, old, and referenced by no head, block version, checkpoint or history row.
        let n = sqlx::query(
            "DELETE FROM ops.protocol_builds WHERE build_id IN (
                SELECT b.build_id FROM ops.protocol_builds b
                 WHERE b.dataset_id=$1 AND b.complete AND b.created_at < now() - $2::interval
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_head h WHERE h.build_id=b.build_id)
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.build_id=b.build_id)
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_checkpoints c
                                   WHERE c.dataset_id=b.dataset_id AND c.generation=b.generation AND c.build_id=b.build_id)
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_history p
                                   WHERE p.dataset_id=b.dataset_id AND p.generation=b.generation AND p.build_id=b.build_id)
                 ORDER BY b.build_id LIMIT $3)",
        )
        .bind(d)
        .bind(BUILD_GRACE)
        .bind(BATCH)
        .execute(pool)
        .await?
        .rows_affected();
        pruned.builds += n;
        if n < BATCH.unsigned_abs() {
            break;
        }
    }
    // Raise the replay floor past the updates leaving the window, never past the newest one: the API's revision is
    // the newest update, and a floor above it would expire every cursor.
    sqlx::query(
        "UPDATE ops.active_dataset a
            SET replay_floor = greatest(a.replay_floor, least(old.revision + 1, latest.revision))
           FROM (SELECT max(u.revision) AS revision FROM ops.pulse_updates u
                  WHERE u.dataset_id=$1 AND u.created_at < now() - $2::interval) old,
                (SELECT max(u.revision) AS revision FROM ops.pulse_updates u, ops.active_dataset cur
                  WHERE u.dataset_id=$1 AND cur.dataset_id=$1 AND u.projection_generation=cur.projection_generation) latest
          WHERE a.dataset_id=$1 AND old.revision IS NOT NULL AND latest.revision IS NOT NULL",
    )
    .bind(d)
    .bind(REPLAY_WINDOW)
    .execute(pool)
    .await?;
    for _ in 0..MAX_BATCHES {
        let n = sqlx::query(
            "DELETE FROM ops.pulse_updates WHERE revision IN (
                SELECT u.revision FROM ops.pulse_updates u
                 WHERE u.dataset_id=$1 AND u.revision < (SELECT replay_floor FROM ops.active_dataset WHERE dataset_id=$1)
                 ORDER BY u.revision LIMIT $2)",
        )
        .bind(d)
        .bind(BATCH)
        .execute(pool)
        .await?
        .rows_affected();
        pruned.updates += n;
        if n < BATCH.unsigned_abs() {
            break;
        }
    }
    Ok(pruned)
}
