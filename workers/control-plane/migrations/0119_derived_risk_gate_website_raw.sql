-- Extend commercial Risk Gate *discovery only* with GeoMacro Website
-- Intelligence's existing three-category 72h canonical D1 journal.
-- Does NOT modify website_derived_intelligence, customer outputs, or the
-- frozen four-lane table CHECK constraints in migration 0117.
-- Source story_json is read in protected Worker memory and remains in its
-- original canonical journal. This table contains only a cryptographic
-- fingerprint and restricted stable reference: no publisher text or copy.
CREATE TABLE IF NOT EXISTS derived_risk_gate_website_raw_signals (
 signal_id TEXT PRIMARY KEY CHECK(length(signal_id)=64),
 website_story_id TEXT NOT NULL UNIQUE CHECK(length(website_story_id) BETWEEN 14 AND 24),
 lane TEXT NOT NULL DEFAULT 'website_intelligence'
  CHECK(lane='website_intelligence'),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 country_iso3 TEXT DEFAULT NULL CHECK(country_iso3 IS NULL),
 source_clock_at TEXT NOT NULL,
 first_seen_at TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 rights_state TEXT NOT NULL DEFAULT 'UNVERIFIED_SOURCE_RIGHTS'
  CHECK(rights_state='UNVERIFIED_SOURCE_RIGHTS'),
 review_status TEXT NOT NULL DEFAULT 'HOLD_SOURCE_ACCESS_OR_EXPRESSION'
  CHECK(review_status='HOLD_SOURCE_ACCESS_OR_EXPRESSION'),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_derived_risk_website_raw_first_seen
 ON derived_risk_gate_website_raw_signals(first_seen_at DESC,signal_id DESC);

-- Single durable keyset scan position. Reset to lower bound after a complete
-- journal scan, so editorial revisions get a new content-hash verification
-- without changing first_seen_at or downloading any publisher original.
CREATE TABLE IF NOT EXISTS derived_risk_gate_website_raw_cursor (
 single INTEGER PRIMARY KEY CHECK(single=1),
 cursor_at TEXT NOT NULL,
 cursor_story_id TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_risk_raw_source_scan
 ON website_derived_intelligence(first_seen_at,id);

-- Unified private queue for the next independent corroboration stage.
-- No duplicate source rows; four existing lanes are kept exactly intact.
CREATE VIEW IF NOT EXISTS derived_risk_gate_all_discovery_signals AS
 SELECT signal_id,lane,category,country_iso3,source_clock_at,
        first_seen_at,source_sha256,rights_state,review_status
 FROM derived_risk_gate_discovery_signals
 UNION ALL
 SELECT signal_id,lane,category,country_iso3,source_clock_at,
        first_seen_at,source_sha256,rights_state,review_status
 FROM derived_risk_gate_website_raw_signals;
