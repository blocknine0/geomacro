-- 0217: optional fail-closed review worklist; 0214/0216 are unchanged.
-- Only eligible, independently reviewed originals can reach the 0216 outbox.
CREATE TABLE IF NOT EXISTS risk_stream_commercial_issuer_jobs (
 source_gro_id TEXT PRIMARY KEY NOT NULL REFERENCES risk_stream_signed_gro(gro_id),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','LEASED','ISSUED','HOLD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 16),
 next_attempt_at TEXT NOT NULL,
 lease_expires_at TEXT,
 reviewed_gro_id TEXT REFERENCES risk_stream_signed_gro(gro_id),
 last_error_code TEXT,
 created_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_commercial_issuer_due
 ON risk_stream_commercial_issuer_jobs(state,next_attempt_at,created_at);
