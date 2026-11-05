-- Add cryptographic audit receipt signatures to the append-only ledger.
ALTER TABLE risk_gate_audit_receipts
 ADD COLUMN signature_key_id TEXT;
ALTER TABLE risk_gate_audit_receipts
 ADD COLUMN signature_scheme TEXT;
ALTER TABLE risk_gate_audit_receipts
 ADD COLUMN audit_receipt_signature TEXT;
