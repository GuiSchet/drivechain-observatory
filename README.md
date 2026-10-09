# Drivechain - Observatory

The project directory and repository name are `drivechain-observatory`.
The existing `pulse-*` Rust crates/binaries, `PULSE_*` configuration variables,
database/role names and API fields such as `pulse_revision` remain compatible.
The rename requires no database migration or evidence rewrite. Historical
fixture labels are retained with their original hashes and protobuf envelopes.

Public Betanet BIP300/301 observatory consuming a **fresh monitor contract 9 /
SQL schema 10 dataset**, with projection 8. It uses unmodified official enforcer
APIs and independent node evidence; unsupported protocol effects remain unknown.
See [SOURCE_CONTRACT.md](SOURCE_CONTRACT.md). Deployment is operated separately.

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
project. The v9 fixture uses all ten actual monitor migrations and a separate
Observatory database. The exact upstream files are included under `fixtures/v9`
(and `fixtures/upstream`), with their license and checksums; no sibling monitor
checkout is needed.

To include Chromium checks against that same fixture, run:

    PULSE_BROWSER_TESTS=1 sh scripts/verify-local.sh

This also requires an installed Playwright package and Chromium or Chrome, plus
free loopback port 13000. CI installs only the pinned library and uses the
runner's Chrome; locally, for example:

    mkdir -p /tmp/observatory-browser-tools
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm --prefix /tmp/observatory-browser-tools install playwright@1.56.1
    PULSE_PLAYWRIGHT_MODULE=/tmp/observatory-browser-tools/node_modules/playwright/index.mjs PULSE_BROWSER_EXECUTABLE=/usr/bin/google-chrome PULSE_BROWSER_TESTS=1 sh scripts/verify-local.sh

For an existing installation outside the project, set
`PULSE_PLAYWRIGHT_MODULE` to its absolute module entrypoint and
`PULSE_BROWSER_EXECUTABLE` to the Chromium executable. Screenshots are written to
`/tmp/drivechain-observatory-browser-official` (override with `PULSE_BROWSER_ARTIFACTS`).

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
- `/api/v1/observatory`, `/api/v1/observations`, `/api/v1/chain-info`
- `/api/v1/sidechains/{slot}` and its `/activity` and `/instances`
- `/api/v1/sidechain-proposals` and `/{id}`, `/api/v1/sidechain-instances` and
  `/{id}` and `/{id}/ctip`, `/api/v1/deposits`, `/api/v1/ctip/history`
- `/api/v1/withdrawal-bundles` and `/{id}` (pending bundles and block outcomes),
  `/api/v1/bundle-attempts` and `/{id}`
- `/api/v1/bmm`, `/api/v1/bmm/history`, `/api/v1/bmm/commitments`, `/api/v1/bmm/confirmed`
- `/api/v1/protocol-messages` (facts that could not be interpreted; the official
  sources report no coinbase messages), `/api/v1/activity`, `/api/v1/events`,
  `/api/v1/search`, `/api/v1/export`
- `/api/v1/runs`, `/api/v1/snapshot-groups`, `/api/v1/observation-failures`,
  event `/occurrences` and entity details
- `/api/v1/stream`, `/openapi.json`, `/docs`

The web app is a guided learning path: `/` and `/learn/{chapter}` teach BIP300/301
one concept at a time, each with live panels and links to the specification;
`/sidechains`, `/sidechains/{slot}`, `/live`, `/glossary` and `/search` follow the
same plain-language style. Run/capture details and dataset-scoped block/event
pages remain as the proof behind every value. Lesson claims and their sources are
tracked in `apps/web/content/FACT_CHECK.md`; the earlier technical routes redirect
to their lessons.
Bids are exact strings in satoshis. API availability, source reachability,
worker health and freshness are separate states. Branch selection reports its
evidence, verified boundary and uncertainty. Development verification uses
isolated fixtures. Live-dataset certification, public deployment, backup/restore,
retention and public-load checks remain operator work.

## Branches and observation quality

Projection 8 follows the enforcer's observed tip while independently importing
node headers and raw blocks. A tip reported before its node header keeps the
selected branch until the header arrives. Alternatives and conflicting facts remain visible.
Node/enforcer disagreement blocks joint certification. Chainwork is a lossless
decimal string decoded from node little-endian uint256.

State responses are separate unanchored observations. Matching read-window tips
are not atomic state. Latest invalid/changed occurrences cannot borrow earlier
quality, and every list reports the quality and time of an item's latest read.
An unchanged re-read extends its history row (occurrence count, last read).
Subscription gaps of the global transition stream are listed in `/coverage`.
Imported evidence is audited against the source; rows that appear behind the
import cursor or change after import stop the sync as `incompatible`. Charts show points by observation time, with exact values in tables.
There is no local protocol rules engine; voting, expiry and historical BMM
eligibility are not inferred. Fees cover only previously observed matching bids.

Lists paginate with bounded limits and cursors tied to dataset, filters,
projection/build and branch revision. A 409 cursor reset requires restarting
pagination. Evidence links retain their dataset. History time filters default
to occurrence time; explicit block filters exclude unanchored observations.
Exports retain filters and report the 10,000-row truncation boundary.

Use a fresh destination database for the new contract-8 dataset and retain the
old paired binaries/databases. Rebuilds operate only within the same dataset;
they cannot turn old fork evidence into official-source guarantees.
