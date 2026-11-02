-- Authenticated-only, separately bounded 72h CryptoCompare individual
-- publisher permalink + deterministic five-part metadata research.
-- No headlines, article body, partner credentials or paid records.
CREATE TABLE IF NOT EXISTS corridor_crypto_individual_research (
 article_id TEXT PRIMARY KEY CHECK(length(article_id)=64),
 provider_id TEXT NOT NULL CHECK(length(provider_id) BETWEEN 2 AND 90),
 published_at TEXT NOT NULL,
 article_url TEXT NOT NULL CHECK(length(article_url) BETWEEN 12 AND 1024),
 source_name TEXT NOT NULL CHECK(length(source_name) BETWEEN 2 AND 70),
 title_sha256 TEXT NOT NULL CHECK(length(title_sha256)=64),
 topic TEXT NOT NULL,
 record_sha256 TEXT NOT NULL CHECK(length(record_sha256)=64),
 structured_json TEXT NOT NULL CHECK(length(structured_json) BETWEEN 400 AND 6000),
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corridor_crypto_news_ttl
 ON corridor_crypto_individual_research(published_at,article_id);
CREATE INDEX IF NOT EXISTS idx_corridor_crypto_news_source
 ON corridor_crypto_individual_research(topic,published_at DESC);
