-- Private owner-only research OSINT lane. Strictly separate from reusable public JSON,
-- Predge 72h, signed Intelligence, GRO/GRI and mainnet commerce.
-- No upstream source titles, article URLs, publisher identities or article bytes.
CREATE TABLE IF NOT EXISTS private_osint_news (
 item_id TEXT PRIMARY KEY CHECK(length(item_id)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 country_iso3 TEXT CHECK(country_iso3 IS NULL OR length(country_iso3)=3),
 published_at TEXT NOT NULL,
 projection_json TEXT NOT NULL CHECK(length(projection_json) BETWEEN 400 AND 2400),
 first_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_osint_published ON private_osint_news(published_at DESC,item_id DESC);
CREATE INDEX IF NOT EXISTS idx_private_osint_country_domain ON private_osint_news(country_iso3,category,published_at DESC);
CREATE TABLE IF NOT EXISTS private_osint_source_checks (
 source_ref TEXT PRIMARY KEY CHECK(length(source_ref)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 state TEXT NOT NULL CHECK(state IN ('OBSERVED','EMPTY_OR_OUTSIDE_WINDOW','UNAVAILABLE','UNSUPPORTED_FORMAT','DENIED','MALFORMED','NOT_DUE')),
 checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_private_osint_source_checked ON private_osint_source_checks(checked_at DESC,category);
