-- Hash/topic-only authorized publisher webhook research fastlane.
-- Writes occur only from the separately permission-gated private Telegram producer.
-- B2 quota and old signed/private lead delivery remain independent.
-- No post body, headline, handle, link, username or media are stored here.
CREATE TABLE IF NOT EXISTS telegram_authorized_live_research (
  delivery_id TEXT PRIMARY KEY CHECK(length(delivery_id)=35 AND substr(delivery_id,1,3)='tg_'),
  category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
  country_iso3 TEXT CHECK(country_iso3 IS NULL OR (length(country_iso3)=3 AND country_iso3=upper(country_iso3))),
  topic_code TEXT NOT NULL CHECK(length(topic_code) BETWEEN 3 AND 48),
  message_fingerprint TEXT NOT NULL CHECK(length(message_fingerprint)=64),
  published_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rights_state TEXT NOT NULL DEFAULT 'PUBLISHER_AUTHORIZED_BOT_RESEARCH_ONLY'
    CHECK(rights_state='PUBLISHER_AUTHORIZED_BOT_RESEARCH_ONLY'),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK(verification_status='UNVERIFIED'),
  scored INTEGER NOT NULL DEFAULT 0 CHECK(scored=0),
  commercial_eligible INTEGER NOT NULL DEFAULT 0 CHECK(commercial_eligible=0)
);
CREATE INDEX IF NOT EXISTS telegram_live_research_recent
  ON telegram_authorized_live_research(published_at DESC,delivery_id DESC);
CREATE INDEX IF NOT EXISTS telegram_live_research_expiry
  ON telegram_authorized_live_research(expires_at);
CREATE INDEX IF NOT EXISTS telegram_live_research_category
  ON telegram_authorized_live_research(category,published_at DESC);
