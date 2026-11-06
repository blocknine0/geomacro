-- Progressive Risk Gate: derived facts only, no publisher expression or article bodies.
-- Existing GRO, quota, request-id ledger, archive and audit tables stay unchanged.
CREATE TABLE IF NOT EXISTS progressive_risk_gate_facts (
  observation_id TEXT PRIMARY KEY CHECK (length(observation_id) = 64),
  country_iso3 TEXT NOT NULL CHECK (length(country_iso3) = 3),
  category TEXT NOT NULL CHECK (category IN ('geopolitics','macro','rare_earth')),
  event_fingerprint TEXT NOT NULL CHECK (length(event_fingerprint) = 64),
  publisher_domain TEXT NOT NULL CHECK (length(publisher_domain) BETWEEN 3 AND 253),
  canonical_source_url TEXT NOT NULL CHECK (length(canonical_source_url) BETWEEN 12 AND 2048),
  event_clock TEXT NOT NULL,
  clock_basis TEXT NOT NULL CHECK (clock_basis IN ('ORIGINAL_PUBLICATION','INDEX_OBSERVED')),
  extracted_entities_json TEXT NOT NULL CHECK (length(extracted_entities_json) <= 2048),
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_progressive_risk_gate_facts_country_time
  ON progressive_risk_gate_facts(country_iso3, event_clock DESC);
CREATE INDEX IF NOT EXISTS idx_progressive_risk_gate_facts_cell_event
  ON progressive_risk_gate_facts(country_iso3, category, event_fingerprint, event_clock DESC, publisher_domain);

-- Materialized promotion is an optimization, never authoritative for a gate
-- decision: the gate re-aggregates the source facts at read time.
CREATE TABLE IF NOT EXISTS progressive_risk_gate_cell_state (
  country_iso3 TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('geopolitics','macro','rare_earth')),
  event_fingerprint TEXT NOT NULL CHECK (length(event_fingerprint) = 64),
  corroboration_sources_count INTEGER NOT NULL CHECK (corroboration_sources_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('OBSERVED','CORROBORATED')),
  event_clock TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(country_iso3, category, event_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_progressive_risk_gate_state_recent
  ON progressive_risk_gate_cell_state(country_iso3, updated_at DESC, status);
