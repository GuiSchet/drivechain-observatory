CREATE TABLE IF NOT EXISTS schema_version (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_version (version)
VALUES (1), (2), (3), (4), (5), (6)
ON CONFLICT (version) DO NOTHING;

