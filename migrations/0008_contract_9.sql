-- Contract 9 / monitor schema 10: a fresh projection generation.
ALTER TABLE ops.active_dataset ALTER COLUMN projection_version SET DEFAULT 8;
ALTER TABLE ops.active_dataset ALTER COLUMN projection_generation SET DEFAULT 8;
ALTER TABLE ops.chain_jobs ALTER COLUMN implementation_version SET DEFAULT 8;
