-- Phase 1: production-safe, additive Polygon x402-v2 merchant rail preparation.
-- Payment remains disabled by the deployer's immutable no-funds gate.
-- Existing Base x402_intents and historical receipts remain unchanged.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

-- Keep historical Base records valid; constrain new Polygon records to the
-- correct native USDC token rather than accepting Polygon bridged USDC.
ALTER TABLE geomacro.usage_logs DROP CONSTRAINT usage_logs_rail_check;
ALTER TABLE geomacro.usage_logs ADD CONSTRAINT usage_logs_rail_check
 CHECK(rail IN ('credits','base_usdc','polygon_usdc'));

ALTER TABLE geomacro.web3_txs DROP CONSTRAINT web3_txs_chain_id_check;
ALTER TABLE geomacro.web3_txs ADD CONSTRAINT web3_txs_chain_id_check
 CHECK(chain_id IN (8453,137));
ALTER TABLE geomacro.web3_txs ADD CONSTRAINT web3_txs_chain_token_lock
 CHECK((chain_id=8453 AND token_address='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
   OR (chain_id=137 AND token_address='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'));

CREATE TABLE geomacro.polygon_x402_intents (
 request_id uuid PRIMARY KEY,
 request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),
 subject text NOT NULL CHECK(length(subject) BETWEEN 2 AND 128),
 requested_tier geomacro.tier NOT NULL,
 billed_tier geomacro.tier NOT NULL,
 amount_atomic bigint NOT NULL CHECK(amount_atomic IN (100000,150000,250000)),
 chain_id bigint NOT NULL DEFAULT 137 CHECK(chain_id=137),
 network text NOT NULL DEFAULT 'eip155:137' CHECK(network='eip155:137'),
 token_address text NOT NULL DEFAULT '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
  CHECK(token_address='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'),
 facilitator text NOT NULL DEFAULT 'dexter' CHECK(facilitator='dexter'),
 payer_address text NOT NULL CHECK(payer_address~'^0x[0-9a-f]{40}$'),
 payee_address text NOT NULL CHECK(payee_address='0x95ba71d21c41bda8bba9533f96d25f793e4137b5'),
 nonce text NOT NULL CHECK(nonce~'^0x[0-9a-f]{64}$'),
 payment_hash text NOT NULL CHECK(payment_hash~'^[0-9a-f]{64}$'),
 payment_payload jsonb NOT NULL,
 canonical_payload text NOT NULL,
 signature text NOT NULL CHECK(length(signature)>0),
 public_key_id text NOT NULL CHECK(length(public_key_id)>0),
 evidence_receipt_hash text NOT NULL CHECK(evidence_receipt_hash~'^[0-9a-f]{64}$'),
 scan_from_block bigint NOT NULL CHECK(scan_from_block>=0),
 verdict_issued_at timestamptz NOT NULL,
 verdict_expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'prepared'
  CHECK(state IN ('prepared','settling','submitted','confirmed')),
 tx_hash text CHECK(tx_hash~'^0x[0-9a-f]{64}$'),
 log_index integer CHECK(log_index>=0),
 lease_token uuid,lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(chain_id,token_address,payer_address,nonce),
 UNIQUE(chain_id,tx_hash,log_index),
 CONSTRAINT polygon_x402_validity CHECK(
  verdict_expires_at>verdict_issued_at AND
  verdict_expires_at<=verdict_issued_at+interval '3 hours'),
 CONSTRAINT polygon_x402_price_tier CHECK (
  (billed_tier='basic' AND amount_atomic=100000) OR
  (billed_tier='standard' AND amount_atomic=150000) OR
  (billed_tier='complex' AND amount_atomic=250000))
);
CREATE INDEX polygon_x402_pending_idx ON geomacro.polygon_x402_intents(updated_at)
 WHERE state<>'confirmed';
ALTER TABLE geomacro.polygon_x402_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON geomacro.polygon_x402_intents FROM PUBLIC,anon,authenticated,service_role,geomacro_billing;

CREATE FUNCTION geomacro.polygon_x402_identity_locked() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (to_jsonb(NEW)-'state'-'tx_hash'-'log_index'-'lease_token'-'lease_until'-'updated_at')
    IS DISTINCT FROM
    (to_jsonb(OLD)-'state'-'tx_hash'-'log_index'-'lease_token'-'lease_until'-'updated_at')
 THEN RAISE EXCEPTION 'POLYGON_INTENT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER polygon_x402_identity_immutable BEFORE UPDATE ON geomacro.polygon_x402_intents
 FOR EACH ROW EXECUTE FUNCTION geomacro.polygon_x402_identity_locked();

CREATE FUNCTION geomacro.polygon_x402_get(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(i) FROM geomacro.polygon_x402_intents i WHERE request_id=p_id
$$;

CREATE FUNCTION geomacro.polygon_x402_prepare(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.polygon_x402_intents; q geomacro.prices; b jsonb; a jsonb; auth jsonb;
BEGIN
 IF (p->>'request_id') IS NULL OR (p->>'canonical_payload') IS NULL
 THEN RAISE EXCEPTION 'POLYGON_INVALID_PREPARE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('geomacro-commercial-request:'||(p->>'request_id'),0));
 IF EXISTS(SELECT 1 FROM geomacro.x402_intents WHERE request_id=(p->>'request_id')::uuid)
   OR EXISTS(SELECT 1 FROM geomacro.usage_logs WHERE request_id=(p->>'request_id')::uuid)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 b:=(p->>'canonical_payload')::jsonb;
 a:=p->'payment_payload'->'accepted';
 auth:=p->'payment_payload'->'payload'->'authorization';
 SELECT * INTO STRICT q FROM geomacro.prices WHERE tier=(p->>'billed_tier')::geomacro.tier;
 IF q.usd_micros<>(p->>'amount_atomic')::bigint OR
  p->>'network' IS DISTINCT FROM 'eip155:137' OR
  p->>'token_address' IS DISTINCT FROM '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' OR
  p->>'facilitator' IS DISTINCT FROM 'dexter' OR
  p->>'payee_address' IS DISTINCT FROM '0x95ba71d21c41bda8bba9533f96d25f793e4137b5' OR
  p->>'payer_address' IS DISTINCT FROM lower(p->>'payer_address') OR
  b->>'request_id' IS DISTINCT FROM p->>'request_id' OR
  b->>'subject' IS DISTINCT FROM p->>'subject' OR
  b->>'requested_tier' IS DISTINCT FROM p->>'requested_tier' OR
  b->>'billed_tier' IS DISTINCT FROM p->>'billed_tier' OR
  b->>'payment_rail' IS DISTINCT FROM 'polygon_usdc' OR
  b->>'payment_amount_atomic' IS DISTINCT FROM p->>'amount_atomic' OR
  b->>'payment_network' IS DISTINCT FROM 'eip155:137' OR
  b->>'payment_facilitator' IS DISTINCT FROM 'dexter' OR
  b->>'payment_token_address' IS DISTINCT FROM '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' OR
  b->>'payer' IS DISTINCT FROM p->>'payer_address' OR
  b->>'payee' IS DISTINCT FROM p->>'payee_address' OR
  b->>'payment_nonce' IS DISTINCT FROM p->>'nonce' OR
  b->>'public_key_id' IS DISTINCT FROM p->>'public_key_id' OR
  b->'execution_authorized' IS DISTINCT FROM 'false'::jsonb OR
  b->'credits_deducted' IS DISTINCT FROM '0'::jsonb OR
  b->'metadata'->>'evidence_receipt_hash' IS DISTINCT FROM p->>'evidence_receipt_hash' OR
  (p->>'evidence_receipt_hash') !~ '^[0-9a-f]{64}$' OR
  (p->>'verdict_issued_at')::timestamptz IS DISTINCT FROM (b->>'generated_at')::timestamptz OR
  (p->>'verdict_expires_at')::timestamptz IS DISTINCT FROM (b->>'verdict_expires_at')::timestamptz OR
  (p->>'verdict_expires_at')::timestamptz<=clock_timestamp() OR
  a->>'scheme' IS DISTINCT FROM 'exact' OR
  a->>'network' IS DISTINCT FROM 'eip155:137' OR
  lower(a->>'asset') IS DISTINCT FROM '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' OR
  lower(a->>'payTo') IS DISTINCT FROM p->>'payee_address' OR
  a->>'amount' IS DISTINCT FROM p->>'amount_atomic' OR
  a->>'maxTimeoutSeconds' IS DISTINCT FROM '120' OR
  p->'payment_payload'->>'x402Version' IS DISTINCT FROM '2' OR
  lower(auth->>'from') IS DISTINCT FROM p->>'payer_address' OR
  lower(auth->>'to') IS DISTINCT FROM p->>'payee_address' OR
  lower(auth->>'nonce') IS DISTINCT FROM p->>'nonce' OR
  auth->>'value' IS DISTINCT FROM p->>'amount_atomic'
 THEN RAISE EXCEPTION 'POLYGON_INVALID_PREPARE'; END IF;
 IF q.priority>(SELECT priority FROM geomacro.prices WHERE tier=(p->>'requested_tier')::geomacro.tier)
 THEN RAISE EXCEPTION 'INVALID_TIER_UPGRADE'; END IF;
 INSERT INTO geomacro.polygon_x402_intents
 (request_id,request_hash,subject,requested_tier,billed_tier,amount_atomic,payer_address,
  payee_address,nonce,payment_hash,payment_payload,canonical_payload,signature,public_key_id,
  evidence_receipt_hash,scan_from_block,verdict_issued_at,verdict_expires_at)
 VALUES
 ((p->>'request_id')::uuid,p->>'request_hash',p->>'subject',
  (p->>'requested_tier')::geomacro.tier,(p->>'billed_tier')::geomacro.tier,
  (p->>'amount_atomic')::bigint,p->>'payer_address',p->>'payee_address',p->>'nonce',
  p->>'payment_hash',p->'payment_payload',p->>'canonical_payload',p->>'signature',
  p->>'public_key_id',p->>'evidence_receipt_hash',(p->>'scan_from_block')::bigint,
  (p->>'verdict_issued_at')::timestamptz,(p->>'verdict_expires_at')::timestamptz)
 ON CONFLICT(request_id) DO NOTHING;
 SELECT * INTO STRICT v FROM geomacro.polygon_x402_intents WHERE request_id=(p->>'request_id')::uuid;
 IF v.request_hash<>p->>'request_hash' OR v.payment_hash<>p->>'payment_hash'
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN to_jsonb(v);
END $$;

CREATE FUNCTION geomacro.polygon_x402_claim(p_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.polygon_x402_intents;
BEGIN
 SELECT * INTO STRICT v FROM geomacro.polygon_x402_intents WHERE request_id=p_id FOR UPDATE;
 IF v.state='confirmed' THEN RETURN to_jsonb(v); END IF;
 IF v.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'PAYMENT_PROCESSING'; END IF;
 UPDATE geomacro.polygon_x402_intents SET lease_token=p_token,
  lease_until=clock_timestamp()+interval '90 seconds',
  state=CASE WHEN state='prepared' THEN 'settling' ELSE state END,
  updated_at=clock_timestamp()
 WHERE request_id=p_id RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;

CREATE FUNCTION geomacro.polygon_x402_note_tx(p_id uuid,p_token uuid,p_tx text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_tx !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'TX_HASH_INVALID'; END IF;
 UPDATE geomacro.polygon_x402_intents SET tx_hash=p_tx,state='submitted',updated_at=clock_timestamp()
 WHERE request_id=p_id AND lease_token=p_token AND state<>'confirmed'
 AND (tx_hash IS NULL OR tx_hash=p_tx);
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_LEASE_LOST'; END IF;
END $$;

CREATE FUNCTION geomacro.polygon_x402_confirm(p_id uuid,p_token uuid,p_tx text,p_log integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.polygon_x402_intents; b jsonb;
BEGIN
 IF p_tx !~ '^0x[0-9a-f]{64}$' OR p_log IS NULL OR p_log<0
 THEN RAISE EXCEPTION 'POLYGON_TX_PROOF_INVALID'; END IF;
 SELECT * INTO STRICT v FROM geomacro.polygon_x402_intents WHERE request_id=p_id FOR UPDATE;
 IF v.state='confirmed' THEN
  IF v.tx_hash<>p_tx OR v.log_index<>p_log THEN RAISE EXCEPTION 'TX_RECEIPT_CONFLICT'; END IF;
  RETURN to_jsonb(v);
 END IF;
 IF v.lease_token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'PAYMENT_LEASE_LOST'; END IF;
 IF v.tx_hash IS NOT NULL AND v.tx_hash<>p_tx THEN RAISE EXCEPTION 'TX_HASH_CONFLICT'; END IF;
 b:=v.canonical_payload::jsonb;
 INSERT INTO geomacro.usage_logs
  (request_id,request_hash,subject,requested_tier,billed_tier,rail,state,http_status,usd_micros)
 VALUES(v.request_id,v.request_hash,v.subject,v.requested_tier,v.billed_tier,
  'polygon_usdc','succeeded',200,v.amount_atomic);
 INSERT INTO geomacro.audit_receipts
  (request_id,canonical_payload,response_hash,signature,public_key_id,signed_at)
 VALUES(v.request_id,v.canonical_payload,
  encode(sha256(convert_to(v.canonical_payload,'UTF8')),'hex'),
  v.signature,v.public_key_id,v.verdict_issued_at);
 INSERT INTO geomacro.web3_txs
  (request_id,chain_id,token_address,payer_address,payee_address,authorization_nonce,
   amount_atomic,tx_hash,log_index,state,verified_at,settled_at)
 VALUES(v.request_id,137,'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
   v.payer_address,v.payee_address,v.nonce,v.amount_atomic,p_tx,p_log,
   'settled',clock_timestamp(),clock_timestamp());
 UPDATE geomacro.polygon_x402_intents
  SET state='confirmed',tx_hash=p_tx,log_index=p_log,lease_token=NULL,lease_until=NULL,
   updated_at=clock_timestamp()
 WHERE request_id=p_id RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;

CREATE FUNCTION geomacro.polygon_x402_pending(p_limit integer DEFAULT 100)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(i) FROM geomacro.polygon_x402_intents i
 WHERE state<>'confirmed' AND (lease_until IS NULL OR lease_until<=clock_timestamp())
 ORDER BY updated_at LIMIT least(greatest(p_limit,1),100)
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM PUBLIC;
GRANT EXECUTE ON FUNCTION geomacro.polygon_x402_get(uuid),
 geomacro.polygon_x402_prepare(jsonb),geomacro.polygon_x402_claim(uuid,uuid),
 geomacro.polygon_x402_note_tx(uuid,uuid,text),
 geomacro.polygon_x402_confirm(uuid,uuid,text,integer),
 geomacro.polygon_x402_pending(integer)
 TO geomacro_billing;

COMMIT;
