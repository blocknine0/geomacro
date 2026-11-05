-- Append-only, cryptographically checkable Risk Gate decision receipts.
CREATE TABLE IF NOT EXISTS risk_gate_audit_receipts (
 receipt_id TEXT PRIMARY KEY CHECK(length(receipt_id)=64),
 client_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 subject_type TEXT NOT NULL CHECK(subject_type IN ('country','corridor')),
 subject_id TEXT NOT NULL,
 decision TEXT NOT NULL,
 policy_id TEXT,
 policy_version TEXT,
 evaluated_at TEXT NOT NULL,
 response_hash TEXT NOT NULL CHECK(length(response_hash)=64),
 execution_authorized INTEGER NOT NULL DEFAULT 0 CHECK(execution_authorized=0),
 audit_receipt_hash TEXT NOT NULL CHECK(length(audit_receipt_hash)=64),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_audit_receipts_evaluated
 ON risk_gate_audit_receipts(evaluated_at);
CREATE TRIGGER IF NOT EXISTS risk_gate_audit_receipts_no_update
 BEFORE UPDATE ON risk_gate_audit_receipts
 BEGIN SELECT RAISE(ABORT,'risk_gate_audit_receipts is append-only'); END;
CREATE TRIGGER IF NOT EXISTS risk_gate_audit_receipts_no_delete
 BEFORE DELETE ON risk_gate_audit_receipts
 BEGIN SELECT RAISE(ABORT,'risk_gate_audit_receipts is append-only'); END;
