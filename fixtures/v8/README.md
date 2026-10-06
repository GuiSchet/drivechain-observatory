# Official-source fixture inputs

The protobuf and SQL 8/9 files are copied from the paired monitor candidate.
Migrations 1–7 are unchanged archived inputs under `../upstream/bip300-monitor`.
The upstream MIT license is retained there. SHA256SUMS verifies the copies here.

`../v8.py` generates the contract-8 projection fixture. Its all-zero monitor
revision is explicit synthetic provenance, not a published or deployed SHA.
Header chains and raw block bytes are synthetic; cryptographic block validation
is tested in the monitor. The official enforcer SHA is recorded independently.
The fixture tests capability compatibility, not a hardcoded commit allowlist.
