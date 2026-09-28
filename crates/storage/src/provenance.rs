use super::*;
use protocol::ProtocolQuery;

#[derive(serde::Serialize, serde::Deserialize)]
struct Cursor {
    dataset: Uuid,
    resource: String,
    key: Option<String>,
    time: DateTime<Utc>,
    id: String,
}
pub async fn list(
    pool: &PgPool,
    resource: &str,
    q: ProtocolQuery,
) -> Result<ProtocolPage, StorageError> {
    let limit = q.limit.unwrap_or(50);
    if !(1..=200).contains(&limit) {
        return Err(StorageError::InvalidQuery);
    }
    let mut tx = snapshot(pool).await?;
    let d = dataset(&mut tx, q.dataset).await?;
    let c = protocol::context(&mut tx, &d).await?;
    let cursor = if let Some(v) = &q.cursor {
        if v.len() > 4096 {
            return Err(StorageError::InvalidQuery);
        }
        let decoded = hex::decode(v).map_err(|_| StorageError::InvalidQuery)?;
        let p: Cursor = serde_json::from_slice(&decoded).map_err(|_| StorageError::InvalidQuery)?;
        if p.dataset != d.dataset_id || p.resource != resource || p.key != q.key {
            return Err(StorageError::StaleCursor);
        }
        Some(p)
    } else {
        None
    };
    let (table, id, time, data, kind) = match resource {
        "runs" => (
            "ingest.extractor_runs",
            "run_id",
            "started_at",
            "to_jsonb(r) || jsonb_build_object('last_capture_seq',r.last_capture_seq::text)",
            "run",
        ),
        "snapshot-groups" => (
            "ingest.snapshot_groups",
            "snapshot_group_id",
            "started_at",
            "to_jsonb(r) || jsonb_build_object('tip_before_hash',encode(r.tip_before_hash,'hex'),'tip_after_hash',encode(r.tip_after_hash,'hex'))",
            "snapshot_group",
        ),
        "event-occurrences" => (
            "ingest.event_observations",
            "observation_id",
            "observed_at",
            "to_jsonb(r) || jsonb_build_object('observation_id',r.observation_id::text,'source_event_id',r.source_event_id::text,'capture_seq',r.capture_seq::text)",
            "occurrence",
        ),
        _ => return Err(StorageError::InvalidQuery),
    };
    let mut qb = sqlx::QueryBuilder::new(format!(
        "SELECT r.{id}::text AS id,r.{time} AS observed_at,{data} AS data FROM {table} r WHERE dataset_id="
    ));
    qb.push_bind(d.dataset_id);
    if let Some(key) = &q.key {
        if resource == "event-occurrences" {
            let key = key
                .parse::<i64>()
                .ok()
                .filter(|n| *n > 0)
                .ok_or(StorageError::InvalidQuery)?;
            qb.push(" AND source_event_id=").push_bind(key);
        } else {
            let key = key
                .parse::<Uuid>()
                .map_err(|_| StorageError::InvalidQuery)?;
            qb.push(format!(" AND r.{id}=")).push_bind(key);
        }
    }
    if let Some(p) = &cursor {
        qb.push(format!(" AND (r.{time},r.{id})<("))
            .push_bind(p.time)
            .push(",");
        if resource == "event-occurrences" {
            qb.push_bind(
                p.id.parse::<i64>()
                    .map_err(|_| StorageError::InvalidQuery)?,
            );
        } else {
            qb.push_bind(
                p.id.parse::<Uuid>()
                    .map_err(|_| StorageError::InvalidQuery)?,
            );
        }
        qb.push(")");
    }
    qb.push(format!(" ORDER BY r.{time} DESC,r.{id} DESC LIMIT "))
        .push_bind(i64::from(limit) + 1);
    let mut items = vec![];
    for r in qb.build().fetch_all(&mut *tx).await? {
        let data: Value = r.try_get("data")?;
        let evidence = if resource == "event-occurrences" {
            vec![ProtocolEvidence {
                event_id: data["source_event_id"].as_str().unwrap_or_default().into(),
                ordinal: 0,
                observation_id: Some(r.try_get("id")?),
            }]
        } else {
            vec![]
        };
        items.push(ProtocolItem {
            id: r.try_get("id")?,
            entity_id: Some(r.try_get("id")?),
            kind: kind.into(),
            slot: None,
            hash: None,
            height: None,
            observed_at: Some(r.try_get("observed_at")?),
            block_time: None,
            quality: "observed".into(),
            membership: "not_applicable".into(),
            is_current: None,
            evidence,
            data,
            issue: None,
        });
    }
    let more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = if more {
        items.last().map(|i| {
            hex::encode(
                serde_json::to_vec(&Cursor {
                    dataset: d.dataset_id,
                    resource: resource.into(),
                    key: q.key.clone(),
                    time: i.observed_at.expect("timestamp selected"),
                    id: i.id.clone(),
                })
                .expect("serializable cursor"),
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
