//! Bounded per-fact normalization. An invalid child affects its own family;
//! other children and the header remain independently usable.
use crate::*;
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub ordinal: i32,
    pub family: String,
    pub kind: String,
    pub key: String,
    pub slot: Option<u8>,
    pub search: Vec<String>,
    pub data: Value,
    pub error: Option<String>,
}
#[derive(Default)]
pub struct Anchor<'a> {
    pub hash: Option<&'a str>,
    pub height: Option<u32>,
    pub slot: Option<u8>,
}
pub fn decode<T: DeserializeOwned>(v: &Value) -> Result<T> {
    Ok(serde_json::from_value(v.clone())?)
}
pub fn bytes(s: &str) -> Result<()> {
    hex::decode(s)?;
    Ok(())
}
pub fn hash(s: &str) -> Result<()> {
    ensure!(hex::decode(s)?.len() == 32, "expected 32-byte hash");
    Ok(())
}
fn ctip(c: &Ctip) -> Result<()> {
    hash(&c.txid)
}
fn description(raw: &str, expected: &str) -> Result<()> {
    hash(expected)?;
    ensure!(
        description_hash(raw)? == expected,
        "description_hash does not match decoded description"
    );
    Ok(())
}
fn check_header(h: &Header, a: &Anchor<'_>) -> Result<()> {
    hash(&h.hash)?;
    hash(&h.previous_hash)?;
    hash(&h.block_work)?;
    if !h.cumulative_work.is_empty() {
        hash(&h.cumulative_work)?;
    }
    ensure!(
        hex::decode(&h.block_work)?.iter().any(|b| *b != 0),
        "zero block work"
    );
    ensure!(
        a.hash == Some(h.hash.as_str()) && a.height == Some(h.height),
        "header differs from envelope anchor"
    );
    ensure!(h.hash != h.previous_hash, "self-parent block");
    Ok(())
}
fn check_slot(slot: u8, a: &Anchor<'_>) -> Result<()> {
    ensure!(a.slot == Some(slot), "slot differs from envelope index");
    Ok(())
}
fn entry(
    kind: &str,
    family: &str,
    key: String,
    slot: Option<u8>,
    data: impl Serialize,
    mut search: Vec<String>,
) -> Result<Entry> {
    let data = serde_json::to_value(data)?;
    if let Some(title) = data
        .pointer("/declaration/declaration/V0/title")
        .and_then(Value::as_str)
    {
        search.push(title.to_owned());
    }
    if let Some(title) = data
        .pointer("/message/M1/description")
        .and_then(Value::as_str)
        .and_then(declaration)
        .and_then(|d| match d.declaration {
            Some(DeclarationVersion::V0(v)) => Some(v.title),
            _ => None,
        })
    {
        search.push(title);
    }
    Ok(Entry {
        ordinal: 0,
        family: family.into(),
        kind: kind.into(),
        key,
        slot,
        search,
        data: serde_json::to_value(data)?,
        error: None,
    })
}
fn push(out: &mut Vec<Entry>, family: &str, result: Result<Entry>) {
    push_scoped(out, family, None, result);
}
fn push_scoped(out: &mut Vec<Entry>, family: &str, slot: Option<u8>, result: Result<Entry>) {
    let mut e = result.unwrap_or_else(|error| Entry {
        ordinal: 0,
        family: family.into(),
        kind: "interpretation_error".into(),
        key: String::new(),
        slot,
        search: vec![],
        data: Value::Null,
        error: Some(error.to_string()),
    });
    e.ordinal = i32::try_from(out.len()).expect("payload bounded by database");
    out.push(e);
}

pub fn normalize(kind: &str, payload: &Value, anchor: Anchor<'_>) -> Vec<Entry> {
    let mut out = Vec::new();
    let family = match kind {
        "chain_info" => "parameters",
        "chain_tip"
        | "mainchain_block"
        | "mainchain_transition"
        | "block_connected"
        | "block_disconnected" => "blocks",
        "active_sidechains" => "sidechains",
        "sidechain_proposals" => "proposals",
        "ctip" => "treasury",
        "withdrawal_bundle_proposals" => "bundles",
        "bmm_requests" => "bmm",
        _ => "protocol",
    };
    let result = (|| -> Result<()> {
        let Some(v) = body(kind, payload)? else {
            return Ok(());
        };
        match kind {
            "chain_info" => {
                let x: ChainInfo = decode(v)?;
                push(
                    &mut out,
                    family,
                    entry("parameters", family, "parameters".into(), None, x, vec![]),
                );
            }
            "chain_tip" | "mainchain_block" => {
                let h: Header = decode(&v["header"])?;
                check_header(&h, &anchor)?;
                push(
                    &mut out,
                    "blocks",
                    entry("tip", "blocks", h.hash.clone(), None, h, vec![]),
                );
            }
            "mainchain_transition" => {
                let x: MainchainTransition = decode(v)?;
                ensure!((1..=2).contains(&x.action), "invalid official transition");
                ensure!(
                    x.observer_session.is_empty() && x.sequence == 0,
                    "official stream has no server sequence"
                );
                if x.action == 1 {
                    check_header(
                        x.header.as_ref().context("missing connected header")?,
                        &anchor,
                    )?;
                } else {
                    hash(anchor.hash.context("missing disconnected hash")?)?;
                }
                push(
                    &mut out,
                    "blocks",
                    entry(
                        "mainchain_transition",
                        "blocks",
                        format!("{}:{}", anchor.hash.unwrap_or_default(), x.action),
                        None,
                        x,
                        vec![],
                    ),
                );
            }
            "confirmed_bmm_fees" => {
                let x: ConfirmedFees = decode(v)?;
                check_header(&x.header, &anchor)?;
                ensure!(
                    x.source == "ecash-node:getblock:3;observed_bids_only",
                    "unknown fee source"
                );
                let mut keys = std::collections::BTreeSet::new();
                for fee in &x.fees {
                    hash(&fee.txid)?;
                    ensure!(
                        keys.insert((fee.sidechain_number, &fee.txid)),
                        "duplicate confirmed fee"
                    );
                    ensure!(
                        fee.fee_sats.is_some() == fee.unavailable_reason.is_empty(),
                        "fee availability is inconsistent"
                    );
                }
                for fee in x.fees {
                    let mut data = serde_json::to_value(&fee)?;
                    data["coverage"] = json!("observed_bids_only");
                    data["source"] = json!(x.source);
                    push(
                        &mut out,
                        "bmm",
                        entry(
                            "confirmed_bmm_fee",
                            "bmm",
                            format!("{}:{}", fee.sidechain_number, fee.txid),
                            Some(fee.sidechain_number),
                            data,
                            vec![fee.txid.clone()],
                        ),
                    );
                }
            }
            "active_sidechains" => {
                let xs: Vec<Active> = decode(&v["sidechains"])?;
                for x in &xs {
                    description(&x.raw_description, &x.description_hash)?;
                    ensure!(
                        x.activation_height >= x.proposal_height,
                        "activation precedes proposal"
                    );
                }
                push(
                    &mut out,
                    family,
                    entry(
                        "active_set",
                        family,
                        "active".into(),
                        None,
                        json!({"sidechains":xs}),
                        vec![],
                    ),
                );
                for x in xs {
                    push(
                        &mut out,
                        family,
                        entry(
                            "instance",
                            family,
                            x.instance_id(),
                            Some(x.sidechain_number),
                            &x,
                            vec![x.description_hash.clone(), x.instance_id()],
                        ),
                    );
                }
            }
            "sidechain_proposals" => {
                let xs: Vec<Proposal> = decode(&v["proposals"])?;
                for x in &xs {
                    description(&x.raw_description, &x.description_hash)?;
                }
                push(
                    &mut out,
                    family,
                    entry(
                        "proposal_set",
                        family,
                        "proposals".into(),
                        None,
                        json!({"proposals":xs}),
                        vec![],
                    ),
                );
                for x in xs {
                    push(
                        &mut out,
                        family,
                        entry(
                            "proposal_observation",
                            family,
                            format!(
                                "{}:{}:{}",
                                x.sidechain_number, x.description_hash, x.proposal_height
                            ),
                            Some(x.sidechain_number),
                            &x,
                            vec![x.description_hash.clone()],
                        ),
                    );
                }
            }
            "ctip" => {
                let x: CtipSnapshot = decode(v)?;
                check_slot(x.sidechain_number, &anchor)?;
                if let Some(c) = &x.ctip {
                    ctip(c)?;
                }
                let search = x
                    .ctip
                    .as_ref()
                    .map(|c| vec![c.txid.clone(), format!("{}:{}", c.txid, c.vout)])
                    .unwrap_or_default();
                push(
                    &mut out,
                    family,
                    entry(
                        "ctip_snapshot",
                        family,
                        x.sidechain_number.to_string(),
                        Some(x.sidechain_number),
                        x,
                        search,
                    ),
                );
            }
            "withdrawal_bundle_proposals" => {
                let x: BundleSnapshot = decode(v)?;
                check_slot(x.sidechain_number, &anchor)?;
                for b in &x.proposals {
                    hash(&b.m6id)?;
                }
                push(
                    &mut out,
                    family,
                    entry(
                        "bundle_set",
                        family,
                        x.sidechain_number.to_string(),
                        Some(x.sidechain_number),
                        &x,
                        vec![],
                    ),
                );
                for b in x.proposals {
                    push(
                        &mut out,
                        family,
                        entry(
                            "bundle_observation",
                            family,
                            format!("{}:{}:{}", x.sidechain_number, b.m6id, b.proposal_height),
                            Some(x.sidechain_number),
                            &b,
                            vec![b.m6id.clone()],
                        ),
                    );
                }
            }
            "bmm_requests" => {
                let x: Auction = decode(v)?;
                hash(&x.previous_mainchain_block_hash)?;
                ensure!(
                    anchor.hash == Some(x.previous_mainchain_block_hash.as_str()),
                    "auction parent differs from anchor"
                );
                for b in &x.requests {
                    hash(&b.txid)?;
                    hash(&b.critical_hash)?;
                }
                push(
                    &mut out,
                    family,
                    entry(
                        "auction",
                        family,
                        x.previous_mainchain_block_hash.clone(),
                        None,
                        &x,
                        vec![x.previous_mainchain_block_hash.clone()],
                    ),
                );
                for b in x.requests {
                    push(
                        &mut out,
                        family,
                        entry(
                            "bid",
                            family,
                            b.txid.clone(),
                            Some(b.sidechain_number),
                            &b,
                            vec![b.txid.clone(), b.critical_hash.clone()],
                        ),
                    );
                }
            }
            "block_disconnected" => {
                let x: Disconnected = decode(v)?;
                hash(&x.block_hash)?;
                check_slot(x.sidechain_number, &anchor)?;
                ensure!(
                    anchor.hash == Some(x.block_hash.as_str()),
                    "disconnect hash differs from anchor"
                );
                push(
                    &mut out,
                    "blocks",
                    entry(
                        "disconnect",
                        "blocks",
                        x.block_hash.clone(),
                        Some(x.sidechain_number),
                        x,
                        vec![],
                    ),
                );
            }
            "block_connected" => {
                let x: Connected = decode(v)?;
                check_header(&x.header, &anchor)?;
                check_slot(x.sidechain_number, &anchor)?;
                push_scoped(
                    &mut out,
                    "bmm",
                    Some(x.sidechain_number),
                    (|| {
                        if let Some(c) = &x.bmm_commitment {
                            hash(c)?;
                        }
                        entry(
                            "slot_block",
                            "bmm",
                            x.sidechain_number.to_string(),
                            Some(x.sidechain_number),
                            json!({"bmm_commitment":x.bmm_commitment}),
                            x.bmm_commitment.clone().into_iter().collect(),
                        )
                    })(),
                );
                for item in x.events {
                    let result = (|| -> Result<Entry> {
                        match decode::<SlotEvent>(&item)?
                            .event
                            .context("missing sidechain event")?
                        {
                            SlotEventKind::Deposit(d) => {
                                hash(&d.outpoint.txid)?;
                                bytes(&d.address)?;
                                entry(
                                    "deposit",
                                    "treasury",
                                    format!(
                                        "{}:{}:{}",
                                        x.sidechain_number, d.outpoint.txid, d.outpoint.vout
                                    ),
                                    Some(x.sidechain_number),
                                    &d,
                                    vec![
                                        d.outpoint.txid.clone(),
                                        format!("{}:{}", d.outpoint.txid, d.outpoint.vout),
                                    ],
                                )
                            }
                            SlotEventKind::WithdrawalBundle(b) => {
                                hash(&b.m6id)?;
                                entry(
                                    "bundle_outcome",
                                    "bundles",
                                    format!("{}:{}", x.sidechain_number, b.m6id),
                                    Some(x.sidechain_number),
                                    &b,
                                    vec![b.m6id.clone()],
                                )
                            }
                            SlotEventKind::Unknown => anyhow::bail!("unsupported sidechain event"),
                        }
                    })();
                    let family = if item.pointer("/event/WithdrawalBundle").is_some() {
                        "bundles"
                    } else {
                        "treasury"
                    };
                    push_scoped(&mut out, family, Some(x.sidechain_number), result);
                }
            }

            _ => unreachable!(),
        }
        Ok(())
    })();
    if let Err(error) = result {
        push_scoped(&mut out, family, anchor.slot, Err(error));
    }
    out
}
