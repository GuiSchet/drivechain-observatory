# Reviewed source contract

Review: 2026-09-25. Published monitor main:
`f8badd49b81cb00ff1c711885afd744bbde43e7e`.
Monitor image build: `88da099049bb469aeee3dec3cc5d86a056970382`.
Reviewed enforcer runtime: `0740a39380b39885fe8655f79f78150001d8a15b`.
These identify the reviewed source; they do not attest a live deployment.
The operator promotes the monitor manually.

Observatory requires **a fresh contract-6 dataset, SQL schema 7**, and all 17 published
capabilities in both the dataset manifest and current running extractor. Earlier
datasets are rejected even when they contain no sidechain rows. Observatory does not
migrate old dataset identities. Use a new Observatory database with the explicitly
configured v6 dataset UUID. Old databases remain separate archives.

Reviewed protobuf SHA-256:

- `event.proto`: `02f7fa9e75ecc965fe46a0fdb4a9757274f6e29e33b741d5108f954f15574b3e`
- `enforcer_extractor.proto`: `65f42692a82d962e22e81ac6c3afbd8be2ba79b58f5729174287586e35ef65ad`

| Source kind | Observatory interpretation |
|---|---|
| `chain_info` | Raw network enums, activation and voting constants |
| `chain_tip` | Header, parent, height, exact accumulated work |
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
both tip hashes/heights and selected branch. Latest current-run observations
remain visible even if inconsistent; they cannot borrow an older occurrence's
validity. Historical reconstruction can use compatible prior runs in the same
fresh dataset, with their original evidence retained.

The SQL writer is serialized and migration 7 fences running extractors per
source/dataset. Observatory reads PostgreSQL only; it neither depends on NATS delivery
nor writes to the monitor. Integration fixtures use the seven actual source SQL
migrations and generated protobuf envelopes. The scale fixture is explicitly
synthetic and is not evidence of wire-level conformance.
