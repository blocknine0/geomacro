-- GeoMacro Derived Risk Gate Step 2: keep ALL protected ingestion sources
-- available as no-prose, noncommercial discovery only. Source rights and
-- independent event/score proof are deliberately NOT inferred on ingestion.
-- Existing canonical raw archive, GDELT B2 and private OSINT tables untouched.
CREATE TABLE IF NOT EXISTS derived_risk_gate_discovery_signals (
 signal_id TEXT PRIMARY KEY CHECK(length(signal_id)=64),
 lane TEXT NOT NULL CHECK(lane IN (
  'canonical','private_osint','reusable_news','gdelt_cameo')),
 original_ref TEXT NOT NULL CHECK(length(original_ref)=64),
 category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),
 country_iso3 TEXT CHECK(country_iso3 IS NULL OR length(country_iso3)=3),
 source_clock_at TEXT NOT NULL,
 first_seen_at TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 rights_state TEXT NOT NULL DEFAULT 'UNVERIFIED_SOURCE_RIGHTS'
  CHECK(rights_state='UNVERIFIED_SOURCE_RIGHTS'),
 review_status TEXT NOT NULL DEFAULT 'HOLD_SOURCE_ACCESS_OR_EXPRESSION'
  CHECK(review_status='HOLD_SOURCE_ACCESS_OR_EXPRESSION'),
 created_at TEXT NOT NULL,
 UNIQUE(lane,original_ref)
);
CREATE INDEX IF NOT EXISTS idx_derived_risk_discovery_first_seen
 ON derived_risk_gate_discovery_signals(first_seen_at DESC,signal_id DESC);
CREATE INDEX IF NOT EXISTS idx_derived_risk_discovery_lane_seen
 ON derived_risk_gate_discovery_signals(lane,first_seen_at DESC);

CREATE TABLE IF NOT EXISTS derived_risk_gate_discovery_cursors (
 lane TEXT PRIMARY KEY CHECK(lane IN (
  'canonical','private_osint','reusable_news','gdelt_cameo')),
 cursor_at TEXT NOT NULL,
 cursor_ref TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

-- Ascending immutable D1-first-seen keyset reads: no OFFSET scan amplification.
CREATE INDEX IF NOT EXISTS idx_phase2h_derived_discovery_cursor
 ON phase2h_private_raw_news(first_ingested_at,record_id);
CREATE INDEX IF NOT EXISTS idx_osint_derived_discovery_cursor
 ON private_osint_news_25h(first_seen_at,item_id);
CREATE INDEX IF NOT EXISTS idx_reusable_derived_discovery_cursor
 ON reusable_news_items(first_seen_at,item_id);
CREATE INDEX IF NOT EXISTS idx_gdelt_derived_discovery_cursor
 ON risk_gate_gdelt_event_index(first_seen_at,event_ref_id);
