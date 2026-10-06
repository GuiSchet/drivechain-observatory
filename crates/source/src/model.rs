use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Accept source JSON integers and our exact decimal-string projection format.
pub mod exact {
    use serde::{Deserialize, Deserializer, Serializer, de::Error};
    pub fn serialize<S: Serializer>(v: &u64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&v.to_string())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
        let v = serde_json::Value::deserialize(d)?;
        v.as_u64()
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            .ok_or_else(|| D::Error::custom("expected exact u64"))
    }
}
pub mod optional_exact {
    use serde::{Deserialize, Deserializer, Serializer, de::Error};
    pub fn serialize<S: Serializer>(v: &Option<u64>, s: S) -> Result<S::Ok, S::Error> {
        match v {
            Some(n) => s.serialize_some(&n.to_string()),
            None => s.serialize_none(),
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
        let v = Option::<serde_json::Value>::deserialize(d)?;
        v.map(|v| {
            v.as_u64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                .ok_or_else(|| D::Error::custom("expected exact u64"))
        })
        .transpose()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Header {
    pub hash: String,
    pub previous_hash: String,
    pub height: u32,
    pub block_work: String,
    pub cumulative_work: String,
    #[serde(with = "exact")]
    pub timestamp: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Constants {
    pub withdrawal_bundle_max_age: u32,
    pub withdrawal_bundle_inclusion_threshold: u32,
    pub used_sidechain_slot_proposal_max_age: u32,
    pub used_sidechain_slot_activation_threshold: u32,
    pub unused_sidechain_slot_proposal_max_age: u32,
    pub unused_sidechain_slot_activation_threshold: u32,
    pub activation_height: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainInfo {
    pub network: i32,
    pub raw_network: i32,
    pub bip300_constants: Option<Constants>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Declaration {
    pub declaration: Option<DeclarationVersion>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub enum DeclarationVersion {
    V0(DeclarationV0),
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeclarationV0 {
    pub title: String,
    pub description: String,
    pub hash_id_1: String,
    pub hash_id_2: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Proposal {
    pub sidechain_number: u8,
    pub raw_description: String,
    pub description_hash: String,
    pub vote_count: u32,
    pub proposal_height: u32,
    pub proposal_age: u32,
    pub declaration: Option<Declaration>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Active {
    pub sidechain_number: u8,
    pub raw_description: String,
    pub description_hash: String,
    pub vote_count: u32,
    pub proposal_height: u32,
    pub activation_height: u32,
    pub declaration: Option<Declaration>,
}
impl Active {
    pub fn instance_id(&self) -> String {
        format!(
            "{}:{}:{}:{}",
            self.sidechain_number,
            self.proposal_height,
            self.activation_height,
            self.description_hash
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Ctip {
    pub txid: String,
    pub vout: u32,
    #[serde(with = "exact")]
    pub value_sats: u64,
    #[serde(default, with = "optional_exact")]
    pub sequence_number: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CtipSnapshot {
    pub sidechain_number: u8,
    pub ctip: Option<Ctip>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Outpoint {
    pub txid: String,
    pub vout: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deposit {
    #[serde(with = "exact")]
    pub sequence_number: u64,
    pub outpoint: Outpoint,
    pub address: String,
    #[serde(with = "exact")]
    pub value_sats: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleEvent {
    pub m6id: String,
    pub state: Option<BundleOutcome>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BundleOutcome {
    Submitted(Value),
    Failed(Value),
    Succeeded(BundleSuccess),
    #[serde(other)]
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleSuccess {
    #[serde(with = "exact")]
    pub sequence_number: u64,
    pub transaction: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlotEvent {
    pub event: Option<SlotEventKind>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SlotEventKind {
    Deposit(Deposit),
    WithdrawalBundle(BundleEvent),
    #[serde(other)]
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connected {
    pub header: Header,
    pub sidechain_number: u8,
    pub bmm_commitment: Option<String>,
    pub events: Vec<Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Disconnected {
    pub block_hash: String,
    pub sidechain_number: u8,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BundleProposal {
    pub m6id: String,
    pub vote_count: u32,
    pub proposal_height: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleSnapshot {
    pub sidechain_number: u8,
    pub proposals: Vec<BundleProposal>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bid {
    pub sidechain_number: u8,
    pub txid: String,
    pub critical_hash: String,
    #[serde(with = "exact")]
    pub bid_sats: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Auction {
    pub observer_session: String,
    #[serde(with = "exact")]
    pub mempool_generation: u64,
    pub previous_mainchain_block_hash: String,
    pub requests: Vec<Bid>,
}

impl<'de> Deserialize<'de> for DeclarationVersion {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let value = Value::deserialize(d)?;
        if let Some(v) = value.get("V0") {
            serde_json::from_value(v.clone())
                .map(Self::V0)
                .map_err(serde::de::Error::custom)
        } else {
            Ok(Self::Unknown)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MainchainTransition {
    pub observer_session: String,
    #[serde(with = "exact")]
    pub sequence: u64,
    pub action: i32,
    pub header: Option<Header>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmedFees {
    pub header: Header,
    pub fees: Vec<ConfirmedFee>,
    pub source: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmedFee {
    pub sidechain_number: u8,
    pub txid: String,
    #[serde(default, with = "optional_exact")]
    pub fee_sats: Option<u64>,
    pub unavailable_reason: String,
}
