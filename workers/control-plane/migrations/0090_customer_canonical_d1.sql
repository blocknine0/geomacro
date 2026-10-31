-- Issue #3295: ADDITIVE canonical customer D1 schema (SQLite), no legacy import.
-- Structural preparation ONLY. No live auth/credit runtime cutover or payment enabled.
-- Existing PREDGE, historical data and 14-table private shadow are untouched.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(length(id) >= 16 AND length(id) <= 128),
  CHECK(length(email) >= 3 AND length(email) <= 254)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hmac_sha256 TEXT NOT NULL UNIQUE CHECK(length(token_hmac_sha256) = 64),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  CHECK(length(id) >= 16 AND length(id) <= 128)
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_user_expiry
  ON sessions(user_id,expires_at);

-- Every positive allocation must be tied to an independently verified provider
-- event. No free/registration/migration credit minting exists in this schema.
CREATE TABLE IF NOT EXISTS customer_payment_receipts (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK(provider IN ('paypal','base_usdc','polygon_usdc')),
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
CREATE INDEX IF NOT EXISTS idx_customer_receipts_user
  ON customer_payment_receipts(user_id,settled_at);
CREATE TABLE IF NOT EXISTS customer_entitlement_grants (
  grant_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receipt_id TEXT NOT NULL REFERENCES customer_payment_receipts(receipt_id) ON DELETE RESTRICT,
  tier TEXT NOT NULL CHECK(tier IN ('starter_dev','pro_analyst','business_pilot','credits_100','credits_500','credits_1500')),
  contract_version TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(expires_at > starts_at),
  UNIQUE(receipt_id,tier)
);
CREATE INDEX IF NOT EXISTS idx_customer_grants_user_active
  ON customer_entitlement_grants(user_id,status,expires_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  event_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('funding','debit','reversal')),
  delta_credits INTEGER NOT NULL CHECK(delta_credits <> 0),
  receipt_id TEXT REFERENCES customer_payment_receipts(receipt_id) ON DELETE RESTRICT,
  request_id TEXT,
  capability TEXT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(
    (event_type='funding' AND delta_credits>0 AND receipt_id IS NOT NULL AND request_id IS NULL)
    OR (event_type='debit' AND delta_credits<0 AND receipt_id IS NULL AND request_id IS NOT NULL)
    OR (event_type='reversal' AND delta_credits<0 AND receipt_id IS NOT NULL AND request_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_ledger_funding_once
  ON credit_ledger(receipt_id) WHERE event_type='funding';
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_ledger_reversal_once
  ON credit_ledger(receipt_id) WHERE event_type='reversal';
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_ledger_debit_once
  ON credit_ledger(user_id,request_id) WHERE event_type='debit';
CREATE INDEX IF NOT EXISTS idx_customer_ledger_user_time
  ON credit_ledger(user_id,occurred_at);

CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  hmac_sha256 TEXT NOT NULL UNIQUE CHECK(length(hmac_sha256) = 64),
  scopes_json TEXT NOT NULL DEFAULT '["intelligence:read"]' CHECK(json_valid(scopes_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  CHECK(length(key_id) >= 16 AND length(key_id) <= 128)
);
CREATE INDEX IF NOT EXISTS idx_customer_api_keys_owner_active
  ON api_keys(user_id,revoked_at,expires_at);

-- A no-funds canary proves that THIS D1 database is writable without touching
-- customer, session, API key, entitlement, or credit/payment records.
CREATE TABLE IF NOT EXISTS customer_d1_integrity_probe (
  probe_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
