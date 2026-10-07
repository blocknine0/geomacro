-- Bounded, public product projections copied only after the producer has
-- completed a full B2 GET/hash/restore verification. B2 remains durable truth.
CREATE TABLE IF NOT EXISTS public_b2_hot_snapshot (
  product TEXT PRIMARY KEY CHECK (product IN ('intelligence', 'global-risk', 'risk-indices')),
  schema_name TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_as_of TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  b2_object_key TEXT NOT NULL,
  b2_sha256 TEXT NOT NULL CHECK (length(b2_sha256) = 64),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  proof_schema TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

UPDATE schema_meta
SET version = 2, updated_at = '2026-10-07T00:00:00.000Z'
WHERE name = 'control-plane' AND version < 2;
