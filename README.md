# Drivechain - Observatory

The project directory and repository name are `drivechain-observatory`.
The existing `pulse-*` Rust crates/binaries, `PULSE_*` configuration variables,
database/role names and API fields such as `pulse_revision` remain compatible.
The rename requires no database migration or evidence rewrite. Historical
fixture labels are retained with their original hashes and protobuf envelopes.

Public Betanet BIP300/301 observatory consuming a **fresh monitor contract v6 /
SQL schema 7 dataset**. It follows published `bip300-monitor-review` main
`f8badd49` and the pinned observer enforcer; see [SOURCE_CONTRACT.md](SOURCE_CONTRACT.md).
The monitor deployment is operated separately. Projection version 5 includes the
complete protocol read model and visual explorer.

## Architecture

`pulse-sync` reads a private monitor PostgreSQL through a dedicated read-only
role. Observatory preserves evidence and projections in its own PostgreSQL.
`pulse-api` reads only that local database and serves REST/OpenAPI/SSE.
The Next.js frontend can run independently on Vercel. Public traffic never
queries the monitor.

## Development

Requires Rust 1.96.0 (pinned by `rust-toolchain.toml`), Node.js 22, npm,
Docker Compose, Python 3 and curl. Install dependencies after cloning:

    cargo fetch --locked
    npm --prefix apps/web ci

The fixture verifier and OpenAPI generator use Cargo's offline mode after
this initial fetch. Keep both dependency lockfiles in version control.

Copy `deploy/.env.example` to `.env`; supply destination credentials, the existing
read-only `MONITOR_DATABASE_URL` and the **explicit** `PULSE_DATASET_ID` from the
source manifest. The example UUID is a fixture, not a production dataset.
Betanet network/checkpoint defaults are validated, not inferred from the
upstream `NETWORK_MAINNET` enum. Never commit database passwords.

Checks:

    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cargo test --workspace --all-features
    npm --prefix apps/web run generate:api
    npm --prefix apps/web run typecheck
    npm --prefix apps/web run build

Or use `just check` when Just is available. Regenerate the API types after any
public DTO change; `generate:api` exports OpenAPI from Rust without a database.

Run the isolated fixture, migration and behavioral integration suite:

    sh scripts/verify-local.sh

Requires Docker Compose, Rust, Python 3 and curl; uses loopback ports
55433/55434/18080/18081. It creates and removes only its own temporary Compose
project. The default v6 fixture uses all seven actual monitor migrations and
a separate Observatory database. The exact upstream files are included under
`fixtures/upstream/bip300-monitor`, with their commit, license and checksums;
no sibling monitor checkout is needed. Older v5 suites remain historical references.

To include Chromium checks against that same fixture, run:

    PULSE_BROWSER_TESTS=1 sh scripts/verify-local.sh

This also requires an installed Playwright package and Chromium, plus free
loopback port 13000. One option is a separate temporary npm project:

    mkdir -p /tmp/observatory-browser-tools
    npm --prefix /tmp/observatory-browser-tools install playwright@1.57.0
    /tmp/observatory-browser-tools/node_modules/.bin/playwright install chromium
    PULSE_PLAYWRIGHT_MODULE=/tmp/observatory-browser-tools/node_modules/playwright/index.mjs PULSE_BROWSER_TESTS=1 sh scripts/verify-local.sh

For an existing installation outside the project, set
`PULSE_PLAYWRIGHT_MODULE` to its absolute module entrypoint and
`PULSE_BROWSER_EXECUTABLE` to the Chromium executable. Screenshots are written to
`/tmp/drivechain-observatory-browser-v6` (override with `PULSE_BROWSER_ARTIFACTS`).

For interactive development, start the two databases using `compose.dev.yaml`,
run migrations with the admin role, run `pulse-sync` with the reader/sync roles,
then start `pulse-api` with the API role. Start the web app with
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080 npm --prefix apps/web run dev`.
See [deploy/README.md](deploy/README.md) for exact environment and upgrade rules.

## Implemented HTTP surface

- `/health/live`, `/health/ready`
- `/api/v1/meta`, `/api/v1/status`, `/api/v1/overview`, `/api/v1/sidechains`
- `/api/v1/coverage`, `/api/v1/bmm/auctions`
- `/api/v1/blocks`, `/api/v1/blocks/{hash}`
- `/api/v1/datasets/{dataset_id}/events/{event_id}` and `/raw`
- `/api/v1/observatory`, `/api/v1/chain-info`, `/api/v1/sidechain-proposals`
- `/api/v1/sidechain-instances`, `/api/v1/deposits`, `/api/v1/ctip/history`
- `/api/v1/withdrawal-bundles`, `/api/v1/bundle-attempts/{id}`
- `/api/v1/bmm`, `/api/v1/bmm/history`, `/api/v1/bmm/commitments`, `/api/v1/bmm/confirmed`
- `/api/v1/protocol-messages`, `/api/v1/activity`, `/api/v1/events`, `/api/v1/search`, `/api/v1/export`
- `/api/v1/runs`, `/api/v1/snapshot-groups`, event `/occurrences` and entity details
- `/api/v1/stream`, `/openapi.json`, `/docs`

Web routes include `/`, `/sidechains`, `/sidechains/{slot}`, instance/proposal/
withdrawal-attempt details, `/pegs`, `/bmm`, `/blocks`, `/explorer`, `/learn`,
`/about/data`, run/capture details and dataset-scoped block/event evidence.
Bids are exact strings in satoshis. API availability, source reachability,
worker health and freshness are separate states. Branch selection reports its
evidence, verified boundary and uncertainty. Development verification uses
isolated fixtures. Live-dataset certification, public deployment, backup/restore,
retention and public-load checks remain operator work.

## Branch reconstruction and explorer

Projection version 5 normalizes protocol state and headers, preserves conflicting facts, and follows
explicit tip observations in the current run. Compatible live extensions stay
provisional; contradictory live observations stay ambiguous until reconciled.
Backfill can repair gaps but does not select a newer tip by itself. Chainwork is
a lossless decimal string decoded from the monitor's little-endian uint256.

Block lists default to the selected branch, 50 rows, descending height/hash.
Use `scope=all`, `height`, `slot`, `dataset`, `limit` (1–200) and `cursor`.
Cursors bind their filters and projection generation; selected-branch cursors
also bind the branch revision. HTTP 409 `cursor_reset_required` means restart
pagination. Block details retain alternatives and expose up to 200 facts and
occurrences with explicit truncation. Evidence links keep the dataset identity.

Start a new Observatory destination for the fresh v6 dataset. Old datasets are retained
separately, not migrated. For later projection changes **within that v6 dataset**,
`pulse-sync rebuild --dataset-id <uuid>` uses only local evidence and destination
credentials, resumes checkpoints, and publishes a new generation atomically.
Version 5 uses `enforcer-0740a393-v2`. Apply the additive SQL migration, then
rebuild the existing v6 dataset before restarting sync. An older active generation
remains readable until atomic promotion; checkpoints from version 4 cannot resume
under the new semantics. Source IDs, envelopes and dataset identity are retained.
See [deploy/README.md](deploy/README.md) for the maintenance window.

Errors are isolated by family and known slot. Block replay excludes snapshots and
mempool samples; snapshot diagnostics require a reviewed occurrence and stable,
branch-compatible group. Historical gaps remain visible even after a later
snapshot recovers current state. Malformed redundant headers do not freeze a
branch supported by independent valid evidence; contradictory valid headers do.
`ReplaceActive` preserves pending withdrawals and their previous completeness.
Verified constants can survive a reviewed restart in the same dataset, with
`parameters_evidence` identifying their source; incompatible builds inherit no
semantic support. “No CTIP” is an observed absence, distinct from a coverage gap.

Protocol lists default to 50 rows (maximum 200); filters include `dataset`,
`scope`, `slot`, `kind`, `hash`, `key`, `q`, height/time bounds and `time_basis`.
Their cursors also bind the immutable build. Exports preserve those filters and
report a 10,000-row truncation boundary. `source_event_cut` is the build's scan
boundary; completeness is separately qualified by family progress and the
conservative REST/SSE watermark.

Add `PULSE_SCALE_TESTS=1` to `scripts/verify-local.sh` to generate a disposable
million-event fixture, interrupt/resume rebuilding, inspect an indexed query
plan and measure one incremental extension. The report is written to
`/tmp/drivechain-observatory-scale-v6.json`. It can be combined with browser checks.
