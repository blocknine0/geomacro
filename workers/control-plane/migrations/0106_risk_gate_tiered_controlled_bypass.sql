-- Dedicated tiered/private Risk Gate response ledger; no funds/credits debited.
-- Existing Predge and research pilot tables/quotas are not modified.
CREATE TABLE IF NOT EXISTS risk_gate_tiered_requests (
 client_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 state TEXT NOT NULL CHECK(state IN ('PENDING','CLAIMED','DONE')),
 created_at TEXT NOT NULL,
 finished_at TEXT,
 response_json TEXT,
 PRIMARY KEY(client_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_tiered_created
 ON risk_gate_tiered_requests(created_at);
