use super::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::IntoParams;

#[derive(Debug, Default, Clone, Serialize, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct ProtocolQuery {
    pub dataset: Option<Uuid>,
    pub scope: Option<String>,
    pub slot: Option<i16>,
    pub kind: Option<String>,
    pub hash: Option<String>,
    pub key: Option<String>,
    /// Exact instance identity recorded when capturing an observation.
    pub instance_id: Option<String>,
    pub from_height: Option<i32>,
    pub to_height: Option<i32>,
    pub from_time: Option<DateTime<Utc>>,
    pub to_time: Option<DateTime<Utc>>,
    /// observation (history default), block (facts default), or ingestion.
    pub time_basis: Option<String>,
    pub q: Option<String>,
    /// History order: `observed` (latest occurrence first) or `block` (block
    /// height first; unanchored state uses the tip of its first read). Deposits
    /// default to `block`, other histories to `observed`.
    pub order: Option<String>,
    /// History only: omit a reading whose content equals the previous reading
    /// of the same entity, such as a re-read after a monitor restart.
    pub changes: Option<bool>,
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}
#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct BmmQuery {
    pub dataset: Option<Uuid>,
    pub window_blocks: Option<u32>,
    pub slot: Option<i16>,
    pub start_slot: Option<i16>,
}
#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct SummaryQuery {
    pub dataset: Option<Uuid>,
    /// Length of the period in hours, 1 to 168. Default 24.
    pub hours: Option<u32>,
}
#[derive(Serialize, Deserialize)]
struct Cursor {
    dataset: Uuid,
    generation: i64,
    branch: String,
    build: Option<String>,
    filters: Value,
    after: Vec<String>,
}
pub(super) async fn context(
    tx: &mut Transaction<'_, Postgres>,
    d: &Dataset,
) -> Result<ProtocolContext, StorageError> {
    context_at(tx, d, None).await
}
/// The context of the published head, or of an earlier build of the same
/// generation that a cursor pinned. Builds are never deleted and projection
/// rows are versioned by build, so a pinned reader keeps its old results.
async fn context_at(
    tx: &mut Transaction<'_, Postgres>,
    d: &Dataset,
    pinned: Option<i64>,
) -> Result<ProtocolContext, StorageError> {
    let mut meta = response_meta(tx, d).await?;
    let branch = blocks::branch(tx, d.dataset_id).await?;
    let head = match pinned {
        None => sqlx::query("SELECT b.* FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) WHERE h.dataset_id=$1 AND h.generation=$2").bind(d.dataset_id).bind(meta.projection_generation).fetch_optional(&mut **tx).await?,
        Some(build) => Some(sqlx::query("SELECT b.* FROM ops.protocol_builds b WHERE b.dataset_id=$1 AND b.generation=$2 AND b.build_id=$3 AND b.build_id<=(SELECT h.build_id FROM projection.protocol_head h WHERE h.dataset_id=$1 AND h.generation=$2)").bind(d.dataset_id).bind(meta.projection_generation).bind(build).fetch_optional(&mut **tx).await?.ok_or(StorageError::StaleCursor)?),
    };
    let mut state = "awaiting_data".to_owned();
    let mut build_id = None;
    let mut anchor_hash = None;
    let mut anchor_height = None;
    let mut semantics_supported = false;
    let mut semantics_issue = None;
    let mut through = 0;
    if let Some(r) = head {
        let s: Value = r.try_get("state")?;
        let cut: Value = r.try_get("cut")?;
        through = cut["events"].as_i64().unwrap_or(0);
        build_id = Some(r.try_get::<i64, _>("build_id")?.to_string());
        anchor_hash = s["hash"].as_str().map(str::to_owned);
        anchor_height = s["height"].as_i64().and_then(|v| v.try_into().ok());
        semantics_supported = s["semantics_supported"].as_bool().unwrap_or(false);
        semantics_issue = s["semantics_issue"].as_str().map(str::to_owned);
        state = if branch.processing
            || r.try_get::<String, _>("branch_revision")? != branch.revision
            || cut["run"].as_str() != branch.run_id.as_ref().map(|v| v.to_string()).as_deref()
        {
            "catching_up"
        } else if anchor_hash.is_none() {
            "awaiting_data"
        } else if branch.status == "ambiguous" {
            "ambiguous"
        } else {
            "available"
        }
        .into();
    }
    let errors = super::protocol_errors(tx, d.dataset_id, meta.projection_generation).await?;
    let mut families = vec![];
    for family in [
        "parameters",
        "sidechains",
        "proposals",
        "treasury",
        "bundles",
        "bmm",
        "protocol",
    ] {
        let error = errors.iter().find(|(name, _, _)| name == family);
        // A stale reading's event id says nothing about how far facts go.
        let fact_error = error.and_then(|(_, fact, _)| *fact);
        let first = error.and_then(|(_, fact, observation)| match (fact, observation) {
            (Some(f), Some(o)) => Some((*f).min(*o)),
            (f, o) => f.or(*o),
        });
        families.push(FamilyProgress {
            family: family.into(),
            processed_event_id: (through > 0).then(|| {
                fact_error
                    .map_or(through, |n| through.min(n - 1))
                    .to_string()
            }),
            first_error_event_id: first.map(|n| n.to_string()),
        });
    }
    if state == "available" && !errors.is_empty() {
        state = "partial".into()
    }
    // A pinned build that no longer describes the current branch and run
    // would list nothing; restarting is the honest answer.
    if pinned.is_some() && matches!(state.as_str(), "awaiting_data" | "catching_up") {
        return Err(StorageError::StaleCursor);
    }
    meta.data_as_of_event_id = meta.data_as_of_event_id.map(|w| w.min(through));
    let semantics_version = if meta.projection_version >= 5 {
        pulse_source::SEMANTICS_VERSION
    } else {
        "enforcer-0740a393-v1"
    };
    Ok(ProtocolContext {
        meta,
        branch,
        state,
        build_id,
        source_event_cut: (through > 0).then(|| through.to_string()),
        anchor_hash,
        anchor_height,
        semantics_version: semantics_version.into(),
        semantics_supported,
        semantics_issue,
        families,
    })
}
pub(super) async fn current_state(
    tx: &mut Transaction<'_, Postgres>,
    c: &ProtocolContext,
) -> Result<Option<pulse_source::observations::State>, StorageError> {
    if !matches!(c.state.as_str(), "available" | "partial") {
        return Ok(None);
    }
    let value:Option<Value>=sqlx::query_scalar("SELECT state FROM ops.protocol_builds WHERE build_id=$1 AND dataset_id=$2 AND generation=$3").bind(c.build_id.as_ref().and_then(|s|s.parse::<i64>().ok())).bind(c.meta.dataset_id).bind(c.meta.projection_generation).fetch_optional(&mut **tx).await?;
    value
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| StorageError::InvalidProjection)
}
fn validate(q: &ProtocolQuery, max: u32) -> Result<(), StorageError> {
    if !(1..=max).contains(&q.limit.unwrap_or(50))
        || q.slot.is_some_and(|s| !(0..=255).contains(&s))
        || q.from_height.is_some_and(|n| n < 0)
        || q.to_height.is_some_and(|n| n < 0)
        || q.from_height.zip(q.to_height).is_some_and(|(a, b)| a > b)
        || q.from_time.zip(q.to_time).is_some_and(|(a, b)| a > b)
        || !matches!(q.scope.as_deref().unwrap_or("selected"), "selected" | "all")
        || !matches!(
            q.time_basis.as_deref().unwrap_or("block"),
            "block" | "observation" | "ingestion"
        )
        || q.hash
            .as_ref()
            .is_some_and(|h| h.len() != 64 || hex::decode(h).is_err())
        || !matches!(
            q.order.as_deref().unwrap_or("observed"),
            "observed" | "block"
        )
        || q.kind.as_ref().is_some_and(|v| v.len() > 256)
        || q.q.as_ref().is_some_and(|v| v.len() > 256)
        || q.key.as_ref().is_some_and(|v| v.len() > 1024)
    {
        return Err(StorageError::InvalidQuery);
    }
    Ok(())
}
fn filters(q: &ProtocolQuery, resource: &str) -> Value {
    let mut q = q.clone();
    q.cursor = None;
    q.limit = None;
    json!({"resource":resource,"query":q})
}
fn cursor(
    q: &ProtocolQuery,
    resource: &str,
    c: &ProtocolContext,
) -> Result<Option<Cursor>, StorageError> {
    let Some(encoded) = &q.cursor else {
        return Ok(None);
    };
    if encoded.len() > 8192 {
        return Err(StorageError::InvalidQuery);
    }
    let raw = hex::decode(encoded).map_err(|_| StorageError::InvalidQuery)?;
    let p: Cursor = serde_json::from_slice(&raw).map_err(|_| StorageError::InvalidQuery)?;
    // Re-reads publish a new build every few seconds without changing the
    // branch, so a cursor keeps the build it started on instead of matching
    // the head; a build newer than the head was never published.
    let build = |b: &Option<String>| b.as_deref().and_then(|v| v.parse::<i64>().ok());
    if p.dataset != c.meta.dataset_id
        || p.generation != c.meta.projection_generation
        || p.branch != c.branch.revision
        || build(&p.build).is_none_or(|b| build(&c.build_id).is_none_or(|head| b > head))
        || p.filters != filters(q, resource)
    {
        return Err(StorageError::StaleCursor);
    }
    Ok(Some(p))
}
/// The context a page reads from: the head, or the build its cursor pinned.
async fn page_context(
    tx: &mut Transaction<'_, Postgres>,
    d: &Dataset,
    q: &ProtocolQuery,
    resource: &str,
) -> Result<(ProtocolContext, Option<Cursor>), StorageError> {
    let head = context(tx, d).await?;
    let Some(page) = cursor(q, resource, &head)? else {
        return Ok((head, None));
    };
    if page.build == head.build_id {
        return Ok((head, Some(page)));
    }
    let build = page.build.as_deref().and_then(|v| v.parse().ok());
    let pinned = context_at(tx, d, build).await?;
    if pinned.branch.revision != page.branch {
        return Err(StorageError::StaleCursor);
    }
    Ok((pinned, Some(page)))
}
fn encode_cursor(
    q: &ProtocolQuery,
    resource: &str,
    c: &ProtocolContext,
    after: Vec<String>,
) -> String {
    hex::encode(
        serde_json::to_vec(&Cursor {
            dataset: c.meta.dataset_id,
            generation: c.meta.projection_generation,
            branch: c.branch.revision.clone(),
            build: c.build_id.clone(),
            filters: filters(q, resource),
            after,
        })
        .expect("serializable cursor"),
    )
}
/// A column only some item queries select; absent means not reported.
fn optional_column<T>(r: &sqlx::postgres::PgRow, name: &str) -> Result<Option<T>, StorageError>
where
    T: for<'r> sqlx::Decode<'r, Postgres> + sqlx::Type<Postgres>,
{
    match r.try_get::<Option<T>, _>(name) {
        Ok(value) => Ok(value),
        Err(sqlx::Error::ColumnNotFound(_)) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn item(r: sqlx::postgres::PgRow) -> Result<ProtocolItem, StorageError> {
    let evidence: Value = r.try_get("evidence")?;
    Ok(ProtocolItem {
        id: r.try_get("id")?,
        entity_id: r.try_get("entity_id")?,
        kind: r.try_get("kind")?,
        slot: r.try_get("slot")?,
        hash: r.try_get("hash")?,
        height: r.try_get("height")?,
        observed_at: r.try_get("observed_at")?,
        first_observed_at: optional_column(&r, "first_observed_at")?,
        block_time: r.try_get("block_time")?,
        quality: r.try_get("quality")?,
        membership: "unknown".into(),
        is_current: None,
        evidence: serde_json::from_value(evidence).map_err(|_| StorageError::InvalidProjection)?,
        data: r.try_get("data")?,
        issue: r.try_get("issue")?,
    })
}
pub async fn observatory(
    pool: &PgPool,
    q: ProtocolQuery,
) -> Result<ObservatoryResponse, StorageError> {
    validate(&q, 200)?;
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let c = context(&mut tx, &d).await?;
    let state:Option<Value>=sqlx::query_scalar("SELECT state FROM ops.protocol_builds WHERE build_id=$1 AND dataset_id=$2 AND generation=$3").bind(c.build_id.as_ref().and_then(|s|s.parse::<i64>().ok())).bind(d.dataset_id).bind(c.meta.projection_generation).fetch_optional(&mut *tx).await?;
    let rows=sqlx::query("SELECT DISTINCT ON(e.kind,e.sidechain) o.observation_id::text AS id,NULL::text AS entity_id,e.kind,e.sidechain AS slot,encode(e.block_hash,'hex') AS hash,e.height,o.observed_at,h.block_time,
        CASE WHEN f.error IS NOT NULL THEN 'unknown' WHEN s.consistency='tip_matched' AND s.revision_before IS NULL AND s.revision_after IS NULL AND s.tip_before_hash=s.tip_after_hash AND s.tip_before_height=s.tip_after_height AND s.run_id=o.run_id AND s.dataset_id=o.dataset_id THEN 'tip_matched' ELSE 'unknown' END AS quality,
        jsonb_build_array(jsonb_build_object('event_id',e.source_event_id::text,'ordinal',coalesce(f.ordinal,0),'observation_id',o.observation_id::text)) AS evidence,
        jsonb_build_object('value',f.data,'atomicity_proven',false,'snapshot_group_id',s.snapshot_group_id,'consistency',s.consistency,'run_id',o.run_id,'capture_seq',o.capture_seq::text,'capture_method',o.capture_method,'tip_before_hash',encode(s.tip_before_hash,'hex'),'tip_before_height',s.tip_before_height,'tip_after_hash',encode(s.tip_after_hash,'hex'),'tip_after_height',s.tip_after_height,'started_at',s.started_at,'finished_at',s.finished_at,'attempts',s.attempts) AS data,f.error AS issue
        FROM ingest.extractor_status status JOIN ingest.event_observations o ON o.dataset_id=status.dataset_id AND o.run_id=status.run_id JOIN ingest.source_events e ON e.dataset_id=o.dataset_id AND e.source_event_id=o.source_event_id
        LEFT JOIN projection.protocol_facts f ON f.dataset_id=e.dataset_id AND f.generation=$2 AND f.event_id=e.source_event_id AND f.ordinal=0
        LEFT JOIN ingest.snapshot_groups s USING(snapshot_group_id)
        LEFT JOIN projection.chain_headers h ON h.dataset_id=e.dataset_id AND h.generation=$2 AND h.hash=encode(e.block_hash,'hex')
        LEFT JOIN projection.chain_members m ON m.dataset_id=h.dataset_id AND m.generation=h.generation AND m.hash=h.hash
        WHERE status.dataset_id=$1 AND status.source='enforcer' AND e.kind IN ('active_sidechains','sidechain_proposals','ctip','withdrawal_bundle_proposals') AND ($3::smallint IS NULL OR e.sidechain=$3 OR e.sidechain IS NULL) AND e.source_event_id<=$4 AND o.observation_id<=coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=$5),0)
        ORDER BY e.kind,e.sidechain,o.capture_seq DESC")
        .bind(d.dataset_id).bind(c.meta.projection_generation).bind(q.slot).bind(c.source_event_cut.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0)).bind(c.build_id.as_ref().and_then(|s|s.parse::<i64>().ok())).fetch_all(&mut *tx).await?;
    let mut observations = rows.into_iter().map(item).collect::<Result<Vec<_>, _>>()?;
    membership(&mut tx, &c, &mut observations).await?;
    let state = state.filter(|_| matches!(c.state.as_str(), "available" | "partial"));
    tx.commit().await?;
    Ok(ObservatoryResponse {
        context: c,
        state: state.unwrap_or_else(|| json!({})),
        observations,
    })
}

/// Records one summary counts per kind before it reports `truncated`.
const SUMMARY_MAX: u32 = 10_000;

/// Deposits, payouts and merged-mining commitments of one recent period, all counted over the same block heights
/// and from the same build, so the figures can be compared with each other.
pub async fn summary(pool: &PgPool, q: SummaryQuery) -> Result<SummaryResponse, StorageError> {
    let hours = q.hours.unwrap_or(24);
    if !(1..=168).contains(&hours) {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let c = context(&mut tx, &d).await?;
    let anchor = c
        .anchor_height
        .filter(|_| matches!(c.state.as_str(), "available" | "partial"));
    let Some(anchor) = anchor else {
        tx.commit().await?;
        return Ok(SummaryResponse {
            context: c,
            window: None,
        });
    };
    let g = c.meta.projection_generation;
    let since: DateTime<Utc> = sqlx::query_scalar("SELECT now()-make_interval(hours=>$1)")
        .bind(i32::try_from(hours).map_err(|_| StorageError::InvalidQuery)?)
        .fetch_one(&mut *tx)
        .await?;
    let first: Option<(i32, DateTime<Utc>)> = sqlx::query_as("SELECT m.height,h.block_time FROM projection.chain_members m JOIN projection.chain_headers h ON h.dataset_id=m.dataset_id AND h.generation=m.generation AND h.hash=m.hash WHERE m.dataset_id=$1 AND m.generation=$2 AND m.height<=$3 AND h.block_time>=$4 ORDER BY m.height LIMIT 1")
        .bind(d.dataset_id).bind(g).bind(anchor).bind(since).fetch_optional(&mut *tx).await?;
    let from_height = first.map_or(anchor + 1, |f| f.0);
    let to_block_time: Option<DateTime<Utc>> = sqlx::query_scalar("SELECT h.block_time FROM projection.chain_members m JOIN projection.chain_headers h ON h.dataset_id=m.dataset_id AND h.generation=m.generation AND h.hash=m.hash WHERE m.dataset_id=$1 AND m.generation=$2 AND m.height=$3")
        .bind(d.dataset_id).bind(g).bind(anchor).fetch_optional(&mut *tx).await?;
    let blocks_on_branch: i64 = sqlx::query_scalar("SELECT count(DISTINCT height) FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND height BETWEEN $3 AND $4")
        .bind(d.dataset_id).bind(g).bind(from_height).bind(anchor).fetch_one(&mut *tx).await?;
    let range = |kind: Option<&str>| ProtocolQuery {
        kind: kind.map(str::to_owned),
        from_height: Some(from_height),
        to_height: Some(anchor),
        order: Some("block".into()),
        ..ProtocolQuery::default()
    };
    let deposits = history_page(&mut tx, "deposits", &range(None), &c, None, SUMMARY_MAX).await?;
    let outcomes = history_page(
        &mut tx,
        "activity",
        &range(Some("bundle_outcome")),
        &c,
        None,
        SUMMARY_MAX,
    )
    .await?;
    let truncated = deposits.len() > SUMMARY_MAX as usize || outcomes.len() > SUMMARY_MAX as usize;
    let deposited: u128 = deposits
        .iter()
        .filter_map(|i| match &i.data["value_sats"] {
            Value::String(v) => v.parse::<u128>().ok(),
            Value::Number(v) => v.as_u64().map(u128::from),
            _ => None,
        })
        .sum();
    let outcome = |name: &str| {
        outcomes
            .iter()
            .filter(|i| i.data["state"].get(name).is_some())
            .count() as i64
    };
    // A block counts as observed when the enforcer reported its merged-mining facts without conflicting samples.
    let (bmm_observed_blocks, bmm_committed_blocks): (i64, i64) = sqlx::query_as("WITH cells AS (SELECT f.hash,f.slot,count(DISTINCT coalesce(f.data->>'bmm_commitment',''))=1 AS consistent,bool_or(f.data->>'bmm_commitment' IS NOT NULL) AS present
          FROM projection.protocol_facts f JOIN projection.chain_members m ON m.dataset_id=f.dataset_id AND m.generation=f.generation AND m.hash=f.hash
         WHERE f.dataset_id=$1 AND f.generation=$2 AND f.kind='slot_block' AND f.error IS NULL AND f.event_id<=$3 AND m.height BETWEEN $4 AND $5 GROUP BY f.hash,f.slot)
        SELECT count(DISTINCT hash) FILTER (WHERE consistent),count(DISTINCT hash) FILTER (WHERE consistent AND present) FROM cells")
        .bind(d.dataset_id).bind(g)
        .bind(c.source_event_cut.as_ref().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0))
        .bind(from_height).bind(anchor).fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(SummaryResponse {
        window: Some(SummaryWindow {
            hours,
            since,
            from_height,
            to_height: anchor,
            from_block_time: first.map(|f| f.1),
            to_block_time,
            blocks: i64::from(anchor - from_height + 1),
            blocks_on_branch,
            deposits: deposits.len().min(SUMMARY_MAX as usize) as i64,
            deposited_sats: deposited.to_string(),
            deposit_quality: weakest_quality(&deposits),
            payouts_succeeded: outcome("Succeeded"),
            payouts_failed: outcome("Failed"),
            bmm_observed_blocks,
            bmm_committed_blocks,
            truncated,
        }),
        context: c,
    })
}
/// The least certain quality among items: a total is only as certain as its weakest part.
fn weakest_quality(items: &[ProtocolItem]) -> Option<String> {
    let rank = |q: &str| match q {
        "observed" => 0,
        "tip_matched" => 1,
        _ => 2,
    };
    items
        .iter()
        .map(|i| i.quality.as_str())
        .max_by_key(|q| rank(q))
        .map(str::to_owned)
}
pub async fn list(
    pool: &PgPool,
    resource: &str,
    q: ProtocolQuery,
) -> Result<ProtocolPage, StorageError> {
    list_bounded(pool, resource, q, 200).await
}
pub async fn export(
    pool: &PgPool,
    resource: &str,
    mut q: ProtocolQuery,
) -> Result<ProtocolPage, StorageError> {
    q.limit = Some(10_000);
    list_bounded(pool, resource, q, 10_000).await
}
async fn list_bounded(
    pool: &PgPool,
    resource: &str,
    q: ProtocolQuery,
    max: u32,
) -> Result<ProtocolPage, StorageError> {
    validate(&q, max)?;
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let (c, page) = page_context(&mut tx, &d, &q, resource).await?;
    let limit = q.limit.unwrap_or(50);
    let history = is_history(resource);
    let items = if history {
        history_page(&mut tx, resource, &q, &c, page.as_ref(), limit).await?
    } else {
        facts_page(&mut tx, resource, &q, &c, page.as_ref(), limit).await?
    };
    let mut items = items;
    membership(&mut tx, &c, &mut items).await?;
    if history {
        let state = current_state(&mut tx, &c).await?;
        for i in &mut items {
            if i.hash.is_some() && i.membership != "selected" {
                i.is_current = Some(false);
                continue;
            }
            i.is_current = state.as_ref().and_then(|state| current_of(state, i));
        }
    }
    if resource == "sidechain-instances" {
        for i in &mut items {
            if i.hash.is_some()
                && i.is_current != Some(true)
                && i.data.get("ended_height").is_none()
            {
                let last:Option<i32>=sqlx::query_scalar("SELECT max(p.height) FROM projection.protocol_history p JOIN projection.chain_members m ON m.dataset_id=p.dataset_id AND m.generation=p.generation AND m.hash=p.hash WHERE p.dataset_id=$1 AND p.generation=$2 AND p.kind='instance' AND p.entity_key=$3 AND p.data->>'status'='active' AND p.build_id<=$4 AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.dataset_id=p.dataset_id AND v.generation=p.generation AND v.hash=p.hash AND v.build_id>p.build_id AND v.build_id<=$4)").bind(c.meta.dataset_id).bind(c.meta.projection_generation).bind(&i.entity_id).bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok())).fetch_one(&mut *tx).await?;
                if let Some(data) = i.data.as_object_mut() {
                    data.insert("last_active_height".into(), json!(last));
                }
            }
        }
    }
    let more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = if more {
        items
            .last()
            .map(|i| encode_cursor(&q, resource, &c, after_keys(resource, &q, i)))
    } else {
        None
    };
    tx.commit().await?;
    Ok(ProtocolPage {
        context: c,
        items,
        next_cursor,
    })
}
/// Histories derive from observed readings; every other resource lists facts.
fn is_history(resource: &str) -> bool {
    matches!(
        resource,
        "deposits"
            | "withdrawal-bundles"
            | "bundle-attempts"
            | "sidechain-proposals"
            | "sidechain-instances"
            | "ctip/history"
            | "activity"
    )
}
/// Where the page after `i` starts, in the order its resource is listed.
fn after_keys(resource: &str, q: &ProtocolQuery, i: &ProtocolItem) -> Vec<String> {
    let history = is_history(resource);
    vec![
        if history && block_order(resource, q) {
            order_height(i).to_string()
        } else if history {
            i.observed_at.map(|t| t.to_rfc3339()).unwrap_or_default()
        } else {
            i.height.unwrap_or(-1).to_string()
        },
        i.id.clone(),
    ]
}
/// Every item of a resource as of one context, read in bounded pages inside
/// the caller's snapshot. Returns at most `cap` items and whether more exist.
/// Whether an entity is established in the latest complete readings; null if unknown.
/// A reading with no block (a vote or treasury read) is matched by its entity alone,
/// since its own status says nothing about the anchor.
pub(super) fn current_of(
    state: &pulse_source::observations::State,
    i: &ProtocolItem,
) -> Option<bool> {
    let id = i.entity_id.as_deref().unwrap_or_default();
    let slot = i.slot.and_then(|s| u8::try_from(s).ok());
    let block_fact = i.hash.is_some();
    let (found, complete, status_says_ended) = match i.kind.as_str() {
        "proposal" => (
            state.proposals.values().any(|p| p.id == id),
            state.proposals_complete,
            i.data["status"] != "pending",
        ),
        "bundle" => (
            state.bundles.values().any(|p| p.attempt_id == id),
            slot.is_some_and(|s| state.bundle_complete.contains(&s)),
            i.data["status"] != "pending",
        ),
        "instance" => (
            state.active.values().any(|a| a.instance_id() == id),
            state.active_complete,
            i.data["status"] != "active",
        ),
        _ => return None,
    };
    if found {
        Some(true)
    } else if complete || (block_fact && status_says_ended) {
        Some(false)
    } else {
        None
    }
}
/// The tip of the latest complete reading behind `key` (for example `ctip:9`), if any.
pub(super) fn reading_tip(state: &pulse_source::observations::State, key: &str) -> Option<i64> {
    let tip = &state.observation_windows.get(key)?["reference_tip_height"];
    tip.as_i64().or_else(|| tip.as_str()?.parse().ok())
}
/// A 64-hex id with its bytes reversed: M6 ids are stored in transaction-id order
/// but written reversed in the M3 coinbase message, the order the site shows.
fn reversed_id(text: &str) -> Option<String> {
    let mut bytes = (text.len() == 64).then(|| hex::decode(text).ok())??;
    bytes.reverse();
    Some(hex::encode(bytes))
}
pub(super) async fn collect(
    tx: &mut Transaction<'_, Postgres>,
    resource: &str,
    q: &ProtocolQuery,
    c: &ProtocolContext,
    cap: usize,
) -> Result<(Vec<ProtocolItem>, bool), StorageError> {
    const PAGE: u32 = 5_000;
    let mut items = vec![];
    let mut page: Option<Cursor> = None;
    let truncated = loop {
        let mut batch = if is_history(resource) {
            history_page(tx, resource, q, c, page.as_ref(), PAGE).await?
        } else {
            facts_page(tx, resource, q, c, page.as_ref(), PAGE).await?
        };
        let more = batch.len() > PAGE as usize;
        batch.truncate(PAGE as usize);
        let after = batch.last().map(|i| after_keys(resource, q, i));
        items.extend(batch);
        if items.len() > cap {
            items.truncate(cap);
            break true;
        }
        match after.filter(|_| more) {
            Some(after) => {
                page = Some(Cursor {
                    dataset: c.meta.dataset_id,
                    generation: c.meta.projection_generation,
                    branch: c.branch.revision.clone(),
                    build: c.build_id.clone(),
                    filters: Value::Null,
                    after,
                })
            }
            None => break items.len() == cap && more,
        }
    };
    membership(tx, c, &mut items).await?;
    Ok((items, truncated))
}
fn apply_filters<'a>(
    qb: &mut sqlx::QueryBuilder<'a, Postgres>,
    q: &'a ProtocolQuery,
    c: &ProtocolContext,
    alias: &str,
    history: bool,
    // When this item was observed: the latest occurrence, never the time the
    // immutable fact was first recorded.
    observation_time: &str,
) {
    if let Some(slot) = q.slot {
        qb.push(format!(" AND ({alias}.slot=")).push_bind(slot);
        if history {
            qb.push(format!(" OR ({alias}.slot IS NULL AND {alias}.kind='gap')"));
        } else {
            qb.push(format!(" OR {alias}.search_terms @> ARRAY["))
                .push_bind(format!("slot:{slot}"))
                .push("]::text[]");
        }
        qb.push(")");
    }
    if let Some(hash) = &q.hash {
        qb.push(format!(" AND {alias}.hash=")).push_bind(hash);
    }
    if let Some(key) = &q.key {
        qb.push(format!(" AND ({alias}.entity_key=")).push_bind(key).push(format!(" OR EXISTS(SELECT 1 FROM projection.protocol_aliases a WHERE a.dataset_id={alias}.dataset_id AND a.generation={alias}.generation AND a.kind={alias}.kind AND a.target={alias}.entity_key AND a.alias=")).push_bind(key).push("))");
    }
    if let Some(instance) = &q.instance_id {
        qb.push(" AND e.sidechain_instance_id=").push_bind(instance);
    }
    if let Some(h) = q.from_height {
        qb.push(format!(" AND {alias}.height>=")).push_bind(h);
    }
    if let Some(h) = q.to_height {
        qb.push(format!(" AND {alias}.height<=")).push_bind(h);
    }
    if let Some(kind) = &q.kind {
        // One kind, or several separated by commas.
        let kinds: Vec<&str> = kind.split(',').collect();
        qb.push(format!(" AND {alias}.kind=ANY("))
            .push_bind(kinds)
            .push(")");
    }
    if q.scope.as_deref().unwrap_or("selected") == "selected" {
        qb.push(format!(" AND ({alias}.hash IS NULL OR EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id={alias}.dataset_id AND m.generation={alias}.generation AND m.hash={alias}.hash))"));
    }
    if history {
        qb.push(format!(" AND ({alias}.height IS NULL OR {alias}.height<="))
            .push_bind(c.anchor_height.unwrap_or(-1))
            .push(")");
    }
    let time =
        match q
            .time_basis
            .as_deref()
            .unwrap_or(if history { "observation" } else { "block" })
        {
            "observation" => observation_time,
            "ingestion" => "e.imported_at",
            _ => "h.block_time",
        };
    if let Some(t) = q.from_time {
        qb.push(format!(" AND {time}>=")).push_bind(t);
    }
    if let Some(t) = q.to_time {
        qb.push(format!(" AND {time}<=")).push_bind(t);
    }
}
/// A history's sort: by block height, or by the latest occurrence.
fn block_order(resource: &str, q: &ProtocolQuery) -> bool {
    q.order
        .as_deref()
        .map_or(resource == "deposits", |o| o == "block")
}
/// The height a history row sorts by in block order; mirrors `order_height`
/// in `history_page`.
fn order_height(i: &ProtocolItem) -> i64 {
    i.height
        .map(i64::from)
        .or_else(|| i.data["observation_window"]["reference_tip_height"].as_i64())
        .unwrap_or(-1)
}
async fn history_page(
    tx: &mut Transaction<'_, Postgres>,
    resource: &str,
    q: &ProtocolQuery,
    c: &ProtocolContext,
    page: Option<&Cursor>,
    limit: u32,
) -> Result<Vec<ProtocolItem>, StorageError> {
    // While membership changes, preserve observations but do not blend a new
    // branch with the previously published reconstruction.
    if matches!(c.state.as_str(), "awaiting_data" | "catching_up") {
        return Ok(vec![]);
    }
    let kinds: Option<&[&str]> = match resource {
        "deposits" => Some(&["deposit"]),
        // Observed pending bundles and their block outcomes (Succeeded/Failed).
        "withdrawal-bundles" | "bundle-attempts" => Some(&["bundle", "bundle_outcome"]),
        "sidechain-proposals" => Some(&["proposal"]),
        "sidechain-instances" => Some(&["instance"]),
        "ctip/history" => Some(&["ctip"]),
        _ => None,
    };
    let latest = matches!(
        resource,
        "withdrawal-bundles" | "bundle-attempts" | "sidechain-proposals" | "sidechain-instances"
    );
    let block = block_order(resource, q);
    // Readings that repeat their predecessor are dropped after filtering, so
    // the comparison sees each entity's whole filtered history.
    let changes = q.changes == Some(true) && !latest;
    let mut qb = sqlx::QueryBuilder::new(if latest {
        "WITH candidates AS (SELECT DISTINCT ON(p.kind,p.entity_key) p.*,(SELECT o.observed_at FROM ingest.event_observations o WHERE o.dataset_id=p.dataset_id AND o.observation_id=p.observation_id) AS first_observed_at,coalesce((SELECT o.observed_at FROM ingest.event_observations o WHERE o.dataset_id=p.dataset_id AND o.observation_id=p.last_observation_id),e.observed_at) AS observed_at,h.block_time,coalesce(p.height,(p.data#>>'{observation_window,reference_tip_height}')::int,-1) AS order_height"
    } else {
        "WITH candidates AS (SELECT p.*,(SELECT o.observed_at FROM ingest.event_observations o WHERE o.dataset_id=p.dataset_id AND o.observation_id=p.observation_id) AS first_observed_at,coalesce((SELECT o.observed_at FROM ingest.event_observations o WHERE o.dataset_id=p.dataset_id AND o.observation_id=p.last_observation_id),e.observed_at) AS observed_at,h.block_time,coalesce(p.height,(p.data#>>'{observation_window,reference_tip_height}')::int,-1) AS order_height"
    });
    if changes {
        qb.push(",(p.data-'observation_window') IS DISTINCT FROM lag(p.data-'observation_window') OVER (PARTITION BY p.kind,p.entity_key ORDER BY p.observation_id NULLS FIRST,p.height NULLS FIRST,p.ordinal) AS changed");
    }
    qb.push(" FROM projection.observed_history p");
    qb.push(" LEFT JOIN ingest.source_events e ON e.dataset_id=p.dataset_id AND e.source_event_id=(p.evidence->0->>'event_id')::bigint LEFT JOIN projection.chain_headers h ON h.dataset_id=p.dataset_id AND h.generation=p.generation AND h.hash=p.hash WHERE p.dataset_id=").push_bind(c.meta.dataset_id).push(" AND p.generation=").push_bind(c.meta.projection_generation).push(" AND p.build_id<=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0));
    qb.push(" AND (p.observation_id IS NULL OR p.observation_id <= coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0)).push("),0))");
    if let Some(k) = kinds {
        qb.push(" AND p.kind=ANY(").push_bind(k.to_vec()).push(")");
    }
    qb.push(" AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.dataset_id=p.dataset_id AND v.generation=p.generation AND v.hash=p.hash AND v.build_id>p.build_id AND v.build_id<=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0)).push(")");
    apply_filters(
        &mut qb,
        q,
        c,
        "p",
        true,
        "coalesce((SELECT o.observed_at FROM ingest.event_observations o WHERE o.dataset_id=p.dataset_id AND o.observation_id=p.last_observation_id),e.observed_at)",
    );
    if let Some(search) = q.q.as_deref().filter(|s| !s.is_empty()) {
        // An M6 id is stored in transaction-id order but written reversed in
        // the M3 coinbase message, the order pools and the enforcer show.
        let onchain = reversed_id(search).unwrap_or_default();
        qb.push(" AND (p.entity_key=").push_bind(search).push(" OR coalesce(p.data->>'m6id',p.data#>>'{bundle,m6id}',p.data#>>'{proposal,description_hash}',p.data#>>'{sidechain,description_hash}')=").push_bind(search).push(" OR coalesce(p.data->>'m6id',p.data#>>'{bundle,m6id}')=").push_bind(onchain).push(" OR coalesce(p.data#>>'{outpoint,txid}',p.data#>>'{ctip,txid}',p.data#>>'{transition,txid}')=").push_bind(search).push(")");
    }
    if latest {
        qb.push(" ORDER BY p.kind,p.entity_key,");
        if q.scope.as_deref() == Some("all") {
            qb.push("EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=p.dataset_id AND m.generation=p.generation AND m.hash=p.hash) DESC,");
        }
        qb.push("p.height DESC NULLS FIRST,p.observation_id DESC,p.ordinal DESC");
    }
    if changes {
        // A kept reading stands for the identical readings after it until the
        // next change: it reports their latest read, its quality and their
        // total occurrences, so dropping repeats never makes a value look stale.
        qb.push("), runs AS (SELECT *,sum(changed::int) OVER (PARTITION BY kind,entity_key ORDER BY observation_id NULLS FIRST,height NULLS FIRST,ordinal) AS change_group FROM candidates), merged AS (SELECT entity_key,kind,slot,hash,height,observation_id,build_id,ordinal,first_observed_at,block_time,evidence,data,issue,order_height,changed,max(observed_at) OVER w AS observed_at,last_value(quality) OVER (w ORDER BY observation_id NULLS FIRST,height NULLS FIRST,ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS quality,sum(occurrences) OVER w AS occurrences FROM runs WINDOW w AS (PARTITION BY kind,entity_key,change_group)");
    }
    qb.push(if changes { "), listed AS (SELECT *,coalesce(height,-1)::text || ':' || coalesce(hash,lpad(observation_id::text,20,'0')) || ':' || build_id::text || ':' || ordinal::text AS page_id FROM merged) SELECT" } else { "), listed AS (SELECT *,coalesce(height,-1)::text || ':' || coalesce(hash,lpad(observation_id::text,20,'0')) || ':' || build_id::text || ':' || ordinal::text AS page_id FROM candidates) SELECT" });
    qb.push(" page_id AS id,entity_key AS entity_id,kind,slot,hash,height,observed_at,first_observed_at,block_time,quality,evidence,data || jsonb_build_object('occurrences',occurrences::text) AS data,issue FROM listed WHERE true");
    if changes {
        qb.push(" AND changed");
    }
    if let (Some(p), true) = (page, block) {
        let height: i64 = p
            .after
            .first()
            .and_then(|v| v.parse().ok())
            .ok_or(StorageError::InvalidQuery)?;
        let id = p.after.get(1).ok_or(StorageError::InvalidQuery)?;
        qb.push(" AND (order_height,page_id)<(")
            .push_bind(height)
            .push(",")
            .push_bind(id)
            .push(")");
    } else if let Some(p) = page {
        let observed = p
            .after
            .first()
            .and_then(|v| v.parse::<DateTime<Utc>>().ok())
            .ok_or(StorageError::InvalidQuery)?;
        let id = p.after.get(1).ok_or(StorageError::InvalidQuery)?;
        qb.push(" AND (observed_at,page_id)<(")
            .push_bind(observed)
            .push(",")
            .push_bind(id)
            .push(")");
    }
    qb.push(if block {
        " ORDER BY order_height DESC,page_id DESC LIMIT "
    } else {
        " ORDER BY observed_at DESC,page_id DESC LIMIT "
    })
    .push_bind(i64::from(limit) + 1);
    qb.build()
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(item)
        .collect()
}

async fn facts_page(
    tx: &mut Transaction<'_, Postgres>,
    resource: &str,
    q: &ProtocolQuery,
    c: &ProtocolContext,
    page: Option<&Cursor>,
    limit: u32,
) -> Result<Vec<ProtocolItem>, StorageError> {
    if resource == "events" {
        return events_page(tx, q, c, page, limit).await;
    }
    if resource == "bmm/history" {
        return auction_history(tx, q, c, page, limit).await;
    }
    let kinds: &[&str] = match resource {
        // The official sources report no coinbase messages; only facts that
        // could not be interpreted remain listable here.
        "protocol-messages" => &["interpretation_error"],
        "bmm/commitments" => &["slot_block"],
        "bmm/confirmed" => &["confirmed_bmm_fee"],
        "chain-info" => &["parameters"],
        "observations" => &["active_set", "proposal_set", "ctip_snapshot", "bundle_set"],
        "search" => &[],
        _ => return Err(StorageError::InvalidQuery),
    };
    // Quality and time describe the latest occurrence of a fact up to this
    // build's cut: a snapshot is tip_matched only if that read was, and a
    // block-anchored fact is plainly observed.
    let mut qb = sqlx::QueryBuilder::new(
        "WITH page AS (SELECT f.*,coalesce(lo.observed_at,e.observed_at) AS observed_at,e.observed_at AS first_observed_at,h.block_time,lo.observation_id AS latest_observation_id,
            CASE WHEN f.error IS NOT NULL THEN 'unknown'
                 WHEN e.kind IN ('sidechain_proposals','active_sidechains','ctip','withdrawal_bundle_proposals','bmm_requests')
                     THEN CASE WHEN lo.usable THEN 'tip_matched' ELSE 'unknown' END
                 ELSE 'observed' END AS occurrence_quality
          FROM projection.protocol_facts f JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id
          LEFT JOIN projection.chain_headers h ON h.dataset_id=f.dataset_id AND h.generation=f.generation AND h.hash=f.hash
          LEFT JOIN LATERAL (SELECT o.observation_id,o.observed_at,
                EXISTS(SELECT 1 FROM ingest.state_snapshot_tip_matched t WHERE t.dataset_id=o.dataset_id AND t.observation_id=o.observation_id) AS usable
              FROM ingest.event_observations o WHERE o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id
               AND o.observation_id<=coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=",
    );
    qb.push_bind(c.build_id.as_ref().and_then(|v| v.parse::<i64>().ok()))
        .push("),9223372036854775807) ORDER BY o.observation_id DESC LIMIT 1) lo ON true WHERE f.dataset_id=");
    qb.push_bind(c.meta.dataset_id)
        .push(" AND f.generation=")
        .push_bind(c.meta.projection_generation)
        .push(" AND f.event_id<=")
        .push_bind(
            c.source_event_cut
                .as_ref()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0),
        );
    if !kinds.is_empty() {
        qb.push(" AND f.kind=ANY(")
            .push_bind(kinds.to_vec())
            .push(")");
    }
    let mut filters = q.clone();
    if resource == "chain-info" {
        filters.scope = Some("all".into());
    }
    apply_filters(
        &mut qb,
        &filters,
        c,
        "f",
        false,
        "coalesce(lo.observed_at,e.observed_at)",
    );
    if let Some(search) = q.q.as_deref().filter(|s| !s.is_empty()) {
        // An M6 id may be pasted in either byte order; see `reversed_id`.
        let mut terms = vec![search.to_owned()];
        terms.extend(reversed_id(search));
        qb.push(" AND (f.search_terms && ")
            .push_bind(terms)
            .push("::text[] OR f.hash=")
            .push_bind(search)
            .push(" OR f.entity_key=")
            .push_bind(search);
        if let Ok(height) = search.parse::<i32>() {
            qb.push(" OR f.height=").push_bind(height);
            if (0..=255).contains(&height) {
                qb.push(" OR f.slot=").push_bind(height as i16);
            }
        }
        qb.push(")");
    }
    if let Some(p) = page {
        let id = p.after.get(1).ok_or(StorageError::InvalidQuery)?;
        let mut parts = id.split(':');
        let event = parts
            .next()
            .and_then(|v| v.parse::<i64>().ok())
            .ok_or(StorageError::InvalidQuery)?;
        let ordinal = parts
            .next()
            .and_then(|v| v.parse::<i32>().ok())
            .ok_or(StorageError::InvalidQuery)?;
        qb.push(" AND (f.event_id,f.ordinal)<(")
            .push_bind(event)
            .push(",")
            .push_bind(ordinal)
            .push(")");
    }
    qb.push(" ORDER BY f.event_id DESC,f.ordinal DESC LIMIT ").push_bind(i64::from(limit)+1).push(") SELECT event_id::text || ':' || ordinal::text AS id,entity_key AS entity_id,kind,slot,hash,height,observed_at,first_observed_at,block_time,occurrence_quality AS quality,jsonb_build_array(jsonb_build_object('event_id',event_id::text,'ordinal',ordinal,'observation_id',latest_observation_id::text)) AS evidence,data,error AS issue FROM page ORDER BY event_id DESC,ordinal DESC");
    qb.build()
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(item)
        .collect()
}
async fn events_page(
    tx: &mut Transaction<'_, Postgres>,
    q: &ProtocolQuery,
    c: &ProtocolContext,
    page: Option<&Cursor>,
    limit: u32,
) -> Result<Vec<ProtocolItem>, StorageError> {
    let mut qb = sqlx::QueryBuilder::new(
        "SELECT e.source_event_id::text AS id,NULL::text AS entity_id,e.kind,e.sidechain AS slot,encode(e.block_hash,'hex') AS hash,e.height,e.observed_at,h.block_time,'observed' AS quality,jsonb_build_array(jsonb_build_object('event_id',e.source_event_id::text,'ordinal',0,'observation_id',NULL)) AS evidence,jsonb_build_object('event_contract_version',e.event_contract_version,'source',e.source,'fact_sha256',encode(e.fact_sha256,'hex'),'instance_id',e.sidechain_instance_id) AS data,coalesce(e.interpretation_error,(SELECT string_agg(pf.error,'; ' ORDER BY pf.ordinal) FROM projection.protocol_facts pf WHERE pf.dataset_id=e.dataset_id AND pf.generation=(SELECT projection_generation FROM ops.active_dataset WHERE dataset_id=e.dataset_id) AND pf.event_id=e.source_event_id AND pf.error IS NOT NULL)) AS issue FROM ingest.source_events e LEFT JOIN projection.chain_headers h ON h.dataset_id=e.dataset_id AND h.generation=",
    );
    qb.push_bind(c.meta.projection_generation)
        .push(" AND h.hash=encode(e.block_hash,'hex') WHERE e.dataset_id=")
        .push_bind(c.meta.dataset_id)
        .push(" AND e.source_event_id<=")
        .push_bind(
            c.source_event_cut
                .as_ref()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0),
        );
    if let Some(kind) = &q.kind {
        qb.push(" AND e.kind=").push_bind(kind);
    }
    if let Some(slot) = q.slot {
        qb.push(" AND e.sidechain=").push_bind(slot);
    }
    if let Some(hash) = &q.hash {
        qb.push(" AND e.block_hash=decode(")
            .push_bind(hash)
            .push(",'hex')");
    }
    if let Some(height) = q.from_height {
        qb.push(" AND e.height>=").push_bind(height);
    }
    if let Some(height) = q.to_height {
        qb.push(" AND e.height<=").push_bind(height);
    }
    if q.scope.as_deref().unwrap_or("selected") == "selected" {
        qb.push(" AND (e.block_hash IS NULL OR EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=e.dataset_id AND m.generation=").push_bind(c.meta.projection_generation).push(" AND m.hash=encode(e.block_hash,'hex')))");
    }
    let time = match q.time_basis.as_deref().unwrap_or("block") {
        "observation" => "e.observed_at",
        "ingestion" => "e.imported_at",
        _ => "h.block_time",
    };
    if let Some(t) = q.from_time {
        qb.push(format!(" AND {time}>=")).push_bind(t);
    }
    if let Some(t) = q.to_time {
        qb.push(format!(" AND {time}<=")).push_bind(t);
    }
    if let Some(search) = q.q.as_deref().filter(|s| !s.is_empty()) {
        qb.push(" AND (encode(e.block_hash,'hex')=").push_bind(search).push(" OR EXISTS(SELECT 1 FROM projection.protocol_facts f WHERE f.dataset_id=e.dataset_id AND f.generation=").push_bind(c.meta.projection_generation).push(" AND f.event_id=e.source_event_id AND f.search_terms && ").push_bind([search.to_owned()].into_iter().chain(reversed_id(search)).collect::<Vec<_>>()).push("::text[])");
        if let Ok(id) = search.parse::<i64>() {
            qb.push(" OR e.source_event_id=")
                .push_bind(id)
                .push(" OR e.height=")
                .push_bind(id);
        }
        qb.push(")");
    }
    if let Some(p) = page {
        let id = p
            .after
            .get(1)
            .and_then(|v| v.parse::<i64>().ok())
            .ok_or(StorageError::InvalidQuery)?;
        qb.push(" AND e.source_event_id<").push_bind(id);
    }
    qb.push(" ORDER BY e.source_event_id DESC LIMIT ")
        .push_bind(i64::from(limit) + 1);
    qb.build()
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(item)
        .collect()
}
async fn auction_history(
    tx: &mut Transaction<'_, Postgres>,
    q: &ProtocolQuery,
    c: &ProtocolContext,
    page: Option<&Cursor>,
    limit: u32,
) -> Result<Vec<ProtocolItem>, StorageError> {
    let mut qb = sqlx::QueryBuilder::new(
        "SELECT o.observation_id::text AS id,NULL::text AS entity_id,'auction_sample' AS kind,NULL::smallint AS slot,f.hash,f.height,o.observed_at,h.block_time,CASE WHEN s.consistency='tip_matched' AND s.revision_before IS NULL AND s.revision_after IS NULL AND s.run_id=o.run_id AND s.dataset_id=o.dataset_id AND encode(s.tip_before_hash,'hex')=f.hash AND s.tip_before_hash=s.tip_after_hash AND s.tip_before_height=f.height AND s.tip_after_height=f.height THEN 'tip_matched' ELSE 'unknown' END AS quality,jsonb_build_array(jsonb_build_object('event_id',f.event_id::text,'ordinal',f.ordinal,'observation_id',o.observation_id::text)) AS evidence,f.data || jsonb_build_object('snapshot_group_id',s.snapshot_group_id,'run_id',o.run_id,'consistency',s.consistency) AS data,f.error AS issue FROM projection.protocol_facts f JOIN ingest.event_observations o ON o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id LEFT JOIN ingest.snapshot_groups s USING(snapshot_group_id) LEFT JOIN projection.chain_headers h ON h.dataset_id=f.dataset_id AND h.generation=f.generation AND h.hash=f.hash WHERE f.dataset_id=",
    );
    qb.push_bind(c.meta.dataset_id).push(" AND f.generation=").push_bind(c.meta.projection_generation).push(" AND f.kind='auction' AND f.event_id<=").push_bind(c.source_event_cut.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0)).push(" AND o.observation_id<=coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok())).push("),0)");
    let mut no_slot = q.clone();
    no_slot.slot = None;
    apply_filters(&mut qb, &no_slot, c, "f", false, "o.observed_at");
    if let Some(p) = page {
        let id = p
            .after
            .get(1)
            .and_then(|v| v.parse::<i64>().ok())
            .ok_or(StorageError::InvalidQuery)?;
        qb.push(" AND o.observation_id<").push_bind(id);
    }
    qb.push(" ORDER BY o.observation_id DESC LIMIT ")
        .push_bind(i64::from(limit) + 1);
    let mut items: Vec<_> = qb
        .build()
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(item)
        .collect::<Result<_, _>>()?;
    if let Some(slot) = q.slot {
        for i in &mut items {
            if let Some(xs) = i.data["requests"].as_array_mut() {
                xs.retain(|x| x["sidechain_number"].as_i64() == Some(i64::from(slot)));
            }
        }
    }
    Ok(items)
}

async fn membership(
    tx: &mut Transaction<'_, Postgres>,
    c: &ProtocolContext,
    items: &mut [ProtocolItem],
) -> Result<(), StorageError> {
    let hashes: Vec<_> = items.iter().filter_map(|i| i.hash.as_deref()).collect();
    let rows=sqlx::query("SELECT h.hash,m.hash IS NOT NULL AS selected FROM projection.chain_headers h LEFT JOIN projection.chain_members m USING(dataset_id,generation,hash) WHERE h.dataset_id=$1 AND h.generation=$2 AND h.hash=ANY($3)").bind(c.meta.dataset_id).bind(c.meta.projection_generation).bind(hashes).fetch_all(&mut **tx).await?;
    for i in items {
        i.membership = match i.hash.as_ref() {
            None => "not_applicable",
            Some(hash) => match rows.iter().find(|r| r.get::<String, _>("hash") == *hash) {
                Some(r) if r.get::<bool, _>("selected") => "selected",
                Some(_) => "alternative",
                None => "unknown",
            },
        }
        .into();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::reversed_id;
    #[test]
    fn m6_ids_reverse_only_when_complete() {
        // Thunder's pending bundle: M3 (shown) order and transaction-id (stored) order.
        let shown = "aa769fec72ddc7e59fb6dc480d62ba19236804598d053b6c50522cae30b0ced4";
        let stored = "d4ceb030ae2c52506c3b058d5904682319ba620d48dcb69fe5c7dd72ec9f76aa";
        assert_eq!(reversed_id(shown).as_deref(), Some(stored));
        assert_eq!(reversed_id(stored).as_deref(), Some(shown));
        assert_eq!(reversed_id("aa76"), None);
        assert_eq!(reversed_id(&"z".repeat(64)), None);
    }
}
