-- 0221: append-only unsigned Hot50 news GRO research stage.
-- No cryptographic signature, rights grant, customer delivery or execution.
CREATE TABLE IF NOT EXISTS risk_stream_unsigned_news_gro (
 gro_id TEXT PRIMARY KEY NOT NULL CHECK(length(gro_id)=64),
 country_iso3 TEXT NOT NULL CHECK(country_iso3 GLOB '[A-Z][A-Z][A-Z]'),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 day_utc TEXT NOT NULL CHECK(length(day_utc)=10),
 event_fingerprint TEXT NOT NULL CHECK(length(event_fingerprint)=64),
 tier TEXT NOT NULL CHECK(tier IN ('basic_focused','standard','complex_full')),
 evidence_status TEXT NOT NULL CHECK(evidence_status IN
  ('UNVERIFIED_SIGNAL','DUAL_ATTESTED_ORIGINAL','CORROBORATED_INTERNAL_GRO')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 signature_status TEXT NOT NULL DEFAULT 'UNSIGNED' CHECK(signature_status='UNSIGNED'),
 generated_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 commercial_sale_authorized INTEGER NOT NULL DEFAULT 0 CHECK(commercial_sale_authorized=0),
 source_rights_verified INTEGER NOT NULL DEFAULT 0 CHECK(source_rights_verified=0),
 raw_source_disclosed INTEGER NOT NULL DEFAULT 0 CHECK(raw_source_disclosed=0),
 execution_authorized INTEGER NOT NULL DEFAULT 0 CHECK(execution_authorized=0),
 CHECK(json_extract(payload_json,'$.schema')='geomacro.hot50-news-unsigned-gro.v1'),
 CHECK(json_extract(payload_json,'$.signed')=0),
 CHECK(json_extract(payload_json,'$.signature_status')='UNSIGNED'),
 CHECK(json_extract(payload_json,'$.commercial_sale_authorized')=0),
 CHECK(json_extract(payload_json,'$.source_rights_verified')=0),
 CHECK(json_extract(payload_json,'$.customer_delivery_authorized')=0),
 CHECK(json_extract(payload_json,'$.billable')=0),
 CHECK(json_extract(payload_json,'$.execution_authorized')=0),
 CHECK(json_extract(payload_json,'$.raw_source_disclosed')=0),
 CHECK(json_extract(payload_json,'$.raw_upstream_text_included')=0),
 CHECK(json_extract(payload_json,'$.original_publisher_text_included')=0),
 UNIQUE(country_iso3,category,day_utc,event_fingerprint,tier,evidence_status)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_unsigned_news_country_day
 ON risk_stream_unsigned_news_gro(country_iso3,category,day_utc DESC,tier);
CREATE INDEX IF NOT EXISTS idx_risk_stream_unsigned_news_event
 ON risk_stream_unsigned_news_gro(event_fingerprint,day_utc DESC);
CREATE INDEX IF NOT EXISTS idx_risk_stream_unsigned_news_generated
 ON risk_stream_unsigned_news_gro(generated_at,gro_id);

-- Preserve immutability; only expired rows can be physically purged by retention.
CREATE TRIGGER IF NOT EXISTS trg_risk_stream_unsigned_news_no_update
 BEFORE UPDATE ON risk_stream_unsigned_news_gro
 BEGIN
  SELECT RAISE(ABORT,'UNSIGNED_GRO_IMMUTABLE');
 END;
CREATE TRIGGER IF NOT EXISTS trg_risk_stream_unsigned_news_expired_delete_only
 BEFORE DELETE ON risk_stream_unsigned_news_gro
 WHEN OLD.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
 BEGIN
  SELECT RAISE(ABORT,'UNSIGNED_GRO_RETENTION_NOT_EXPIRED');
 END;
