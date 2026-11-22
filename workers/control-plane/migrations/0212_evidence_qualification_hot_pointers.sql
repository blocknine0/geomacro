-- Evidence qualification v1: additive EXPAND only. No original/new Worker switch,
-- no backfill, no live billing enablement and no raw/private content in D1.
-- Apply only through protected D1 migration pipeline with real quota telemetry.
CREATE TABLE IF NOT EXISTS eqe_pending (
 item_id TEXT PRIMARY KEY NOT NULL CHECK(length(item_id)=64),
 r2_private_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK(status IN ('QUARANTINED','RECOVERING')),
 deficit_codes TEXT NOT NULL CHECK(length(deficit_codes)<=512),
 next_retry_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=20),
 updated_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_eqe_pending_due
 ON eqe_pending(status,next_retry_at,item_id);

CREATE TABLE IF NOT EXISTS eqe_qualified (
 item_id TEXT PRIMARY KEY NOT NULL CHECK(length(item_id)=64),
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 envelope_sha256 TEXT NOT NULL UNIQUE CHECK(length(envelope_sha256)=64),
 envelope_length INTEGER NOT NULL CHECK(envelope_length BETWEEN 128 AND 131072),
 b2_key TEXT NOT NULL UNIQUE CHECK(length(b2_key)<256),
 signature_ref TEXT NOT NULL CHECK(length(signature_ref)<256),
 signing_key_id TEXT NOT NULL CHECK(length(signing_key_id)<=128),
 review_sha256 TEXT NOT NULL CHECK(length(review_sha256)=64),
 claim_sha256 TEXT NOT NULL CHECK(length(claim_sha256)=64),
 simhash TEXT NOT NULL CHECK(length(simhash)=16),
 qualified_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 tags TEXT NOT NULL CHECK(length(tags)<256),
 CHECK(expires_at>qualified_at)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_eqe_qualified_live
 ON eqe_qualified(expires_at,item_id);
CREATE INDEX IF NOT EXISTS idx_eqe_qualified_claim
 ON eqe_qualified(claim_sha256,expires_at);
CREATE INDEX IF NOT EXISTS idx_eqe_qualified_simhash
 ON eqe_qualified(simhash,expires_at);
-- In addition to semantic near-match review, SQLite must atomically block
-- simultaneous different item IDs for one exact independently reviewed event.
CREATE UNIQUE INDEX IF NOT EXISTS ux_eqe_qualified_claim_once
 ON eqe_qualified(claim_sha256);
CREATE INDEX IF NOT EXISTS idx_eqe_qualified_recent
 ON eqe_qualified(qualified_at DESC);

-- The D1 customer ledger remains the ONLY authority for credit debits.
-- This immutable prepare/deliver record freezes one exact verified response,
-- bound to one principal/item/window. Its trigger enters the existing
-- usage-receipt ledger IN THE SAME SQLite transaction (no double debit).
CREATE TABLE IF NOT EXISTS eqe_delivery_receipts (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 item_id TEXT NOT NULL REFERENCES eqe_qualified(item_id) ON DELETE RESTRICT,
 delivery_window TEXT NOT NULL CHECK(length(delivery_window) BETWEEN 8 AND 80),
 idempotency_key TEXT NOT NULL CHECK(length(idempotency_key)=64),
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 160),
 response_sha256 TEXT NOT NULL CHECK(length(response_sha256)=64),
 envelope_sha256 TEXT NOT NULL CHECK(length(envelope_sha256)=64),
 key_id TEXT NOT NULL REFERENCES api_keys(key_id) ON DELETE RESTRICT,
 grant_id TEXT NOT NULL REFERENCES customer_entitlement_grants(grant_id) ON DELETE RESTRICT,
 capability TEXT NOT NULL CHECK(capability IN ('intelligence_query','signed_risk_object')),
 credit_cost INTEGER NOT NULL CHECK(credit_cost IN (1,10)),
 occurred_at TEXT NOT NULL,
 PRIMARY KEY(user_id,idempotency_key),
 UNIQUE(user_id,item_id,delivery_window),
 UNIQUE(user_id,request_id),
 FOREIGN KEY(user_id,request_id) REFERENCES customer_usage_receipts(user_id,request_id)
   DEFERRABLE INITIALLY DEFERRED
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_eqe_delivery_item ON eqe_delivery_receipts(item_id,occurred_at);

CREATE TRIGGER IF NOT EXISTS trg_eqe_delivery_qualified_only
BEFORE INSERT ON eqe_delivery_receipts
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM eqe_qualified e WHERE e.item_id=NEW.item_id
  AND e.envelope_sha256=NEW.envelope_sha256
  AND e.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 ) THEN RAISE(ABORT,'EQE_QUALIFIED_ARCHIVE_POINTER_REQUIRED') END;
 SELECT CASE WHEN NOT (
   (NEW.capability='intelligence_query' AND NEW.credit_cost=1)
    OR (NEW.capability='signed_risk_object' AND NEW.credit_cost=10)
 ) THEN RAISE(ABORT,'EQE_PRICE_INVALID') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_eqe_delivery_debit
AFTER INSERT ON eqe_delivery_receipts
BEGIN
 INSERT INTO customer_usage_receipts
 (user_id,request_id,event_id,key_id,grant_id,capability,credit_cost,contract_version,occurred_at)
 VALUES(NEW.user_id,NEW.request_id,'eqe-'||NEW.idempotency_key,NEW.key_id,NEW.grant_id,
  NEW.capability,NEW.credit_cost,'credits-v1.1.0',NEW.occurred_at);
END;
CREATE TRIGGER IF NOT EXISTS trg_eqe_delivery_immutable_update BEFORE UPDATE ON eqe_delivery_receipts
BEGIN SELECT RAISE(ABORT,'EQE_DELIVERY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_eqe_delivery_immutable_delete BEFORE DELETE ON eqe_delivery_receipts
BEGIN SELECT RAISE(ABORT,'EQE_DELIVERY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_eqe_qualified_immutable_update BEFORE UPDATE ON eqe_qualified
BEGIN SELECT RAISE(ABORT,'EQE_SIGNED_POINTER_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_eqe_qualified_immutable_delete BEFORE DELETE ON eqe_qualified
BEGIN SELECT RAISE(ABORT,'EQE_SIGNED_POINTER_IMMUTABLE'); END;
