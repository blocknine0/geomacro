-- Website-only minimum 60-minute GRI release: bounded retention of
-- ALREADY B2-readback-verified original public derived GRI snapshots.
-- No raw original article/source provider data may be projected downstream.
-- Canonical x402/current GRI serving remains independent.
CREATE TABLE IF NOT EXISTS website_verified_gri_snapshot_history (
  source_as_of TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  b2_sha256 TEXT NOT NULL CHECK(length(b2_sha256)=64),
  original_generated_at TEXT NOT NULL,
  original_verified_at TEXT NOT NULL,
  proof_schema TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_as_of,payload_sha256)
);
CREATE INDEX IF NOT EXISTS website_verified_gri_history_newest
  ON website_verified_gri_snapshot_history(source_as_of DESC);
