-- Staged for the NEXT protected D1 migration AFTER 0204/0211 physical proof.
-- Deliberately stored OUTSIDE workers/control-plane/migrations so the current
-- 0204/0211 allowlist and approved protected Stage B cannot be poisoned.
-- No legacy table scan, no backfill, no private payload / paid cache.
-- Install only under a separately approved 140k/day protected migration.
CREATE TABLE IF NOT EXISTS geomacro_storage_locator_v1 (
 logical_id TEXT PRIMARY KEY NOT NULL,
 provider TEXT NOT NULL,
 symbolic_locator TEXT NOT NULL,
 authority_role TEXT NOT NULL,
 verification_state TEXT NOT NULL DEFAULT 'EXPECTED_NOT_VERIFIED'
  CHECK(verification_state IN ('EXPECTED_NOT_VERIFIED','PROVIDER_VERIFIED')),
 provider_verified_at TEXT
);
-- Metadata-only, zero source reads. UNKNOWN endpoints are symbolic locators.
INSERT OR IGNORE INTO geomacro_storage_locator_v1
 (logical_id,provider,symbolic_locator,authority_role)
VALUES
 ('canonical_control_metadata','cloudflare_d1','DB','METADATA_AND_INDEX_AUTHORITY'),
 ('durable_original_evidence','backblaze_b2','B2_SPOOL_BUCKET','IMMUTABLE_ENCRYPTED_ORIGINAL_ARCHIVE'),
 ('private_archive_fallback','cloudflare_r2','P0B_PRIVATE_FALLBACK_R2','ENCRYPTED_PENDING_B2_ONLY'),
 ('public_news_snapshot','cloudflare_r2','PUBLIC_NEWS_R2','DISPOSABLE_PUBLIC_DERIVED'),
 ('risk_gate_seven_day_buffer','supabase_postgres','RISK_GATE_SUPABASE_URL','SUPPLEMENTARY_PRIVATE_ROLLUP'),
 ('commerce_idempotency','cloudflare_durable_object','LEDGER_BINDING_NOT_VERIFIED','FINANCIAL_LEDGER_SEPARATE_AUTHORITY'),
 ('ingestion_spool_queue','cloudflare_queues','INGEST_QUEUE','ASYNCHRONOUS_TRANSPORT_NOT_DATABASE'),
 ('source_poll_queue','cloudflare_queues','SOURCE_POLL_QUEUE','ASYNCHRONOUS_TRANSPORT_NOT_DATABASE');
-- Producer-maintained point-read summaries, NEVER a ledger or evidence authority.
CREATE TABLE IF NOT EXISTS geomacro_operational_read_model_v1 (
 model_key TEXT PRIMARY KEY NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('PUBLIC_DERIVED','INTERNAL_OBSERVABILITY')),
 source_revision_sha256 TEXT NOT NULL CHECK(length(source_revision_sha256)=64),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)
  AND length(payload_json) BETWEEN 2 AND 100000),
 updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>=updated_at_ms)
);
-- Read model is intentionally empty on install: no synthetic historical truth.
-- Publisher writes only after canonical-source revision/receipt verification.
