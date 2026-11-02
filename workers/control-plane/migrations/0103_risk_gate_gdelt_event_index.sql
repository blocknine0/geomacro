-- Bound verified GDELT ZIP *index candidates* for risk-gate discovery.
-- NONE are independently verified real-world events or paid objects.
CREATE TABLE IF NOT EXISTS risk_gate_gdelt_event_index (
 event_ref_id TEXT PRIMARY KEY CHECK(length(event_ref_id)=64),
 gdelt_event_id TEXT NOT NULL CHECK(length(gdelt_event_id) BETWEEN 1 AND 20),
 cameo_code TEXT NOT NULL CHECK(length(cameo_code) BETWEEN 2 AND 4),
 cameo_root TEXT NOT NULL,
 gdelt_index_at TEXT NOT NULL,
 batch_at TEXT NOT NULL,
 action_geo_fips TEXT,
 corridor_hints_json TEXT NOT NULL,
 source_url_sha256 TEXT NOT NULL CHECK(length(source_url_sha256)=64),
 archive_sha256 TEXT NOT NULL CHECK(length(archive_sha256)=64),
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_gdelt_region_at
 ON risk_gate_gdelt_event_index(action_geo_fips,gdelt_index_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_gate_gdelt_latest
 ON risk_gate_gdelt_event_index(gdelt_index_at DESC);
