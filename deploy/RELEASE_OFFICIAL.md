# Official-source candidate: projection 7

The source and image pins are in [RELEASE_OFFICIAL.json](RELEASE_OFFICIAL.json).
The image is built from GPG-signed source
`026d0c739c86eb4c18ba87be7de4ebbae25c91ad`; the release documentation commit can
be newer without changing those binary inputs.

Use the `observatory.oci.tar` destination and digest as `PULSE_IMAGE` only after
publication and registry verification. The source must be a fresh monitor
contract-8 / SQL-9 dataset; use a fresh Observatory database and its explicit UUID.
This candidate removes private rule replay. Capabilities determine compatibility;
SHAs record provenance. See [SOURCE_CONTRACT.md](../SOURCE_CONTRACT.md).

Local checks passed: 14 unit tests, Clippy, generated API types, production web
build, real PostgreSQL importer/API, reorgs and immutable conflicts, independently
advancing node, failed enforcer, invalid/changed snapshots, instance-specific CTIP,
occurrence-time filters, exact u64 browser rendering and paired backup/restore.

The four OCI archives are local and unpublished. The monitor release remains
`preparing`. Review and merge the two consumer repositories, publish exact bytes
with preserved digests and verify them before requesting HOSTKEY cutover approval.
Preserve both old databases, their binaries/locks and the old enforcer directory;
start official upstream in a separate directory. No remote changes were applied.
