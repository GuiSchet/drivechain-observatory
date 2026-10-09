# Official source contract

Reviewed official enforcer: LayerTwo-Labs `1753fc0c23863bcb39c681e1cfaea2705613516f`.
Source SHAs and immutable image digests identify provenance, not compatibility.
The consumer requires **fresh contract 9 / monitor SQL 10 / projection 8** and the
capabilities in `crates/domain/src/lib.rs`. A compatible official update does
not require changing a SHA allowlist. Old databases remain separate archives.

| Source | Available information | Limits |
|---|---|---|
| Node mainchain_block | Verified headers, parent links, absolute work; the raw block body stays in the monitor | Does not select the enforcer branch |
| Official GetBlockInfo | Per-slot deposits, BMM commitments, bundle outcomes | No resolved historical protocol effects |
| Official SubscribeEvents(0) | Global live connects/disconnects, even with no active slots; a boundary per (re)subscription bounding each gap | No durable server sequence/baseline or offline replay |
| Official state RPCs | Active instances, proposals, CTIP, pending bundles, read on every tip change | Unanchored read windows; no atomic snapshot |
| GetSeenBmmRequests | Observed bids, including every empty sample | Readiness and exhaustive coverage unknown; samples right after start are `unknown` |
| Node fee enrichment | Exact confirmed fees for previously observed matching bids | Partial coverage; absent prevouts remain unknown |

`crates/source` normalizes observations. It does not implement BIP300 voting,
expiry, activation or treasury transition rules. No votes or terminal outcomes
are inferred between reads. Historical eligibility ratios remain null.
Raw protobuf and exact source JSON remain available separately, except the node
raw block body: `mainchain_block` is imported with an empty envelope and without
`raw_block`, keeping both source hashes (which cover the full block) verbatim. Monetary u64
values and identifiers are decimal strings. Description identity is SHA256d of
the decoded description bytes, excluding CompactSize, in display order. Every
hash and txid is in display order, including the M6 identifier (bundle txid).

State snapshots have null block anchors. Their occurrence windows contain
before/after tips and `tip_matched`, `changed` or `unknown` consistency. Equal
tips never prove atomicity or exclude A → B → A. Revisions remain null. The
latest current-run occurrence is selected before validation; invalid or changed
new evidence cannot silently borrow an earlier good response. CTIP by instance
uses the identity recorded at capture, not inferred activation-height intervals.
History time filters default to occurrence time; block-time filters exclude
unanchored state. Charts show separate observations, not interpolated state.
Every list reports the quality and `observed_at` of an item's latest read and
`first_observed_at`; snapshot quality is `tip_matched` only when that read was.
The monitor records every reading, so an unchanged value re-read at a later tip
extends its history row (occurrences) and shows when it was last confirmed.
Histories sort by latest occurrence (`order=observed`) or by block height
(`order=block`, the deposits default); in block order an unanchored reading sorts
by the tip of its first read, which orders it but does not anchor it.
`changes=true` drops a reading equal to the previous reading of the same entity,
such as a re-read after a restart. The kept reading reports the latest read,
latest quality and total occurrences of the repeats it stands for, and keeps the
evidence of its first read; values are never merged across a change or interpolated.

Enforcer tip observations select the branch. Node cumulative work must satisfy
parent work + child work = child cumulative work, with positive block work.
Contradictory immutable facts stop certification. Reorgs preserve alternatives
and shared ancestors. Node and enforcer disagreement is visible and prevents
joint certification. A failed enforcer run does not prevent importing node data.

Confirmed fee records carry `coverage=observed_bids_only`; bid amounts are never
substituted for paid fees. Unknown prior samples cannot establish a complete M8
history. Empty BMM responses are not evidence of mempool readiness.

Subscription boundaries bound the intervals whose global transitions are
unknown; `/coverage` lists them as transition gaps.

The monitor commits rows in id order (schema 10), so the importer pages by id.
A row that appears behind a cursor, or an imported row whose source content
changes, stops the sync as `incompatible` and is recorded in
`ingest.import_conflicts`; it is never imported silently.

The importer uses a dedicated read-only source role. Tests use all ten actual
monitor migrations and generated envelopes in `fixtures/v9`; synthetic block
bytes test projection behavior, not cryptographic validation. The monitor tests
raw block decoding separately.
