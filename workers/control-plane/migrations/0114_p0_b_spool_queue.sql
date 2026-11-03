-- P0-B: durable Backblaze B2 spool journal, visibility locks and replay ledger.
-- The source_registry table comes from migration 0113. No paid/public projections.
CREATE TABLE IF NOT EXISTS ingestion_spool_queue (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 candidate_sha256 TEXT NOT NULL UNIQUE CHECK(length(candidate_sha256)=64),
 source_id TEXT NOT NULL REFERENCES source_registry(source_id),
 b2_spool_uri TEXT NOT NULL CHECK(substr(b2_spool_uri,1,5)='b2://' AND length(b2_spool_uri)<1024),
 b2_byte_size INTEGER NOT NULL CHECK(b2_byte_size>0 AND b2_byte_size<=1048576),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN (
  'PENDING','PROCESSING','ACKNOWLEDGED','D1_COMMITTED','RETRY','QUARANTINED','DEAD_LETTER')),
 retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count>=0),
 max_retries INTEGER NOT NULL DEFAULT 3 CHECK(max_retries BETWEEN 1 AND 10),
 last_error_code TEXT CHECK(last_error_code IS NULL OR length(last_error_code)<=80),
 last_error_message TEXT CHECK(last_error_message IS NULL OR length(last_error_message)<=256),
 spooled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 locked_until TEXT,
 d1_committed_at TEXT,
 acked_at TEXT,
 CHECK(d1_committed_at IS NULL OR state IN ('D1_COMMITTED','ACKNOWLEDGED')),
 CHECK(acked_at IS NULL OR state IN ('D1_COMMITTED','ACKNOWLEDGED'))
);
CREATE INDEX IF NOT EXISTS idx_spool_state_locked
 ON ingestion_spool_queue(state,locked_until,spooled_at ASC);
CREATE INDEX IF NOT EXISTS idx_spool_candidate_sha
 ON ingestion_spool_queue(candidate_sha256);
CREATE INDEX IF NOT EXISTS idx_spool_source_id
 ON ingestion_spool_queue(source_id,state);
CREATE INDEX IF NOT EXISTS idx_spool_committed_day
 ON ingestion_spool_queue(d1_committed_at);

-- An ADMITTED row is a *private metadata pointer* to an encrypted, readback-
-- verified B2 payload. It is not evidence of any fact, rights or paid eligibility.
CREATE TABLE IF NOT EXISTS normalized_articles (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 candidate_sha256 TEXT NOT NULL UNIQUE CHECK(length(candidate_sha256)=64),
 source_id TEXT NOT NULL REFERENCES source_registry(source_id),
 b2_archive_uri TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ADMITTED' CHECK(status='ADMITTED'),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_normalized_articles_source
 ON normalized_articles(source_id,created_at DESC);
