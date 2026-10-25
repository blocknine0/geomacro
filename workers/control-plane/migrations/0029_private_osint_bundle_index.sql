-- Private three-category keyset bundle reads; no new data or public route.
CREATE INDEX IF NOT EXISTS idx_private_osint_category_clock
 ON private_osint_news_25h(category,native_feed_published_at DESC,item_id DESC);
