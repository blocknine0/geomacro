-- Mainnet USDC Risk Gate packs. Runtime acceptance remains OFF unless the
-- existing paid-runtime gates and the dedicated checkout acceptance are set.
-- Rebuild only receipt-linked tables so Arc has an explicit provider identity
-- and the three current pack tiers can be represented without relabeling data.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE customer_payment_receipts_v2 (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK(provider IN ('paypal','base_usdc','polygon_usdc','arc_usdc')),
  environment TEXT NOT NULL CHECK(environment IN ('live','mainnet')),
  provider_event_id TEXT NOT NULL,
  provider_order_id TEXT,
  sku TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK(amount_minor_units > 0),
  currency TEXT NOT NULL CHECK(currency IN ('USD','USDC')),
  settled_at TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  verification_sha256 TEXT NOT NULL CHECK(length(verification_sha256) = 64),
  UNIQUE(provider,environment,provider_event_id)
);
INSERT INTO customer_payment_receipts_v2 SELECT * FROM customer_payment_receipts;

CREATE TABLE customer_entitlement_grants_v2 (
  grant_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receipt_id TEXT NOT NULL REFERENCES customer_payment_receipts_v2(receipt_id) ON DELETE RESTRICT,
  tier TEXT NOT NULL CHECK(tier IN ('starter_dev','pro_analyst','business_pilot','credits_100','credits_500','credits_1500',
    'risk_gate_pack_small','risk_gate_pack_standard','risk_gate_pack_best')),
  contract_version TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(expires_at > starts_at),
  UNIQUE(receipt_id,tier)
);
INSERT INTO customer_entitlement_grants_v2 SELECT * FROM customer_entitlement_grants;

CREATE TABLE credit_ledger_v2 (
  event_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('funding','debit','reversal')),
  delta_credits INTEGER NOT NULL CHECK(delta_credits <> 0),
  receipt_id TEXT REFERENCES customer_payment_receipts_v2(receipt_id) ON DELETE RESTRICT,
  request_id TEXT,
  capability TEXT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(
    (event_type='funding' AND delta_credits>0 AND receipt_id IS NOT NULL AND request_id IS NULL)
    OR (event_type='debit' AND delta_credits<0 AND receipt_id IS NULL AND request_id IS NOT NULL)
    OR (event_type='reversal' AND delta_credits<0 AND receipt_id IS NOT NULL AND request_id IS NULL)
  )
);
INSERT INTO credit_ledger_v2 SELECT * FROM credit_ledger;

CREATE TABLE customer_usage_receipts_v2 (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  key_id TEXT NOT NULL REFERENCES api_keys(key_id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES customer_entitlement_grants_v2(grant_id) ON DELETE RESTRICT,
  capability TEXT NOT NULL CHECK(capability IN ('intelligence_query','gri_read','structural_country_digest',
    'structural_corridor_digest','structural_country_profile','structural_corridor_profile','signed_risk_object','risk_gate_bundle')),
  credit_cost INTEGER NOT NULL CHECK(credit_cost>0 AND credit_cost<=15),
  contract_version TEXT NOT NULL CHECK(contract_version='credits-v1.1.0'),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,request_id), CHECK(length(request_id) BETWEEN 8 AND 160),
  CHECK(length(event_id) BETWEEN 16 AND 128)
);
INSERT INTO customer_usage_receipts_v2 SELECT * FROM customer_usage_receipts;

CREATE TABLE customer_store_risk_gate_usage_v2 (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  key_id TEXT NOT NULL REFERENCES api_keys(key_id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES customer_entitlement_grants_v2(grant_id) ON DELETE RESTRICT,
  receipt_id TEXT NOT NULL REFERENCES customer_payment_receipts_v2(receipt_id) ON DELETE RESTRICT,
  tier TEXT NOT NULL CHECK(tier IN ('basic_focused','standard','complex_full')),
  charge_cents INTEGER NOT NULL CHECK(charge_cents IN (15,20,30)),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,request_id), CHECK(length(request_id) BETWEEN 8 AND 160)
);
INSERT INTO customer_store_risk_gate_usage_v2 SELECT * FROM customer_store_risk_gate_usage;

-- The API-key insert trigger references entitlement and credit tables. Drop
-- and restore it around the SQLite table swap so schema validation stays valid.
DROP TRIGGER IF EXISTS trg_customer_keys_funded_only;

DROP TABLE customer_store_risk_gate_usage;
DROP TABLE customer_usage_receipts;
DROP TABLE credit_ledger;
DROP TABLE customer_entitlement_grants;
DROP TABLE customer_payment_receipts;

ALTER TABLE customer_payment_receipts_v2 RENAME TO customer_payment_receipts;
ALTER TABLE customer_entitlement_grants_v2 RENAME TO customer_entitlement_grants;
ALTER TABLE credit_ledger_v2 RENAME TO credit_ledger;
ALTER TABLE customer_usage_receipts_v2 RENAME TO customer_usage_receipts;
ALTER TABLE customer_store_risk_gate_usage_v2 RENAME TO customer_store_risk_gate_usage;

CREATE INDEX idx_customer_receipts_user ON customer_payment_receipts(user_id,settled_at);
CREATE INDEX idx_customer_grants_user_active ON customer_entitlement_grants(user_id,status,expires_at);
CREATE UNIQUE INDEX idx_customer_ledger_funding_once ON credit_ledger(receipt_id) WHERE event_type='funding';
CREATE UNIQUE INDEX idx_customer_ledger_reversal_once ON credit_ledger(receipt_id) WHERE event_type='reversal';
CREATE UNIQUE INDEX idx_customer_ledger_debit_once ON credit_ledger(user_id,request_id) WHERE event_type='debit';
CREATE INDEX idx_customer_ledger_user_time ON credit_ledger(user_id,occurred_at);
CREATE INDEX idx_customer_usage_grant ON customer_usage_receipts(grant_id,occurred_at);
CREATE INDEX idx_store_risk_gate_usage_receipt ON customer_store_risk_gate_usage(receipt_id,occurred_at);

CREATE TRIGGER trg_customer_funding_requires_receipt BEFORE INSERT ON credit_ledger WHEN NEW.event_type='funding'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM customer_payment_receipts r
    JOIN customer_entitlement_grants g ON g.receipt_id=r.receipt_id
    WHERE r.receipt_id=NEW.receipt_id AND r.user_id=NEW.user_id AND g.user_id=NEW.user_id
      AND g.status='active' AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    THEN RAISE(ABORT,'VERIFIED_ACTIVE_PAYMENT_GRANT_REQUIRED') END;
END;
CREATE TRIGGER trg_customer_debit_guard BEFORE INSERT ON credit_ledger WHEN NEW.event_type='debit'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM users u JOIN customer_entitlement_grants g ON g.user_id=u.id
    WHERE u.id=NEW.user_id AND u.status='active' AND g.status='active'
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    THEN RAISE(ABORT,'ACTIVE_PAYMENT_ENTITLEMENT_REQUIRED') END;
  SELECT CASE WHEN (SELECT COALESCE(SUM(delta_credits),0) FROM credit_ledger WHERE user_id=NEW.user_id)+NEW.delta_credits<0
    THEN RAISE(ABORT,'INSUFFICIENT_VERIFIED_CREDITS') END;
  SELECT CASE WHEN NEW.capability IS NULL OR length(NEW.capability)<2 THEN RAISE(ABORT,'CAPABILITY_REQUIRED') END;
END;
CREATE TRIGGER trg_customer_ledger_append_only_update BEFORE UPDATE ON credit_ledger
BEGIN SELECT RAISE(ABORT,'CUSTOMER_LEDGER_APPEND_ONLY'); END;
CREATE TRIGGER trg_customer_ledger_append_only_delete BEFORE DELETE ON credit_ledger
BEGIN SELECT RAISE(ABORT,'CUSTOMER_LEDGER_APPEND_ONLY'); END;
CREATE TRIGGER trg_customer_receipts_immutable_update BEFORE UPDATE ON customer_payment_receipts
BEGIN SELECT RAISE(ABORT,'CUSTOMER_PAYMENT_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER trg_customer_receipts_immutable_delete BEFORE DELETE ON customer_payment_receipts
BEGIN SELECT RAISE(ABORT,'CUSTOMER_PAYMENT_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER trg_customer_keys_funded_only BEFORE INSERT ON api_keys
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id=NEW.user_id AND status='active' AND email_verified_at IS NOT NULL
  ) THEN RAISE(ABORT,'VERIFIED_ACTIVE_CUSTOMER_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customer_entitlement_grants g WHERE g.user_id=NEW.user_id AND g.status='active'
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND NEW.expires_at<=g.expires_at
  ) THEN RAISE(ABORT,'VERIFIED_PAYMENT_ENTITLEMENT_REQUIRED') END;
  SELECT CASE WHEN (SELECT COALESCE(SUM(delta_credits),0) FROM credit_ledger WHERE user_id=NEW.user_id)<=0
    THEN RAISE(ABORT,'POSITIVE_PAID_BALANCE_REQUIRED') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM api_keys WHERE user_id=NEW.user_id AND revoked_at IS NULL
    AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))>=3 THEN RAISE(ABORT,'MAX_THREE_ACTIVE_KEYS') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM api_keys WHERE user_id=NEW.user_id
    AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')) THEN RAISE(ABORT,'KEY_CREATION_COOLDOWN') END;
END;

CREATE TRIGGER trg_customer_usage_validate BEFORE INSERT ON customer_usage_receipts
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.key_id=NEW.key_id AND k.user_id=NEW.user_id AND k.revoked_at IS NULL
      AND k.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM json_each(k.scopes_json) s WHERE s.value=CASE
        WHEN NEW.capability='intelligence_query' THEN 'intelligence:read'
        WHEN NEW.capability LIKE 'structural_%' THEN 'structural:read'
        WHEN NEW.capability='signed_risk_object' THEN 'signed:read'
        WHEN NEW.capability='risk_gate_bundle' THEN 'risk-gate:read' ELSE 'gri:read' END))
    THEN RAISE(ABORT,'CUSTOMER_ACTIVE_SCOPED_KEY_REQUIRED') END;
  SELECT CASE WHEN NEW.credit_cost<>(CASE NEW.capability WHEN 'intelligence_query' THEN 1 WHEN 'gri_read' THEN 1
    WHEN 'structural_country_digest' THEN 3 WHEN 'structural_corridor_digest' THEN 5
    WHEN 'structural_country_profile' THEN 8 WHEN 'structural_corridor_profile' THEN 12
    WHEN 'signed_risk_object' THEN 10 WHEN 'risk_gate_bundle' THEN 15 ELSE -1 END)
    THEN RAISE(ABORT,'CUSTOMER_LOCKED_CAPABILITY_COST_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM customer_entitlement_grants g
    JOIN customer_payment_receipts p ON p.receipt_id=g.receipt_id
    WHERE g.grant_id=NEW.grant_id AND g.user_id=NEW.user_id AND p.user_id=NEW.user_id
      AND g.status='active' AND g.contract_version=NEW.contract_version
      AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND p.verified_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS (SELECT 1 FROM credit_ledger rev WHERE rev.receipt_id=p.receipt_id AND rev.event_type='reversal')
      AND (g.tier='business_pilot' OR g.tier IN ('credits_100','credits_500','credits_1500',
        'risk_gate_pack_small','risk_gate_pack_standard','risk_gate_pack_best')
        OR (g.tier='pro_analyst' AND NEW.capability IN ('intelligence_query','structural_country_digest',
          'structural_corridor_digest','structural_country_profile','structural_corridor_profile'))
        OR (g.tier='starter_dev' AND NEW.capability IN ('intelligence_query','structural_country_digest','structural_country_profile'))))
    THEN RAISE(ABORT,'CUSTOMER_ACTIVE_VERIFIED_GRANT_REQUIRED') END;
  SELECT CASE WHEN (SELECT COALESCE(SUM(CASE WHEN l.event_type IN ('funding','reversal') THEN l.delta_credits ELSE 0 END),0)
    FROM credit_ledger l JOIN customer_entitlement_grants g ON g.receipt_id=l.receipt_id WHERE g.grant_id=NEW.grant_id)
    -(SELECT COALESCE(SUM(x.credit_cost),0) FROM customer_usage_receipts x WHERE x.grant_id=NEW.grant_id)<NEW.credit_cost
    THEN RAISE(ABORT,'CUSTOMER_INSUFFICIENT_GRANT_CREDITS') END;
END;
CREATE TRIGGER trg_customer_usage_to_ledger AFTER INSERT ON customer_usage_receipts
BEGIN
  INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id,request_id,capability,occurred_at)
    VALUES(NEW.event_id,NEW.user_id,'debit',-NEW.credit_cost,NULL,NEW.request_id,NEW.capability,NEW.occurred_at);
END;
CREATE TRIGGER trg_customer_usage_no_direct_debit BEFORE INSERT ON credit_ledger WHEN NEW.event_type='debit'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM customer_usage_receipts x WHERE x.user_id=NEW.user_id
    AND x.event_id=NEW.event_id AND x.request_id=NEW.request_id AND x.capability=NEW.capability
    AND x.credit_cost=-NEW.delta_credits) THEN RAISE(ABORT,'CUSTOMER_USAGE_RECEIPT_REQUIRED') END;
END;
CREATE TRIGGER trg_customer_usage_immutable_update BEFORE UPDATE ON customer_usage_receipts
BEGIN SELECT RAISE(ABORT,'CUSTOMER_USAGE_IMMUTABLE'); END;
CREATE TRIGGER trg_customer_usage_immutable_delete BEFORE DELETE ON customer_usage_receipts
BEGIN SELECT RAISE(ABORT,'CUSTOMER_USAGE_IMMUTABLE'); END;

CREATE TRIGGER trg_store_risk_gate_usage_validate BEFORE INSERT ON customer_store_risk_gate_usage
BEGIN
  SELECT CASE WHEN NEW.charge_cents<>(CASE NEW.tier WHEN 'basic_focused' THEN 15 WHEN 'standard' THEN 20 WHEN 'complex_full' THEN 30 END)
    THEN RAISE(ABORT,'STORE_RISK_GATE_PRICE_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.key_id=NEW.key_id AND k.user_id=NEW.user_id AND k.revoked_at IS NULL
      AND k.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM json_each(k.scopes_json) s WHERE s.value='risk-gate:read'))
    THEN RAISE(ABORT,'STORE_RISK_GATE_ACTIVE_SCOPED_KEY_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM customer_entitlement_grants g
    JOIN customer_payment_receipts p ON p.receipt_id=g.receipt_id WHERE g.grant_id=NEW.grant_id
      AND g.user_id=NEW.user_id AND p.receipt_id=NEW.receipt_id AND p.user_id=NEW.user_id
      AND g.status='active' AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND p.verified_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS(SELECT 1 FROM credit_ledger l WHERE l.receipt_id=p.receipt_id AND l.event_type='reversal'))
    THEN RAISE(ABORT,'STORE_RISK_GATE_VERIFIED_ACTIVE_RECHARGE_REQUIRED') END;
  SELECT CASE WHEN (SELECT p.amount_minor_units-COALESCE((SELECT SUM(x.charge_cents)
    FROM customer_store_risk_gate_usage x WHERE x.receipt_id=p.receipt_id),0)
    FROM customer_payment_receipts p WHERE p.receipt_id=NEW.receipt_id)<NEW.charge_cents
    THEN RAISE(ABORT,'STORE_RISK_GATE_INSUFFICIENT_RECHARGE_BALANCE') END;
END;
CREATE TRIGGER trg_store_risk_gate_usage_immutable_update BEFORE UPDATE ON customer_store_risk_gate_usage
BEGIN SELECT RAISE(ABORT,'STORE_RISK_GATE_USAGE_IMMUTABLE'); END;
CREATE TRIGGER trg_store_risk_gate_usage_immutable_delete BEFORE DELETE ON customer_store_risk_gate_usage
BEGIN SELECT RAISE(ABORT,'STORE_RISK_GATE_USAGE_IMMUTABLE'); END;

CREATE TABLE customer_wallet_addresses (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_address TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,wallet_address),
  CHECK(wallet_address=lower(wallet_address) AND length(wallet_address)=42)
);
CREATE TRIGGER trg_customer_wallet_addresses_immutable_update BEFORE UPDATE ON customer_wallet_addresses
BEGIN SELECT RAISE(ABORT,'CUSTOMER_WALLET_BINDING_IMMUTABLE'); END;
CREATE TRIGGER trg_customer_wallet_addresses_immutable_delete BEFORE DELETE ON customer_wallet_addresses
BEGIN SELECT RAISE(ABORT,'CUSTOMER_WALLET_BINDING_IMMUTABLE'); END;

CREATE TABLE customer_usdc_pack_transfers (
  network TEXT NOT NULL CHECK(network IN ('base','polygon','arc')),
  tx_hash TEXT NOT NULL CHECK(length(tx_hash)=66),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_address TEXT NOT NULL,
  sku TEXT NOT NULL CHECK(sku IN ('risk-gate-small','risk-gate-standard','risk-gate-best')),
  amount_atomic TEXT NOT NULL CHECK(length(amount_atomic)>0 AND amount_atomic NOT GLOB '*[^0-9]*' AND substr(amount_atomic,1,1) BETWEEN '1' AND '9'),
  receipt_id TEXT NOT NULL UNIQUE REFERENCES customer_payment_receipts(receipt_id) ON DELETE RESTRICT,
  block_number TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  PRIMARY KEY(network,tx_hash)
);
CREATE INDEX idx_customer_usdc_pack_transfers_user ON customer_usdc_pack_transfers(user_id,settled_at);
CREATE TRIGGER trg_customer_usdc_pack_transfers_immutable_update BEFORE UPDATE ON customer_usdc_pack_transfers
BEGIN SELECT RAISE(ABORT,'CUSTOMER_USDC_PACK_TRANSFER_IMMUTABLE'); END;
CREATE TRIGGER trg_customer_usdc_pack_transfers_immutable_delete BEFORE DELETE ON customer_usdc_pack_transfers
BEGIN SELECT RAISE(ABORT,'CUSTOMER_USDC_PACK_TRANSFER_IMMUTABLE'); END;
