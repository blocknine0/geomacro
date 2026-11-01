-- #3295 P0-1B: additive, non-payable D1 API usage proof.
-- Funding still requires existing verified provider receipt and active grant.
-- A debit is created only as an AFTER INSERT side effect of an immutable
-- grant-scoped usage receipt. No API or provider live activation in migration.
CREATE TABLE IF NOT EXISTS customer_usage_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  key_id TEXT NOT NULL REFERENCES api_keys(key_id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES customer_entitlement_grants(grant_id) ON DELETE RESTRICT,
  capability TEXT NOT NULL CHECK(capability IN (
    'intelligence_query','gri_read','structural_country_digest',
    'structural_corridor_digest','structural_country_profile',
    'structural_corridor_profile','signed_risk_object','risk_gate_bundle')),
  credit_cost INTEGER NOT NULL CHECK(credit_cost>0 AND credit_cost<=15),
  contract_version TEXT NOT NULL CHECK(contract_version='credits-v1.1.0'),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,request_id),
  CHECK(length(request_id) BETWEEN 8 AND 160),
  CHECK(length(event_id) BETWEEN 16 AND 128)
);
CREATE INDEX IF NOT EXISTS idx_customer_usage_grant ON customer_usage_receipts(grant_id,occurred_at);

CREATE TRIGGER IF NOT EXISTS trg_customer_usage_validate
BEFORE INSERT ON customer_usage_receipts
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.key_id=NEW.key_id AND k.user_id=NEW.user_id
      AND k.revoked_at IS NULL AND k.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM json_each(k.scopes_json) s
        WHERE s.value=CASE
          WHEN NEW.capability='intelligence_query' THEN 'intelligence:read'
          WHEN NEW.capability LIKE 'structural_%' THEN 'structural:read'
          WHEN NEW.capability='signed_risk_object' THEN 'signed:read'
          WHEN NEW.capability='risk_gate_bundle' THEN 'risk-gate:read'
          ELSE 'gri:read' END)
  ) THEN RAISE(ABORT,'CUSTOMER_ACTIVE_SCOPED_KEY_REQUIRED') END;
  SELECT CASE WHEN NEW.credit_cost<>(CASE NEW.capability
    WHEN 'intelligence_query' THEN 1
    WHEN 'gri_read' THEN 1
    WHEN 'structural_country_digest' THEN 3
    WHEN 'structural_corridor_digest' THEN 5
    WHEN 'structural_country_profile' THEN 8
    WHEN 'structural_corridor_profile' THEN 12
    WHEN 'signed_risk_object' THEN 10
    WHEN 'risk_gate_bundle' THEN 15
    ELSE -1 END)
    THEN RAISE(ABORT,'CUSTOMER_LOCKED_CAPABILITY_COST_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_entitlement_grants g
    JOIN customer_payment_receipts p ON p.receipt_id=g.receipt_id
    WHERE g.grant_id=NEW.grant_id AND g.user_id=NEW.user_id AND p.user_id=NEW.user_id
      AND g.status='active' AND g.contract_version=NEW.contract_version
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND p.verified_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS (SELECT 1 FROM credit_ledger rev
         WHERE rev.receipt_id=p.receipt_id AND rev.event_type='reversal')
      AND (g.tier='business_pilot'
        OR (g.tier='pro_analyst' AND NEW.capability IN (
          'intelligence_query','structural_country_digest','structural_corridor_digest',
          'structural_country_profile','structural_corridor_profile'))
        OR (g.tier='starter_dev' AND NEW.capability IN (
          'intelligence_query','structural_country_digest','structural_country_profile')))
  ) THEN RAISE(ABORT,'CUSTOMER_ACTIVE_VERIFIED_GRANT_REQUIRED') END;
  SELECT CASE WHEN (
    SELECT COALESCE(SUM(CASE WHEN l.event_type IN ('funding','reversal')
      THEN l.delta_credits ELSE 0 END),0)
    FROM credit_ledger l JOIN customer_entitlement_grants g ON g.receipt_id=l.receipt_id
    WHERE g.grant_id=NEW.grant_id
  ) - (SELECT COALESCE(SUM(x.credit_cost),0) FROM customer_usage_receipts x
    WHERE x.grant_id=NEW.grant_id) < NEW.credit_cost
  THEN RAISE(ABORT,'CUSTOMER_INSUFFICIENT_GRANT_CREDITS') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_usage_to_ledger
AFTER INSERT ON customer_usage_receipts
BEGIN
  INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,
    receipt_id,request_id,capability,occurred_at)
  VALUES(NEW.event_id,NEW.user_id,'debit',-NEW.credit_cost,
    NULL,NEW.request_id,NEW.capability,NEW.occurred_at);
END;

-- Direct debits outside the grant-scoped atomic receipt are disallowed.
CREATE TRIGGER IF NOT EXISTS trg_customer_usage_no_direct_debit
BEFORE INSERT ON credit_ledger WHEN NEW.event_type='debit'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_usage_receipts x
      WHERE x.user_id=NEW.user_id AND x.event_id=NEW.event_id
        AND x.request_id=NEW.request_id AND x.capability=NEW.capability
        AND x.credit_cost=-NEW.delta_credits
  ) THEN RAISE(ABORT,'CUSTOMER_USAGE_RECEIPT_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_usage_immutable_update
BEFORE UPDATE ON customer_usage_receipts
BEGIN SELECT RAISE(ABORT,'CUSTOMER_USAGE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_customer_usage_immutable_delete
BEFORE DELETE ON customer_usage_receipts
BEGIN SELECT RAISE(ABORT,'CUSTOMER_USAGE_IMMUTABLE'); END;
