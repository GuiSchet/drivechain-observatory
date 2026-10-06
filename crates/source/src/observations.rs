//! Official observations only. No vote, expiry, activation or treasury rules are replayed.
use crate::{
    normalize::{Entry, decode},
    *,
};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Evidence {
    pub event_id: String,
    pub ordinal: i32,
    pub observation_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub evidence: Evidence,
    pub entry: Entry,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Change {
    pub kind: String,
    pub key: String,
    pub slot: Option<u8>,
    pub data: Value,
    pub quality: String,
    pub evidence: Vec<Evidence>,
    pub issue: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalState {
    pub proposal: Proposal,
    pub id: String,
    pub evidence: Vec<Evidence>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleState {
    pub bundle: BundleProposal,
    pub attempt_id: String,
    pub evidence: Vec<Evidence>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct State {
    pub hash: Option<String>,
    pub height: Option<u32>,
    pub constants: Option<Constants>,
    pub semantics_supported: bool,
    #[serde(default)]
    pub parameters_evidence: Option<Evidence>,
    #[serde(default)]
    pub semantics_issue: Option<String>,
    /// These maps describe separate latest responses, never atomic state at hash/height.
    #[serde(default)]
    pub observation_windows: BTreeMap<String, Value>,
    pub active_complete: bool,
    pub proposals_complete: bool,
    pub active: BTreeMap<u8, Active>,
    pub proposals: BTreeMap<String, ProposalState>,
    pub treasury: BTreeMap<u8, Option<Ctip>>,
    pub bundles: BTreeMap<String, BundleState>,
    pub bundle_complete: BTreeSet<u8>,
    #[serde(default)]
    pub first_errors: BTreeMap<String, String>,
    #[serde(default)]
    pub observation_errors: BTreeMap<String, String>,
}

impl State {
    pub fn block(
        &mut self,
        hash: &str,
        _parent: &str,
        height: u32,
        records: &[Record],
        _complete: bool,
    ) -> Result<Vec<Change>> {
        self.hash = Some(hash.into());
        self.height = Some(height);
        let mut out = vec![];
        for r in records {
            if r.entry.error.is_some() {
                continue;
            }
            let kind = match r.entry.kind.as_str() {
                "deposit" => "deposit",
                "bundle_outcome" => "bundle_outcome",
                "confirmed_bmm_fee" => "bmm_confirmation",
                "slot_block" if !r.entry.data["bmm_commitment"].is_null() => "bmm_commitment",
                _ => continue,
            };
            out.push(Change {
                kind: kind.into(),
                key: r.entry.key.clone(),
                slot: r.entry.slot,
                data: r.entry.data.clone(),
                quality: "observed".into(),
                evidence: vec![r.evidence.clone()],
                issue: None,
            });
        }
        Ok(out)
    }
    /// Apply a validated, tip-matched response. The caller attaches its own
    /// observation window; matching tips do not prove atomicity between RPCs.
    pub fn snapshot(&mut self, r: &Record) -> Result<Vec<Change>> {
        let evidence = vec![r.evidence.clone()];
        let mut out = vec![];
        let mut emit = |kind: &str, key: String, slot: Option<u8>, data: Value| {
            out.push(Change {
                kind: kind.into(),
                key,
                slot,
                data,
                quality: "tip_matched".into(),
                evidence: evidence.clone(),
                issue: None,
            })
        };
        match r.entry.kind.as_str() {
            "active_set" => {
                let xs: Vec<Active> = decode(&r.entry.data["sidechains"])?;
                self.active = xs
                    .into_iter()
                    .map(|x| {
                        emit(
                            "instance",
                            x.instance_id(),
                            Some(x.sidechain_number),
                            json!({"sidechain":x,"status":"observed_active"}),
                        );
                        (x.sidechain_number, x)
                    })
                    .collect();
                self.active_complete = true;
            }
            "proposal_set" => {
                let xs: Vec<Proposal> = decode(&r.entry.data["proposals"])?;
                self.proposals=xs.into_iter().map(|p| {
                    let key=format!("{}:{}",p.sidechain_number,p.description_hash);
                    let id=format!("{key}:observed:{}",p.proposal_height);
                    emit("proposal",id.clone(),Some(p.sidechain_number),json!({"proposal":p,"status":"observed_pending","required_votes":null,"max_age":null}));
                    (key,ProposalState {proposal:p,id,evidence:evidence.clone()})
                }).collect();
                self.proposals_complete = true;
            }
            "ctip_snapshot" => {
                let x: CtipSnapshot = decode(&r.entry.data)?;
                emit(
                    "ctip",
                    x.sidechain_number.to_string(),
                    Some(x.sidechain_number),
                    json!({"ctip":x.ctip}),
                );
                self.treasury.insert(x.sidechain_number, x.ctip);
            }
            "bundle_set" => {
                let x: BundleSnapshot = decode(&r.entry.data)?;
                let prefix = format!("{}:", x.sidechain_number);
                self.bundles.retain(|k, _| !k.starts_with(&prefix));
                for b in x.proposals {
                    let key = format!("{prefix}{}", b.m6id);
                    let id = format!("{key}:observed:{}", b.proposal_height);
                    emit(
                        "bundle",
                        id.clone(),
                        Some(x.sidechain_number),
                        json!({"bundle":b,"status":"observed_pending","required_votes":null,"max_age":null}),
                    );
                    self.bundles.insert(
                        key,
                        BundleState {
                            bundle: b,
                            attempt_id: id,
                            evidence: evidence.clone(),
                        },
                    );
                }
                self.bundle_complete.insert(x.sidechain_number);
            }
            _ => {}
        }
        Ok(out)
    }
}
