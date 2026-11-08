-- Staged / opt-in only. 0213 is NOT part of the protected 0204-0211
-- production repair queue. Requires a dedicated private R2 binding and key,
-- independent quota-admission, backup, shadow migration, reader parity and
-- source pipeline readiness before ANY canonical cutover.
-- Legacy phase2h_private_raw_news remains unmodified for un-migrated rows.
CREATE TABLE IF NOT EXISTS phase2h_raw_object_refs_v1 (
 record_id TEXT PRIMARY KEY NOT NULL CHECK(length(record_id)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 original_published_at TEXT NOT NULL,
 first_ingested_at TEXT NOT NULL,
 raw_sha256 TEXT NOT NULL CHECK(length(raw_sha256)=64),
 object_sha256 TEXT NOT NULL CHECK(length(object_sha256)=64),
 object_key TEXT NOT NULL CHECK(length(object_key) BETWEEN 45 AND 180),
 bundle_bytes INTEGER NOT NULL CHECK(bundle_bytes BETWEEN 300 AND 600000),
 record_sha256 TEXT NOT NULL CHECK(length(record_sha256)=64),
 record_bytes INTEGER NOT NULL CHECK(record_bytes BETWEEN 300 AND 12000),
 bundle_index INTEGER NOT NULL CHECK(bundle_index BETWEEN 0 AND 49),
 signed_at TEXT NOT NULL,
 pointer_hmac_sha256 TEXT NOT NULL CHECK(length(pointer_hmac_sha256)=64),
 risk_country_iso3 TEXT CHECK(risk_country_iso3 IS NULL OR length(risk_country_iso3)=3),
 storage_backend TEXT NOT NULL DEFAULT 'private_r2'
   CHECK(storage_backend='private_r2')
);
CREATE INDEX IF NOT EXISTS idx_phase2h_ref_object_key_v1
 ON phase2h_raw_object_refs_v1(object_key,bundle_index);
CREATE INDEX IF NOT EXISTS idx_phase2h_ref_country_category_clock_v1
 ON phase2h_raw_object_refs_v1(risk_country_iso3,category,original_published_at DESC,record_id DESC);
CREATE INDEX IF NOT EXISTS idx_phase2h_ref_ingest_clock_v1
 ON phase2h_raw_object_refs_v1(first_ingested_at,record_id);
-- Raw article/title/analysis JSON MUST NOT be persisted in this table.
-- No trigger advances the legacy B2 ARCHIVED counters merely because R2
-- readback passed: staging is not independently proven B2 archival.
