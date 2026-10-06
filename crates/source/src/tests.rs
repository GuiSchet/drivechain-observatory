use crate::{normalize::Entry, observations::*, *};
use serde_json::{Value, json};
fn record(kind: &str, family: &str, key: &str, slot: Option<u8>, data: Value) -> Record {
    Record {
        evidence: Evidence {
            event_id: "1".into(),
            ordinal: 0,
            observation_id: None,
        },
        entry: Entry {
            ordinal: 0,
            family: family.into(),
            kind: kind.into(),
            key: key.into(),
            slot,
            search: vec![],
            data,
            error: None,
        },
    }
}
#[test]
fn exact_money_rejects_fractional_or_overflowing_json() {
    let max = json!({"txid":"aa","vout":0,"value_sats":u64::MAX});
    let c: Ctip = serde_json::from_value(max).unwrap();
    assert_eq!(
        serde_json::to_value(c).unwrap()["value_sats"],
        u64::MAX.to_string()
    );
    for amount in [json!(-1), json!(1.5), json!("18446744073709551616")] {
        assert!(
            serde_json::from_value::<Ctip>(json!({"txid":"aa","vout":0,"value_sats":amount}))
                .is_err()
        );
    }
}
#[test]
fn compact_size_and_description_hash_are_not_interchangeable() {
    use sha2::{Digest, Sha256};
    let mut expected = Sha256::digest(Sha256::digest([0xab])).to_vec();
    expected.reverse();
    assert_eq!(description_hash("01ab").unwrap(), hex::encode(expected));
    assert_ne!(
        description_hash("01ab").unwrap(),
        description_hash("0201ab").unwrap()
    );
    for bad in ["", "ab", "fd0100ab", "02ab", "ff0000000000000000"] {
        assert!(description_hash(bad).is_err(), "{bad}");
    }
}
#[test]
fn opaque_future_declaration_keeps_identity_usable() {
    let d: Declaration =
        serde_json::from_value(json!({"declaration":{"V7":{"future":true}}})).unwrap();
    assert_eq!(d.declaration, Some(DeclarationVersion::Unknown));
    assert!(declaration("0107").is_none());
    let raw = format!("3700014100{}{}", "11".repeat(32), "22".repeat(20));
    // v0, title length 1, title A, empty description, fixed hash identifiers.
    let raw = raw.replacen("3700014100", "37000141", 1);
    assert_eq!(
        declaration(&raw).unwrap().declaration.unwrap(),
        DeclarationVersion::V0(DeclarationV0 {
            title: "A".into(),
            description: "".into(),
            hash_id_1: "11".repeat(32),
            hash_id_2: "22".repeat(20)
        })
    );
}

#[test]
fn official_snapshots_do_not_replay_votes_expiration_or_absence() {
    let mut state = State::default();
    let proposal = json!({"sidechain_number":9,"raw_description":"00","description_hash":description_hash("00").unwrap(),"vote_count":42,"proposal_height":100,"proposal_age":3,"declaration":null});
    let r = record(
        "proposal_set",
        "proposals",
        "set",
        None,
        json!({"proposals":[proposal]}),
    );
    let changes = state.snapshot(&r).unwrap();
    assert_eq!(changes[0].quality, "tip_matched");
    assert!(changes[0].data["required_votes"].is_null());
    assert!(!state.semantics_supported);
    state.block("b", "a", 100_000, &[], true).unwrap();
    let p = &state.proposals.values().next().unwrap().proposal;
    assert_eq!(p.vote_count, 42);
    assert_eq!(p.proposal_age, 3);
    let empty = record(
        "proposal_set",
        "proposals",
        "set",
        None,
        json!({"proposals":[]}),
    );
    assert!(state.snapshot(&empty).unwrap().is_empty());
    assert!(state.proposals.is_empty());
}
#[test]
fn empty_bmm_response_does_not_require_or_invent_readiness() {
    let h = "ab".repeat(32);
    let payload = json!({"monitor_event":{"Enforcer":{"event":{"BmmRequests":{"observer_session":"","mempool_generation":0,"previous_mainchain_block_hash":h,"requests":[]}}}}});
    let facts = normalize::normalize(
        "bmm_requests",
        &payload,
        normalize::Anchor {
            hash: Some(&h),
            ..Default::default()
        },
    );
    assert_eq!(facts.len(), 1);
    assert!(facts[0].error.is_none());
    assert_eq!(facts[0].data["mempool_generation"], "0");
}
#[test]
fn official_header_without_cumulative_work_is_valid_but_not_fabricated() {
    let h = "aa".repeat(32);
    let payload = json!({"monitor_event":{"Enforcer":{"event":{"ChainTip":{"header":{"hash":h,"previous_hash":"bb".repeat(32),"height":10,"block_work":"01".repeat(32),"cumulative_work":"","timestamp":1000}}}}}});
    let facts = normalize::normalize(
        "chain_tip",
        &payload,
        normalize::Anchor {
            hash: Some(&h),
            height: Some(10),
            slot: None,
        },
    );
    assert!(facts[0].error.is_none());
    assert_eq!(facts[0].data["cumulative_work"], "");
}
#[test]
fn fork_only_payload_is_not_interpreted() {
    assert!(normalize::normalize("bip300_block_delta", &json!({}), Default::default()).is_empty());
}
