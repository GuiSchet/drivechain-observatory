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
    pub from_height: Option<i32>,
    pub to_height: Option<i32>,
    pub from_time: Option<DateTime<Utc>>,
    pub to_time: Option<DateTime<Utc>>,
    /// block (default), observation, or ingestion.
    pub time_basis: Option<String>,
    pub q: Option<String>,
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
    let mut meta = response_meta(tx, d).await?;
    let branch = blocks::branch(tx, d.dataset_id).await?;
    let head=sqlx::query("SELECT b.* FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) WHERE h.dataset_id=$1 AND h.generation=$2").bind(d.dataset_id).bind(meta.projection_generation).fetch_optional(&mut **tx).await?;
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
        let first = errors
            .iter()
            .find(|(name, _)| name == family)
            .map(|(_, id)| *id);
        families.push(FamilyProgress {
            family: family.into(),
            processed_event_id: (through > 0)
                .then(|| first.map_or(through, |n| through.min(n - 1)).to_string()),
            first_error_event_id: first.map(|n| n.to_string()),
        });
    }
    if state == "available" && !errors.is_empty() {
        state = "partial".into()
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
) -> Result<Option<pulse_source::replay::State>, StorageError> {
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
    if p.dataset != c.meta.dataset_id
        || p.generation != c.meta.projection_generation
        || p.branch != c.branch.revision
        || p.build != c.build_id
        || p.filters != filters(q, resource)
    {
        return Err(StorageError::StaleCursor);
    }
    Ok(Some(p))
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
        CASE WHEN f.error IS NOT NULL THEN 'unknown' WHEN s.consistency='stable' AND s.tip_before_hash=s.tip_after_hash AND s.tip_before_height=s.tip_after_height AND s.tip_before_hash=e.block_hash AND s.tip_before_height=e.height AND s.run_id=o.run_id AND s.dataset_id=o.dataset_id AND m.hash IS NOT NULL THEN 'observed' ELSE 'unknown' END AS quality,
        jsonb_build_array(jsonb_build_object('event_id',e.source_event_id::text,'ordinal',coalesce(f.ordinal,0),'observation_id',o.observation_id::text)) AS evidence,
        jsonb_build_object('value',f.data,'snapshot_group_id',s.snapshot_group_id,'consistency',s.consistency,'run_id',o.run_id,'capture_seq',o.capture_seq::text,'capture_method',o.capture_method,'tip_before_hash',encode(s.tip_before_hash,'hex'),'tip_before_height',s.tip_before_height,'tip_after_hash',encode(s.tip_after_hash,'hex'),'tip_after_height',s.tip_after_height,'started_at',s.started_at,'finished_at',s.finished_at,'attempts',s.attempts) AS data,f.error AS issue
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
    let c = context(&mut tx, &d).await?;
    let page = cursor(&q, resource, &c)?;
    let limit = q.limit.unwrap_or(50);
    let history = matches!(
        resource,
        "deposits"
            | "withdrawal-bundles"
            | "bundle-attempts"
            | "sidechain-proposals"
            | "sidechain-instances"
            | "ctip/history"
            | "activity"
    );
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
            if i.membership != "selected" {
                i.is_current = Some(false);
                continue;
            }
            if let Some(state) = &state {
                let id = i.entity_id.as_deref().unwrap_or_default();
                let slot = i.slot.and_then(|s| u8::try_from(s).ok());
                i.is_current = match i.kind.as_str() {
                    "proposal" => {
                        if state.proposals.values().any(|p| p.id == id) {
                            Some(true)
                        } else if state.proposals_complete || i.data["status"] != "pending" {
                            Some(false)
                        } else {
                            None
                        }
                    }
                    "bundle" => {
                        if state.bundles.values().any(|p| p.attempt_id == id) {
                            Some(true)
                        } else if slot.is_some_and(|s| state.bundle_complete.contains(&s))
                            || i.data["status"] != "pending"
                        {
                            Some(false)
                        } else {
                            None
                        }
                    }
                    "instance" => {
                        if state.active.values().any(|a| a.instance_id() == id) {
                            Some(true)
                        } else if state.active_complete || i.data["status"] != "active" {
                            Some(false)
                        } else {
                            None
                        }
                    }
                    _ => None,
                };
            }
        }
    }
    if resource == "sidechain-instances" {
        for i in &mut items {
            if i.is_current != Some(true) && i.data.get("ended_height").is_none() {
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
        items.last().map(|i| {
            encode_cursor(
                &q,
                resource,
                &c,
                vec![i.height.unwrap_or(-1).to_string(), i.id.clone()],
            )
        })
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
fn apply_filters<'a>(
    qb: &mut sqlx::QueryBuilder<'a, Postgres>,
    q: &'a ProtocolQuery,
    c: &ProtocolContext,
    alias: &str,
    history: bool,
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
    if let Some(h) = q.from_height {
        qb.push(format!(" AND {alias}.height>=")).push_bind(h);
    }
    if let Some(h) = q.to_height {
        qb.push(format!(" AND {alias}.height<=")).push_bind(h);
    }
    if let Some(kind) = &q.kind {
        qb.push(format!(" AND {alias}.kind=")).push_bind(kind);
    }
    if q.scope.as_deref().unwrap_or("selected") == "selected" {
        qb.push(format!(" AND ({alias}.hash IS NULL OR EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id={alias}.dataset_id AND m.generation={alias}.generation AND m.hash={alias}.hash))"));
    }
    if history {
        qb.push(format!(" AND {alias}.height<="))
            .push_bind(c.anchor_height.unwrap_or(-1));
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
    let kind = match resource {
        "deposits" => Some("deposit"),
        "withdrawal-bundles" | "bundle-attempts" => Some("bundle"),
        "sidechain-proposals" => Some("proposal"),
        "sidechain-instances" => Some("instance"),
        "ctip/history" => Some("ctip"),
        _ => None,
    };
    let latest = matches!(
        resource,
        "withdrawal-bundles" | "bundle-attempts" | "sidechain-proposals" | "sidechain-instances"
    );
    let mut qb = sqlx::QueryBuilder::new(if latest {
        "WITH candidates AS (SELECT DISTINCT ON(p.kind,p.entity_key) p.*,e.observed_at,h.block_time FROM projection.protocol_history p"
    } else {
        "WITH candidates AS (SELECT p.*,e.observed_at,h.block_time FROM projection.protocol_history p"
    });
    qb.push(" LEFT JOIN ingest.source_events e ON e.dataset_id=p.dataset_id AND e.source_event_id=(p.evidence->0->>'event_id')::bigint LEFT JOIN projection.chain_headers h ON h.dataset_id=p.dataset_id AND h.generation=p.generation AND h.hash=p.hash WHERE p.dataset_id=").push_bind(c.meta.dataset_id).push(" AND p.generation=").push_bind(c.meta.projection_generation).push(" AND p.build_id<=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0));
    if let Some(k) = kind {
        qb.push(" AND p.kind=").push_bind(k);
    }
    qb.push(" AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.dataset_id=p.dataset_id AND v.generation=p.generation AND v.hash=p.hash AND v.build_id>p.build_id AND v.build_id<=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0)).push(")");
    apply_filters(&mut qb, q, c, "p", true);
    if let Some(search) = q.q.as_deref().filter(|s| !s.is_empty()) {
        qb.push(" AND (p.entity_key=").push_bind(search).push(" OR coalesce(p.data->>'m6id',p.data#>>'{bundle,m6id}',p.data#>>'{proposal,description_hash}',p.data#>>'{sidechain,description_hash}')=").push_bind(search).push(" OR coalesce(p.data#>>'{outpoint,txid}',p.data#>>'{ctip,txid}',p.data#>>'{transition,txid}')=").push_bind(search).push(")");
    }
    if latest {
        qb.push(" ORDER BY p.kind,p.entity_key,");
        if q.scope.as_deref() == Some("all") {
            qb.push("EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=p.dataset_id AND m.generation=p.generation AND m.hash=p.hash) DESC,");
        }
        qb.push("p.height DESC,p.ordinal DESC");
    }
    qb.push("), listed AS (SELECT *,height::text || ':' || hash || ':' || build_id::text || ':' || ordinal::text AS page_id FROM candidates) SELECT page_id AS id,entity_key AS entity_id,kind,slot,hash,height,observed_at,block_time,quality,evidence,data,issue FROM listed WHERE true");
    if let Some(p) = page {
        let height = p
            .after
            .first()
            .and_then(|v| v.parse::<i32>().ok())
            .ok_or(StorageError::InvalidQuery)?;
        let id = p.after.get(1).ok_or(StorageError::InvalidQuery)?;
        qb.push(" AND (height,page_id)<(")
            .push_bind(height)
            .push(",")
            .push_bind(id)
            .push(")");
    }
    qb.push(" ORDER BY height DESC,page_id DESC LIMIT ")
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
        "protocol-messages" => &["m1", "m2", "m3", "m4", "m7", "interpretation_error"],
        "bmm/commitments" => &["slot_block", "m7"],
        "bmm/confirmed" => &["confirmed_bmm", "confirmed_bmm_fee"],
        "chain-info" => &["parameters"],
        "observations" => &["active_set", "proposal_set", "ctip_snapshot", "bundle_set"],
        "search" => &[],
        _ => return Err(StorageError::InvalidQuery),
    };
    let mut qb = sqlx::QueryBuilder::new(
        "WITH page AS (SELECT f.*,e.observed_at,h.block_time FROM projection.protocol_facts f JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id LEFT JOIN projection.chain_headers h ON h.dataset_id=f.dataset_id AND h.generation=f.generation AND h.hash=f.hash WHERE f.dataset_id=",
    );
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
    apply_filters(&mut qb, &filters, c, "f", false);
    if let Some(search) = q.q.as_deref().filter(|s| !s.is_empty()) {
        qb.push(" AND (f.search_terms @> ARRAY[")
            .push_bind(search)
            .push("]::text[] OR f.hash=")
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
    qb.push(" ORDER BY f.event_id DESC,f.ordinal DESC LIMIT ").push_bind(i64::from(limit)+1).push(") SELECT event_id::text || ':' || ordinal::text AS id,entity_key AS entity_id,kind,slot,hash,height,observed_at,block_time,CASE WHEN error IS NULL THEN 'observed' ELSE 'unknown' END AS quality,jsonb_build_array(jsonb_build_object('event_id',event_id::text,'ordinal',ordinal,'observation_id',NULL)) AS evidence,data,error AS issue FROM page ORDER BY event_id DESC,ordinal DESC");
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
        "SELECT e.source_event_id::text AS id,NULL::text AS entity_id,e.kind,e.sidechain AS slot,encode(e.block_hash,'hex') AS hash,e.height,e.observed_at,h.block_time,'observed' AS quality,jsonb_build_array(jsonb_build_object('event_id',e.source_event_id::text,'ordinal',0,'observation_id',NULL)) AS evidence,jsonb_build_object('event_contract_version',e.event_contract_version,'source',e.source,'fact_sha256',encode(e.fact_sha256,'hex'),'instance_id',e.sidechain_instance_id) AS data,e.interpretation_error AS issue FROM ingest.source_events e LEFT JOIN projection.chain_headers h ON h.dataset_id=e.dataset_id AND h.generation=",
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
        qb.push(" AND (encode(e.block_hash,'hex')=").push_bind(search).push(" OR EXISTS(SELECT 1 FROM projection.protocol_facts f WHERE f.dataset_id=e.dataset_id AND f.generation=").push_bind(c.meta.projection_generation).push(" AND f.event_id=e.source_event_id AND f.search_terms @> ARRAY[").push_bind(search).push("]::text[])");
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
        "SELECT o.observation_id::text AS id,NULL::text AS entity_id,'auction_sample' AS kind,NULL::smallint AS slot,f.hash,f.height,o.observed_at,h.block_time,CASE WHEN s.consistency='stable' AND s.revision_before IS NOT NULL AND s.revision_before=s.revision_after AND s.run_id=o.run_id AND s.dataset_id=o.dataset_id AND encode(s.tip_before_hash,'hex')=f.hash AND s.tip_before_hash=s.tip_after_hash AND s.tip_before_height=f.height AND s.tip_after_height=f.height THEN 'observed' ELSE 'unknown' END AS quality,jsonb_build_array(jsonb_build_object('event_id',f.event_id::text,'ordinal',f.ordinal,'observation_id',o.observation_id::text)) AS evidence,f.data || jsonb_build_object('snapshot_group_id',s.snapshot_group_id,'run_id',o.run_id,'consistency',s.consistency) AS data,f.error AS issue FROM projection.protocol_facts f JOIN ingest.event_observations o ON o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id LEFT JOIN ingest.snapshot_groups s USING(snapshot_group_id) LEFT JOIN projection.chain_headers h ON h.dataset_id=f.dataset_id AND h.generation=f.generation AND h.hash=f.hash WHERE f.dataset_id=",
    );
    qb.push_bind(c.meta.dataset_id).push(" AND f.generation=").push_bind(c.meta.projection_generation).push(" AND f.kind='auction' AND f.event_id<=").push_bind(c.source_event_cut.as_ref().and_then(|v|v.parse::<i64>().ok()).unwrap_or(0)).push(" AND o.observation_id<=coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=").push_bind(c.build_id.as_ref().and_then(|v|v.parse::<i64>().ok())).push("),0)");
    let mut no_slot = q.clone();
    no_slot.slot = None;
    apply_filters(&mut qb, &no_slot, c, "f", false);
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
