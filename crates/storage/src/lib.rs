pub mod blocks;
pub mod bmm;
pub mod protocol;
pub mod provenance;
use blocks::branch;
use chrono::{DateTime, Utc};
use pulse_domain::*;
use serde_json::Value;
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::{Postgres, Row as _, Transaction};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("invalid block query or cursor")]
    InvalidQuery,
    #[error("the dataset, generation, branch or filters changed; restart pagination")]
    StaleCursor,
    #[error("Observatory does not have an active imported dataset yet")]
    NoDataset,
    #[error("evidence not found")]
    NotFound,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("invalid persisted sync mode: {0}")]
    InvalidSyncMode(String),
    #[error("invalid persisted projection")]
    InvalidProjection,
}

pub async fn connect(url: &str, max: u32) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new().max_connections(max).connect(url).await
}
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("../../migrations").run(pool).await
}
pub async fn ready(pool: &PgPool) -> Result<(), sqlx::Error> {
    // Readiness is local: it does not require a live monitor or an initial dataset.
    sqlx::query(
        "SELECT a.dataset_id, a.projection_generation, a.projection_version, a.replay_floor, e.fact_sha256,j.promoted
        FROM ops.active_dataset a LEFT JOIN ingest.source_events e USING(dataset_id) LEFT JOIN ops.chain_jobs j ON j.dataset_id=a.dataset_id LIMIT 0",
    )
    .execute(pool)
    .await?;
    Ok(())
}
async fn snapshot(pool: &PgPool) -> Result<Transaction<'_, Postgres>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        .execute(&mut *tx)
        .await?;
    Ok(tx)
}
async fn dataset(
    tx: &mut Transaction<'_, Postgres>,
    id: Option<Uuid>,
) -> Result<Dataset, StorageError> {
    let row = sqlx::query(
        "SELECT d.* FROM ingest.datasets d WHERE d.dataset_id =
        COALESCE($1,(SELECT dataset_id FROM ops.active_dataset WHERE singleton))",
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(StorageError::NoDataset)?;
    Ok(Dataset {
        dataset_id: row.try_get("dataset_id")?,
        network_id: row.try_get("network_id")?,
        activation_height: row.try_get("activation_height")?,
        activation_block_hash: row.try_get("activation_block_hash")?,
        capabilities: row.try_get("capabilities")?,
        created_at: row.try_get("source_created_at")?,
    })
}
async fn response_meta(
    tx: &mut Transaction<'_, Postgres>,
    data: &Dataset,
) -> Result<ResponseMeta, StorageError> {
    let (generation, version) = blocks::generation(tx, data.dataset_id).await?;
    let revision: i64 = sqlx::query_scalar("SELECT COALESCE(max(revision),0) FROM ops.pulse_updates WHERE dataset_id=$1 AND projection_generation=$2")
        .bind(data.dataset_id).bind(generation).fetch_one(&mut **tx).await?;
    let watermark = projection_watermark(tx, data.dataset_id, generation, version).await?;
    Ok(ResponseMeta {
        network_id: data.network_id.clone(),
        dataset_id: data.dataset_id,
        projection_version: version,
        projection_generation: generation,
        pulse_revision: revision,
        data_as_of_event_id: watermark,
    })
}
/// Errors affecting the published interpretation, with exactly the same cut and
/// provenance for REST, status and outbox. Raw diagnostics remain independently
/// accessible even when they are ineligible for this reconstruction.
///
/// Fact errors (`first_errors`) bound how far a family's facts were usable.
/// An unusable latest state reading (`observation_errors`) makes the family
/// partial, but its event id can be an old fact read again, so it never
/// moves the processed watermark backwards.
pub(crate) async fn protocol_errors(
    conn: &mut sqlx::PgConnection,
    dataset: Uuid,
    generation: i64,
) -> Result<Vec<(String, Option<i64>, Option<i64>)>, sqlx::Error> {
    sqlx::query_as("WITH head AS (
        SELECT b.state FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) WHERE h.dataset_id=$1 AND h.generation=$2
    ), errors AS (
        SELECT e.key AS family,e.value::bigint AS event_id,false AS observation FROM head h CROSS JOIN LATERAL jsonb_each_text(coalesce(h.state->'first_errors','{}'::jsonb)) e
        UNION ALL
        SELECT e.key,e.value::bigint,true FROM head h CROSS JOIN LATERAL jsonb_each_text(coalesce(h.state->'observation_errors','{}'::jsonb)) e
    ) SELECT family,min(event_id) FILTER (WHERE NOT observation),min(event_id) FILTER (WHERE observation) FROM errors GROUP BY family ORDER BY family")
        .bind(dataset).bind(generation).fetch_all(conn).await
}

/// Shared REST/outbox completeness rule. A scan frontier is never a public watermark.
pub async fn projection_watermark(
    connection: &mut sqlx::PgConnection,
    dataset_id: Uuid,
    generation: i64,
    version: i32,
) -> Result<Option<i64>, sqlx::Error> {
    if version >= 5 {
        // The legacy projector still materializes auction rows, but its permanent
        // error latch is not evidence of a failure in this selected generation.
        let bounds:Option<(i64,i64,i64)>=sqlx::query_as("SELECT (b.cut->>'events')::bigint,(s.state->>'processed_events')::bigint,c.cursor_value FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) JOIN projection.chain_state s ON s.dataset_id=h.dataset_id AND s.generation=h.generation JOIN ops.sync_cursors c ON c.dataset_id=h.dataset_id AND c.stream='projection_events' WHERE h.dataset_id=$1 AND h.generation=$2")
            .bind(dataset_id).bind(generation).fetch_optional(&mut *connection).await?;
        let Some((protocol, chain, materialized)) = bounds else {
            return Ok(None);
        };
        let errors = protocol_errors(connection, dataset_id, generation).await?;
        let mut watermark = protocol.min(chain).min(materialized);
        if let Some(first) = errors.iter().filter_map(|(_, fact, _)| *fact).min() {
            watermark = watermark.min(first - 1);
        }
        return Ok(Some(watermark));
    }
    // A common conservative watermark, never the imported event maximum. NULL
    // until every required projection has processed a coherent prefix.
    let mut watermark: Option<i64> = sqlx::query_scalar("SELECT CASE WHEN count(*)=2 AND count(processed_event_id)=2
        THEN min(processed_event_id) END FROM ops.projection_progress WHERE dataset_id=$1 AND name IN ('blocks','bmm')")
        .bind(dataset_id).fetch_one(&mut *connection).await?;
    if version >= 3 {
        let chain:Option<i64>=sqlx::query_scalar("SELECT CASE WHEN j.error_event_id IS NULL THEN (s.state->>'processed_events')::bigint ELSE least((s.state->>'processed_events')::bigint,j.error_event_id-1) END FROM ops.chain_jobs j JOIN projection.chain_state s USING(dataset_id,generation) WHERE j.dataset_id=$1 AND j.generation=$2")
            .bind(dataset_id).bind(generation).fetch_optional(&mut *connection).await?.flatten();
        watermark = watermark.zip(chain).map(|(a, b)| a.min(b));
    }
    if version >= 4 {
        let protocol:Option<i64>=sqlx::query_scalar("SELECT least((b.cut->>'events')::bigint,(SELECT min(value::bigint)-1 FROM jsonb_each_text(coalesce(b.state->'first_errors','{}'::jsonb))),(SELECT min(f.event_id)-1 FROM projection.protocol_facts f WHERE f.dataset_id=h.dataset_id AND f.generation=h.generation AND f.error IS NOT NULL AND f.event_id<=(b.cut->>'events')::bigint)) FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) WHERE h.dataset_id=$1 AND h.generation=$2").bind(dataset_id).bind(generation).fetch_optional(&mut *connection).await?.flatten();
        watermark = watermark.zip(protocol).map(|(a, b)| a.min(b));
    }
    Ok(watermark)
}
async fn run_info(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<Option<RunInfo>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT r.* FROM ingest.extractor_runs r JOIN ingest.extractor_status s USING(run_id)
        WHERE s.dataset_id=$1 AND s.source='enforcer'",
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await?;
    row.map(|r| {
        Ok(RunInfo {
            run_id: r.try_get("run_id")?,
            event_contract_version: r.try_get("event_contract_version")?,
            capabilities: r.try_get("capabilities")?,
            monitor_commit: r.try_get("monitor_commit")?,
            node_commit: r.try_get("node_commit")?,
            enforcer_commit: r.try_get("enforcer_commit")?,
            status: r.try_get("status")?,
        })
    })
    .transpose()
}
pub async fn meta(pool: &PgPool, symbol: &str, decimals: u8) -> Result<MetaResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, None).await?;
    let response = MetaResponse {
        meta: response_meta(&mut tx, &data).await?,
        source_schema_version: sqlx::query_scalar(
            "SELECT source_schema_version FROM ops.source_status WHERE dataset_id=$1",
        )
        .bind(data.dataset_id)
        .fetch_optional(&mut *tx)
        .await?
        .flatten(),
        current_run: run_info(&mut tx, data.dataset_id).await?,
        dataset: data,
        native_asset: NativeAsset {
            symbol: symbol.to_owned(),
            decimals,
        },
    };
    tx.commit().await?;
    Ok(response)
}
async fn latest_block(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<Option<ObservedBlock>, StorageError> {
    let s = branch(tx, id).await?;
    Ok(match (s.tip_hash, s.tip_height, s.observed_at) {
        (Some(hash), Some(height), Some(observed_at)) => Some(ObservedBlock {
            hash,
            height,
            observed_at,
            branch_status: s.status,
        }),
        _ => None,
    })
}
/// What `/status` reports from the stored sync state and import progress.
struct SyncHealth {
    mode: SyncMode,
    reachable: bool,
    stale: bool,
}

/// `last_cycle_at` is written only when a cycle ends, and a long catch-up cycle
/// (many pages of large events) can run for minutes. A cursor committed after
/// the last cycle end is proof the importer is alive: it keeps the status fresh
/// and supersedes a stored `interrupted` from an earlier failed cycle. A cycle
/// that keeps failing without committing anything still shows as interrupted.
fn sync_health(
    raw: &str,
    reachable: bool,
    cycle: Option<DateTime<Utc>>,
    progress: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
    seconds: i64,
) -> Result<SyncHealth, StorageError> {
    let progressed = match (progress, cycle) {
        (Some(p), Some(c)) => p > c,
        (Some(_), None) => true,
        _ => false,
    };
    let alive = if progressed { progress } else { cycle };
    let stale = is_stale(alive, now, seconds);
    let mode = if stale && raw != "incompatible" {
        SyncMode::Interrupted
    } else if raw == "interrupted" && progressed {
        SyncMode::CatchingUp
    } else {
        parse_sync_mode(raw)?
    };
    Ok(SyncHealth {
        mode,
        reachable: (reachable || (progressed && raw == "interrupted")) && !stale,
        stale,
    })
}

fn is_stale(at: Option<DateTime<Utc>>, now: DateTime<Utc>, seconds: i64) -> bool {
    at.is_none_or(|at| {
        (now - at).num_seconds() > seconds || at > now + chrono::Duration::seconds(5)
    })
}
async fn workers(
    tx: &mut Transaction<'_, Postgres>,
    run: Uuid,
    now: DateTime<Utc>,
    stale: i64,
) -> Result<Vec<WorkerStatus>, sqlx::Error> {
    sqlx::query("SELECT * FROM ingest.worker_status WHERE run_id=$1 ORDER BY worker")
        .bind(run)
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(|r| {
            let failures: i32 = r.try_get("consecutive_failures")?;
            let error: Option<String> = r.try_get("last_error")?;
            let success: Option<DateTime<Utc>> = r.try_get("last_success_at")?;
            let state = if error.is_some() {
                "degraded"
            } else if failures > 0 {
                "retrying"
            } else if is_stale(success, now, stale) {
                "stale"
            } else {
                "healthy"
            };
            Ok(WorkerStatus {
                worker: r.try_get("worker")?,
                state: state.to_owned(),
                consecutive_failures: failures,
                last_error: error,
                last_success_at: success,
                last_failure_at: r.try_get("last_failure_at")?,
                source_updated_at: r.try_get("source_updated_at")?,
            })
        })
        .collect()
}
async fn status_snapshot(
    tx: &mut Transaction<'_, Postgres>,
    stale: i64,
) -> Result<StatusResponse, StorageError> {
    let data = dataset(tx, None).await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT now()")
        .fetch_one(&mut **tx)
        .await?;
    let row = sqlx::query("SELECT * FROM ops.source_status WHERE dataset_id=$1")
        .bind(data.dataset_id)
        .fetch_one(&mut **tx)
        .await?;
    let cycle: Option<DateTime<Utc>> = row.try_get("last_cycle_at")?;
    let progress: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT max(updated_at) FROM ops.sync_cursors WHERE dataset_id=$1")
            .bind(data.dataset_id)
            .fetch_one(&mut **tx)
            .await?;
    let raw: String = row.try_get("sync_mode")?;
    let health = sync_health(
        &raw,
        row.try_get("source_reachable")?,
        cycle,
        progress,
        now,
        stale,
    )?;
    let (mode, sync_stale) = (health.mode, health.stale);
    let mut extractors = Vec::new();
    for r in sqlx::query("SELECT *,encode(last_tip_hash,'hex') AS hash FROM ingest.extractor_status WHERE dataset_id=$1 ORDER BY source")
        .bind(data.dataset_id).fetch_all(&mut **tx).await? {
        let run=r.try_get("run_id")?;
        extractors.push(ExtractorStatus {source:r.try_get("source")?,run_id:run,last_tip_hash:r.try_get("hash")?,
            last_tip_height:r.try_get("last_tip_height")?,last_error:r.try_get("last_error")?,source_updated_at:r.try_get("source_updated_at")?,
            workers:workers(tx,run,now,stale).await?});
    }
    let mut progress=sqlx::query("SELECT name,processed_event_id::text,error_event_id::text FROM ops.projection_progress WHERE dataset_id=$1 ORDER BY name")
        .bind(data.dataset_id).fetch_all(&mut **tx).await?.into_iter().map(|r| Ok(ProjectionProgress{
            name:r.try_get("name")?,processed_event_id:r.try_get("processed_event_id")?,error_event_id:r.try_get("error_event_id")?
        })).collect::<Result<Vec<_>,sqlx::Error>>()?;
    let (generation, version) = blocks::generation(tx, data.dataset_id).await?;
    if version >= 5 {
        let through:Option<i64>=sqlx::query_scalar("SELECT (b.cut->>'events')::bigint FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) WHERE h.dataset_id=$1 AND h.generation=$2").bind(data.dataset_id).bind(generation).fetch_optional(&mut **tx).await?;
        let errors = protocol_errors(tx, data.dataset_id, generation).await?;
        progress = ["blocks", "bmm"]
            .into_iter()
            .map(|name| {
                let found = errors.iter().find(|(family, _, _)| family == name);
                let fact_error = found.and_then(|(_, fact, _)| *fact);
                let error = found.and_then(|(_, fact, observation)| match (fact, observation) {
                    (Some(f), Some(o)) => Some((*f).min(*o)),
                    (f, o) => f.or(*o),
                });
                ProjectionProgress {
                    name: name.into(),
                    processed_event_id: through
                        .map(|n| fact_error.map_or(n, |e| n.min(e - 1)).to_string()),
                    error_event_id: error.map(|e| e.to_string()),
                }
            })
            .collect();
    }
    if let Some(r)=sqlx::query("SELECT event_cursor::text,error_event_id::text FROM ops.chain_jobs WHERE dataset_id=$1 AND generation=$2").bind(data.dataset_id).bind(generation).fetch_optional(&mut **tx).await? {
        progress.push(ProjectionProgress{name:"branches".into(),processed_event_id:Some(branch(tx,data.dataset_id).await?.processed_events),error_event_id:r.try_get("error_event_id")?});
    }
    let mut cursors = Vec::new();
    for (stream, column) in [
        ("source_events", "source_event_high_water"),
        ("event_observations", "source_observation_high_water"),
        ("tip_observations", "source_tip_high_water"),
        ("coverage_revisions", "source_coverage_high_water"),
    ] {
        let cursor:i64=sqlx::query_scalar("SELECT COALESCE((SELECT cursor_value FROM ops.sync_cursors WHERE dataset_id=$1 AND stream=$2),0)")
            .bind(data.dataset_id).bind(stream).fetch_one(&mut **tx).await?;
        cursors.push(StreamProgress {
            stream: stream.to_owned(),
            imported_through: cursor.to_string(),
            // Stored at cycle end; the cursor already proves rows up to itself.
            source_high_water: row
                .try_get::<Option<i64>, _>(column)?
                .map(|v| v.max(cursor).to_string()),
        });
    }
    Ok(StatusResponse {
        branch: branch(tx, data.dataset_id).await?,
        meta: response_meta(tx, &data).await?,
        sync_mode: mode,
        source_reachable: health.reachable,
        last_source_contact_at: row.try_get("last_source_contact_at")?,
        last_projection_update_at: row.try_get("last_projection_update_at")?,
        latest_observed_block: latest_block(tx, data.dataset_id).await?,
        extractors,
        sync_stale,
        last_cycle_at: cycle,
        stale_after_seconds: stale,
        progress,
        cursors,
    })
}
pub async fn status(pool: &PgPool, stale: i64) -> Result<StatusResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let response = status_snapshot(&mut tx, stale).await?;
    tx.commit().await?;
    Ok(response)
}
pub async fn overview(pool: &PgPool) -> Result<OverviewResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, None).await?;
    let context = protocol::context(&mut tx, &data).await?;
    let state = protocol::current_state(&mut tx, &context).await?;
    let active = state.as_ref().filter(|s| s.active_complete);
    let response = OverviewResponse {
        branch: context.branch,
        meta: context.meta,
        latest_observed_block: latest_block(&mut tx, data.dataset_id).await?,
        active_sidechains: active.map(|s| s.active.len() as i64),
        pending_proposals: state
            .as_ref()
            .filter(|s| s.proposals_complete)
            .map(|s| s.proposals.len() as i64),
        pending_withdrawal_bundles: active
            .filter(|s| s.active.keys().all(|k| s.bundle_complete.contains(k)))
            .map(|s| s.bundles.len() as i64),
        source_events_imported: sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM ingest.source_events WHERE dataset_id=$1",
        )
        .bind(data.dataset_id)
        .fetch_one(&mut *tx)
        .await?
        .to_string(),
        source_observations_imported: sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM ingest.event_observations WHERE dataset_id=$1",
        )
        .bind(data.dataset_id)
        .fetch_one(&mut *tx)
        .await?
        .to_string(),
    };
    tx.commit().await?;
    Ok(response)
}
pub async fn sidechains(pool: &PgPool) -> Result<SidechainsResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, None).await?;
    let context = protocol::context(&mut tx, &data).await?;
    let state = protocol::current_state(&mut tx, &context).await?;
    let mut sidechains = vec![];
    if let Some(state) = &state {
        for a in state.active.values() {
            let declaration = match a.declaration.as_ref().and_then(|d| d.declaration.as_ref()) {
                Some(pulse_source::DeclarationVersion::V0(d)) => Some(d),
                _ => None,
            };
            sidechains.push(SidechainSummary {
                slot: i16::from(a.sidechain_number),
                instance_id: a.instance_id(),
                proposal_height: i32::try_from(a.proposal_height)
                    .map_err(|_| StorageError::InvalidProjection)?,
                activation_height: i32::try_from(a.activation_height)
                    .map_err(|_| StorageError::InvalidProjection)?,
                is_current: true,
                title: declaration.map(|d| d.title.clone()),
                description: declaration.map(|d| d.description.clone()),
            });
        }
    }
    let response = SidechainsResponse {
        meta: context.meta,
        state: context.state,
        complete: state.is_some_and(|s| s.active_complete),
        sidechains,
    };
    tx.commit().await?;
    Ok(response)
}
pub async fn coverage(pool: &PgPool, stale: i64) -> Result<CoverageResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let status = status_snapshot(&mut tx, stale).await?;
    let rows=sqlx::query("SELECT * FROM (SELECT DISTINCT ON (event_contract_version,source,stream,sidechain,sidechain_instance_id)
        * FROM ingest.coverage_revisions WHERE dataset_id=$1 ORDER BY event_contract_version,source,stream,sidechain,sidechain_instance_id,revision_id DESC) latest
        WHERE lower(operation) <> 'delete' ORDER BY stream,sidechain,event_contract_version")
        .bind(status.meta.dataset_id).fetch_all(&mut *tx).await?;
    let mut streams = Vec::new();
    for r in rows {
        let payload: Value = r.try_get("row_data")?;
        let height = |key: &str| payload[key].as_i64().and_then(|v| i32::try_from(v).ok());
        let verification:Option<Value>=sqlx::query_scalar("SELECT result FROM projection.chain_coverage WHERE dataset_id=$1 AND generation=$2 AND source_revision=$3")
            .bind(status.meta.dataset_id).bind(status.meta.projection_generation).bind(r.try_get::<i64,_>("revision_id")?).fetch_optional(&mut *tx).await?;
        streams.push(CoverageScope {
            verification: verification
                .map(serde_json::from_value)
                .transpose()
                .map_err(|_| StorageError::InvalidProjection)?,
            revision_id: r.try_get::<i64, _>("revision_id")?.to_string(),
            stream: r.try_get("stream")?,
            slot: r.try_get("sidechain")?,
            instance_id: r.try_get("sidechain_instance_id")?,
            event_contract_version: r.try_get("event_contract_version")?,
            source_status: payload["status"].as_str().unwrap_or("unknown").to_owned(),
            start_height: height("coverage_start_height"),
            target_height: height("target_tip_height"),
            covered_height: height("covered_tip_height"),
            changed_at: r.try_get("changed_at")?,
        });
    }
    let local = if status
        .progress
        .iter()
        .any(|p| p.name == "branches" && p.error_event_id.is_some())
    {
        "projection_incomplete"
    } else if !matches!(status.sync_mode, SyncMode::Following) {
        "import_incomplete"
    } else {
        if !streams.is_empty()
            && streams.iter().all(|s| {
                s.verification
                    .as_ref()
                    .is_some_and(|v| v.status == "verified")
            })
        {
            "branch_verified"
        } else {
            "imported_branch_unverified"
        }
    };
    let observation_quality: Value = sqlx::query_scalar("SELECT jsonb_build_object(
        'window_hours',24,
        'snapshot_groups',(SELECT count(*)::text FROM ingest.snapshot_groups WHERE dataset_id=$1 AND started_at>now()-interval '24 hours'),
        'changed_groups',(SELECT count(*)::text FROM ingest.snapshot_groups WHERE dataset_id=$1 AND started_at>now()-interval '24 hours' AND consistency='changed'),
        'untrusted_groups',(SELECT count(*)::text FROM ingest.snapshot_groups WHERE dataset_id=$1 AND started_at>now()-interval '24 hours' AND consistency<>'tip_matched'),
        'consistency',(SELECT coalesce(jsonb_object_agg(consistency,n),'{}'::jsonb) FROM (SELECT consistency,count(*)::text AS n FROM ingest.snapshot_groups WHERE dataset_id=$1 AND started_at>now()-interval '24 hours' GROUP BY consistency) c),
        'import_conflicts',(SELECT count(*)::text FROM ingest.import_conflicts WHERE dataset_id=$1),
        'failures',(SELECT count(*)::text FROM ingest.observation_failures WHERE dataset_id=$1 AND observed_at>now()-interval '24 hours'),
        'failure_import_cursor',(SELECT cursor_value::text FROM ops.sync_cursors WHERE dataset_id=$1 AND stream='observation_failures'),
        'conflicted_blocks',(SELECT count(*)::text FROM projection.chain_headers WHERE dataset_id=$1 AND generation=$2 AND conflicted))")
        .bind(status.meta.dataset_id).bind(status.meta.projection_generation).fetch_one(&mut *tx).await?;
    let transition_gaps: Value = sqlx::query_scalar("SELECT coalesce(jsonb_agg(g ORDER BY (g->>'event_id')::bigint DESC),'[]'::jsonb) FROM (
        SELECT jsonb_build_object('event_id',f.event_id::text,'observed_at',e.observed_at,
            'gap_start_hash',f.data#>>'{gap_start,hash}','gap_start_height',f.data#>'{gap_start,height}',
            'gap_end_hash',f.data#>>'{header,hash}','gap_end_height',f.data#>'{header,height}') AS g
          FROM projection.protocol_facts f JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id
         WHERE f.dataset_id=$1 AND f.generation=$2 AND f.kind='mainchain_transition' AND f.error IS NULL AND f.data->>'action'='3'
         ORDER BY f.event_id DESC LIMIT 50) gaps")
        .bind(status.meta.dataset_id).bind(status.meta.projection_generation).fetch_one(&mut *tx).await?;
    let response = CoverageResponse {
        branch: status.branch,
        meta: status.meta,
        streams,
        local_status: local.to_owned(),
        snapshot_history: "observations_only".to_owned(),
        observation_quality,
        transition_gaps,
    };
    tx.commit().await?;
    Ok(response)
}
pub async fn auctions(pool: &PgPool, stale: i64) -> Result<BmmAuctionsResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let status = status_snapshot(&mut tx, stale).await?;
    let run = run_info(&mut tx, status.meta.dataset_id).await?;
    let capable = run.as_ref().is_some_and(|r| {
        MONITOR_EVENT_CONTRACT_VERSIONS.contains(&r.event_contract_version)
            && r.status == "running"
            && r.capabilities
                .as_array()
                .is_some_and(|caps| caps.iter().any(|c| c == "live_bmm_bid_snapshots"))
    });
    let row=sqlx::query("SELECT o.observation_id,o.observed_at,o.run_id,e.source_event_id,e.interpretation_error,
        b.parent_hash,b.requests,
        (e.event_contract_version=$4 AND COALESCE(
            g.run_id=o.run_id AND g.consistency='tip_matched' AND g.revision_before IS NULL AND g.revision_after IS NULL
            AND g.tip_before_hash=e.block_hash AND g.tip_after_hash=e.block_hash
            AND g.tip_before_height=e.height AND g.tip_after_height=e.height,
            false)) AS consistent
        FROM ingest.event_observations o JOIN ingest.source_events e
        ON e.dataset_id=o.dataset_id AND e.source_event_id=o.source_event_id
        LEFT JOIN projection.bmm_snapshots b ON b.dataset_id=e.dataset_id AND b.source_event_id=e.source_event_id
        LEFT JOIN ingest.snapshot_groups g ON g.dataset_id=o.dataset_id AND g.snapshot_group_id=o.snapshot_group_id
        WHERE o.dataset_id=$1 AND o.run_id=$2 AND e.kind='bmm_requests' AND e.event_contract_version=ANY($3)
        ORDER BY o.capture_seq DESC LIMIT 1")
        .bind(status.meta.dataset_id).bind(run.as_ref().map(|r|r.run_id)).bind(MONITOR_EVENT_CONTRACT_VERSIONS)
        .bind(run.as_ref().map(|r|r.event_contract_version)).fetch_optional(&mut *tx).await?;
    let mut response = BmmAuctionsResponse {
        mempool_readiness: "unknown".into(),
        bid_coverage: "observed_only".into(),
        meta: status.meta,
        state: if capable {
            "awaiting_observation"
        } else {
            "unavailable"
        }
        .to_owned(),
        source_event_id: None,
        observation_id: None,
        run_id: run.map(|r| r.run_id),
        observed_at: None,
        parent_hash: None,
        requests: Vec::new(),
        evidence_url: None,
    };
    if let Some(r) = row {
        let id: i64 = r.try_get("source_event_id")?;
        response.source_event_id = Some(id.to_string());
        response.observation_id = Some(r.try_get::<i64, _>("observation_id")?.to_string());
        response.observed_at = Some(r.try_get("observed_at")?);
        response.parent_hash = r.try_get("parent_hash")?;
        response.evidence_url = Some(format!(
            "/datasets/{}/events/{id}",
            response.meta.dataset_id
        ));
        let raw: Option<Value> = r.try_get("requests")?;
        response.requests = raw
            .clone()
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| StorageError::InvalidProjection)?
            .unwrap_or_default();
        response.state = if r
            .try_get::<Option<String>, _>("interpretation_error")?
            .is_some()
        {
            "interpretation_error"
        } else if raw.is_none() {
            "awaiting_observation"
        } else if response.requests.is_empty() {
            "no_observed_bids"
        } else {
            "available"
        }
        .to_owned();
        let now: DateTime<Utc> = sqlx::query_scalar("SELECT now()")
            .fetch_one(&mut *tx)
            .await?;
        if is_stale(response.observed_at, now, stale) {
            response.state = "stale".to_owned();
        }
        if let (Some(tip), Some(parent)) = (&status.latest_observed_block, &response.parent_hash)
            && tip.hash != *parent
            && matches!(response.state.as_str(), "available" | "no_observed_bids")
        {
            response.state = "awaiting_current_parent".to_owned();
        }
        // Consistency belongs to the occurrence, since the same immutable fact
        // can be sampled again under a different group.
        if !r.try_get::<bool, _>("consistent")? {
            response.state = "inconsistent_snapshot".to_owned();
        }
    }
    if status.branch.status == "ambiguous"
        && matches!(
            response.state.as_str(),
            "available" | "no_observed_bids" | "awaiting_current_parent"
        )
    {
        response.state = "branch_unresolved".into();
    }
    let worker = status
        .extractors
        .iter()
        .flat_map(|e| &e.workers)
        .find(|w| w.worker == "bmm_requests");
    if !capable {
        response.state = "unavailable".to_owned();
    } else if status.sync_stale
        || !status.source_reachable
        || !matches!(status.sync_mode, SyncMode::Following)
    {
        response.state = "stale".to_owned();
    } else if worker.is_some_and(|w| w.last_error.is_some() || w.consecutive_failures > 0) {
        response.state = "rpc_error".to_owned();
    } else if worker.is_none_or(|w| w.state != "healthy") {
        response.state = "stale".to_owned();
    }
    tx.commit().await?;
    Ok(response)
}
pub async fn evidence(
    pool: &PgPool,
    dataset_id: Uuid,
    event_id: i64,
) -> Result<EvidenceResponse, StorageError> {
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, Some(dataset_id))
        .await
        .map_err(|e| match e {
            StorageError::NoDataset => StorageError::NotFound,
            e => e,
        })?;
    let row=sqlx::query("SELECT *,payload::text AS payload_json,encode(envelope,'hex') AS envelope_hex,
        encode(fact_sha256,'hex') AS fact_hash FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id=$2")
        .bind(dataset_id).bind(event_id).fetch_optional(&mut *tx).await?.ok_or(StorageError::NotFound)?;
    let mut occurrences=sqlx::query("SELECT * FROM ingest.event_observations WHERE dataset_id=$1 AND source_event_id=$2 ORDER BY observation_id DESC LIMIT 101")
        .bind(dataset_id).bind(event_id).fetch_all(&mut *tx).await?.into_iter().map(|r|Ok(EvidenceOccurrence{
            observation_id:r.try_get::<i64,_>("observation_id")?.to_string(),run_id:r.try_get("run_id")?,capture_seq:r.try_get::<i64,_>("capture_seq")?.to_string(),
            capture_method:r.try_get("capture_method")?,observed_at:r.try_get("observed_at")?,snapshot_group_id:r.try_get("snapshot_group_id")?})).collect::<Result<Vec<_>,sqlx::Error>>()?;
    let truncated = occurrences.len() > 100;
    occurrences.truncate(100);
    let response = EvidenceResponse {
        meta: response_meta(&mut tx, &data).await?,
        source_event_id: event_id.to_string(),
        event_contract_version: row.try_get("event_contract_version")?,
        kind: row.try_get("kind")?,
        fact_sha256: row.try_get("fact_hash")?,
        envelope_hex: row.try_get("envelope_hex")?,
        payload_json: row.try_get("payload_json")?,
        raw_block_omitted: row.try_get::<String, _>("source")? == "node"
            && row.try_get::<String, _>("kind")? == "mainchain_block",
        interpretation_error: match row.try_get::<Option<String>,_>("interpretation_error")? {
            // The importer's error, then the chain's, then the protocol facts'.
            Some(e)=>Some(e),None=>sqlx::query_scalar("SELECT coalesce(
                (SELECT error FROM projection.chain_facts WHERE dataset_id=$1 AND generation=(SELECT projection_generation FROM ops.active_dataset WHERE dataset_id=$1) AND event_id=$2),
                (SELECT string_agg(error,'; ' ORDER BY ordinal) FROM projection.protocol_facts WHERE dataset_id=$1 AND generation=(SELECT projection_generation FROM ops.active_dataset WHERE dataset_id=$1) AND event_id=$2 AND error IS NOT NULL))").bind(dataset_id).bind(event_id).fetch_one(&mut *tx).await?
        },
        occurrences,
        occurrences_truncated: truncated,
    };
    tx.commit().await?;
    Ok(response)
}

#[derive(Debug, Clone)]
pub struct StreamWindow {
    pub cursor: StreamCursor,
    pub floor: i64,
}
impl StreamWindow {
    pub fn accepts(&self, cursor: StreamCursor) -> bool {
        cursor.dataset_id == self.cursor.dataset_id
            && cursor.generation == self.cursor.generation
            && cursor.revision >= self.floor
            && cursor.revision <= self.cursor.revision
    }
}
pub async fn stream_window(pool: &PgPool) -> Result<StreamWindow, StorageError> {
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, None).await?;
    let meta = response_meta(&mut tx, &data).await?;
    let floor =
        sqlx::query_scalar("SELECT replay_floor FROM ops.active_dataset WHERE dataset_id=$1")
            .bind(data.dataset_id)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(StreamWindow {
        cursor: StreamCursor {
            dataset_id: meta.dataset_id,
            generation: meta.projection_generation,
            revision: meta.pulse_revision,
        },
        floor,
    })
}
pub async fn updates_after(
    pool: &PgPool,
    cursor: StreamCursor,
    through: i64,
    limit: i64,
) -> Result<Vec<PublicUpdate>, StorageError> {
    let rows=sqlx::query("SELECT * FROM ops.pulse_updates WHERE dataset_id=$1 AND projection_generation=$2 AND revision>$3 AND revision<=$4 ORDER BY revision LIMIT $5")
        .bind(cursor.dataset_id).bind(cursor.generation).bind(cursor.revision).bind(through).bind(limit).fetch_all(pool).await?;
    rows.into_iter()
        .map(|r| {
            Ok(PublicUpdate {
                dataset_id: r.try_get("dataset_id")?,
                projection_generation: r.try_get("projection_generation")?,
                revision: r.try_get("revision")?,
                source_event_id: r.try_get("source_event_id")?,
                changed: serde_json::from_value(r.try_get("changed")?)
                    .map_err(|_| StorageError::InvalidProjection)?,
                activity: serde_json::from_value(r.try_get("activity")?)
                    .map_err(|_| StorageError::InvalidProjection)?,
            })
        })
        .collect()
}
fn parse_sync_mode(value: &str) -> Result<SyncMode, StorageError> {
    match value {
        "bootstrap" => Ok(SyncMode::Bootstrap),
        "catching_up" => Ok(SyncMode::CatchingUp),
        "following" => Ok(SyncMode::Following),
        "interrupted" => Ok(SyncMode::Interrupted),
        "incompatible" => Ok(SyncMode::Incompatible),
        _ => Err(StorageError::InvalidSyncMode(value.to_owned())),
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_progress_after_a_failed_cycle_reads_as_catching_up() {
        let now = Utc::now();
        let failed = Some(now - chrono::Duration::seconds(300));
        let page = Some(now - chrono::Duration::seconds(3));
        let h = sync_health("interrupted", false, failed, page, now, 30).unwrap();
        assert!(matches!(h.mode, SyncMode::CatchingUp) && h.reachable && !h.stale);
        // No commit since the failure: still interrupted and unreachable.
        let h = sync_health("interrupted", false, failed, failed, now, 30).unwrap();
        assert!(matches!(h.mode, SyncMode::Interrupted) && !h.reachable && h.stale);
    }

    #[test]
    fn a_long_healthy_cycle_stays_fresh_while_pages_commit() {
        let now = Utc::now();
        let ended = Some(now - chrono::Duration::seconds(600));
        let page = Some(now - chrono::Duration::seconds(2));
        let h = sync_health("catching_up", true, ended, page, now, 30).unwrap();
        assert!(matches!(h.mode, SyncMode::CatchingUp) && h.reachable && !h.stale);
        let h = sync_health("catching_up", true, ended, ended, now, 30).unwrap();
        assert!(matches!(h.mode, SyncMode::Interrupted) && !h.reachable);
        let h = sync_health("incompatible", true, ended, page, now, 30).unwrap();
        assert!(matches!(h.mode, SyncMode::Incompatible));
    }
    #[test]
    fn cursors_are_scoped_and_bounded() {
        let cursor = StreamCursor {
            dataset_id: Uuid::new_v4(),
            generation: 2,
            revision: 1000,
        };
        let window = StreamWindow { cursor, floor: 100 };
        assert!(window.accepts(StreamCursor {
            revision: 500,
            ..cursor
        }));
        assert!(!window.accepts(StreamCursor {
            generation: 1,
            ..cursor
        }));
        assert!(!window.accepts(StreamCursor {
            dataset_id: Uuid::new_v4(),
            ..cursor
        }));
        assert!(!window.accepts(StreamCursor {
            revision: 99,
            ..cursor
        }));
        assert!(!window.accepts(StreamCursor {
            revision: 1001,
            ..cursor
        }));
    }
    #[test]
    fn stopped_sync_and_future_timestamps_are_stale() {
        let now = Utc::now();
        assert!(is_stale(None, now, 30));
        assert!(is_stale(Some(now - chrono::Duration::seconds(31)), now, 30));
        assert!(is_stale(Some(now + chrono::Duration::seconds(20)), now, 30));
        assert!(!is_stale(Some(now), now, 30));
    }
}
