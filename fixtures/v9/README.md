# Official-source fixture inputs (contract 9)

The protobuf and SQL 8/9/10 files are copied from the bip300-monitor branch
`fix/observer-data-quality-v7` (contract 9 / record schema 10). Migrations 1–7
are unchanged archived inputs under `../upstream/bip300-monitor`, where the
upstream MIT license is retained. SHA256SUMS verifies the copies here.

`../v9.py` generates the contract-9 projection fixture. Its all-zero monitor
revision is explicit synthetic provenance, not a published or deployed SHA.
Header chains and raw block bytes are synthetic; cryptographic block validation
is tested in the monitor. The official enforcer SHA is recorded independently.
The fixture tests capability compatibility, not a hardcoded commit allowlist.
