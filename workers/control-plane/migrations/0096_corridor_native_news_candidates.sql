-- Corridor-only publisher-native article metadata; never Website Intelligence,
-- OSINT, public query, PREDGE, commercial eligibility or signed GRO.
-- Raw headlines, articles, XML and upstream content MUST NOT be stored.
CREATE TABLE IF NOT EXISTS corridor_native_news_candidates (
  candidate_id TEXT PRIMARY KEY CHECK(length(candidate_id)=64),
  source_id TEXT NOT NULL CHECK(length(source_id) BETWEEN 3 AND 70),
  native_published_at TEXT NOT NULL,
  article_url TEXT NOT NULL CHECK(length(article_url) BETWEEN 12 AND 1024),
  source_title_sha256 TEXT NOT NULL CHECK(length(source_title_sha256)=64),
  source_region_refs_json TEXT NOT NULL CHECK(length(source_region_refs_json) BETWEEN 2 AND 256),
  candidate_corridor_ids_json TEXT NOT NULL CHECK(length(candidate_corridor_ids_json) BETWEEN 2 AND 512),
  categories_json TEXT NOT NULL CHECK(length(categories_json) BETWEEN 2 AND 120),
  first_ingested_at TEXT NOT NULL,
  CHECK(length(native_published_at)>=20),
  CHECK(length(first_ingested_at)>=20)
);
CREATE INDEX IF NOT EXISTS idx_corridor_native_news_ttl
 ON corridor_native_news_candidates(native_published_at,candidate_id);
CREATE INDEX IF NOT EXISTS idx_corridor_native_news_source_native
 ON corridor_native_news_candidates(source_id,native_published_at DESC);
