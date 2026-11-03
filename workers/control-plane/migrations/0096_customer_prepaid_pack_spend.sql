-- Additive P0 prepaid credit-pack usage acceptance. No funds, keys or grants
-- are created by migration. Live eligibility remains receipt-linked and
-- funded by an independently verified provider settlement ONLY.
-- Rebuild only the D1 *usage validation* trigger; all immutable receipt,
-- duplicate debit, key and reversal guards remain unchanged.
DROP TRIGGER IF EXISTS trg_customer_usage_validate;
CREATE TRIGGER trg_customer_usage_validate
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
        OR g.tier IN ('credits_100','credits_500','credits_1500')
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
