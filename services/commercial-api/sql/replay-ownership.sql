-- Additive security upgrade for existing Step 1–2 stores.
BEGIN;
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
COMMIT;
