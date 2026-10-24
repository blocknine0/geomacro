-- Independent, bounded RESEARCH-only factual JSON. No original headline,
-- source body, publisher URL, source publisher name, payment or score.
-- Authorized scheduled GitHub ingester only; 72h row retention.
CREATE TABLE IF NOT EXISTS reusable_news_items (
 item_id TEXT PRIMARY KEY CHECK(length(item_id)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 published_at TEXT NOT NULL,
 projection_json TEXT NOT NULL CHECK(length(projection_json) BETWEEN 400 AND 2400),
 first_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reusable_news_published
 ON reusable_news_items(published_at DESC,item_id DESC);
CREATE TABLE IF NOT EXISTS reusable_source_checks (
 source_ref TEXT PRIMARY KEY CHECK(length(source_ref)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 state TEXT NOT NULL CHECK(state IN ('OBSERVED','EMPTY_OR_OUTSIDE_WINDOW','UNAVAILABLE','UNSUPPORTED_FORMAT','DENIED','MALFORMED','NOT_DUE')),
 checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reusable_source_checked
 ON reusable_source_checks(checked_at DESC,category);
