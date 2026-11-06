-- GeoMacro CQRS public hot50 bundle. Existing 0033 page snapshots and canonical
-- revision triggers remain authoritative. No private/paid/signed materialization.
CREATE TABLE IF NOT EXISTS materialized_cache (
  key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL CHECK(length(payload) BETWEEN 2 AND 1800000),
  updated_at INTEGER NOT NULL CHECK(updated_at >= 0)
);
-- The current key is public_derived_news_hot50; a cache entry is disposable.
-- Existing migration 0029 already provides:
--   idx_private_osint_category_clock(category,native_feed_published_at DESC,item_id DESC)
-- Existing migration 0028 already provides:
--   idx_private_osint_news_clock(native_feed_published_at DESC,item_id DESC)
--   idx_private_osint_check_time(checked_at DESC,category)
-- Add the country-constrained index for keyset bundle reads.
CREATE INDEX IF NOT EXISTS idx_private_osint_country_category_clock_v2
 ON private_osint_news_25h(country_iso3,category,native_feed_published_at DESC,item_id DESC);
-- Cover source-checks status reads without a full source-check table scan.
CREATE INDEX IF NOT EXISTS idx_private_osint_check_category_status_v2
 ON private_osint_source_checks_24h(category,checked_at DESC,source_ref,state);
-- Ordered bounded canonical refresh (NOT a substitute for the one-row serving path).
CREATE INDEX IF NOT EXISTS idx_website_derived_hot_order_v2
 ON website_derived_intelligence(published_at DESC,id DESC,first_seen_at);
