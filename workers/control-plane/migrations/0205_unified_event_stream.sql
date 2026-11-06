-- Unified low-cost live event index. Cold archive state is metadata only;
-- archive objects are hourly bundles, never per-article files.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY CHECK(length(id)=64),
  source_type TEXT NOT NULL CHECK(source_type IN ('verified_media','official','unverified_osint')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  credibility_score REAL NOT NULL CHECK(credibility_score >= 0.1 AND credibility_score <= 1.0),
  title TEXT NOT NULL,
  summary TEXT,
  raw_payload_ref TEXT,
  country_iso TEXT,
  risk_category TEXT NOT NULL CHECK(risk_category IN ('conflict','macro_economics','commodities','sanctions')),
  independently_verified INTEGER NOT NULL DEFAULT 0 CHECK(independently_verified IN (0,1)),
  sentiment_score REAL CHECK(sentiment_score IS NULL OR (sentiment_score >= -1.0 AND sentiment_score <= 1.0)),
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived_at INTEGER,
  archive_object_key TEXT,
  archive_sha256 TEXT CHECK(archive_sha256 IS NULL OR length(archive_sha256)=64)
);
CREATE INDEX IF NOT EXISTS idx_events_lookup
  ON events(risk_category,country_iso,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_credibility
  ON events(credibility_score,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_archive_pending
  ON events(archived_at,published_at,id);
CREATE TABLE IF NOT EXISTS unified_event_archive_slots (
  hour_utc TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('RESERVED','ACKED')),
  archive_object_key TEXT,
  archive_sha256 TEXT CHECK(archive_sha256 IS NULL OR length(archive_sha256)=64),
  reserved_at INTEGER NOT NULL,
  acked_at INTEGER
);
