-- GeoMacro Ask: optional global public-only, source-free model prose cache.
-- No question, user ID, IP, conversation, source, evidence or score is stored.
-- Positive TTL is checked on read; scheduled cleanup removes expired rows.
CREATE TABLE IF NOT EXISTS ask_public_model_cache (
  cache_key TEXT PRIMARY KEY NOT NULL CHECK(length(cache_key)=64),
  response_json TEXT NOT NULL CHECK(length(response_json) BETWEEN 20 AND 2200),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
  CHECK(expires_at-created_at<=1800)
);
CREATE INDEX IF NOT EXISTS idx_ask_public_model_cache_expiration
  ON ask_public_model_cache(expires_at);
