-- 0212: additive Hot 50 commercial read-model; does not replace canonical
-- customer funding, grants, credit ledger, API keys or P0B ingestion.
-- Apply only after 0204/0211 protected migrations have genuinely completed.
CREATE TABLE IF NOT EXISTS commercial_hot50_signed_snapshots (
  snapshot_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(snapshot_sha256)=64),
  view_key TEXT NOT NULL CHECK(length(view_key) BETWEEN 5 AND 64),
  signed_json TEXT NOT NULL CHECK(json_valid(signed_json)),
  signature_b64 TEXT NOT NULL CHECK(length(signature_b64) BETWEEN 80 AND 128),
  public_key_id TEXT NOT NULL CHECK(length(public_key_id) BETWEEN 1 AND 120),
  b2_pointer TEXT NOT NULL CHECK(b2_pointer LIKE 'b2://%'),
  b2_sha256 TEXT NOT NULL CHECK(length(b2_sha256)=64),
  verifier_state TEXT NOT NULL CHECK(verifier_state='CRYPTO_AND_B2_READBACK_VERIFIED'),
  verifier_proof_sha256 TEXT NOT NULL CHECK(length(verifier_proof_sha256)=64),
  published_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at>published_at)
);
CREATE INDEX IF NOT EXISTS idx_commercial_hot50_live_view
  ON commercial_hot50_signed_snapshots(view_key,published_at DESC);
-- Delivery is an immutable link to one canonical priced usage event.
-- Two INSERTs (this record and customer_usage_receipts) MUST execute
-- within a single D1 batch, so the existing grant-scoped trigger performs
-- the actual ledger debit and enforces balance and tier authorization.
CREATE TABLE IF NOT EXISTS commercial_hot50_delivery_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  key_id TEXT NOT NULL REFERENCES api_keys(key_id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES customer_entitlement_grants(grant_id) ON DELETE RESTRICT,
  view_key TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL REFERENCES commercial_hot50_signed_snapshots(snapshot_sha256),
  event_id TEXT NOT NULL UNIQUE,
  credit_cost INTEGER NOT NULL CHECK(credit_cost=15),
  contract_version TEXT NOT NULL CHECK(contract_version='credits-v1.1.0'),
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,request_id),
  FOREIGN KEY(user_id,request_id) REFERENCES customer_usage_receipts(user_id,request_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_commercial_hot50_receipt_snapshot
  ON commercial_hot50_delivery_receipts(snapshot_sha256);
CREATE TRIGGER IF NOT EXISTS trg_hot50_signed_snapshot_no_update BEFORE UPDATE
 ON commercial_hot50_signed_snapshots BEGIN
 SELECT RAISE(ABORT,'IMMUTABLE_HOT50_SIGNED_SNAPSHOT'); END;
CREATE TRIGGER IF NOT EXISTS trg_hot50_signed_snapshot_no_delete BEFORE DELETE
 ON commercial_hot50_signed_snapshots BEGIN
 SELECT RAISE(ABORT,'IMMUTABLE_HOT50_SIGNED_SNAPSHOT'); END;
CREATE TRIGGER IF NOT EXISTS trg_hot50_delivery_no_update BEFORE UPDATE
 ON commercial_hot50_delivery_receipts BEGIN
 SELECT RAISE(ABORT,'IMMUTABLE_HOT50_DELIVERY_RECEIPT'); END;
CREATE TRIGGER IF NOT EXISTS trg_hot50_delivery_no_delete BEFORE DELETE
 ON commercial_hot50_delivery_receipts BEGIN
 SELECT RAISE(ABORT,'IMMUTABLE_HOT50_DELIVERY_RECEIPT'); END;
