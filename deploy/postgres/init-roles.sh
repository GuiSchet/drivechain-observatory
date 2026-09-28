#!/bin/sh
set -eu

psql \
  --set=ON_ERROR_STOP=1 \
  --set=sync_password="$PULSE_SYNC_DB_PASSWORD" \
  --set=api_password="$PULSE_API_DB_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE pulse_sync
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE pulse_api
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

ALTER ROLE pulse_sync PASSWORD :'sync_password';
ALTER ROLE pulse_api PASSWORD :'api_password';
ALTER ROLE pulse_sync SET statement_timeout = '60s';
ALTER ROLE pulse_sync SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE pulse_api SET default_transaction_read_only = on;
ALTER ROLE pulse_api SET statement_timeout = '15s';
ALTER ROLE pulse_api SET idle_in_transaction_session_timeout = '15s';

CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS projection;
CREATE SCHEMA IF NOT EXISTS ops;

GRANT CONNECT ON DATABASE drivechain_pulse TO pulse_sync, pulse_api;
GRANT USAGE ON SCHEMA ingest, projection, ops TO pulse_sync, pulse_api;

ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA ingest
    GRANT SELECT, INSERT, UPDATE ON TABLES TO pulse_sync;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA projection
    GRANT SELECT, INSERT, UPDATE ON TABLES TO pulse_sync;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA ops
    GRANT SELECT, INSERT, UPDATE ON TABLES TO pulse_sync;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA ingest
    GRANT SELECT ON TABLES TO pulse_api;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA projection
    GRANT SELECT ON TABLES TO pulse_api;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA ops
    GRANT SELECT ON TABLES TO pulse_api;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_admin IN SCHEMA ops
    GRANT USAGE, SELECT ON SEQUENCES TO pulse_sync;
SQL
