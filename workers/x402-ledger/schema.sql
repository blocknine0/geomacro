-- Geomacro Cloudflare D1 x402 delivery ledger
-- Atomic operational state only. Never store raw payment signatures, API keys,
-- authorization payloads, or plaintext wallet addresses.

CREATE TABLE IF NOT EXISTS coinbase_x402_deliveries (
  payment_fingerprint_sha256 TEXT PRIMARY KEY
    CHECK(length(payment_fingerprint_sha256) = 64),
  request_fingerprint_sha256 TEXT NOT NULL
    CHECK(length(request_fingerprint_sha256) = 64),
  client_request_id TEXT,
  environment TEXT NOT NULL CHECK(environment IN ('testnet','mainnet')),
  network TEXT NOT NULL CHECK(network IN ('eip155:84532','eip155:8453')),
  asset TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  pay_to_hash TEXT NOT NULL CHECK(length(pay_to_hash) = 64),
  payer_reference_hash TEXT,
  state TEXT NOT NULL DEFAULT 'processing'
    CHECK(state IN ('processing','prepared','delivered','failed','manual_review')),
  claim_token TEXT,
  lease_expires_at_ms INTEGER,
  response_payload TEXT,
  response_sha256 TEXT,
  settlement_tx TEXT,
  settlement_network TEXT,
  failure_code TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  settled_at_ms INTEGER,
  delivered_at_ms INTEGER,
  CHECK(client_request_id IS NULL OR length(client_request_id) BETWEEN 4 AND 128),
  CHECK(payer_reference_hash IS NULL OR length(payer_reference_hash) = 64),
  CHECK(response_sha256 IS NULL OR length(response_sha256) = 64),
  CHECK(settlement_tx IS NULL OR (length(settlement_tx) = 66 AND substr(settlement_tx,1,2) = '0x'))
);

CREATE UNIQUE INDEX IF NOT EXISTS coinbase_x402_settlement_tx_unique
  ON coinbase_x402_deliveries(network, settlement_tx)
  WHERE settlement_tx IS NOT NULL;

CREATE INDEX IF NOT EXISTS coinbase_x402_delivery_state_time_idx
  ON coinbase_x402_deliveries(state, updated_at_ms DESC);

CREATE INDEX IF NOT EXISTS coinbase_x402_delivery_client_request_idx
  ON coinbase_x402_deliveries(client_request_id, created_at_ms DESC)
  WHERE client_request_id IS NOT NULL;
