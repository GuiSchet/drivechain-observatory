//! Retention of the sync's own bookkeeping: protocol builds nothing reads any more, and stream updates older than the
//! replay window. Evidence (`ingest.*`) and projections are never pruned here.
use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// How long a build stays readable after it stops being the head: an API cursor pins the build it started on.
const BUILD_GRACE: &str = "1 hour";
/// How far back a reconnecting stream client can resume; older cursors get `cursor_expired` and refetch.
const REPLAY_WINDOW: &str = "7 days";
/// Rows per statement, and statements per pass, so a pass never holds the cycle for long.
const BATCH: i64 = 2_000;
const MAX_BATCHES: usize = 10;

/// Superseded block versions per statement: each takes its history rows with it (a few per block).
const VERSION_BATCH: i64 = 1_000;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Pruned {
    pub versions: u64,
    pub history: u64,
    pub builds: u64,
    pub updates: u64,
}

/// Raises each generation's cursor floor to the build that was the head `BUILD_GRACE` ago: the newest build published
/// before then. Builds below it were replaced more than the grace ago, so cursors pinned to them get 409 from then on
/// (`crates/storage/src/protocol.rs`, `context_at`), whether or not the build itself is still kept. Never lowers it.
pub const RAISE_CURSOR_FLOOR: &str =
    "INSERT INTO ops.protocol_cursor_floor AS c(dataset_id,generation,min_build)
        SELECT $1, b.generation, max(b.build_id) FROM ops.protocol_builds b
          JOIN projection.protocol_head h ON h.dataset_id=b.dataset_id AND h.generation=b.generation
         WHERE b.dataset_id=$1 AND b.complete AND b.published_at <= now() - $2::interval
           AND b.build_id <= h.build_id
         GROUP BY b.generation
    ON CONFLICT (dataset_id,generation) DO UPDATE
        SET min_build=greatest(c.min_build, excluded.min_build),
            raised_at=CASE WHEN excluded.min_build > c.min_build THEN now() ELSE c.raised_at END";

/// Deletes up to $2 block versions, with their history rows, that no admitted cursor can read: a version is visible
/// to build C when it is the newest version of its block at or below C, so one with a newer version at or below the
/// floor is invisible to every build at or above the floor. The newest version at or below the floor is always kept,
/// empty or not (an empty version is what hides earlier rows). Returns (versions, history rows).
pub const PRUNE_SUPERSEDED_VERSIONS: &str = "WITH doomed AS (
        SELECT v.dataset_id,v.generation,v.hash,v.build_id
          FROM projection.protocol_block_versions v
          JOIN ops.protocol_cursor_floor f ON f.dataset_id=v.dataset_id AND f.generation=v.generation
         WHERE v.dataset_id=$1 AND v.build_id < f.min_build
           AND EXISTS(SELECT 1 FROM projection.protocol_block_versions n
                       WHERE n.dataset_id=v.dataset_id AND n.generation=v.generation AND n.hash=v.hash
                         AND n.build_id > v.build_id AND n.build_id <= f.min_build)
         ORDER BY v.build_id LIMIT $2),
    history AS (
        DELETE FROM projection.protocol_history p USING doomed x
         WHERE p.dataset_id=x.dataset_id AND p.generation=x.generation AND p.build_id=x.build_id AND p.hash=x.hash
        RETURNING 1),
    versions AS (
        DELETE FROM projection.protocol_block_versions v USING doomed x
         WHERE v.dataset_id=x.dataset_id AND v.generation=x.generation AND v.hash=x.hash AND v.build_id=x.build_id
        RETURNING 1)
    SELECT (SELECT count(*) FROM versions), (SELECT count(*) FROM history)";

/// One bounded pass. A large backlog is cleared over several passes.
pub async fn prune(pool: &PgPool, d: Uuid) -> Result<Pruned> {
    let mut pruned = Pruned::default();
    for _ in 0..MAX_BATCHES {
        // The floor and the deletions it allows commit together: an API read (one REPEATABLE READ snapshot) sees
        // either the old floor and every row, or the new floor and only rows the builds above it can read.
        let mut tx = pool.begin().await?;
        sqlx::query(RAISE_CURSOR_FLOOR)
            .bind(d)
            .bind(BUILD_GRACE)
            .execute(&mut *tx)
            .await?;
        let (versions, history): (i64, i64) = sqlx::query_as(PRUNE_SUPERSEDED_VERSIONS)
            .bind(d)
            .bind(VERSION_BATCH)
            .fetch_one(&mut *tx)
            .await?;
        tx.commit().await?;
        pruned.versions += versions.unsigned_abs();
        pruned.history += history.unsigned_abs();
        if versions < VERSION_BATCH {
            break;
        }
    }
    for _ in 0..MAX_BATCHES {
        // Complete, below the cursor floor (so no admitted cursor reads it), and referenced by no head, block version,
        // checkpoint or history row.
        let n = sqlx::query(
            "DELETE FROM ops.protocol_builds WHERE build_id IN (
                SELECT b.build_id FROM ops.protocol_builds b
                  JOIN ops.protocol_cursor_floor f ON f.dataset_id=b.dataset_id AND f.generation=b.generation
                 WHERE b.dataset_id=$1 AND b.complete AND b.build_id < f.min_build
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_head h WHERE h.build_id=b.build_id)
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.build_id=b.build_id)
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_checkpoints c
                                   WHERE c.dataset_id=b.dataset_id AND c.generation=b.generation AND c.build_id=b.build_id)
                   AND NOT EXISTS(SELECT 1 FROM projection.protocol_history p
                                   WHERE p.dataset_id=b.dataset_id AND p.generation=b.generation AND p.build_id=b.build_id)
                 ORDER BY b.build_id LIMIT $2)",
        )
        .bind(d)
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

/// Against a real, migrated PostgreSQL (`PULSE_TEST_DATABASE_URL`, an admin role); skipped when it is unset.
/// `scripts/verify-local.sh` runs them on its disposable database. Each test works in its own random dataset.
#[cfg(test)]
mod db {
    use super::*;
    use serde_json::{Value, json};
    use sqlx::PgPool;

    async fn pool() -> Option<PgPool> {
        let url = std::env::var("PULSE_TEST_DATABASE_URL").ok()?;
        Some(PgPool::connect(&url).await.expect("test database"))
    }
    async fn dataset(pool: &PgPool) -> Uuid {
        sqlx::query_scalar("SELECT gen_random_uuid()")
            .fetch_one(pool)
            .await
            .unwrap()
    }
    /// A complete build of generation 1, published `ago` before now (None: not published).
    async fn build(pool: &PgPool, d: Uuid, ago: Option<&str>) -> i64 {
        sqlx::query_scalar("INSERT INTO ops.protocol_builds(dataset_id,generation,cut,branch_revision,cursor_height,state,complete,published_at) VALUES($1,1,'{}','test',0,'{}',true,now()-$2::interval) RETURNING build_id")
            .bind(d).bind(ago.unwrap_or("0 seconds")).fetch_one(pool).await.unwrap()
    }
    async fn head(pool: &PgPool, d: Uuid, b: i64) {
        sqlx::query("INSERT INTO projection.protocol_head VALUES($1,1,$2) ON CONFLICT(dataset_id,generation) DO UPDATE SET build_id=excluded.build_id")
            .bind(d).bind(b).execute(pool).await.unwrap();
    }
    async fn version(pool: &PgPool, d: Uuid, hash: &str, b: i64, rows: &Value) {
        sqlx::query("INSERT INTO projection.protocol_block_versions VALUES($1,1,$2,7,$3)")
            .bind(d)
            .bind(hash)
            .bind(b)
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO projection.protocol_history SELECT $1,1,$2,$3,7,r.* FROM jsonb_to_recordset($4) AS r(ordinal integer,kind text,entity_key text,slot smallint,data jsonb,quality text,evidence jsonb,issue text)")
            .bind(d).bind(b).bind(hash).bind(rows).execute(pool).await.unwrap();
    }
    async fn same(pool: &PgPool, d: Uuid, hash: &str, b: i64, rows: &Value) -> bool {
        sqlx::query_scalar(crate::protocol::SAME_AS_VISIBLE_VERSION)
            .bind(d)
            .bind(1_i64)
            .bind(hash)
            .bind(b)
            .bind(rows)
            .fetch_one(pool)
            .await
            .unwrap()
    }
    /// What build `c` reads: per block, the rows of its newest version at or below `c` (the API's visibility rule).
    async fn visible(pool: &PgPool, d: Uuid, c: i64) -> Value {
        sqlx::query_scalar("SELECT coalesce(jsonb_agg(to_jsonb(p) - 'build_id' ORDER BY p.hash,p.ordinal),'[]') FROM projection.protocol_history p
             WHERE p.dataset_id=$1 AND p.generation=1 AND p.build_id<=$2
               AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.dataset_id=p.dataset_id AND v.generation=p.generation AND v.hash=p.hash AND v.build_id>p.build_id AND v.build_id<=$2)")
            .bind(d).bind(c).fetch_one(pool).await.unwrap()
    }
    async fn count(pool: &PgPool, sql: &str, d: Uuid) -> i64 {
        sqlx::query_scalar(sql)
            .bind(d)
            .fetch_one(pool)
            .await
            .unwrap()
    }
    /// Leaves the shared test database as it found it (verify-local runs the end-to-end test on it next).
    async fn cleanup(pool: &PgPool, d: Uuid) {
        for table in [
            "projection.protocol_history",
            "projection.protocol_block_versions",
            "projection.protocol_head",
            "projection.protocol_checkpoints",
            "ops.protocol_cursor_floor",
            "ops.protocol_builds",
        ] {
            sqlx::query(&format!("DELETE FROM {table} WHERE dataset_id=$1"))
                .bind(d)
                .execute(pool)
                .await
                .unwrap();
        }
    }
    fn row(ordinal: i32, slot: i32, data: Value) -> Value {
        json!({"ordinal":ordinal,"kind":"deposit","entity_key":"k","slot":slot,"data":data,"quality":"confirmed","evidence":[{"event_id":"1"}],"issue":null})
    }

    #[tokio::test]
    async fn identical_versions_are_skipped_and_every_field_counts() {
        let Some(pool) = pool().await else { return };
        let d = dataset(&pool).await;
        let base = json!([row(0, 9, json!({"v":1}))]);
        let b1 = build(&pool, d, None).await;
        assert!(
            !same(&pool, d, "h", b1, &base).await,
            "no earlier version: write"
        );
        assert!(
            !same(&pool, d, "h", b1, &json!([])).await,
            "absent is not empty: an empty first version is written"
        );
        version(&pool, d, "h", b1, &base).await;
        let b2 = build(&pool, d, None).await;
        assert!(same(&pool, d, "h", b2, &base).await, "identical: skip");
        for (field, value) in [
            ("kind", json!("ctip")),
            ("entity_key", json!("j")),
            ("slot", json!(10)),
            ("data", json!({"v":2})),
            ("quality", json!("observed")),
            ("evidence", json!([{"event_id":"2"}])),
            ("issue", json!("late")),
        ] {
            let mut changed = base.clone();
            changed[0][field] = value;
            assert!(!same(&pool, d, "h", b2, &changed).await, "{field} differs");
        }
        assert!(
            !same(
                &pool,
                d,
                "h",
                b2,
                &json!([row(0, 9, json!({"v":1})), row(1, 9, json!({"v":3}))])
            )
            .await,
            "an extra row"
        );
        assert!(
            !same(&pool, d, "h", b2, &json!([])).await,
            "rows to empty: the empty version hides them"
        );
        version(
            &pool,
            d,
            "two",
            b1,
            &json!([row(0, 9, json!({"a":1})), row(1, 9, json!({"b":1}))]),
        )
        .await;
        assert!(
            !same(
                &pool,
                d,
                "two",
                b2,
                &json!([row(0, 9, json!({"b":1})), row(1, 9, json!({"a":1}))])
            )
            .await,
            "order"
        );
        version(&pool, d, "h", b2, &json!([])).await;
        let b3 = build(&pool, d, None).await;
        assert!(
            same(&pool, d, "h", b3, &json!([])).await,
            "empty after empty: skip"
        );
        assert!(
            !same(&pool, d, "h", b3, &base).await,
            "rows after empty: write"
        );
        cleanup(&pool, d).await;
    }

    #[tokio::test]
    async fn pruning_keeps_what_admitted_builds_read() {
        let Some(pool) = pool().await else { return };
        let d = dataset(&pool).await;
        let r = |n: i32| json!([row(0, 9, json!({ "n": n }))]);
        let b1 = build(&pool, d, Some("5 hours")).await;
        let b2 = build(&pool, d, Some("3 hours")).await;
        let b3 = build(&pool, d, Some("2 hours")).await;
        // Started hours ago but published 30 minutes ago: its predecessor's grace counts from now-30min.
        let b4 = build(&pool, d, Some("30 minutes")).await;
        sqlx::query(
            "UPDATE ops.protocol_builds SET created_at=now()-interval '3 hours' WHERE build_id=$1",
        )
        .bind(b4)
        .execute(&pool)
        .await
        .unwrap();
        head(&pool, d, b4).await;
        // Published long ago but above the head: the floor never passes the head.
        let _stray = build(&pool, d, Some("3 hours")).await;
        version(&pool, d, "A", b1, &r(1)).await;
        version(&pool, d, "A", b2, &r(2)).await;
        version(&pool, d, "A", b4, &r(4)).await;
        version(&pool, d, "B", b1, &r(1)).await;
        version(&pool, d, "B", b3, &json!([])).await;
        version(&pool, d, "C", b2, &r(2)).await;
        let before3 = visible(&pool, d, b3).await;
        let before4 = visible(&pool, d, b4).await;

        let pruned = prune(&pool, d).await.unwrap();
        let floor: i64 = count(
            &pool,
            "SELECT min_build FROM ops.protocol_cursor_floor WHERE dataset_id=$1 AND generation=1",
            d,
        )
        .await;
        assert_eq!(
            floor, b3,
            "the head an hour ago, by publication time, never above the head"
        );
        assert_eq!(
            (pruned.versions, pruned.history),
            (2, 2),
            "A@b1 and B@b1: each has a newer version at or below the floor"
        );
        assert_eq!(
            visible(&pool, d, b3).await,
            before3,
            "the floor build reads the same"
        );
        assert_eq!(
            visible(&pool, d, b4).await,
            before4,
            "the head reads the same"
        );
        let kept: Vec<i64> = sqlx::query_scalar("SELECT build_id FROM projection.protocol_block_versions WHERE dataset_id=$1 ORDER BY hash,build_id").bind(d).fetch_all(&pool).await.unwrap();
        assert_eq!(
            kept,
            vec![b2, b4, b3, b2],
            "A keeps b2 (b3 reads it) and b4; B keeps its empty b3; C keeps its only version"
        );
        let b1_left: i64 =
            sqlx::query_scalar("SELECT count(*) FROM ops.protocol_builds WHERE build_id=$1")
                .bind(b1)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(b1_left, 0, "b1 is cited by nothing now and goes");

        let again = prune(&pool, d).await.unwrap();
        assert_eq!((again.versions, again.history), (0, 0), "idempotent");
        assert_eq!(
            count(
                &pool,
                "SELECT min_build FROM ops.protocol_cursor_floor WHERE dataset_id=$1",
                d
            )
            .await,
            b3
        );
        // Later publications move the floor up, never down.
        sqlx::query("UPDATE ops.protocol_builds SET published_at=now()-interval '10 hours' WHERE dataset_id=$1").bind(d).execute(&pool).await.unwrap();
        prune(&pool, d).await.unwrap();
        assert_eq!(
            count(
                &pool,
                "SELECT min_build FROM ops.protocol_cursor_floor WHERE dataset_id=$1",
                d
            )
            .await,
            b4
        );
        sqlx::query("UPDATE ops.protocol_builds SET published_at=now() WHERE dataset_id=$1")
            .bind(d)
            .execute(&pool)
            .await
            .unwrap();
        prune(&pool, d).await.unwrap();
        assert_eq!(
            count(
                &pool,
                "SELECT min_build FROM ops.protocol_cursor_floor WHERE dataset_id=$1",
                d
            )
            .await,
            b4,
            "never lowered"
        );
        cleanup(&pool, d).await;
    }
}
