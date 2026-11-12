-- 0218: bounded Hot50 autonomous discovery/projection. Additive; no source rights
-- or commercial release flags are modified by this migration.
CREATE TABLE IF NOT EXISTS risk_stream_global_search_leads (
 lead_id TEXT PRIMARY KEY NOT NULL CHECK(length(lead_id)=64),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 publisher_root_domain TEXT NOT NULL,
 index_record_sha256 TEXT NOT NULL CHECK(length(index_record_sha256)=64),
 index_link_sha256 TEXT NOT NULL CHECK(length(index_link_sha256)=64),
 title_sha256 TEXT NOT NULL CHECK(length(title_sha256)=64),
 published_at TEXT NOT NULL,
 first_seen_at TEXT NOT NULL,
 original_verified INTEGER NOT NULL DEFAULT 0 CHECK(original_verified=0),
 commercial_rights_approved INTEGER NOT NULL DEFAULT 0 CHECK(commercial_rights_approved=0)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_search_country_category_time
 ON risk_stream_global_search_leads(country_iso3,category,published_at DESC);

CREATE TABLE IF NOT EXISTS risk_stream_hot50_cell_snapshots (
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 refreshed_at TEXT NOT NULL,
 signal_count INTEGER NOT NULL CHECK(signal_count>=0),
 original_domains INTEGER NOT NULL CHECK(original_domains>=0),
 original_same_event_pair INTEGER NOT NULL CHECK(original_same_event_pair IN (0,1)),
 source_lanes_json TEXT NOT NULL CHECK(json_valid(source_lanes_json)),
 basic_status TEXT NOT NULL,
 standard_status TEXT NOT NULL,
 complex_status TEXT NOT NULL DEFAULT 'HOLD_SEVEN_DAY_PROVIDER_PROOF',
 source_gro_id TEXT,
 last_search_status TEXT NOT NULL,
 next_search_at TEXT NOT NULL,
 original_publisher_text_included INTEGER NOT NULL DEFAULT 0 CHECK(original_publisher_text_included=0),
 commercial_release_authorized INTEGER NOT NULL DEFAULT 0 CHECK(commercial_release_authorized=0),
 PRIMARY KEY(country_iso3,category)
);
CREATE INDEX IF NOT EXISTS idx_risk_stream_hot50_search_due
 ON risk_stream_hot50_cell_snapshots(next_search_at,category);

-- New 1-minute two-cell census must use a selective index, not a repeated
-- full scan of the 72-hour five-lane discovery bridge.
CREATE INDEX IF NOT EXISTS idx_risk_stream_hot50_discovery_cell
 ON derived_risk_gate_discovery_signals(country_iso3,category,source_clock_at DESC);
