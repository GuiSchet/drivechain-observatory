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
/// Figures about one sidechain slot, all computed from the records of a single build.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SidechainStats {
    pub context: ProtocolContext,
    pub slot: i16,
    pub generated_at: DateTime<Utc>,
    /// Activation height of the sidechain now in the slot, if one is active.
    pub activation_height: Option<i32>,
    pub deposits: DepositStats,
    pub treasury: TreasuryStats,
    pub bmm: BmmStats,
    pub bids: BidStats,
    pub withdrawals: WithdrawalStats,
    /// The `window_blocks` newest L1 blocks, newest first.
    pub window_blocks: u32,
    pub series: Vec<StatsBlock>,
    /// Limits a reader must know before drawing conclusions from these figures.
    pub notes: Vec<String>,
    /// More records exist than one computation reads; counts are lower bounds.
    pub truncated: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DepositStats {
    pub count: u64,
    pub total_sats: String,
    pub median_sats: Option<String>,
    pub max_sats: Option<String>,
    pub first_height: Option<i32>,
    pub last_height: Option<i32>,
    pub last_block_time: Option<DateTime<Utc>>,
    /// Deposits whose miner-set block time is within the last 1, 7 and 30 days of `generated_at`.
    pub last_24h: u64,
    pub last_7d: u64,
    pub last_30d: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TreasuryStats {
    /// The latest treasury reading; null when no reading exists or the treasury is empty.
    pub value_sats: Option<String>,
    pub sequence: Option<String>,
    pub read_at_tip_height: Option<i32>,
    pub quality: Option<String>,
    /// Each deposit and paid withdrawal replaced the treasury output; oldest first.
    pub steps: Vec<TreasuryStep>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TreasuryStep {
    pub height: Option<i32>,
    pub sequence: Option<String>,
    /// deposit or withdrawal.
    pub change: String,
    /// The deposited amount; null for a withdrawal, whose amount L1 records do not state here.
    pub delta_sats: Option<String>,
    /// From a treasury reading of this output, or from the previous known value plus a deposit; null when unknown.
    pub value_after_sats: Option<String>,
    pub txid: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmWindowStats {
    /// Newest L1 blocks counted; for `since_activation`, the blocks from activation through the anchor.
    pub blocks: u32,
    /// Blocks whose merged-mining facts for this slot were observed.
    pub covered: u32,
    /// Observed blocks that committed to a block of this sidechain.
    pub present: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmGap {
    pub from_height: i32,
    pub to_height: i32,
    pub blocks: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BmmStats {
    /// 24, 144 and 1008 blocks.
    pub windows: Vec<BmmWindowStats>,
    pub since_activation: Option<BmmWindowStats>,
    /// Consecutive committing blocks ending at the anchor.
    pub streak: u32,
    pub last_commit_height: Option<i32>,
    pub blocks_since_last_commit: Option<i32>,
    /// The longest run of observed blocks without a commitment since activation.
    pub longest_gap: Option<BmmGap>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BidStats {
    /// Distinct bids the monitor saw, and the parent blocks they were made on.
    pub count: u64,
    pub parent_blocks: u64,
    pub median_sats: Option<String>,
    pub max_sats: Option<String>,
    pub last_parent_height: Option<i32>,
    pub last_sats: Option<String>,
    /// Bids whose next block was observed, and how many of those committed to the bid's critical hash.
    pub next_block_observed: u64,
    pub committed_next_block: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WithdrawalStats {
    pub pending: Vec<BundleProjection>,
    pub submitted: u64,
    pub succeeded: u64,
    pub failed: u64,
}
/// Where a pending withdrawal bundle stands against the threshold, at the pace votes have come so far.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BundleProjection {
    pub m6id_onchain: Option<String>,
    pub m6id_txid_order: Option<String>,
    pub proposal_height: Option<i32>,
    pub votes: Option<i64>,
    /// The tip where this vote count was first read; `age` runs to the anchor while the reading is still current.
    pub read_at_tip_height: Option<i32>,
    pub quality: String,
    /// Votes must exceed the threshold, so `needed` is threshold + 1 - votes.
    pub threshold: Option<i64>,
    pub needed: Option<i64>,
    pub age: Option<i64>,
    pub max_age: Option<i64>,
    pub expires_after_height: Option<i64>,
    pub blocks_left: Option<i64>,
    /// Votes divided by age.
    pub rate_since_proposal: Option<f64>,
    /// Change in votes over the readings of about the last 144 blocks, per block.
    pub rate_recent: Option<f64>,
    pub blocks_to_pass_at_rate: Option<i64>,
    /// At most one vote per block: false when even every remaining block cannot reach the threshold.
    pub can_still_pass: Option<bool>,
    pub passes_at_rate: Option<bool>,
}
/// One L1 block for one slot.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct StatsBlock {
    pub height: i32,
    pub hash: Option<String>,
    /// null when the block's merged-mining facts were not observed.
    pub committed: Option<bool>,
    /// Bids seen on the parent block, that is, offered for this block.
    pub bids: u32,
    pub top_bid_sats: Option<String>,
    /// Whether this block committed to the critical hash of one of those bids.
    pub bid_committed: Option<bool>,
}
/// L1 block pace, difficulty and estimated hashrate from the selected chain's headers.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct NetworkResponse {
    pub meta: ResponseMeta,
    pub branch: BranchState,
    pub tip: Option<NetworkBlock>,
    pub window_blocks: u32,
    /// Selected headers in the window; fewer than `window_blocks` when the chain is shorter or headers are missing.
    pub blocks: u32,
    pub interval_mean_seconds: Option<f64>,
    pub interval_median_seconds: Option<f64>,
    /// Work of the window's blocks after the first, divided by the time between the first and the last.
    pub hashrate_hps: Option<f64>,
    pub retarget: Option<RetargetEpoch>,
    /// Newest first.
    pub series: Vec<NetworkBlock>,
    pub notes: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct NetworkBlock {
    pub height: i32,
    pub hash: String,
    pub block_time: Option<DateTime<Utc>>,
    pub chain_work: Option<String>,
    pub block_work: Option<String>,
    /// block_work × 65535 / 2^48, the usual difficulty scale.
    pub difficulty: Option<f64>,
    /// Seconds since the previous block by miner-set timestamps; can be negative.
    pub interval_seconds: Option<i64>,
    /// Merged-mining bids the monitor saw for this block (made on its parent), across slots; null when it saw none.
    pub bids: Option<u32>,
    pub bid_slots: Option<u32>,
    pub bid_total_sats: Option<String>,
    pub top_bid_sats: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RetargetEpoch {
    pub interval_blocks: i32,
    pub target_spacing_seconds: i64,
    pub epoch_start_height: i32,
    pub next_retarget_height: i32,
    pub blocks_into_epoch: i32,
    pub blocks_remaining: i32,
    pub epoch_start_time: Option<DateTime<Utc>>,
    /// Mean seconds per block in this epoch so far.
    pub mean_spacing_seconds: Option<f64>,
    /// target spacing / mean spacing, limited to 0.25–4 like the retarget rule; noisy early in an epoch.
    pub estimated_adjustment: Option<f64>,
}
