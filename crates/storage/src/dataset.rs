//! One sidechain's records as typed tables, all read from the same build so
//! that the files agree with each other.
use super::*;
use protocol::{ProtocolQuery, collect};
use serde::Deserialize;
use utoipa::IntoParams;

/// Records per table before it reports `truncated`; a height range narrows it.
const TABLE_MAX: usize = 250_000;

#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in=Query)]
pub struct DatasetQuery {
    pub dataset: Option<Uuid>,
    /// First L1 height to include. Snapshot readings filter by the tip they were read at.
    pub from_height: Option<i32>,
    pub to_height: Option<i32>,
}

pub async fn sidechain(
    pool: &PgPool,
    slot: i16,
    q: DatasetQuery,
) -> Result<SidechainDataset, StorageError> {
    if !(0..=255).contains(&slot)
        || q.from_height.is_some_and(|n| n < 0)
        || q.to_height.is_some_and(|n| n < 0)
        || q.from_height.zip(q.to_height).is_some_and(|(a, b)| a > b)
    {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let c = protocol::context(&mut tx, &d).await?;
    let generated_at: DateTime<Utc> = sqlx::query_scalar("SELECT now()")
        .fetch_one(&mut *tx)
        .await?;
    let r = records(&mut tx, &c, slot, q.from_height, q.to_height).await?;
    tx.commit().await?;
    let confirmed_fees = r.confirmed_fees;
    let tables = vec![
        sidechain_table(r.instances.0, r.proposals.0, r.instances.1 || r.proposals.1),
        deposit_table(r.deposits.0, r.deposits.1),
        treasury_table(r.treasury.0, r.treasury.1),
        withdrawal_table(r.withdrawals.0, &r.constants, r.withdrawals.1),
        commitment_table(r.commitments.0, r.commitments.1),
        bid_table(r.bids.0, r.bids.1),
    ];
    let mut notes = vec![
        "Treasury, withdrawal votes and sidechain rows are separate official enforcer responses, each read at the tip in its reference columns; they are not atomic state at one block.".to_owned(),
        "m6id_onchain is the byte order of the M3 message in the coinbase and of the enforcer API; m6id_txid_order is the same id reversed, as the Observatory stores it.".to_owned(),
        "bmm_bids lists bids the monitor saw before a block was mined. committed_next_block compares the bid's critical hash with the commitment in the following block; it does not prove the bid's fee was paid.".to_owned(),
        "Gaps in what the monitor observed are listed at /api/v1/coverage.".to_owned(),
    ];
    if !confirmed_fees {
        notes.push("This deployment does not collect confirmed merged-mining fees, so no file reports fees actually paid.".to_owned());
    }
    if tables.iter().any(|t| t.truncated) {
        notes.push(format!("At least one table reached {TABLE_MAX} rows and was cut short; request a narrower height range."));
    }
    Ok(SidechainDataset {
        context: c,
        slot,
        from_height: q.from_height,
        to_height: q.to_height,
        generated_at,
        notes,
        tables,
    })
}

/// A bid for the block after `height`, however many times it was sampled.
pub(crate) struct Bid {
    pub height: Option<i32>,
    pub hash: Option<String>,
    pub txid: Option<String>,
    pub bid_sats: Option<String>,
    pub critical_hash: Option<String>,
    pub first_seen: Option<DateTime<Utc>>,
    pub last_seen: Option<DateTime<Utc>>,
    pub samples: i64,
    /// Whether block height+1 committed to the critical hash; None when that block was not observed.
    pub committed: Option<bool>,
}
/// A list and whether it was cut at [`TABLE_MAX`].
pub(crate) type Rows<T> = (Vec<T>, bool);
/// Everything recorded for one slot, newest first, from the build of `c`.
pub(crate) struct Records {
    pub constants: Value,
    pub instances: Rows<ProtocolItem>,
    pub proposals: Rows<ProtocolItem>,
    pub deposits: Rows<ProtocolItem>,
    pub treasury: Rows<ProtocolItem>,
    /// Each change in a bundle's votes, and each outcome.
    pub withdrawals: Rows<ProtocolItem>,
    pub commitments: Rows<ProtocolItem>,
    /// Oldest first.
    pub bids: Rows<Bid>,
    pub confirmed_fees: bool,
}
pub(crate) async fn records(
    tx: &mut Transaction<'_, Postgres>,
    c: &ProtocolContext,
    slot: i16,
    from_height: Option<i32>,
    to_height: Option<i32>,
) -> Result<Records, StorageError> {
    let query = |kind: Option<&str>, order: Option<&str>| ProtocolQuery {
        slot: Some(slot),
        kind: kind.map(str::to_owned),
        from_height,
        to_height,
        order: order.map(str::to_owned),
        ..ProtocolQuery::default()
    };
    let (parameters, _) = collect(tx, "chain-info", &ProtocolQuery::default(), c, 1).await?;
    let constants = parameters
        .first()
        .map(|p| p.data["bip300_constants"].clone())
        .unwrap_or(Value::Null);
    let instances = collect(tx, "sidechain-instances", &query(None, None), c, TABLE_MAX).await?;
    let proposals = collect(tx, "sidechain-proposals", &query(None, None), c, TABLE_MAX).await?;
    let deposits = collect(tx, "deposits", &query(None, Some("block")), c, TABLE_MAX).await?;
    let treasury = collect(
        tx,
        "ctip/history",
        &query(None, Some("block")),
        c,
        TABLE_MAX,
    )
    .await?;
    let mut changes = query(Some("bundle,bundle_outcome"), Some("block"));
    changes.changes = Some(true);
    let withdrawals = collect(tx, "activity", &changes, c, TABLE_MAX).await?;
    let commitments = collect(tx, "bmm/commitments", &query(None, None), c, TABLE_MAX).await?;
    let bids = bids(tx, c, slot, from_height, to_height).await?;
    let confirmed_fees: bool = sqlx::query_scalar("SELECT coalesce((SELECT r.capabilities ? 'observed_bmm_confirmed_fees' FROM ingest.extractor_runs r JOIN ingest.extractor_status s USING(run_id) WHERE s.dataset_id=$1 AND s.source='enforcer'),false)")
        .bind(c.meta.dataset_id)
        .fetch_one(&mut **tx)
        .await?;
    Ok(Records {
        constants,
        instances,
        proposals,
        deposits,
        treasury,
        withdrawals,
        commitments,
        bids,
        confirmed_fees,
    })
}

/// A JSON value as cell text: strings verbatim, other scalars printed, null as unknown.
fn text(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}
fn evidence_event(i: &ProtocolItem) -> Option<String> {
    i.evidence.first().map(|e| e.event_id.clone())
}
fn time(t: Option<DateTime<Utc>>) -> Option<String> {
    t.map(|t| t.to_rfc3339())
}
/// Deposit addresses arrive as the hex of their text; show the text when it is printable.
fn address_text(hex_text: &str) -> Option<String> {
    let bytes = hex::decode(hex_text).ok()?;
    let text = String::from_utf8(bytes).ok()?;
    (!text.is_empty() && text.chars().all(|c| c.is_ascii_graphic())).then_some(text)
}
fn reversed_hex(hex_text: &str) -> Option<String> {
    let mut bytes = hex::decode(hex_text).ok()?;
    bytes.reverse();
    Some(hex::encode(bytes))
}
fn table(
    name: &str,
    description: &str,
    columns: &[(&str, &str)],
    rows: Vec<Vec<Option<String>>>,
    truncated: bool,
) -> DatasetTable {
    DatasetTable {
        name: name.into(),
        description: description.into(),
        columns: columns
            .iter()
            .map(|(name, description)| DatasetColumn {
                name: (*name).into(),
                description: (*description).into(),
            })
            .collect(),
        rows,
        truncated,
    }
}
/// Lists arrive newest first; files read oldest first.
fn oldest_first(mut items: Vec<ProtocolItem>) -> Vec<ProtocolItem> {
    items.reverse();
    items
}

fn sidechain_table(
    instances: Vec<ProtocolItem>,
    proposals: Vec<ProtocolItem>,
    truncated: bool,
) -> DatasetTable {
    let rows = oldest_first(instances)
        .into_iter()
        .map(|i| ("instance", "sidechain", i))
        .chain(
            oldest_first(proposals)
                .into_iter()
                .map(|i| ("proposal", "proposal", i)),
        )
        .map(|(kind, field, i)| {
            let s = &i.data[field];
            let v0 = &s["declaration"]["declaration"]["V0"];
            vec![
                Some(kind.into()),
                i.entity_id.clone(),
                text(&v0["title"]),
                text(&v0["description"]),
                text(&s["description_hash"]),
                text(&s["proposal_height"]),
                text(&s["activation_height"]),
                text(&s["vote_count"]),
                text(&i.data["status"]),
                time(i.observed_at),
                text(&i.data["observation_window"]["reference_tip_height"]),
                Some(i.quality.clone()),
                evidence_event(&i),
            ]
        })
        .collect();
    table(
        "sidechain",
        "The sidechain occupying this slot and any proposal for it, as last reported by the enforcer.",
        &[
            ("kind", "instance (activated) or proposal (awaiting votes)"),
            (
                "instance_id",
                "slot:proposal_height:activation_height:description_hash for an instance; proposal id otherwise",
            ),
            ("title", "Title from the sidechain's declaration"),
            (
                "description",
                "Description from the sidechain's declaration",
            ),
            (
                "description_hash",
                "Hash of the raw declaration miners voted on",
            ),
            ("proposal_height", "L1 height of the M1 proposal"),
            (
                "activation_height",
                "L1 height at which the slot activated; empty for a proposal",
            ),
            (
                "ack_count",
                "Miner approvals (M2 acks) the enforcer reported",
            ),
            (
                "status",
                "observed_active, observed_pending, or what the enforcer last reported",
            ),
            ("read_at", "When the enforcer last returned this record"),
            (
                "read_at_tip_height",
                "L1 tip height when that response was read",
            ),
            (
                "quality",
                "tip_matched: the tip was the same before and after the read; unknown otherwise",
            ),
            (
                "evidence_event_id",
                "Monitor event behind the row, at /datasets/{dataset}/events/{id}",
            ),
        ],
        rows,
        truncated,
    )
}

fn deposit_table(items: Vec<ProtocolItem>, truncated: bool) -> DatasetTable {
    let rows = oldest_first(items)
        .into_iter()
        .map(|i| {
            let address = i.data["address"].as_str().unwrap_or_default().to_owned();
            vec![
                i.height.map(|h| h.to_string()),
                i.hash.clone(),
                time(i.block_time),
                text(&i.data["outpoint"]["txid"]),
                text(&i.data["outpoint"]["vout"]),
                text(&i.data["value_sats"]),
                text(&i.data["sequence_number"]),
                address_text(&address),
                (!address.is_empty()).then_some(address),
                Some(i.membership.clone()),
                Some(i.quality.clone()),
                evidence_event(&i),
            ]
        })
        .collect();
    table(
        "deposits",
        "Deposits into the slot's treasury (M5), one row per deposit, from L1 blocks.",
        &[
            ("height", "L1 block height"),
            ("block_hash", "L1 block hash"),
            ("block_time", "Miner-set block timestamp"),
            (
                "txid",
                "Deposit transaction; its output becomes the new treasury output",
            ),
            ("vout", "Output index of the new treasury output"),
            (
                "value_sats",
                "Amount deposited: new treasury value minus the previous one",
            ),
            (
                "treasury_sequence",
                "The enforcer's sequence number of the treasury after this deposit",
            ),
            (
                "sidechain_address",
                "Destination address on the sidechain, as text when printable",
            ),
            (
                "sidechain_address_hex",
                "Destination address bytes as the enforcer reports them",
            ),
            (
                "branch",
                "selected: on the chain the Observatory follows; alternative: on a side branch",
            ),
            ("quality", "observed: read from a block"),
            ("evidence_event_id", "Monitor event behind the row"),
        ],
        rows,
        truncated,
    )
}

fn treasury_table(items: Vec<ProtocolItem>, truncated: bool) -> DatasetTable {
    let rows = oldest_first(items)
        .into_iter()
        .map(|i| {
            let ctip = &i.data["ctip"];
            let window = &i.data["observation_window"];
            vec![
                text(&window["reference_tip_height"]),
                text(&window["reference_tip_hash"]),
                time(i.first_observed_at),
                time(i.observed_at),
                text(&i.data["occurrences"]),
                text(&ctip["txid"]),
                text(&ctip["vout"]),
                text(&ctip["value_sats"]),
                text(&ctip["sequence_number"]),
                text(&window["sidechain_instance_id"]),
                Some(i.quality.clone()),
                evidence_event(&i),
            ]
        })
        .collect();
    table(
        "treasury",
        "Readings of the slot's treasury output (CTIP). Unchanged re-reads are one row with a read count.",
        &[
            (
                "read_at_tip_height",
                "L1 tip height when the reading was taken",
            ),
            ("read_at_tip_hash", "L1 tip hash when the reading was taken"),
            ("first_read_at", "First time this reading was returned"),
            ("last_read_at", "Latest time this same reading was returned"),
            (
                "reads",
                "How many times this reading was returned unchanged",
            ),
            (
                "txid",
                "Transaction holding the treasury output; empty when the treasury is empty",
            ),
            ("vout", "Output index"),
            ("value_sats", "Treasury balance"),
            ("sequence", "The enforcer's treasury sequence number"),
            (
                "instance_id",
                "Sidechain instance the reading was taken for",
            ),
            (
                "quality",
                "tip_matched: the tip was the same before and after the read; unknown otherwise",
            ),
            ("evidence_event_id", "Monitor event behind the row"),
        ],
        rows,
        truncated,
    )
}

fn withdrawal_table(items: Vec<ProtocolItem>, constants: &Value, truncated: bool) -> DatasetTable {
    let threshold = text(&constants["withdrawal_bundle_inclusion_threshold"]);
    let max_age = constants["withdrawal_bundle_max_age"].as_i64();
    let rows = oldest_first(items)
        .into_iter()
        .map(|i| {
            let outcome = i.kind == "bundle_outcome";
            let bundle = &i.data["bundle"];
            let stored = if outcome {
                i.data["m6id"].as_str()
            } else {
                bundle["m6id"].as_str()
            }
            .unwrap_or_default();
            let proposal_height = bundle["proposal_height"].as_i64();
            let window = &i.data["observation_window"];
            vec![
                Some(if outcome { "outcome" } else { "votes" }.into()),
                reversed_hex(stored),
                (!stored.is_empty()).then(|| stored.to_owned()),
                proposal_height.map(|h| h.to_string()),
                text(&bundle["vote_count"]),
                threshold.clone().filter(|_| !outcome),
                proposal_height
                    .zip(max_age)
                    .map(|(h, a)| (h + a).to_string()),
                i.data["state"]
                    .as_object()
                    .and_then(|s| s.keys().next().cloned()),
                i.height.map(|h| h.to_string()),
                i.hash.clone(),
                text(&window["reference_tip_height"]),
                time(i.observed_at),
                Some(i.quality.clone()),
                evidence_event(&i),
            ]
        })
        .collect();
    table(
        "withdrawals",
        "Withdrawal bundles: each change in their vote count while pending, and each outcome recorded in a block.",
        &[
            (
                "row",
                "votes: a pending bundle's vote reading; outcome: a state change recorded in a block",
            ),
            (
                "m6id_onchain",
                "Bundle id in the byte order of the M3 coinbase message and the enforcer API",
            ),
            (
                "m6id_txid_order",
                "The same id reversed (transaction-id display order)",
            ),
            ("proposal_height", "L1 height where the bundle was proposed"),
            ("vote_count", "Votes the enforcer reported at that reading"),
            ("votes_needed", "BIP300 inclusion threshold on this network"),
            (
                "expires_after_height",
                "proposal_height plus the maximum bundle age on this network",
            ),
            (
                "outcome",
                "Submitted, Succeeded or Failed, for outcome rows",
            ),
            ("height", "L1 height of an outcome"),
            ("block_hash", "L1 block of an outcome"),
            ("read_at_tip_height", "L1 tip height of a vote reading"),
            (
                "read_at",
                "Latest time this reading or outcome was observed",
            ),
            (
                "quality",
                "tip_matched or unknown for readings; observed for outcomes",
            ),
            ("evidence_event_id", "Monitor event behind the row"),
        ],
        rows,
        truncated,
    )
}

fn commitment_table(items: Vec<ProtocolItem>, truncated: bool) -> DatasetTable {
    let rows = oldest_first(items)
        .into_iter()
        .map(|i| {
            let commitment = text(&i.data["bmm_commitment"]);
            vec![
                i.height.map(|h| h.to_string()),
                i.hash.clone(),
                time(i.block_time),
                Some(commitment.is_some().to_string()),
                commitment,
                Some(i.membership.clone()),
                Some(i.quality.clone()),
                evidence_event(&i),
            ]
        })
        .collect();
    table(
        "bmm_commitments",
        "Every L1 block the enforcer reported for this slot, and the sidechain block it committed to, if any (BIP301).",
        &[
            ("height", "L1 block height"),
            ("block_hash", "L1 block hash"),
            ("block_time", "Miner-set block timestamp"),
            (
                "committed",
                "true when the block carries a commitment for this slot",
            ),
            (
                "sidechain_block_hash",
                "The committed sidechain block hash (critical hash)",
            ),
            ("branch", "selected or alternative"),
            ("quality", "observed: read from a block"),
            ("evidence_event_id", "Monitor event behind the row"),
        ],
        rows,
        truncated,
    )
}

async fn bids(
    tx: &mut Transaction<'_, Postgres>,
    c: &ProtocolContext,
    slot: i16,
    from_height: Option<i32>,
    to_height: Option<i32>,
) -> Result<Rows<Bid>, StorageError> {
    let build = c.build_id.as_ref().and_then(|v| v.parse::<i64>().ok());
    let cut = c
        .source_event_cut
        .as_ref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    // One row per bid and parent block, however many times it was sampled.
    let rows = sqlx::query("WITH bids AS (SELECT f.height,f.hash,r->>'txid' AS txid,r->>'bid_sats' AS bid_sats,r->>'critical_hash' AS critical_hash,min(o.observed_at) AS first_seen,max(o.observed_at) AS last_seen,count(*) AS samples
          FROM projection.protocol_facts f JOIN ingest.event_observations o ON o.dataset_id=f.dataset_id AND o.source_event_id=f.event_id
          CROSS JOIN LATERAL jsonb_array_elements(f.data->'requests') r
         WHERE f.dataset_id=$1 AND f.generation=$2 AND f.kind='auction' AND f.error IS NULL AND f.event_id<=$3
           AND o.observation_id<=coalesce((SELECT (cut->>'observations')::bigint FROM ops.protocol_builds WHERE build_id=$4),0)
           AND (r->>'sidechain_number')::int=$5 AND ($6::int IS NULL OR f.height>=$6) AND ($7::int IS NULL OR f.height<=$7)
           AND EXISTS(SELECT 1 FROM projection.chain_members m WHERE m.dataset_id=f.dataset_id AND m.generation=f.generation AND m.hash=f.hash)
         GROUP BY f.height,f.hash,r->>'txid',r->>'bid_sats',r->>'critical_hash')
        SELECT b.*,(SELECT bool_or(coalesce(n.data->>'bmm_commitment','')=b.critical_hash) FROM projection.protocol_facts n JOIN projection.chain_members m ON m.dataset_id=n.dataset_id AND m.generation=n.generation AND m.hash=n.hash
                     WHERE n.dataset_id=$1 AND n.generation=$2 AND n.kind='slot_block' AND n.error IS NULL AND n.event_id<=$3 AND n.slot=$5 AND n.height=b.height+1) AS committed
          FROM bids b ORDER BY b.height,b.first_seen,b.txid LIMIT $8")
        .bind(c.meta.dataset_id)
        .bind(c.meta.projection_generation)
        .bind(cut)
        .bind(build)
        .bind(i32::from(slot))
        .bind(from_height)
        .bind(to_height)
        .bind(TABLE_MAX as i64 + 1)
        .fetch_all(&mut **tx)
        .await?;
    let truncated = rows.len() > TABLE_MAX;
    let rows = rows
        .into_iter()
        .take(TABLE_MAX)
        .map(|r| -> Result<Bid, StorageError> {
            Ok(Bid {
                height: r.try_get("height")?,
                hash: r.try_get("hash")?,
                txid: r.try_get("txid")?,
                bid_sats: r.try_get("bid_sats")?,
                critical_hash: r.try_get("critical_hash")?,
                first_seen: r.try_get("first_seen")?,
                last_seen: r.try_get("last_seen")?,
                samples: r.try_get("samples")?,
                committed: r.try_get("committed")?,
            })
        })
        .collect::<Result<_, _>>()?;
    Ok((rows, truncated))
}

fn bid_table(bids: Vec<Bid>, truncated: bool) -> DatasetTable {
    let rows = bids
        .into_iter()
        .map(|b| {
            vec![
                b.height.map(|h| h.to_string()),
                b.hash,
                b.txid,
                b.bid_sats,
                b.critical_hash,
                time(b.first_seen),
                time(b.last_seen),
                Some(b.samples.to_string()),
                b.committed.map(|b| b.to_string()),
            ]
        })
        .collect();
    table(
        "bmm_bids",
        "Merged-mining bids (BMM requests) for this slot that the monitor saw while the next block was being mined.",
        &[
            (
                "parent_height",
                "L1 tip the bid was made on; the bid is for the next block",
            ),
            ("parent_hash", "Hash of that tip"),
            ("txid", "Bid transaction"),
            ("bid_sats", "Amount offered to the miner"),
            (
                "critical_hash",
                "Sidechain block hash the bid asks miners to commit to",
            ),
            ("first_seen", "First sample that contained the bid"),
            ("last_seen", "Last sample that contained the bid"),
            ("samples", "How many samples contained the bid"),
            (
                "committed_next_block",
                "true if block parent_height+1 committed to critical_hash; false if it committed to something else or nothing; empty if that block was not observed",
            ),
        ],
        rows,
        truncated,
    )
}
