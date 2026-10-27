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
| eCash (ECX) is a Bitcoin hard fork associated with Paul Sztorc and LayerTwo Labs that activates drivechains (BIP300/301); it is distinct from eCash (XEC) | ecash.com "What is eCash" (checked 2026-10-09) | ✅ |
| Betanet is eCash's rehearsal network ("Alpha and Beta are rehearsals"), started from a Bitcoin snapshot at block 967,680, before eCash's mainnet | ecash.com "What is eCash" ("Betanet launched on September 19, 2026 at block 967,680"); enforcer `NetworkParams::betanet` | ✅ mainnet date not shown: ecash.com calls it an estimate |
| Betanet is a fork of Bitcoin mainnet enforcing BIP300/301 from block 967,680 | Enforcer `lib/types.rs` L155-166 (`NetworkParams::betanet`); API `chain-info.bip300_constants.activation_height = 967680`; `meta.dataset.activation_height = 967680` | ✅ |
| Betanet: unused slot needs > 1,008 votes within 2,016 blocks | Enforcer `Thresholds::BETANET` L59-62 (overrides `unused_sidechain_slot_activation_threshold` only); API chain-info | ✅ |
| Betanet: used slot and withdrawals need > 13,150 votes within 26,300 blocks | Enforcer `Thresholds::MAINNET` L50-57 inherited by BETANET; API chain-info | ✅ |
| Thresholds must be **strictly exceeded**; the age window is inclusive | Enforcer `activates_unused_slot` L97-104; `validator/task/mod.rs` L290 (used slot), L698 (`vote_count > withdrawal_bundle_inclusion_threshold`); L2L spec M6 section ("reaches THRESHOLD + 1 votes") | ⚠️ BIP300 D2 text says "13150 or greater"; the lesson follows the enforcer and mentions the wording difference |
| The unused-slot threshold differs between documents | BIP300 M2 text: 1,008 fails in 2,016 blocks (50%); L2L spec constants: 1,815; enforcer mainnet: 1,815; Betanet: 1,008 | ⚠️ explained in "Creating a sidechain" |
| `OP_DRIVECHAIN` is `OP_NOP8` on Betanet; BIP300 specifies `OP_NOP5` | BIP300 "OP_DRIVECHAIN"; enforcer `OpDrivechain` L920-932 and `betanet()` | ✅ |
| One coin = 100,000,000 sats | Bitcoin consensus `COIN`, inherited by the fork; API `native_asset` is `sats` with 0 decimals (display unit) | ✅ |
| Difficulty aims for one block every ten minutes; the real pace varies, and Betanet's has varied widely | Bitcoin difficulty target, inherited by the fork; Betanet averaged ~7.5 min/block from 967,680 to 971,518 (Sep 19 – Oct 9) and ran far faster in bursts (an external review saw 200 blocks in ~5.5 h) | ⚠️ lessons state the target, not a pace; `BlockHeartbeat` shows the observed one |

| Donation address `bc1qkh8x…kt6m` is a valid mainnet SegWit v0 (P2WPKH) address | bech32 checksum and program length checked; rendered QR decoded back to the same string with jsQR | ✅ |
| The same `bc1…` address works on eCash: its node keeps Bitcoin's mainnet `bech32_hrp = "bc"` | `ecash-com/bitcoin` branches `betanet` and `drivechain-ecash`, `src/kernel/chainparams.cpp` | ✅ |

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

| M1 is a coinbase `OP_RETURN` with header `D5E0C4AF` + slot + declaration (version, title, description, hash1, hash2) | BIP300 M1; L2L spec M1; enforcer `lib/messages.rs` L41 | ✅ |
| M2 differs in three documents. BIP300: header `D6E1C5BF` + declaration hash; at most one M1 and one M2 per block. L2L spec: `D6E1C5BF` + slot + hash; several M1 (no duplicate slot+declaration), one M2 per slot. Enforcer on Betanet: **`D6E1C5DF`** + slot + hash; same per-block limits as the L2L spec | BIP300 M1/M2 ("There is already an M1 in this block", "An M2 is already in this block"); L2L spec `bip300.md` M2 Encoding and lines 1051-1062; enforcer `lib/messages.rs` L76-98 (`M2AckSidechain::TAG`), L533-568 (`CoinbaseMessages::push`) | ⚠️ the lesson shows all three; Betanet follows the enforcer |
| A block gives a proposal at most one vote | All three: BIP300 one M2 per block; L2L spec and enforcer one M2 per slot | ✅ |
| A new proposal starts with 0 votes; an M2 only counts from the block after the proposal | BIP300 M1 ("age=0, fails=0"); enforcer `handle_m2_ack_sidechain` comment L249-252 | ✅ |
| Proposals are dropped when too old or when they can no longer reach the threshold | Enforcer `handle_failed_sidechain_proposals` | ✅ lesson says "dropped" when it "runs out of time" |
| Only miners write coinbase transactions | Bitcoin consensus | ✅ |
| Treasury: one `OP_DRIVECHAIN` output per sidechain (CTIP); deposits and withdrawals replace it with exactly one new one | BIP300 M5 ("the old UTXO is spent and a single new UTXO is created"), D1 fields 9-10 | ✅ |
| M5 valid if exactly one `OP_DRIVECHAIN` output with more coins than before; no vote | BIP300 M5 | ✅ |
| The output after the treasury output records the sidechain address; BIP300 does not require it | Enforcer `validator/task/mod.rs` L862-873; L2L spec "address OP_RETURN output"; BIP300 M5 defines deposits only by the treasury growing | ✅ lesson says which documents require it |
| Treasury script is `OP_DRIVECHAIN <slot> OP_TRUE`; anyone may spend it under M5/M6 rules | BIP300 "OP_DRIVECHAIN"; enforcer `OpDrivechain::script` | ✅ |
| Crediting a deposit on L2 is the sidechain's job; L1 and the Observatory don't see it | BIP300 Abstract (partitioning); `SOURCE_CONTRACT.md` | ✅ |
| CTIP `sequence_number` counts treasury outputs | Enforcer `treasury_utxo_count`; API FreeBank deposits at 971,479 (seq 4) and 971,481 (seq 5) match CTIP seq 5 | ✅ |
| Bundles pay all or nothing; many withdrawals per L1 transaction | BIP300 "Withdrawing in bundles", D2 | ✅ |
| M3 proposes a bundle and counts as the first vote | BIP300 M3 ("initial ACK score = 1"); enforcer test `handle_m3_propose_starts_vote_count_at_one` | ✅ |
| An M4 is optional in each block | BIP300 M4; enforcer treats a block without M4 as abstain | ✅ lesson says "may carry" |
| M4 per block: upvote one bundle per sidechain (others with votes lose one), abstain (no change), alarm (all lose one); no M4 = abstain; votes never below 0 | BIP300 M4; enforcer `handle_m4_votes`, `downvoted_others_for_upvote`, `positive_votes_proposals_for_alarm` (only bundles with `vote_count > 0`); RepeatPrevious handling L506-534 | ✅ |
| Miners vote on the M6 id, a "blinded" txid without inputs and with the treasury output replaced by a fee `OP_RETURN` | BIP300 D2 field 2, "Withdrawing in bundles"; L2L spec `m6_to_id` | ✅ |
| The M6 id is shown in the byte order of the M3 coinbase message; the API stores it reversed (txid order) | Coinbase of betanet block 970,438: `OP_RETURN d45aa943 09 aa769fec…ced4`; enforcer proto sends `m6id` as `ConsensusHex`; monitor `convert.rs` `m6id_display` reverses it; ecpool.tech shows `aa769fec…` | ✅ verified 2026-10-12 |
| M6 returns the remainder to a new treasury output | BIP300 M6 (first output is `OP_DRIVECHAIN`) | ✅ |
| Difficulty is block work × 65,535 / 2^48 | Header work 45,858,218,460,663,607,040 at block 973,743 gives 10,677,035,599.896; ecpool.tech `/api/pool/chain` reports `networkDifficulty` 10,677,035,599.896063 | ✅ verified 2026-10-13 |
| Retarget every 2,016 blocks toward 10-minute blocks | ecpool.tech `nextRetargetHeight` 975,744 = 2,016 × 484 at tip 973,743 | ✅ verified 2026-10-13 |
| eCash mainnet, from its fork at 973,728, retargets every 288 blocks with new target = old × (6T + A) / 7T, so a difficulty step of 7r / (6r + 1), ×0.70–×1.12 | `ecash-com/bitcoin` `5bd8690` "Add 288-block dampened retarget after eCash fork": `DifficultyAdjustmentInterval(height)`, `CalculateNextWorkRequired` and `PermittedDifficultyTransition` in `src/pow.cpp`; 973,728 = 288 × 3,381 | ✅ read 2026-10-27; the API reports `interval_blocks` per network |
| A pending bundle's pace and blocks to pass: needed = threshold + 1 − votes; blocks left = max age − age | ecpool.tech projection for Thunder's bundle at tip 973,743: votes 660, age 3,305, needed 12,491, blocks left 22,995, rate 0.1997, 62,550 blocks to pass at that rate | ✅ same formulas, and at tip 973,744 our needed (12,491) matches. Age runs to the anchor while the reading is current (ECPool 3,306). Our pace prefers the change over the last ~144 blocks of readings: the votes stayed at 660 through that window, so it is 0 and the bundle "would not pass at this pace", while ECPool's average since proposal is 0.1996 |
| Estimated hashrate = work of the window's blocks ÷ their time span | Tip 973,744: 1.84 × 10^16 H/s over 144 blocks (mean gap 839 s); ECPool reports 9.16 × 10^15 over 24 h (mean gap 5,008 s). Same method, different window | ✅ the page names its window |
| Bundles expire when older than the max age | Enforcer `handle_failed_m6ids` (`age > withdrawal_bundle_max_age`) | ⚠️ BIP300 also removes bundles that cannot succeed; lesson says "dropped once it can no longer pass in time", true for both |
| "ACK the bundle's hash over 3-6 months" | BIP300 "Withdrawing in bundles" (quoted) | ✅ |
| Bundle amounts are not visible on L1 until paid | BIP300: miners ACK the hash, "not the M6 itself" | ✅ |
| BMM: user builds side block h*, bids with a BMM Request naming the previous L1 block; miner commits one h* per sidechain in the coinbase (BMM Accept) and collects the matching request in the same block; one request per sidechain per block | BIP301 Specification, BMM Accept, BMM Request | ✅ |
| BIP301 names BMM Accept/Request; L2L spec numbers them M7/M8 | BIP301; L2L spec `bip301.md` headings | ✅ |
| A commitment does not establish the validity of the sidechain block | BIP301 ("blind"); previous Observatory copy | ✅ |
| Bid samples: empty sample ≠ no bids; a vanished bid ≠ paid; fees only for observed bids matching a commitment with readable prevouts | `SOURCE_CONTRACT.md` (GetSeenBmmRequests, node fee enrichment) | ✅ |
| "Thousands of blocks (about two weeks at the ten-minute target)" (activation) | Betanet unused-slot max age 2,016 blocks; 2,016 × 10 min = 14 days | ✅ stated in blocks, time only at the target |
| "Thousands of blocks (months at Bitcoin's ten-minute pace)" (withdrawals) | Betanet withdrawal threshold 13,150 blocks; × 10 min ≈ 91 days | ✅ stated in blocks, time only at the target |
| Effective minimum: votes must exceed the threshold, so 1,815 needs 1,816 and Betanet's 1,008 needs 1,009 | Enforcer `>` comparisons cited above | ✅ shown as "at least N + 1" |
| L1 checks only the vote count; a sustained hashrate majority can pay out a bundle that does not match L2 balances; the defense is time and visibility | BIP300 M2: "BIP-300 sidechains are already vulnerable to one catastrophe per 13150 blocks (the invalid withdrawal)"; BIP300 M6 and L2L spec M6 validate votes and the M6 id only | ✅ lesson "What protects the coins in a treasury" |
| L1 consensus is isolated from sidechains, deposited coins are not | BIP300 Abstract (partitioning) and the M2 quote above | ✅ |
| A BMM Accept needs no Request (miner builds the side block itself); Requests may be paid over Lightning and leave nothing on L1 | BIP301 "It is possible for Mary and Simon to be the same person… There would only be Accepts"; "This BIP allows BMM Requests to take place over Lightning" | ✅ |

| Pipeline: node + enforcer → monitor records every reading → Observatory copy → site; the site never queries the network | `README.md` Architecture; `SOURCE_CONTRACT.md` | ✅ |
| Snapshot readings are "tip matched" when the tip was the same before and after; not atomic, not tied to a block | `SOURCE_CONTRACT.md` ("Equal tips never prove atomicity") | ✅ |
| No protocol rules are replayed to fill gaps; vote counts are shown as read, not individual votes | `SOURCE_CONTRACT.md` ("does not implement BIP300 voting…", "No votes … are inferred between reads") | ✅ |
| Chain check: parent work + block work = cumulative work; node/enforcer disagreement prevents joint certification; a changed imported record stops the sync | `SOURCE_CONTRACT.md` | ✅ |
| Worker states: `stale` = no success within `stale_after_seconds` (30 s); `retrying` = failures; `degraded` = error | `crates/storage/src/lib.rs` `workers()` | ✅ |
| Exports hold up to 10,000 records and report truncation | Previous explorer copy; API `/api/v1/export` | ✅ |

| "How it works" step 1: a deposit is an ordinary L1 transaction into the sidechain's single treasury output; no vote | BIP300 M5 | ✅ |
| Step 2: the sidechain's own nodes credit the deposit; L1 never inspects the sidechain | BIP300 Abstract (partitioning); enforcer only validates L1 | ✅ shown as "Declared", not live |
| Step 3: each L1 block can commit to one block per sidechain; sidechain users pay the L1 miner; the miner runs no sidechain software | BIP301 Abstract, BMM Accept/Request | ✅ |
| Step 4: withdrawals are bundled into one L1 payout, voted block by block, and need more than the threshold within the max age | BIP300 D2, M3, M4, M6; enforcer L698 | ✅ |

## Cross-checks with live data

| Observation | Consistent with | Status |
|---|---|---|
| Thunder (#9) proposed at 967,989, active at 968,998, with `vote_count` 1,009 | 1,009 > 1,008 within 1,009 ≤ 2,016 blocks | ✅ |
| Seven instances (#2, #4, #9, #13, #98, #99, #255) share proposal 967,989 → activation 968,998; FreeBank 968,020 → 969,029; Elements 969,706 → 970,715; Solana 969,851 → 970,860 | Each activates 1,009 blocks after its proposal: the first block where a proposal acked every block can exceed 1,008 | ✅ |
| Thunder's pending bundle `d4ceb030…` proposed at 970,438 (outcome `Submitted` in that block) with 555–558 votes at ages 1,080–1,083 | Starts at 1, ≤ 1 vote per block; well below 13,150 | ✅ |
| Commitment grid: 5 of 10 sidechains (#2, #9, #13, #130, #255) commit in most blocks and match the slots bidding in `/bmm/auctions` | BIP301 request/accept pairing | ✅ |
| Treasury of FreeBank rose with a 1,000,000,000-sat deposit at sequence 5 | Deposit `value_sats` = new CTIP − old CTIP (enforcer `validator/task/mod.rs` L879-884) | ✅ |
