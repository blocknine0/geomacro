-- Phase 2H: internal original-source observations only. Canonical D1 holds
-- immutable first-seen metadata and analysis while governed B2 stores gzip
-- restoration copies. No PREDGE, signing, entitlements, payment or history.
CREATE TABLE IF NOT EXISTS phase2h_private_raw_news (
 record_id TEXT PRIMARY KEY CHECK(length(record_id)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 original_published_at TEXT NOT NULL,
 first_ingested_at TEXT NOT NULL,
 raw_sha256 TEXT NOT NULL CHECK(length(raw_sha256)=64),
 raw_json TEXT NOT NULL CHECK(length(raw_json) BETWEEN 300 AND 12000),
 b2_object_sha256 TEXT DEFAULT NULL CHECK(b2_object_sha256 IS NULL OR length(b2_object_sha256)=64),
 b2_archived_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_phase2h_unarchived
 ON phase2h_private_raw_news(b2_object_sha256,first_ingested_at,record_id);
CREATE INDEX IF NOT EXISTS idx_phase2h_native_category
 ON phase2h_private_raw_news(category,original_published_at DESC);
