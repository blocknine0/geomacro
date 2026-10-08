-- Verified hot signed country GROs for commercial/Federico serving.
-- These are derived signed artifacts, never raw evidence. B2 remains the cold
-- durable archive, but archive GET/readback is intentionally not a synchronous
-- serving prerequisite. Promotion requires an acknowledged B2 write plus local
-- signature/commercial checks and D1 readback/hash verification.
CREATE TABLE IF NOT EXISTS country_gro_verified_hot (
  country_iso3 TEXT PRIMARY KEY CHECK (length(country_iso3) = 3),
  object_id TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  signing_key_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  record_sha256 TEXT NOT NULL CHECK (length(record_sha256) = 64),
  archive_key TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),
  archive_write_acknowledged INTEGER NOT NULL CHECK (archive_write_acknowledged IN (0,1)),
  archive_readback_verified INTEGER NOT NULL DEFAULT 0 CHECK (archive_readback_verified IN (0,1)),
  object_json TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_country_gro_verified_hot_expires
  ON country_gro_verified_hot(expires_at);

UPDATE schema_meta
SET version = 3, updated_at = '2026-10-08T11:30:00.000Z'
WHERE name = 'control-plane' AND version < 3;
