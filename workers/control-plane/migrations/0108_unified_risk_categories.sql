-- Signed-GRO-grounded country/corridor risk observations, zero invented risks.
-- No external raw article body, publisher quote or secret stored.
CREATE TABLE IF NOT EXISTS risk_observations (
 id TEXT PRIMARY KEY CHECK(length(id)=64),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
 entity_id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 day_utc TEXT NOT NULL,
 risk_score REAL CHECK(risk_score IS NULL OR risk_score BETWEEN 0 AND 1),
 confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 evidence_payload TEXT NOT NULL CHECK(length(evidence_payload)<=24000),
 source_count INTEGER NOT NULL DEFAULT 0 CHECK(source_count BETWEEN 0 AND 40),
 is_authoritative INTEGER NOT NULL DEFAULT 0 CHECK(is_authoritative IN (0,1)),
 evidence_status TEXT NOT NULL CHECK(evidence_status IN ('VERIFIED_SIGNED_GRO','OBSERVED_UNVERIFIED','NO_VERIFIED_SIGNAL')),
 gro_object_id TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(entity_type,entity_id,category,day_utc)
);
CREATE INDEX IF NOT EXISTS idx_risk_lookup
 ON risk_observations(entity_type,entity_id,category,day_utc DESC);
CREATE INDEX IF NOT EXISTS idx_risk_obs_retention
 ON risk_observations(created_at);
CREATE TABLE IF NOT EXISTS unified_risk_snapshots (
 entity_type TEXT NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
 entity_id TEXT NOT NULL,
 day_utc TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 audit_proof_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 generated_at TEXT NOT NULL,
 supabase_synced_at TEXT,
 PRIMARY KEY(entity_type,entity_id,day_utc)
);
CREATE INDEX IF NOT EXISTS idx_unified_pending_sync
 ON unified_risk_snapshots(generated_at) WHERE supabase_synced_at IS NULL;
