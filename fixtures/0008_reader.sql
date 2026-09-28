CREATE ROLE monitor_reader LOGIN PASSWORD 'monitor_reader_dev'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
ALTER ROLE monitor_reader SET default_transaction_read_only = on;
ALTER ROLE monitor_reader SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE bip300_monitor TO monitor_reader;
GRANT USAGE ON SCHEMA public TO monitor_reader;
GRANT SELECT ON schema_version,dataset_manifest,extractor_run,event,event_observation,
    tip_observation,snapshot_group,sidechain_instance,current_sidechain_instance,
    history_coverage,history_coverage_revision,extractor_status,extractor_worker_status TO monitor_reader;
