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
    let mut metrics = vec![];
    for &slot in slots {
        let mut cells = vec![];
        let mut covered = 0;
        let mut present = 0;

        for b in &blocks {
            let hash: String = b.get("hash");
            let height: i32 = b.get("height");
            let sample = by_cell.get(&(slot, hash.clone()));
            let conflict = sample.is_some_and(|xs| xs.iter().any(|x| x.0 != xs[0].0));
            let (state, commitment, evidence) = if matches!(
                c.state.as_str(),
                "catching_up" | "awaiting_data" | "ambiguous"
            ) || conflict
            {
                ("unknown_eligibility", None, vec![])
            } else if let Some(xs) = sample {
                covered += 1;
                if xs[0].0.is_some() {
                    present += 1;
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
            } else {
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
        let streak = cells.iter().take_while(|c| c.state == "present").count() as u32;
        metrics.push(BmmSlotMetrics {
            slot,
            present,
            covered,
            eligible: None,
            rate: None,
            coverage: None,
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
