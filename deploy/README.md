# Deployment topology

New installations use the Compose project `drivechain-observatory` and image
`drivechain-observatory:local`. Existing installations must keep their original
Compose project name with `-p <existing-project>` or `COMPOSE_PROJECT_NAME` to
reuse their containers and database volumes. For the tunnel helpers, set
`PULSE_COMPOSE_PROJECT=<existing-project>`. Database names, roles, binaries and
`PULSE_*` variables retain their existing names; the brand change requires no
database migration.

Drivechain - Observatory and bip300-monitor run on separate VMs connected through a
provider private network or a WireGuard tunnel.

## Allowed flows

1. The Observatory sync container may connect to the monitor PostgreSQL private
   address on TCP 5432.
2. Caddy on the Observatory VM accepts public TCP 80/443 and UDP 443.
3. The API and PostgreSQL Observatory containers do not have routes to the monitor
   VM.
4. PostgreSQL on both VMs has no public listener.
5. Vercel and browsers call the public Caddy endpoint over HTTPS. Browsers keep
   one direct SSE connection to the same endpoint.

Docker-published ports must be filtered in the provider firewall and in the
host DOCKER-USER/nftables path. UFW alone is not accepted as proof that a
Docker-published database port is private.

## Monitor role

Provision a dedicated pulse_sync_reader role with CONNECT and USAGE plus SELECT
only on:

- schema_version
- dataset_manifest
- extractor_run
- event
- event_observation
- tip_observation
- snapshot_group
- sidechain_instance
- current_sidechain_instance
- history_coverage
- history_coverage_revision
- extractor_status
- extractor_worker_status
- observation_failure

Set default_transaction_read_only, a connection limit of two, statement
timeout, idle transaction timeout, and SCRAM authentication. Permit its network
connection only from the Observatory VM private address.


## Betanet source configuration and upgrade

The source must provide a current running enforcer with the required
capabilities: reviewed contract v7 with SQL schema 8 and a fresh v7 dataset.
Use the local fixtures while the operator promotes the monitor separately.
See [the compatibility review](../SOURCE_CONTRACT.md) for the v7 boundary.

Set `PULSE_DATASET_ID` to the source manifest UUID. Defaults for network identity
are `betanet`, activation height `967680`, hash
`00000000000000030101ba5cfea54b22becc79f95dc6040beb76e01dd9d04042`.
A mismatching source, incompatible contract or loss of continuity stops import
with `incompatible`; existing local evidence remains available. Dataset changes
require an explicit local reconciliation; the API never selects the newest row.

Observatory rejects every pre-v7 dataset, including those without sidechain rows.
For a replacement monitor dataset, provision a fresh Observatory destination database
and explicitly configure its UUID; retain the previous destination/backup for
historical evidence. This release does not automate dataset replacement.
The reconstruction command below changes a projection generation within one
dataset; it does not migrate identities between datasets.

Apply all Observatory migrations, including 0006, with the admin role on the fresh
destination before starting sync/API. Allow catch-up to
finish before treating freshness as established. Use an Observatory database backup
before upgrades; restore it to a separate database for rollback.

`PULSE_STALE_AFTER_SECONDS` defaults to 30. Worker freshness is based on the last
successful poll, not block cadence. BMM shows the latest occurrence from the
current run. A new run does not inherit the previous run’s current auction.
For v7, the latest occurrence must also have a stable snapshot group in the
same run with both tips matching its anchor and equal non-null chain revisions. Missing or contradictory metadata
produces `inconsistent_snapshot`, preserving the sampled bids and evidence.
Monetary defaults are `PULSE_NATIVE_SYMBOL=sats`, `PULSE_NATIVE_DECIMALS=0`.
`bid_sats` always remains the original integer regardless of presentation config.

The operator must additionally grant `SELECT` on `extractor_worker_status` and `observation_failure` to
the existing monitor reader. For an already provisioned `pulse_sync_reader`:

    GRANT SELECT ON public.extractor_worker_status, public.observation_failure TO pulse_sync_reader;

This document is a manual provisioning requirement. Observatory does not apply grants
or migrations to the monitor. `start-monitor-tunnel.sh` now requires the existing
`PULSE_MONITOR_READER_PASSWORD` (URL-safe characters), `PULSE_DATASET_ID`,
`PULSE_MONITOR_COMPOSE_PROJECT` (the operator’s monitor project name) and SSH
configuration. It reads container metadata and starts only local Observatory services;
it no longer creates a remote role or rotates its password.

The SSE cursor is `dataset_uuid:projection_generation:revision`. Clients should
re-fetch their view and create a fresh EventSource on `reset_required`. Retention
pruning is a later operational step; when introduced, it must move the local
`ops.active_dataset.replay_floor` in the same transaction as pruning. Never
advance a generation without rebuilding/validating its projections.

## Projection maintenance within a fresh v7 dataset

This operation only changes the local Observatory database. Keep the monitor running normally. Stop the
Observatory sync/API processes for the maintenance window; the rebuild is resumable,
but its duration depends on evidence volume and hardware. For the Compose stack:

    docker compose --env-file .env -f deploy/compose.yaml stop sync api

Back up the Observatory database using the admin role before changing its projection schema.
For a local development installation with the new binaries built:

    PULSE_DATABASE_URL="$PULSE_ADMIN_DATABASE_URL" target/debug/pulse-api migrate-only
    PULSE_DATABASE_URL="$PULSE_SYNC_DATABASE_URL" target/debug/pulse-sync rebuild --dataset-id "$PULSE_DATASET_ID"

The URLs above are operator-supplied local destination credentials. The rebuild
does not require `MONITOR_DATABASE_URL` or any SSH connection. The migration
retains prior evidence and generations. Custom role installations need the same
local permissions as the supplied roles; the source remains read-only.

The command pins a fully imported source cut, scans local evidence in bounded
pages, records branch revisions and validates the new generation before its
atomic activation. If interrupted, rerun the same command to resume staging.
If the pinned cut is not fully imported, finish ordinary synchronization first,
then stop Observatory and retry. Unresolved errors required by the selected branch
and contradictory valid headers prevent promotion and return a nonzero exit
code. Redundant malformed facts remain diagnostics. The old active generation
and raw evidence remain intact.
Do not delete bad evidence to force success: correct the supported decoder or
reconcile the source identity as appropriate. After a decoder fix, use
`pulse-sync rebuild --fresh --dataset-id "$PULSE_DATASET_ID"` to scan the evidence
again in a new staging generation; failed staging generations remain preserved. Source grants and deployments remain manual operations.

After successful promotion, restart the updated Observatory sync/API binaries. In a
Compose installation with the updated Observatory images already available:

    docker compose --env-file .env -f deploy/compose.yaml up -d sync api

Check `/api/v1/meta` for projection version 6 and the new generation, `/status`
for coherent branch progress, and `/coverage` for per-scope verification.
A legitimate coverage gap can remain provisional after a successful rebuild.
An ambiguous selected branch must be reconciled before promotion. SSE and paginated clients must discard
old generation cursors. For binary/schema rollback, restore the pre-upgrade
backup to a separate local database and point the compatible previous Observatory
binaries at it; retaining old projection rows alone is not a schema downgrade.

### Projection version 6

For an existing **v7 dataset**, apply migrations with `pulse-api migrate-only`
using the migration role, stop Observatory sync, and run
`pulse-sync rebuild --dataset-id <uuid>` with Observatory destination credentials.
The command needs no monitor connection. It retains the old generation until
validation and atomic promotion, and can resume interrupted version 6 staging
work. Use `--fresh` to select a new cut after repairing evidence from an earlier
failed attempt. Restart sync after promotion. Older projection staging checkpoints are
not reused. This procedure does not change the monitor deployment or migrate an
older source dataset.

## PostgreSQL18 data directory

The v7 Compose configuration explicitly sets `PGDATA` to
`/var/lib/postgresql/data/pgdata`, inside the named `pulse_postgres` mount.
PostgreSQL18 otherwise defaults to `/var/lib/postgresql/18/docker`, outside the
older mount path. New v7 destinations must start with a fresh volume. For an
existing installation, inspect `SHOW data_directory` and container mounts,
back up and restore into the new destination; do not silently reuse or relocate
an old volume with this setting. Keep its paired old Compose configuration for
archive access and rollback.
