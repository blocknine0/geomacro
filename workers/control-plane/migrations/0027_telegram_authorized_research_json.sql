-- Authorized Telegram Bot webhook -> verified B2 -> accepted D1 ->
-- private, bounded reusable RESEARCH JSON. Never customer-facing news.
CREATE TABLE IF NOT EXISTS telegram_research_json (
  delivery_id TEXT PRIMARY KEY CHECK(length(delivery_id)=52),
  category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
  country_iso3 TEXT CHECK(country_iso3 IS NULL OR (length(country_iso3)=3 AND country_iso3 GLOB '[A-Z][A-Z][A-Z]')),
  published_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(verification_status='UNVERIFIED'),
  scoring_eligible INTEGER NOT NULL DEFAULT 0 CHECK(scoring_eligible=0),
  commercial_eligible INTEGER NOT NULL DEFAULT 0 CHECK(commercial_eligible=0),
  FOREIGN KEY(delivery_id) REFERENCES telegram_private_unverified_leads(delivery_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_research_json_72h
  ON telegram_research_json(published_at DESC,delivery_id DESC);
