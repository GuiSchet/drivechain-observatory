use super::*;
use protocol::BmmQuery;
use std::collections::BTreeMap;

pub async fn metrics(pool: &PgPool, q: BmmQuery) -> Result<BmmMetricsResponse, StorageError> {
    let window = q.window_blocks.unwrap_or(144);
    if !matches!(window, 24 | 144 | 1008)
        || q.slot.is_some_and(|s| !(0..=255).contains(&s))
        || q.start_slot.is_some_and(|s| !(0..=255).contains(&s))
    {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let c = protocol::context(&mut tx, &d).await?;
    let g = c.meta.projection_generation;
    let through = c
        .source_event_cut
        .as_ref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let slots: Vec<i16> = if let Some(slot) = q.slot {
        vec![slot]
    } else {
        sqlx::query_scalar("SELECT s::smallint FROM generate_series($3::integer,255) s WHERE EXISTS(SELECT 1 FROM projection.protocol_facts f WHERE f.dataset_id=$1 AND f.generation=$2 AND f.slot=s AND f.event_id<=$4) ORDER BY s LIMIT 17").bind(d.dataset_id).bind(g).bind(i32::from(q.start_slot.unwrap_or(0))).bind(through).fetch_all(&mut *tx).await?
    };
    let next_slot = slots.get(16).copied();
    let slots = &slots[..slots.len().min(16)];
    let start = c
        .anchor_height
        .unwrap_or(0)
        .saturating_sub(i32::try_from(window).map_err(|_| StorageError::InvalidQuery)? - 1)
        .max(d.activation_height);
    let blocks=sqlx::query("SELECT hash,height FROM projection.chain_members WHERE dataset_id=$1 AND generation=$2 AND height BETWEEN $3 AND $4 ORDER BY height DESC LIMIT 1008").bind(d.dataset_id).bind(g).bind(start).bind(c.anchor_height.unwrap_or(-1)).fetch_all(&mut *tx).await?;
    let hashes: Vec<String> = blocks.iter().map(|r| r.get("hash")).collect();
    let facts=sqlx::query("SELECT event_id,ordinal,slot,hash,data FROM projection.protocol_facts WHERE dataset_id=$1 AND generation=$2 AND kind='slot_block' AND error IS NULL AND slot=ANY($3) AND hash=ANY($4) AND event_id<=$5 ORDER BY event_id")
        .bind(d.dataset_id).bind(g).bind(slots).bind(&hashes).bind(through).fetch_all(&mut *tx).await?;
    type Samples = Vec<(Option<String>, ProtocolEvidence)>;
    let mut by_cell: BTreeMap<(i16, String), Samples> = BTreeMap::new();
    for f in facts {
        let data: Value = f.get("data");
        by_cell
            .entry((f.get("slot"), f.get("hash")))
            .or_default()
            .push((
                data["bmm_commitment"].as_str().map(str::to_owned),
                ProtocolEvidence {
                    event_id: f.get::<i64, _>("event_id").to_string(),
                    ordinal: f.get("ordinal"),
                    observation_id: None,
                },
            ));
    }
    let build = c
        .build_id
        .as_ref()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    let engine: Value =
        sqlx::query_scalar("SELECT state FROM ops.protocol_builds WHERE build_id=$1")
            .bind(build)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(Value::Null);
    // A positive snapshot carries its activation height. Extend its interval
    // to the current anchor only if uninterrupted replay still knows it active.
    let instances=sqlx::query("SELECT DISTINCT ON(p.entity_key) p.entity_key,p.slot,p.data,p.height FROM projection.protocol_history p JOIN projection.chain_members m ON m.dataset_id=p.dataset_id AND m.generation=p.generation AND m.hash=p.hash WHERE p.dataset_id=$1 AND p.generation=$2 AND p.kind='instance' AND p.slot=ANY($3) AND p.build_id<=$4 AND p.data->>'status' IN ('active','replaced') AND NOT EXISTS(SELECT 1 FROM projection.protocol_block_versions v WHERE v.dataset_id=p.dataset_id AND v.generation=p.generation AND v.hash=p.hash AND v.build_id>p.build_id AND v.build_id<=$4) ORDER BY p.entity_key,p.height DESC,p.ordinal DESC LIMIT 4096")
        .bind(d.dataset_id).bind(g).bind(slots).bind(build).fetch_all(&mut *tx).await?;
    let mut intervals: BTreeMap<i16, Vec<(i32, i32)>> = BTreeMap::new();
    for r in instances {
        let data: Value = r.get("data");
        let slot: i16 = r.get("slot");
        let Some(activation) = data
            .pointer("/sidechain/activation_height")
            .and_then(Value::as_i64)
            .and_then(|n| i32::try_from(n).ok())
        else {
            continue;
        };
        let a = &engine["active"][slot.to_string()];
        let is_current = a["description_hash"] == data["sidechain"]["description_hash"]
            && a["activation_height"] == data["sidechain"]["activation_height"];
        let end = if is_current {
            c.anchor_height.unwrap_or(r.get("height"))
        } else {
            data["ended_height"]
                .as_i64()
                .and_then(|v| i32::try_from(v).ok())
                .map(|h| h - 1)
                .unwrap_or_else(|| r.get("height"))
        };
        intervals.entry(slot).or_default().push((activation, end));
    }
    let lifecycle_complete:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM projection.chain_coverage v JOIN ingest.coverage_revisions r ON r.dataset_id=v.dataset_id AND r.revision_id=v.source_revision WHERE v.dataset_id=$1 AND v.generation=$2 AND r.stream='bip300_delta' AND v.result->>'status'='verified' AND (v.result->>'verified_from_height')::integer=$3 AND (v.result->>'verified_through_height')::integer>=$4 AND v.result->>'branch_revision'=$5) AND NOT EXISTS(SELECT 1 FROM projection.protocol_facts f WHERE f.dataset_id=$1 AND f.generation=$2 AND f.event_id<=$6 AND f.error IS NOT NULL AND f.family IN ('protocol','proposals','sidechains'))")
        .bind(d.dataset_id).bind(g).bind(d.activation_height).bind(c.anchor_height).bind(&c.branch.revision).bind(through).fetch_one(&mut *tx).await?;
    let mut metrics = vec![];
    for &slot in slots {
        let mut cells = vec![];
        let mut covered = 0;
        let mut present = 0;
        let mut eligible = 0;
        let mut unknown = false;
        for b in &blocks {
            let hash: String = b.get("hash");
            let height: i32 = b.get("height");
            let known_active = intervals
                .get(&slot)
                .is_some_and(|xs| xs.iter().any(|(a, z)| (*a..=*z).contains(&height)));
            let sample = by_cell.get(&(slot, hash.clone()));
            let conflict = sample.is_some_and(|xs| xs.iter().any(|x| x.0 != xs[0].0));
            let (state, commitment, evidence) = if matches!(
                c.state.as_str(),
                "catching_up" | "awaiting_data" | "ambiguous"
            ) || conflict
            {
                unknown = true;
                ("unknown_eligibility", None, vec![])
            } else if let Some(xs) = sample {
                // The observed slot stream proves presence/absence. Without
                // a known instance interval it does not prove eligibility.
                if !known_active {
                    unknown = true;
                } else {
                    eligible += 1;
                    covered += 1;
                    if xs[0].0.is_some() {
                        present += 1;
                    }
                }
                (
                    if xs[0].0.is_some() {
                        "present"
                    } else {
                        "observed_absent"
                    },
                    xs[0].0.clone(),
                    xs.iter().map(|x| x.1.clone()).collect(),
                )
            } else if known_active {
                eligible += 1;
                ("uncovered", None, vec![])
            } else if lifecycle_complete && c.semantics_supported {
                ("inactive", None, vec![])
            } else {
                unknown = true;
                ("unknown_eligibility", None, vec![])
            };
            cells.push(BmmCell {
                hash: Some(hash),
                height,
                state: state.into(),
                commitment,
                evidence,
            });
        }
        if let Some(anchor) = c.anchor_height {
            for height in start..=anchor {
                if !cells.iter().any(|c| c.height == height) {
                    unknown = true;
                    cells.push(BmmCell {
                        hash: None,
                        height,
                        state: "unknown_eligibility".into(),
                        commitment: None,
                        evidence: vec![],
                    });
                }
            }
        }
        cells.sort_by_key(|c| std::cmp::Reverse(c.height));
        let streak = cells
            .iter()
            .take_while(|c| {
                c.state == "present"
                    && intervals
                        .get(&slot)
                        .is_some_and(|xs| xs.iter().any(|(a, z)| (*a..=*z).contains(&c.height)))
            })
            .count() as u32;
        metrics.push(BmmSlotMetrics {
            slot,
            present,
            covered,
            eligible: (!unknown).then_some(eligible),
            rate: (covered > 0).then(|| f64::from(present) / f64::from(covered)),
            coverage: (!unknown && eligible > 0).then(|| f64::from(covered) / f64::from(eligible)),
            consecutive_present: streak,
            cells,
        });
    }
    tx.commit().await?;
    Ok(BmmMetricsResponse {
        context: c,
        window_blocks: window,
        slots: metrics,
        next_slot,
    })
}
