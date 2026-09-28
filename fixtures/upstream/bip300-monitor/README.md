# Pinned monitor contract fixtures

These files are copied without modification from
[GuiSchet/bip300-monitor](https://github.com/GuiSchet/bip300-monitor/tree/f8badd49b81cb00ff1c711885afd744bbde43e7e),
commit `f8badd49b81cb00ff1c711885afd744bbde43e7e`.
They provide the contract-6 protobuf envelopes and SQL schema 7 used by tests.
The monitor application and deployment configuration are not included.

The upstream MIT license is retained in `LICENSE`. `SHA256SUMS` records each
upstream file. From this directory, verify them with `sha256sum -c SHA256SUMS`.
Update this snapshot only when reviewing a new source contract, together with
`SOURCE_CONTRACT.md`, adapter compatibility checks and fixture expectations.
