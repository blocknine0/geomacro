-- Additive operational metadata only. No customer, PREDGE or paid product mutation.
CREATE TABLE IF NOT EXISTS corridor_pipeline_watchdog(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 last_scan_at TEXT NOT NULL,
 last_source_at TEXT,
 last_structured_at TEXT,
 source_no_structured_streak INTEGER NOT NULL CHECK(source_no_structured_streak>=0),
 no_source_streak INTEGER NOT NULL CHECK(no_source_streak>=0),
 last_alert_at TEXT,
 state TEXT NOT NULL CHECK(state IN ('HEALTHY','SOURCE_IDLE','STRUCTURED_LAG','SOURCE_STALE','PENDING'))
);
CREATE TABLE IF NOT EXISTS corridor_pipeline_alerts(
 alert_id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('STRUCTURED_LAG','SOURCE_STALE')),
 created_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_corridor_pipeline_alerts_pending ON corridor_pipeline_alerts(delivered_at,created_at);
