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


-- Replay/isolation fences. These replacements preserve existing Base contracts.
CREATE OR REPLACE FUNCTION geomacro.prepare(p_key_hash text,p_request uuid,p_request_hash text,p_subject text,p_requested geomacro.tier,p_available geomacro.tier[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k geomacro.api_keys; u geomacro.users; q geomacro.prices; v geomacro.usage_logs; a geomacro.audit_receipts;
BEGIN
 SELECT * INTO STRICT k FROM geomacro.api_keys WHERE key_hash=p_key_hash;
 SELECT * INTO STRICT u FROM geomacro.users WHERE id=k.user_id FOR UPDATE;
 -- Re-read after lock: revocation uses same lock order.
 SELECT * INTO STRICT k FROM geomacro.api_keys WHERE id=k.id;
 -- Serialize the global request ID with the accountless rail before either
 -- rail can claim it. No ingestion/backlog queue participates in this lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('geomacro-commercial-request:'||p_request::text,0));
 IF to_regclass('geomacro.x402_intents') IS NOT NULL THEN
  IF EXISTS(SELECT FROM geomacro.x402_intents WHERE request_id=p_request)
  THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 END IF;
 IF EXISTS(SELECT FROM geomacro.polygon_x402_intents WHERE request_id=p_request)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 IF u.status<>'active' OR k.revoked_at IS NOT NULL OR k.expires_at<=clock_timestamp()
 OR NOT ('risk-gate:read'=ANY(k.scopes)) THEN RAISE EXCEPTION 'KEY_UNAVAILABLE'; END IF;
 SELECT * INTO v FROM geomacro.usage_logs WHERE request_id=p_request;
 IF FOUND THEN
  IF v.user_id IS DISTINCT FROM u.id OR v.api_key_id IS DISTINCT FROM k.id OR v.request_hash<>p_request_hash
   OR v.subject<>p_subject OR v.requested_tier<>p_requested THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF v.state<>'succeeded' THEN RAISE EXCEPTION 'REQUEST_NOT_REPLAYABLE'; END IF;
  SELECT * INTO STRICT a FROM geomacro.audit_receipts WHERE request_id=p_request;
  RETURN jsonb_build_object('replay',true,'canonical_payload',a.canonical_payload,
   'audit_receipt',jsonb_build_object('signature',a.signature,'public_key_id',a.public_key_id,
   'timestamp',(a.canonical_payload::jsonb)->>'generated_at','hash',a.response_hash));
 END IF;
 q:=geomacro.quote(p_requested,p_available);
 IF u.balance_units<q.credit_units THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;
 RETURN jsonb_build_object('replay',false,'user_id',u.id,'api_key_id',k.id,
  'billed_tier',q.tier,'credit_units',q.credit_units,'usd_micros',q.usd_micros);
END $$;


CREATE OR REPLACE FUNCTION geomacro.record_failure(p_key_hash text,p_request uuid,p_request_hash text,p_subject text,
 p_requested geomacro.tier,p_http integer,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k geomacro.api_keys; v geomacro.usage_logs;
BEGIN
 IF p_http IS NULL OR p_http<400 OR p_http>599 OR p_error IS NULL THEN RAISE EXCEPTION 'INVALID_FAILURE'; END IF;
 SELECT * INTO STRICT k FROM geomacro.api_keys WHERE key_hash=p_key_hash;
 PERFORM 1 FROM geomacro.users WHERE id=k.user_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('geomacro-commercial-request:'||p_request::text,0));
 IF EXISTS(SELECT FROM geomacro.x402_intents WHERE request_id=p_request) OR
   EXISTS(SELECT FROM geomacro.polygon_x402_intents WHERE request_id=p_request)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 SELECT * INTO v FROM geomacro.usage_logs WHERE request_id=p_request;
 IF FOUND THEN
  IF v.user_id IS DISTINCT FROM k.user_id OR v.api_key_id IS DISTINCT FROM k.id OR v.request_hash<>p_request_hash
   OR v.subject<>p_subject OR v.requested_tier<>p_requested THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF v.state<>'failed' THEN RAISE EXCEPTION 'ALREADY_SETTLED_USE_REFUND'; END IF;
  RETURN;
 END IF;
 INSERT INTO geomacro.usage_logs(request_id,user_id,api_key_id,request_hash,subject,requested_tier,rail,state,http_status,error_code)
 VALUES(p_request,k.user_id,k.id,p_request_hash,p_subject,p_requested,'credits','failed',p_http,p_error);
END $$;


CREATE OR REPLACE FUNCTION geomacro.x402_prepare(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.x402_intents; q geomacro.prices; b jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('geomacro-commercial-request:'||(p->>'request_id'),0));
 IF EXISTS(SELECT FROM geomacro.polygon_x402_intents
  WHERE request_id=(p->>'request_id')::uuid) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 IF EXISTS(SELECT FROM geomacro.usage_logs WHERE request_id=(p->>'request_id')::uuid
  AND rail<>'base_usdc') THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 b:=(p->>'canonical_payload')::jsonb;
 SELECT * INTO STRICT q FROM geomacro.prices WHERE tier=(p->>'billed_tier')::geomacro.tier;
 IF q.usd_micros<>(p->>'amount_atomic')::bigint OR
 b->>'request_id' IS DISTINCT FROM p->>'request_id' OR b->>'subject' IS DISTINCT FROM p->>'subject' OR
 b->>'requested_tier' IS DISTINCT FROM p->>'requested_tier' OR b->>'billed_tier' IS DISTINCT FROM p->>'billed_tier' OR
 b->'execution_authorized' IS DISTINCT FROM 'false'::jsonb OR b->'credits_deducted' IS DISTINCT FROM '0'::jsonb OR
 b->>'payment_amount_atomic' IS DISTINCT FROM p->>'amount_atomic' OR b->>'payment_rail' IS DISTINCT FROM 'base_usdc' OR
 b->>'payer' IS DISTINCT FROM p->>'payer_address' OR b->>'payee' IS DISTINCT FROM p->>'payee_address' OR
 b->>'payment_nonce' IS DISTINCT FROM p->>'nonce' OR b->>'public_key_id' IS DISTINCT FROM p->>'public_key_id'
 THEN RAISE EXCEPTION 'INVALID_X402_PAYLOAD'; END IF;
 IF q.priority>(SELECT priority FROM geomacro.prices WHERE tier=(p->>'requested_tier')::geomacro.tier)
 THEN RAISE EXCEPTION 'INVALID_TIER_UPGRADE'; END IF;
 INSERT INTO geomacro.x402_intents(request_id,request_hash,subject,requested_tier,billed_tier,amount_atomic,
 payer_address,payee_address,nonce,payment_hash,payment_payload,canonical_payload,signature,public_key_id,scan_from_block)
 VALUES((p->>'request_id')::uuid,p->>'request_hash',p->>'subject',(p->>'requested_tier')::geomacro.tier,
 (p->>'billed_tier')::geomacro.tier,(p->>'amount_atomic')::bigint,p->>'payer_address',p->>'payee_address',p->>'nonce',
 p->>'payment_hash',p->'payment_payload',p->>'canonical_payload',p->>'signature',p->>'public_key_id',(p->>'scan_from_block')::bigint)
 ON CONFLICT(request_id) DO NOTHING;
 SELECT * INTO STRICT v FROM geomacro.x402_intents WHERE request_id=(p->>'request_id')::uuid;
 IF v.request_hash<>p->>'request_hash' OR v.payment_hash<>p->>'payment_hash' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN to_jsonb(v);
END $$;

-- Production private PostgREST gateway: new Polygon function names only.
CREATE OR REPLACE FUNCTION public.geomacro_commercial_rpc(p_operation text,p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_args) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'RPC_ARGUMENTS_INVALID'; END IF;
 CASE p_operation
  WHEN 'health' THEN RETURN jsonb_build_object('schema','geomacro.commercial-postgres.v1','ready',true);
  WHEN 'provision_user' THEN
   IF jsonb_array_length(p_args)<>2 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.provision_user((p_args->>0)::uuid,(p_args->>1)::text));
  WHEN 'create_api_key' THEN
   IF jsonb_array_length(p_args)<>4 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.create_api_key((p_args->>0)::uuid,(p_args->>1)::text,(p_args->>2)::text,(p_args->>3)::text));
  WHEN 'revoke_api_key' THEN
   IF jsonb_array_length(p_args)<>2 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   PERFORM geomacro.revoke_api_key((p_args->>0)::uuid,(p_args->>1)::uuid); RETURN 'null'::jsonb;
  WHEN 'quote' THEN
   IF jsonb_array_length(p_args)<>2 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.quote((p_args->>0)::geomacro.tier,ARRAY(SELECT jsonb_array_elements_text(p_args->1))::geomacro.tier[]));
  WHEN 'prepare' THEN
   IF jsonb_array_length(p_args)<>6 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.prepare((p_args->>0)::text,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::geomacro.tier,ARRAY(SELECT jsonb_array_elements_text(p_args->5))::geomacro.tier[]));
  WHEN 'settle_success' THEN
   IF jsonb_array_length(p_args)<>10 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.settle_success((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::uuid,(p_args->>3)::text,(p_args->>4)::text,(p_args->>5)::geomacro.tier,ARRAY(SELECT jsonb_array_elements_text(p_args->6))::geomacro.tier[],(p_args->>7)::text,(p_args->>8)::text,(p_args->>9)::text));
  WHEN 'refund_usage' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   PERFORM geomacro.refund_usage((p_args->>0)::uuid); RETURN 'null'::jsonb;
  WHEN 'record_failure' THEN
   IF jsonb_array_length(p_args)<>7 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   PERFORM geomacro.record_failure((p_args->>0)::text,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::geomacro.tier,(p_args->>5)::integer,(p_args->>6)::text); RETURN 'null'::jsonb;
  WHEN 'paypal_begin' THEN
   IF jsonb_array_length(p_args)<>7 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.paypal_begin((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::integer,(p_args->>5)::bigint,(p_args->>6)::text));
  WHEN 'paypal_link' THEN
   IF jsonb_array_length(p_args)<>4 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.paypal_link((p_args->>0)::uuid,(p_args->>1)::text,(p_args->>2)::text,(p_args->>3)::text));
  WHEN 'paypal_get' THEN
   IF jsonb_array_length(p_args)<>2 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.paypal_get((p_args->>0)::text,(p_args->>1)::uuid));
  WHEN 'paypal_apply' THEN
   IF jsonb_array_length(p_args)<>7 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   PERFORM geomacro.paypal_apply((p_args->>0)::uuid,(p_args->>1)::text,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::text,(p_args->>5)::text,(p_args->>6)::text); RETURN 'null'::jsonb;
  WHEN 'x402_get' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.x402_get((p_args->>0)::uuid));
  WHEN 'x402_prepare' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.x402_prepare((p_args->>0)::jsonb));
  WHEN 'x402_claim' THEN
   IF jsonb_array_length(p_args)<>2 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.x402_claim((p_args->>0)::uuid,(p_args->>1)::uuid));
  WHEN 'x402_note_tx' THEN
   IF jsonb_array_length(p_args)<>3 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   PERFORM geomacro.x402_note_tx((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::text); RETURN 'null'::jsonb;
  WHEN 'x402_confirm' THEN
   IF jsonb_array_length(p_args)<>4 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.x402_confirm((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::integer));
  WHEN 'x402_pending' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM geomacro.x402_pending((p_args->>0)::integer) x);
  WHEN 'polygon_x402_get' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.polygon_x402_get((p_args->>0)::uuid));
  WHEN 'polygon_x402_prepare' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.polygon_x402_prepare((p_args->>0)::jsonb));
  WHEN 'polygon_x402_claim' THEN
   IF jsonb_array_length(p_args)<>2 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.polygon_x402_claim((p_args->>0)::uuid,(p_args->>1)::uuid));
  WHEN 'polygon_x402_note_tx' THEN
   IF jsonb_array_length(p_args)<>3 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   PERFORM geomacro.polygon_x402_note_tx((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::text); RETURN 'null'::jsonb;
  WHEN 'polygon_x402_confirm' THEN
   IF jsonb_array_length(p_args)<>4 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.polygon_x402_confirm((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::integer));
  WHEN 'polygon_x402_pending' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM geomacro.polygon_x402_pending((p_args->>0)::integer) x);
  WHEN 'authorize_credit_key' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.authorize_credit_key((p_args->>0)::text));
  WHEN 'prune_rate_windows' THEN
   IF jsonb_array_length(p_args)<>0 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.prune_rate_windows());
  WHEN 'credit_replay' THEN
   IF jsonb_array_length(p_args)<>5 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.credit_replay((p_args->>0)::text,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::geomacro.tier));
  WHEN 'list_api_keys' THEN
   IF jsonb_array_length(p_args)<>1 THEN RAISE EXCEPTION 'RPC_ARITY_INVALID'; END IF;
   RETURN to_jsonb(geomacro.list_api_keys((p_args->>0)::uuid));
  ELSE RAISE EXCEPTION 'RPC_OPERATION_NOT_ALLOWED';
 END CASE;
END $$;

REVOKE ALL ON FUNCTION public.geomacro_commercial_rpc(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.geomacro_commercial_rpc(text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
