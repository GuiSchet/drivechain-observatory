use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;
use uuid::Uuid;
pub mod protocol;
pub use protocol::*;

pub const PROJECTION_VERSION: i32 = 8;
pub const PROJECTION_GENERATION: i64 = 8;
pub const REQUIRED_MONITOR_SCHEMA_VERSION: i32 = 10;
pub const MONITOR_EVENT_CONTRACT_VERSIONS: &[i32] = &[9];
pub const REQUIRED_CAPABILITIES: &[&str] = &[
    "official_enforcer_api",
    "tip_matched_snapshots",
    "bmm_readiness_unknown",
    "event_facts",
    "event_observations",
    "tip_observations",
    "snapshot_consistency",
    "certified_hash_history",
    "immutable_fact_conflicts",
    "per_worker_health",
    "resumable_sidechain_history",
    "node_block_evidence",
    "absolute_chain_work",
    "resumable_node_history",
    "validated_chain_identity",
];

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ResponseMeta {
    pub network_id: String,
    pub dataset_id: Uuid,
    pub projection_version: i32,
    #[serde(with = "i64_string")]
    #[schema(value_type = String)]
    pub projection_generation: i64,
    #[serde(with = "i64_string")]
    #[schema(value_type = String)]
    pub pulse_revision: i64,
    #[serde(with = "optional_i64_string")]
    #[schema(value_type = Option<String>)]
    pub data_as_of_event_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Dataset {
    pub dataset_id: Uuid,
    pub network_id: String,
    pub activation_height: i32,
    pub activation_block_hash: String,
    pub capabilities: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MetaResponse {
    pub meta: ResponseMeta,
    pub dataset: Dataset,
    pub native_asset: NativeAsset,
    pub source_schema_version: Option<i32>,
    pub current_run: Option<RunInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct NativeAsset {
    pub symbol: String,
    pub decimals: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SyncMode {
    Bootstrap,
    CatchingUp,
    Following,
    Interrupted,
    Incompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct StatusResponse {
    pub branch: BranchState,
    pub meta: ResponseMeta,
    pub sync_mode: SyncMode,
    pub source_reachable: bool,
    pub last_source_contact_at: Option<DateTime<Utc>>,
    pub last_projection_update_at: Option<DateTime<Utc>>,
    pub latest_observed_block: Option<ObservedBlock>,
    pub extractors: Vec<ExtractorStatus>,
    pub sync_stale: bool,
    pub last_cycle_at: Option<DateTime<Utc>>,
    pub stale_after_seconds: i64,
    pub progress: Vec<ProjectionProgress>,
    pub cursors: Vec<StreamProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ExtractorStatus {
    pub source: String,
    pub run_id: Uuid,
    pub last_tip_hash: Option<String>,
    pub last_tip_height: Option<i32>,
    pub last_error: Option<String>,
    pub source_updated_at: DateTime<Utc>,
    pub workers: Vec<WorkerStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RunInfo {
    pub run_id: Uuid,
    pub event_contract_version: i32,
    pub capabilities: Value,
    pub monitor_commit: String,
    pub node_commit: String,
    pub enforcer_commit: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WorkerStatus {
    pub worker: String,
    pub state: String,
    pub consecutive_failures: i32,
    pub last_error: Option<String>,
    pub last_success_at: Option<DateTime<Utc>>,
    pub last_failure_at: Option<DateTime<Utc>>,
    pub source_updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProjectionProgress {
    pub name: String,
    pub processed_event_id: Option<String>,
    pub error_event_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct StreamProgress {
    pub stream: String,
    pub imported_through: String,
    pub source_high_water: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CoverageResponse {
    pub branch: BranchState,
    pub meta: ResponseMeta,
    pub streams: Vec<CoverageScope>,
    pub local_status: String,
    pub snapshot_history: String,
    pub observation_quality: Value,
    /// Subscription boundaries of the global transition stream, newest first:
    /// each bounds an interval whose connects and disconnects are unknown.
    pub transition_gaps: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CoverageScope {
    pub verification: Option<BranchCoverage>,
    pub revision_id: String,
    pub stream: String,
    pub slot: Option<i16>,
    pub instance_id: Option<String>,
    pub event_contract_version: i32,
    pub source_status: String,
    pub start_height: Option<i32>,
    pub target_height: Option<i32>,
    pub covered_height: Option<i32>,
    pub changed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
pub struct BmmBid {
    pub slot: u8,
    pub txid: String,
    pub critical_hash: String,
    pub bid_sats: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmAuctionsResponse {
    /// Official GetSeenBmmRequests exposes neither readiness nor total mempool coverage.
    pub mempool_readiness: String,
    pub bid_coverage: String,
    pub meta: ResponseMeta,
    /// available, no_observed_bids, stale, unavailable, awaiting_observation, rpc_error,
    /// interpretation_error, or awaiting_current_parent.
    pub state: String,
    pub source_event_id: Option<String>,
    pub observation_id: Option<String>,
    pub run_id: Option<Uuid>,
    pub observed_at: Option<DateTime<Utc>>,
    pub parent_hash: Option<String>,
    pub requests: Vec<BmmBid>,
    pub evidence_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EvidenceOccurrence {
    pub observation_id: String,
    pub run_id: Uuid,
    pub capture_seq: String,
    pub capture_method: String,
    pub observed_at: DateTime<Utc>,
    pub snapshot_group_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EvidenceResponse {
    pub meta: ResponseMeta,
    pub source_event_id: String,
    pub event_contract_version: i32,
    pub kind: String,
    pub fact_sha256: Option<String>,
    pub envelope_hex: String,
    /// JSON text, deliberately not a JS-number-bearing object. Copy verbatim.
    pub payload_json: String,
    /// True for a node raw block imported without its body: `envelope_hex` is
    /// empty and `payload_json` lacks `raw_block`. `fact_sha256` still hashes
    /// the full source block.
    pub raw_block_omitted: bool,
    pub interpretation_error: Option<String>,
    pub occurrences: Vec<EvidenceOccurrence>,
    pub occurrences_truncated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamCursor {
    pub dataset_id: Uuid,
    pub generation: i64,
    pub revision: i64,
}

impl StreamCursor {
    pub fn parse(value: &str) -> Option<Self> {
        let mut parts = value.split(':');
        let cursor = Self {
            dataset_id: parts.next()?.parse().ok()?,
            generation: parts.next()?.parse().ok()?,
            revision: parts.next()?.parse().ok()?,
        };
        (parts.next().is_none() && cursor.generation > 0 && cursor.revision >= 0).then_some(cursor)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ObservedBlock {
    pub hash: String,
    pub height: i32,
    pub observed_at: DateTime<Utc>,
    pub branch_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct OverviewResponse {
    pub branch: BranchState,
    pub meta: ResponseMeta,
    pub latest_observed_block: Option<ObservedBlock>,
    pub active_sidechains: Option<i64>,
    pub pending_proposals: Option<i64>,
    pub pending_withdrawal_bundles: Option<i64>,
    pub source_events_imported: String,
    pub source_observations_imported: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SidechainsResponse {
    pub meta: ResponseMeta,
    pub state: String,
    pub complete: bool,
    pub sidechains: Vec<SidechainSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SidechainSummary {
    pub slot: i16,
    pub instance_id: String,
    pub proposal_height: i32,
    pub activation_height: i32,
    pub is_current: bool,
    pub title: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PublicUpdate {
    pub dataset_id: Uuid,
    #[serde(with = "i64_string")]
    #[schema(value_type = String)]
    pub projection_generation: i64,
    #[serde(with = "i64_string")]
    #[schema(value_type = String)]
    pub revision: i64,
    #[serde(with = "optional_i64_string")]
    #[schema(value_type = Option<String>)]
    pub source_event_id: Option<i64>,
    pub changed: Vec<String>,
    pub activity: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    pub request_id: Option<String>,
}

mod i64_string {
    use serde::{Deserialize as _, Deserializer, Serializer};

    pub fn serialize<S>(value: &i64, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer)?
            .parse()
            .map_err(serde::de::Error::custom)
    }
}

mod optional_i64_string {
    use serde::{Deserialize as _, Deserializer, Serializer};

    pub fn serialize<S>(value: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(value) => serializer.serialize_some(&value.to_string()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<String>::deserialize(deserializer)?
            .map(|value| value.parse().map_err(serde::de::Error::custom))
            .transpose()
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{PROJECTION_GENERATION, ResponseMeta};

    #[test]
    fn serializes_large_identifiers_as_strings() {
        let value = serde_json::to_value(ResponseMeta {
            network_id: "alphanet".to_owned(),
            dataset_id: Uuid::nil(),
            projection_version: 1,
            projection_generation: PROJECTION_GENERATION,
            pulse_revision: i64::MAX,
            data_as_of_event_id: Some(i64::MAX),
        })
        .expect("serializable response metadata");
        assert_eq!(value["pulse_revision"], i64::MAX.to_string());
        assert_eq!(value["data_as_of_event_id"], i64::MAX.to_string());
    }
}

/// A branch verdict is bounded by its verified lower boundary, not consensus finality.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
pub struct BranchState {
    #[serde(default)]
    pub node_tip_hash: Option<String>,
    #[serde(default)]
    pub node_tip_height: Option<i32>,
    /// matched, different_tips, or unknown. Does not change the selected enforcer branch.
    #[serde(default)]
    pub joint_source_status: String,

    pub processing: bool,
    pub status: String,
    pub basis: String,
    pub revision: String,
    pub run_id: Option<Uuid>,
    pub capture_seq: String,
    pub tip_hash: Option<String>,
    pub tip_height: Option<i32>,
    pub observed_at: Option<DateTime<Utc>>,
    pub verified_from_height: Option<i32>,
    pub missing_parent: Option<String>,
    pub checkpoint_status: String,
    pub evidence_type: Option<String>,
    pub evidence_id: Option<String>,
    pub processed_events: String,
    pub processed_observations: String,
    pub processed_tips: String,
    pub processed_coverage: String,
}
impl BranchState {
    pub fn awaiting() -> Self {
        Self {
            status: "provisional".into(),
            basis: "awaiting_reconstruction".into(),
            revision: "0".into(),
            capture_seq: "0".into(),
            checkpoint_status: "unobserved".into(),
            processed_events: "0".into(),
            processed_observations: "0".into(),
            processed_tips: "0".into(),
            processed_coverage: "0".into(),
            ..Self::default()
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BranchCoverage {
    pub status: String,
    pub verified_from_height: Option<i32>,
    pub verified_through_height: Option<i32>,
    pub first_gap_height: Option<i32>,
    pub covered_blocks: String,
    pub branch_revision: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BlockSummary {
    pub hash: String,
    pub parent_hash: String,
    pub height: i32,
    pub chain_work: String,
    pub block_work: Option<String>,
    pub block_time: DateTime<Utc>,
    pub first_observed_at: DateTime<Utc>,
    pub last_observed_at: DateTime<Utc>,
    pub membership: String,
    pub conflicted: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BlocksResponse {
    pub meta: ResponseMeta,
    pub branch: BranchState,
    pub blocks: Vec<BlockSummary>,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BlockFact {
    pub event_id: String,
    pub kind: String,
    pub slot: Option<i16>,
    pub instance_id: Option<String>,
    pub contract: i32,
    pub observed_at: DateTime<Utc>,
    pub ingested_at: DateTime<Utc>,
    pub interpretation_error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BlockObservation {
    pub observation_id: String,
    pub event_id: String,
    pub kind: String,
    pub slot: Option<i16>,
    pub run_id: Uuid,
    pub capture_seq: String,
    pub capture_method: String,
    pub observed_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BlockResponse {
    pub meta: ResponseMeta,
    pub branch: BranchState,
    pub block: BlockSummary,
    pub facts: Vec<BlockFact>,
    pub observations: Vec<BlockObservation>,
    pub facts_truncated: bool,
    pub observations_truncated: bool,
}
