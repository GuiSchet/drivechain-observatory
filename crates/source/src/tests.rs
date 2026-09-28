use crate::{normalize::Entry, replay::*, *};
use serde_json::{Value, json};

fn constants() -> Constants {
    Constants {
        activation_height: 100,
        withdrawal_bundle_max_age: 3,
        withdrawal_bundle_inclusion_threshold: 2,
        unused_sidechain_slot_activation_threshold: 2,
        unused_sidechain_slot_proposal_max_age: 6,
        used_sidechain_slot_activation_threshold: 4,
        used_sidechain_slot_proposal_max_age: 8,
    }
}
fn state() -> State {
    State {
        constants: Some(constants()),
        semantics_supported: true,
        ..Default::default()
    }
}
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
fn message(kind: &str, family: &str, vout: u32, variant: &str, data: Value) -> Record {
    record(
        kind,
        family,
        &vout.to_string(),
        Some(9),
        json!({"vout":vout,"raw_script_pubkey":"6a","accepted":true,"message":{variant:data}}),
    )
}
fn m1() -> Record {
    message(
        "m1",
        "proposals",
        0,
        "M1",
        json!({"sidechain_number":9,"description":"00","description_hash":description_hash("00").unwrap()}),
    )
}
fn m2(effect: i32) -> Record {
    message(
        "m2",
        "proposals",
        1,
        "M2",
        json!({"sidechain_number":9,"description_hash":description_hash("00").unwrap(),"effect":effect}),
    )
}
fn m3() -> Record {
    message(
        "m3",
        "bundles",
        2,
        "M3",
        json!({"sidechain_number":9,"m6id":"aa"}),
    )
}
fn alarm() -> Record {
    message(
        "m4",
        "bundles",
        3,
        "M4",
        json!({"mode":2,"raw_votes":[65534],"effects":[{"sidechain_number":9,"action":1,"upvoted_m6id":null,"downvoted_m6ids":["aa"]}]}),
    )
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
fn proposal_votes_start_at_zero_and_same_block_ack_is_ignored() {
    let mut s = state();
    s.block("a", "z", 100, &[m2(1), m1()], true).unwrap();
    assert_eq!(s.proposals.values().next().unwrap().proposal.vote_count, 0);
    s.block("b", "a", 101, &[m2(1)], true).unwrap();
    let changes = s.block("c", "b", 102, &[m2(1)], true).unwrap();
    assert!(s.active.is_empty());
    assert_eq!(changes[0].data["required_votes"], 3);
    s.block("d", "c", 103, &[m2(2)], true).unwrap();
    assert_eq!(s.active[&9].activation_height, 103);
    assert!(s.proposals.is_empty());
}
#[test]
fn bundle_expiry_is_strict_and_terminal_evidence_reuses_attempt() {
    let mut s = state();
    s.block("a", "z", 100, &[m3()], true).unwrap();
    assert_eq!(s.bundles["9:aa"].bundle.vote_count, 1);
    for (hash, parent, height) in [("b", "a", 101), ("c", "b", 102), ("d", "c", 103)] {
        s.block(hash, parent, height, &[alarm()], true).unwrap();
    }
    assert_eq!(s.bundles["9:aa"].bundle.vote_count, 0);
    let terminal = record(
        "bundle_outcome",
        "bundles",
        "9:aa",
        Some(9),
        json!({"m6id":"aa","state":{"Failed":{}}}),
    );
    let changes = s.block("e", "d", 104, &[terminal], true).unwrap();
    let outcomes: Vec<_> = changes.iter().filter(|c| c.kind == "bundle").collect();
    assert_eq!(outcomes.len(), 2);
    assert!(outcomes.iter().all(|c| c.key == "9:aa:a"));
    assert!(s.bundles.is_empty());
}
#[test]
fn proposal_early_failure_obeys_boundary() {
    let mut s = state();
    s.block("a", "z", 100, &[m1()], true).unwrap();
    for height in 101..=104 {
        let parent = if height == 101 {
            "a".into()
        } else {
            (height - 1).to_string()
        };
        s.block(&height.to_string(), &parent, height, &[], true)
            .unwrap();
        assert_eq!(s.proposals.len(), 1);
    }
    let changes = s.block("105", "104", 105, &[], true).unwrap();
    assert!(s.proposals.is_empty());
    assert!(
        changes
            .iter()
            .any(|c| c.kind == "proposal" && c.data["status"] == "failed")
    );
}
#[test]
fn missing_block_removes_claims_but_bad_bmm_does_not_erase_votes() {
    let mut s = state();
    s.block("a", "z", 100, &[m1(), m3()], true).unwrap();
    let mut error = record("interpretation_error", "bmm", "", None, Value::Null);
    error.entry.error = Some("unsupported commitment".into());
    s.block("b", "a", 101, &[error, m2(1)], true).unwrap();
    assert_eq!(s.proposals.values().next().unwrap().proposal.vote_count, 1);
    assert_eq!(s.bundles.len(), 1);
    s.block("d", "c", 103, &[], true).unwrap();
    assert!(!s.active_complete);
    assert!(s.proposals.is_empty());
    assert!(s.bundles.is_empty());
}
#[test]
fn snapshot_disappearance_is_not_a_terminal_verdict() {
    let mut s = state();
    s.block("a", "z", 100, &[m3()], true).unwrap();
    let changes = s
        .snapshot(&record(
            "bundle_set",
            "bundles",
            "9",
            Some(9),
            json!({"sidechain_number":9,"proposals":[]}),
        ))
        .unwrap();
    assert_eq!(changes[0].data["status"], "not_in_snapshot");
    assert!(s.bundle_complete.contains(&9));
}
#[test]
fn conflicts_quarantine_both_deposit_representations() {
    let deposit = record(
        "deposit",
        "treasury",
        "9:aa:0",
        Some(9),
        json!({"outpoint":{"txid":"aa","vout":0},"sequence_number":"0","value_sats":"1000","address":"ab"}),
    );
    let transition = record(
        "treasury_transition",
        "treasury",
        "9:aa:0",
        Some(9),
        json!({"kind":1,"sidechain_number":9,"previous_ctip":null,"new_ctip":{"txid":"aa","vout":0,"value_sats":"999"},"delta_sats":"999","sequence_number":"0","sidechain_address":"ab"}),
    );
    let (records, corroboration) = reconcile(vec![deposit, transition]);
    assert!(corroboration.is_empty());
    assert!(records.iter().all(|r| r.entry.error.is_some()));
    let changes = state().block("a", "z", 100, &records, true).unwrap();
    assert!(
        !changes
            .iter()
            .any(|c| c.kind == "deposit" || c.kind == "ctip")
    );
}
#[test]
fn same_kind_conflict_never_chooses_first_payload() {
    let (records, _) = reconcile(vec![m2(1), m2(2)]);
    assert_eq!(records.len(), 2);
    assert!(records.iter().all(|r| r.entry.error.is_some()));
}

#[test]
fn conflicting_terminal_verdicts_stop_dependent_completeness() {
    let rich = record(
        "treasury_transition",
        "treasury",
        "9:aa",
        Some(9),
        json!({"kind":2,"sidechain_number":9,"m6id":"aa","sequence_number":"1"}),
    );
    let slot = record(
        "bundle_outcome",
        "bundles",
        "9:aa",
        Some(9),
        json!({"m6id":"aa","state":{"Failed":{}}}),
    );
    let (records, _) = reconcile(vec![rich, slot]);
    let mut state = state();
    let changes = state.block("a", "z", 100, &records, true).unwrap();
    assert!(
        !changes
            .iter()
            .any(|c| c.kind == "bundle" || c.kind == "ctip")
    );
    assert_eq!(state.first_errors["treasury"], "1");
    assert_eq!(state.first_errors["bundles"], "1");
}

#[test]
fn malformed_headers_are_not_protocol_errors() {
    for kind in ["chain_tip", "block_connected", "block_disconnected"] {
        let entries = normalize::normalize(
            kind,
            &json!({}),
            normalize::Anchor {
                slot: Some(7),
                ..Default::default()
            },
        );
        assert_eq!(entries[0].family, "blocks", "{kind}");
        assert_eq!(entries[0].slot, Some(7));
    }
}

#[test]
fn malformed_bundle_snapshot_keeps_its_slot() {
    let payload = json!({"monitor_event":{"Enforcer":{"event":{"WithdrawalBundleProposals":{"sidechain_number":7,"proposals":[{"m6id":"not-hex","vote_count":1,"proposal_height":100}]}}}}});
    let entries = normalize::normalize(
        "withdrawal_bundle_proposals",
        &payload,
        normalize::Anchor {
            slot: Some(7),
            ..Default::default()
        },
    );
    assert!(entries[0].error.is_some());
    assert_eq!(entries[0].family, "bundles");
    assert_eq!(entries[0].slot, Some(7));
}

#[test]
fn invalid_bundle_slot_does_not_erase_other_slots_or_their_votes() {
    let mut s = state();
    s.block("a", "z", 100, &[m1(), m3()], true).unwrap();
    s.bundle_complete.extend([7, 9]);
    let mut error = record("interpretation_error", "bundles", "", Some(7), Value::Null);
    error.entry.error = Some("invalid m6id".into());
    let gaps = s.block("b", "a", 101, &[error, alarm()], true).unwrap();
    assert_eq!(s.bundles["9:aa"].bundle.vote_count, 0);
    assert!(s.bundle_complete.contains(&9));
    assert!(!s.bundle_complete.contains(&7));
    assert!(gaps.iter().any(|c| c.kind == "gap" && c.slot == Some(7)));
    assert_eq!(s.proposals.len(), 1);
}

#[test]
fn replacement_preserves_bundle_completeness_instead_of_inventing_it() {
    for complete in [false, true] {
        let mut s = state();
        s.block("a", "z", 100, &[m1(), m3()], true).unwrap();
        if complete {
            s.bundle_complete.insert(9);
        }
        s.block("b", "a", 101, &[m2(3)], true).unwrap();
        assert_eq!(s.bundle_complete.contains(&9), complete);
        assert_eq!(s.bundles["9:aa"].bundle.vote_count, 1);
    }
    let mut s = state();
    s.block("a", "z", 100, &[m1()], true).unwrap();
    s.block("b", "a", 101, &[m2(2)], true).unwrap();
    assert!(s.bundle_complete.contains(&9));
    assert!(s.bundles.is_empty());
}

#[test]
fn malformed_m4_effect_preserves_other_slots_in_the_same_message() {
    let hash = "ab".repeat(32);
    let header = json!({"hash":hash,"previous_hash":"cd".repeat(32),"height":101,"chain_work":"01".repeat(32),"timestamp":1000});
    let good =
        json!({"sidechain_number":9,"action":1,"upvoted_m6id":null,"downvoted_m6ids":["aa"]});
    let bad =
        json!({"sidechain_number":7,"action":1,"upvoted_m6id":null,"downvoted_m6ids":["invalid"]});
    let payload = json!({"monitor_event":{"Enforcer":{"event":{"Bip300BlockDelta":{
        "header":header,"coinbase_txid":"ef".repeat(32),"coinbase_messages":[{"vout":0,"raw_script_pubkey":"6a","accepted":true,"message":{"M4":{"mode":2,"raw_votes":[],"effects":[bad,good]}}}],"treasury_transitions":[],"confirmed_bmm_requests":[]
    }}}}});
    let entries = normalize::normalize(
        "bip300_block_delta",
        &payload,
        normalize::Anchor {
            hash: Some(&hash),
            height: Some(101),
            slot: None,
        },
    );
    assert!(
        entries
            .iter()
            .any(|e| e.error.is_some() && e.slot == Some(7))
    );
    let records: Vec<_> = entries
        .into_iter()
        .map(|entry| Record {
            evidence: Evidence {
                event_id: "2".into(),
                ordinal: entry.ordinal,
                observation_id: None,
            },
            entry,
        })
        .collect();
    let mut s = state();
    s.block("a", "z", 100, &[m3()], true).unwrap();
    s.bundle_complete.extend([7, 9]);
    s.block(&hash, "a", 101, &records, true).unwrap();
    assert_eq!(s.bundles["9:aa"].bundle.vote_count, 0);
    assert!(s.bundle_complete.contains(&9));
    assert!(!s.bundle_complete.contains(&7));
}
