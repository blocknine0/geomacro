-- =============================================================================
-- Geomacro private revenue-ledger production readiness proof
--
-- PURPOSE
-- - expose one service-role-only, read-only RPC proving that the private
--   real-revenue delivery ledger is actually installed in the authoritative DB
-- - verify append-only trigger/function presence and access boundaries
-- - verify the current hash chain without exposing any private delivery payload
-- =============================================================================

create or replace function public.private_commercial_revenue_delivery_ledger_readiness()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_table_exists boolean;
  v_rls_enabled boolean := false;
  v_capture_trigger_exists boolean := false;
  v_capture_function_exists boolean := false;
  v_verify_function_exists boolean := false;
  v_immutable_trigger_exists boolean := false;

  v_anon_select boolean := false;
  v_authenticated_select boolean := false;
  v_service_select boolean := false;
  v_service_insert boolean := false;
  v_service_update boolean := false;
  v_service_delete boolean := false;

  v_row_count bigint := 0;
  v_invalid_chain_rows bigint := 0;
  v_head_entry_sha256 text;
begin
  v_table_exists :=
    to_regclass('public.private_commercial_revenue_delivery_ledger') is not null;

  if not v_table_exists then
    return jsonb_build_object(
      'schema_version', 'geomacro.private-revenue-ledger-readiness.v1',
      'ready', false,
      'table_exists', false
    );
  end if;

  select c.relrowsecurity
    into v_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'private_commercial_revenue_delivery_ledger';

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'commercial_payment_events'
      and t.tgname = 'capture_private_commercial_revenue_delivery_proof'
      and not t.tgisinternal
  ) into v_capture_trigger_exists;

  select to_regprocedure(
    'public.capture_private_commercial_revenue_delivery_proof()'
  ) is not null into v_capture_function_exists;

  select to_regprocedure(
    'public.verify_private_commercial_revenue_delivery_ledger()'
  ) is not null into v_verify_function_exists;

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'private_commercial_revenue_delivery_ledger'
      and t.tgname = 'private_commercial_revenue_delivery_ledger_immutable'
      and not t.tgisinternal
  ) into v_immutable_trigger_exists;

  v_anon_select := has_table_privilege(
    'anon',
    'public.private_commercial_revenue_delivery_ledger',
    'SELECT'
  );
  v_authenticated_select := has_table_privilege(
    'authenticated',
    'public.private_commercial_revenue_delivery_ledger',
    'SELECT'
  );
  v_service_select := has_table_privilege(
    'service_role',
    'public.private_commercial_revenue_delivery_ledger',
    'SELECT'
  );
  v_service_insert := has_table_privilege(
    'service_role',
    'public.private_commercial_revenue_delivery_ledger',
    'INSERT'
  );
  v_service_update := has_table_privilege(
    'service_role',
    'public.private_commercial_revenue_delivery_ledger',
    'UPDATE'
  );
  v_service_delete := has_table_privilege(
    'service_role',
    'public.private_commercial_revenue_delivery_ledger',
    'DELETE'
  );

  select count(*)
    into v_row_count
  from public.private_commercial_revenue_delivery_ledger;

  select l.entry_sha256
    into v_head_entry_sha256
  from public.private_commercial_revenue_delivery_ledger l
  order by l.sequence_no desc
  limit 1;

  if v_verify_function_exists then
    select count(*)
      into v_invalid_chain_rows
    from public.verify_private_commercial_revenue_delivery_ledger() v
    where v.previous_link_valid is distinct from true
       or v.entry_hash_valid is distinct from true;
  else
    v_invalid_chain_rows := -1;
  end if;

  return jsonb_build_object(
    'schema_version', 'geomacro.private-revenue-ledger-readiness.v1',
    'ready',
      v_table_exists
      and v_rls_enabled
      and v_capture_trigger_exists
      and v_capture_function_exists
      and v_verify_function_exists
      and v_immutable_trigger_exists
      and not v_anon_select
      and not v_authenticated_select
      and v_service_select
      and not v_service_insert
      and not v_service_update
      and not v_service_delete
      and v_invalid_chain_rows = 0,
    'table_exists', v_table_exists,
    'rls_enabled', v_rls_enabled,
    'capture_trigger_exists', v_capture_trigger_exists,
    'capture_function_exists', v_capture_function_exists,
    'verify_function_exists', v_verify_function_exists,
    'immutable_trigger_exists', v_immutable_trigger_exists,
    'anon_select_allowed', v_anon_select,
    'authenticated_select_allowed', v_authenticated_select,
    'service_role_select_allowed', v_service_select,
    'service_role_insert_allowed', v_service_insert,
    'service_role_update_allowed', v_service_update,
    'service_role_delete_allowed', v_service_delete,
    'row_count', v_row_count,
    'invalid_hash_chain_rows', v_invalid_chain_rows,
    'head_entry_sha256', v_head_entry_sha256
  );
end;
$$;

revoke all on function public.private_commercial_revenue_delivery_ledger_readiness()
  from PUBLIC, anon, authenticated;
grant execute on function public.private_commercial_revenue_delivery_ledger_readiness()
  to service_role;

comment on function public.private_commercial_revenue_delivery_ledger_readiness() is
  'Service-role-only read-only proof that the private real-revenue delivery ledger, immutability controls, access boundaries and hash-chain verifier are active.';
