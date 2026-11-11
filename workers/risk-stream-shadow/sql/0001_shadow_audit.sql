-- Dedicated isolated shadow D1 only. Apply 0214 on this DB FIRST.
-- Never apply this supplemental schema to production canonical D1.
CREATE TABLE IF NOT EXISTS progressive_risk_gate_facts (
  country_iso3 TEXT NOT NULL, category TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL, publisher_domain TEXT NOT NULL,
  clock_basis TEXT NOT NULL, extracted_entities_json TEXT NOT NULL,
  event_clock TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shadow_secondary_hints
  ON progressive_risk_gate_facts(country_iso3,event_clock);
-- Hints are always untrusted; this table may be empty for initial live audit.
CREATE TABLE IF NOT EXISTS risk_stream_shadow_audit_receipts (
 batch_id TEXT PRIMARY KEY NOT NULL CHECK(length(batch_id)=64),
 started_at TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count BETWEEN 1 AND 10),
 corroborated_and_signed INTEGER NOT NULL,
 verified_signature_readbacks INTEGER NOT NULL,
 d1_calls INTEGER NOT NULL,
 d1_503_observed INTEGER NOT NULL,
 d1_write_p95_ms REAL,
 batch_elapsed_ms REAL NOT NULL,
 result_status TEXT NOT NULL CHECK(result_status IN
  ('PASS_ZERO_503','HOLD_503_OBSERVED'))
);
CREATE INDEX IF NOT EXISTS idx_shadow_audit_recent
  ON risk_stream_shadow_audit_receipts(started_at DESC);
