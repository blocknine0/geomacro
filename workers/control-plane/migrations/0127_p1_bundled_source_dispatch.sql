-- P1 physical D1 row-write reduction. Queue messages carry source IDs only.
-- The old source_registry lease remains readable during the 2-minute
-- V1/V2 mixed-deployment window; no authority, event truth or paid gate changes.
CREATE TABLE IF NOT EXISTS p1_source_poll_bundles (
 bundle_id TEXT PRIMARY KEY CHECK(length(bundle_id)=36),
 source_ids_json TEXT NOT NULL CHECK(json_valid(source_ids_json) AND
   json_type(source_ids_json)='array' AND
   json_array_length(source_ids_json) BETWEEN 1 AND 108),
 leased_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at>leased_at)
);
CREATE INDEX IF NOT EXISTS idx_p1_source_poll_bundles_expiry
 ON p1_source_poll_bundles(expires_at);
-- Singleton atomic mutex serializes competing one-minute dispatch invocations,
-- avoiding duplicate queue batches without one lease UPDATE per source.
CREATE TABLE IF NOT EXISTS p1_source_poll_dispatch_mutex (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 lease_id TEXT,
 lease_until TEXT NOT NULL
);
INSERT OR IGNORE INTO p1_source_poll_dispatch_mutex
 (singleton,lease_id,lease_until) VALUES
 (1,NULL,'1970-01-01T00:00:00.000Z');
