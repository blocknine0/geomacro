-- Private research-only OSINT evidence bridge for daily country/category risk census.
-- Zero article bodies/URLs/identifiers stored or promoted; no new ingestion.
-- Covers <=21 source-item lookups per missing canonical country/category.
CREATE INDEX IF NOT EXISTS idx_private_osint_unified_country_category_clock
 ON private_osint_news_25h(country_iso3,category,native_feed_published_at DESC,item_id DESC);
