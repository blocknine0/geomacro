-- P0-B: one encrypted gzip B2 object per bounded cross-source microbatch.
-- Existing single-candidate spool rows remain valid during rolling deployment.
CREATE TABLE IF NOT EXISTS ingestion_spool_bundles (
 id TEXT PRIMARY KEY CHECK(length(id)=36),
 bundle_sha256 TEXT NOT NULL UNIQUE CHECK(length(bundle_sha256)=64),
 b2_spool_uri TEXT NOT NULL UNIQUE CHECK(substr(b2_spool_uri,1,5)='b2://'),
 b2_byte_size INTEGER NOT NULL CHECK(b2_byte_size>0 AND b2_byte_size<=1048576),
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 100),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN
 ('PENDING','PROCESSING','RETRY','D1_COMMITTED','DEAD_LETTER','QUARANTINED')),
 retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count>=0),
 max_retries INTEGER NOT NULL DEFAULT 3 CHECK(max_retries BETWEEN 1 AND 10),
 locked_until TEXT,
 last_error_code TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 d1_committed_at TEXT,
 acked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_p0b_bundle_pending
 ON ingestion_spool_bundles(state,locked_until,created_at);
CREATE INDEX IF NOT EXISTS idx_p0b_bundle_committed
 ON ingestion_spool_bundles(d1_committed_at);
ALTER TABLE ingestion_spool_queue ADD COLUMN bundle_offset INTEGER CHECK(bundle_offset IS NULL OR bundle_offset>=0);
ALTER TABLE ingestion_spool_queue ADD COLUMN bundle_length INTEGER CHECK(bundle_length IS NULL OR bundle_length>0);
CREATE INDEX IF NOT EXISTS idx_p0b_bundle_items
 ON ingestion_spool_queue(b2_spool_uri,bundle_offset);
