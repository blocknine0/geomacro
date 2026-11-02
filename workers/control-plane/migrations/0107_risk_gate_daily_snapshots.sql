-- Daily three-tier snapshots live in D1; no original article bodies and no charge ledger.
CREATE TABLE IF NOT EXISTS daily_tiered_risk_gates (
 corridor_id TEXT NOT NULL,
 day_utc TEXT NOT NULL,
 core_tier_json TEXT NOT NULL,
 signal_tier_json TEXT NOT NULL,
 policy_tier_json TEXT NOT NULL,
 observation_json TEXT NOT NULL,
 hmac_proof_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 generated_at TEXT NOT NULL,
 supabase_synced_at TEXT,
 PRIMARY KEY(corridor_id,day_utc)
);
CREATE INDEX IF NOT EXISTS idx_daily_tiered_risk_pending_sync
 ON daily_tiered_risk_gates(generated_at) WHERE supabase_synced_at IS NULL;
CREATE TABLE IF NOT EXISTS risk_gate_daily_housekeeping (
 job_id TEXT PRIMARY KEY,
 next_cleanup_at TEXT NOT NULL,
 last_cleanup_at TEXT
);
