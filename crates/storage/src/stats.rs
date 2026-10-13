//! Figures derived from one sidechain's records, and the L1 block pace from the
//! selected chain's headers.
use super::*;
use dataset::{Bid, records};
use protocol::{ProtocolQuery, collect};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use utoipa::IntoParams;

const BMM_WINDOWS: [u32; 3] = [24, 144, 1008];
/// Blocks over which `rate_recent` measures the change in votes.
const RECENT_BLOCKS: i64 = 144;

#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct StatsQuery {
    pub dataset: Option<Uuid>,
    /// Blocks in `series`: 144 (default) or 1008.
    pub window_blocks: Option<u32>,
}

fn sats(v: &Value) -> Option<u64> {
    match v {
        Value::String(s) => s.parse().ok(),
        Value::Number(n) => n.as_u64(),
        _ => None,
    }
}
fn int(v: &Value) -> Option<i64> {
    match v {
        Value::String(s) => s.parse().ok(),
        Value::Number(n) => n.as_i64(),
        _ => None,
    }
}
fn median(mut xs: Vec<u64>) -> Option<u64> {
    xs.sort_unstable();
    let n = xs.len();
    match n {
        0 => None,
        _ if n % 2 == 1 => Some(xs[n / 2]),
        _ => Some(xs[n / 2 - 1] / 2 + xs[n / 2] / 2 + (xs[n / 2 - 1] % 2 + xs[n / 2] % 2) / 2),
    }
}
fn tip_of(i: &ProtocolItem) -> Option<i64> {
    int(&i.data["observation_window"]["reference_tip_height"])
}
/// The id of a raw transaction: its double SHA-256, displayed reversed.
fn txid_of(raw_hex: &str) -> Option<String> {
    use sha2::{Digest, Sha256};
    let raw = hex::decode(raw_hex).ok()?;
    let mut id = Sha256::digest(Sha256::digest(&raw)).to_vec();
    id.reverse();
    Some(hex::encode(id))
}
fn reversed_hex(hex_text: &str) -> Option<String> {
    let mut bytes = hex::decode(hex_text).ok()?;
    bytes.reverse();
    Some(hex::encode(bytes))
}

pub async fn sidechain(
    pool: &PgPool,
    slot: i16,
    q: StatsQuery,
) -> Result<SidechainStats, StorageError> {
    let window = q.window_blocks.unwrap_or(144);
    if !(0..=255).contains(&slot) || !matches!(window, 144 | 1008) {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let c = protocol::context(&mut tx, &d).await?;
    let generated_at: DateTime<Utc> = sqlx::query_scalar("SELECT now()")
        .fetch_one(&mut *tx)
        .await?;
    let r = records(&mut tx, &c, slot, None, None).await?;
    // The latest reading of each bundle, to tell which are still pending.
    let (latest_bundles, bundles_cut) = collect(
        &mut tx,
        "withdrawal-bundles",
        &ProtocolQuery {
            slot: Some(slot),
            ..ProtocolQuery::default()
        },
        &c,
        1_000,
    )
    .await?;
    tx.commit().await?;
    let truncated = [
        r.instances.1,
        r.deposits.1,
        r.treasury.1,
        r.withdrawals.1,
        r.commitments.1,
        r.bids.1,
        bundles_cut,
    ]
    .contains(&true);
    let anchor = c.anchor_height;
    let instance = r
        .instances
        .0
        .iter()
        .find(|i| i.is_current == Some(true))
        .or_else(|| {
            r.instances
                .0
                .iter()
                .filter(|i| i.is_current != Some(false))
                .max_by_key(|i| int(&i.data["sidechain"]["activation_height"]))
        });
    let activation_height = instance
        .and_then(|i| int(&i.data["sidechain"]["activation_height"]))
        .and_then(|h| i32::try_from(h).ok());

    let deposits = deposit_stats(&r.deposits.0, generated_at);
    let treasury = treasury_stats(&r.treasury.0, &r.deposits.0, &r.withdrawals.0);
    let committed = commitments_by_height(&r.commitments.0);
    let bmm = bmm_stats(
        &committed,
        anchor,
        activation_height.max(Some(d.activation_height)),
    );
    let bids = bid_stats(&r.bids.0);
    let withdrawals = withdrawal_stats(&latest_bundles, &r.withdrawals.0, &r.constants, anchor);
    let series = series(&committed, &r.commitments.0, &r.bids.0, anchor, window);

    let mut notes = vec![
        "Block times are set by miners; periods measured with them are approximate.".to_owned(),
        "Bid figures count only bids the monitor saw before a block was mined; bids it missed, and fees paid outside L1, are not counted.".to_owned(),
        "A withdrawal's vote rate is a reading of the past, not a forecast: votes can go up or down by one per block.".to_owned(),
        "Treasury values after a paid withdrawal are known only when the monitor read that treasury output.".to_owned(),
    ];
    if matches!(
        c.state.as_str(),
        "catching_up" | "awaiting_data" | "ambiguous"
    ) {
        notes.push(format!(
            "The Observatory is {} right now; these figures may change once it settles.",
            c.state.replace('_', " ")
        ));
    }
    if truncated {
        notes.push("Some records were cut short, so counts are lower bounds.".to_owned());
    }
    Ok(SidechainStats {
        context: c,
        slot,
        generated_at,
        activation_height,
        deposits,
        treasury,
        bmm,
        bids,
        withdrawals,
        window_blocks: window,
        series,
        notes,
        truncated,
    })
}

fn deposit_stats(items: &[ProtocolItem], now: DateTime<Utc>) -> DepositStats {
    let values: Vec<u64> = items
        .iter()
        .filter_map(|i| sats(&i.data["value_sats"]))
        .collect();
    let within = |days: i64| {
        items
            .iter()
            .filter(|i| {
                i.block_time
                    .is_some_and(|t| t >= now - chrono::Duration::days(days))
            })
            .count() as u64
    };
    let newest = items.iter().max_by_key(|i| i.height);
    DepositStats {
        count: items.len() as u64,
        total_sats: values
            .iter()
            .map(|v| u128::from(*v))
            .sum::<u128>()
            .to_string(),
        median_sats: median(values.clone()).map(|v| v.to_string()),
        max_sats: values.iter().max().map(|v| v.to_string()),
        first_height: items.iter().filter_map(|i| i.height).min(),
        last_height: newest.and_then(|i| i.height),
        last_block_time: newest.and_then(|i| i.block_time),
        last_24h: within(1),
        last_7d: within(7),
        last_30d: within(30),
    }
}

/// Each deposit and paid withdrawal replaces the treasury output and raises its sequence by one.
fn treasury_stats(
    readings: &[ProtocolItem],
    deposits: &[ProtocolItem],
    withdrawals: &[ProtocolItem],
) -> TreasuryStats {
    let latest = readings.iter().max_by_key(|i| (tip_of(i), i.observed_at));
    let read: HashMap<u64, u64> = readings
        .iter()
        .filter_map(|i| {
            Some((
                sats(&i.data["ctip"]["sequence_number"])?,
                sats(&i.data["ctip"]["value_sats"])?,
            ))
        })
        .collect();
    struct Change {
        height: Option<i32>,
        sequence: Option<u64>,
        deposit: Option<u64>,
        txid: Option<String>,
    }
    let mut changes: Vec<Change> = deposits
        .iter()
        .map(|i| Change {
            height: i.height,
            sequence: sats(&i.data["sequence_number"]),
            deposit: sats(&i.data["value_sats"]),
            txid: i.data["outpoint"]["txid"].as_str().map(str::to_owned),
        })
        .chain(
            withdrawals
                .iter()
                .filter(|i| i.kind == "bundle_outcome")
                .filter_map(|i| {
                    let paid = &i.data["state"]["Succeeded"];
                    paid.is_object().then(|| Change {
                        height: i.height,
                        sequence: sats(&paid["sequence_number"]),
                        deposit: None,
                        txid: paid["transaction"].as_str().and_then(txid_of),
                    })
                }),
        )
        .collect();
    changes.sort_by_key(|c| (c.sequence.is_none(), c.sequence, c.height));
    let mut known: Option<u64> = None;
    let mut previous: Option<u64> = None;
    let steps = changes
        .into_iter()
        .map(|c| {
            // The first output (sequence 0) starts from an empty treasury.
            let before = if c.sequence == Some(0) {
                Some(0)
            } else if c.sequence.is_some()
                && previous.is_some()
                && c.sequence == previous.map(|p| p + 1)
            {
                known
            } else {
                None
            };
            let after = c
                .sequence
                .and_then(|s| read.get(&s).copied())
                .or_else(|| before.zip(c.deposit).map(|(b, d)| b + d));
            known = after;
            previous = c.sequence;
            TreasuryStep {
                height: c.height,
                sequence: c.sequence.map(|s| s.to_string()),
                change: if c.deposit.is_some() {
                    "deposit"
                } else {
                    "withdrawal"
                }
                .into(),
                delta_sats: c.deposit.map(|d| d.to_string()),
                value_after_sats: after.map(|v| v.to_string()),
                txid: c.txid,
            }
        })
        .collect();
    TreasuryStats {
        value_sats: latest.and_then(|i| i.data["ctip"]["value_sats"].as_str().map(str::to_owned)),
        sequence: latest
            .and_then(|i| sats(&i.data["ctip"]["sequence_number"]).map(|s| s.to_string())),
        read_at_tip_height: latest.and_then(tip_of).and_then(|h| i32::try_from(h).ok()),
        quality: latest.map(|i| i.quality.clone()),
        steps,
    }
}

/// Whether each observed block on the selected chain committed to this slot; conflicting reports count as unobserved.
fn commitments_by_height(items: &[ProtocolItem]) -> BTreeMap<i32, Option<Option<String>>> {
    let mut by_height: BTreeMap<i32, Option<Option<String>>> = BTreeMap::new();
    for i in items.iter().filter(|i| i.membership == "selected") {
        let Some(h) = i.height else { continue };
        let value = i.data["bmm_commitment"].as_str().map(str::to_owned);
        by_height
            .entry(h)
            .and_modify(|v| {
                if v.as_ref() != Some(&value) {
                    *v = None;
                }
            })
            .or_insert(Some(value));
    }
    by_height
}
fn state_at(committed: &BTreeMap<i32, Option<Option<String>>>, h: i32) -> Option<bool> {
    committed
        .get(&h)
        .and_then(|v| v.as_ref())
        .map(Option::is_some)
}

fn bmm_stats(
    committed: &BTreeMap<i32, Option<Option<String>>>,
    anchor: Option<i32>,
    start: Option<i32>,
) -> BmmStats {
    let Some(anchor) = anchor else {
        return BmmStats {
            windows: vec![],
            since_activation: None,
            streak: 0,
            last_commit_height: None,
            blocks_since_last_commit: None,
            longest_gap: None,
        };
    };
    let count = |from: i32| {
        let (mut covered, mut present) = (0, 0);
        for h in from..=anchor {
            match state_at(committed, h) {
                Some(true) => {
                    covered += 1;
                    present += 1;
                }
                Some(false) => covered += 1,
                None => {}
            }
        }
        (covered, present)
    };
    let windows = BMM_WINDOWS
        .iter()
        .map(|&w| {
            let from = (anchor - w as i32 + 1).max(start.unwrap_or(0));
            let (covered, present) = count(from);
            BmmWindowStats {
                blocks: w,
                covered,
                present,
            }
        })
        .collect();
    let since_activation = start.filter(|s| *s <= anchor).map(|s| {
        let (covered, present) = count(s);
        BmmWindowStats {
            blocks: (anchor - s + 1) as u32,
            covered,
            present,
        }
    });
    let streak = (start.unwrap_or(0)..=anchor)
        .rev()
        .take_while(|h| state_at(committed, *h) == Some(true))
        .count() as u32;
    let last_commit_height = committed
        .iter()
        .rev()
        .find(|(h, v)| **h <= anchor && matches!(v, Some(Some(_))))
        .map(|(h, _)| *h);
    let mut longest_gap: Option<BmmGap> = None;
    let mut run: Option<(i32, i32)> = None;
    for h in start.unwrap_or(anchor)..=anchor {
        if state_at(committed, h) == Some(false) {
            run = Some(run.map_or((h, h), |(a, _)| (a, h)));
        } else {
            run = None;
        }
        if let Some((a, b)) = run
            && longest_gap
                .as_ref()
                .is_none_or(|g| (b - a + 1) as u32 > g.blocks)
        {
            longest_gap = Some(BmmGap {
                from_height: a,
                to_height: b,
                blocks: (b - a + 1) as u32,
            });
        }
    }
    BmmStats {
        windows,
        since_activation,
        streak,
        last_commit_height,
        blocks_since_last_commit: last_commit_height.map(|h| anchor - h),
        longest_gap,
    }
}

fn bid_stats(bids: &[Bid]) -> BidStats {
    let values: Vec<u64> = bids
        .iter()
        .filter_map(|b| b.bid_sats.as_deref()?.parse().ok())
        .collect();
    let last = bids.iter().max_by_key(|b| (b.height, b.last_seen));
    let parents: std::collections::HashSet<_> =
        bids.iter().map(|b| (b.height, b.hash.clone())).collect();
    BidStats {
        count: bids.len() as u64,
        parent_blocks: parents.len() as u64,
        median_sats: median(values.clone()).map(|v| v.to_string()),
        max_sats: values.iter().max().map(|v| v.to_string()),
        last_parent_height: last.and_then(|b| b.height),
        last_sats: last.and_then(|b| b.bid_sats.clone()),
        next_block_observed: bids.iter().filter(|b| b.committed.is_some()).count() as u64,
        committed_next_block: bids.iter().filter(|b| b.committed == Some(true)).count() as u64,
    }
}

fn withdrawal_stats(
    latest: &[ProtocolItem],
    changes: &[ProtocolItem],
    constants: &Value,
    anchor: Option<i32>,
) -> WithdrawalStats {
    let threshold = int(&constants["withdrawal_bundle_inclusion_threshold"]);
    let max_age = int(&constants["withdrawal_bundle_max_age"]);
    let outcome = |state: &str| {
        changes
            .iter()
            .filter(|i| i.kind == "bundle_outcome" && i.data["state"].get(state).is_some())
            .count() as u64
    };
    let pending = latest
        .iter()
        .filter(|i| i.kind == "bundle" && i.is_current != Some(false))
        .map(|i| {
            let b = &i.data["bundle"];
            let votes = int(&b["vote_count"]);
            let proposal = int(&b["proposal_height"]);
            // A reading keeps the tip where its value was first seen; one still current at the anchor holds there too.
            let read_at = tip_of(i);
            let tip = if i.is_current == Some(true) {
                anchor.map(i64::from).max(read_at)
            } else {
                read_at
            };
            let age = tip.zip(proposal).map(|(t, p)| t - p);
            let needed = threshold.zip(votes).map(|(t, v)| (t + 1 - v).max(0));
            let blocks_left = max_age.zip(age).map(|(m, a)| m - a);
            let rate_since_proposal = votes
                .zip(age)
                .filter(|(_, a)| *a > 0)
                .map(|(v, a)| v as f64 / a as f64);
            // Vote changes of this bundle, oldest first, by the tip they were read at.
            let mut readings: Vec<(i64, i64)> = changes
                .iter()
                .filter(|c| c.kind == "bundle" && c.entity_id == i.entity_id)
                .filter_map(|c| Some((tip_of(c)?, int(&c.data["bundle"]["vote_count"])?)))
                .collect();
            readings.sort_unstable();
            let rate_recent = tip.zip(votes).and_then(|(t, v)| {
                let target = t - RECENT_BLOCKS;
                let base = readings
                    .iter()
                    .rev()
                    .find(|(h, _)| *h <= target)
                    .or(readings.first())?;
                (t > base.0).then(|| (v - base.1) as f64 / (t - base.0) as f64)
            });
            let rate = rate_recent.or(rate_since_proposal);
            let blocks_to_pass_at_rate = needed.zip(rate).and_then(|(n, r)| {
                if n == 0 {
                    Some(0)
                } else {
                    (r > 0.0).then(|| (n as f64 / r).ceil() as i64)
                }
            });
            let stored = b["m6id"].as_str();
            BundleProjection {
                m6id_onchain: stored.and_then(reversed_hex),
                m6id_txid_order: stored.map(str::to_owned),
                proposal_height: proposal.and_then(|h| i32::try_from(h).ok()),
                votes,
                read_at_tip_height: read_at.and_then(|h| i32::try_from(h).ok()),
                quality: i.quality.clone(),
                threshold,
                needed,
                age,
                max_age,
                expires_after_height: proposal.zip(max_age).map(|(p, m)| p + m),
                blocks_left,
                rate_since_proposal,
                rate_recent,
                blocks_to_pass_at_rate,
                can_still_pass: needed.zip(blocks_left).map(|(n, l)| n <= l),
                passes_at_rate: blocks_to_pass_at_rate
                    .zip(blocks_left)
                    .map(|(n, l)| n <= l)
                    .or(rate.map(|_| false)),
            }
        })
        .collect();
    WithdrawalStats {
        pending,
        submitted: outcome("Submitted"),
        succeeded: outcome("Succeeded"),
        failed: outcome("Failed"),
    }
}

fn series(
    committed: &BTreeMap<i32, Option<Option<String>>>,
    commitments: &[ProtocolItem],
    bids: &[Bid],
    anchor: Option<i32>,
    window: u32,
) -> Vec<StatsBlock> {
    let Some(anchor) = anchor else { return vec![] };
    let from = anchor - window as i32 + 1;
    let hashes: HashMap<i32, String> = commitments
        .iter()
        .filter(|i| i.membership == "selected" && i.height.is_some_and(|h| h >= from))
        .filter_map(|i| Some((i.height?, i.hash.clone()?)))
        .collect();
    let mut offered: HashMap<i32, Vec<&Bid>> = HashMap::new();
    for b in bids {
        if let Some(h) = b.height.filter(|h| *h + 1 >= from) {
            offered.entry(h + 1).or_default().push(b);
        }
    }
    (from..=anchor)
        .rev()
        .map(|h| {
            let for_block = offered.get(&h).map(Vec::as_slice).unwrap_or_default();
            let top = for_block
                .iter()
                .filter_map(|b| b.bid_sats.as_deref()?.parse::<u64>().ok())
                .max();
            let commitment = committed.get(&h).and_then(|v| v.as_ref());
            StatsBlock {
                height: h,
                hash: hashes.get(&h).cloned(),
                committed: commitment.map(Option::is_some),
                bids: for_block.len() as u32,
                top_bid_sats: top.map(|v| v.to_string()),
                bid_committed: (!for_block.is_empty())
                    .then_some(commitment)
                    .flatten()
                    .map(|c| {
                        for_block
                            .iter()
                            .any(|b| c.is_some() && b.critical_hash == *c)
                    }),
            }
        })
        .collect()
}

#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct NetworkQuery {
    pub dataset: Option<Uuid>,
    /// Blocks to measure pace and hashrate over: 144 (default), 1008 or 2016.
    pub window_blocks: Option<u32>,
}
const RETARGET_INTERVAL: i32 = 2016;
const TARGET_SPACING: i64 = 600;

/// The usual difficulty scale: work × 0xffff / 2^48, since difficulty 1 is 2^48/0xffff hashes.
fn difficulty(work: &str) -> Option<f64> {
    let w: f64 = work.parse().ok()?;
    Some(w * 65535.0 / 2f64.powi(48))
}

pub async fn network(pool: &PgPool, q: NetworkQuery) -> Result<NetworkResponse, StorageError> {
    let window = q.window_blocks.unwrap_or(144);
    if !matches!(window, 144 | 1008 | 2016) {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let data = dataset(&mut tx, q.dataset).await?;
    let mut meta = response_meta(&mut tx, &data).await?;
    let branch = blocks::branch(&mut tx, data.dataset_id).await?;
    meta.data_as_of_event_id = branch
        .processed_events
        .parse::<i64>()
        .ok()
        .filter(|n| *n > 0);
    let header = "SELECT h.height,h.hash,h.block_time,h.chain_work::text AS work,h.block_work::text AS per_block_work FROM projection.chain_members m JOIN LATERAL(SELECT * FROM projection.chain_headers h WHERE (h.dataset_id,h.generation,h.hash)=(m.dataset_id,m.generation,m.hash) LIMIT 1) h ON true WHERE m.dataset_id=$1 AND m.generation=$2";
    // One block more than the window, for the first interval.
    let rows = sqlx::query(&format!("{header} ORDER BY m.height DESC LIMIT $3"))
        .bind(data.dataset_id)
        .bind(meta.projection_generation)
        .bind(i64::from(window) + 1)
        .fetch_all(&mut *tx)
        .await?;
    let mut series = rows
        .into_iter()
        .map(|r| -> Result<NetworkBlock, sqlx::Error> {
            let work: Option<String> = r.try_get("per_block_work")?;
            Ok(NetworkBlock {
                height: r.try_get("height")?,
                hash: r.try_get("hash")?,
                block_time: r.try_get("block_time")?,
                chain_work: r.try_get("work")?,
                difficulty: work.as_deref().and_then(difficulty),
                block_work: work,
                interval_seconds: None,
                bids: None,
                bid_slots: None,
                bid_total_sats: None,
                top_bid_sats: None,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    for i in 0..series.len().saturating_sub(1) {
        if series[i].height == series[i + 1].height + 1 {
            series[i].interval_seconds = series[i]
                .block_time
                .zip(series[i + 1].block_time)
                .map(|(a, b)| (a - b).num_seconds());
        }
    }
    let tip = series.first().cloned();
    let retarget = match &tip {
        Some(t) => {
            let start = t.height - t.height % RETARGET_INTERVAL;
            let start_time: Option<DateTime<Utc>> = sqlx::query_scalar(&format!(
                "SELECT block_time FROM ({header} AND m.height=$3) x"
            ))
            .bind(data.dataset_id)
            .bind(meta.projection_generation)
            .bind(start)
            .fetch_optional(&mut *tx)
            .await?
            .flatten();
            let into = t.height - start;
            let mean = start_time
                .zip(t.block_time)
                .filter(|_| into > 0)
                .map(|(a, b)| (b - a).num_seconds() as f64 / f64::from(into));
            Some(RetargetEpoch {
                interval_blocks: RETARGET_INTERVAL,
                target_spacing_seconds: TARGET_SPACING,
                epoch_start_height: start,
                next_retarget_height: start + RETARGET_INTERVAL,
                blocks_into_epoch: into,
                blocks_remaining: start + RETARGET_INTERVAL - t.height,
                epoch_start_time: start_time,
                mean_spacing_seconds: mean,
                estimated_adjustment: mean
                    .filter(|m| *m > 0.0)
                    .map(|m| (TARGET_SPACING as f64 / m).clamp(0.25, 4.0)),
            })
        }
        None => None,
    };
    if let (Some(newest), Some(oldest)) = (series.first(), series.last()) {
        let c = protocol::context(&mut tx, &data).await?;
        let cut = c
            .source_event_cut
            .as_ref()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let build = c.build_id.as_ref().and_then(|v| v.parse::<i64>().ok());
        // Distinct bids per parent block, however many samples contained them, from the same cut as the lists.
        let rows = sqlx::query("WITH b AS (SELECT DISTINCT f.height,r->>'txid' AS txid,(r->>'sidechain_number')::int AS slot,(r->>'bid_sats')::numeric AS sats
              FROM projection.protocol_facts f JOIN ingest.event_observations o ON o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id
              CROSS JOIN LATERAL jsonb_array_elements(f.data->'requests') r
             WHERE f.dataset_id=$1 AND f.generation=$2 AND f.kind='auction' AND f.error IS NULL AND f.event_id<=$3
               AND o.observation_id<=coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=$4),0)
               AND f.height BETWEEN $5 AND $6
               AND EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=f.dataset_id AND m.generation=f.generation AND m.hash=f.hash))
            SELECT height+1 AS for_height,count(*) AS bids,count(DISTINCT slot) AS slots,sum(sats)::text AS total,max(sats)::text AS top FROM b GROUP BY height")
            .bind(data.dataset_id)
            .bind(meta.projection_generation)
            .bind(cut)
            .bind(build)
            .bind(oldest.height - 1)
            .bind(newest.height - 1)
            .fetch_all(&mut *tx)
            .await?;
        let mut by_height = HashMap::new();
        for r in rows {
            by_height.insert(r.try_get::<i32, _>("for_height")?, r);
        }
        for b in &mut series {
            if let Some(r) = by_height.get(&b.height) {
                b.bids = u32::try_from(r.try_get::<i64, _>("bids")?).ok();
                b.bid_slots = u32::try_from(r.try_get::<i64, _>("slots")?).ok();
                b.bid_total_sats = r.try_get("total")?;
                b.top_bid_sats = r.try_get("top")?;
            }
        }
    }
    tx.commit().await?;
    // The extra block only supplies the first interval.
    series.truncate(window as usize);
    let mut intervals: Vec<i64> = series.iter().filter_map(|b| b.interval_seconds).collect();
    let interval_mean_seconds = (!intervals.is_empty())
        .then(|| intervals.iter().sum::<i64>() as f64 / intervals.len() as f64);
    intervals.sort_unstable();
    let interval_median_seconds = match intervals.len() {
        0 => None,
        n if n % 2 == 1 => Some(intervals[n / 2] as f64),
        n => Some((intervals[n / 2 - 1] + intervals[n / 2]) as f64 / 2.0),
    };
    let hashrate_hps = match (series.first(), series.last()) {
        (Some(newest), Some(oldest)) if newest.height > oldest.height => {
            let seconds = newest
                .block_time
                .zip(oldest.block_time)
                .map(|(a, b)| (a - b).num_seconds());
            let work: f64 = series[..series.len() - 1]
                .iter()
                .filter_map(|b| b.block_work.as_deref()?.parse::<f64>().ok())
                .sum();
            seconds.filter(|s| *s > 0).map(|s| work / s as f64)
        }
        _ => None,
    };
    Ok(NetworkResponse {
        meta,
        branch,
        tip,
        window_blocks: window,
        blocks: series.len() as u32,
        interval_mean_seconds,
        interval_median_seconds,
        hashrate_hps,
        retarget,
        series,
        notes: vec![
            "Block times are set by miners and need not increase, so intervals can be negative and the hashrate is an estimate.".to_owned(),
            "Difficulty is block work × 65535 / 2^48, from each header's target.".to_owned(),
            "The retarget estimate assumes the rest of the epoch keeps the pace so far; early in an epoch it is noisy.".to_owned(),
            "Bids count only those the monitor saw before each block was mined.".to_owned(),
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn median_of_even_and_odd() {
        assert_eq!(median(vec![]), None);
        assert_eq!(median(vec![5, 1, 3]), Some(3));
        assert_eq!(median(vec![4, 1, 3, 2]), Some(2));
        assert_eq!(median(vec![1, 2]), Some(1));
        assert_eq!(median(vec![3, 5]), Some(4));
    }
    #[test]
    fn difficulty_matches_header_targets() {
        // A Betanet header: ECPool reports 10677035599.896063 for it.
        let d = difficulty("45858218460663607040").unwrap();
        assert!((d - 10_677_035_599.896_063).abs() < 0.01);
    }
}
