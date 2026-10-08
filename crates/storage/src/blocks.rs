use super::*;
use serde::{Deserialize, Serialize};
use utoipa::IntoParams;

#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct BlocksQuery {
    pub dataset: Option<Uuid>,
    /// selected (default) or all observations.
    pub scope: Option<String>,
    pub height: Option<i32>,
    pub slot: Option<i16>,
    /// Default 50, maximum 200.
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
struct PageCursor {
    dataset: Uuid,
    generation: i64,
    branch: Option<String>,
    scope: String,
    height: Option<i32>,
    slot: Option<i16>,
    after_height: i32,
    after_hash: String,
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
}

pub(super) async fn generation(
    tx: &mut Transaction<'_, Postgres>,
    d: Uuid,
) -> Result<(i64, i32), sqlx::Error> {
    sqlx::query_as("SELECT coalesce((SELECT projection_generation FROM ops.active_dataset WHERE dataset_id=$1),(SELECT max(generation) FROM ops.chain_jobs WHERE dataset_id=$1 AND promoted),2),coalesce((SELECT projection_version FROM ops.active_dataset WHERE dataset_id=$1),(SELECT implementation_version FROM ops.chain_jobs WHERE dataset_id=$1 AND promoted ORDER BY generation DESC LIMIT 1),3)")
        .bind(d).fetch_one(&mut **tx).await
}
pub(super) async fn branch(
    tx: &mut Transaction<'_, Postgres>,
    d: Uuid,
) -> Result<BranchState, StorageError> {
    let (g, _) = generation(tx, d).await?;
    let state: Option<Value> = sqlx::query_scalar(
        "SELECT state FROM projection.chain_state WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(d)
    .bind(g)
    .fetch_optional(&mut **tx)
    .await?;
    let mut state: BranchState = state
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| StorageError::InvalidProjection)?
        .unwrap_or_else(BranchState::awaiting);
    let current: Option<Uuid> = sqlx::query_scalar(
        "SELECT run_id FROM ingest.extractor_status WHERE dataset_id=$1 AND source='enforcer'",
    )
    .bind(d)
    .fetch_optional(&mut **tx)
    .await?;
    if current.is_some() && state.run_id != current {
        state.processing = true;
    }
    if state.processing && state.status != "ambiguous" {
        state.status = "provisional".into();
        state.basis = "awaiting_reconstruction".into();
    }
    Ok(state)
}
fn summary(r: sqlx::postgres::PgRow) -> Result<BlockSummary, sqlx::Error> {
    Ok(BlockSummary {
        hash: r.try_get("hash")?,
        parent_hash: r.try_get("parent")?,
        height: r.try_get("height")?,
        chain_work: r.try_get("work")?,
        block_work: r.try_get("per_block_work")?,
        block_time: r.try_get("block_time")?,
        first_observed_at: r.try_get("first_observed_at")?,
        last_observed_at: r.try_get("last_observed_at")?,
        membership: r.try_get("membership")?,
        conflicted: r.try_get("conflicted")?,
    })
}
pub async fn blocks(pool: &PgPool, q: BlocksQuery) -> Result<BlocksResponse, StorageError> {
    let scope = q.scope.as_deref().unwrap_or("selected");
    let limit = q.limit.unwrap_or(50);
    if !matches!(scope, "selected" | "all")
        || !(1..=200).contains(&limit)
        || q.height.is_some_and(|h| h < 0)
        || q.slot.is_some_and(|s| !(0..=255).contains(&s))
    {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, q.dataset).await?;
    let mut meta = response_meta(&mut tx, &data).await?;
    let branch = branch(&mut tx, data.dataset_id).await?;
    meta.data_as_of_event_id = branch
        .processed_events
        .parse::<i64>()
        .ok()
        .filter(|n| *n > 0);
    let cursor = if let Some(encoded) = q.cursor {
        if encoded.len() > 4096 {
            return Err(StorageError::InvalidQuery);
        }
        let raw = hex::decode(encoded).map_err(|_| StorageError::InvalidQuery)?;
        let c: PageCursor = serde_json::from_slice(&raw).map_err(|_| StorageError::InvalidQuery)?;
        if !valid_hash(&c.after_hash) || c.after_height < 0 {
            return Err(StorageError::InvalidQuery);
        }
        if c.dataset != data.dataset_id
            || c.generation != meta.projection_generation
            || c.scope != scope
            || c.height != q.height
            || c.slot != q.slot
            || (scope == "selected" && c.branch.as_ref() != Some(&branch.revision))
        {
            return Err(StorageError::StaleCursor);
        }
        Some(c)
    } else {
        None
    };
    // Materialize the bounded page BEFORE decorating it. This remains bounded
    // even when PostgreSQL switches a prepared statement to a generic plan.
    let selected = scope == "selected";
    let alias = if selected { "m" } else { "h" };
    let mut query = sqlx::QueryBuilder::new(if selected {
        "WITH page AS MATERIALIZED (SELECT m.hash,m.height FROM projection.chain_members m WHERE m.dataset_id="
    } else {
        "WITH page AS MATERIALIZED (SELECT h.* FROM projection.chain_headers h WHERE h.dataset_id="
    });
    query
        .push_bind(data.dataset_id)
        .push(format!(" AND {alias}.generation="))
        .push_bind(meta.projection_generation);
    if let Some(height) = q.height {
        query
            .push(format!(" AND {alias}.height="))
            .push_bind(height);
    }
    if let Some(slot) = q.slot {
        query.push(format!(" AND EXISTS(SELECT 1 FROM projection.chain_facts f WHERE (f.dataset_id,f.generation,f.hash)=({alias}.dataset_id,{alias}.generation,{alias}.hash) AND f.slot=")).push_bind(slot).push(")");
    }
    if let Some(c) = cursor {
        if selected {
            query.push(" AND m.height<").push_bind(c.after_height);
        } else {
            query
                .push(" AND (h.height,h.hash)<(")
                .push_bind(c.after_height)
                .push(",")
                .push_bind(c.after_hash)
                .push(")");
        }
    }
    query
        .push(if selected {
            " ORDER BY m.height DESC LIMIT "
        } else {
            " ORDER BY h.height DESC,h.hash DESC LIMIT "
        })
        .push_bind(i64::from(limit) + 1);
    if selected {
        query.push(") SELECT h.*,h.chain_work::text AS work,h.block_work::text AS per_block_work,'selected'::text AS membership FROM page p JOIN LATERAL(SELECT * FROM projection.chain_headers h WHERE h.dataset_id=")
            .push_bind(data.dataset_id).push(" AND h.generation=").push_bind(meta.projection_generation).push(" AND h.hash=p.hash LIMIT 1) h ON true ORDER BY p.height DESC");
    } else {
        query.push(") SELECT h.*,h.chain_work::text AS work,h.block_work::text AS per_block_work,CASE WHEN m.selected THEN 'selected' WHEN ").push_bind(branch.tip_hash.is_some())
            .push(" THEN 'alternative' ELSE 'unknown' END AS membership FROM page h LEFT JOIN LATERAL(SELECT true AS selected FROM projection.chain_members m WHERE (m.dataset_id,m.generation,m.hash)=(h.dataset_id,h.generation,h.hash) LIMIT 1) m ON true ORDER BY h.height DESC,h.hash DESC");
    }
    let mut blocks = query
        .build()
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(summary)
        .collect::<Result<Vec<_>, _>>()?;
    let more = blocks.len() > limit as usize;
    blocks.truncate(limit as usize);
    let next_cursor = if more {
        let last = blocks.last().ok_or(StorageError::InvalidProjection)?;
        Some(hex::encode(
            serde_json::to_vec(&PageCursor {
                dataset: data.dataset_id,
                generation: meta.projection_generation,
                branch: if scope == "selected" {
                    Some(branch.revision.clone())
                } else {
                    None
                },
                scope: scope.into(),
                height: q.height,
                slot: q.slot,
                after_height: last.height,
                after_hash: last.hash.clone(),
            })
            .map_err(|_| StorageError::InvalidProjection)?,
        ))
    } else {
        None
    };
    tx.commit().await?;
    Ok(BlocksResponse {
        meta,
        branch,
        blocks,
        next_cursor,
    })
}
pub async fn block(
    pool: &PgPool,
    d: Option<Uuid>,
    hash: &str,
) -> Result<BlockResponse, StorageError> {
    if !valid_hash(hash) {
        return Err(StorageError::InvalidQuery);
    }
    let hash = hash.to_lowercase();
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, d).await?;
    let mut meta = response_meta(&mut tx, &data).await?;
    let branch = branch(&mut tx, data.dataset_id).await?;
    meta.data_as_of_event_id = branch
        .processed_events
        .parse::<i64>()
        .ok()
        .filter(|n| *n > 0);
    let row=sqlx::query("SELECT h.*,h.chain_work::text AS work,h.block_work::text AS per_block_work,CASE WHEN m.hash IS NOT NULL THEN 'selected' WHEN $4 THEN 'alternative' ELSE 'unknown' END AS membership FROM projection.chain_headers h LEFT JOIN projection.chain_members m ON (m.dataset_id,m.generation,m.hash)=(h.dataset_id,h.generation,h.hash) WHERE h.dataset_id=$1 AND h.generation=$2 AND h.hash=$3")
        .bind(data.dataset_id).bind(meta.projection_generation).bind(&hash).bind(branch.tip_hash.is_some()).fetch_optional(&mut *tx).await?.ok_or(StorageError::NotFound)?;
    let block = summary(row)?;
    let mut facts=sqlx::query("SELECT f.*,e.observed_at,e.source_ingested_at FROM projection.chain_facts f JOIN ingest.source_events e ON (e.dataset_id,e.source_event_id)=(f.dataset_id,f.event_id) WHERE f.dataset_id=$1 AND f.generation=$2 AND f.hash=$3 ORDER BY f.event_id DESC LIMIT 201")
        .bind(data.dataset_id).bind(meta.projection_generation).bind(&hash).fetch_all(&mut *tx).await?.into_iter().map(|r|Ok(BlockFact{event_id:r.try_get::<i64,_>("event_id")?.to_string(),kind:r.try_get("kind")?,slot:r.try_get("slot")?,instance_id:r.try_get("instance_id")?,contract:r.try_get("contract")?,observed_at:r.try_get("observed_at")?,ingested_at:r.try_get("source_ingested_at")?,interpretation_error:r.try_get("error")?})).collect::<Result<Vec<_>,sqlx::Error>>()?;
    let mut observations=sqlx::query("SELECT o.*,f.kind,f.slot FROM projection.chain_facts f JOIN ingest.event_observations o ON (o.dataset_id,o.source_event_id)=(f.dataset_id,f.event_id) WHERE f.dataset_id=$1 AND f.generation=$2 AND f.hash=$3 ORDER BY o.observation_id DESC LIMIT 201")
        .bind(data.dataset_id).bind(meta.projection_generation).bind(&hash).fetch_all(&mut *tx).await?.into_iter().map(|r|Ok(BlockObservation{observation_id:r.try_get::<i64,_>("observation_id")?.to_string(),event_id:r.try_get::<i64,_>("source_event_id")?.to_string(),kind:r.try_get("kind")?,slot:r.try_get("slot")?,run_id:r.try_get("run_id")?,capture_seq:r.try_get::<i64,_>("capture_seq")?.to_string(),capture_method:r.try_get("capture_method")?,observed_at:r.try_get("observed_at")?})).collect::<Result<Vec<_>,sqlx::Error>>()?;
    let facts_truncated = facts.len() > 200;
    facts.truncate(200);
    let observations_truncated = observations.len() > 200;
    observations.truncate(200);
    tx.commit().await?;
    Ok(BlockResponse {
        meta,
        branch,
        block,
        facts,
        observations,
        facts_truncated,
        observations_truncated,
    })
}
