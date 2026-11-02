-- Bounded per-target retry state for 195x3 daily country snapshots and 12 corridors.
-- No raw article content or customer credentials.
CREATE TABLE IF NOT EXISTS unified_risk_generation_attempts (
 day_utc TEXT NOT NULL CHECK(length(day_utc)=10),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
 entity_id TEXT NOT NULL,
 attempt_count INTEGER NOT NULL CHECK(attempt_count BETWEEN 1 AND 3),
 last_attempt_at TEXT NOT NULL,
 next_retry_at TEXT NOT NULL,
 PRIMARY KEY(day_utc,entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_unified_risk_generation_retry
 ON unified_risk_generation_attempts(day_utc,next_retry_at,attempt_count);
