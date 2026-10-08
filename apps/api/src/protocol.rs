use super::*;
use axum::extract::OriginalUri;
use pulse_storage::protocol::ProtocolQuery;

pub(crate) struct PublicQuery<T>(pub T);
impl<S: Send + Sync, T: serde::de::DeserializeOwned> axum::extract::FromRequestParts<S>
    for PublicQuery<T>
{
    type Rejection = AppError;
    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        Query::<T>::from_request_parts(parts, state)
            .await
            .map(|Query(q)| Self(q))
            .map_err(|_| StorageError::InvalidQuery.into())
    }
}

pub fn extend_openapi(mut doc: Value) -> Value {
    let page = doc["paths"]["/api/v1/events"].clone();
    let observatory = doc["paths"]["/api/v1/observatory"].clone();
    for path in [
        "chain-info",
        "sidechain-proposals",
        "sidechain-proposals/{id}",
        "sidechain-instances",
        "sidechain-instances/{id}",
        "sidechain-instances/{id}/ctip",
        "sidechains/{slot}/activity",
        "sidechains/{slot}/instances",
        "deposits",
        "withdrawal-bundles",
        "withdrawal-bundles/{id}",
        "bundle-attempts",
        "bundle-attempts/{id}",
        "ctip/history",
        "protocol-messages",
        "bmm/history",
        "bmm/commitments",
        "bmm/confirmed",
        "activity",
        "observations",
        "search",
        "runs",
        "runs/{id}",
        "snapshot-groups",
        "observation-failures",
        "snapshot-groups/{id}",
        "datasets/{dataset}/events/{id}/occurrences",
        "sidechains/{slot}",
        "export",
    ] {
        let mut definition = if path == "sidechains/{slot}" {
            observatory.clone()
        } else {
            page.clone()
        };
        definition["get"]["operationId"] =
            json!(path.replace('/', "_").replace(['{', '}', '-'], ""));
        definition["get"]["summary"] =
            json!(format!("Read {} from the local Observatory dataset", path));
        if let Some(params) = definition["get"]["parameters"].as_array_mut() {
            for name in ["id", "slot", "dataset"] {
                if path.contains(&format!("{{{name}}}")) {
                    params.push(json!({"name":name,"in":"path","required":true,"schema":{"type":if name=="slot"{"integer"}else{"string"}}}));
                }
            }
        }
        if path == "export" {
            if let Some(params) = definition["get"]["parameters"].as_array_mut() {
                params.push(json!({"name":"resource","in":"query","required":true,"schema":{"type":"string"}}));
                params.push(json!({"name":"format","in":"query","schema":{"type":"string","enum":["json","csv"],"default":"json"}}));
            }
            definition["get"]["responses"]["200"]["content"] = json!({"application/json":{"schema":{"type":"object","required":["context","items","truncated"],"properties":{"context":{"$ref":"#/components/schemas/ProtocolContext"},"items":{"type":"array","items":{"$ref":"#/components/schemas/ProtocolItem"}},"truncated":{"type":"boolean"}}}},"text/csv":{"schema":{"type":"string"}}});
        }
        doc["paths"][format!("/api/v1/{path}")] = definition;
    }
    doc
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/v1/observatory", get(observatory))
        .route("/api/v1/chain-info", get(list))
        .route("/api/v1/sidechain-proposals", get(list))
        .route("/api/v1/sidechain-proposals/{id}", get(detail))
        .route("/api/v1/sidechain-instances", get(list))
        .route("/api/v1/sidechain-instances/{id}", get(detail))
        .route("/api/v1/sidechain-instances/{id}/ctip", get(instance_ctip))
        .route("/api/v1/sidechains/{slot}", get(sidechain))
        .route("/api/v1/sidechains/{slot}/activity", get(slot_activity))
        .route("/api/v1/sidechains/{slot}/instances", get(slot_instances))
        .route("/api/v1/deposits", get(list))
        .route("/api/v1/withdrawal-bundles", get(list))
        .route("/api/v1/withdrawal-bundles/{id}", get(bundle))
        .route("/api/v1/bundle-attempts", get(list))
        .route("/api/v1/bundle-attempts/{id}", get(detail))
        .route("/api/v1/ctip/history", get(list))
        .route("/api/v1/protocol-messages", get(list))
        .route("/api/v1/bmm/history", get(list))
        .route("/api/v1/bmm", get(bmm))
        .route("/api/v1/bmm/commitments", get(list))
        .route("/api/v1/bmm/confirmed", get(list))
        .route("/api/v1/activity", get(list))
        .route("/api/v1/observations", get(list))
        .route("/api/v1/events", get(list))
        .route("/api/v1/search", get(list))
        .route("/api/v1/export", get(export))
        .route("/api/v1/runs", get(provenance))
        .route("/api/v1/observation-failures", get(provenance))
        .route("/api/v1/runs/{id}", get(provenance_detail))
        .route("/api/v1/snapshot-groups", get(provenance))
        .route("/api/v1/snapshot-groups/{id}", get(provenance_detail))
        .route(
            "/api/v1/datasets/{dataset}/events/{id}/occurrences",
            get(occurrences),
        )
}

#[utoipa::path(get,path="/api/v1/observatory",params(ProtocolQuery),responses((status=200,body=ObservatoryResponse),(status=400,body=ApiError)),tag="pulse")]
pub async fn observatory(
    State(s): State<AppState>,
    PublicQuery(q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ObservatoryResponse>, AppError> {
    Ok(Json(
        pulse_storage::protocol::observatory(&s.pool, q).await?,
    ))
}
#[utoipa::path(get,path="/api/v1/bmm",params(pulse_storage::protocol::BmmQuery),responses((status=200,body=BmmMetricsResponse),(status=400,body=ApiError)),tag="pulse")]
pub async fn bmm(
    State(s): State<AppState>,
    PublicQuery(q): PublicQuery<pulse_storage::protocol::BmmQuery>,
) -> Result<Json<BmmMetricsResponse>, AppError> {
    Ok(Json(pulse_storage::bmm::metrics(&s.pool, q).await?))
}
async fn provenance(
    State(s): State<AppState>,
    OriginalUri(uri): OriginalUri,
    PublicQuery(q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    Ok(Json(
        pulse_storage::provenance::list(&s.pool, uri.path().trim_start_matches("/api/v1/"), q)
            .await?,
    ))
}
async fn provenance_detail(
    State(s): State<AppState>,
    OriginalUri(uri): OriginalUri,
    Path(id): Path<String>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    q.key = Some(id);
    let resource = uri
        .path()
        .trim_start_matches("/api/v1/")
        .split('/')
        .next()
        .ok_or(StorageError::InvalidQuery)?;
    let result = pulse_storage::provenance::list(&s.pool, resource, q).await?;
    if result.items.is_empty() {
        return Err(StorageError::NotFound.into());
    }
    Ok(Json(result))
}
async fn occurrences(
    State(s): State<AppState>,
    Path((dataset, id)): Path<(Uuid, i64)>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    q.dataset = Some(dataset);
    q.key = Some(id.to_string());
    Ok(Json(
        pulse_storage::provenance::list(&s.pool, "event-occurrences", q).await?,
    ))
}
#[utoipa::path(get,path="/api/v1/events",params(ProtocolQuery),responses((status=200,body=ProtocolPage),(status=400,body=ApiError),(status=409,body=ApiError)),tag="pulse")]
pub async fn list(
    State(s): State<AppState>,
    OriginalUri(uri): OriginalUri,
    PublicQuery(q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    let resource = uri
        .path()
        .strip_prefix("/api/v1/")
        .ok_or(StorageError::InvalidQuery)?;
    if resource == "search" && q.q.as_ref().is_none_or(|s| s.trim().is_empty()) {
        return Err(StorageError::InvalidQuery.into());
    }
    Ok(Json(
        pulse_storage::protocol::list(&s.pool, resource, q).await?,
    ))
}
async fn detail(
    State(s): State<AppState>,
    OriginalUri(uri): OriginalUri,
    Path(id): Path<String>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    let resource = uri
        .path()
        .strip_prefix("/api/v1/")
        .and_then(|v| v.split('/').next())
        .ok_or(StorageError::InvalidQuery)?;
    q.key = Some(id);
    q.scope.get_or_insert_with(|| "all".into());
    let result = pulse_storage::protocol::list(&s.pool, resource, q).await?;
    if result.items.is_empty() && result.context.state != "catching_up" {
        return Err(StorageError::NotFound.into());
    }
    Ok(Json(result))
}
async fn bundle(
    State(s): State<AppState>,
    Path(id): Path<String>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    q.q = Some(id);
    Ok(Json(
        pulse_storage::protocol::list(&s.pool, "withdrawal-bundles", q).await?,
    ))
}
async fn sidechain(
    State(s): State<AppState>,
    Path(slot): Path<i16>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ObservatoryResponse>, AppError> {
    q.slot = Some(slot);
    Ok(Json(
        pulse_storage::protocol::observatory(&s.pool, q).await?,
    ))
}
async fn slot_activity(
    State(s): State<AppState>,
    Path(slot): Path<i16>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    q.slot = Some(slot);
    Ok(Json(
        pulse_storage::protocol::list(&s.pool, "activity", q).await?,
    ))
}
async fn slot_instances(
    State(s): State<AppState>,
    Path(slot): Path<i16>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    q.slot = Some(slot);
    Ok(Json(
        pulse_storage::protocol::list(&s.pool, "sidechain-instances", q).await?,
    ))
}
async fn instance_ctip(
    State(s): State<AppState>,
    Path(id): Path<String>,
    PublicQuery(mut q): PublicQuery<ProtocolQuery>,
) -> Result<Json<ProtocolPage>, AppError> {
    let found = pulse_storage::protocol::list(
        &s.pool,
        "sidechain-instances",
        ProtocolQuery {
            dataset: q.dataset,
            key: Some(id.clone()),
            scope: Some("selected".into()),
            ..Default::default()
        },
    )
    .await?;
    let instance = found.items.first().ok_or(StorageError::NotFound)?;
    q.slot = instance.slot;
    q.dataset = Some(found.context.meta.dataset_id);
    q.scope = Some("selected".into());
    // Official snapshots are unanchored. The capture-time instance identity is
    // evidence; an inferred activation/ending height interval is not.
    q.instance_id = Some(id);
    let result = pulse_storage::protocol::list(&s.pool, "ctip/history", q).await?;
    if result.context.build_id != found.context.build_id
        || result.context.branch.revision != found.context.branch.revision
    {
        return Err(StorageError::StaleCursor.into());
    }
    Ok(Json(result))
}
#[derive(Deserialize)]
struct ExportQuery {
    resource: String,
    format: Option<String>,
}
fn csv_cell(v: &str) -> String {
    // CSV remains safe to open in spreadsheet tools; JSON preserves literal text.
    let safe = if v.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{v}")
    } else {
        v.to_owned()
    };
    format!("\"{}\"", safe.replace('"', "\"\""))
}
async fn export(
    State(s): State<AppState>,
    PublicQuery(q): PublicQuery<ExportQuery>,
    PublicQuery(query): PublicQuery<ProtocolQuery>,
) -> Result<Response, AppError> {
    let format = q.format.as_deref().unwrap_or("json");
    if !matches!(format, "json" | "csv") {
        return Err(StorageError::InvalidQuery.into());
    }
    let page = pulse_storage::protocol::export(&s.pool, &q.resource, query).await?;
    let truncated = page.next_cursor.is_some();
    let mut response = if format == "json" {
        Json(json!({"context":page.context,"items":page.items,"truncated":truncated}))
            .into_response()
    } else {
        let mut text = String::from(
            "id,entity_id,kind,slot,height,block_hash,quality,data,evidence,issue\r\n",
        );
        for i in &page.items {
            let fields = [
                i.id.clone(),
                i.entity_id.clone().unwrap_or_default(),
                i.kind.clone(),
                i.slot.map(|v| v.to_string()).unwrap_or_default(),
                i.height.map(|v| v.to_string()).unwrap_or_default(),
                i.hash.clone().unwrap_or_default(),
                i.quality.clone(),
                i.data.to_string(),
                serde_json::to_string(&i.evidence).unwrap_or_default(),
                i.issue.clone().unwrap_or_default(),
            ];
            text.push_str(
                &fields
                    .iter()
                    .map(|s| csv_cell(s))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            text.push_str("\r\n");
        }
        (
            [(axum::http::header::CONTENT_TYPE, "text/csv; charset=utf-8")],
            text,
        )
            .into_response()
    };
    for (name, value) in [
        ("x-pulse-truncated", truncated.to_string()),
        (
            "x-pulse-revision",
            page.context.meta.pulse_revision.to_string(),
        ),
        (
            "x-pulse-generation",
            page.context.meta.projection_generation.to_string(),
        ),
    ] {
        response.headers_mut().insert(
            axum::http::HeaderName::from_static(name),
            HeaderValue::from_str(&value).map_err(|_| StorageError::InvalidProjection)?,
        );
    }
    response.headers_mut().insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"pulse-export.{format}\""))
            .map_err(|_| StorageError::InvalidQuery)?,
    );
    Ok(response)
}
