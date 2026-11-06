BEGIN;
-- All SECURITY DEFINER functions are private backend capabilities, not public RPCs.
-- They are owned by the installation role. Only a trusted backend login receives
-- geomacro_billing membership. Browser/authenticated/anon get no permissions.
CREATE FUNCTION geomacro.provision_user(p_user uuid,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u geomacro.users;
BEGIN
 INSERT INTO geomacro.users(id,email) VALUES(p_user,p_email) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT u FROM geomacro.users WHERE id=p_user FOR UPDATE;
 IF NOT EXISTS(SELECT FROM geomacro.credit_ledger WHERE provider='signup' AND external_id=p_user::text) THEN
  UPDATE geomacro.users SET balance_units=balance_units+10000000 WHERE id=p_user RETURNING * INTO u;
  INSERT INTO geomacro.credit_ledger(user_id,delta_units,balance_after_units,kind,provider,external_id)
  VALUES(p_user,10000000,u.balance_units,'signup','signup',p_user::text);
 END IF;
 RETURN jsonb_build_object('user_id',u.id,'balance_units',u.balance_units);
END $$;

CREATE FUNCTION geomacro.create_api_key(p_user uuid,p_hash text,p_prefix text,p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k uuid;
BEGIN
 PERFORM 1 FROM geomacro.users WHERE id=p_user AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE'; END IF;
 INSERT INTO geomacro.api_keys(user_id,key_hash,prefix,label) VALUES(p_user,p_hash,p_prefix,p_label) RETURNING id INTO k;
 RETURN k;
END $$;
CREATE FUNCTION geomacro.revoke_api_key(p_user uuid,p_key uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM geomacro.users WHERE id=p_user FOR UPDATE;
 UPDATE geomacro.api_keys SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_key AND user_id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'KEY_NOT_FOUND'; END IF;
END $$;

-- Step 2 must call this ONLY after payment signature verification, resource
-- confirmation, currency/amount validation, and mapping a server-owned SKU.
-- external_id must be the capture/sale resource ID, not webhook event ID.
CREATE FUNCTION geomacro.top_up(p_user uuid,p_provider text,p_external text,p_units bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u geomacro.users; l geomacro.credit_ledger;
BEGIN
 IF p_provider IS NULL OR p_provider NOT IN ('paypal_capture','paypal_subscription_payment') OR p_external IS NULL
    OR length(p_external)=0 OR p_units IS NULL OR p_units<=0 THEN RAISE EXCEPTION 'INVALID_TOP_UP'; END IF;
 SELECT * INTO STRICT u FROM geomacro.users WHERE id=p_user FOR UPDATE;
 SELECT * INTO l FROM geomacro.credit_ledger WHERE provider=p_provider AND external_id=p_external;
 IF FOUND THEN
  IF l.user_id<>p_user OR l.delta_units<>p_units THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN l.balance_after_units;
 END IF;
 IF u.status<>'active' THEN RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE'; END IF;
 UPDATE geomacro.users SET balance_units=balance_units+p_units WHERE id=p_user RETURNING * INTO u;
 INSERT INTO geomacro.credit_ledger(user_id,delta_units,balance_after_units,kind,provider,external_id)
 VALUES(p_user,p_units,u.balance_units,'payment',p_provider,p_external);
 RETURN u.balance_units;
END $$;

CREATE FUNCTION geomacro.quote(p_requested geomacro.tier,p_available geomacro.tier[])
RETURNS geomacro.prices LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q geomacro.prices;
BEGIN
 SELECT p.* INTO q FROM geomacro.prices p
 WHERE p.tier=ANY(p_available) AND p.priority<=(SELECT priority FROM geomacro.prices WHERE tier=p_requested)
 ORDER BY p.priority DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'INCONCLUSIVE_NO_CHARGE'; END IF;
 RETURN q;
END $$;

-- A transaction-scoped user row lock keeps preparation, verification, and settlement for
-- a user serialized without deducting a reservation. All balance writers take
-- this same user row lock. Runtime invokes prepare + settle in ONE transaction.
CREATE FUNCTION geomacro.prepare(p_key_hash text,p_request uuid,p_request_hash text,p_subject text,p_requested geomacro.tier,p_available geomacro.tier[])
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

CREATE FUNCTION geomacro.settle_success(p_user uuid,p_key uuid,p_request uuid,p_request_hash text,p_subject text,
 p_requested geomacro.tier,p_available geomacro.tier[],p_canonical text,p_signature text,p_key_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u geomacro.users; k geomacro.api_keys; q geomacro.prices; b jsonb; result jsonb; h text;
BEGIN
 SELECT * INTO STRICT u FROM geomacro.users WHERE id=p_user FOR UPDATE;
 SELECT * INTO STRICT k FROM geomacro.api_keys WHERE id=p_key AND user_id=p_user;
 -- prepare also performs exact replay identity checking.
 result:=geomacro.prepare(k.key_hash,p_request,p_request_hash,p_subject,p_requested,p_available);
 IF (result->>'replay')::boolean THEN RETURN result; END IF;
 q:=geomacro.quote(p_requested,p_available);
 b:=p_canonical::jsonb;
 IF jsonb_typeof(b)<>'object' OR p_signature IS NULL OR length(p_signature)=0 OR p_key_id IS NULL
 OR b->>'request_id' IS DISTINCT FROM p_request::text OR b->>'subject' IS DISTINCT FROM p_subject
 OR b->>'requested_tier' IS DISTINCT FROM p_requested::text
 OR b->>'billed_tier' IS DISTINCT FROM q.tier::text
 OR b->'credits_deducted' IS DISTINCT FROM to_jsonb(q.credit_units::numeric/1000000)
 OR b->'execution_authorized' IS DISTINCT FROM 'false'::jsonb
 OR b->>'public_key_id' IS DISTINCT FROM p_key_id
 OR b->>'generated_at' IS NULL
 OR b->>'decision' IS NULL OR b->>'decision' NOT IN ('allow','review','deny')
 OR jsonb_typeof(b->'factors') IS DISTINCT FROM 'array'
 OR jsonb_typeof(b->'risk_score') IS DISTINCT FROM 'number'
 THEN RAISE EXCEPTION 'INVALID_VERIFIED_PAYLOAD'; END IF;
 IF (b->>'risk_score')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'INVALID_RISK_SCORE'; END IF;
 h:=encode(sha256(convert_to(p_canonical,'UTF8')),'hex');
 INSERT INTO geomacro.usage_logs(request_id,user_id,api_key_id,request_hash,subject,requested_tier,billed_tier,rail,state,http_status,credit_units,usd_micros)
 VALUES(p_request,p_user,p_key,p_request_hash,p_subject,p_requested,q.tier,'credits','succeeded',200,q.credit_units,q.usd_micros);
 INSERT INTO geomacro.audit_receipts(request_id,canonical_payload,response_hash,signature,public_key_id,signed_at)
 VALUES(p_request,p_canonical,h,p_signature,p_key_id,(b->>'generated_at')::timestamptz);
 UPDATE geomacro.users SET balance_units=balance_units-q.credit_units WHERE id=p_user;
 INSERT INTO geomacro.credit_ledger(user_id,delta_units,balance_after_units,kind,provider,external_id,request_id)
 VALUES(p_user,-q.credit_units,u.balance_units-q.credit_units,'usage','usage',p_request::text,p_request);
 RETURN jsonb_build_object('replay',false,'canonical_payload',p_canonical,'audit_receipt',jsonb_build_object(
 'signature',p_signature,'public_key_id',p_key_id,'timestamp',b->>'generated_at','hash',h));
END $$;

CREATE FUNCTION geomacro.refund_usage(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.usage_logs; u geomacro.users;
BEGIN
 SELECT * INTO STRICT v FROM geomacro.usage_logs WHERE request_id=p_request;
 IF v.rail<>'credits' THEN RAISE EXCEPTION 'WRONG_PAYMENT_RAIL'; END IF;
 SELECT * INTO STRICT u FROM geomacro.users WHERE id=v.user_id FOR UPDATE;
 SELECT * INTO STRICT v FROM geomacro.usage_logs WHERE request_id=p_request FOR UPDATE;
 IF v.state='refunded' OR v.state='failed' THEN RETURN; END IF;
 UPDATE geomacro.users SET balance_units=balance_units+v.credit_units WHERE id=u.id RETURNING * INTO u;
 INSERT INTO geomacro.credit_ledger(user_id,delta_units,balance_after_units,kind,provider,external_id,request_id)
 VALUES(u.id,v.credit_units,u.balance_units,'refund','refund',p_request::text,p_request);
 UPDATE geomacro.usage_logs SET state='refunded' WHERE request_id=p_request;
END $$;

CREATE FUNCTION geomacro.record_failure(p_key_hash text,p_request uuid,p_request_hash text,p_subject text,
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

-- Fresh installs must not inherit execute access via PUBLIC/default privileges.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM %I',r);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION geomacro.provision_user(uuid,text),
 geomacro.create_api_key(uuid,text,text,text),geomacro.revoke_api_key(uuid,uuid),
 geomacro.top_up(uuid,text,text,bigint),geomacro.quote(geomacro.tier,geomacro.tier[]),
 geomacro.prepare(text,uuid,text,text,geomacro.tier,geomacro.tier[]),
 geomacro.settle_success(uuid,uuid,uuid,text,text,geomacro.tier,geomacro.tier[],text,text,text),
 geomacro.refund_usage(uuid),geomacro.record_failure(text,uuid,text,text,geomacro.tier,integer,text)
 TO geomacro_billing;
COMMIT;
