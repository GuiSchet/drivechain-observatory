use super::*;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FamilyProgress {
    pub family: String,
    pub processed_event_id: Option<String>,
    pub first_error_event_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProtocolContext {
    pub meta: ResponseMeta,
    pub branch: BranchState,
    /// awaiting_data, catching_up, available, partial, or ambiguous.
    pub state: String,
    pub build_id: Option<String>,
    /// Immutable imported-event cut of this build, distinct from completeness.
    pub source_event_cut: Option<String>,
    pub anchor_hash: Option<String>,
    pub anchor_height: Option<i32>,
    pub semantics_version: String,
    pub semantics_supported: bool,
    /// Explanation when the reviewed semantic adapter cannot be applied.
    pub semantics_issue: Option<String>,
    pub families: Vec<FamilyProgress>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProtocolEvidence {
    pub event_id: String,
    pub ordinal: i32,
    pub observation_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProtocolItem {
    pub id: String,
    pub entity_id: Option<String>,
    pub kind: String,
    pub slot: Option<i16>,
    pub hash: Option<String>,
    pub height: Option<i32>,
    pub observed_at: Option<DateTime<Utc>>,
    pub block_time: Option<DateTime<Utc>>,
    /// observed, tip_matched, unknown. Raw evidence is available separately.
    pub quality: String,
    /// selected, alternative, unknown, or not_applicable.
    pub membership: String,
    /// Whether this entity is established at the published anchor; null if unknown.
    pub is_current: Option<bool>,
    pub evidence: Vec<ProtocolEvidence>,
    /// Typed monitor interpretation; monetary amounts and u64 values are strings.
    pub data: Value,
    pub issue: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProtocolPage {
    pub context: ProtocolContext,
    pub items: Vec<ProtocolItem>,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ObservatoryResponse {
    pub context: ProtocolContext,
    /// Separate latest official responses. These are not atomic state at the selected block;
    /// absence from an incomplete map does not mean zero or inactive.
    pub state: Value,
    /// Latest occurrence for each snapshot kind/slot in the current run, including
    /// inconsistent observations. A bad latest snapshot never falls back silently.
    pub observations: Vec<ProtocolItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmCell {
    pub hash: Option<String>,
    pub height: i32,
    /// present, observed_absent, uncovered, inactive, unknown_eligibility.
    pub state: String,
    pub commitment: Option<String>,
    pub evidence: Vec<ProtocolEvidence>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmSlotMetrics {
    pub slot: i16,
    pub present: u32,
    pub covered: u32,
    pub eligible: Option<u32>,
    pub rate: Option<f64>,
    pub coverage: Option<f64>,
    pub consecutive_present: u32,
    pub cells: Vec<BmmCell>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmMetricsResponse {
    pub context: ProtocolContext,
    pub window_blocks: u32,
    pub slots: Vec<BmmSlotMetrics>,
    pub next_slot: Option<i16>,
}
