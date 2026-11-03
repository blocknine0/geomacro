-- Isolated licensed MTProto metadata-only D1 research. NO Telegram Bot records.
-- Requires source-specific publisher/Telegram consent independently checked.
-- No raw message, usernames, handles, URLs, media, headline, PII, facts or GRO.
CREATE TABLE IF NOT EXISTS telegram_mtproto_private_research (
  delivery_id TEXT PRIMARY KEY CHECK(length(delivery_id)=35 AND substr(delivery_id,1,3)='mp_'),
  source_identity_sha256 TEXT NOT NULL CHECK(length(source_identity_sha256)=64),
  reference_sha256 TEXT NOT NULL CHECK(length(reference_sha256)=64),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
  country_iso3 TEXT CHECK(country_iso3 IS NULL OR (length(country_iso3)=3 AND country_iso3=upper(country_iso3))),
  topic_code TEXT NOT NULL CHECK(length(topic_code) BETWEEN 3 AND 48),
  published_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rights_state TEXT NOT NULL DEFAULT 'INDIVIDUALLY_LICENSED_MTPROTO_RESEARCH_ONLY'
    CHECK(rights_state='INDIVIDUALLY_LICENSED_MTPROTO_RESEARCH_ONLY'),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK(verification_status='UNVERIFIED'),
  scored INTEGER NOT NULL DEFAULT 0 CHECK(scored=0),
  commercial_eligible INTEGER NOT NULL DEFAULT 0 CHECK(commercial_eligible=0)
);
CREATE INDEX IF NOT EXISTS telegram_mtproto_research_expiry
  ON telegram_mtproto_private_research(expires_at);
CREATE INDEX IF NOT EXISTS telegram_mtproto_research_category
  ON telegram_mtproto_private_research(category,published_at DESC);
