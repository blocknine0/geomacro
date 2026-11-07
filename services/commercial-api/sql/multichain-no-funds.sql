-- Additive, reversible-if-empty NO-FUNDS multichain reservation proof.
-- This does not modify x402_intents, web3_txs, usage_logs, payments, or RPC exposure.
-- It is deliberately impossible to settle payments through this relation.
BEGIN;

CREATE TABLE IF NOT EXISTS geomacro.x402_chain_no_funds_proofs (
 request_id uuid PRIMARY KEY,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 subject text NOT NULL CHECK(length(subject) BETWEEN 2 AND 128),
 billed_tier geomacro.tier NOT NULL,
 chain_id bigint NOT NULL CHECK(chain_id IN (8453,137)),
 network text NOT NULL,
 token_address text NOT NULL CHECK(token_address ~ '^0x[0-9a-f]{40}$'),
 facilitator text NOT NULL CHECK(facilitator IN ('xpay','dexter')),
 payment_rail text NOT NULL CHECK(payment_rail IN ('base_usdc','polygon_usdc')),
 payer_address text NOT NULL CHECK(payer_address ~ '^0x[0-9a-f]{40}$'),
 payee_address text NOT NULL
  CHECK(payee_address='0x95ba71d21c41bda8bba9533f96d25f793e4137b5'),
 authorization_nonce text NOT NULL CHECK(authorization_nonce ~ '^0x[0-9a-f]{64}$'),
 amount_atomic bigint NOT NULL CHECK(amount_atomic IN (100000,150000,250000)),
 quote_sha256 text NOT NULL CHECK(quote_sha256 ~ '^[0-9a-f]{64}$'),
 -- These hashes are provenance references, NOT proof that the input is true.
 evidence_receipt_sha256 text NOT NULL CHECK(evidence_receipt_sha256 ~ '^[0-9a-f]{64}$'),
 canonical_delivery_sha256 text NOT NULL CHECK(canonical_delivery_sha256 ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 proof_state text NOT NULL DEFAULT 'NO_FUNDS_ONLY'
  CHECK(proof_state='NO_FUNDS_ONLY'),
 UNIQUE(chain_id,token_address,payer_address,authorization_nonce),
 CONSTRAINT x402_chain_proof_route_lock CHECK (
   (chain_id=8453 AND network='eip155:8453'
    AND token_address='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    AND facilitator='xpay' AND payment_rail='base_usdc')
  OR
   (chain_id=137 AND network='eip155:137'
    AND token_address='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
    AND facilitator='dexter' AND payment_rail='polygon_usdc')),
 CONSTRAINT x402_chain_proof_window CHECK (
    expires_at>issued_at AND expires_at<=issued_at+interval '3 hours'),
 CONSTRAINT x402_chain_proof_amount_tier CHECK (
    (billed_tier='basic' AND amount_atomic=100000) OR
    (billed_tier='standard' AND amount_atomic=150000) OR
    (billed_tier='complex' AND amount_atomic=250000))
);
-- Never allow an already-recorded proof to be edited into a "confirmed" receipt.
DROP TRIGGER IF EXISTS x402_chain_no_funds_immutable
 ON geomacro.x402_chain_no_funds_proofs;
CREATE TRIGGER x402_chain_no_funds_immutable BEFORE UPDATE OR DELETE
 ON geomacro.x402_chain_no_funds_proofs
 FOR EACH ROW EXECUTE FUNCTION geomacro.immutable_record();

ALTER TABLE geomacro.x402_chain_no_funds_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON geomacro.x402_chain_no_funds_proofs
 FROM PUBLIC,anon,authenticated,service_role,geomacro_billing;
-- No public functions, GRANTs or PostgREST route.
-- Owner-only no-funds proof table: no signature bytes, no payment payload.
COMMIT;
