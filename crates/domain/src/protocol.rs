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
    /// The latest occurrence of this item (when it was last read).
    pub observed_at: Option<DateTime<Utc>>,
    /// When the immutable fact was first recorded, if the list reports it.
    pub first_observed_at: Option<DateTime<Utc>>,
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
/// What L1 blocks of one recent period recorded, every figure counted over the same heights.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SummaryResponse {
    pub context: ProtocolContext,
    /// Absent while the projection catches up with a new block: nothing is counted then, which is not zero.
    pub window: Option<SummaryWindow>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SummaryWindow {
    pub hours: u32,
    /// Start of the period, by the database clock.
    pub since: DateTime<Utc>,
    /// The first selected block whose miner-set timestamp is inside the period, through the anchor. Block times are
    /// not monotonic, so a block in this range may carry an earlier timestamp.
    pub from_height: i32,
    pub to_height: i32,
    pub from_block_time: Option<DateTime<Utc>>,
    pub to_block_time: Option<DateTime<Utc>>,
    /// Heights in the range, and how many of them are on the selected branch the Observatory holds.
    pub blocks: i64,
    pub blocks_on_branch: i64,
    pub deposits: i64,
    pub deposited_sats: String,
    /// The weakest quality among the deposits counted, or none when there are none.
    pub deposit_quality: Option<String>,
    pub payouts_succeeded: i64,
    pub payouts_failed: i64,
    /// Blocks whose merged-mining facts the enforcer reported, and how many of those committed to a sidechain block.
    pub bmm_observed_blocks: i64,
    pub bmm_committed_blocks: i64,
    /// More records than one response holds: counts are lower bounds.
    pub truncated: bool,
}
/// One column of a dataset table and what it means.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DatasetColumn {
    pub name: String,
    pub description: String,
}
/// Records of one kind as typed columns, oldest first.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DatasetTable {
    /// File name without extension, such as `deposits`.
    pub name: String,
    pub description: String,
    pub columns: Vec<DatasetColumn>,
    /// One cell per column, as text; null when unknown. Satoshi amounts are exact integers.
    pub rows: Vec<Vec<Option<String>>>,
    /// More records exist than the table holds: narrow the height range.
    pub truncated: bool,
}
/// Everything the Observatory holds about one sidechain slot, read from a single build.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SidechainDataset {
    pub context: ProtocolContext,
    pub slot: i16,
    pub from_height: Option<i32>,
    pub to_height: Option<i32>,
    pub generated_at: DateTime<Utc>,
    /// Limits a reader must know before drawing conclusions from the tables.
    pub notes: Vec<String>,
    pub tables: Vec<DatasetTable>,
}
