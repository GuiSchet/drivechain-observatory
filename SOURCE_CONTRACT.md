# Official source contract

Reviewed official enforcer: LayerTwo-Labs `1753fc0c23863bcb39c681e1cfaea2705613516f`.
Source SHAs and immutable image digests identify provenance, not compatibility.
The consumer requires **fresh contract 8 / monitor SQL 9 / projection 7** and the
capabilities in `crates/domain/src/lib.rs`. A compatible official update does
not require changing a SHA allowlist. Old databases remain separate archives.

| Source | Available information | Limits |
|---|---|---|
| Node mainchain_block | Verified raw bytes, headers, parent links, absolute work | Does not select the enforcer branch |
| Official GetBlockInfo | Per-slot deposits, BMM commitments, bundle outcomes | No resolved historical protocol effects |
| Official SubscribeEvents(0) | Global live connects/disconnects, even with no active slots | No durable server sequence/baseline or offline replay |
| Official state RPCs | Active instances, proposals, CTIP, pending bundles | Unanchored read windows; no atomic snapshot |
| GetSeenBmmRequests | Observed bids, including every empty sample | Readiness and exhaustive coverage unknown |
| Node fee enrichment | Exact confirmed fees for previously observed matching bids | Partial coverage; absent prevouts remain unknown |

`crates/source` normalizes observations. It does not implement BIP300 voting,
expiry, activation or treasury transition rules. No votes or terminal outcomes
are inferred between reads. Historical eligibility ratios remain null.
Raw protobuf and exact source JSON remain available separately. Monetary u64
values and identifiers are decimal strings. Description identity is SHA256d of
the decoded description bytes, excluding CompactSize, in display order.

State snapshots have null block anchors. Their occurrence windows contain
before/after tips and `tip_matched`, `changed` or `unknown` consistency. Equal
tips never prove atomicity or exclude A → B → A. Revisions remain null. The
latest current-run occurrence is selected before validation; invalid or changed
new evidence cannot silently borrow an earlier good response. CTIP by instance
uses the identity recorded at capture, not inferred activation-height intervals.
History time filters default to occurrence time; block-time filters exclude
unanchored state. Charts show separate observations, not interpolated state.

Enforcer tip observations select the branch. Node cumulative work must satisfy
parent work + child work = child cumulative work, with positive block work.
Contradictory immutable facts stop certification. Reorgs preserve alternatives
and shared ancestors. Node and enforcer disagreement is visible and prevents
joint certification. A failed enforcer run does not prevent importing node data.

Confirmed fee records carry `coverage=observed_bids_only`; bid amounts are never
substituted for paid fees. Unknown prior samples cannot establish a complete M8
history. Empty BMM responses are not evidence of mempool readiness.

The importer uses a dedicated read-only source role. Tests use all nine actual
monitor migrations and generated envelopes in `fixtures/v8`; synthetic block
bytes test projection behavior, not cryptographic validation. The monitor tests
raw block decoding separately. Older v5/v7 fixtures are archived references.
