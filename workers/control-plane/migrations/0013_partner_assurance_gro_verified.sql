-- Isolated verified-hot storage for partner-assurance GROs.
-- These rows are never used as canonical customer country serving state.
-- B2 remains cold archive authority; D1 provides exact same-write readback
-- verification so a B2 download-cap event cannot block local assurance.
CREATE TABLE IF NOT EXISTS partner_assurance_gro_verified (
  partner TEXT NOT NULL,
  object_id TEXT NOT NULL,
  country_iso3 TEXT NOT NULL CHECK (length(country_iso3) = 3),
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
  updated_at TEXT NOT NULL,
  PRIMARY KEY (partner, object_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_assurance_gro_country
  ON partner_assurance_gro_verified(partner, country_iso3, generated_at DESC);

UPDATE schema_meta
SET version = 4, updated_at = '2026-10-08T16:50:00.000Z'
WHERE name = 'control-plane' AND version < 4;
