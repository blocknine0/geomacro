-- Phase 2H live raw-news TTL: provider-governed hourly retention only.
-- The existing idx_phase2h_unarchived begins with b2_object_sha256 and
-- cannot efficiently bound a first_ingested_at-only expiry scan.
-- This separate composite index supports index-ordered <=60h deletion
-- with no PREDGE, historical, payments or unrelated table changes.
CREATE INDEX IF NOT EXISTS idx_phase2h_retention_first_ingested
 ON phase2h_private_raw_news(first_ingested_at,record_id);
