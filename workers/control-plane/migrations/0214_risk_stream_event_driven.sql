-- GeoMacro R1: proof-gated, event-driven, global Risk Gate streaming lane.
-- New migration; never silently modify existing verified GROs, GRIs, P0-B or customer debits.
-- Record facts-only derived metadata; encrypted original source bytes live in private R2.
CREATE TABLE IF NOT EXISTS risk_stream_sources (
 source_id TEXT PRIMARY KEY NOT NULL,
 publisher_root_domain TEXT NOT NULL,
 parent_media_entity TEXT NOT NULL,
 source_role TEXT NOT NULL CHECK (source_role IN
  ('GOVERNMENT_WIRE','INDEPENDENT_REGIONAL','OFFICIAL_STATISTICS',
   'MARKET_PRICE','TRADE_CUSTOMS','INDEPENDENT_INDUSTRY')),
 commercial_rights_approved INTEGER NOT NULL DEFAULT 0
  CHECK(commercial_rights_approved IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 reviewed_at TEXT NOT NULL,
 rights_expire_at TEXT,
 CHECK(length(source_id) BETWEEN 3 AND 120),
 CHECK(length(publisher_root_domain) BETWEEN 3 AND 253)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_sources_active
 ON risk_stream_sources(enabled,source_role);

CREATE TABLE IF NOT EXISTS risk_stream_category_policy (
 category TEXT PRIMARY KEY,
 required_role_a TEXT NOT NULL,
 required_role_b TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 CHECK(required_role_a<>required_role_b)
);
INSERT OR IGNORE INTO risk_stream_category_policy(category,required_role_a,required_role_b,enabled)
 VALUES
 ('GEOPOLITICS','GOVERNMENT_WIRE','INDEPENDENT_REGIONAL',1),
 ('MACRO_FX','OFFICIAL_STATISTICS','MARKET_PRICE',1),
 ('CRITICAL_MINERALS','TRADE_CUSTOMS','INDEPENDENT_INDUSTRY',1);
-- Additional categories are possible with reviewed, enabled role policies;
-- no user-supplied free-form category can self-authorize commercial output.

CREATE TABLE IF NOT EXISTS risk_stream_evidence (
 observation_id TEXT PRIMARY KEY NOT NULL CHECK(length(observation_id)=64),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL,
 event_fingerprint TEXT NOT NULL CHECK(length(event_fingerprint)=64),
 source_id TEXT NOT NULL REFERENCES risk_stream_sources(source_id),
 publisher_root_domain TEXT NOT NULL,
 parent_media_entity TEXT NOT NULL,
 source_role TEXT NOT NULL,
 published_at TEXT NOT NULL,
 entities_json TEXT NOT NULL CHECK(json_valid(entities_json)),
 derived_json TEXT NOT NULL CHECK(json_valid(derived_json)),
 original_page_sha256 TEXT NOT NULL CHECK(length(original_page_sha256)=64),
 original_verified INTEGER NOT NULL DEFAULT 0 CHECK(original_verified IN (0,1)),
 source_url_sha256 TEXT NOT NULL CHECK(length(source_url_sha256)=64),
 private_r2_object_key TEXT,
 received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_corrob
 ON risk_stream_evidence(event_fingerprint,published_at,category,country_iso3);
CREATE INDEX IF NOT EXISTS idx_risk_stream_country_category
 ON risk_stream_evidence(country_iso3,category,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_stream_rights_backfill
 ON risk_stream_evidence(source_id,original_verified,published_at DESC);

CREATE TABLE IF NOT EXISTS risk_stream_signed_gro (
 gro_id TEXT PRIMARY KEY NOT NULL CHECK(length(gro_id)=64),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL,
 event_fingerprint TEXT NOT NULL CHECK(length(event_fingerprint)=64),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 signature_b64 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_signed_current
 ON risk_stream_signed_gro(country_iso3,category,expires_at DESC);
CREATE TABLE IF NOT EXISTS risk_stream_delivery_outbox (
 gro_id TEXT PRIMARY KEY NOT NULL REFERENCES risk_stream_signed_gro(gro_id),
 state TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(state IN ('PENDING','LEASED','DISPATCHED','HOLD')),
 created_at TEXT NOT NULL,
 dispatch_attempts INTEGER NOT NULL DEFAULT 0,
 dispatched_at TEXT,
 lease_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_delivery_due
 ON risk_stream_delivery_outbox(state,created_at);

-- Per-kind refill ledger is a pacing gate ONLY. Every actual B2 operation
-- must still obtain the unchanged shared atomic account-wide quota ticket.
-- A token does not authorize billable B2 bytes, provider spend or free tier upgrades.
CREATE TABLE IF NOT EXISTS risk_stream_b2_token_bucket (
 day_utc TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('GET','PUT','HEAD','NATIVE_AUTH')),
 tokens_milli INTEGER NOT NULL CHECK(tokens_milli>=0),
 updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=0),
 PRIMARY KEY(day_utc,kind)
);
