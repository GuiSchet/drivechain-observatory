-- /coverage lists the latest mainchain gaps (transition action 3). They are a few dozen among thousands of
-- transitions, so a filter on the kind index read every transition's JSON to find them.
CREATE INDEX IF NOT EXISTS protocol_transition_gaps ON projection.protocol_facts(dataset_id,generation,event_id DESC)
    WHERE kind='mainchain_transition' AND error IS NULL AND data->>'action'='3';
