-- Bind priced Risk Gate idempotency to the caller's custom policy profile.
ALTER TABLE risk_gate_usage_ledger ADD COLUMN policy_hash TEXT NOT NULL DEFAULT '';
