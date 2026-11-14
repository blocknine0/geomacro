-- Reviewer-approved Standard licenses consumed by Predge's authenticated pull API.
-- This is deliberately separate from the push webhook outbox.
CREATE TABLE IF NOT EXISTS risk_stream_predge_pull_licenses (
 license_id TEXT PRIMARY KEY NOT NULL CHECK(length(license_id)=64),
 client_id TEXT NOT NULL CHECK(client_id='predge-paid-risk-gate-addendum-v2'),
 gro_id TEXT NOT NULL REFERENCES risk_stream_signed_gro(gro_id),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 license_envelope_json TEXT NOT NULL CHECK(json_valid(license_envelope_json)),
 release_approval_json TEXT NOT NULL CHECK(json_valid(release_approval_json)),
 license_payload_sha256 TEXT NOT NULL CHECK(length(license_payload_sha256)=64),
 release_receipt_sha256 TEXT NOT NULL CHECK(length(release_receipt_sha256)=64),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 entitlement_expires_at TEXT NOT NULL,
 CHECK(entitlement_expires_at<=expires_at),
 CHECK(entitlement_expires_at>created_at),
 UNIQUE(client_id,gro_id)
);
CREATE INDEX IF NOT EXISTS idx_predge_pull_license_lookup
 ON risk_stream_predge_pull_licenses(client_id,country_iso3,category,expires_at DESC);
