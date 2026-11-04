-- Bounded 20-minute discovery for empty or stale country/corridor category cells.
-- Observations are metadata-only and remain unverified until corroboration.
CREATE TABLE IF NOT EXISTS risk_gap_enrichment_cursor (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  next_offset INTEGER NOT NULL DEFAULT 0 CHECK(next_offset>=0),
  last_run_at TEXT
);

CREATE TABLE IF NOT EXISTS unverified_observations (
  observation_id TEXT PRIMARY KEY CHECK(length(observation_id)=64),
  event_id TEXT NOT NULL CHECK(length(event_id)=64),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
  entity_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
  event_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_host TEXT NOT NULL,
  title_sha256 TEXT NOT NULL CHECK(length(title_sha256)=64),
  impact_factor REAL CHECK(impact_factor IS NULL OR impact_factor BETWEEN 0 AND 100),
  fact_basis TEXT NOT NULL CHECK(fact_basis IN ('ARTICLE_FULL_TEXT','SEARCH_TITLE_ONLY')),
  original_page_fetched INTEGER NOT NULL CHECK(original_page_fetched IN (0,1)),
  status TEXT NOT NULL DEFAULT 'OBSERVED' CHECK(status IN ('OBSERVED','CORROBORATED')),
  independent_source_count INTEGER NOT NULL DEFAULT 1 CHECK(independent_source_count BETWEEN 1 AND 40),
  discovered_at TEXT NOT NULL,
  UNIQUE(event_id,source_host)
);
CREATE INDEX IF NOT EXISTS idx_unverified_observations_entity_clock
 ON unverified_observations(entity_type,entity_id,category,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_unverified_observations_event
 ON unverified_observations(event_id,status,source_host);
