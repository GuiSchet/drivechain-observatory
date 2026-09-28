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
    hash(&h.chain_work)?;
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
fn slot(v: &Value) -> Option<u8> {
    v["sidechain_number"]
        .as_u64()
        .and_then(|n| n.try_into().ok())
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
        "chain_tip" | "block_connected" | "block_disconnected" => "blocks",
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
            "chain_tip" => {
                let h: Header = decode(&v["header"])?;
                check_header(&h, &anchor)?;
                push(
                    &mut out,
                    "blocks",
                    entry("tip", "blocks", h.hash.clone(), None, h, vec![]),
                );
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
                    bytes(&b.m6id)?;
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
                    bytes(&b.critical_hash)?;
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
                            bytes(c)?;
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
                                bytes(&b.m6id)?;
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
            "bip300_block_delta" => {
                let x: Delta = decode(v)?;
                check_header(&x.header, &anchor)?;
                hash(&x.coinbase_txid)?;
                push(
                    &mut out,
                    "protocol",
                    entry(
                        "block_delta",
                        "protocol",
                        x.header.hash.clone(),
                        None,
                        json!({"coinbase_txid":x.coinbase_txid}),
                        vec![x.coinbase_txid.clone()],
                    ),
                );
                for item in x.coinbase_messages {
                    let family = if item.pointer("/message/M1").is_some()
                        || item.pointer("/message/M2").is_some()
                    {
                        "proposals"
                    } else if item.pointer("/message/M3").is_some()
                        || item.pointer("/message/M4").is_some()
                    {
                        "bundles"
                    } else if item.pointer("/message/M7").is_some() {
                        "bmm"
                    } else {
                        "protocol"
                    };
                    let scope = item["message"]
                        .as_object()
                        .and_then(|m| m.values().next())
                        .and_then(slot);
                    normalize_message(&mut out, family, scope, &item);
                }
                for item in x.treasury_transitions {
                    push_scoped(&mut out, "treasury", slot(&item), transition(&item));
                }
                for item in x.confirmed_bmm_requests {
                    push_scoped(
                        &mut out,
                        "bmm",
                        slot(&item),
                        (|| -> Result<Entry> {
                            let b: ConfirmedBmm = decode(&item)?;
                            hash(&b.txid)?;
                            hash(&b.previous_mainchain_block_hash)?;
                            bytes(&b.hstar)?;
                            bytes(&b.transaction)?;
                            ensure!(
                                b.previous_mainchain_block_hash == x.header.previous_hash,
                                "confirmed BMM parent differs from block parent"
                            );
                            entry(
                                "confirmed_bmm",
                                "bmm",
                                format!("{}:{}", b.sidechain_number, b.txid),
                                Some(b.sidechain_number),
                                &b,
                                vec![b.txid.clone(), b.hstar.clone()],
                            )
                        })(),
                    );
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

fn normalize_message(out: &mut Vec<Entry>, family: &str, scope: Option<u8>, item: &Value) {
    // M4 contains independent resolved effects for multiple slots. Validate its
    // envelope separately so one malformed effect does not suppress other slots.
    if let Some(effects) = item
        .pointer("/message/M4/effects")
        .and_then(Value::as_array)
    {
        let mut valid = item.clone();
        valid["message"]["M4"]["effects"] = json!([]);
        if message(&valid).is_ok() {
            let mut accepted = vec![];
            for effect in effects {
                let mut single = valid.clone();
                single["message"]["M4"]["effects"] = json!([effect]);
                match message(&single) {
                    Ok(_) => accepted.push(effect.clone()),
                    Err(error) => push_scoped(out, family, slot(effect), Err(error)),
                }
            }
            valid["message"]["M4"]["effects"] = json!(accepted);
            push(out, family, message(&valid));
            return;
        }
    }
    push_scoped(out, family, scope, message(item));
}

fn message(v: &Value) -> Result<Entry> {
    let x: CoinbaseMessage = decode(v)?;
    bytes(&x.raw_script_pubkey)?;
    let (slot, search, family, name) =
        match x.message.as_ref().context("missing coinbase message")? {
            Message::M1(m) => {
                description(&m.description, &m.description_hash)?;
                (
                    Some(m.sidechain_number),
                    vec![m.description_hash.clone()],
                    "proposals",
                    "m1",
                )
            }
            Message::M2(m) => {
                hash(&m.description_hash)?;
                ensure!(
                    !x.accepted || (1..=3).contains(&m.effect),
                    "unsupported accepted M2 effect"
                );
                (
                    Some(m.sidechain_number),
                    vec![m.description_hash.clone()],
                    "proposals",
                    "m2",
                )
            }
            Message::M3(m) => {
                bytes(&m.m6id)?;
                (
                    Some(m.sidechain_number),
                    vec![m.m6id.clone()],
                    "bundles",
                    "m3",
                )
            }
            Message::M4(m) => {
                ensure!(
                    !x.accepted || (1..=4).contains(&m.mode),
                    "unsupported accepted M4 mode"
                );
                let mut search = vec![];
                for e in &m.effects {
                    search.push(format!("slot:{}", e.sidechain_number));
                    ensure!((1..=2).contains(&e.action), "unsupported M4 effect action");
                    if let Some(id) = &e.upvoted_m6id {
                        bytes(id)?;
                        search.push(id.clone());
                    }
                    for id in &e.downvoted_m6ids {
                        bytes(id)?;
                        search.push(id.clone());
                    }
                }
                (None, search, "bundles", "m4")
            }
            Message::M7(m) => {
                bytes(&m.hstar)?;
                (Some(m.sidechain_number), vec![m.hstar.clone()], "bmm", "m7")
            }
            Message::Unknown => anyhow::bail!("unsupported coinbase message"),
        };
    entry(name, family, x.vout.to_string(), slot, x, search)
}
fn transition(v: &Value) -> Result<Entry> {
    let x: Transition = decode(v)?;
    if let Some(c) = &x.previous_ctip {
        ctip(c)?;
    }
    if let Some(c) = &x.new_ctip {
        ctip(c)?;
    }
    if let Some(s) = &x.transaction {
        bytes(s)?;
    }
    if let Some(s) = &x.sidechain_address {
        bytes(s)?;
    }
    if let Some(s) = &x.m6id {
        bytes(s)?;
    }
    let old = x.previous_ctip.as_ref().map_or(0, |c| c.value_sats);
    match x.kind {
        1 => {
            let c = x.new_ctip.as_ref().context("deposit has no new CTIP")?;
            ensure!(
                c.value_sats.checked_sub(old) == x.delta_sats && x.delta_sats.is_some(),
                "deposit delta differs from CTIP change"
            );
        }
        2 => {
            let c = x
                .new_ctip
                .as_ref()
                .context("successful withdrawal has no new CTIP")?;
            ensure!(
                x.previous_ctip.is_some()
                    && old.checked_sub(c.value_sats) == x.delta_sats
                    && x.delta_sats.is_some(),
                "withdrawal delta differs from CTIP change"
            );
            if let (Some(p), Some(f)) = (x.payout_sats, x.fee_sats) {
                ensure!(
                    p.checked_add(f) == x.delta_sats,
                    "payout plus fee differs from treasury reduction"
                );
            }
            ensure!(x.m6id.is_some(), "withdrawal has no m6id");
        }
        3 => {
            ensure!(x.m6id.is_some(), "failed withdrawal has no m6id");
        }
        _ => anyhow::bail!("unsupported treasury transition {}", x.kind),
    }
    let mut search = vec![];
    if let Some(c) = &x.new_ctip {
        search.extend([c.txid.clone(), format!("{}:{}", c.txid, c.vout)]);
    }
    if let Some(id) = &x.m6id {
        search.push(id.clone());
    }
    let key = if x.kind == 1 {
        let c = x.new_ctip.as_ref().expect("validated deposit");
        format!("{}:{}:{}", x.sidechain_number, c.txid, c.vout)
    } else {
        format!(
            "{}:{}",
            x.sidechain_number,
            x.m6id.as_deref().unwrap_or_default()
        )
    };
    entry(
        "treasury_transition",
        if x.kind == 3 { "bundles" } else { "treasury" },
        key,
        Some(x.sidechain_number),
        x,
        search,
    )
}
