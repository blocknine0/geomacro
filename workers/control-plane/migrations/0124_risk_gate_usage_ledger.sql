-- Idempotent USD usage ledger for successfully delivered per-call Risk Gate tiers.
CREATE TABLE IF NOT EXISTS risk_gate_usage_ledger (
  ledger_id TEXT PRIMARY KEY CHECK(length(ledger_id)=64),
  request_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('COUNTRY','CORRIDOR')),
  subject_id TEXT NOT NULL,
  requested_tier TEXT NOT NULL CHECK(requested_tier IN ('basic_focused','standard','complex_full')),
  delivered_tier TEXT NOT NULL CHECK(delivered_tier IN ('basic_focused','standard','complex_full')),
  amount_usd_cents INTEGER NOT NULL CHECK(amount_usd_cents IN (10,15,25)),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64),
  entry_status TEXT NOT NULL DEFAULT 'POSTED' CHECK(entry_status='POSTED'),
  created_at TEXT NOT NULL,
  UNIQUE(key_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_usage_ledger_user_time
 ON risk_gate_usage_ledger(principal_id,created_at DESC);
