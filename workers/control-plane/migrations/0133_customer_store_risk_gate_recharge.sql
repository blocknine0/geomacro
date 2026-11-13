-- Store Risk Gate debits are separate from Predge usage and customer credit
-- units. Each delivery is an immutable monetary debit against a verified,
-- active prepaid receipt; the application keeps checkout disabled by default.
-- The v2 paid Predge daily counter is telemetry only. v1's application-level
-- 100/day cap remains; remove the old table's hard 500-row storage ceiling.
ALTER TABLE risk_gate_d1_quota RENAME TO risk_gate_d1_quota_bounded_legacy;
CREATE TABLE risk_gate_d1_quota (
  client_id TEXT NOT NULL,
  usage_day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),
  PRIMARY KEY(client_id,usage_day)
);
INSERT INTO risk_gate_d1_quota(client_id,usage_day,used)
 SELECT client_id,usage_day,used FROM risk_gate_d1_quota_bounded_legacy;
DROP TABLE risk_gate_d1_quota_bounded_legacy;

CREATE TABLE IF NOT EXISTS customer_store_risk_gate_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  key_id TEXT NOT NULL REFERENCES api_keys(key_id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES customer_entitlement_grants(grant_id) ON DELETE RESTRICT,
  receipt_id TEXT NOT NULL REFERENCES customer_payment_receipts(receipt_id) ON DELETE RESTRICT,
  tier TEXT NOT NULL CHECK(tier IN ('basic_focused','standard','complex_full')),
  charge_cents INTEGER NOT NULL CHECK(charge_cents IN (15,20,30)),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,request_id),
  CHECK(length(request_id) BETWEEN 8 AND 160)
);
CREATE INDEX IF NOT EXISTS idx_store_risk_gate_usage_receipt
  ON customer_store_risk_gate_usage(receipt_id,occurred_at);

CREATE TRIGGER IF NOT EXISTS trg_store_risk_gate_usage_validate
BEFORE INSERT ON customer_store_risk_gate_usage
BEGIN
  SELECT CASE WHEN NEW.charge_cents<>(CASE NEW.tier
    WHEN 'basic_focused' THEN 15 WHEN 'standard' THEN 20 WHEN 'complex_full' THEN 30 END)
    THEN RAISE(ABORT,'STORE_RISK_GATE_PRICE_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.key_id=NEW.key_id AND k.user_id=NEW.user_id
      AND k.revoked_at IS NULL AND k.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM json_each(k.scopes_json) s WHERE s.value='risk-gate:read')
  ) THEN RAISE(ABORT,'STORE_RISK_GATE_ACTIVE_SCOPED_KEY_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_entitlement_grants g
    JOIN customer_payment_receipts p ON p.receipt_id=g.receipt_id
    WHERE g.grant_id=NEW.grant_id AND g.user_id=NEW.user_id
      AND p.receipt_id=NEW.receipt_id AND p.user_id=NEW.user_id
      AND g.status='active' AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND p.verified_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS(SELECT 1 FROM credit_ledger l
        WHERE l.receipt_id=p.receipt_id AND l.event_type='reversal')
  ) THEN RAISE(ABORT,'STORE_RISK_GATE_VERIFIED_ACTIVE_RECHARGE_REQUIRED') END;
  SELECT CASE WHEN (
    SELECT p.amount_minor_units-COALESCE((SELECT SUM(x.charge_cents)
      FROM customer_store_risk_gate_usage x WHERE x.receipt_id=p.receipt_id),0)
    FROM customer_payment_receipts p WHERE p.receipt_id=NEW.receipt_id
  ) < NEW.charge_cents THEN RAISE(ABORT,'STORE_RISK_GATE_INSUFFICIENT_RECHARGE_BALANCE') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_store_risk_gate_usage_immutable_update
BEFORE UPDATE ON customer_store_risk_gate_usage
BEGIN SELECT RAISE(ABORT,'STORE_RISK_GATE_USAGE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_store_risk_gate_usage_immutable_delete
BEFORE DELETE ON customer_store_risk_gate_usage
BEGIN SELECT RAISE(ABORT,'STORE_RISK_GATE_USAGE_IMMUTABLE'); END;
