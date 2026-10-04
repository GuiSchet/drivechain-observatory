//! Immutable normalized facts and resumable, atomically published state builds.
use super::{SourceEvent, append_update, chain::Cut};
use anyhow::{Context, Result};
use pulse_source::{
    ChainInfo,
    normalize::{self, Anchor, Entry},
    replay::{Evidence, Record, State},
};
use serde_json::{Value, json};
use sqlx::{Connection, PgConnection, Row};
use uuid::Uuid;

// Evaluate snapshot diagnostics once at publication, while this build's branch
// and cut are still fixed. Readers must not reevaluate them against the mutable
// membership of a subsequent build or reorg.
async fn observation_errors(
    conn: &mut PgConnection,
    d: Uuid,
    generation: i64,
    cut: &Cut,
) -> Result<std::collections::BTreeMap<String, String>> {
    let errors:Vec<(String,i64)>=sqlx::query_as("SELECT f.family,min(f.event_id) FROM projection.protocol_facts f
        JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id
        JOIN projection.chain_members m ON m.dataset_id=f.dataset_id AND m.generation=f.generation AND m.hash=f.hash
        WHERE f.dataset_id=$1 AND f.generation=$2 AND f.ordinal=0
        AND (f.error IS NOT NULL OR (e.kind='bmm_requests' AND e.interpretation_error IS NOT NULL))
        AND e.kind IN ('active_sidechains','sidechain_proposals','ctip','withdrawal_bundle_proposals','bmm_requests')
        AND f.event_id<=$3 AND EXISTS(
            SELECT 1 FROM ingest.event_observations o JOIN ingest.extractor_runs r ON r.run_id=o.run_id
            JOIN ingest.snapshot_groups g ON g.dataset_id=o.dataset_id AND g.run_id=o.run_id AND g.snapshot_group_id=o.snapshot_group_id
            WHERE o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id AND o.observation_id<=$4
            AND r.enforcer_commit=$5 AND g.consistency='stable' AND g.revision_before IS NOT NULL AND g.revision_before=g.revision_after AND g.tip_before_hash=g.tip_after_hash
            AND g.tip_before_height=g.tip_after_height AND encode(g.tip_before_hash,'hex')=f.hash AND g.tip_before_height=f.height
        ) GROUP BY f.family")
        .bind(d).bind(generation).bind(cut.events).bind(cut.observations).bind(pulse_source::ENFORCER_COMMIT).fetch_all(conn).await?;
    Ok(errors
        .into_iter()
        .map(|(family, id)| (family, id.to_string()))
        .collect())
}

async fn normalize_page(
    conn: &mut PgConnection,
    d: Uuid,
    g: i64,
    through: i64,
    limit: i64,
) -> Result<bool> {
    sqlx::query(
        "INSERT INTO ops.protocol_jobs(dataset_id,generation) VALUES($1,$2) ON CONFLICT DO NOTHING",
    )
    .bind(d)
    .bind(g)
    .execute(&mut *conn)
    .await?;
    let after: i64 = sqlx::query_scalar(
        "SELECT event_cursor FROM ops.protocol_jobs WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(d)
    .bind(g)
    .fetch_one(&mut *conn)
    .await?;
    let events=sqlx::query_as::<_,SourceEvent>("SELECT source_event_id AS id,dataset_id,event_contract_version,observed_at,source_ingested_at AS ingested_at,source,kind,sidechain,sidechain_instance_id,block_hash,height,envelope,envelope_sha256,fact_sha256,payload FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id>$2 AND source_event_id<=$3 ORDER BY source_event_id LIMIT $4")
        .bind(d).bind(after).bind(through).bind(limit).fetch_all(&mut *conn).await?;
    let mut tx = conn.begin().await?;
    let mut dirty: Option<i32> = None;
    let mut rows = vec![];
    for e in &events {
        if e.event_contract_version != 7 {
            continue;
        }
        let hash = e.block_hash.as_ref().map(hex::encode);
        let entries = normalize::normalize(
            &e.kind,
            &e.payload,
            Anchor {
                hash: hash.as_deref(),
                height: e.height.and_then(|h| h.try_into().ok()),
                slot: e.sidechain.and_then(|s| s.try_into().ok()),
            },
        );
        // Parameter changes are assessed from reviewed occurrences below.
        if !matches!(
            e.kind.as_str(),
            "chain_info"
                | "bmm_requests"
                | "chain_tip"
                | "block_disconnected"
                | "mainchain_transition"
                | "confirmed_bmm_fees"
        ) {
            dirty = match (dirty, e.height) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (None, b) => b,
                (a, None) => a,
            };
        }
        for n in entries {
            rows.push(json!({"event_id":e.id,"ordinal":n.ordinal,"family":n.family,"kind":n.kind,"entity_key":n.key,"slot":n.slot,"hash":hash,"height":e.height,"search_terms":n.search,"data":n.data,"error":n.error}));
        }
    }
    sqlx::query("INSERT INTO projection.protocol_facts SELECT $1,$2,r.event_id,r.ordinal,r.family,r.kind,r.entity_key,r.slot,r.hash,r.height,r.search_terms,coalesce(r.data,'null'::jsonb),r.error FROM jsonb_to_recordset($3) AS r(event_id bigint,ordinal integer,family text,kind text,entity_key text,slot smallint,hash text,height integer,search_terms text[],data jsonb,error text) ON CONFLICT DO NOTHING")
        .bind(d).bind(g).bind(json!(rows)).execute(&mut *tx).await?;
    let complete = events.len() < usize::try_from(limit)?;
    let next = if complete {
        through
    } else {
        events.last().context("nonempty page")?.id
    };
    sqlx::query("UPDATE ops.protocol_jobs SET event_cursor=$3,dirty_height=least(dirty_height,$4) WHERE dataset_id=$1 AND generation=$2").bind(d).bind(g).bind(next).bind(dirty).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(complete)
}
fn record(row: &sqlx::postgres::PgRow) -> Result<Record> {
    Ok(Record {
        evidence: Evidence {
            event_id: row.try_get::<i64, _>("event_id")?.to_string(),
            ordinal: row.try_get("ordinal")?,
            observation_id: row
                .try_get::<Option<i64>, _>("observation_id")?
                .map(|v| v.to_string()),
        },
        entry: Entry {
            ordinal: row.try_get("ordinal")?,
            family: row.try_get("family")?,
            kind: row.try_get("kind")?,
            key: row.try_get("entity_key")?,
            slot: row
                .try_get::<Option<i16>, _>("slot")?
                .map(u8::try_from)
                .transpose()?,
            search: row.try_get("search_terms")?,
            data: row.try_get("data")?,
            error: row.try_get("error")?,
        },
    })
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
    for _ in 0..pages {
        if normalize_page(conn, d, g, cut.events, limit).await? {
            break;
        }
    }
    let normalized: i64 = sqlx::query_scalar(
        "SELECT event_cursor FROM ops.protocol_jobs WHERE dataset_id=$1 AND generation=$2",
    )
    .bind(d)
    .bind(g)
    .fetch_one(&mut *conn)
    .await?;
    if normalized < cut.events {
        return Ok(false);
    }
    let branch = super::chain::state(conn, d, g).await?;
    let current=sqlx::query("SELECT b.* FROM projection.protocol_head h JOIN ops.protocol_builds b USING(build_id) WHERE h.dataset_id=$1 AND h.generation=$2").bind(d).bind(g).fetch_optional(&mut *conn).await?;
    if current.as_ref().is_some_and(|r| {
        r.get::<Value, _>("cut") == json!(cut)
            && r.get::<String, _>("branch_revision") == branch.revision
    }) {
        return Ok(true);
    }
    let pending=sqlx::query("SELECT * FROM ops.protocol_builds WHERE dataset_id=$1 AND generation=$2 AND NOT complete ORDER BY build_id DESC LIMIT 1").bind(d).bind(g).fetch_optional(&mut *conn).await?;
    let (build, mut at, mut state) = if let Some(row) = pending {
        anyhow::ensure!(
            row.get::<Value, _>("cut") == json!(cut),
            "protocol rebuild cut changed before completion"
        );
        (
            row.get::<i64, _>("build_id"),
            row.get::<i32, _>("cursor_height"),
            serde_json::from_value::<State>(row.get("state"))?,
        )
    } else {
        let after_observations = current
            .as_ref()
            .map(|r| {
                r.get::<Value, _>("cut")["observations"]
                    .as_i64()
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        let mut dirty:Option<i32>=sqlx::query_scalar("SELECT least(j.dirty_height,(SELECT min(e.height) FROM ingest.event_observations o JOIN ingest.source_events e ON e.dataset_id=o.dataset_id AND e.source_event_id=o.source_event_id JOIN ingest.extractor_runs r ON r.run_id=o.run_id WHERE o.dataset_id=$1 AND o.observation_id>$3 AND o.observation_id<=$4 AND r.enforcer_commit=$5 AND (
            e.kind IN ('active_sidechains','sidechain_proposals','ctip','withdrawal_bundle_proposals') OR
            (e.kind IN ('block_connected','bip300_block_delta') AND NOT EXISTS(SELECT 1 FROM ingest.event_observations prior JOIN ingest.extractor_runs pr ON pr.run_id=prior.run_id WHERE prior.dataset_id=o.dataset_id AND prior.source_event_id=o.source_event_id AND prior.observation_id<=$3 AND pr.enforcer_commit=$5))
        ))) FROM ops.protocol_jobs j WHERE j.dataset_id=$1 AND j.generation=$2")
            .bind(d).bind(g).bind(after_observations).bind(cut.observations).bind(pulse_source::ENFORCER_COMMIT).fetch_one(&mut *conn).await?;
        let mut state = State::default();
        let mut base = -1;
        if let Some(row) = &current {
            let old: State = serde_json::from_value(row.get("state"))?;
            let belongs:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND hash=$3)").bind(d).bind(g).bind(&old.hash).fetch_one(&mut *conn).await?;
            if belongs
                && dirty.is_none_or(|h| old.height.is_some_and(|old| i64::from(h) > i64::from(old)))
            {
                base = old.height.map(i32::try_from).transpose()?.unwrap_or(-1);
                state = old;
            } else if !belongs {
                dirty = Some(
                    dirty
                        .unwrap_or(i32::MAX)
                        .min(old.height.map(i32::try_from).transpose()?.unwrap_or(0)),
                );
            }
        }
        if base < 0 {
            let checkpoint=sqlx::query("SELECT c.* FROM projection.protocol_checkpoints c JOIN projection.chain_members m ON m.dataset_id=c.dataset_id AND m.generation=c.generation AND m.hash=c.hash WHERE c.dataset_id=$1 AND c.generation=$2 AND c.height<coalesce($3,0) AND c.build_id<=$4 AND EXISTS(SELECT 1 FROM ops.protocol_builds b WHERE b.build_id=c.build_id AND b.complete) AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.dataset_id=c.dataset_id AND v.generation=c.generation AND v.height<=c.height AND v.build_id>c.build_id AND v.build_id<=$4) ORDER BY c.height DESC,c.build_id DESC LIMIT 1")
                .bind(d).bind(g).bind(dirty).bind(current.as_ref().map(|r|r.get::<i64,_>("build_id")).unwrap_or(0)).fetch_optional(&mut *conn).await?;
            if let Some(row) = checkpoint {
                base = row.get("height");
                state = serde_json::from_value(row.get("state"))?;
            }
        }
        let supported: bool = sqlx::query_scalar(
            "SELECT coalesce(enforcer_commit=$2,false) FROM ingest.extractor_runs WHERE run_id=$1",
        )
        .bind(cut.run)
        .bind(pulse_source::ENFORCER_COMMIT)
        .fetch_one(&mut *conn)
        .await?;
        // Constants are process-invariant for the reviewed build and dataset.
        // Prefer current-run evidence; a restart before its startup snapshot can
        // reuse verified prior-run constants, but never an unreviewed build.
        let parameters=sqlx::query("SELECT f.*,o.observation_id FROM projection.protocol_facts f JOIN ingest.event_observations o ON o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id JOIN ingest.extractor_runs r ON r.run_id=o.run_id JOIN ingest.source_events e ON e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id WHERE f.dataset_id=$1 AND f.generation=$2 AND e.kind='chain_info' AND f.ordinal=0 AND r.enforcer_commit=$3 AND o.observation_id<=$4 AND f.event_id<=$5 ORDER BY (o.run_id=$6) DESC,r.started_at DESC,o.capture_seq DESC")
            .bind(d).bind(g).bind(pulse_source::ENFORCER_COMMIT).bind(cut.observations).bind(cut.events).bind(cut.run).fetch_all(&mut *conn).await?;
        let latest = parameters.first().map(record).transpose()?;
        let info = latest
            .as_ref()
            .filter(|r| r.entry.error.is_none())
            .map(|r| serde_json::from_value::<ChainInfo>(r.entry.data.clone()))
            .transpose()?;
        let constants = info.as_ref().and_then(|v| v.bip300_constants.clone());
        let activation:i32=sqlx::query_scalar("SELECT activation_height FROM ingest.datasets WHERE dataset_id=$1 AND network_id='betanet'").bind(d).fetch_one(&mut *conn).await?;
        let mut parameter_error = None;
        for row in &parameters {
            let r = record(row)?;
            let valid = r.entry.error.is_none()
                && info.as_ref().is_some_and(|i| {
                    i.network == 2
                        && i.raw_network == 2
                        && r.entry.data == latest.as_ref().expect("parameters present").entry.data
                        && i.bip300_constants.as_ref().is_some_and(|c| {
                            i64::from(c.activation_height) == i64::from(activation)
                        })
                });
            if !valid {
                parameter_error = Some(
                    parameter_error.map_or(row.get::<i64, _>("event_id"), |old: i64| {
                        old.min(row.get("event_id"))
                    }),
                );
            }
        }
        let semantics_issue = if !supported {
            Some("The current enforcer build has not been reviewed.".to_owned())
        } else if latest.is_none() {
            Some(
                "Awaiting verified chain parameters for this dataset and enforcer build."
                    .to_owned(),
            )
        } else if parameter_error.is_some() {
            Some("Reviewed chain parameters are invalid, contradictory, or incompatible with Betanet activation.".to_owned())
        } else {
            None
        };
        let supported = supported && constants.is_some() && parameter_error.is_none();
        if state.constants != constants || state.semantics_supported != supported {
            state = State::default();
            base = -1;
        }
        state.constants = constants;
        state.semantics_supported = supported;
        state.semantics_issue = semantics_issue;
        state.parameters_evidence = latest.map(|r| r.evidence);
        state.first_errors.remove("parameters");
        if let Some(event) = parameter_error {
            state
                .first_errors
                .insert("parameters".into(), event.to_string());
        }
        let build:i64=sqlx::query_scalar("INSERT INTO ops.protocol_builds(dataset_id,generation,cut,branch_revision,cursor_height,state) VALUES($1,$2,$3,$4,$5,$6) RETURNING build_id").bind(d).bind(g).bind(json!(cut)).bind(&branch.revision).bind(base).bind(json!(state)).fetch_one(&mut *conn).await?;
        (build, base, state)
    };
    for _ in 0..pages {
        let headers=sqlx::query("SELECT h.hash,h.parent,h.height FROM projection.chain_members m JOIN projection.chain_headers h USING(dataset_id,generation,hash) WHERE m.dataset_id=$1 AND m.generation=$2 AND m.height>$3 ORDER BY m.height LIMIT $4")
            .bind(d).bind(g).bind(at).bind(limit.min(200)).fetch_all(&mut *conn).await?;
        let complete = headers.len() < usize::try_from(limit.min(200))?;
        let mut tx = conn.begin().await?;
        for h in &headers {
            let hash: String = h.get("hash");
            let height: i32 = h.get("height");
            let parent: String = h.get("parent");
            let rows=sqlx::query("SELECT f.*,NULL::bigint AS observation_id,EXISTS(SELECT 1 FROM ingest.event_observations o JOIN ingest.extractor_runs r ON r.run_id=o.run_id WHERE o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id AND o.observation_id<=$5 AND r.enforcer_commit=$6) AS supported FROM projection.protocol_facts f WHERE dataset_id=$1 AND generation=$2 AND hash=$3 AND event_id<=$4 AND EXISTS(SELECT 1 FROM ingest.source_events e WHERE e.dataset_id=f.dataset_id AND e.source_event_id=f.event_id AND e.kind IN ('bip300_block_delta','block_connected')) ORDER BY event_id,ordinal")
                .bind(d).bind(g).bind(&hash).bind(cut.events).bind(cut.observations).bind(pulse_source::ENFORCER_COMMIT).fetch_all(&mut *tx).await?;
            let mut records: Vec<Record> = rows
                .iter()
                .filter(|r| r.get::<bool, _>("supported"))
                .map(record)
                .collect::<Result<_>>()?;
            let global = records.iter().any(|r| r.entry.kind == "block_delta");
            let (prepared, corroboration) = pulse_source::replay::reconcile(records);
            records = prepared;
            let mut changes =
                state.block(&hash, &parent, u32::try_from(height)?, &records, global)?;
            for c in &mut changes {
                if c.kind == "deposit" {
                    for r in &corroboration {
                        if r.entry.key == c.key
                            && matches!(r.entry.kind.as_str(), "deposit" | "treasury_transition")
                            && !c.evidence.contains(&r.evidence)
                        {
                            c.evidence.push(r.evidence.clone());
                        }
                    }
                }
            }
            let snapshots=sqlx::query("SELECT DISTINCT ON(f.kind,f.slot) f.*,o.observation_id FROM projection.protocol_facts f JOIN ingest.event_observations o ON o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id JOIN ingest.snapshot_groups s ON s.snapshot_group_id=o.snapshot_group_id AND s.dataset_id=o.dataset_id AND s.run_id=o.run_id JOIN ingest.extractor_runs r ON r.run_id=o.run_id WHERE f.dataset_id=$1 AND f.generation=$2 AND f.hash=$3 AND f.event_id<=$4 AND o.observation_id<=$5 AND f.kind IN ('active_set','proposal_set','ctip_snapshot','bundle_set') AND f.error IS NULL AND s.consistency='stable' AND s.revision_before IS NOT NULL AND s.revision_before=s.revision_after AND s.tip_before_hash=s.tip_after_hash AND s.tip_before_height=s.tip_after_height AND encode(s.tip_before_hash,'hex')=f.hash AND s.tip_before_height=f.height AND r.enforcer_commit=$6 ORDER BY f.kind,f.slot,r.started_at DESC,o.capture_seq DESC")
                .bind(d).bind(g).bind(&hash).bind(cut.events).bind(cut.observations).bind(pulse_source::ENFORCER_COMMIT).fetch_all(&mut *tx).await?;
            let mut snapshots: Vec<Record> = snapshots.iter().map(record).collect::<Result<_>>()?;
            snapshots.sort_by_key(|r| match r.entry.kind.as_str() {
                "active_set" => 0,
                "proposal_set" => 1,
                _ => 2,
            });
            for r in snapshots {
                changes.extend(state.snapshot(&r)?);
            }
            sqlx::query("INSERT INTO projection.protocol_block_versions VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING").bind(d).bind(g).bind(&hash).bind(height).bind(build).execute(&mut *tx).await?;
            for c in &changes {
                if matches!(c.kind.as_str(), "proposal" | "bundle") && !c.key.contains(":observed:")
                {
                    let value = if c.kind == "proposal" {
                        &c.data["proposal"]
                    } else {
                        &c.data["bundle"]
                    };
                    let identifier = if c.kind == "proposal" {
                        value["description_hash"].as_str()
                    } else {
                        value["m6id"].as_str().or_else(|| c.data["m6id"].as_str())
                    };
                    let proposed = value["proposal_height"].as_u64().or_else(|| {
                        c.data
                            .pointer("/transition/proposal_height")
                            .and_then(Value::as_u64)
                    });
                    if let (Some(slot), Some(id), Some(proposed)) = (c.slot, identifier, proposed) {
                        sqlx::query("INSERT INTO projection.protocol_aliases VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING").bind(d).bind(g).bind(&c.kind).bind(format!("{slot}:{id}:observed:{proposed}")).bind(&c.key).bind(&hash).execute(&mut *tx).await?;
                    }
                }
            }
            let changes:Vec<_>=changes.iter().enumerate().map(|(ordinal,c)|json!({"ordinal":ordinal,"kind":c.kind,"entity_key":c.key,"slot":c.slot,"data":c.data,"quality":c.quality,"evidence":c.evidence,"issue":c.issue})).collect();
            sqlx::query("INSERT INTO projection.protocol_history SELECT $1,$2,$3,$4,$5,r.* FROM jsonb_to_recordset($6) AS r(ordinal integer,kind text,entity_key text,slot smallint,data jsonb,quality text,evidence jsonb,issue text) ON CONFLICT DO NOTHING")
                .bind(d).bind(g).bind(build).bind(&hash).bind(height).bind(json!(changes)).execute(&mut *tx).await?;
            if height % 1000 == 0 {
                sqlx::query("INSERT INTO projection.protocol_checkpoints VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING").bind(d).bind(g).bind(build).bind(&hash).bind(height).bind(json!(state)).execute(&mut *tx).await?;
            }
            at = height;
        }
        if complete {
            state.observation_errors = observation_errors(&mut tx, d, g, cut).await?;
        }
        sqlx::query("UPDATE ops.protocol_builds SET cursor_height=$2,state=$3,complete=$4 WHERE build_id=$1").bind(build).bind(at).bind(json!(state)).bind(complete).execute(&mut *tx).await?;
        if complete {
            sqlx::query("INSERT INTO projection.protocol_head VALUES($1,$2,$3) ON CONFLICT(dataset_id,generation) DO UPDATE SET build_id=excluded.build_id").bind(d).bind(g).bind(build).execute(&mut *tx).await?;
            sqlx::query("UPDATE ops.protocol_jobs SET dirty_height=NULL WHERE dataset_id=$1 AND generation=$2").bind(d).bind(g).execute(&mut *tx).await?;
            if publish {
                append_update(
                    &mut tx,
                    d,
                    Some(cut.events),
                    json!([
                        "overview",
                        "sidechains",
                        "proposals",
                        "treasury",
                        "bundles",
                        "bmm",
                        "events",
                        "activity",
                        "status",
                        "coverage"
                    ]),
                )
                .await?;
                // Activity is eligible only for a new live extension while the
                // previous state was already following. Backfill never pulses.
                let following:bool=sqlx::query_scalar("SELECT sync_mode='following' AND source_reachable FROM ops.source_status WHERE dataset_id=$1").bind(d).fetch_one(&mut *tx).await?;
                let previous = current.as_ref().map(|r| r.get::<Value, _>("state"));
                let old_height = previous.as_ref().and_then(|v| v["height"].as_u64());
                let same_run = current
                    .as_ref()
                    .is_some_and(|r| r.get::<Value, _>("cut")["run"] == json!(cut.run));
                let parent_matches:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_headers WHERE dataset_id=$1 AND generation=$2 AND hash=$3 AND parent=$4)").bind(d).bind(g).bind(&state.hash).bind(previous.as_ref().and_then(|v|v["hash"].as_str())).fetch_one(&mut *tx).await?;
                let fresh_live:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ingest.event_observations o JOIN ingest.source_events e ON e.dataset_id=o.dataset_id AND e.source_event_id=o.source_event_id WHERE o.dataset_id=$1 AND o.run_id=$2 AND o.observation_id<=$3 AND o.capture_method='live' AND o.observed_at BETWEEN now()-interval '60 seconds' AND now()+interval '5 seconds' AND encode(e.block_hash,'hex')=$4 AND e.kind IN ('block_connected','bip300_block_delta'))").bind(d).bind(cut.run).bind(cut.observations).bind(&state.hash).fetch_one(&mut *tx).await?;
                let eligible = following
                    && fresh_live
                    && same_run
                    && parent_matches
                    && !branch.processing
                    && branch.status != "ambiguous"
                    && old_height
                        .is_some_and(|h| state.height.is_some_and(|n| u64::from(n) == h + 1));
                if eligible {
                    let mut activity = vec![
                        json!({"kind":"block_observed","hash":state.hash,"height":state.height,"animation_eligible":true}),
                    ];
                    let changes=sqlx::query("SELECT kind,slot,data,evidence FROM projection.protocol_history WHERE dataset_id=$1 AND generation=$2 AND build_id=$3 AND hash=$4 AND kind IN ('deposit','bundle','proposal','instance','bmm_commitment','bmm_confirmation') ORDER BY ordinal LIMIT 100").bind(d).bind(g).bind(build).bind(&state.hash).fetch_all(&mut *tx).await?;
                    for r in changes {
                        let data: Value = r.get("data");
                        activity.push(json!({"kind":r.get::<String,_>("kind"),"slot":r.get::<Option<i16>,_>("slot"),"status":data["status"],"hash":state.hash,"height":state.height,"evidence":r.get::<Value,_>("evidence"),"animation_eligible":true}));
                    }
                    let activity = json!(activity);
                    sqlx::query("UPDATE ops.pulse_updates SET activity=$2 WHERE revision=(SELECT max(revision) FROM ops.pulse_updates WHERE dataset_id=$1)").bind(d).bind(activity).execute(&mut *tx).await?;
                }
            }
        }
        tx.commit().await?;
        if complete {
            return Ok(true);
        }
    }
    Ok(false)
}
