//! Deterministic state reconstruction for the reviewed observer enforcer.
//! Snapshots are observations; a missing block invalidates continuity, not history.
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
fn proposal_key(slot: u8, hash: &str) -> String {
    format!("{slot}:{hash}")
}
fn bundle_key(slot: u8, id: &str) -> String {
    format!("{slot}:{id}")
}
fn change(
    kind: &str,
    key: String,
    slot: Option<u8>,
    data: Value,
    evidence: Vec<Evidence>,
    quality: &str,
    issue: Option<String>,
) -> Change {
    Change {
        kind: kind.into(),
        key,
        slot,
        data,
        quality: quality.into(),
        evidence,
        issue,
    }
}
fn same_ctip(a: &Option<Ctip>, b: &Option<Ctip>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a.txid == b.txid && a.vout == b.vout && a.value_sats == b.value_sats,
        (None, None) => true,
        _ => false,
    }
}
impl State {
    fn proposal_change(&self, p: &ProposalState, status: &str, quality: &str) -> Change {
        let p0 = &p.proposal;
        let context = self.active_complete || self.active.contains_key(&p0.sidechain_number);
        let rule = self
            .constants
            .as_ref()
            .filter(|_| context && self.semantics_supported)
            .map(|c| {
                if self.active.contains_key(&p0.sidechain_number) {
                    (
                        c.used_sidechain_slot_activation_threshold,
                        c.used_sidechain_slot_proposal_max_age,
                    )
                } else {
                    (
                        c.unused_sidechain_slot_activation_threshold,
                        c.unused_sidechain_slot_proposal_max_age,
                    )
                }
            });
        change(
            "proposal",
            p.id.clone(),
            Some(p0.sidechain_number),
            json!({"proposal":p0,"status":status,"required_votes":rule.map(|(t,_)|u64::from(t)+1),"max_age":rule.map(|(_,a)|a)}),
            p.evidence.clone(),
            quality,
            None,
        )
    }
    fn bundle_change(&self, slot: u8, b: &BundleState, status: &str, quality: &str) -> Change {
        let rule = self.constants.as_ref().filter(|_| self.semantics_supported);
        change(
            "bundle",
            b.attempt_id.clone(),
            Some(slot),
            json!({"bundle":b.bundle,"status":status,"required_votes":rule.map(|c|u64::from(c.withdrawal_bundle_inclusion_threshold)+1),"max_age":rule.map(|c|c.withdrawal_bundle_max_age)}),
            b.evidence.clone(),
            quality,
            None,
        )
    }
    fn lose_continuity(&mut self) {
        self.active.clear();
        self.proposals.clear();
        self.treasury.clear();
        self.bundles.clear();
        self.active_complete = false;
        self.proposals_complete = false;
        self.bundle_complete.clear();
    }
    /// Entries must come from one block and be de-duplicated by economic identity.
    /// A verified full global delta proves absence of additional protocol effects.
    pub fn block(
        &mut self,
        hash: &str,
        parent: &str,
        height: u32,
        records: &[Record],
        global_complete: bool,
    ) -> Result<Vec<Change>> {
        let mut out = vec![];
        let contiguous = self.hash.as_deref() == Some(parent)
            && self.height.and_then(|h| h.checked_add(1)) == Some(height);
        if !contiguous || !global_complete {
            self.lose_continuity();
            out.push(change("gap",hash.into(),None,json!({"reason":if !global_complete {"missing_or_invalid_global_delta"} else {"missing_predecessor"}}),vec![],"unknown",None));
        }
        if global_complete
            && self
                .constants
                .as_ref()
                .is_some_and(|c| c.activation_height == height)
        {
            self.active_complete = true;
            self.proposals_complete = true;
        }
        self.hash = Some(hash.into());
        self.height = Some(height);
        // Scope failures to the dependent families and slots. Historical errors
        // survive later snapshots: recovering current state does not fill a gap.
        let mut invalid: BTreeMap<(String, Option<u8>), Vec<Evidence>> = BTreeMap::new();
        for r in records
            .iter()
            .filter(|r| r.entry.error.is_some() && r.entry.family != "blocks")
        {
            let own_family = [r.entry.family.as_str()];
            let families: &[&str] = match r.entry.family.as_str() {
                "protocol" => &[
                    "protocol",
                    "proposals",
                    "sidechains",
                    "treasury",
                    "bundles",
                    "bmm",
                ],
                "proposals" | "sidechains" => &["proposals", "sidechains"],
                "treasury" => &["treasury", "bundles"],
                _ => &own_family,
            };
            for family in families {
                invalid
                    .entry(((*family).into(), r.entry.slot))
                    .or_default()
                    .push(r.evidence.clone());
            }
        }
        for ((family, slot), evidence) in &invalid {
            let affected = |s: u8| slot.is_none_or(|n| n == s);
            match family.as_str() {
                "sidechains" => {
                    self.active.retain(|s, _| !affected(*s));
                    self.active_complete = false;
                }
                "proposals" => {
                    self.proposals
                        .retain(|_, p| !affected(p.proposal.sidechain_number));
                    self.proposals_complete = false;
                }
                "treasury" => self.treasury.retain(|s, _| !affected(*s)),
                "bundles" => {
                    self.bundles
                        .retain(|key, _| !slot.is_none_or(|s| key.starts_with(&format!("{s}:"))));
                    self.bundle_complete.retain(|s| !affected(*s));
                }
                _ => {}
            }
            if let Some(first) = evidence
                .iter()
                .filter_map(|e| e.event_id.parse::<u64>().ok())
                .min()
            {
                let prior = self
                    .first_errors
                    .entry(family.clone())
                    .or_insert_with(|| first.to_string());
                if prior.parse::<u64>().is_ok_and(|old| first < old) {
                    *prior = first.to_string();
                }
            }
            out.push(change(
                "gap",
                format!("{hash}:{family}:{slot:?}"),
                *slot,
                json!({"family":family,"reason":"invalid_or_conflicting_evidence"}),
                evidence.clone(),
                "unknown",
                Some("family cannot be reconstructed through this block in this scope".into()),
            ));
        }
        let blocked = |family: &str, slot: Option<u8>| {
            invalid.contains_key(&(family.to_owned(), None))
                || slot.is_some_and(|s| invalid.contains_key(&(family.to_owned(), Some(s))))
        };
        // Resolved coinbase effects run before expiration and non-coinbase txs.
        if self.semantics_supported && global_complete {
            let mut messages: Vec<_> = records
                .iter()
                .filter(|r| {
                    r.entry.error.is_none()
                        && !blocked(&r.entry.family, r.entry.slot)
                        && matches!(r.entry.kind.as_str(), "m1" | "m2" | "m3" | "m4" | "m7")
                })
                .collect();
            messages.sort_by_key(|r| r.entry.data["vout"].as_u64());
            for r in messages {
                // M4 can update several slots; keep effects outside a failed scope.
                let mut r = r.clone();
                if let Some(effects) = r
                    .entry
                    .data
                    .pointer_mut("/message/M4/effects")
                    .and_then(Value::as_array_mut)
                {
                    effects.retain(|e| {
                        !blocked(
                            "bundles",
                            e["sidechain_number"]
                                .as_u64()
                                .and_then(|n| n.try_into().ok()),
                        )
                    });
                }
                self.message(&r, height, hash, &mut out)?;
            }
            self.expire(height, &mut out);
        }
        for r in records {
            if r.entry.error.is_some() || blocked(&r.entry.family, r.entry.slot) {
                continue;
            }
            if r.entry.kind == "confirmed_bmm"
                || (r.entry.kind == "m7" && r.entry.data["accepted"] == true)
            {
                out.push(change(
                    if r.entry.kind == "m7" {
                        "bmm_commitment"
                    } else {
                        "bmm_confirmation"
                    },
                    r.entry.key.clone(),
                    r.entry.slot,
                    r.entry.data.clone(),
                    vec![r.evidence.clone()],
                    "observed",
                    None,
                ));
            }
            if r.entry.kind == "treasury_transition" {
                self.transition(r, &mut out)?;
            } else if r.entry.kind == "deposit" {
                out.push(change(
                    "deposit",
                    r.entry.key.clone(),
                    r.entry.slot,
                    r.entry.data.clone(),
                    vec![r.evidence.clone()],
                    "observed",
                    None,
                ));
            } else if r.entry.kind == "bundle_outcome" {
                self.outcome(r, height, hash, &mut out)?;
            }
        }
        for p in self.proposals.values_mut() {
            if let Some(age) = height.checked_sub(p.proposal.proposal_height) {
                p.proposal.proposal_age = age;
            }
        }
        Ok(out)
    }
    fn message(
        &mut self,
        r: &Record,
        height: u32,
        hash: &str,
        out: &mut Vec<Change>,
    ) -> Result<()> {
        let x: CoinbaseMessage = decode(&r.entry.data)?;
        if !x.accepted {
            return Ok(());
        }
        match x.message {
            Some(Message::M1(m)) => {
                let key = proposal_key(m.sidechain_number, &m.description_hash);
                if !self.proposals.contains_key(&key) {
                    let p = ProposalState {
                        id: format!("{key}:{hash}"),
                        proposal: Proposal {
                            sidechain_number: m.sidechain_number,
                            declaration: declaration(&m.description),
                            raw_description: m.description,
                            description_hash: m.description_hash,
                            vote_count: 0,
                            proposal_height: height,
                            proposal_age: 0,
                        },
                        evidence: vec![r.evidence.clone()],
                    };
                    out.push(self.proposal_change(&p, "pending", "reconstructed"));
                    self.proposals.insert(key, p);
                }
            }
            Some(Message::M2(m)) if (1..=3).contains(&m.effect) => {
                let key = proposal_key(m.sidechain_number, &m.description_hash);
                if let Some(mut p) = self.proposals.remove(&key) {
                    if p.proposal.proposal_height < height {
                        p.proposal.vote_count = p.proposal.vote_count.saturating_add(1);
                        p.proposal.proposal_age = height - p.proposal.proposal_height;
                        p.evidence = vec![r.evidence.clone()];
                        if m.effect == 2 || m.effect == 3 {
                            out.push(self.proposal_change(&p, "activated", "reconstructed"));
                            let a = Active {
                                sidechain_number: m.sidechain_number,
                                raw_description: p.proposal.raw_description.clone(),
                                description_hash: m.description_hash,
                                vote_count: p.proposal.vote_count,
                                proposal_height: p.proposal.proposal_height,
                                activation_height: height,
                                declaration: p.proposal.declaration.clone(),
                            };
                            if let Some(old) = self.active.insert(m.sidechain_number, a.clone()) {
                                out.push(change("instance",old.instance_id(),Some(m.sidechain_number),json!({"sidechain":old,"status":"replaced","ended_height":height}),vec![r.evidence.clone()],"reconstructed",None));
                            }
                            out.push(change(
                                "instance",
                                a.instance_id(),
                                Some(m.sidechain_number),
                                json!({"sidechain":a,"status":"active"}),
                                vec![r.evidence.clone()],
                                "reconstructed",
                                None,
                            ));
                            if m.effect == 2 {
                                self.bundle_complete.insert(m.sidechain_number);
                            }
                            return Ok(());
                        }
                        out.push(self.proposal_change(&p, "pending", "reconstructed"));
                    }
                    self.proposals.insert(key, p);
                }
            }
            Some(Message::M3(m)) => {
                let key = bundle_key(m.sidechain_number, &m.m6id);
                if !self.bundles.contains_key(&key) {
                    let b = BundleState {
                        bundle: BundleProposal {
                            m6id: m.m6id,
                            vote_count: 1,
                            proposal_height: height,
                        },
                        attempt_id: format!("{key}:{hash}"),
                        evidence: vec![r.evidence.clone()],
                    };
                    out.push(self.bundle_change(
                        m.sidechain_number,
                        &b,
                        "pending",
                        "reconstructed",
                    ));
                    self.bundles.insert(key, b);
                }
            }
            Some(Message::M4(m)) => {
                for effect in m.effects {
                    for id in effect.downvoted_m6ids {
                        let key = bundle_key(effect.sidechain_number, &id);
                        if let Some(mut b) = self.bundles.remove(&key) {
                            b.bundle.vote_count = b.bundle.vote_count.saturating_sub(1);
                            b.evidence = vec![r.evidence.clone()];
                            out.push(self.bundle_change(
                                effect.sidechain_number,
                                &b,
                                "pending",
                                "reconstructed",
                            ));
                            self.bundles.insert(key, b);
                        }
                    }
                    if effect.action == 2
                        && let Some(id) = effect.upvoted_m6id
                    {
                        let key = bundle_key(effect.sidechain_number, &id);
                        if let Some(mut b) = self.bundles.remove(&key) {
                            b.bundle.vote_count =
                                b.bundle.vote_count.saturating_add(1).min(u16::MAX.into());
                            b.evidence = vec![r.evidence.clone()];
                            out.push(self.bundle_change(
                                effect.sidechain_number,
                                &b,
                                "pending",
                                "reconstructed",
                            ));
                            self.bundles.insert(key, b);
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
    fn expire(&mut self, height: u32, out: &mut Vec<Change>) {
        let Some(c) = self.constants.clone() else {
            return;
        };
        let proposals: Vec<_> = self.proposals.keys().cloned().collect();
        for key in proposals {
            let p = &self.proposals[&key];
            let slot = p.proposal.sidechain_number;
            if !(self.active_complete || self.active.contains_key(&slot)) {
                continue;
            }
            let (max, threshold) = if self.active.contains_key(&slot) {
                (
                    c.used_sidechain_slot_proposal_max_age,
                    c.used_sidechain_slot_activation_threshold,
                )
            } else {
                (
                    c.unused_sidechain_slot_proposal_max_age,
                    c.unused_sidechain_slot_activation_threshold,
                )
            };
            let Some(age) = height.checked_sub(p.proposal.proposal_height) else {
                continue;
            };
            let max_fails = max.saturating_sub(threshold);
            if age > max
                || (age > max_fails && age.saturating_sub(p.proposal.vote_count) >= max_fails)
            {
                let mut p = self.proposals.remove(&key).expect("existing proposal");
                p.proposal.proposal_age = age;
                out.push(self.proposal_change(&p, "failed", "reconstructed"));
            }
        }
        let bundles: Vec<_> = self.bundles.keys().cloned().collect();
        for key in bundles {
            if height
                .checked_sub(self.bundles[&key].bundle.proposal_height)
                .is_some_and(|age| age > c.withdrawal_bundle_max_age)
            {
                let b = self.bundles.remove(&key).expect("existing bundle");
                if let Some(slot) = key.split(':').next().and_then(|s| s.parse().ok()) {
                    out.push(self.bundle_change(slot, &b, "failed", "reconstructed"));
                }
            }
        }
    }
    fn transition(&mut self, r: &Record, out: &mut Vec<Change>) -> Result<()> {
        let t: Transition = decode(&r.entry.data)?;
        let slot = t.sidechain_number;
        if t.kind == 1 || t.kind == 2 {
            let discrepancy = self
                .treasury
                .get(&slot)
                .is_some_and(|prior| !same_ctip(prior, &t.previous_ctip));
            let mut new = t.new_ctip.clone();
            if let Some(c) = &mut new {
                c.sequence_number = t.sequence_number;
            }
            self.treasury.insert(slot, new.clone());
            out.push(change(
                "ctip",
                slot.to_string(),
                Some(slot),
                json!({"ctip":new,"transition":t}),
                vec![r.evidence.clone()],
                "reconstructed",
                discrepancy.then(|| "previous CTIP disagrees with reconstructed state".into()),
            ));
            if t.kind == 1 {
                out.push(change("deposit",r.entry.key.clone(),Some(slot),json!({"outpoint":t.new_ctip.as_ref().map(|c|json!({"txid":c.txid,"vout":c.vout})),"sequence_number":t.sequence_number.map(|v|v.to_string()),"value_sats":t.delta_sats.map(|v|v.to_string()),"address":t.sidechain_address,"transition":t}),vec![r.evidence.clone()],"observed",None));
            }
        }
        if t.kind == 2 || t.kind == 3 {
            let id = t.m6id.as_deref().unwrap_or_default();
            let key = bundle_key(slot, id);
            let b = self.bundles.remove(&key);
            let terminal = out.iter().rev().find(|c| {
                c.kind == "bundle"
                    && c.slot == Some(slot)
                    && (c.data.pointer("/bundle/m6id").and_then(Value::as_str) == Some(id)
                        || c.data["m6id"].as_str() == Some(id))
            });
            let attempt = b
                .as_ref()
                .map(|b| b.attempt_id.clone())
                .or_else(|| terminal.map(|c| c.key.clone()))
                .unwrap_or_else(|| {
                    format!(
                        "{key}:observed:{}",
                        t.proposal_height
                            .map_or_else(|| r.evidence.event_id.clone(), |h| h.to_string())
                    )
                });
            let evidence = b
                .as_ref()
                .map(|b| b.evidence.clone())
                .unwrap_or_default()
                .into_iter()
                .chain([r.evidence.clone()])
                .collect();
            out.push(change("bundle",attempt,Some(slot),json!({"bundle":b.map(|b|b.bundle),"m6id":id,"status":if t.kind==2{"succeeded"}else{"failed"},"transition":t}),evidence,"observed",None));
        }
        Ok(())
    }
    fn outcome(
        &mut self,
        r: &Record,
        height: u32,
        hash: &str,
        out: &mut Vec<Change>,
    ) -> Result<()> {
        let Some(slot) = r.entry.slot else {
            return Ok(());
        };
        let b: BundleEvent = decode(&r.entry.data)?;
        let key = bundle_key(slot, &b.m6id);
        match b.state {
            Some(BundleOutcome::Submitted(_)) => {
                if !self.bundles.contains_key(&key) && self.semantics_supported {
                    let b = BundleState {
                        bundle: BundleProposal {
                            m6id: b.m6id,
                            vote_count: 1,
                            proposal_height: height,
                        },
                        attempt_id: format!("{key}:{hash}"),
                        evidence: vec![r.evidence.clone()],
                    };
                    out.push(self.bundle_change(slot, &b, "pending", "reconstructed"));
                    self.bundles.insert(key, b);
                }
            }
            Some(BundleOutcome::Succeeded(ref success)) => {
                let prior = self.bundles.remove(&key);
                let attempt = prior
                    .as_ref()
                    .map(|b| b.attempt_id.clone())
                    .unwrap_or_else(|| format!("{key}:observed:{}", r.evidence.event_id));
                out.push(change("bundle",attempt,Some(slot),json!({"m6id":b.m6id,"bundle":prior.map(|b|b.bundle),"status":"succeeded","sequence_number":success.sequence_number.to_string(),"transaction":success.transaction}),vec![r.evidence.clone()],"observed",None));
            }
            Some(BundleOutcome::Failed(_)) => {
                let prior = self.bundles.remove(&key);
                let attempt = prior
                    .as_ref()
                    .map(|b| b.attempt_id.clone())
                    .or_else(|| {
                        out.iter()
                            .rev()
                            .find(|c| {
                                c.kind == "bundle"
                                    && c.slot == Some(slot)
                                    && c.data.pointer("/bundle/m6id").and_then(Value::as_str)
                                        == Some(&b.m6id)
                            })
                            .map(|c| c.key.clone())
                    })
                    .unwrap_or_else(|| format!("{key}:observed:{}", r.evidence.event_id));
                out.push(change(
                    "bundle",
                    attempt,
                    Some(slot),
                    json!({"m6id":b.m6id,"bundle":prior.map(|b|b.bundle),"status":"failed"}),
                    vec![r.evidence.clone()],
                    "observed",
                    None,
                ));
            }
            _ => {}
        }
        Ok(())
    }
    /// Caller supplies only stable, current-run, branch-compatible snapshots at
    /// this exact block. Unstable observations remain separately queryable.
    pub fn snapshot(&mut self, r: &Record) -> Result<Vec<Change>> {
        let mut out = vec![];
        let evidence = vec![r.evidence.clone()];
        match r.entry.kind.as_str() {
            "active_set" => {
                let xs: Vec<Active> = decode(&r.entry.data["sidechains"])?;
                let next: BTreeMap<_, _> =
                    xs.into_iter().map(|x| (x.sidechain_number, x)).collect();
                for (slot, old) in &self.active {
                    if next
                        .get(slot)
                        .is_none_or(|n| n.instance_id() != old.instance_id())
                    {
                        out.push(change(
                            "instance",
                            old.instance_id(),
                            Some(*slot),
                            json!({"sidechain":old,"status":"not_in_snapshot"}),
                            evidence.clone(),
                            "observed",
                            None,
                        ));
                    }
                }
                for x in next.values() {
                    out.push(change(
                        "instance",
                        x.instance_id(),
                        Some(x.sidechain_number),
                        json!({"sidechain":x,"status":"active"}),
                        evidence.clone(),
                        "observed",
                        None,
                    ));
                }
                self.active = next;
                self.active_complete = true;
            }
            "proposal_set" => {
                let xs: Vec<Proposal> = decode(&r.entry.data["proposals"])?;
                let mut next = BTreeMap::new();
                for p in xs {
                    let key = proposal_key(p.sidechain_number, &p.description_hash);
                    let prior = self
                        .proposals
                        .get(&key)
                        .filter(|old| old.proposal.proposal_height == p.proposal_height);
                    let issue = prior
                        .filter(|old| old.proposal.vote_count != p.vote_count)
                        .map(|_| "snapshot vote count disagrees with reconstruction".into());
                    let id = prior
                        .map(|p| p.id.clone())
                        .unwrap_or_else(|| format!("{key}:observed:{}", p.proposal_height));
                    let p = ProposalState {
                        proposal: p,
                        id,
                        evidence: evidence.clone(),
                    };
                    let mut c = self.proposal_change(&p, "pending", "observed");
                    c.issue = issue;
                    out.push(c);
                    next.insert(key, p);
                }
                for (key, p) in &self.proposals {
                    if !next.contains_key(key) {
                        out.push(self.proposal_change(p, "not_in_snapshot", "observed"));
                    }
                }
                self.proposals = next;
                self.proposals_complete = true;
            }
            "ctip_snapshot" => {
                let x: CtipSnapshot = decode(&r.entry.data)?;
                let issue = self
                    .treasury
                    .get(&x.sidechain_number)
                    .filter(|c| !same_ctip(c, &x.ctip))
                    .map(|_| "snapshot CTIP disagrees with reconstruction".into());
                out.push(change(
                    "ctip",
                    x.sidechain_number.to_string(),
                    Some(x.sidechain_number),
                    json!({"ctip":x.ctip}),
                    evidence,
                    "observed",
                    issue,
                ));
                self.treasury.insert(x.sidechain_number, x.ctip);
            }
            "bundle_set" => {
                let x: BundleSnapshot = decode(&r.entry.data)?;
                let prefix = format!("{}:", x.sidechain_number);
                let mut next = BTreeMap::new();
                for b in x.proposals {
                    let key = bundle_key(x.sidechain_number, &b.m6id);
                    let prior = self
                        .bundles
                        .get(&key)
                        .filter(|old| old.bundle.proposal_height == b.proposal_height);
                    let issue = prior
                        .filter(|old| old.bundle.vote_count != b.vote_count)
                        .map(|_| "snapshot vote count disagrees with reconstruction".into());
                    let id = prior
                        .map(|b| b.attempt_id.clone())
                        .unwrap_or_else(|| format!("{key}:observed:{}", b.proposal_height));
                    let b = BundleState {
                        bundle: b,
                        attempt_id: id,
                        evidence: evidence.clone(),
                    };
                    let mut c = self.bundle_change(x.sidechain_number, &b, "pending", "observed");
                    c.issue = issue;
                    out.push(c);
                    next.insert(key, b);
                }
                for (key, b) in &self.bundles {
                    if key.starts_with(&prefix) && !next.contains_key(key) {
                        out.push(self.bundle_change(
                            x.sidechain_number,
                            b,
                            "not_in_snapshot",
                            "observed",
                        ));
                    }
                }
                self.bundles.retain(|key, _| !key.starts_with(&prefix));
                self.bundles.extend(next);
                self.bundle_complete.insert(x.sidechain_number);
            }
            _ => {}
        }
        Ok(out)
    }
}

/// Prefer the richer global representation only when both independent sources
/// agree. Quarantine every conflicting effect, never choose an arbitrary winner.
pub fn reconcile(mut records: Vec<Record>) -> (Vec<Record>, Vec<Record>) {
    let mut seen = BTreeMap::new();
    let mut bad = BTreeSet::new();
    let mut errors = vec![];
    for r in &records {
        if !matches!(
            r.entry.kind.as_str(),
            "m1" | "m2" | "m3" | "m4" | "m7" | "treasury_transition" | "deposit" | "bundle_outcome"
        ) {
            continue;
        }
        let key = (r.entry.kind.clone(), r.entry.key.clone());
        if seen
            .insert(key.clone(), &r.entry.data)
            .is_some_and(|old| old != &r.entry.data)
        {
            bad.insert(key.clone());
        }
        if r.entry.kind == "bundle_outcome" {
            for rich in records
                .iter()
                .filter(|x| x.entry.kind == "treasury_transition" && x.entry.key == r.entry.key)
            {
                if let (Ok(b), Ok(t)) = (
                    decode::<BundleEvent>(&r.entry.data),
                    decode::<Transition>(&rich.entry.data),
                ) {
                    let conflict = match b.state {
                        Some(BundleOutcome::Succeeded(success)) => {
                            t.kind != 2
                                || t.sequence_number
                                    .is_some_and(|n| n != success.sequence_number)
                                || t.transaction
                                    .as_ref()
                                    .is_some_and(|tx| *tx != success.transaction)
                        }
                        Some(BundleOutcome::Failed(_)) => t.kind != 3,
                        _ => false,
                    };
                    if conflict {
                        bad.insert(key.clone());
                        bad.insert((rich.entry.kind.clone(), rich.entry.key.clone()));
                    }
                }
            }
        }
        if r.entry.kind == "deposit" {
            for rich in records
                .iter()
                .filter(|x| x.entry.kind == "treasury_transition" && x.entry.key == r.entry.key)
            {
                if let (Ok(d), Ok(t)) = (
                    decode::<Deposit>(&r.entry.data),
                    decode::<Transition>(&rich.entry.data),
                ) && (t.kind != 1
                    || t.delta_sats != Some(d.value_sats)
                    || t.sequence_number
                        .is_some_and(|seq| seq != d.sequence_number)
                    || t.new_ctip
                        .as_ref()
                        .is_none_or(|c| c.txid != d.outpoint.txid || c.vout != d.outpoint.vout)
                    || t.sidechain_address
                        .as_ref()
                        .is_some_and(|a| a != &d.address))
                {
                    bad.insert(key.clone());
                    bad.insert((rich.entry.kind.clone(), rich.entry.key.clone()));
                }
            }
        }
    }
    let mut unique = BTreeSet::new();
    records.retain(|r| {
        let key = (r.entry.kind.clone(), r.entry.key.clone());
        if bad.contains(&key) {
            let mut error = r.clone();
            error.entry.kind = "interpretation_error".into();
            error.entry.error = Some("conflicting economic or protocol evidence".into());
            errors.push(error);
            return false;
        }
        if matches!(
            r.entry.kind.as_str(),
            "m1" | "m2" | "m3" | "m4" | "m7" | "treasury_transition" | "deposit" | "bundle_outcome"
        ) {
            return unique.insert(key);
        }
        true
    });
    let corroboration = records.clone();
    let rich: BTreeSet<_> = records
        .iter()
        .filter(|r| r.entry.kind == "treasury_transition")
        .map(|r| r.entry.key.clone())
        .collect();
    let submitted: BTreeSet<_> = records
        .iter()
        .filter(|r| r.entry.kind == "m3" && r.entry.data["accepted"] == true)
        .filter_map(|r| {
            let m = r.entry.data.pointer("/message/M3")?;
            Some(format!(
                "{}:{}",
                m["sidechain_number"].as_u64()?,
                m["m6id"].as_str()?
            ))
        })
        .collect();
    records.retain(|r| {
        !(matches!(r.entry.kind.as_str(), "deposit" | "bundle_outcome")
            && (rich.contains(&r.entry.key)
                || (r.entry.data.pointer("/state/Submitted").is_some()
                    && submitted.contains(&r.entry.key))))
    });
    records.extend(errors);
    (records, corroboration)
}
