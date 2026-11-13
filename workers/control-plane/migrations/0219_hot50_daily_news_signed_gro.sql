-- 0219: immutable, GeoMacro-signed DAILY NEWS analytical GROs.
-- This table cannot authorize a customer charge, source license, or a reviewed
-- signed-original GRO. Evidence rights and commercial reviewer remain separate.
CREATE TABLE IF NOT EXISTS risk_stream_daily_news_gro (
 gro_id TEXT PRIMARY KEY NOT NULL CHECK(length(gro_id)=64),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 day_utc TEXT NOT NULL CHECK(length(day_utc)=10),
 event_fingerprint TEXT NOT NULL CHECK(length(event_fingerprint)=64),
 tier TEXT NOT NULL CHECK(tier IN ('basic_focused','standard','complex_full')),
 evidence_status TEXT NOT NULL CHECK(evidence_status IN
  ('UNVERIFIED_SIGNAL','DUAL_ATTESTED_ORIGINAL','CORROBORATED_INTERNAL_GRO')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 signature_b64 TEXT NOT NULL,
 signing_key_id TEXT NOT NULL,
 generated_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 commercial_sale_authorized INTEGER NOT NULL DEFAULT 0
  CHECK(commercial_sale_authorized=0),
 raw_source_disclosed INTEGER NOT NULL DEFAULT 0 CHECK(raw_source_disclosed=0),
 UNIQUE(country_iso3,category,day_utc,event_fingerprint,tier,evidence_status)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_daily_news_country_day
 ON risk_stream_daily_news_gro(country_iso3,category,day_utc DESC,tier);
CREATE INDEX IF NOT EXISTS idx_risk_stream_daily_news_event
 ON risk_stream_daily_news_gro(event_fingerprint,day_utc DESC);
