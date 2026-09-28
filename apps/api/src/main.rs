use std::convert::Infallible;
use std::net::SocketAddr;
use std::time::Duration;

use anyhow::{Context as _, Result};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use clap::{Parser, Subcommand};
use pulse_domain::*;
use pulse_storage::StorageError;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::postgres::PgPool;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio::time::MissedTickBehavior;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;
use utoipa::OpenApi;
use uuid::Uuid;
mod protocol;

#[derive(Debug, Parser)]
#[command(version, about)]
struct Args {
    #[command(subcommand)]
    command: Option<Command>,

    #[arg(
        long,
        env = "PULSE_DATABASE_URL",
        default_value = "postgres://pulse_api:pulse_api_dev@127.0.0.1:55433/drivechain_pulse"
    )]
    database_url: String,

    #[arg(long, env = "PULSE_API_BIND", default_value = "127.0.0.1:8080")]
    bind: SocketAddr,

    #[arg(
        long,
        env = "PULSE_CORS_ORIGIN",
        default_value = "http://localhost:3000"
    )]
    cors_origin: HeaderValue,

    #[arg(long, env = "PULSE_NATIVE_SYMBOL", default_value = "sats")]
    native_symbol: String,

    #[arg(long, env = "PULSE_NATIVE_DECIMALS", default_value_t = 0)]
    native_decimals: u8,

    #[arg(long, env = "PULSE_STALE_AFTER_SECONDS", default_value_t = 30)]
    stale_after_seconds: i64,
}

#[derive(Debug, Subcommand)]
enum Command {
    MigrateOnly,
    Openapi,
}

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    updates: broadcast::Sender<StreamMessage>,
    native_symbol: String,
    native_decimals: u8,
    stale_after_seconds: i64,
}

#[derive(Clone)]
enum StreamMessage {
    Update(PublicUpdate),
    Window(pulse_storage::StreamWindow),
    Unavailable,
}

#[derive(OpenApi)]
#[openapi(
    info(title = "Drivechain - Observatory API"),
    paths(live, ready, meta, status, overview, sidechains, coverage, auctions, evidence, raw_evidence, blocks, block, protocol::observatory, protocol::list, protocol::bmm),
    components(schemas(
        ApiError,
        MetaResponse,
        OverviewResponse,
        SidechainsResponse,
        StatusResponse, CoverageResponse, BmmAuctionsResponse, EvidenceResponse, BlocksResponse, BlockResponse,
        ProtocolPage, ObservatoryResponse, BmmMetricsResponse
    )),
    tags((name = "pulse", description = "Drivechain - Observatory public API"))
)]
struct ApiDoc;

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    let args = Args::parse();
    anyhow::ensure!(
        args.stale_after_seconds > 0,
        "PULSE_STALE_AFTER_SECONDS must be positive"
    );
    if matches!(args.command, Some(Command::Openapi)) {
        println!(
            "{}",
            serde_json::to_string_pretty(&protocol::extend_openapi(serde_json::to_value(
                ApiDoc::openapi()
            )?))?
        );
        return Ok(());
    }
    let pool = pulse_storage::connect(&args.database_url, 10)
        .await
        .context("connecting to PostgreSQL Observatory")?;

    if matches!(args.command, Some(Command::MigrateOnly)) {
        pulse_storage::migrate(&pool)
            .await
            .context("applying Observatory migrations")?;
        info!("Observatory migrations applied");
        return Ok(());
    }

    let (updates, _) = broadcast::channel(1_024);
    tokio::spawn(poll_outbox(pool.clone(), updates.clone()));
    let state = AppState {
        pool,
        updates,
        native_symbol: args.native_symbol,
        native_decimals: args.native_decimals,
        stale_after_seconds: args.stale_after_seconds,
    };
    let cors = CorsLayer::new()
        .allow_origin(args.cors_origin)
        .allow_methods([Method::GET, Method::HEAD, Method::OPTIONS])
        .allow_headers(Any);
    let timed_routes = Router::new()
        .merge(protocol::routes())
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/api/v1/meta", get(meta))
        .route("/api/v1/status", get(status))
        .route("/api/v1/overview", get(overview))
        .route("/api/v1/sidechains", get(sidechains))
        .route("/api/v1/coverage", get(coverage))
        .route("/api/v1/blocks", get(blocks))
        .route("/api/v1/blocks/{hash}", get(block))
        .route("/api/v1/bmm/auctions", get(auctions))
        .route(
            "/api/v1/datasets/{dataset_id}/events/{event_id}",
            get(evidence),
        )
        .route(
            "/api/v1/datasets/{dataset_id}/events/{event_id}/raw",
            get(raw_evidence),
        )
        .route("/openapi.json", get(openapi))
        .route(
            "/docs",
            get(|| async { axum::response::Html(include_str!("docs.html")) }),
        )
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(15),
        ));
    let app = timed_routes
        .route("/api/v1/stream", get(stream))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = TcpListener::bind(args.bind)
        .await
        .with_context(|| format!("binding API listener to {}", args.bind))?;
    info!(address = %args.bind, "Drivechain - Observatory API listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("serving Drivechain - Observatory API")
}

#[utoipa::path(get, path = "/health/live", responses((status = 200)))]
async fn live() -> Json<Value> {
    Json(json!({ "status": "live" }))
}

#[utoipa::path(
    get,
    path = "/health/ready",
    responses(
        (status = 200),
        (status = 503, body = ApiError)
    )
)]
async fn ready(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    pulse_storage::ready(&state.pool)
        .await
        .map_err(StorageError::from)?;
    Ok(Json(json!({ "status": "ready" })))
}

#[utoipa::path(
    get,
    path = "/api/v1/meta",
    responses(
        (status = 200, body = MetaResponse),
        (status = 503, body = ApiError)
    ),
    tag = "pulse"
)]
async fn meta(State(state): State<AppState>) -> Result<Json<MetaResponse>, AppError> {
    pulse_storage::meta(&state.pool, &state.native_symbol, state.native_decimals)
        .await
        .map(Json)
        .map_err(AppError::from)
}

#[utoipa::path(
    get,
    path = "/api/v1/status",
    responses(
        (status = 200, body = StatusResponse),
        (status = 503, body = ApiError)
    ),
    tag = "pulse"
)]
async fn status(State(state): State<AppState>) -> Result<Json<StatusResponse>, AppError> {
    pulse_storage::status(&state.pool, state.stale_after_seconds)
        .await
        .map(Json)
        .map_err(AppError::from)
}

#[utoipa::path(
    get,
    path = "/api/v1/overview",
    responses(
        (status = 200, body = OverviewResponse),
        (status = 503, body = ApiError)
    ),
    tag = "pulse"
)]
async fn overview(State(state): State<AppState>) -> Result<Json<OverviewResponse>, AppError> {
    pulse_storage::overview(&state.pool)
        .await
        .map(Json)
        .map_err(AppError::from)
}

#[utoipa::path(
    get,
    path = "/api/v1/sidechains",
    responses(
        (status = 200, body = SidechainsResponse),
        (status = 503, body = ApiError)
    ),
    tag = "pulse"
)]
async fn sidechains(State(state): State<AppState>) -> Result<Json<SidechainsResponse>, AppError> {
    pulse_storage::sidechains(&state.pool)
        .await
        .map(Json)
        .map_err(AppError::from)
}

#[utoipa::path(get, path="/api/v1/coverage", responses((status=200,body=CoverageResponse),(status=503,body=ApiError)),tag="pulse")]
async fn coverage(State(state): State<AppState>) -> Result<Json<CoverageResponse>, AppError> {
    Ok(Json(
        pulse_storage::coverage(&state.pool, state.stale_after_seconds).await?,
    ))
}
#[utoipa::path(get, path="/api/v1/bmm/auctions", responses((status=200,body=BmmAuctionsResponse),(status=503,body=ApiError)),tag="pulse")]
async fn auctions(State(state): State<AppState>) -> Result<Json<BmmAuctionsResponse>, AppError> {
    Ok(Json(
        pulse_storage::auctions(&state.pool, state.stale_after_seconds).await?,
    ))
}
#[utoipa::path(get,path="/api/v1/datasets/{dataset_id}/events/{event_id}",
    params(("dataset_id"=Uuid,Path),("event_id"=String,Path)),
    responses((status=200,body=EvidenceResponse),(status=404,body=ApiError)),tag="pulse")]
async fn evidence(
    State(state): State<AppState>,
    Path((dataset, id)): Path<(Uuid, i64)>,
) -> Result<Json<EvidenceResponse>, AppError> {
    Ok(Json(
        pulse_storage::evidence(&state.pool, dataset, id).await?,
    ))
}
#[utoipa::path(get,path="/api/v1/datasets/{dataset_id}/events/{event_id}/raw",
    params(("dataset_id"=Uuid,Path),("event_id"=String,Path)),
    responses((status=200,body=String,content_type="application/json"),(status=404,body=ApiError)),tag="pulse")]
async fn raw_evidence(
    State(state): State<AppState>,
    Path((dataset, id)): Path<(Uuid, i64)>,
) -> Result<Response, AppError> {
    let evidence = pulse_storage::evidence(&state.pool, dataset, id).await?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        evidence.payload_json,
    )
        .into_response())
}

#[utoipa::path(get,path="/api/v1/blocks",params(pulse_storage::blocks::BlocksQuery),responses((status=200,body=BlocksResponse),(status=400,body=ApiError),(status=409,body=ApiError)),tag="pulse")]
async fn blocks(
    State(state): State<AppState>,
    query: Result<
        Query<pulse_storage::blocks::BlocksQuery>,
        axum::extract::rejection::QueryRejection,
    >,
) -> Result<Json<BlocksResponse>, AppError> {
    let Query(query) = query.map_err(|_| AppError::from(StorageError::InvalidQuery))?;
    Ok(Json(
        pulse_storage::blocks::blocks(&state.pool, query).await?,
    ))
}
#[derive(Deserialize)]
struct BlockQuery {
    dataset: Option<Uuid>,
}
#[utoipa::path(get,path="/api/v1/blocks/{hash}",params(("hash"=String,Path),("dataset"=Option<Uuid>,Query)),responses((status=200,body=BlockResponse),(status=400,body=ApiError),(status=404,body=ApiError)),tag="pulse")]
async fn block(
    State(state): State<AppState>,
    Path(hash): Path<String>,
    query: Result<Query<BlockQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<BlockResponse>, AppError> {
    let Query(query) = query.map_err(|_| AppError::from(StorageError::InvalidQuery))?;
    Ok(Json(
        pulse_storage::blocks::block(&state.pool, query.dataset, &hash).await?,
    ))
}

#[derive(Debug, Deserialize)]
struct StreamQuery {
    cursor: Option<String>,
}

async fn stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<StreamQuery>,
) -> Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>> {
    let requested = headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .or(query.cursor);
    // Subscribe before capturing the replay boundary: commits during replay are
    // queued by the one shared poller and deduplicated against that boundary.
    let mut updates = state.updates.subscribe();
    let pool = state.pool;
    let output = async_stream::stream! {
        let window=match pulse_storage::stream_window(&pool).await {
            Ok(window)=>window,
            Err(_)=>{yield Ok(reset_event("local_unavailable"));return;}
        };
        let mut cursor=if let Some(value)=requested {
            match StreamCursor::parse(&value).filter(|cursor|window.accepts(*cursor)) {
                Some(cursor)=>cursor,
                None=>{yield Ok(reset_event("cursor_incompatible"));return;}
            }
        } else {window.cursor};
        while cursor.revision<window.cursor.revision {
            let batch=match pulse_storage::updates_after(&pool,cursor,window.cursor.revision,500).await {
                Ok(batch) if !batch.is_empty()=>batch,
                _=>{yield Ok(reset_event("replay_unavailable"));return;}
            };
            for mut update in batch {
                // Replay refreshes the view but must never animate historical work.
                for activity in &mut update.activity{if let Some(a)=activity.as_object_mut(){a.insert("animation_eligible".into(),serde_json::Value::Bool(false));}}
                cursor.revision=update.revision;
                if let Some(event)=update_event(&update) {yield Ok(event);}
            }
        }
        let mut heartbeat=tokio::time::interval(Duration::from_secs(15));
        heartbeat.set_missed_tick_behavior(MissedTickBehavior::Skip);
        heartbeat.tick().await;
        loop {
            tokio::select! {
                update=updates.recv()=>match update {
                    Ok(StreamMessage::Update(update))=>{
                        if update.dataset_id!=cursor.dataset_id || update.projection_generation!=cursor.generation {
                            yield Ok(reset_event("generation_changed"));return;
                        }
                        if update.revision>cursor.revision {
                            cursor.revision=update.revision;
                            if let Some(event)=update_event(&update) {yield Ok(event);}
                        }
                    },
                    Ok(StreamMessage::Window(window))=>{
                        if cursor.dataset_id != window.cursor.dataset_id || cursor.generation != window.cursor.generation || cursor.revision < window.floor {yield Ok(reset_event("cursor_expired"));return;}
                    },
                    Ok(StreamMessage::Unavailable)=>{yield Ok(reset_event("local_unavailable"));return;},
                    Err(broadcast::error::RecvError::Lagged(_))=>{yield Ok(reset_event("slow_client"));return;},
                    Err(broadcast::error::RecvError::Closed)=>return,
                },
                _=heartbeat.tick()=>{yield Ok(Event::default().event("heartbeat").data("ok"));}
            }
        }
    };
    Sse::new(output).keep_alive(KeepAlive::new().interval(Duration::from_secs(10)))
}
fn reset_event(reason: &str) -> Event {
    Event::default().event("reset_required").id("").data(reason)
}

fn update_event(update: &PublicUpdate) -> Option<Event> {
    let id = format!(
        "{}:{}:{}",
        update.dataset_id, update.projection_generation, update.revision
    );
    match Event::default().event("update").id(id).json_data(update) {
        Ok(event) => Some(event),
        Err(error) => {
            error!(%error, "failed to serialize SSE update");
            None
        }
    }
}

async fn poll_outbox(pool: PgPool, updates: broadcast::Sender<StreamMessage>) {
    let mut cursor: Option<StreamCursor> = None;
    let mut interval = tokio::time::interval(Duration::from_millis(500));
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        let window = match pulse_storage::stream_window(&pool).await {
            Ok(window) => window,
            Err(error) => {
                warn!(%error,"SSE outbox unavailable");
                let _ = updates.send(StreamMessage::Unavailable);
                continue;
            }
        };
        let _ = updates.send(StreamMessage::Window(window.clone()));
        let mut current = match cursor.filter(|cursor| window.accepts(*cursor)) {
            Some(cursor) => cursor,
            None => {
                cursor = Some(window.cursor);
                continue;
            }
        };
        // Drain bounded pages across ticks. Subscribers receive ordered batches;
        // replay itself independently reads all pages to its captured boundary.
        match pulse_storage::updates_after(&pool, current, window.cursor.revision, 500).await {
            Ok(batch) => {
                for update in batch {
                    current.revision = update.revision;
                    let _ = updates.send(StreamMessage::Update(update));
                }
                cursor = Some(current);
            }
            Err(error) => {
                warn!(%error,"failed to poll SSE outbox");
                let _ = updates.send(StreamMessage::Unavailable);
            }
        }
    }
}

async fn openapi() -> Json<Value> {
    Json(protocol::extend_openapi(
        serde_json::to_value(ApiDoc::openapi()).expect("serializable OpenAPI"),
    ))
}

pub(crate) struct AppError {
    status: StatusCode,
    code: &'static str,
    message: &'static str,
}

impl From<StorageError> for AppError {
    fn from(error: StorageError) -> Self {
        match error {
            StorageError::InvalidQuery => Self {
                status: StatusCode::BAD_REQUEST,
                code: "invalid_query",
                message: "Invalid query or cursor",
            },
            StorageError::StaleCursor => Self {
                status: StatusCode::CONFLICT,
                code: "cursor_reset_required",
                message: "The dataset, generation, branch or filters changed; restart pagination",
            },
            StorageError::NotFound => Self {
                status: StatusCode::NOT_FOUND,
                code: "evidence_not_found",
                message: "Evidence not found in this dataset",
            },
            StorageError::InvalidProjection => Self {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                code: "invalid_projection",
                message: "Invalid local projection",
            },
            StorageError::NoDataset => Self {
                status: StatusCode::SERVICE_UNAVAILABLE,
                code: "data_not_available",
                message: "Observatory has not imported a dataset yet",
            },
            StorageError::Database(error) => {
                error!(%error, "database request failed");
                Self {
                    status: StatusCode::SERVICE_UNAVAILABLE,
                    code: "database_unavailable",
                    message: "Observatory data is temporarily unavailable",
                }
            }
            StorageError::InvalidSyncMode(value) => {
                error!(%value, "invalid sync mode persisted");
                Self {
                    status: StatusCode::INTERNAL_SERVER_ERROR,
                    code: "invalid_projection_state",
                    message: "Observatory projection state is invalid",
                }
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ApiError {
                code: self.code.to_owned(),
                message: self.message.to_owned(),
                request_id: None,
            }),
        )
            .into_response()
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            error!(%error, "failed to install Ctrl+C handler");
        }
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => error!(%error, "failed to install SIGTERM handler"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
    info!("shutdown signal received");
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();
}

#[cfg(test)]
mod tests {
    use pulse_domain::StreamCursor;
    #[test]
    fn requires_full_scoped_cursor() {
        assert!(StreamCursor::parse("42").is_none());
        assert!(StreamCursor::parse("11111111-1111-4111-8111-111111111111:2:4812").is_some());
        assert!(StreamCursor::parse("11111111-1111-4111-8111-111111111111:2:-1").is_none());
        assert!(StreamCursor::parse("11111111-1111-4111-8111-111111111111:2:1:extra").is_none());
    }
}
