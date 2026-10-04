//! Version 2 projections. Unsupported protocol derivations remain raw evidence.
use anyhow::{Context as _, Result, bail};
use pulse_domain::{BmmBid, MONITOR_EVENT_CONTRACT_VERSIONS};
use serde_json::{Value, json};
use sqlx::{Connection as _, PgConnection};
use uuid::Uuid;

use super::{SourceEvent, advance_cursor, append_update, cursor, project_block};

pub fn auction(payload: &Value, anchor: Option<&[u8]>) -> Result<(String, Vec<BmmBid>)> {
    let snapshot = payload
        .pointer("/monitor_event/Enforcer/event/BmmRequests")
        .context("missing BmmRequests payload")?;
    if snapshot["observer_session"]
        .as_str()
        .is_none_or(str::is_empty)
        || snapshot["mempool_generation"]
            .as_u64()
            .is_none_or(|g| g == 0)
    {
        bail!("BMM sample has no ready mempool generation");
    }
    let mut identities = std::collections::BTreeSet::new();
    let parent = hash(&snapshot["previous_mainchain_block_hash"])?;
    if anchor.is_none_or(|bytes| hex::encode(bytes) != parent) {
        bail!("BMM parent differs from event anchor");
    }
    let requests = snapshot["requests"]
        .as_array()
        .context("missing BMM request array")?;
    let mut bids = Vec::with_capacity(requests.len());
    for request in requests {
        let bid = BmmBid {
            slot: u8::try_from(
                request["sidechain_number"]
                    .as_u64()
                    .context("invalid BMM slot")?,
            )?,
            txid: hash(&request["txid"])?,
            critical_hash: hash(&request["critical_hash"])?,
            bid_sats: request["bid_sats"]
                .as_u64()
                .context("invalid BMM bid_sats")?
                .to_string(),
        };
        if !identities.insert((bid.slot, bid.txid.clone())) {
            bail!("duplicate BMM request");
        }
        bids.push(bid);
    }
    Ok((parent, bids))
}

fn hash(value: &Value) -> Result<String> {
    let value = value.as_str().context("missing hash")?;
    let bytes = hex::decode(value).context("invalid hash hex")?;
    if bytes.len() != 32 {
        bail!("hash must contain 32 bytes");
    }
    Ok(hex::encode(bytes))
}

pub async fn project_page(
    destination: &mut PgConnection,
    dataset: Uuid,
    limit: i64,
) -> Result<i64> {
    let after = cursor(destination, dataset, "projection_events").await?;
    let events = sqlx::query_as::<_, SourceEvent>(
        "SELECT source_event_id AS id, dataset_id, event_contract_version, observed_at,
         source_ingested_at AS ingested_at, source, kind, sidechain, sidechain_instance_id,
         block_hash, height, envelope, envelope_sha256, fact_sha256, payload
         FROM ingest.source_events WHERE dataset_id=$1 AND source_event_id>$2
         ORDER BY source_event_id LIMIT $3",
    )
    .bind(dataset)
    .bind(after)
    .bind(limit)
    .fetch_all(&mut *destination)
    .await?;
    if events.is_empty() {
        return Ok(0);
    }
    let mut tx = destination.begin().await?;
    for event in &events {
        let mut bmm_error = None;
        let mut block_error = None;
        if event.kind == "bmm_requests"
            && MONITOR_EVENT_CONTRACT_VERSIONS.contains(&event.event_contract_version)
        {
            match auction(&event.payload, event.block_hash.as_deref()) {
                Ok((parent, requests)) => {
                    sqlx::query("INSERT INTO projection.bmm_snapshots (dataset_id, source_event_id, parent_hash, requests)
                        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING")
                        .bind(dataset).bind(event.id).bind(parent).bind(json!(requests))
                        .execute(&mut *tx).await?;
                }
                Err(error) => bmm_error = Some(error.to_string()),
            }
        }
        if matches!(
            event.kind.as_str(),
            "bip300_block_delta" | "block_connected" | "chain_tip"
        ) {
            if event.block_hash.is_none() || event.height.is_none() {
                block_error = Some("block fact lacks its hash or height".to_owned());
            } else {
                project_block(&mut tx, event).await?;
            }
        }
        let error = bmm_error.as_ref().or(block_error.as_ref());
        sqlx::query("UPDATE ingest.source_events SET interpretation_error=$3 WHERE dataset_id=$1 AND source_event_id=$2")
            .bind(dataset).bind(event.id).bind(error).execute(&mut *tx).await?;
        for (name, failed) in [
            ("blocks", block_error.is_some()),
            ("bmm", bmm_error.is_some()),
        ] {
            sqlx::query("INSERT INTO ops.projection_progress (dataset_id, name, processed_event_id, error_event_id)
                VALUES ($1,$2,CASE WHEN $4 THEN NULL ELSE $3 END,CASE WHEN $4 THEN $3 ELSE NULL END)
                ON CONFLICT (dataset_id,name) DO UPDATE SET
                    processed_event_id=CASE WHEN ops.projection_progress.error_event_id IS NULL AND NOT $4
                        THEN $3 ELSE ops.projection_progress.processed_event_id END,
                    error_event_id=COALESCE(ops.projection_progress.error_event_id, EXCLUDED.error_event_id)")
                .bind(dataset).bind(name).bind(event.id).bind(failed).execute(&mut *tx).await?;
        }
    }
    let next = events.last().context("nonempty projection page")?.id;
    advance_cursor(&mut tx, dataset, "projection_events", next).await?;
    append_update(
        &mut tx,
        dataset,
        Some(next),
        json!(["overview", "bmm", "status", "coverage"]),
    )
    .await?;
    tx.commit().await?;
    Ok(events.len().try_into()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn payload(requests: Value) -> Value {
        json!({"monitor_event":{"Enforcer":{"event":{"BmmRequests":{
            "observer_session":"test", "mempool_generation":1, "previous_mainchain_block_hash":"ab".repeat(32), "requests":requests
        }}}}})
    }
    #[test]
    fn bids_remain_exact_and_empty_is_an_observation() {
        let request = json!({"sidechain_number":255, "txid":"12".repeat(32),
            "critical_hash":"34".repeat(32), "bid_sats":u64::MAX});
        let (_, bids) = auction(&payload(json!([request])), Some(&[0xab; 32])).unwrap();
        assert_eq!(bids[0].bid_sats, "18446744073709551615");
        assert!(
            auction(&payload(json!([])), Some(&[0xab; 32]))
                .unwrap()
                .1
                .is_empty()
        );
    }
    #[test]
    fn malformed_snapshot_is_never_an_empty_auction() {
        assert!(auction(&json!({}), Some(&[0xab; 32])).is_err());
        assert!(auction(&payload(json!([])), Some(&[0xcd; 32])).is_err());
        let request = json!({"sidechain_number":256,"txid":"12".repeat(32),
            "critical_hash":"34".repeat(32),"bid_sats":1});
        assert!(auction(&payload(json!([request])), Some(&[0xab; 32])).is_err());
    }
}
