-- Atomic private queue delivery receipt: never a risk score or signed proof.
-- Apply via protected D1 migration procedure before enabling queue traffic.
CREATE TABLE IF NOT EXISTS derived_discovery_ack_receipts (
 digest TEXT PRIMARY KEY CHECK(length(digest)=64),
 lane TEXT NOT NULL CHECK(lane='website_intelligence'),
 page_sha256 TEXT NOT NULL CHECK(length(page_sha256)=64),
 admitted INTEGER NOT NULL CHECK(admitted BETWEEN 1 AND 100),
 committed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_derived_discovery_ack_receipts_clock
 ON derived_discovery_ack_receipts(committed_at);
