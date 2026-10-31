-- #3295: defense-in-depth for canonical D1 funded-only customer state.
-- All customer access remains disabled until deployed runtime parity acceptance.
-- No triggers on PREDGE, historical, legacy shadow, or x402 tables.

CREATE TRIGGER IF NOT EXISTS trg_customer_sessions_verified
BEFORE INSERT ON sessions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id=NEW.user_id AND status='active'
      AND email_verified_at IS NOT NULL
  ) THEN RAISE(ABORT,'CUSTOMER_VERIFIED_USER_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_funding_requires_receipt
BEFORE INSERT ON credit_ledger WHEN NEW.event_type='funding'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_payment_receipts r
    JOIN customer_entitlement_grants g ON g.receipt_id=r.receipt_id
    WHERE r.receipt_id=NEW.receipt_id AND r.user_id=NEW.user_id
      AND g.user_id=NEW.user_id AND g.status='active'
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ) THEN RAISE(ABORT,'VERIFIED_ACTIVE_PAYMENT_GRANT_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_debit_guard
BEFORE INSERT ON credit_ledger WHEN NEW.event_type='debit'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users u
    JOIN customer_entitlement_grants g ON g.user_id=u.id
    WHERE u.id=NEW.user_id AND u.status='active'
      AND g.status='active'
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ) THEN RAISE(ABORT,'ACTIVE_PAYMENT_ENTITLEMENT_REQUIRED') END;
  SELECT CASE WHEN (SELECT COALESCE(SUM(delta_credits),0)
     FROM credit_ledger WHERE user_id=NEW.user_id) + NEW.delta_credits < 0
    THEN RAISE(ABORT,'INSUFFICIENT_VERIFIED_CREDITS') END;
  SELECT CASE WHEN NEW.capability IS NULL OR length(NEW.capability)<2
    THEN RAISE(ABORT,'CAPABILITY_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_keys_funded_only
BEFORE INSERT ON api_keys
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id=NEW.user_id AND status='active'
      AND email_verified_at IS NOT NULL
  ) THEN RAISE(ABORT,'VERIFIED_ACTIVE_CUSTOMER_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_entitlement_grants g
    WHERE g.user_id=NEW.user_id AND g.status='active'
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NEW.expires_at<=g.expires_at
  ) THEN RAISE(ABORT,'VERIFIED_PAYMENT_ENTITLEMENT_REQUIRED') END;
  SELECT CASE WHEN (SELECT COALESCE(SUM(delta_credits),0)
     FROM credit_ledger WHERE user_id=NEW.user_id) <= 0
    THEN RAISE(ABORT,'POSITIVE_PAID_BALANCE_REQUIRED') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM api_keys
     WHERE user_id=NEW.user_id AND revoked_at IS NULL
       AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) >= 3
    THEN RAISE(ABORT,'MAX_THREE_ACTIVE_KEYS') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM api_keys
     WHERE user_id=NEW.user_id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds'))
    THEN RAISE(ABORT,'KEY_CREATION_COOLDOWN') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_key_owner_immutable
BEFORE UPDATE ON api_keys
WHEN OLD.key_id<>NEW.key_id OR OLD.user_id<>NEW.user_id
  OR OLD.hmac_sha256<>NEW.hmac_sha256 OR
  (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL)
BEGIN SELECT RAISE(ABORT,'CUSTOMER_KEY_IMMUTABLE_OR_REVOKED'); END;

CREATE TRIGGER IF NOT EXISTS trg_customer_ledger_append_only_update
BEFORE UPDATE ON credit_ledger BEGIN
  SELECT RAISE(ABORT,'CUSTOMER_LEDGER_APPEND_ONLY');
END;
CREATE TRIGGER IF NOT EXISTS trg_customer_ledger_append_only_delete
BEFORE DELETE ON credit_ledger BEGIN
  SELECT RAISE(ABORT,'CUSTOMER_LEDGER_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS trg_customer_receipts_immutable_update
BEFORE UPDATE ON customer_payment_receipts BEGIN
  SELECT RAISE(ABORT,'CUSTOMER_PAYMENT_RECEIPT_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS trg_customer_receipts_immutable_delete
BEFORE DELETE ON customer_payment_receipts BEGIN
  SELECT RAISE(ABORT,'CUSTOMER_PAYMENT_RECEIPT_IMMUTABLE');
END;
