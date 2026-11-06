-- Additive Step 2 installation after schema.sql and functions.sql.
BEGIN;
CREATE TABLE geomacro.paypal_purchases (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES geomacro.users(id),
 sku text NOT NULL, kind text NOT NULL CHECK(kind IN ('pack','subscription')),
 usd_cents integer NOT NULL CHECK(usd_cents>0), credit_units bigint NOT NULL CHECK(credit_units>0),
 plan_id text, provider_id text UNIQUE, state text NOT NULL DEFAULT 'CREATING',
 approval_url text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='subscription')=(plan_id IS NOT NULL))
);
CREATE INDEX paypal_user_idx ON geomacro.paypal_purchases(user_id);
CREATE TABLE geomacro.payment_events (
 event_id text PRIMARY KEY, body_hash text NOT NULL CHECK(body_hash ~ '^[0-9a-f]{64}$'),
 event_type text NOT NULL, purchase_id uuid REFERENCES geomacro.paypal_purchases(id),
 resource_id text, processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_event_purchase_idx ON geomacro.payment_events(purchase_id);
CREATE TRIGGER payment_event_immutable BEFORE UPDATE OR DELETE ON geomacro.payment_events
 FOR EACH ROW EXECUTE FUNCTION geomacro.immutable_record();
CREATE TABLE geomacro.x402_intents (
 request_id uuid PRIMARY KEY, request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 subject text NOT NULL, requested_tier geomacro.tier NOT NULL, billed_tier geomacro.tier NOT NULL,
 amount_atomic bigint NOT NULL CHECK(amount_atomic IN (100000,150000,250000)),
 payer_address text NOT NULL CHECK(payer_address ~ '^0x[0-9a-f]{40}$'),
 payee_address text NOT NULL CHECK(payee_address ~ '^0x[0-9a-f]{40}$'),
 nonce text NOT NULL CHECK(nonce ~ '^0x[0-9a-f]{64}$'),
 payment_hash text NOT NULL CHECK(payment_hash ~ '^[0-9a-f]{64}$'),
 payment_payload jsonb NOT NULL,
 canonical_payload text NOT NULL, signature text NOT NULL, public_key_id text NOT NULL,
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','settling','submitted','confirmed')),
 scan_from_block bigint NOT NULL CHECK(scan_from_block>=0),
 tx_hash text CHECK(tx_hash ~ '^0x[0-9a-f]{64}$'), log_index integer,
 lease_token uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(payer_address,nonce)
);
CREATE INDEX x402_pending_idx ON geomacro.x402_intents(updated_at) WHERE state<>'confirmed';

CREATE FUNCTION geomacro.paypal_begin(p_id uuid,p_user uuid,p_sku text,p_kind text,p_cents integer,p_units bigint,p_plan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.paypal_purchases;
BEGIN
 PERFORM 1 FROM geomacro.users WHERE id=p_user AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE'; END IF;
 INSERT INTO geomacro.paypal_purchases(id,user_id,sku,kind,usd_cents,credit_units,plan_id)
 VALUES(p_id,p_user,p_sku,p_kind,p_cents,p_units,p_plan) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT v FROM geomacro.paypal_purchases WHERE id=p_id;
 IF v.user_id<>p_user OR v.sku<>p_sku OR v.kind<>p_kind OR v.usd_cents<>p_cents
 OR v.credit_units<>p_units OR v.plan_id IS DISTINCT FROM p_plan THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN to_jsonb(v);
END $$;
CREATE FUNCTION geomacro.paypal_link(p_id uuid,p_provider_id text,p_state text,p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.paypal_purchases;
BEGIN
 SELECT * INTO STRICT v FROM geomacro.paypal_purchases WHERE id=p_id FOR UPDATE;
 IF v.provider_id IS NOT NULL AND v.provider_id<>p_provider_id THEN RAISE EXCEPTION 'PROVIDER_ID_CONFLICT'; END IF;
 UPDATE geomacro.paypal_purchases SET provider_id=p_provider_id,state=CASE WHEN provider_id IS NULL THEN p_state ELSE state END,
 approval_url=coalesce(approval_url,p_url) WHERE id=p_id RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
CREATE FUNCTION geomacro.paypal_get(p_provider text,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(p) FROM geomacro.paypal_purchases p
 WHERE (p_provider IS NOT NULL AND p.provider_id=p_provider) OR (p_id IS NOT NULL AND p.id=p_id)
$$;
CREATE FUNCTION geomacro.paypal_apply(p_id uuid,p_event text,p_hash text,p_event_type text,p_resource text,p_provider text,p_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.paypal_purchases; e geomacro.payment_events;
BEGIN
 SELECT * INTO STRICT v FROM geomacro.paypal_purchases WHERE id=p_id;
 -- Same lock order as every account balance writer.
 PERFORM 1 FROM geomacro.users WHERE id=v.user_id FOR UPDATE;
 SELECT * INTO STRICT v FROM geomacro.paypal_purchases WHERE id=p_id FOR UPDATE;
 SELECT * INTO e FROM geomacro.payment_events WHERE event_id=p_event;
 IF FOUND THEN
  IF e.body_hash<>p_hash OR e.purchase_id<>p_id OR e.event_type<>p_event_type
  OR e.resource_id IS DISTINCT FROM p_resource THEN RAISE EXCEPTION 'EVENT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN;
 END IF;
 IF p_provider IS NOT NULL THEN
  IF (v.kind='pack' AND p_provider<>'paypal_capture') OR
     (v.kind='subscription' AND p_provider<>'paypal_subscription_payment') THEN RAISE EXCEPTION 'WRONG_PAYMENT_KIND'; END IF;
  PERFORM geomacro.top_up(v.user_id,p_provider,p_resource,v.credit_units);
 END IF;
 UPDATE geomacro.paypal_purchases SET state=p_state WHERE id=p_id;
 INSERT INTO geomacro.payment_events(event_id,body_hash,event_type,purchase_id,resource_id)
 VALUES(p_event,p_hash,p_event_type,p_id,p_resource);
END $$;

CREATE FUNCTION geomacro.x402_get(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(i) FROM geomacro.x402_intents i WHERE request_id=p_id
$$;
CREATE FUNCTION geomacro.x402_prepare(p jsonb)
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
CREATE FUNCTION geomacro.x402_claim(p_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.x402_intents;
BEGIN
 SELECT * INTO STRICT v FROM geomacro.x402_intents WHERE request_id=p_id FOR UPDATE;
 IF v.state='confirmed' THEN RETURN to_jsonb(v); END IF;
 IF v.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'PAYMENT_PROCESSING'; END IF;
 UPDATE geomacro.x402_intents SET lease_token=p_token,lease_until=clock_timestamp()+interval '90 seconds',
 state=CASE WHEN state='prepared' THEN 'settling' ELSE state END,updated_at=clock_timestamp()
 WHERE request_id=p_id RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
CREATE FUNCTION geomacro.x402_note_tx(p_id uuid,p_token uuid,p_tx text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE geomacro.x402_intents SET tx_hash=p_tx,state='submitted',updated_at=clock_timestamp()
 WHERE request_id=p_id AND lease_token=p_token AND state<>'confirmed' AND (tx_hash IS NULL OR tx_hash=p_tx);
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_LEASE_LOST'; END IF;
END $$;
CREATE FUNCTION geomacro.x402_confirm(p_id uuid,p_token uuid,p_tx text,p_log integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v geomacro.x402_intents; b jsonb;
BEGIN
 SELECT * INTO STRICT v FROM geomacro.x402_intents WHERE request_id=p_id FOR UPDATE;
 IF v.state='confirmed' THEN RETURN to_jsonb(v); END IF;
 IF v.lease_token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'PAYMENT_LEASE_LOST'; END IF;
 IF v.tx_hash IS NOT NULL AND v.tx_hash<>p_tx THEN RAISE EXCEPTION 'TX_HASH_CONFLICT'; END IF;
 b:=v.canonical_payload::jsonb;
 INSERT INTO geomacro.usage_logs(request_id,request_hash,subject,requested_tier,billed_tier,rail,state,http_status,usd_micros)
 VALUES(v.request_id,v.request_hash,v.subject,v.requested_tier,v.billed_tier,'base_usdc','succeeded',200,v.amount_atomic);
 INSERT INTO geomacro.audit_receipts(request_id,canonical_payload,response_hash,signature,public_key_id,signed_at)
 VALUES(v.request_id,v.canonical_payload,encode(sha256(convert_to(v.canonical_payload,'UTF8')),'hex'),v.signature,v.public_key_id,(b->>'generated_at')::timestamptz);
 INSERT INTO geomacro.web3_txs(request_id,token_address,payer_address,payee_address,authorization_nonce,amount_atomic,tx_hash,log_index,state,verified_at,settled_at)
 VALUES(v.request_id,'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',v.payer_address,v.payee_address,v.nonce,v.amount_atomic,p_tx,p_log,'settled',clock_timestamp(),clock_timestamp());
 UPDATE geomacro.x402_intents SET state='confirmed',tx_hash=p_tx,log_index=p_log,lease_until=NULL,updated_at=clock_timestamp()
 WHERE request_id=p_id RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
CREATE FUNCTION geomacro.x402_pending(p_limit integer DEFAULT 100)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT to_jsonb(i) FROM geomacro.x402_intents i WHERE state<>'confirmed'
 AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY updated_at LIMIT least(greatest(p_limit,1),100)
$$;

ALTER TABLE geomacro.paypal_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE geomacro.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE geomacro.x402_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA geomacro FROM PUBLIC,geomacro_billing;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA geomacro FROM %I',r);
  EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geomacro FROM %I',r);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION geomacro.paypal_begin(uuid,uuid,text,text,integer,bigint,text),
 geomacro.paypal_link(uuid,text,text,text),geomacro.paypal_get(text,uuid),
 geomacro.paypal_apply(uuid,text,text,text,text,text,text),geomacro.x402_get(uuid),
 geomacro.x402_prepare(jsonb),geomacro.x402_claim(uuid,uuid),geomacro.x402_note_tx(uuid,uuid,text),
 geomacro.x402_confirm(uuid,uuid,text,integer),geomacro.x402_pending(integer) TO geomacro_billing;
COMMIT;
