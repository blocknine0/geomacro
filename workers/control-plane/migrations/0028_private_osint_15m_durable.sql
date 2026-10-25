-- Private, strictly bounded native-feed OSINT research only, never publisher rights or signed products.
-- Source article bodies/headlines/links/Telegram posts are never admitted.
CREATE TABLE IF NOT EXISTS private_osint_news_25h (
  item_id TEXT PRIMARY KEY CHECK(length(item_id)=64),
  category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
  country_iso3 TEXT CHECK(country_iso3 IS NULL OR length(country_iso3)=3),
  native_feed_published_at TEXT NOT NULL,
  projection_json TEXT NOT NULL CHECK(length(projection_json) BETWEEN 400 AND 2400),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'NATIVE_FEED_OBSERVED_ORIGINAL_PAGE_UNVERIFIED'
    CHECK(verification_status='NATIVE_FEED_OBSERVED_ORIGINAL_PAGE_UNVERIFIED')
);
CREATE INDEX IF NOT EXISTS idx_private_osint_news_clock
 ON private_osint_news_25h(native_feed_published_at DESC,item_id DESC);
CREATE INDEX IF NOT EXISTS idx_private_osint_first_seen
 ON private_osint_news_25h(first_seen_at DESC);
CREATE TABLE IF NOT EXISTS private_osint_source_checks_24h (
  source_ref TEXT NOT NULL CHECK(length(source_ref)=64),
  category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
  state TEXT NOT NULL CHECK(state IN
   ('OBSERVED','EMPTY_OR_OUTSIDE_WINDOW','UNAVAILABLE','UNSUPPORTED_FORMAT','DENIED','MALFORMED','NOT_DUE')),
  checked_at TEXT NOT NULL,
  PRIMARY KEY(source_ref,category)
);
CREATE INDEX IF NOT EXISTS idx_private_osint_check_time
 ON private_osint_source_checks_24h(checked_at DESC,category);
