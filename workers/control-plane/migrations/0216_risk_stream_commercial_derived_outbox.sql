-- GeoMacro 0216: ADDITIVE licensed-derived customer outbox. Do not alter 0214.
-- Installation is separately protected by Stage2 / current-main release hold.
-- No producer can insert a commercial job unless the independent review
-- and GeoMacro licence verifier have first passed.
CREATE TABLE IF NOT EXISTS risk_stream_commercial_subscriptions (
 client_id TEXT PRIMARY KEY NOT NULL CHECK(length(client_id) BETWEEN 8 AND 120),
 endpoint_url TEXT NOT NULL CHECK(length(endpoint_url) BETWEEN 16 AND 2048),
 approved_host TEXT NOT NULL CHECK(length(approved_host) BETWEEN 4 AND 253),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 entitlement_expires_at TEXT NOT NULL,
 approved_at TEXT NOT NULL,
 release_receipt_sha256 TEXT NOT NULL CHECK(length(release_receipt_sha256)=64)
);
CREATE TABLE IF NOT EXISTS risk_stream_commercial_outbox (
 job_id TEXT PRIMARY KEY NOT NULL CHECK(length(job_id)=64),
 client_id TEXT NOT NULL REFERENCES risk_stream_commercial_subscriptions(client_id),
 gro_id TEXT NOT NULL REFERENCES risk_stream_signed_gro(gro_id),
 license_envelope_json TEXT NOT NULL CHECK(json_valid(license_envelope_json)),
 license_payload_sha256 TEXT NOT NULL CHECK(length(license_payload_sha256)=64),
 release_receipt_sha256 TEXT NOT NULL CHECK(length(release_receipt_sha256)=64),
 state TEXT NOT NULL DEFAULT 'PENDING'
   CHECK(state IN ('PENDING','LEASED','DISPATCHED','HOLD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 16),
 next_attempt_at TEXT NOT NULL,
 lease_expires_at TEXT,
 created_at TEXT NOT NULL,
 dispatched_at TEXT,
 UNIQUE(client_id,gro_id)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_commercial_due
 ON risk_stream_commercial_outbox(state,next_attempt_at,created_at);
CREATE TABLE IF NOT EXISTS risk_stream_commercial_delivery_receipts (
 job_id TEXT PRIMARY KEY NOT NULL REFERENCES risk_stream_commercial_outbox(job_id),
 client_id TEXT NOT NULL,
 gro_id TEXT NOT NULL,
 license_payload_sha256 TEXT NOT NULL CHECK(length(license_payload_sha256)=64),
 provider_ack_sha256 TEXT NOT NULL CHECK(length(provider_ack_sha256)=64),
 received_at TEXT NOT NULL
);

-- Immutable per-event seven-day chronological vector. Each event is derived
-- from a previously verified licensed GRO, never from an indexed lead.
CREATE TABLE IF NOT EXISTS risk_stream_commercial_risk_chain (
 entry_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(entry_sha256)=64),
 gro_id TEXT NOT NULL REFERENCES risk_stream_signed_gro(gro_id),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 day_utc TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 previous_entry_sha256 TEXT NOT NULL CHECK(length(previous_entry_sha256)=64),
 licensed_payload_sha256 TEXT NOT NULL CHECK(length(licensed_payload_sha256)=64),
 score_0_100 REAL NOT NULL CHECK(score_0_100 BETWEEN 0 AND 100),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 signature_b64 TEXT NOT NULL,
 private_r2_object_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(gro_id,country_iso3,category)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_commercial_history_7d
 ON risk_stream_commercial_risk_chain(country_iso3,category,observed_at DESC);
