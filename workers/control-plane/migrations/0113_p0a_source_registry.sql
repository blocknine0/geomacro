-- P0-A: D1 is the authoritative private per-source fetch configuration.
-- No public route, paid eligibility, source-rights inference or publication trigger.
CREATE TABLE IF NOT EXISTS source_registry (
 source_id TEXT PRIMARY KEY NOT NULL
  CHECK(length(source_id) BETWEEN 3 AND 120 AND source_id GLOB '[a-z0-9]*'),
 canonical_endpoint TEXT NOT NULL CHECK(length(canonical_endpoint) BETWEEN 12 AND 2048 AND
   substr(canonical_endpoint,1,8)='https://'),
 parser_type TEXT NOT NULL CHECK(parser_type IN
  ('RSS_2','ATOM','RDF','JSON_REST','CSV_STREAM','HTML_BOUNDED')),
 intended_category TEXT NOT NULL CHECK(intended_category IN
  ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 country_iso3 TEXT NOT NULL CHECK(country_iso3='GLOBAL' OR
  (length(country_iso3)=3 AND country_iso3=upper(country_iso3))),
 rights_tier TEXT NOT NULL CHECK(rights_tier IN
  ('COMMERCIAL_APPROVED','RESEARCH_ONLY','PENDING_AUDIT')),
 polling_interval_sec INTEGER NOT NULL CHECK(polling_interval_sec BETWEEN 300 AND 3600),
 rate_limit_backoff TEXT NOT NULL CHECK(
  json_valid(rate_limit_backoff)=1 AND
  json_type(rate_limit_backoff,'$.max_retries')='integer' AND
  json_extract(rate_limit_backoff,'$.max_retries') BETWEEN 0 AND 3 AND
  json_type(rate_limit_backoff,'$.base_delay_ms')='integer' AND
  json_extract(rate_limit_backoff,'$.base_delay_ms') BETWEEN 100 AND 10000 AND
  json_type(rate_limit_backoff,'$.respect_retry_after') IN ('true','false')),
 fallback_endpoint TEXT CHECK(fallback_endpoint IS NULL OR
  (substr(fallback_endpoint,1,8)='https://' AND length(fallback_endpoint)<=2048)),
 last_cursor TEXT CHECK(last_cursor IS NULL OR length(last_cursor)<=1024),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 next_poll_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
 last_polled_at TEXT,
 last_state TEXT NOT NULL DEFAULT 'REGISTERED'
  CHECK(last_state IN ('REGISTERED','OBSERVED','UNCHANGED','EMPTY','DENIED',
   'RATE_LIMITED','UNAVAILABLE','MALFORMED','CAPACITY_DEFERRED')),
 last_http_status INTEGER,
 consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_p0a_registry_due
 ON source_registry(enabled,next_poll_at,source_id);

-- Private source normalization staging, never readable on public/paid routes.
-- This table does NOT confer original-event verification or reuse rights.
CREATE TABLE IF NOT EXISTS p0a_normalized_source_items (
 item_id TEXT PRIMARY KEY CHECK(length(item_id)=64),
 source_id TEXT NOT NULL REFERENCES source_registry(source_id),
 intended_category TEXT NOT NULL,
 country_iso3 TEXT NOT NULL,
 rights_tier TEXT NOT NULL,
 title TEXT,
 original_url TEXT,
 source_record_id TEXT,
 native_published_at TEXT,
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_p0a_source_items_recent
 ON p0a_normalized_source_items(first_seen_at DESC,item_id DESC);
CREATE INDEX IF NOT EXISTS idx_p0a_source_items_by_source
 ON p0a_normalized_source_items(source_id,first_seen_at DESC);
