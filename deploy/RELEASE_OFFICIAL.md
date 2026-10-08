# Official-source candidate: projection 8

The paired release record is [RELEASE_OFFICIAL.json](RELEASE_OFFICIAL.json),
identical in the monitor repository. This projection requires a fresh monitor
contract-9 / SQL-10 dataset, a fresh Observatory database and its explicit UUID.
Capabilities determine compatibility; SHAs record provenance. See
[SOURCE_CONTRACT.md](../SOURCE_CONTRACT.md).

The contract-8 image (`026d0c7`) is superseded. Rebuild the Observatory image
from the merged commit, record its digest in the release record and verify the
published bytes before using it as `PULSE_IMAGE`.

Validated from source: Rust units, Clippy, generated API types, production web
build, and `PULSE_BROWSER_TESTS=1 scripts/verify-local.sh` against real
PostgreSQL (importer, API, reorgs, immutable conflicts, a tip ahead of its node
header, rows behind the import cursor, rewritten source rows, append-only sync
privileges, snapshot deduplication, transition gaps, Chrome content checks and
checksummed paired dump/restore).

The monitor release remains `preparing`. Review and merge the two consumer
repositories together, publish exact bytes with preserved digests and verify
them before requesting HOSTKEY cutover approval. Preserve both old databases,
their binaries/locks and the old enforcer directory; start official upstream in
a separate directory. No remote changes were applied.
