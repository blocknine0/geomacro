-- Isolated corridor official reference observations. These are source
-- statistics/batch indices, not verified events or commercial risk objects.
-- TTL 72h by LAST observation, not statistical reporting period.
CREATE TABLE IF NOT EXISTS corridor_official_reference_context (
 reference_id TEXT PRIMARY KEY CHECK(length(reference_id)=64),
 source_id TEXT NOT NULL CHECK(length(source_id) BETWEEN 3 AND 36),
 metric_id TEXT NOT NULL CHECK(length(metric_id) BETWEEN 3 AND 70),
 observation_period TEXT NOT NULL CHECK(length(observation_period) BETWEEN 4 AND 32),
 numeric_value REAL,
 corridor_ids_json TEXT NOT NULL CHECK(length(corridor_ids_json) BETWEEN 2 AND 380),
 first_seen_at TEXT NOT NULL,
 last_observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corridor_official_reference_ttl
 ON corridor_official_reference_context(last_observed_at,reference_id);
CREATE INDEX IF NOT EXISTS idx_corridor_official_reference_source
 ON corridor_official_reference_context(source_id,last_observed_at DESC);
