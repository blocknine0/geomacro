-- P0B private transactional outbox. Hash-only metadata enters canonical D1
-- BEFORE the S3 PUT; no publisher payload, title, URL, license or customer data.
-- A B2-verified receipt and journal rows change PENDING_ARCHIVE -> ARCHIVED
-- in the SAME db.batch transaction. Crash/replay is idempotent by batch hash.
CREATE TABLE IF NOT EXISTS p0b_archive_outbox (
 batch_id TEXT PRIMARY KEY CHECK(length(batch_id)=64),
 candidate_fingerprint TEXT NOT NULL CHECK(length(candidate_fingerprint)=64),
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 100),
 state TEXT NOT NULL DEFAULT 'PENDING_ARCHIVE'
  CHECK(state IN ('PENDING_ARCHIVE','REPLAYING','ARCHIVED')),
 b2_uri TEXT,
 b2_etag TEXT,
 sealed_payload TEXT,
 payload_sha256 TEXT,
 lease_id TEXT,
 locked_until TEXT,
 next_retry_at TEXT,
 b2_object_sha256 TEXT CHECK(b2_object_sha256 IS NULL OR length(b2_object_sha256)=64),
 first_seen_at TEXT NOT NULL,
 archived_at TEXT,
 last_error_code TEXT,
 CHECK((state='ARCHIVED' AND b2_uri IS NOT NULL AND
        b2_object_sha256 IS NOT NULL AND archived_at IS NOT NULL AND
        sealed_payload IS NULL)
    OR (state IN ('PENDING_ARCHIVE','REPLAYING') AND
        b2_uri IS NULL AND b2_object_sha256 IS NULL AND
        archived_at IS NULL AND sealed_payload IS NOT NULL AND
        payload_sha256 IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_p0b_archive_outbox_pending
 ON p0b_archive_outbox(state,next_retry_at,first_seen_at,batch_id);
CREATE INDEX IF NOT EXISTS idx_p0b_archive_outbox_committed
 ON p0b_archive_outbox(archived_at);
