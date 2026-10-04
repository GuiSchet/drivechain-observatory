# Reviewed source contract

Review candidate: 2026-10-04. Enforcer source:
`9b2a15621469a88ea5d3b8f1dcd5ee1bb21e0ac4`.
Monitor source: `ecf5b8290e6b5501508a4a3913bd93c83728cca1`. Image pins are recorded in the paired release manifest. These
identify reviewed source; they do not attest a live deployment.

Observatory requires **a fresh contract-7 dataset, SQL schema8** and all required
capabilities listed in `crates/domain/src/lib.rs`, in both the dataset manifest
and current extractor run. It rejects older identities before importing them.
Use a new Observatory database and the explicitly configured v7 dataset UUID.
Old databases remain separate archives; v6 work must never be relabeled as
cumulative work.

Reviewed protobuf SHA-256:

- `event.proto`: `02f7fa9e75ecc965fe46a0fdb4a9757274f6e29e33b741d5108f954f15574b3e`
- `enforcer_extractor.proto`: `37651d1935a895cceb8bbd23d3be7373fa41e23d72fd30ebab1e5af810ea9fd4`

| Source kind | Observatory interpretation |
|---|---|
| `chain_info` | Raw network enums, activation and voting constants |
| `chain_tip` | Header, parent, height, per-block and absolute cumulative work |
| `mainchain_transition` | Global committed connect/disconnect and subscription boundary evidence |
| `confirmed_bmm_fees` | Separate exact fee enrichment, with explicit unavailable reason |
| `active_sidechains` | Stable observations of instances and declarations |
| `sidechain_proposals` | Proposal observations and reconstruction reconciliation |
| `ctip` | Treasury output, explicit absence, provenance and discrepancies |
| `block_connected` | Per-slot BMM presence/absence, deposits and bundle outcomes |
| `block_disconnected` | Retained branch/disconnection evidence |
| `withdrawal_bundle_proposals` | Pending attempts, vote counts, proposal heights |
| `bip300_block_delta` | M1/M2/M3/M4/M7, resolved effects, treasury transitions, M8 |
| `bmm_requests` | Exact sampled bids and every occurrence, including empty polls |

`crates/source` implements the typed adapter and deterministic replay. Raw
protobuf and exact source JSON remain separate evidence. Integers representing
money, sequence numbers or 64-bit IDs are decimal strings in the public view.
Unknown facts remain readable. Invalid children produce family-specific errors;
an unrelated BMM error does not erase proposal votes.

Description identity is SHA256d over the decoded description vector, excluding
its CompactSize prefix, in display byte order. V0 declarations may be decoded
from that vector; future versions retain their identity and raw evidence without
inventing a title.

The reviewed rules use M1=0 and M3=1 initial votes, strict thresholds, resolved
M2/M4 effects, saturating decreasing votes, proposal early failure and bundle
expiry at age greater than the limit. Coinbase effects precede expiration and
non-coinbase treasury effects. Repeated m6ids have separate attempts. Missing
snapshots never imply terminal failure. A gap invalidates dependent current
state; later stable observations or complete backfill can establish it again.

Global and slot deposits are merged only when their economic identity and
values agree. Conflicting effects are quarantined together. M6 treasury delta
is payout plus fee. M8 confirmed fees remain unknown when absent; sampled bids
are never substituted. BMM coverage uses covered eligible blocks, with null
ratios for unknown/zero denominators and explicit missing heights.

Semantic reconstruction uses only occurrences from the reviewed enforcer.
Unreviewed current builds, missing parameters or conflicting constants disable
verified rule calculations. Snapshot validation binds dataset, run, capture,
both tip hashes/heights, non-null equal chain revisions and selected branch. Latest current-run observations
remain visible even if inconsistent; they cannot borrow an older occurrence's
validity. Historical reconstruction can use compatible prior runs in the same
fresh dataset, with their original evidence retained.

The SQL writer is serialized and migration 7 fences running extractors per
source/dataset. Observatory reads PostgreSQL only; it neither depends on NATS delivery
nor writes to the monitor. Integration fixtures use the eight actual source SQL
migrations and generated protobuf envelopes. The scale fixture is explicitly
synthetic and is not evidence of wire-level conformance.

The chain projection requires `parent.cumulative_work + child.block_work =
child.cumulative_work` and positive block work. It retains alternatives and
rejects contradictions in header or immutable block contents, scoped by dataset,
contract, source and sidechain instance. Gaps recorded by the global-stream worker
are imported separately through `/api/v1/observation-failures`; backfill cannot
reconstruct missed live transitions. Coverage exposes 24-hour snapshot/failure
counts, conflict counts and the independent failure import cursor.

`/api/v1/bmm/confirmed` retains original confirmations and separate
`confirmed_bmm_fee` observations. Their exact decimal-string fee may be unknown
then become known; the original block delta never changes. BMM bids are never
substituted for confirmed fees. Each record carries source evidence and branch
membership.
