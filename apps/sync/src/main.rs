use std::time::Duration;

use anyhow::{Context as _, Result, bail};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use pulse_domain::{
    MONITOR_EVENT_CONTRACT_VERSIONS, PROJECTION_VERSION, REQUIRED_CAPABILITIES,
    REQUIRED_MONITOR_SCHEMA_VERSION,
};

mod chain;
mod projector;
mod protocol;
use serde_json::{Value, json};
use sqlx::postgres::{PgConnection, PgPool};
use sqlx::{Connection as _, FromRow};
use tracing::{error, warn};
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

#[derive(Debug)]
struct Incompatible(String);
impl std::fmt::Display for Incompatible {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}
impl std::error::Error for Incompatible {}
fn incompatible(message: impl Into<String>) -> anyhow::Error {
    Incompatible(message.into()).into()
}

#[derive(Debug, Parser)]
#[command(version, about)]
struct Args {
    #[command(subcommand)]
    command: Option<Command>,
    #[arg(long, env = "MONITOR_DATABASE_URL")]
    monitor_database_url: Option<String>,

    #[arg(
        long,
        env = "PULSE_DATABASE_URL",
        global = true,
        default_value = "postgres://pulse_sync:pulse_sync_dev@127.0.0.1:55433/drivechain_pulse"
    )]
    pulse_database_url: String,

    #[arg(long, env = "PULSE_SYNC_BATCH_SIZE", default_value_t = 500)]
    batch_size: i64,

    /// Upper bound on the stored bytes of one source event page. Node raw blocks
    /// reach megabytes each, so a row-count page alone can exceed the reader's
    /// statement timeout over a tunnel. A larger single event still imports alone.
    #[arg(long, env = "PULSE_SYNC_EVENT_PAGE_BYTES", default_value_t = 16 * 1024 * 1024)]
    event_page_bytes: i64,

    #[arg(long, env = "PULSE_SYNC_INTERVAL_MS", default_value_t = 1_000)]
    interval_ms: u64,

    #[arg(long, env = "PULSE_SYNC_MAX_PAGES_PER_CYCLE", default_value_t = 20)]
    max_pages_per_cycle: u32,

    #[arg(long, env = "PULSE_DATASET_ID", global = true)]
    dataset_id: Option<Uuid>,

    #[arg(long, env = "PULSE_NETWORK_ID", default_value = "betanet")]
    network_id: String,

    #[arg(long, env = "PULSE_ACTIVATION_HEIGHT", default_value_t = 967680)]
    activation_height: i32,

    #[arg(
        long,
        env = "PULSE_ACTIVATION_HASH",
        default_value = "00000000000000030101ba5cfea54b22becc79f95dc6040beb76e01dd9d04042"
    )]
    activation_hash: String,

    #[arg(long)]
    once: bool,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Rebuild and validate local chain projections with sync/API stopped.
    Rebuild {
        /// Start a new staging generation instead of resuming the previous attempt.
        #[arg(long)]
        fresh: bool,
    },
}

#[derive(Debug, FromRow)]
struct SourceDataset {
    dataset_id: Uuid,
    network_id: String,
    activation_height: i32,
    activation_block_hash: String,
    initial_node_commit: String,
    initial_enforcer_commit: String,
    initial_monitor_commit: String,
    initial_event_contract_version: i32,
    capabilities: Value,
    creation_reason: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct SourceRun {
    run_id: Uuid,
    dataset_id: Uuid,
    source: String,
    node_commit: String,
    enforcer_commit: String,
    monitor_commit: String,
    event_contract_version: i32,
    capabilities: Value,
    status: String,
    last_capture_seq: i64,
    started_at: DateTime<Utc>,
    finished_at: Option<DateTime<Utc>>,
    finish_reason: Option<String>,
}

#[derive(Debug, FromRow)]
struct SourceEvent {
    id: i64,
    dataset_id: Uuid,
    event_contract_version: i32,
    observed_at: DateTime<Utc>,
    ingested_at: DateTime<Utc>,
    source: String,
    kind: String,
    sidechain: Option<i16>,
    sidechain_instance_id: Option<String>,
    block_hash: Option<Vec<u8>>,
    height: Option<i32>,
    envelope: Vec<u8>,
    envelope_sha256: Option<Vec<u8>>,
    fact_sha256: Option<Vec<u8>>,
    payload: Value,
}

#[derive(Debug, FromRow)]
struct SourceSnapshotGroup {
    snapshot_group_id: Uuid,
    dataset_id: Uuid,
    run_id: Uuid,
    capture_method: String,
    started_at: DateTime<Utc>,
    finished_at: DateTime<Utc>,
    tip_before_hash: Vec<u8>,
    tip_before_height: i32,
    tip_after_hash: Vec<u8>,
    tip_after_height: i32,
    consistency: String,
    attempts: i32,
    revision_before: Option<String>,
    revision_after: Option<String>,
}

#[derive(Debug, FromRow)]
struct SourceEventObservation {
    observation_id: i64,
    dataset_id: Uuid,
    run_id: Uuid,
    capture_seq: i64,
    capture_method: String,
    event_id: i64,
    snapshot_group_id: Option<Uuid>,
    observed_at: DateTime<Utc>,
    ingested_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct SourceTipObservation {
    tip_observation_id: i64,
    dataset_id: Uuid,
    run_id: Uuid,
    capture_seq: i64,
    capture_method: String,
    tip_hash: Vec<u8>,
    tip_height: i32,
    previous_observed_hash: Option<Vec<u8>>,
    previous_observed_height: Option<i32>,
    observed_at: DateTime<Utc>,
    ingested_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct SourceInstance {
    dataset_id: Uuid,
    sidechain_instance_id: String,
    sidechain: i16,
    raw_description: Vec<u8>,
    description_sha256d: Vec<u8>,
    proposal_height: i32,
    activation_height: i32,
    first_seen_at: DateTime<Utc>,
    last_seen_at: DateTime<Utc>,
    is_current: bool,
}

#[derive(Debug, FromRow)]
struct SourceCoverageRevision {
    revision_id: i64,
    dataset_id: Uuid,
    event_contract_version: i32,
    source: String,
    stream: String,
    sidechain: Option<i16>,
    sidechain_instance_id: Option<String>,
    operation: String,
    row_data: Value,
    changed_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct SourceExtractorStatus {
    dataset_id: Uuid,
    source: String,
    run_id: Uuid,
    last_tip_hash: Option<Vec<u8>>,
    last_tip_height: Option<i32>,
    last_error: Option<String>,
    updated_at: DateTime<Utc>,
}

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    let args = Args::parse();
    if args.batch_size <= 0 {
        bail!("PULSE_SYNC_BATCH_SIZE must be positive");
    }
    if args.event_page_bytes <= 0 {
        bail!("PULSE_SYNC_EVENT_PAGE_BYTES must be positive");
    }
    if args.max_pages_per_cycle == 0 {
        bail!("PULSE_SYNC_MAX_PAGES_PER_CYCLE must be positive");
    }
    if args.interval_ms == 0 {
        bail!("PULSE_SYNC_INTERVAL_MS must be positive");
    }
    let destination = pulse_storage::connect(&args.pulse_database_url, 4)
        .await
        .context("connecting to PostgreSQL Observatory")?;
    if let Some(Command::Rebuild { fresh }) = args.command {
        return chain::rebuild(
            &destination,
            args.dataset_id
                .context("PULSE_DATASET_ID or --dataset-id is required")?,
            args.batch_size,
            fresh,
        )
        .await;
    }
    let source_url = args
        .monitor_database_url
        .as_deref()
        .context("MONITOR_DATABASE_URL is required for synchronization")?;
    let source = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(10))
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("SET default_transaction_read_only = on")
                    .execute(&mut *connection)
                    .await?;
                sqlx::query("SET statement_timeout = '30s'")
                    .execute(&mut *connection)
                    .await?;
                sqlx::query("SET idle_in_transaction_session_timeout = '15s'")
                    .execute(&mut *connection)
                    .await?;
                Ok(())
            })
        })
        .connect_lazy(source_url)?;
    let mut failures = 0_u32;
    loop {
        let result = sync_cycle(&source, &destination, &args).await;
        if let Err(error) = &result {
            error!(%error, "Observatory synchronization cycle failed");
            let mode = if error.downcast_ref::<Incompatible>().is_some() {
                "incompatible"
            } else {
                "interrupted"
            };
            mark_interrupted(
                &destination,
                args.dataset_id
                    .context("PULSE_DATASET_ID or --dataset-id is required")?,
                mode,
            )
            .await;
            failures = failures.saturating_add(1);
        } else {
            failures = 0;
        }
        if args.once {
            return result;
        }
        // Bounded backoff with per-cycle jitter. A quiet network is not failure.
        let jitter = u64::from(Uuid::new_v4().as_bytes()[0]);
        let delay = if failures == 0 {
            args.interval_ms
        } else {
            (args.interval_ms.saturating_mul(1_u64 << failures.min(5))).min(30_000) + jitter
        };
        tokio::select! {
            () = tokio::time::sleep(Duration::from_millis(delay)) => {},
            result = tokio::signal::ctrl_c() => { result?; return Ok(()); }
        }
    }
}

async fn sync_cycle(source: &PgPool, destination: &PgPool, args: &Args) -> Result<()> {
    let schema_version: i32 =
        sqlx::query_scalar("SELECT COALESCE(max(version), 0) FROM schema_version")
            .fetch_one(source)
            .await
            .context("reading monitor schema version")?;
    if schema_version != REQUIRED_MONITOR_SCHEMA_VERSION {
        return Err(incompatible(format!(
            "monitor SQL schema {schema_version}; reviewed schema {REQUIRED_MONITOR_SCHEMA_VERSION} is required"
        )));
    }
    // Probe the actual required columns, including additive v5/v6 migrations.
    sqlx::query("SELECT e.fact_sha256, w.worker, w.last_success_at, w.consecutive_failures FROM event e CROSS JOIN extractor_worker_status w LIMIT 0")
        .execute(source).await.map_err(|_| incompatible("required monitor v5 columns or SELECT permissions are absent"))?;
    sqlx::query(
        "SELECT d.dataset_id, r.run_id, o.capture_seq, t.tip_hash, g.consistency,
        i.sidechain_instance_id, c.sidechain, h.event_contract_version, v.row_data, s.last_tip_hash
        FROM dataset_manifest d CROSS JOIN extractor_run r CROSS JOIN event_observation o
        CROSS JOIN tip_observation t CROSS JOIN snapshot_group g CROSS JOIN sidechain_instance i
        CROSS JOIN current_sidechain_instance c CROSS JOIN history_coverage h
        CROSS JOIN history_coverage_revision v CROSS JOIN extractor_status s
        CROSS JOIN observation_failure f LIMIT 0",
    )
    .execute(source)
    .await
    .map_err(|_| {
        incompatible("required source relations/columns or reader permissions are absent")
    })?;
    let run = sqlx::query_as::<_, SourceRun>(
        "SELECT r.* FROM extractor_run r JOIN extractor_status s ON s.run_id=r.run_id
         WHERE s.dataset_id=$1 AND s.source='enforcer'",
    )
    .bind(
        args.dataset_id
            .context("PULSE_DATASET_ID or --dataset-id is required")?,
    )
    .fetch_optional(source)
    .await?
    .ok_or_else(|| incompatible("configured dataset has no current enforcer run"))?;
    if !MONITOR_EVENT_CONTRACT_VERSIONS.contains(&run.event_contract_version)
        || !REQUIRED_CAPABILITIES.iter().all(|cap| {
            run.capabilities
                .as_array()
                .is_some_and(|caps| caps.iter().any(|v| v.as_str() == Some(cap)))
        })
    {
        return Err(incompatible(
            "current run must provide a supported contract and all required capabilities",
        ));
    }
    // Node evidence is a separate run; when present it must speak the same
    // contract and provide what the chain projection depends on.
    let node_run: Option<(i32, Value)> = sqlx::query_as(
        "SELECT r.event_contract_version,r.capabilities FROM extractor_run r JOIN extractor_status s ON s.run_id=r.run_id
         WHERE s.dataset_id=$1 AND s.source='node'",
    )
    .bind(run.dataset_id)
    .fetch_optional(source)
    .await?;
    if let Some((contract, capabilities)) = node_run {
        let has = |cap: &str| {
            capabilities
                .as_array()
                .is_some_and(|caps| caps.iter().any(|v| v.as_str() == Some(cap)))
        };
        if contract != run.event_contract_version
            || ![
                "node_block_evidence",
                "absolute_chain_work",
                "resumable_node_history",
            ]
            .iter()
            .all(|cap| has(cap))
        {
            return Err(incompatible(
                "the current node run lacks the contract or node evidence capabilities",
            ));
        }
    }
    // Every official contract owns a fresh dataset; facts never mix versions.
    let old_identity: bool = sqlx::query_scalar(
        "SELECT d.initial_event_contract_version <> $2 FROM dataset_manifest d WHERE d.dataset_id=$1",
    )
    .bind(run.dataset_id)
    .bind(run.event_contract_version)
    .fetch_one(source)
    .await?;
    if old_identity {
        return Err(incompatible(
            "the dataset was created by another event contract; a fresh dataset is required",
        ));
    }
    sync_datasets(source, destination, args).await?;
    sync_runs(
        source,
        destination,
        args.dataset_id
            .context("PULSE_DATASET_ID or --dataset-id is required")?,
    )
    .await?;
    sync_failures(
        source,
        destination,
        run.dataset_id,
        args.batch_size,
        args.max_pages_per_cycle,
    )
    .await?;
    sync_dataset(
        source,
        destination,
        args.dataset_id
            .context("PULSE_DATASET_ID or --dataset-id is required")?,
        schema_version,
        args.batch_size,
        args.event_page_bytes,
        args.max_pages_per_cycle,
    )
    .await
}

/// Runs already imported. `sync_runs` reads runs once per cycle, so a run the
/// monitor starts mid-cycle is unknown until the next one; its rows must wait
/// rather than fail the `run_id` foreign key.
async fn known_runs(
    destination: &mut PgConnection,
    runs: impl IntoIterator<Item = Uuid>,
) -> Result<std::collections::HashSet<Uuid>> {
    let runs = runs.into_iter().collect::<Vec<_>>();
    if runs.is_empty() {
        return Ok(std::collections::HashSet::new());
    }
    Ok(
        sqlx::query_scalar("SELECT run_id FROM ingest.extractor_runs WHERE run_id=ANY($1)")
            .bind(&runs)
            .fetch_all(&mut *destination)
            .await?
            .into_iter()
            .collect(),
    )
}

/// The longest prefix of an id-ordered page whose rows are importable. A blocked
/// row is never skipped: everything after it waits with it.
fn importable_prefix<T>(rows: Vec<T>, importable: impl Fn(&T) -> bool) -> Vec<T> {
    rows.into_iter().take_while(|row| importable(row)).collect()
}

async fn sync_failures(
    source: &PgPool,
    destination: &PgPool,
    dataset: Uuid,
    limit: i64,
    pages: u32,
) -> Result<()> {
    #[derive(sqlx::FromRow)]
    struct Failure {
        failure_id: i64,
        run_id: Uuid,
        worker: String,
        observed_at: DateTime<Utc>,
        error: String,
    }
    for _ in 0..pages {
        let mut tx = destination.begin().await?;
        let after = cursor(&mut tx, dataset, "observation_failures").await?;
        let fetched = sqlx::query_as::<_, Failure>("SELECT failure_id,run_id,worker,observed_at,error FROM observation_failure WHERE dataset_id=$1 AND failure_id>$2 ORDER BY failure_id LIMIT $3")
            .bind(dataset).bind(after).bind(limit).fetch_all(source).await?;
        let fetched_all = fetched.len() < usize::try_from(limit)?;
        let known = known_runs(&mut tx, fetched.iter().map(|row| row.run_id)).await?;
        let total = fetched.len();
        let rows = importable_prefix(fetched, |row| known.contains(&row.run_id));
        let blocked = rows.len() < total;
        for row in &rows {
            sqlx::query("INSERT INTO ingest.observation_failures VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING")
                .bind(dataset).bind(row.failure_id).bind(row.run_id).bind(&row.worker).bind(row.observed_at).bind(&row.error).execute(&mut *tx).await?;
        }
        if let Some(last) = rows.last() {
            advance_cursor(&mut tx, dataset, "observation_failures", last.failure_id).await?;
        }
        tx.commit().await?;
        if fetched_all || blocked {
            break;
        }
    }
    Ok(())
}

async fn sync_datasets(source: &PgPool, destination: &PgPool, args: &Args) -> Result<()> {
    let datasets = sqlx::query_as::<_, SourceDataset>(
        "SELECT dataset_id, network_id, activation_height, activation_block_hash, \
                initial_node_commit, initial_enforcer_commit, initial_monitor_commit, \
                initial_event_contract_version, capabilities, creation_reason, created_at \
           FROM dataset_manifest WHERE dataset_id = $1",
    )
    .bind(
        args.dataset_id
            .context("PULSE_DATASET_ID or --dataset-id is required")?,
    )
    .fetch_all(source)
    .await
    .context("reading monitor datasets")?;
    if datasets.len() != 1 {
        return Err(incompatible("configured dataset does not exist"));
    }
    let mut transaction = destination.begin().await?;
    for dataset in &datasets {
        if !REQUIRED_CAPABILITIES.iter().all(|cap| {
            dataset
                .capabilities
                .as_array()
                .is_some_and(|caps| caps.iter().any(|v| v.as_str() == Some(cap)))
        }) {
            return Err(incompatible(
                "the dataset manifest lacks required capabilities",
            ));
        }
        if dataset.network_id != args.network_id
            || dataset.activation_height != args.activation_height
            || dataset.activation_block_hash != args.activation_hash
        {
            return Err(incompatible(
                "dataset network/checkpoint does not match configured identity",
            ));
        }
        // The monitor writes a dataset manifest once; a changed one is not a
        // newer version of the same evidence.
        let same: bool = sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM ingest.datasets WHERE dataset_id=$1 AND (network_id <> $2 OR activation_height <> $3 OR activation_block_hash <> $4 OR capabilities <> $5 OR initial_enforcer_commit <> $6 OR initial_monitor_commit <> $7 OR initial_node_commit <> $8))")
            .bind(dataset.dataset_id).bind(&dataset.network_id).bind(dataset.activation_height).bind(&dataset.activation_block_hash)
            .bind(&dataset.capabilities).bind(&dataset.initial_enforcer_commit).bind(&dataset.initial_monitor_commit).bind(&dataset.initial_node_commit)
            .fetch_one(&mut *transaction).await?;
        if !same {
            return Err(incompatible("persisted dataset manifest changed"));
        }
        sqlx::query(
            "INSERT INTO ingest.datasets \
                (dataset_id, network_id, activation_height, activation_block_hash, \
                 initial_node_commit, initial_enforcer_commit, initial_monitor_commit, \
                 initial_event_contract_version, capabilities, creation_reason, \
                 source_created_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) \
             ON CONFLICT (dataset_id) DO NOTHING",
        )
        .bind(dataset.dataset_id)
        .bind(&dataset.network_id)
        .bind(dataset.activation_height)
        .bind(&dataset.activation_block_hash)
        .bind(&dataset.initial_node_commit)
        .bind(&dataset.initial_enforcer_commit)
        .bind(&dataset.initial_monitor_commit)
        .bind(dataset.initial_event_contract_version)
        .bind(&dataset.capabilities)
        .bind(&dataset.creation_reason)
        .bind(dataset.created_at)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO ops.source_status \
                (dataset_id, source_reachable, sync_mode, last_source_contact_at, \
                 source_schema_version) \
             VALUES ($1, true, 'bootstrap', now(), $2) \
             ON CONFLICT (dataset_id) DO UPDATE SET \
                 source_reachable = true, last_source_contact_at = now(), \
                 source_schema_version = EXCLUDED.source_schema_version, \
                 last_error = NULL, updated_at = now()",
        )
        .bind(dataset.dataset_id)
        .bind(REQUIRED_MONITOR_SCHEMA_VERSION)
        .execute(&mut *transaction)
        .await?;
    }
    // Returning the winner makes first activation safe against concurrent starts.
    let active: Uuid = sqlx::query_scalar("INSERT INTO ops.active_dataset (dataset_id) VALUES ($1)
        ON CONFLICT (singleton) DO UPDATE SET dataset_id=ops.active_dataset.dataset_id RETURNING dataset_id")
        .bind(args.dataset_id.context("PULSE_DATASET_ID or --dataset-id is required")?).fetch_one(&mut *transaction).await?;
    if active
        != args
            .dataset_id
            .context("PULSE_DATASET_ID or --dataset-id is required")?
    {
        return Err(incompatible(
            "active dataset differs; explicit local reconciliation is required",
        ));
    }
    transaction.commit().await?;
    Ok(())
}

async fn sync_runs(source: &PgPool, destination: &PgPool, dataset_id: Uuid) -> Result<()> {
    let runs = sqlx::query_as::<_, SourceRun>(
        "SELECT run_id, dataset_id, source, node_commit, enforcer_commit, monitor_commit, \
                event_contract_version, capabilities, status, last_capture_seq, \
                started_at, finished_at, finish_reason \
           FROM extractor_run WHERE dataset_id = $1",
    )
    .bind(dataset_id)
    .fetch_all(source)
    .await
    .context("reading extractor runs")?;
    let mut transaction = destination.begin().await?;
    for run in runs {
        sqlx::query(
            "INSERT INTO ingest.extractor_runs \
                (run_id, dataset_id, source, node_commit, enforcer_commit, monitor_commit, \
                 event_contract_version, capabilities, status, last_capture_seq, \
                 started_at, finished_at, finish_reason) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) \
             ON CONFLICT (run_id) DO UPDATE SET \
                 status = EXCLUDED.status, \
                 last_capture_seq = EXCLUDED.last_capture_seq, \
                 finished_at = EXCLUDED.finished_at, \
                 finish_reason = EXCLUDED.finish_reason, \
                 imported_at = now()",
        )
        .bind(run.run_id)
        .bind(run.dataset_id)
        .bind(&run.source)
        .bind(&run.node_commit)
        .bind(&run.enforcer_commit)
        .bind(&run.monitor_commit)
        .bind(run.event_contract_version)
        .bind(&run.capabilities)
        .bind(&run.status)
        .bind(run.last_capture_seq)
        .bind(run.started_at)
        .bind(run.finished_at)
        .bind(&run.finish_reason)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(())
}

async fn sync_dataset(
    source: &PgPool,
    destination: &PgPool,
    dataset_id: Uuid,
    schema_version: i32,
    batch_size: i64,
    event_page_bytes: i64,
    max_pages_per_cycle: u32,
) -> Result<()> {
    let mut connection = destination.acquire().await?;
    let lock_key = dataset_id.to_string();
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(hashtext($1))")
        .bind(&lock_key)
        .fetch_one(&mut *connection)
        .await?;
    if !locked {
        warn!(%dataset_id, "another synchronizer owns this dataset");
        return Ok(());
    }

    let result = sync_dataset_locked(
        source,
        &mut connection,
        dataset_id,
        schema_version,
        batch_size,
        event_page_bytes,
        max_pages_per_cycle,
    )
    .await;
    let unlock_result: Result<bool, sqlx::Error> =
        sqlx::query_scalar("SELECT pg_advisory_unlock(hashtext($1))")
            .bind(&lock_key)
            .fetch_one(&mut *connection)
            .await;
    if let Err(error) = unlock_result {
        warn!(%error, %dataset_id, "failed to release dataset advisory lock");
    }
    result
}

async fn sync_dataset_locked(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
    schema_version: i32,
    batch_size: i64,
    event_page_bytes: i64,
    max_pages_per_cycle: u32,
) -> Result<()> {
    let high_water = check_continuity(source, destination, dataset_id).await?;
    sqlx::query("INSERT INTO ops.chain_cut VALUES($1,$2) ON CONFLICT DO NOTHING")
        .bind(dataset_id)
        .bind(json!(high_water))
        .execute(&mut *destination)
        .await?;
    repair_fact_hashes(source, destination, dataset_id, batch_size).await?;
    // After the repair: rows still waiting for a fact hash are not changes.
    audit_imported_content(source, destination, dataset_id).await?;
    let mut catching_up = false;
    for page in 0..max_pages_per_cycle {
        let full = sync_event_page(
            source,
            destination,
            dataset_id,
            batch_size,
            event_page_bytes,
        )
        .await?;
        if !full {
            break;
        }
        catching_up = page + 1 == max_pages_per_cycle;
    }
    for page in 0..max_pages_per_cycle {
        let count =
            sync_event_observation_page(source, destination, dataset_id, batch_size).await?;
        if count < batch_size {
            break;
        }
        catching_up |= page + 1 == max_pages_per_cycle;
    }
    for page in 0..max_pages_per_cycle {
        let count = sync_tip_page(source, destination, dataset_id, batch_size).await?;
        if count < batch_size {
            break;
        }
        catching_up |= page + 1 == max_pages_per_cycle;
    }
    for page in 0..max_pages_per_cycle {
        let count = sync_coverage_page(source, destination, dataset_id, batch_size).await?;
        if count < batch_size {
            break;
        }
        catching_up |= page + 1 == max_pages_per_cycle;
    }
    for page in 0..max_pages_per_cycle {
        let count = projector::project_page(destination, dataset_id, batch_size).await?;
        if count < batch_size {
            break;
        }
        catching_up |= page + 1 == max_pages_per_cycle;
    }
    sync_sidechain_instances(source, destination, dataset_id).await?;
    sync_extractor_status(source, destination, dataset_id).await?;
    for (stream, maximum) in [
        ("source_events", high_water.events),
        ("event_observations", high_water.observations),
        ("tip_observations", high_water.tips),
        ("coverage_revisions", high_water.coverage),
    ] {
        catching_up |= cursor(destination, dataset_id, stream).await? < maximum;
    }
    let pending: Value = sqlx::query_scalar("SELECT cut FROM ops.chain_cut WHERE dataset_id=$1")
        .bind(dataset_id)
        .fetch_one(&mut *destination)
        .await?;
    let pending: chain::Cut = serde_json::from_value(pending)?;
    let (generation, version): (i64,i32) = sqlx::query_as("SELECT projection_generation,projection_version FROM ops.active_dataset WHERE dataset_id=$1")
        .bind(dataset_id).fetch_one(&mut *destination).await?;
    anyhow::ensure!(
        version == PROJECTION_VERSION,
        "projection version {version} requires a local rebuild before sync can continue"
    );
    if version >= 3 && chain::ready(destination, dataset_id, &pending).await? {
        if chain::advance(
            destination,
            dataset_id,
            generation,
            &pending,
            batch_size,
            max_pages_per_cycle,
            true,
        )
        .await?
            && protocol::advance(
                destination,
                dataset_id,
                generation,
                &pending,
                batch_size,
                max_pages_per_cycle,
                true,
            )
            .await?
        {
            sqlx::query("DELETE FROM ops.chain_cut WHERE dataset_id=$1")
                .bind(dataset_id)
                .execute(&mut *destination)
                .await?;
        } else {
            catching_up = true;
        }
    }
    let sync_mode = if catching_up {
        "catching_up"
    } else {
        "following"
    };
    // Pages read past the cycle's starting high water; the cursors are a lower
    // bound of the source maximum too, so report whichever is larger.
    let mut transaction = destination.begin().await?;
    let changed: bool = sqlx::query_scalar("SELECT sync_mode IS DISTINCT FROM $2 OR NOT source_reachable FROM ops.source_status WHERE dataset_id=$1")
        .bind(dataset_id).bind(sync_mode).fetch_one(&mut *transaction).await?;
    sqlx::query("UPDATE ops.source_status SET source_reachable=true, sync_mode=$3,
        last_source_contact_at=now(), last_cycle_at=now(), last_error=NULL, source_schema_version=$2,
        source_event_high_water=GREATEST($4,(SELECT cursor_value FROM ops.sync_cursors WHERE dataset_id=$1 AND stream='source_events')),
        source_observation_high_water=GREATEST($5,(SELECT cursor_value FROM ops.sync_cursors WHERE dataset_id=$1 AND stream='event_observations')),
        source_tip_high_water=GREATEST($6,(SELECT cursor_value FROM ops.sync_cursors WHERE dataset_id=$1 AND stream='tip_observations')),
        source_coverage_high_water=GREATEST($7,(SELECT cursor_value FROM ops.sync_cursors WHERE dataset_id=$1 AND stream='coverage_revisions')),
        updated_at=now() WHERE dataset_id=$1")
        .bind(dataset_id).bind(schema_version).bind(sync_mode)
        .bind(high_water.events).bind(high_water.observations).bind(high_water.tips).bind(high_water.coverage)
        .execute(&mut *transaction).await?;
    if changed {
        append_update(
            &mut transaction,
            dataset_id,
            None,
            json!(["status", "coverage", "bmm"]),
        )
        .await?;
    }
    transaction.commit().await?;
    Ok(())
}

/// Node `mainchain_block` events carry the full raw block (megabytes), but the
/// Observatory only reads their header. The body is dropped at import; both
/// source hashes are kept verbatim and still cover the full block, so conflict
/// detection and the content audit are unchanged.
const RAW_BLOCK_EVENT: &str = "source = 'node' AND kind = 'mainchain_block'";
const RAW_BLOCK_PATH: &str = "{monitor_event,Node,event,MainchainBlock,raw_block}";

/// Imports the next contiguous page of source events and reports whether it was
/// full, i.e. limited by rows or bytes, so more may follow.
async fn sync_event_page(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
    batch_size: i64,
    page_bytes: i64,
) -> Result<bool> {
    let cursor = cursor(destination, dataset_id, "source_events").await?;
    // Sizes come from TOAST headers (no detoasting), so bounding the page is
    // cheap. The first row is always taken, however large, to keep progressing.
    // A node raw block is imported without its body, so it costs a header.
    let (upper, rows, bytes_limited): (Option<i64>, i64, bool) = sqlx::query_as(&format!(
        "WITH page AS ( \
             SELECT id, CASE WHEN {RAW_BLOCK_EVENT} THEN 1024 \
                        ELSE octet_length(envelope)::bigint + pg_column_size(payload)::bigint END AS size \
               FROM event WHERE dataset_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3), \
         running AS (SELECT id, size, sum(size) OVER (ORDER BY id) AS total FROM page) \
         SELECT max(id) FILTER (WHERE total <= $4 OR id = (SELECT min(id) FROM page)), \
                count(*) FILTER (WHERE total <= $4 OR id = (SELECT min(id) FROM page)), \
                coalesce(bool_or(total > $4), false) \
           FROM running"
    ))
    .bind(dataset_id)
    .bind(cursor)
    .bind(batch_size)
    .bind(page_bytes)
    .fetch_one(source)
    .await?;
    let Some(upper) = upper else {
        return Ok(false);
    };
    let events = sqlx::query_as::<_, SourceEvent>(&format!(
        "SELECT id, dataset_id, event_contract_version, observed_at, ingested_at, \
                source, kind, sidechain, sidechain_instance_id, block_hash, height, \
                CASE WHEN {RAW_BLOCK_EVENT} THEN '\\x'::bytea ELSE envelope END AS envelope, \
                envelope_sha256, fact_sha256, \
                CASE WHEN {RAW_BLOCK_EVENT} THEN payload #- '{RAW_BLOCK_PATH}' ELSE payload END AS payload \
           FROM event \
          WHERE dataset_id = $1 AND id > $2 AND id <= $3 \
          ORDER BY id ASC"
    ))
    .bind(dataset_id)
    .bind(cursor)
    .bind(upper)
    .fetch_all(source)
    .await?;
    if events.is_empty() {
        return Ok(false);
    }

    let full = rows == batch_size || bytes_limited;
    let next_cursor = events.last().map_or(cursor, |event| event.id);
    let mut transaction = destination.begin().await?;
    for event in &events {
        sqlx::query(
            "INSERT INTO ingest.source_events \
                (dataset_id, source_event_id, event_contract_version, observed_at, \
                 source_ingested_at, source, kind, sidechain, sidechain_instance_id, \
                 block_hash, height, envelope, envelope_sha256, payload, fact_sha256) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) \
             ON CONFLICT (dataset_id, source_event_id) DO NOTHING",
        )
        .bind(event.dataset_id)
        .bind(event.id)
        .bind(event.event_contract_version)
        .bind(event.observed_at)
        .bind(event.ingested_at)
        .bind(&event.source)
        .bind(&event.kind)
        .bind(event.sidechain)
        .bind(&event.sidechain_instance_id)
        .bind(&event.block_hash)
        .bind(event.height)
        .bind(&event.envelope)
        .bind(&event.envelope_sha256)
        .bind(&event.payload)
        .bind(&event.fact_sha256)
        .execute(&mut *transaction)
        .await?;
    }
    advance_cursor(&mut transaction, dataset_id, "source_events", next_cursor).await?;
    append_update(
        &mut transaction,
        dataset_id,
        Some(next_cursor),
        json!(["overview", "blocks", "events"]),
    )
    .await?;
    transaction.commit().await?;
    Ok(full)
}

async fn load_snapshot_groups(
    source: &PgPool,
    snapshot_group_ids: &[Uuid],
) -> Result<Vec<SourceSnapshotGroup>> {
    if snapshot_group_ids.is_empty() {
        return Ok(Vec::new());
    }
    sqlx::query_as::<_, SourceSnapshotGroup>(
        "SELECT snapshot_group_id, dataset_id, run_id, capture_method, started_at, \
                finished_at, tip_before_hash, tip_before_height, tip_after_hash, \
                tip_after_height, consistency, attempts, revision_before, revision_after \
           FROM snapshot_group \
          WHERE snapshot_group_id = ANY($1)",
    )
    .bind(snapshot_group_ids)
    .fetch_all(source)
    .await
    .map_err(Into::into)
}

async fn sync_event_observation_page(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
    batch_size: i64,
) -> Result<i64> {
    let observation_cursor = cursor(destination, dataset_id, "event_observations").await?;
    let observations = sqlx::query_as::<_, SourceEventObservation>(
        "SELECT observation_id, dataset_id, run_id, capture_seq, capture_method, \
                event_id, snapshot_group_id, observed_at, ingested_at \
           FROM event_observation \
          WHERE dataset_id = $1 AND observation_id > $2 \
          ORDER BY observation_id ASC \
          LIMIT $3",
    )
    .bind(dataset_id)
    .bind(observation_cursor)
    .bind(batch_size)
    .fetch_all(source)
    .await?;
    // An occurrence waits for its event. Never filter out a blocked earlier
    // occurrence and jump to a later one.
    let referenced = observations
        .iter()
        .map(|row| row.event_id)
        .collect::<Vec<_>>();
    let imported: std::collections::HashSet<i64> = sqlx::query_scalar(
        "SELECT source_event_id FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id=ANY($2)",
    )
    .bind(dataset_id)
    .bind(&referenced)
    .fetch_all(&mut *destination)
    .await?
    .into_iter()
    .collect();
    let known = known_runs(&mut *destination, observations.iter().map(|row| row.run_id)).await?;
    let observations = importable_prefix(observations, |row| {
        imported.contains(&row.event_id) && known.contains(&row.run_id)
    });
    if observations.is_empty() {
        return Ok(0);
    }
    let snapshot_group_ids = observations
        .iter()
        .filter_map(|observation| observation.snapshot_group_id)
        .collect::<Vec<_>>();
    let snapshot_groups = load_snapshot_groups(source, &snapshot_group_ids).await?;
    let count = i64::try_from(observations.len()).context("observation page length overflow")?;
    let next_cursor = observations
        .last()
        .map_or(observation_cursor, |observation| observation.observation_id);
    let mut transaction = destination.begin().await?;
    for group in snapshot_groups {
        sqlx::query(
            "INSERT INTO ingest.snapshot_groups \
                (snapshot_group_id, dataset_id, run_id, capture_method, started_at, \
                 finished_at, tip_before_hash, tip_before_height, tip_after_hash, \
                 tip_after_height, consistency, attempts, revision_before, revision_after) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) \
             ON CONFLICT (snapshot_group_id) DO NOTHING",
        )
        .bind(group.snapshot_group_id)
        .bind(group.dataset_id)
        .bind(group.run_id)
        .bind(&group.capture_method)
        .bind(group.started_at)
        .bind(group.finished_at)
        .bind(&group.tip_before_hash)
        .bind(group.tip_before_height)
        .bind(&group.tip_after_hash)
        .bind(group.tip_after_height)
        .bind(&group.consistency)
        .bind(group.attempts)
        .bind(group.revision_before)
        .bind(group.revision_after)
        .execute(&mut *transaction)
        .await?;
    }
    for observation in observations {
        sqlx::query(
            "INSERT INTO ingest.event_observations \
                (dataset_id, observation_id, run_id, capture_seq, capture_method, \
                 source_event_id, snapshot_group_id, observed_at, source_ingested_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) \
             ON CONFLICT (dataset_id, observation_id) DO NOTHING",
        )
        .bind(observation.dataset_id)
        .bind(observation.observation_id)
        .bind(observation.run_id)
        .bind(observation.capture_seq)
        .bind(&observation.capture_method)
        .bind(observation.event_id)
        .bind(observation.snapshot_group_id)
        .bind(observation.observed_at)
        .bind(observation.ingested_at)
        .execute(&mut *transaction)
        .await?;
    }
    advance_cursor(
        &mut transaction,
        dataset_id,
        "event_observations",
        next_cursor,
    )
    .await?;
    append_update(
        &mut transaction,
        dataset_id,
        None,
        json!(["overview", "bmm", "events"]),
    )
    .await?;
    transaction.commit().await?;
    Ok(count)
}

async fn sync_tip_page(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
    batch_size: i64,
) -> Result<i64> {
    let cursor = cursor(destination, dataset_id, "tip_observations").await?;
    let observations = sqlx::query_as::<_, SourceTipObservation>(
        "SELECT tip_observation_id, dataset_id, run_id, capture_seq, capture_method, \
                tip_hash, tip_height, previous_observed_hash, previous_observed_height, \
                observed_at, ingested_at \
           FROM tip_observation \
          WHERE dataset_id = $1 AND tip_observation_id > $2 \
          ORDER BY tip_observation_id ASC \
          LIMIT $3",
    )
    .bind(dataset_id)
    .bind(cursor)
    .bind(batch_size)
    .fetch_all(source)
    .await?;
    let known = known_runs(&mut *destination, observations.iter().map(|row| row.run_id)).await?;
    let observations = importable_prefix(observations, |row| known.contains(&row.run_id));
    if observations.is_empty() {
        return Ok(0);
    }
    let count = i64::try_from(observations.len()).context("tip page length overflow")?;
    let next_cursor = observations
        .last()
        .map_or(cursor, |observation| observation.tip_observation_id);
    let mut transaction = destination.begin().await?;
    for observation in &observations {
        sqlx::query(
            "INSERT INTO ingest.tip_observations \
                (dataset_id, tip_observation_id, run_id, capture_seq, capture_method, \
                 tip_hash, tip_height, previous_observed_hash, previous_observed_height, \
                 observed_at, source_ingested_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) \
             ON CONFLICT (dataset_id, tip_observation_id) DO NOTHING",
        )
        .bind(observation.dataset_id)
        .bind(observation.tip_observation_id)
        .bind(observation.run_id)
        .bind(observation.capture_seq)
        .bind(&observation.capture_method)
        .bind(&observation.tip_hash)
        .bind(observation.tip_height)
        .bind(&observation.previous_observed_hash)
        .bind(observation.previous_observed_height)
        .bind(observation.observed_at)
        .bind(observation.ingested_at)
        .execute(&mut *transaction)
        .await?;
    }
    advance_cursor(
        &mut transaction,
        dataset_id,
        "tip_observations",
        next_cursor,
    )
    .await?;
    append_update(
        &mut transaction,
        dataset_id,
        None,
        json!(["overview", "status", "blocks"]),
    )
    .await?;
    transaction.commit().await?;
    Ok(count)
}

async fn sync_coverage_page(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
    batch_size: i64,
) -> Result<i64> {
    let cursor = cursor(destination, dataset_id, "coverage_revisions").await?;
    let revisions = sqlx::query_as::<_, SourceCoverageRevision>(
        "SELECT revision_id, dataset_id, event_contract_version, source, stream, \
                sidechain, sidechain_instance_id, operation, row_data, changed_at \
           FROM history_coverage_revision \
          WHERE dataset_id = $1 AND revision_id > $2 \
          ORDER BY revision_id ASC \
          LIMIT $3",
    )
    .bind(dataset_id)
    .bind(cursor)
    .bind(batch_size)
    .fetch_all(source)
    .await?;
    if revisions.is_empty() {
        return Ok(0);
    }
    let count = i64::try_from(revisions.len()).context("coverage page length overflow")?;
    let next_cursor = revisions
        .last()
        .map_or(cursor, |revision| revision.revision_id);
    let mut transaction = destination.begin().await?;
    for revision in revisions {
        sqlx::query(
            "INSERT INTO ingest.coverage_revisions \
                (revision_id, dataset_id, event_contract_version, source, stream, \
                 sidechain, sidechain_instance_id, operation, row_data, changed_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) \
             ON CONFLICT (dataset_id, revision_id) DO NOTHING",
        )
        .bind(revision.revision_id)
        .bind(revision.dataset_id)
        .bind(revision.event_contract_version)
        .bind(&revision.source)
        .bind(&revision.stream)
        .bind(revision.sidechain)
        .bind(&revision.sidechain_instance_id)
        .bind(&revision.operation)
        .bind(&revision.row_data)
        .bind(revision.changed_at)
        .execute(&mut *transaction)
        .await?;
    }
    advance_cursor(
        &mut transaction,
        dataset_id,
        "coverage_revisions",
        next_cursor,
    )
    .await?;
    append_update(
        &mut transaction,
        dataset_id,
        None,
        json!(["coverage", "status"]),
    )
    .await?;
    transaction.commit().await?;
    Ok(count)
}

async fn sync_sidechain_instances(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
) -> Result<()> {
    let instances = sqlx::query_as::<_, SourceInstance>(
        "SELECT i.dataset_id, i.sidechain_instance_id, i.sidechain, \
                i.raw_description, i.description_sha256d, i.proposal_height, \
                i.activation_height, i.first_seen_at, i.last_seen_at, \
                (c.sidechain_instance_id IS NOT NULL) AS is_current \
           FROM sidechain_instance i \
           LEFT JOIN current_sidechain_instance c \
             ON c.dataset_id = i.dataset_id \
            AND c.sidechain_instance_id = i.sidechain_instance_id \
          WHERE i.dataset_id = $1",
    )
    .bind(dataset_id)
    .fetch_all(source)
    .await?;
    let current_instance_ids = instances
        .iter()
        .filter(|instance| instance.is_current)
        .map(|instance| instance.sidechain_instance_id.clone())
        .collect::<Vec<_>>();
    let mut transaction = destination.begin().await?;
    let deactivated = sqlx::query(
        "UPDATE projection.sidechain_instances \
            SET is_current = false \
          WHERE dataset_id = $1 \
            AND is_current \
            AND NOT (instance_id = ANY($2))",
    )
    .bind(dataset_id)
    .bind(&current_instance_ids)
    .execute(&mut *transaction)
    .await?
    .rows_affected();
    let mut changed = deactivated > 0;
    for instance in instances {
        let rows_affected = sqlx::query(
            "INSERT INTO projection.sidechain_instances \
                (dataset_id, instance_id, slot, raw_description, description_sha256d, \
                 proposal_height, activation_height, is_current, first_seen_at, \
                 last_seen_at, projection_version) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) \
             ON CONFLICT (dataset_id, instance_id) DO UPDATE SET \
                 slot = EXCLUDED.slot, \
                 raw_description = EXCLUDED.raw_description, \
                 description_sha256d = EXCLUDED.description_sha256d, \
                 proposal_height = EXCLUDED.proposal_height, \
                 activation_height = EXCLUDED.activation_height, \
                 is_current = EXCLUDED.is_current, \
                 last_seen_at = EXCLUDED.last_seen_at, \
                 projection_version = EXCLUDED.projection_version \
             WHERE (projection.sidechain_instances.slot, \
                    projection.sidechain_instances.raw_description, \
                    projection.sidechain_instances.description_sha256d, \
                    projection.sidechain_instances.proposal_height, \
                    projection.sidechain_instances.activation_height, \
                    projection.sidechain_instances.is_current, \
                    projection.sidechain_instances.last_seen_at, \
                    projection.sidechain_instances.projection_version) \
                   IS DISTINCT FROM \
                   (EXCLUDED.slot, EXCLUDED.raw_description, \
                    EXCLUDED.description_sha256d, EXCLUDED.proposal_height, \
                    EXCLUDED.activation_height, EXCLUDED.is_current, \
                    EXCLUDED.last_seen_at, EXCLUDED.projection_version)",
        )
        .bind(instance.dataset_id)
        .bind(&instance.sidechain_instance_id)
        .bind(instance.sidechain)
        .bind(&instance.raw_description)
        .bind(&instance.description_sha256d)
        .bind(instance.proposal_height)
        .bind(instance.activation_height)
        .bind(instance.is_current)
        .bind(instance.first_seen_at)
        .bind(instance.last_seen_at)
        .bind(PROJECTION_VERSION)
        .execute(&mut *transaction)
        .await?
        .rows_affected();
        changed |= rows_affected > 0;
    }
    if changed {
        append_update(
            &mut transaction,
            dataset_id,
            None,
            json!(["overview", "sidechains"]),
        )
        .await?;
    }
    transaction.commit().await?;
    Ok(())
}

#[derive(Debug, FromRow)]
struct SourceWorker {
    run_id: Uuid,
    worker: String,
    consecutive_failures: i32,
    last_error: Option<String>,
    last_success_at: Option<DateTime<Utc>>,
    last_failure_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
}

async fn sync_extractor_status(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset_id: Uuid,
) -> Result<()> {
    let statuses = sqlx::query_as::<_, SourceExtractorStatus>(
        "SELECT dataset_id, source, run_id, last_tip_hash, last_tip_height, last_error, updated_at
         FROM extractor_status WHERE dataset_id=$1",
    )
    .bind(dataset_id)
    .fetch_all(source)
    .await?;
    let workers = sqlx::query_as::<_, SourceWorker>(
        "SELECT w.* FROM extractor_worker_status w JOIN extractor_run r USING(run_id) WHERE r.dataset_id=$1")
        .bind(dataset_id).fetch_all(source).await?;
    let mut tx = destination.begin().await?;
    // Rows of a run started after this cycle's run import are retried next cycle.
    let known = known_runs(
        &mut tx,
        statuses
            .iter()
            .map(|status| status.run_id)
            .chain(workers.iter().map(|worker| worker.run_id)),
    )
    .await?;
    let mut changed = false;
    for status in statuses
        .into_iter()
        .filter(|status| known.contains(&status.run_id))
    {
        let old: Option<(Uuid, Option<String>)> = sqlx::query_as(
            "SELECT run_id, last_error FROM ingest.extractor_status WHERE dataset_id=$1 AND source=$2")
            .bind(dataset_id).bind(&status.source).fetch_optional(&mut *tx).await?;
        changed |= old != Some((status.run_id, status.last_error.clone()));
        sqlx::query("INSERT INTO ingest.extractor_status
            (dataset_id,source,run_id,last_tip_hash,last_tip_height,last_error,source_updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (dataset_id,source) DO UPDATE SET
            run_id=EXCLUDED.run_id,last_tip_hash=EXCLUDED.last_tip_hash,last_tip_height=EXCLUDED.last_tip_height,
            last_error=EXCLUDED.last_error,source_updated_at=EXCLUDED.source_updated_at,imported_at=now()")
            .bind(status.dataset_id).bind(&status.source).bind(status.run_id).bind(status.last_tip_hash)
            .bind(status.last_tip_height).bind(status.last_error).bind(status.updated_at).execute(&mut *tx).await?;
    }
    for worker in workers
        .into_iter()
        .filter(|worker| known.contains(&worker.run_id))
    {
        let old: Option<(i32, Option<String>, bool)> = sqlx::query_as(
            "SELECT consecutive_failures,last_error,last_success_at IS NOT NULL FROM ingest.worker_status WHERE run_id=$1 AND worker=$2")
            .bind(worker.run_id).bind(&worker.worker).fetch_optional(&mut *tx).await?;
        changed |= old
            != Some((
                worker.consecutive_failures,
                worker.last_error.clone(),
                worker.last_success_at.is_some(),
            ));
        sqlx::query("INSERT INTO ingest.worker_status
            (run_id,worker,consecutive_failures,last_error,last_success_at,last_failure_at,source_updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (run_id,worker) DO UPDATE SET
            consecutive_failures=EXCLUDED.consecutive_failures,last_error=EXCLUDED.last_error,
            last_success_at=EXCLUDED.last_success_at,last_failure_at=EXCLUDED.last_failure_at,source_updated_at=EXCLUDED.source_updated_at")
            .bind(worker.run_id).bind(worker.worker).bind(worker.consecutive_failures).bind(worker.last_error)
            .bind(worker.last_success_at).bind(worker.last_failure_at).bind(worker.updated_at).execute(&mut *tx).await?;
    }
    if changed {
        append_update(&mut tx, dataset_id, None, json!(["status", "bmm", "meta"])).await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn check_continuity(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset: Uuid,
) -> Result<chain::Cut> {
    let high = sqlx::query_as::<_, chain::Cut>(
        "SELECT
        (SELECT COALESCE(max(id),0) FROM event WHERE dataset_id=$1) AS events,
        (SELECT COALESCE(max(observation_id),0) FROM event_observation WHERE dataset_id=$1) AS observations,
        (SELECT COALESCE(max(tip_observation_id),0) FROM tip_observation WHERE dataset_id=$1) AS tips,
        (SELECT COALESCE(max(revision_id),0) FROM history_coverage_revision WHERE dataset_id=$1) AS coverage,
        (SELECT run_id FROM extractor_status WHERE dataset_id=$1 AND source='enforcer') AS run",
    )
    .bind(dataset)
    .fetch_one(source)
    .await?;
    for (stream, maximum) in [
        ("source_events", high.events),
        ("event_observations", high.observations),
        ("tip_observations", high.tips),
        ("coverage_revisions", high.coverage),
    ] {
        if cursor(destination, dataset, stream).await? > maximum {
            return Err(incompatible(format!(
                "source continuity lost for {stream}; reconcile dataset"
            )));
        }
    }
    check_import_order(source, destination, dataset).await?;
    // Hashes, not bytes: imported raw blocks have no body, and the source
    // hashes still identify the exact source row.
    type Witness = (Option<Vec<u8>>, Option<Vec<u8>>);
    type WitnessRow = (i64, Option<Vec<u8>>, Option<Vec<u8>>);
    let witness: Option<WitnessRow> = sqlx::query_as("SELECT source_event_id,envelope_sha256,fact_sha256 FROM ingest.source_events WHERE dataset_id=$1 ORDER BY source_event_id DESC LIMIT 1")
        .bind(dataset).fetch_optional(&mut *destination).await?;
    if let Some((id, envelope_sha256, fact_sha256)) = witness {
        let actual: Option<Witness> = sqlx::query_as(
            "SELECT envelope_sha256,fact_sha256 FROM event WHERE dataset_id=$1 AND id=$2",
        )
        .bind(dataset)
        .bind(id)
        .fetch_optional(source)
        .await?;
        if actual != Some((envelope_sha256, fact_sha256)) {
            return Err(incompatible(
                "source event witness changed; reconcile dataset",
            ));
        }
    }
    Ok(high)
}

/// Import streams paged by `id > cursor`: cursor name, source table and id,
/// destination table and id.
const IMPORT_STREAMS: &[(&str, &str, &str, &str, &str)] = &[
    (
        "source_events",
        "event",
        "id",
        "ingest.source_events",
        "source_event_id",
    ),
    (
        "event_observations",
        "event_observation",
        "observation_id",
        "ingest.event_observations",
        "observation_id",
    ),
    (
        "tip_observations",
        "tip_observation",
        "tip_observation_id",
        "ingest.tip_observations",
        "tip_observation_id",
    ),
    (
        "coverage_revisions",
        "history_coverage_revision",
        "revision_id",
        "ingest.coverage_revisions",
        "revision_id",
    ),
    (
        "observation_failures",
        "observation_failure",
        "failure_id",
        "ingest.observation_failures",
        "failure_id",
    ),
];

/// How far below each cursor the importer looks for rows it never saw.
const IMPORT_ORDER_WINDOW: i64 = 5_000;

/// Paging by `id > cursor` is complete only if the monitor commits rows in id
/// order, which schema 10 guarantees. A row that appears behind a cursor
/// anyway was skipped, and every projection paging the imported ids would
/// skip it too: stop loudly instead of importing an incomplete history.
async fn check_import_order(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset: Uuid,
) -> Result<()> {
    for (stream, table, id, imported, imported_id) in IMPORT_STREAMS {
        let cursor = cursor(destination, dataset, stream).await?;
        let low = (cursor - IMPORT_ORDER_WINDOW).max(0);
        // Counts first; ids are transferred only when the window differs.
        let expected: i64 = sqlx::query_scalar(&format!(
            "SELECT count(*) FROM {table} WHERE dataset_id=$1 AND {id}>$2 AND {id}<=$3"
        ))
        .bind(dataset)
        .bind(low)
        .bind(cursor)
        .fetch_one(source)
        .await?;
        let imported_count: i64 = sqlx::query_scalar(&format!(
            "SELECT count(*) FROM {imported} WHERE dataset_id=$1 AND {imported_id}>$2 AND {imported_id}<=$3"
        ))
        .bind(dataset)
        .bind(low)
        .bind(cursor)
        .fetch_one(&mut *destination)
        .await?;
        if expected == imported_count {
            continue;
        }
        let present: Vec<i64> = sqlx::query_scalar(&format!(
            "SELECT {id} FROM {table} WHERE dataset_id=$1 AND {id}>$2 AND {id}<=$3 ORDER BY {id}"
        ))
        .bind(dataset)
        .bind(low)
        .bind(cursor)
        .fetch_all(source)
        .await?;
        let seen: std::collections::HashSet<i64> = sqlx::query_scalar(&format!(
            "SELECT {imported_id} FROM {imported} WHERE dataset_id=$1 AND {imported_id}>$2 AND {imported_id}<=$3"
        ))
        .bind(dataset)
        .bind(low)
        .bind(cursor)
        .fetch_all(&mut *destination)
        .await?
        .into_iter()
        .collect();
        if let Some(late) = present.iter().find(|row| !seen.contains(row)) {
            return Err(incompatible(format!(
                "{stream} row {late} was committed behind the import cursor {cursor}; \
                 the monitor must commit in id order (schema 10); rebuild this dataset"
            )));
        }
    }
    Ok(())
}

/// Ids compared per stream and cycle by the rotating content audit.
const AUDIT_WINDOW: i64 = 2_000;

/// One audited stream: the cursor it follows, and the same row text computed
/// from the monitor table and from its imported copy, keyed by id range.
struct Audit {
    stream: &'static str,
    source: &'static str,
    imported: &'static str,
}

const AUDITS: &[Audit] = &[
    Audit {
        stream: "source_events",
        source: "SELECT md5(string_agg(id::text||':'||encode(fact_sha256,'hex')||':'||coalesce(encode(envelope_sha256,'hex'),''),'|' ORDER BY id))
                   FROM event WHERE dataset_id=$1 AND id BETWEEN $2 AND $3",
        imported: "SELECT md5(string_agg(source_event_id::text||':'||encode(fact_sha256,'hex')||':'||coalesce(encode(envelope_sha256,'hex'),''),'|' ORDER BY source_event_id))
                   FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id BETWEEN $2 AND $3",
    },
    Audit {
        stream: "event_observations",
        source: "SELECT md5(string_agg(observation_id::text||':'||event_id||':'||run_id||':'||capture_seq||':'||capture_method||':'||coalesce(snapshot_group_id::text,''),'|' ORDER BY observation_id))
                   FROM event_observation WHERE dataset_id=$1 AND observation_id BETWEEN $2 AND $3",
        imported: "SELECT md5(string_agg(observation_id::text||':'||source_event_id||':'||run_id||':'||capture_seq||':'||capture_method||':'||coalesce(snapshot_group_id::text,''),'|' ORDER BY observation_id))
                   FROM ingest.event_observations WHERE dataset_id=$1 AND observation_id BETWEEN $2 AND $3",
    },
    Audit {
        // Groups are audited through the occurrences that reference them.
        stream: "event_observations",
        source: "SELECT md5(string_agg(g.snapshot_group_id||':'||g.consistency||':'||encode(g.tip_before_hash,'hex')||':'||g.tip_before_height||':'||encode(g.tip_after_hash,'hex')||':'||g.tip_after_height,'|' ORDER BY g.snapshot_group_id))
                   FROM snapshot_group g WHERE g.snapshot_group_id IN
                   (SELECT snapshot_group_id FROM event_observation WHERE dataset_id=$1 AND observation_id BETWEEN $2 AND $3)",
        imported: "SELECT md5(string_agg(g.snapshot_group_id||':'||g.consistency||':'||encode(g.tip_before_hash,'hex')||':'||g.tip_before_height||':'||encode(g.tip_after_hash,'hex')||':'||g.tip_after_height,'|' ORDER BY g.snapshot_group_id))
                   FROM ingest.snapshot_groups g WHERE g.snapshot_group_id IN
                   (SELECT snapshot_group_id FROM ingest.event_observations WHERE dataset_id=$1 AND observation_id BETWEEN $2 AND $3)",
    },
    Audit {
        stream: "tip_observations",
        source: "SELECT md5(string_agg(tip_observation_id::text||':'||run_id||':'||capture_seq||':'||encode(tip_hash,'hex')||':'||tip_height,'|' ORDER BY tip_observation_id))
                   FROM tip_observation WHERE dataset_id=$1 AND tip_observation_id BETWEEN $2 AND $3",
        imported: "SELECT md5(string_agg(tip_observation_id::text||':'||run_id||':'||capture_seq||':'||encode(tip_hash,'hex')||':'||tip_height,'|' ORDER BY tip_observation_id))
                   FROM ingest.tip_observations WHERE dataset_id=$1 AND tip_observation_id BETWEEN $2 AND $3",
    },
    Audit {
        stream: "coverage_revisions",
        source: "SELECT md5(string_agg(revision_id::text||':'||operation||':'||md5(row_data::text),'|' ORDER BY revision_id))
                   FROM history_coverage_revision WHERE dataset_id=$1 AND revision_id BETWEEN $2 AND $3",
        imported: "SELECT md5(string_agg(revision_id::text||':'||operation||':'||md5(row_data::text),'|' ORDER BY revision_id))
                   FROM ingest.coverage_revisions WHERE dataset_id=$1 AND revision_id BETWEEN $2 AND $3",
    },
];

/// Imported rows are copies of immutable monitor rows. A monitor row rewritten
/// after import would otherwise keep serving its old value without notice.
/// Each cycle compares one id window per stream, rotating over the imported
/// range; a mismatch is recorded and stops the sync.
async fn audit_imported_content(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset: Uuid,
) -> Result<()> {
    for (index, audit) in AUDITS.iter().enumerate() {
        let key = format!("{}#{index}", audit.stream);
        let imported_through = cursor(destination, dataset, audit.stream).await?;
        if imported_through == 0 {
            continue;
        }
        let next: i64 = sqlx::query_scalar(
            "INSERT INTO ops.import_audit(dataset_id,stream) VALUES($1,$2)
             ON CONFLICT(dataset_id,stream) DO UPDATE SET next_id=ops.import_audit.next_id
             RETURNING next_id",
        )
        .bind(dataset)
        .bind(&key)
        .fetch_one(&mut *destination)
        .await?;
        let first = if next > imported_through { 1 } else { next };
        let last = (first + AUDIT_WINDOW - 1).min(imported_through);
        let expected: Option<String> = sqlx::query_scalar(audit.source)
            .bind(dataset)
            .bind(first)
            .bind(last)
            .fetch_one(source)
            .await?;
        let imported: Option<String> = sqlx::query_scalar(audit.imported)
            .bind(dataset)
            .bind(first)
            .bind(last)
            .fetch_one(&mut *destination)
            .await?;
        if expected != imported {
            let detail = format!("content differs from the imported copy (audit {index})");
            // Re-auditing the same window every cycle records it once.
            sqlx::query(
                "INSERT INTO ingest.import_conflicts(dataset_id,stream,first_source_id,last_source_id,detail)
                 SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM ingest.import_conflicts
                   WHERE dataset_id=$1 AND stream=$2 AND first_source_id=$3 AND last_source_id=$4 AND detail=$5)",
            )
            .bind(dataset)
            .bind(audit.stream)
            .bind(first.to_string())
            .bind(last.to_string())
            .bind(&detail)
            .execute(&mut *destination)
            .await?;
            return Err(incompatible(format!(
                "{} ids {first}..={last}: {detail}; reconcile the dataset",
                audit.stream
            )));
        }
        sqlx::query("UPDATE ops.import_audit SET next_id=$3 WHERE dataset_id=$1 AND stream=$2")
            .bind(dataset)
            .bind(&key)
            .bind(last + 1)
            .execute(&mut *destination)
            .await?;
    }
    Ok(())
}

async fn repair_fact_hashes(
    source: &PgPool,
    destination: &mut PgConnection,
    dataset: Uuid,
    limit: i64,
) -> Result<()> {
    // Envelope hashes, not bytes: an imported raw block has no body.
    let rows: Vec<(i64, Vec<u8>)> = sqlx::query_as("SELECT source_event_id,coalesce(envelope_sha256,sha256(envelope)) FROM ingest.source_events WHERE dataset_id=$1 AND fact_sha256 IS NULL ORDER BY source_event_id LIMIT $2")
        .bind(dataset).bind(limit).fetch_all(&mut *destination).await?;
    if rows.is_empty() {
        return Ok(());
    }
    let ids = rows.iter().map(|row| row.0).collect::<Vec<_>>();
    let facts: Vec<(i64, Vec<u8>, Vec<u8>)> = sqlx::query_as(
        "SELECT id,coalesce(envelope_sha256,sha256(envelope)),fact_sha256 FROM event WHERE dataset_id=$1 AND id=ANY($2)",
    )
    .bind(dataset)
    .bind(ids)
    .fetch_all(source)
    .await?;
    if facts.len() != rows.len() {
        return Err(incompatible(
            "source evidence is missing during metadata upgrade",
        ));
    }
    for (id, envelope, hash) in facts {
        if !rows.iter().any(|row| row.0 == id && row.1 == envelope) {
            return Err(incompatible(
                "source evidence changed during metadata upgrade",
            ));
        }
        sqlx::query("UPDATE ingest.source_events SET fact_sha256=$3 WHERE dataset_id=$1 AND source_event_id=$2")
            .bind(dataset).bind(id).bind(hash).execute(&mut *destination).await?;
    }
    Ok(())
}

async fn cursor(destination: &mut PgConnection, dataset_id: Uuid, stream: &str) -> Result<i64> {
    sqlx::query_scalar(
        "SELECT cursor_value \
           FROM ops.sync_cursors \
          WHERE dataset_id = $1 AND stream = $2",
    )
    .bind(dataset_id)
    .bind(stream)
    .fetch_optional(&mut *destination)
    .await
    .map(|value| value.unwrap_or(0))
    .map_err(Into::into)
}

async fn advance_cursor(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    dataset_id: Uuid,
    stream: &str,
    value: i64,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO ops.sync_cursors (dataset_id, stream, cursor_value) \
         VALUES ($1,$2,$3) \
         ON CONFLICT (dataset_id, stream) DO UPDATE SET \
             cursor_value = GREATEST(ops.sync_cursors.cursor_value, EXCLUDED.cursor_value), \
             updated_at = now()",
    )
    .bind(dataset_id)
    .bind(stream)
    .bind(value)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn append_update(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    dataset_id: Uuid,
    source_event_id: Option<i64>,
    changed: Value,
) -> Result<()> {
    let (generation,version):(i64,i32)=sqlx::query_as("SELECT projection_generation,projection_version FROM ops.active_dataset WHERE dataset_id=$1")
        .bind(dataset_id).fetch_one(&mut **transaction).await?;
    let watermark =
        pulse_storage::projection_watermark(transaction, dataset_id, generation, version).await?;
    let source_event_id = source_event_id
        .zip(watermark)
        .map(|(requested, complete)| requested.min(complete));
    sqlx::query(
        "INSERT INTO ops.pulse_updates \
            (dataset_id, projection_generation, source_event_id, changed) \
         SELECT $1, projection_generation, $2, $3 FROM ops.active_dataset WHERE dataset_id=$1",
    )
    .bind(dataset_id)
    .bind(source_event_id)
    .bind(changed)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "UPDATE ops.source_status \
            SET last_projection_update_at = now(), updated_at = now() \
          WHERE dataset_id = $1",
    )
    .bind(dataset_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn mark_interrupted(destination: &PgPool, dataset_id: Uuid, mode: &str) {
    let result: Result<()> = async {
        let mut tx = destination.begin().await?;
        let reachable = mode == "incompatible";
        let changed: bool = sqlx::query_scalar("SELECT source_reachable IS DISTINCT FROM $3 OR sync_mode IS DISTINCT FROM $2 FROM ops.source_status WHERE dataset_id=$1")
            .bind(dataset_id).bind(mode).bind(reachable).fetch_optional(&mut *tx).await?.unwrap_or(false);
        sqlx::query("UPDATE ops.source_status SET source_reachable=$3, sync_mode=$2,
            last_cycle_at=now(), last_error='synchronization failed; inspect sync logs', updated_at=now()
            WHERE dataset_id=$1")
            .bind(dataset_id).bind(mode).bind(reachable).execute(&mut *tx).await?;
        if changed { append_update(&mut tx, dataset_id, None, json!(["status", "bmm", "coverage"])).await?; }
        tx.commit().await?;
        Ok(())
    }.await;
    if let Err(error) = result {
        error!(%error, "failed to persist sync failure");
    }
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();
}

#[cfg(test)]
mod tests {
    use super::importable_prefix;

    #[test]
    fn a_blocked_row_holds_back_every_later_row() {
        // Rows of run 2 wait for it; the later run-1 row must not jump ahead.
        let page = vec![(1, 'a'), (1, 'b'), (2, 'c'), (1, 'd')];
        let known = [1];
        assert_eq!(
            importable_prefix(page, |row| known.contains(&row.0)),
            vec![(1, 'a'), (1, 'b')]
        );
    }

    #[test]
    fn a_fully_known_page_is_imported_whole() {
        let page = vec![1, 2, 3];
        assert_eq!(importable_prefix(page.clone(), |_| true), page);
        assert!(importable_prefix(page, |row| *row > 1).is_empty());
    }
}
