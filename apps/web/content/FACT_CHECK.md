# Lesson fact check

Every technical claim in the lessons, with its source and status. Sources:

- **BIP300/BIP301**: `bitcoin/bips` master, `bip-0300.mediawiki` and `bip-0301.mediawiki`.
- **L2L spec**: `LayerTwo-Labs/bip300_bip301_specifications` master, `bip300.md` and `bip301.md`.
- **Enforcer**: `LayerTwo-Labs/bip300301_enforcer` at `1753fc0c23863bcb39c681e1cfaea2705613516f`, the build the
  monitor reports in `/api/v1/meta` (`current_run.enforcer_commit`). The local checkout was diffed against GitHub.
- **API**: the Observatory API against the Betanet dataset `64587c1e-…` on 2026-10-09.

Protocol numbers (thresholds, ages, activation height) are never written into the copy: lessons read them from
`/api/v1/chain-info` (`useNetworkParams`). The numbers below record what was checked, not what the page prints.

Status: ✅ verified · ⚠️ verified with a caveat stated in the lesson.

## Network and parameters

| Claim | Source | Status |
|---|---|---|
| Betanet is a fork of Bitcoin mainnet enforcing BIP300/301 from block 967,680 | Enforcer `lib/types.rs` L155-166 (`NetworkParams::betanet`); API `chain-info.bip300_constants.activation_height = 967680`; `meta.dataset.activation_height = 967680` | ✅ |
| Betanet: unused slot needs > 1,008 votes within 2,016 blocks | Enforcer `Thresholds::BETANET` L59-62 (overrides `unused_sidechain_slot_activation_threshold` only); API chain-info | ✅ |
| Betanet: used slot and withdrawals need > 13,150 votes within 26,300 blocks | Enforcer `Thresholds::MAINNET` L50-57 inherited by BETANET; API chain-info | ✅ |
| Thresholds must be **strictly exceeded**; the age window is inclusive | Enforcer `activates_unused_slot` L97-104; `validator/task/mod.rs` L290 (used slot), L698 (`vote_count > withdrawal_bundle_inclusion_threshold`); L2L spec M6 section ("reaches THRESHOLD + 1 votes") | ⚠️ BIP300 D2 text says "13150 or greater"; the lesson follows the enforcer and mentions the wording difference |
| The unused-slot threshold differs between documents | BIP300 M2 text: 1,008 fails in 2,016 blocks (50%); L2L spec constants: 1,815; enforcer mainnet: 1,815; Betanet: 1,008 | ⚠️ explained in "Creating a sidechain" |
| `OP_DRIVECHAIN` is `OP_NOP8` on Betanet; BIP300 specifies `OP_NOP5` | BIP300 "OP_DRIVECHAIN"; enforcer `OpDrivechain` L920-932 and `betanet()` | ✅ |
| One coin = 100,000,000 sats | Bitcoin consensus `COIN`, inherited by the fork; API `native_asset` is `sats` with 0 decimals (display unit) | ✅ |
| New blocks about every ten minutes on average | Bitcoin difficulty target, inherited by the fork | ✅ |

## Concepts

| Claim | Source | Status |
|---|---|---|
| BIP300 withdrawals are governed by proof-of-work instead of a federation; slow, transparent, auditable; users can ignore them | BIP300 Abstract | ✅ |
| 256 slots, 0–255, slot number is one byte | BIP300 D1 field 1 (`uint8_t`), BIP301 BMM Accept "Sidechain number (0-255)" | ✅ |
| Declaration = title, description, hash1 (release archive), hash2 (git commit); hashes "not enforced … for human purposes only" | BIP300 D1 fields 3-6, M1 serialization | ✅ |
| A used slot can be overwritten by a new sidechain with a higher vote | BIP300 M2 ("Thus we can overwrite a used sidechain slot"); enforcer L290 | ✅ |
| Declaration hash is SHA256d of the decoded description bytes without CompactSize; M2 votes quote it | `SOURCE_CONTRACT.md`; BIP300 M2 "sha256D hash of sidechain's serialization" | ✅ |
| Reorg: the branch with more accumulated work wins; disconnected blocks' effects are undone | Bitcoin consensus; enforcer keeps undo diffs (`validator/task/mod.rs` disconnect handling) | ✅ |
| A block's timestamp is set by the miner and can differ from when the monitor saw it | Bitcoin consensus; observed in API (block 971,518 `block_time` 13:54:08 after `first_observed_at` 13:53:09) | ✅ |
| Observatory instance identity = slot + proposal height + activation height + description hash | API `entity_id` format, e.g. `9:967989:968998:3a7d…` | ✅ |
| `mainchain_transition` records do not say whether a block was connected or disconnected in the API | `enforcer_extractor.proto` `MainchainTransition.action`; API `data` has no action field | ✅ described as "a change of the chain" |

## Cross-checks with live data

| Observation | Consistent with | Status |
|---|---|---|
| Thunder (#9) proposed at 967,989, active at 968,998, with `vote_count` 1,009 | 1,009 > 1,008 within 1,009 ≤ 2,016 blocks | ✅ |
| Seven instances (#2, #4, #9, #13, #98, #99, #255) share proposal 967,989 → activation 968,998; FreeBank 968,020 → 969,029; Elements 969,706 → 970,715; Solana 969,851 → 970,860 | Each activates 1,009 blocks after its proposal: the first block where a proposal acked every block can exceed 1,008 | ✅ |
| Treasury of FreeBank rose with a 1,000,000,000-sat deposit at sequence 5 | Deposit `value_sats` = new CTIP − old CTIP (enforcer `validator/task/mod.rs` L879-884) | ✅ |
