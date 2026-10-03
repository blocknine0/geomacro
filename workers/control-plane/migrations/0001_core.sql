PRAGMA foreign_keys = ON;

-- Geomacro permanent near-zero-cost control plane.
-- Durable intelligence/evidence/GRO payloads remain B2-authoritative.
-- Commerce replay/idempotency remains in the existing Durable Object ledger.

CREATE TABLE IF NOT EXISTS schema_meta (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_meta (name, version, updated_at)
VALUES ('control-plane', 1, '2026-10-03T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS control_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_state (
  source_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  certification_status TEXT NOT NULL,
  rights_status TEXT NOT NULL,
  endpoint_status TEXT NOT NULL,
  schema_status TEXT NOT NULL,
  freshness_status TEXT NOT NULL,
  provenance_status TEXT NOT NULL,
  independence_status TEXT NOT NULL,
  runtime_status TEXT NOT NULL,
  fallback_status TEXT NOT NULL,
  last_checked_at TEXT,
  next_check_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_state_certification
  ON source_state (certification_status, enabled);
CREATE INDEX IF NOT EXISTS idx_source_state_next_check
  ON source_state (next_check_at);

CREATE TABLE IF NOT EXISTS country_domain_state (
  country_code TEXT NOT NULL,
  domain TEXT NOT NULL,
  readiness_status TEXT NOT NULL,
  certified_source_count INTEGER NOT NULL DEFAULT 0,
  review_source_count INTEGER NOT NULL DEFAULT 0,
  unavailable_source_count INTEGER NOT NULL DEFAULT 0,
  last_verified_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (country_code, domain)
);

CREATE INDEX IF NOT EXISTS idx_country_domain_readiness
  ON country_domain_state (readiness_status, domain);

CREATE TABLE IF NOT EXISTS risk_object_index (
  object_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  commercial_eligibility_status TEXT NOT NULL,
  signing_key_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  record_sha256 TEXT NOT NULL,
  archive_key TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_object_subject_freshness
  ON risk_object_index (subject_type, subject_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_object_commercial_freshness
  ON risk_object_index (commercial_eligibility_status, verification_status, expires_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_checkpoint (
  pipeline TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  cursor TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (pipeline, scope)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_checkpoint_status
  ON pipeline_checkpoint (status, updated_at);

CREATE TABLE IF NOT EXISTS migration_cursor (
  dataset TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  cursor TEXT,
  rows_migrated INTEGER NOT NULL DEFAULT 0,
  source_checksum TEXT,
  target_checksum TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  updated_at TEXT NOT NULL
);
