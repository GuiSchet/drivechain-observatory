//! Generation-scoped, locally replayable observed-branch projections.
use super::{SourceEvent, append_update, cursor};
use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, Utc};
use pulse_domain::{BranchCoverage, BranchState};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Connection, PgConnection, Row};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::FromRow)]
pub struct Cut {
    pub events: i64,
    pub observations: i64,
    pub tips: i64,
    pub coverage: i64,
    pub run: Uuid,
}

#[derive(Debug, Serialize)]
struct Header {
    hash: String,
    parent: String,
    height: i32,
    work: String,
    block_work: String,
    time: DateTime<Utc>,
    event: i64,
    observed: DateTime<Utc>,
}
fn hash(v: &Value) -> Result<String> {
    let bytes = hex::decode(v.as_str().context("missing hash")?)?;
    ensure!(bytes.len() == 32, "hash must have 32 bytes");
    Ok(hex::encode(bytes))
}
// Decimal digits avoid a machine-sized integer or floating-point conversion.
fn work(v: &Value) -> Result<String> {
    let bytes = hex::decode(hash(v)?)?;
    let mut digits = vec![0_u32];
    for byte in bytes.into_iter().rev() {
        let mut carry = u32::from(byte);
        for digit in &mut digits {
            carry += *digit * 256;
            *digit = carry % 10;
            carry /= 10;
        }
        while carry > 0 {
            digits.push(carry % 10);
            carry /= 10;
        }
    }
    Ok(digits
        .iter()
        .rev()
        .map(|d| char::from_digit(*d, 10).expect("decimal digit"))
        .collect())
}
fn validate_slot(event: &SourceEvent, body: &Value) -> Result<()> {
    let slot = body["sidechain_number"]
        .as_u64()
        .context("missing sidechain slot")?;
    ensure!(
        slot <= 255 && event.sidechain == Some(i16::try_from(slot)?),
        "payload slot differs from indexed slot"
    );
    Ok(())
}
fn header(event: &SourceEvent) -> Result<Header> {
    ensure!(
        event.event_contract_version == 8,
        "unsupported header contract"
    );
    let name = match event.kind.as_str() {
        "chain_tip" => "ChainTip",
        "mainchain_transition" => "MainchainTransition",
        "block_connected" => "BlockConnected",
        "mainchain_block" => "MainchainBlock",
        _ => bail!("not a header fact"),
    };
    let source = if event.source == "node" {
        "Node"
    } else {
        "Enforcer"
    };
    let body = &event.payload["monitor_event"][source]["event"][name];
    if event.kind == "block_connected" {
        validate_slot(event, body)?;
    }
    let h = &body["header"];
    let hash = hash(&h["hash"])?;
    ensure!(
        event
            .block_hash
            .as_ref()
            .is_some_and(|v| hex::encode(v) == hash),
        "header hash differs from anchor"
    );
    let height = i32::try_from(h["height"].as_u64().context("invalid height")?)?;
    ensure!(
        event.height == Some(height),
        "header height differs from anchor"
    );
    let parent = self::hash(&h["previous_hash"])?;
    ensure!(parent != hash, "self-parent header");
    Ok(Header {
        hash,
        parent,
        height,
        work: if event.source == "node" {
            work(&h["cumulative_work"])?
        } else {
            ensure!(
                h["cumulative_work"].as_str() == Some(""),
                "official enforcer must not claim cumulative work"
            );
            "0".into()
        },
        block_work: work(&h["block_work"])?,
        time: DateTime::from_timestamp(
            i64::try_from(h["timestamp"].as_u64().context("invalid block timestamp")?)?,
            0,
        )
        .context("block timestamp outside supported range")?,
        event: event.id,
        observed: event.observed_at,
    })
}

pub async fn normalize(
    conn: &mut PgConnection,
    dataset: Uuid,
    generation: i64,
    through: i64,
    limit: i64,
) -> Result<bool> {
    sqlx::query(
        "INSERT INTO ops.chain_jobs(dataset_id,generation,promoted) SELECT $1,$2,EXISTS(SELECT 1 FROM ops.active_dataset WHERE dataset_id=$1 AND projection_generation=$2 AND projection_version>=3) ON CONFLICT DO NOTHING",
    )
    .bind(dataset)
    .bind(generation)
    .execute(&mut *conn)
    .await?;
    let after: i64 = sqlx::query_scalar(
        "SELECT event_cursor FROM ops.chain_jobs WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(dataset)
    .bind(generation)
    .fetch_one(&mut *conn)
    .await?;
    if after >= through {
        return Ok(true);
    }
    let events=sqlx::query_as::<_,SourceEvent>("SELECT source_event_id AS id,dataset_id,event_contract_version,observed_at,source_ingested_at AS ingested_at,source,kind,sidechain,sidechain_instance_id,block_hash,height,envelope,envelope_sha256,fact_sha256,payload FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id>$2 AND source_event_id<=$3 ORDER BY source_event_id LIMIT $4")
        .bind(dataset).bind(after).bind(through).bind(limit).fetch_all(&mut *conn).await?;
    let next = if events.len() < usize::try_from(limit)? {
        through
    } else {
        events.last().context("nonempty page")?.id
    };
    let mut headers = Vec::new();
    let mut facts = Vec::new();
    let mut reports = Vec::new();
    for event in events {
        if !matches!(
            event.kind.as_str(),
            "chain_tip"
                | "block_connected"
                | "mainchain_block"
                | "block_disconnected"
                | "mainchain_transition"
        ) {
            continue;
        }
        if event.kind == "mainchain_transition" && event.block_hash.is_none() {
            continue; // Unanchored subscription boundary, retained in protocol evidence.
        }
        let result = if event.kind == "mainchain_transition"
            && event.payload["monitor_event"]["Enforcer"]["event"]["MainchainTransition"]["action"]
                == 2
        {
            event
                .block_hash
                .as_ref()
                .filter(|h| h.len() == 32)
                .context("invalid disconnected hash")
                .map(|_| None)
        } else if event.kind == "block_disconnected" {
            let h = hash(
                &event.payload["monitor_event"]["Enforcer"]["event"]["BlockDisconnected"]["block_hash"],
            );
            h.and_then(|h| {
                ensure!(
                    event.event_contract_version == 8,
                    "unsupported disconnect contract"
                );
                validate_slot(
                    &event,
                    &event.payload["monitor_event"]["Enforcer"]["event"]["BlockDisconnected"],
                )?;
                ensure!(
                    event
                        .block_hash
                        .as_ref()
                        .is_some_and(|a| hex::encode(a) == h),
                    "disconnect hash differs from anchor"
                );
                Ok(None)
            })
        } else {
            header(&event).map(Some)
        };
        let error = match result {
            Ok(Some(h)) => {
                if event.source == "node" {
                    headers.push(h);
                } else {
                    reports.push(h);
                }
                None
            }
            Ok(None) => None,
            Err(e) => Some(e.to_string()),
        };
        facts.push(json!({"event":event.id,"hash":event.block_hash.as_ref().map(hex::encode).unwrap_or_default(),"kind":event.kind,"slot":event.sidechain,"instance":event.sidechain_instance_id,"contract":event.event_contract_version,"error":error}));
    }
    let mut tx = conn.begin().await?;
    sqlx::query("WITH input AS (SELECT * FROM jsonb_to_recordset($3) AS x(hash text,parent text,height integer,work numeric,block_work numeric,time timestamptz,event bigint,observed timestamptz)),
        first AS (SELECT DISTINCT ON(hash) * FROM input ORDER BY hash,event),
        conflicts AS (SELECT hash,count(DISTINCT (parent,height,work,block_work,time))>1 AS bad,max(observed) AS latest FROM input GROUP BY hash)
        INSERT INTO projection.chain_headers AS h(dataset_id,generation,hash,parent,height,chain_work,block_work,block_time,first_event_id,first_observed_at,last_observed_at,conflicted)
        SELECT $1,$2,f.hash,f.parent,f.height,f.work,f.block_work,f.time,f.event,f.observed,c.latest,c.bad FROM first f JOIN conflicts c USING(hash)
        ON CONFLICT(dataset_id,generation,hash) DO UPDATE SET last_observed_at=greatest(h.last_observed_at,excluded.last_observed_at),
        conflicted=h.conflicted OR excluded.conflicted OR (h.parent,h.height,h.chain_work,h.block_work,h.block_time) IS DISTINCT FROM (excluded.parent,excluded.height,excluded.chain_work,excluded.block_work,excluded.block_time)")
        .bind(dataset).bind(generation).bind(json!(headers)).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO projection.reported_headers SELECT $1,$2,r.event,r.hash,r.parent,r.height,r.block_work,r.time FROM jsonb_to_recordset($3) AS r(event bigint,hash text,parent text,height integer,block_work numeric,time timestamptz) ON CONFLICT DO NOTHING")
        .bind(dataset).bind(generation).bind(json!(reports)).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO projection.chain_facts(dataset_id,generation,event_id,hash,kind,slot,instance_id,contract,error)
        SELECT $1,$2,f.event,f.hash,f.kind,f.slot,f.instance,f.contract,coalesce(f.error,CASE WHEN h.conflicted THEN 'conflicting headers for this hash' END)
        FROM jsonb_to_recordset($3) AS f(event bigint,hash text,kind text,slot smallint,instance text,contract integer,error text)
        LEFT JOIN projection.chain_headers h ON h.dataset_id=$1 AND h.generation=$2 AND h.hash=f.hash ON CONFLICT DO NOTHING")
        .bind(dataset).bind(generation).bind(json!(facts)).execute(&mut *tx).await?;
    // Equal headers do not excuse contradictory block contents. Preserve both
    // facts and stop certifying any branch containing that identity.
    sqlx::query("UPDATE projection.chain_headers h SET conflicted=true WHERE h.dataset_id=$1 AND h.generation=$2
        AND h.hash IN (SELECT encode(block_hash,'hex') FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id>$3 AND source_event_id<=$4)
        AND EXISTS(SELECT 1 FROM ingest.source_events e WHERE e.dataset_id=$1 AND e.block_hash=decode(h.hash,'hex')
            AND e.source_event_id<=$4 AND e.kind IN ('block_connected','mainchain_block')
            GROUP BY e.event_contract_version,e.source,e.kind,e.sidechain,e.sidechain_instance_id,e.block_hash HAVING count(DISTINCT e.fact_sha256)>1)")
        .bind(dataset).bind(generation).bind(after).bind(next).execute(&mut *tx).await?;
    sqlx::query("UPDATE projection.chain_headers h SET conflicted=true WHERE h.dataset_id=$1 AND h.generation=$2 AND EXISTS(SELECT 1 FROM projection.chain_facts f WHERE f.dataset_id=$1 AND f.generation=$2 AND f.hash=h.hash AND f.event_id>$3 AND f.event_id<=$4) AND EXISTS(SELECT 1 FROM projection.reported_headers r WHERE r.dataset_id=h.dataset_id AND r.generation=h.generation AND r.hash=h.hash AND (r.parent,r.height,r.block_work,r.block_time) IS DISTINCT FROM (h.parent,h.height,h.block_work,h.block_time))")
        .bind(dataset).bind(generation).bind(after).bind(next).execute(&mut *tx).await?;
    sqlx::query("UPDATE ops.chain_jobs SET event_cursor=$3 WHERE dataset_id=$1 AND generation=$2")
        .bind(dataset)
        .bind(generation)
        .bind(next)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(next == through)
}

// Walk only the new suffix, stopping at a shared ancestor. Also repair the
// lower boundary when a missing parent arrives in a later backfill page.
async fn select_path(conn: &mut PgConnection, d: Uuid, g: i64, tip: &str) -> Result<()> {
    sqlx::query("CREATE TEMP TABLE pulse_path ON COMMIT DROP AS WITH RECURSIVE walk AS (
        SELECT h.*,EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=$1 AND m.generation=$2 AND m.hash=h.hash) AS shared
        FROM projection.chain_headers h WHERE h.dataset_id=$1 AND h.generation=$2 AND h.hash=$3
        UNION ALL SELECT p.*,EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=$1 AND m.generation=$2 AND m.hash=p.hash)
        FROM walk c JOIN projection.chain_headers p ON p.dataset_id=$1 AND p.generation=$2 AND p.hash=c.parent
        WHERE NOT c.shared AND NOT c.conflicted AND NOT p.conflicted AND p.height=c.height-1 AND c.block_work>0 AND p.chain_work+c.block_work=c.chain_work)
        SELECT * FROM walk")
        .bind(d).bind(g).bind(tip).execute(&mut *conn).await?;
    sqlx::query("DELETE FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND height>coalesce((SELECT min(height) FROM pulse_path WHERE shared),-1)")
        .bind(d).bind(g).execute(&mut *conn).await?;
    sqlx::query("INSERT INTO projection.chain_members SELECT $1,$2,height,hash FROM pulse_path ON CONFLICT(dataset_id,generation,height) DO UPDATE SET hash=excluded.hash")
        .bind(d).bind(g).execute(&mut *conn).await?;
    sqlx::query("DROP TABLE pulse_path")
        .execute(&mut *conn)
        .await?;
    sqlx::query("WITH RECURSIVE lower AS (
        SELECT h.* FROM projection.chain_headers h JOIN (SELECT hash FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 ORDER BY height LIMIT 1) m USING(hash) WHERE h.dataset_id=$1 AND h.generation=$2
        UNION ALL SELECT p.* FROM lower c JOIN projection.chain_headers p ON p.dataset_id=$1 AND p.generation=$2 AND p.hash=c.parent
        WHERE NOT c.conflicted AND NOT p.conflicted AND p.height=c.height-1 AND c.block_work>0 AND p.chain_work+c.block_work=c.chain_work)
        INSERT INTO projection.chain_members SELECT $1,$2,height,hash FROM lower ON CONFLICT DO NOTHING")
        .bind(d).bind(g).execute(&mut *conn).await?;
    Ok(())
}
async fn assess(conn: &mut PgConnection, d: Uuid, g: i64, state: &mut BranchState) -> Result<()> {
    let Some(tip) = state.tip_hash.clone() else {
        return Ok(());
    };
    if state.basis != "conflicting_live_observation" {
        state.status = "provisional".into();
    }
    select_path(conn, d, g, &tip).await?;
    let boundary=sqlx::query("SELECT h.*,d.activation_height,d.activation_block_hash FROM projection.chain_members m JOIN projection.chain_headers h ON h.dataset_id=m.dataset_id AND h.generation=m.generation AND h.hash=m.hash JOIN ingest.datasets d ON d.dataset_id=m.dataset_id WHERE m.dataset_id=$1 AND m.generation=$2 ORDER BY m.height LIMIT 1")
        .bind(d).bind(g).fetch_optional(&mut *conn).await?;
    state.verified_from_height = None;
    state.missing_parent = None;
    state.checkpoint_status = "unobserved".into();
    let Some(b) = boundary else {
        state.status = "provisional".into();
        state.basis = "tip_header_missing".into();
        return Ok(());
    };
    let height: i32 = b.try_get("height")?;
    state.verified_from_height = Some(height);
    let checkpoint: i32 = b.try_get("activation_height")?;
    let hash: String = b.try_get("activation_block_hash")?;
    let observed:Option<String>=sqlx::query_scalar("SELECT hash FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND height=$3")
        .bind(d).bind(g).bind(checkpoint).fetch_optional(&mut *conn).await?;
    state.checkpoint_status = match observed {
        Some(h) if h == hash => "matched",
        Some(_) => "mismatch",
        None => "unobserved",
    }
    .into();
    let lower:i32=sqlx::query_scalar("SELECT coalesce(min((row_data->>'coverage_start_height')::integer),$3) FROM (SELECT DISTINCT ON(event_contract_version,source,stream,sidechain,sidechain_instance_id) * FROM ingest.coverage_revisions WHERE dataset_id=$1 AND revision_id<=$2 ORDER BY event_contract_version,source,stream,sidechain,sidechain_instance_id,revision_id DESC) c WHERE stream='mainchain_block' AND source='node' AND lower(operation)<>'delete'")
        .bind(d).bind(state.processed_coverage.parse::<i64>()?).bind(checkpoint).fetch_one(&mut *conn).await?;
    let conflicted:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_headers h JOIN projection.chain_members m USING(dataset_id,generation,hash) WHERE h.dataset_id=$1 AND h.generation=$2 AND h.conflicted)")
        .bind(d).bind(g).fetch_one(&mut *conn).await?;
    let tip_height:Option<i32>=sqlx::query_scalar("SELECT height FROM projection.chain_headers WHERE dataset_id=$1 AND generation=$2 AND hash=$3")
        .bind(d).bind(g).bind(&tip).fetch_optional(&mut *conn).await?;
    let invalid_edge:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_headers WHERE dataset_id=$1 AND generation=$2 AND hash=$3)")
        .bind(d).bind(g).bind(b.try_get::<String,_>("parent")?).fetch_one(&mut *conn).await?;
    if conflicted
        || state.checkpoint_status == "mismatch"
        || tip_height != state.tip_height
        || (invalid_edge && height > 0)
    {
        state.status = "ambiguous".into();
        state.basis = "inconsistent_headers".into();
    } else if height > lower.max(checkpoint) {
        state.missing_parent = Some(b.try_get("parent")?);
        if state.status != "ambiguous" {
            state.status = "provisional".into();
            state.basis = "missing_parent".into();
        }
    } else if state.status != "ambiguous"
        && state.evidence_type.as_deref() == Some("tip_observation")
    {
        state.status = "resolved".into();
        state.basis = "observed_tip_contiguous_range".into();
    }
    Ok(())
}

pub async fn state(conn: &mut PgConnection, d: Uuid, g: i64) -> Result<BranchState> {
    let value: Option<Value> = sqlx::query_scalar(
        "SELECT state FROM projection.chain_state WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(d)
    .bind(g)
    .fetch_optional(conn)
    .await?;
    value
        .map(serde_json::from_value)
        .transpose()
        .map(|v| v.unwrap_or_else(BranchState::awaiting))
        .map_err(Into::into)
}
fn semantic(s: &BranchState) -> Value {
    json!([
        s.status,
        s.basis,
        s.run_id,
        s.tip_hash,
        s.tip_height,
        s.verified_from_height,
        s.missing_parent,
        s.checkpoint_status,
        s.evidence_type,
        s.evidence_id
    ])
}

async fn save_revision(
    conn: &mut PgConnection,
    d: Uuid,
    g: i64,
    next: &mut BranchState,
    recorded: &mut BranchState,
) -> Result<()> {
    if semantic(recorded) != semantic(next) {
        next.revision = (next.revision.parse::<i64>()? + 1).to_string();
        sqlx::query("INSERT INTO projection.chain_revisions VALUES($1,$2,$3,$4,now())")
            .bind(d)
            .bind(g)
            .bind(next.revision.parse::<i64>()?)
            .bind(json!(next))
            .execute(conn)
            .await?;
        *recorded = next.clone();
    }
    Ok(())
}

pub async fn apply(
    conn: &mut PgConnection,
    d: Uuid,
    g: i64,
    cut: &Cut,
    limit: i64,
    publish: bool,
) -> Result<bool> {
    let old = state(conn, d, g).await?;
    let mut next = old.clone();
    let mut tx = conn.begin().await?;
    if next.run_id != Some(cut.run) {
        next = BranchState::awaiting();
        next.run_id = Some(cut.run);
        next.revision = old.revision.clone();
        sqlx::query("DELETE FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2")
            .bind(d)
            .bind(g)
            .execute(&mut *tx)
            .await?;
    }
    let seq = next.capture_seq.parse::<i64>()?;
    let rows=sqlx::query("SELECT * FROM (
        SELECT t.capture_seq,'tip' AS kind,encode(t.tip_hash,'hex') AS hash,t.tip_height AS height,t.observed_at,t.tip_observation_id AS id,t.capture_method,NULL::text AS parent,NULL::text AS error
        FROM (SELECT * FROM ingest.tip_observations WHERE dataset_id=$1 AND run_id=$3 AND tip_observation_id<=$5 AND capture_seq>$6 ORDER BY capture_seq LIMIT $7) t
        UNION ALL
        SELECT o.capture_seq,coalesce(f.kind,'other'),f.hash,h.height,o.observed_at,o.observation_id,o.capture_method,h.parent,f.error
        FROM (SELECT * FROM ingest.event_observations WHERE dataset_id=$1 AND run_id=$3 AND observation_id<=$4 AND capture_seq>$6 ORDER BY capture_seq LIMIT $7) o LEFT JOIN projection.chain_facts f ON f.dataset_id=o.dataset_id AND f.generation=$2 AND f.event_id=o.source_event_id
        LEFT JOIN projection.chain_headers h ON h.dataset_id=f.dataset_id AND h.generation=f.generation AND h.hash=f.hash

        ) input ORDER BY capture_seq LIMIT $7")
        .bind(d).bind(g).bind(cut.run).bind(cut.observations).bind(cut.tips).bind(seq).bind(limit).fetch_all(&mut *tx).await?;
    let mut recorded = old.clone();
    for r in &rows {
        next.capture_seq = r.try_get::<i64, _>("capture_seq")?.to_string();
        let kind: String = r.try_get("kind")?;
        let method: String = r.try_get("capture_method")?;
        let hash: Option<String> = r.try_get("hash")?;
        if r.try_get::<Option<String>, _>("error")?.is_some() {
            continue;
        }
        if kind == "tip" && method != "backfill" {
            next.tip_hash = hash;
            next.tip_height = r.try_get("height")?;
            next.observed_at = Some(r.try_get("observed_at")?);
            next.status = "provisional".into();
            next.basis = "observed_tip".into();
            next.evidence_type = Some("tip_observation".into());
            next.evidence_id = Some(r.try_get::<i64, _>("id")?.to_string());
            assess(&mut tx, d, g, &mut next).await?;
        } else if method == "live"
            && matches!(kind.as_str(), "block_connected" | "block_disconnected")
            && next.tip_hash.is_some()
        {
            let member:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND hash=$3)")
                .bind(d).bind(g).bind(&hash).fetch_one(&mut *tx).await?;
            if kind == "block_connected" && hash == next.tip_hash {
                continue;
            }
            if kind == "block_connected"
                && r.try_get::<Option<String>, _>("parent")? == next.tip_hash
                && next.status != "ambiguous"
            {
                next.tip_hash = hash;
                next.tip_height = r.try_get("height")?;
                next.observed_at = Some(r.try_get("observed_at")?);
                next.status = "provisional".into();
                next.basis = "live_extension".into();
                next.evidence_type = Some("event_observation".into());
                next.evidence_id = Some(r.try_get::<i64, _>("id")?.to_string());
                assess(&mut tx, d, g, &mut next).await?;
            } else if (kind == "block_disconnected" && member)
                || (kind == "block_connected" && !member)
            {
                next.status = "ambiguous".into();
                next.basis = "conflicting_live_observation".into();
            } else {
                continue;
            }
            next.evidence_type = Some("event_observation".into());
            next.evidence_id = Some(r.try_get::<i64, _>("id")?.to_string());
        }
        save_revision(&mut tx, d, g, &mut next, &mut recorded).await?;
    }
    let complete = rows.len() < usize::try_from(limit)?;
    next.processing = !complete;
    if complete {
        next.processed_events = cut.events.to_string();
        next.processed_observations = cut.observations.to_string();
        next.processed_tips = cut.tips.to_string();
        next.processed_coverage = cut.coverage.to_string();
        assess(&mut tx, d, g, &mut next).await?;
        let node:Option<(String,i32)>=sqlx::query_as("SELECT encode(t.tip_hash,'hex'),t.tip_height FROM ingest.tip_observations t JOIN ingest.extractor_runs r USING(run_id) WHERE t.dataset_id=$1 AND r.source='node' AND t.tip_observation_id<=$2 ORDER BY t.tip_observation_id DESC LIMIT 1")
            .bind(d).bind(cut.tips).fetch_optional(&mut *tx).await?;
        next.node_tip_hash = node.as_ref().map(|n| n.0.clone());
        next.node_tip_height = node.map(|n| n.1);
        next.joint_source_status = if next.tip_hash.is_none() || next.node_tip_hash.is_none() {
            "unknown"
        } else if next.tip_hash == next.node_tip_hash && next.tip_height == next.node_tip_height {
            "matched"
        } else {
            "different_tips"
        }
        .into();
        // Malformed redundant facts remain diagnostics. Only unresolved header
        // evidence on the selected path (including its missing boundary) blocks
        // its completeness; independent valid headers can repair missing ones.
        let error: Option<i64> = sqlx::query_scalar("SELECT min(f.event_id) FROM projection.chain_facts f WHERE f.dataset_id=$1 AND f.generation=$2 AND f.event_id<=$3 AND (
            EXISTS(SELECT 1 FROM projection.chain_members m JOIN projection.chain_headers h USING(dataset_id,generation,hash) WHERE m.dataset_id=f.dataset_id AND m.generation=f.generation AND m.hash=f.hash AND h.conflicted)
            OR (f.error IS NOT NULL AND f.hash IN ($4,$5) AND NOT EXISTS(SELECT 1 FROM projection.chain_headers h WHERE h.dataset_id=f.dataset_id AND h.generation=f.generation AND h.hash=f.hash AND NOT h.conflicted))
        )")
            .bind(d).bind(g).bind(cut.events).bind(&next.tip_hash).bind(&next.missing_parent).fetch_one(&mut *tx).await?;
        sqlx::query(
            "UPDATE ops.chain_jobs SET error_event_id=$3 WHERE dataset_id=$1 AND generation=$2",
        )
        .bind(d)
        .bind(g)
        .bind(error)
        .execute(&mut *tx)
        .await?;
        if let Some(error) = error {
            next.processed_events = cut.events.min(error - 1).to_string();
            next.status = "ambiguous".into();
            next.basis = "header_interpretation_error".into();
        }
    }
    save_revision(&mut tx, d, g, &mut next, &mut recorded).await?;
    let changed = old.revision != next.revision;
    if complete
        && (changed
            || old.processed_coverage != next.processed_coverage
            || old.processed_events != next.processed_events)
    {
        certify(&mut tx, d, g, cut, &next).await?;
    }
    sqlx::query("INSERT INTO projection.chain_state VALUES($1,$2,$3) ON CONFLICT(dataset_id,generation) DO UPDATE SET state=excluded.state")
        .bind(d).bind(g).bind(json!(next)).execute(&mut *tx).await?;
    if complete {
        sqlx::query(
            "UPDATE ops.chain_jobs SET cut=$3,complete=true WHERE dataset_id=$1 AND generation=$2",
        )
        .bind(d)
        .bind(g)
        .bind(json!(cut))
        .execute(&mut *tx)
        .await?;
    }
    if publish && next != old {
        append_update(
            &mut tx,
            d,
            Some(cut.events),
            json!(["blocks", "overview", "status", "coverage", "bmm"]),
        )
        .await?;
    }
    tx.commit().await?;
    Ok(complete)
}

async fn certify(
    conn: &mut PgConnection,
    d: Uuid,
    g: i64,
    cut: &Cut,
    state: &BranchState,
) -> Result<()> {
    let rows=sqlx::query("SELECT * FROM (SELECT DISTINCT ON(event_contract_version,source,stream,sidechain,sidechain_instance_id) * FROM ingest.coverage_revisions WHERE dataset_id=$1 AND revision_id<=$2 ORDER BY event_contract_version,source,stream,sidechain,sidechain_instance_id,revision_id DESC) c WHERE lower(operation)<>'delete'")
        .bind(d).bind(cut.coverage).fetch_all(&mut *conn).await?;
    for r in rows {
        let data: Value = r.try_get("row_data")?;
        let start = data["coverage_start_height"]
            .as_i64()
            .and_then(|x| i32::try_from(x).ok());
        let end = data["covered_tip_height"]
            .as_i64()
            .and_then(|x| i32::try_from(x).ok());
        let stream: String = r.try_get("stream")?;
        let kind = match stream.as_str() {
            "mainchain_block" => Some("mainchain_block"),
            "block" => Some("block_connected"),
            _ => None,
        };
        let mut result = BranchCoverage {
            status: "unverified".into(),
            verified_from_height: None,
            verified_through_height: None,
            first_gap_height: None,
            covered_blocks: "0".into(),
            branch_revision: state.revision.clone(),
        };
        if let (Some(start), Some(end), Some(kind)) = (start, end, kind) {
            let target = data["covered_tip_hash"]
                .as_str()
                .map(|s| s.trim_start_matches("\\x").to_lowercase());
            let compatible:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND height=$3 AND hash=$4)").bind(d).bind(g).bind(end).bind(&target).fetch_one(&mut *conn).await?;
            if state.joint_source_status != "matched" {
                result.status = "sources_not_matched".into();
            } else if state.status == "ambiguous" {
                result.status = "branch_ambiguous".into();
            } else if !compatible {
                result.status = "branch_mismatch".into();
            } else if start <= end {
                // Resume a certified prefix only when its end still belongs to this branch.
                let prior:Option<Value>=sqlx::query_scalar("SELECT v.result FROM projection.chain_coverage v JOIN ingest.coverage_revisions c ON c.dataset_id=v.dataset_id AND c.revision_id=v.source_revision WHERE v.dataset_id=$1 AND v.generation=$2 AND c.stream=$3 AND c.sidechain IS NOT DISTINCT FROM $4 AND c.sidechain_instance_id IS NOT DISTINCT FROM $5 AND c.event_contract_version=$6 AND v.result->>'_start'=$7 AND EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=$1 AND m.generation=$2 AND m.hash=v.result->>'_through_hash') ORDER BY v.source_revision DESC LIMIT 1")
                    .bind(d).bind(g).bind(&stream).bind(r.try_get::<Option<i16>,_>("sidechain")?).bind(r.try_get::<Option<String>,_>("sidechain_instance_id")?).bind(r.try_get::<i32,_>("event_contract_version")?).bind(start.to_string()).fetch_optional(&mut *conn).await?;
                let resume = prior
                    .and_then(|p| p["verified_through_height"].as_i64())
                    .and_then(|h| i32::try_from(h).ok())
                    .map_or(start, |h| h.saturating_add(1).min(end.saturating_add(1)));
                let gap:Option<i32>=sqlx::query_scalar("SELECT n FROM generate_series($3::integer,$4::integer) n LEFT JOIN projection.chain_members m ON m.dataset_id=$1 AND m.generation=$2 AND m.height=n WHERE m.hash IS NULL OR NOT EXISTS(SELECT 1 FROM projection.chain_facts f WHERE f.dataset_id=$1 AND f.generation=$2 AND f.hash=m.hash AND f.kind=$5 AND ($6::smallint IS NULL OR f.slot=$6) AND ($7::text IS NULL OR f.instance_id=$7) AND f.contract=$8 AND f.error IS NULL AND f.event_id<=$9) ORDER BY n LIMIT 1")
                    .bind(d).bind(g).bind(resume).bind(end).bind(kind).bind(r.try_get::<Option<i16>,_>("sidechain")?).bind(r.try_get::<Option<String>,_>("sidechain_instance_id")?).bind(r.try_get::<i32,_>("event_contract_version")?).bind(cut.events).fetch_optional(&mut *conn).await?;
                let through = gap.map_or(end, |h| h - 1);
                result.status = if gap.is_some() { "gap" } else { "verified" }.into();
                result.first_gap_height = gap;
                if through >= start {
                    result.verified_from_height = Some(start);
                    result.verified_through_height = Some(through);
                    result.covered_blocks = (i64::from(through) - i64::from(start) + 1).to_string();
                }
            }
        }
        let mut value = json!(result);
        value["_start"] = json!(start.map(|n| n.to_string()));
        let end_hash:Option<String>=sqlx::query_scalar("SELECT hash FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND height=$3")
            .bind(d).bind(g).bind(result.verified_through_height).fetch_optional(&mut *conn).await?;
        value["_through_hash"] = json!(end_hash);
        sqlx::query("INSERT INTO projection.chain_coverage VALUES($1,$2,$3,$4) ON CONFLICT(dataset_id,generation,source_revision) DO UPDATE SET result=excluded.result")
            .bind(d).bind(g).bind(r.try_get::<i64,_>("revision_id")?).bind(value).execute(&mut *conn).await?;
    }
    Ok(())
}

pub async fn advance(
    conn: &mut PgConnection,
    d: Uuid,
    g: i64,
    cut: &Cut,
    limit: i64,
    pages: u32,
    publish: bool,
) -> Result<bool> {
    let previous: Option<Value> = sqlx::query_scalar(
        "SELECT cut FROM ops.chain_jobs WHERE dataset_id=$1 AND generation=$2 AND complete",
    )
    .bind(d)
    .bind(g)
    .fetch_optional(&mut *conn)
    .await?
    .flatten();
    if previous == Some(json!(cut)) {
        return Ok(true);
    }
    for _ in 0..pages {
        if normalize(conn, d, g, cut.events, limit).await? {
            break;
        }
    }
    let at: i64 = sqlx::query_scalar(
        "SELECT event_cursor FROM ops.chain_jobs WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(d)
    .bind(g)
    .fetch_one(&mut *conn)
    .await?;
    if at < cut.events {
        return Ok(false);
    }
    for _ in 0..pages {
        if apply(conn, d, g, cut, limit, publish).await? {
            return Ok(true);
        }
    }
    Ok(false)
}

pub async fn ready(conn: &mut PgConnection, d: Uuid, cut: &Cut) -> Result<bool> {
    for (name, end) in [
        ("source_events", cut.events),
        ("event_observations", cut.observations),
        ("tip_observations", cut.tips),
        ("coverage_revisions", cut.coverage),
    ] {
        if cursor(conn, d, name).await? < end {
            return Ok(false);
        }
    }
    Ok(true)
}

pub async fn rebuild(pool: &sqlx::PgPool, d: Uuid, limit: i64, fresh: bool) -> Result<()> {
    let mut conn = pool.acquire().await?;
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(hashtext($1))")
        .bind(d.to_string())
        .fetch_one(&mut *conn)
        .await?;
    ensure!(
        locked,
        "sync is running; stop Observatory sync/API before rebuilding"
    );
    let result = rebuild_locked(&mut conn, d, limit, fresh).await;
    sqlx::query("SELECT pg_advisory_unlock(hashtext($1))")
        .bind(d.to_string())
        .execute(&mut *conn)
        .await?;
    result
}
async fn rebuild_locked(conn: &mut PgConnection, d: Uuid, limit: i64, fresh: bool) -> Result<()> {
    let active: i64 = sqlx::query_scalar(
        "SELECT projection_generation FROM ops.active_dataset WHERE dataset_id=$1",
    )
    .bind(d)
    .fetch_one(&mut *conn)
    .await?;
    // A stopped/restarted rebuild resumes the same staging generation and fixed cut.
    let staging:Option<(i64,Option<Value>)>=sqlx::query_as("SELECT generation,cut FROM ops.chain_jobs WHERE dataset_id=$1 AND generation>$2 AND implementation_version=$3 ORDER BY generation DESC LIMIT 1")
        .bind(d).bind(active).bind(pulse_domain::PROJECTION_VERSION).fetch_optional(&mut *conn).await?;
    let next_generation: i64 = sqlx::query_scalar(
        "SELECT greatest($2,coalesce(max(generation),0))+1 FROM ops.chain_jobs WHERE dataset_id=$1",
    )
    .bind(d)
    .bind(active)
    .fetch_one(&mut *conn)
    .await?;
    let (g, pinned) = if fresh {
        (next_generation, None)
    } else {
        staging.unwrap_or((next_generation, None))
    };
    let cut = if let Some(value) = pinned {
        serde_json::from_value(value)?
    } else {
        let pending: Option<Value> =
            sqlx::query_scalar("SELECT cut FROM ops.chain_cut WHERE dataset_id=$1")
                .bind(d)
                .fetch_optional(&mut *conn)
                .await?;
        if let Some(value) = pending {
            serde_json::from_value(value)?
        } else {
            sqlx::query_as::<_,Cut>("SELECT source_event_high_water AS events,source_observation_high_water AS observations,source_tip_high_water AS tips,source_coverage_high_water AS coverage,run_id AS run FROM ops.source_status s JOIN ingest.extractor_status e ON e.dataset_id=s.dataset_id AND e.source='enforcer' WHERE s.dataset_id=$1")
                .bind(d).fetch_one(&mut *conn).await.context("no coherent imported source cut; synchronize before rebuilding")?
        }
    };
    ensure!(
        ready(conn, d, &cut).await?,
        "complete import of the pinned cut before rebuilding"
    );
    sqlx::query("INSERT INTO ops.chain_jobs(dataset_id,generation,cut) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(d).bind(g).bind(json!(cut)).execute(&mut *conn).await?;
    while !advance(conn, d, g, &cut, limit, 20, false).await? {
        tracing::info!(generation = g, "reconstruction checkpoint saved");
    }
    let error: Option<i64> = sqlx::query_scalar(
        "SELECT error_event_id FROM ops.chain_jobs WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(d)
    .bind(g)
    .fetch_one(&mut *conn)
    .await?;
    ensure!(
        error.is_none(),
        "reconstruction has invalid chain facts at {error:?}; previous generation retained"
    );
    let validated = state(conn, d, g).await?;
    ensure!(
        validated.processed_events == cut.events.to_string(),
        "reconstruction watermark mismatch"
    );
    ensure!(
        validated.status != "ambiguous",
        "reconstruction branch is ambiguous; previous generation retained"
    );
    while !super::protocol::advance(conn, d, g, &cut, limit, 20, false).await? {
        tracing::info!(generation = g, "protocol reconstruction checkpoint saved");
    }
    let mut tx = conn.begin().await?;
    let promotion=sqlx::query("UPDATE ops.active_dataset SET projection_generation=$2,projection_version=$4,replay_floor=0 WHERE dataset_id=$1 AND projection_generation=$3")
        .bind(d).bind(g).bind(active).bind(pulse_domain::PROJECTION_VERSION).execute(&mut *tx).await?;
    ensure!(
        promotion.rows_affected() == 1,
        "active generation changed during reconstruction; staging retained"
    );
    sqlx::query("UPDATE ops.chain_jobs SET promoted=true WHERE dataset_id=$1 AND generation=$2")
        .bind(d)
        .bind(g)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM ops.chain_cut WHERE dataset_id=$1")
        .bind(d)
        .execute(&mut *tx)
        .await?;
    append_update(
        &mut tx,
        d,
        Some(cut.events),
        json!(["blocks", "overview", "status", "coverage", "bmm"]),
    )
    .await?;
    tx.commit().await?;
    tracing::info!(generation=g,branch_status=%validated.status,"local reconstruction validated and promoted");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn little_endian_work_is_exact() {
        assert_eq!(
            work(&json!("01".to_owned() + &"00".repeat(31))).unwrap(),
            "1"
        );
        assert_eq!(
            work(&json!("0001".to_owned() + &"00".repeat(30))).unwrap(),
            "256"
        );
        assert_eq!(
            work(&json!("ff".repeat(32))).unwrap(),
            "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
        assert!(work(&json!("ff")).is_err());
    }
}

#[cfg(test)]
mod scale_tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires verify-local's disposable million-event fixture"]
    async fn scale_incremental() -> Result<()> {
        ensure!(
            std::env::var("PULSE_TEST_COMPOSE_PROJECT")?.starts_with("drivechain-observatory-e2e-"),
            "isolated test project required"
        );
        let d: Uuid = std::env::var("PULSE_SCALE_DATASET")?.parse()?;
        ensure!(
            d.to_string() == "44444444-4444-4444-8444-444444444444",
            "scale fixture required"
        );
        let pool = sqlx::PgPool::connect(&std::env::var("PULSE_DATABASE_URL")?).await?;
        let mut conn = pool.acquire().await?;
        let before = state(&mut conn, d, 5).await?;
        let hash = format!("{:064x}", 10001);
        let parent = format!("{:064x}", 10000);
        let mut work = [0u8; 32];
        work[..8].copy_from_slice(&10001u64.to_le_bytes());
        let payload = json!({"monitor_event":{"Enforcer":{"event":{"Bip300BlockDelta":{"header":{"hash":hash,"previous_hash":parent,"height":10001,"cumulative_work":hex::encode(work),"block_work":"01".to_owned()+&"00".repeat(31),"timestamp":1790200000},"coinbase_txid":"aa".repeat(32),"coinbase_messages":[],"treasury_transitions":[],"confirmed_bmm_requests":[]}}}}});
        sqlx::query("INSERT INTO ingest.source_events(dataset_id,source_event_id,event_contract_version,observed_at,source_ingested_at,source,kind,block_hash,height,envelope,payload) VALUES($1,1000001,7,now(),now(),'enforcer','bip300_block_delta',decode($2,'hex'),10001,decode('00','hex'),$3)").bind(d).bind(&hash).bind(payload).execute(&mut *conn).await?;
        sqlx::query("INSERT INTO ingest.tip_observations(dataset_id,tip_observation_id,run_id,capture_seq,capture_method,tip_hash,tip_height,observed_at,source_ingested_at) VALUES($1,2,$2,10004,'poll',decode($3,'hex'),10001,now(),now())").bind(d).bind(before.run_id).bind(&hash).execute(&mut *conn).await?;
        sqlx::query("INSERT INTO ingest.event_observations(dataset_id,observation_id,run_id,capture_seq,capture_method,source_event_id,observed_at,source_ingested_at) VALUES($1,10002,$2,10003,'live',1000001,now(),now())").bind(d).bind(before.run_id).execute(&mut *conn).await?;
        let cut = Cut {
            events: 1000001,
            observations: 10002,
            tips: 2,
            coverage: 0,
            run: before.run_id.context("fixture run")?,
        };
        let start = std::time::Instant::now();
        ensure!(
            advance(&mut conn, d, 5, &cut, 500, 20, true).await?,
            "incremental projection completes"
        );
        ensure!(
            super::super::protocol::advance(&mut conn, d, 5, &cut, 500, 20, true).await?,
            "incremental protocol reconstruction completes"
        );
        let elapsed = start.elapsed();
        ensure!(
            elapsed.as_secs() < 5,
            "incremental processing exceeded bounded budget"
        );
        let after = state(&mut conn, d, 5).await?;
        ensure!(
            after.tip_hash == Some(hash) && after.status == "resolved",
            "incremental tip resolved"
        );
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM projection.chain_members WHERE dataset_id=$1 AND generation=5",
        )
        .bind(d)
        .fetch_one(&mut *conn)
        .await?;
        ensure!(count == 10001, "shared prefix preserved");
        println!(
            "Incremental extension on 1,000,000-event fixture: {} ms",
            elapsed.as_millis()
        );
        Ok(())
    }
}
