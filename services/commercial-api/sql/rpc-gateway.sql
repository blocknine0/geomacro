-- Service-key-only PostgREST gateway. The financial schema remains unexposed.
BEGIN;
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
