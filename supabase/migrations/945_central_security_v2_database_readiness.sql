-- =============================================================================
-- Geomacro central security v2 database readiness
--
-- Extends the existing aggregate real-funds readiness probe so the sharded
-- abuse-control ledger is mandatory before any production payment rail can be
-- considered ready. Browser roles must have zero table privileges.
-- =============================================================================

create or replace function public.central_security_database_readiness()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_required text[] := array[
    'central_security_request_buckets',
    'central_security_request_buckets_v2',
    'siwe_login_nonces',
    'testnet_tester_profiles',
    'testnet_wallet_challenges',
    'testnet_tester_sessions',
    'testnet_email_verification_challenges',
    'testnet_oauth_states',
    'testnet_developer_credentials',
    'commercial_principals',
    'commercial_api_credentials',
    'commercial_entitlement_grants',
    'commercial_credit_accounts',
    'commercial_credit_usage',
    'risk_gate_api_clients',
    'risk_gate_rate_limits',
    'risk_gate_audit_log',
    'risk_gate_idempotency_keys',
    'webhook_event_outbox',
    'agent_api_requests',
    'agent_payments',
    'agent_goat_orders',
    'agent_goat_pilot_requests',
    'agent_goat_pilot_resources',
    'agent_goat_order_challenges',
    'agent_goat_pilot_fulfillments',
    'coinbase_x402_deliveries'
  ];
  v_table text;
  v_reg regclass;
  v_rls boolean;
  v_required_count integer := cardinality(v_required);
  v_present_count integer := 0;
  v_rls_count integer := 0;
  v_browser_exposed_count integer := 0;
  v_missing_count integer := 0;
begin
  foreach v_table in array v_required loop
    v_reg := to_regclass(format('public.%I', v_table));

    if v_reg is null then
      v_missing_count := v_missing_count + 1;
      continue;
    end if;

    v_present_count := v_present_count + 1;

    select c.relrowsecurity
      into v_rls
    from pg_catalog.pg_class c
    where c.oid = v_reg;

    if coalesce(v_rls, false) then
      v_rls_count := v_rls_count + 1;
    end if;

    if
      has_table_privilege('anon', v_reg, 'SELECT')
      or has_table_privilege('anon', v_reg, 'INSERT')
      or has_table_privilege('anon', v_reg, 'UPDATE')
      or has_table_privilege('anon', v_reg, 'DELETE')
      or has_table_privilege('authenticated', v_reg, 'SELECT')
      or has_table_privilege('authenticated', v_reg, 'INSERT')
      or has_table_privilege('authenticated', v_reg, 'UPDATE')
      or has_table_privilege('authenticated', v_reg, 'DELETE')
    then
      v_browser_exposed_count := v_browser_exposed_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'security_version', 'geomacro-central-security-v1.0.0',
    'abuse_control_version', 'sharded-v2',
    'required_table_count', v_required_count,
    'present_table_count', v_present_count,
    'rls_table_count', v_rls_count,
    'missing_table_count', v_missing_count,
    'browser_exposed_table_count', v_browser_exposed_count,
    'ready',
      v_missing_count = 0
      and v_present_count = v_required_count
      and v_rls_count = v_required_count
      and v_browser_exposed_count = 0
  );
end;
$$;

revoke all on function public.central_security_database_readiness()
  from PUBLIC, anon, authenticated;

grant execute on function public.central_security_database_readiness()
  to service_role;

comment on function public.central_security_database_readiness() is
  'Service-role-only aggregate posture probe for security-critical identity, credential, audit, payment and sharded abuse-control tables: existence, RLS, and no direct anon/authenticated table privileges.';
