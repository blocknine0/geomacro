-- P0B: R2 ciphertext pending outbox when B2 S3 is unavailable.
-- No raw titles, article URLs, or original payload in D1.
CREATE TABLE IF NOT EXISTS p0b_private_r2_fallback (
 batch_id TEXT PRIMARY KEY CHECK(length(batch_id)=64),
 object_key TEXT NOT NULL UNIQUE,
 cipher_sha256 TEXT NOT NULL CHECK(length(cipher_sha256)=64),
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 100),
 state TEXT NOT NULL CHECK(state IN ('PENDING_B2','B2_VERIFIED')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 created_at TEXT NOT NULL,
 next_retry_at TEXT NOT NULL,
 b2_verified_at TEXT,
 last_error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_p0b_r2_pending
 ON p0b_private_r2_fallback(state,next_retry_at,created_at);
