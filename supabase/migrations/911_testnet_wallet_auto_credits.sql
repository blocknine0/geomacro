-- Geomacro Testnet wallet verification auto-credits v2.2
-- A successfully verified unique EVM wallet receives one fixed 500-credit,
-- 30-day Testnet entitlement. No payment event is required.

alter table public.testnet_tester_profiles
  drop constraint if exists testnet_tester_activation_check;

alter table public.testnet_tester_profiles
  add constraint testnet_tester_activation_check
  check (
    access_status <> 'active' or (
      registration_status = 'complete' and
      wallet_verified_at is not null and
      current_entitlement_grant_id is not null
    )
  );

create or replace function public.activate_wallet_verified_testnet_pass(
  p_principal_id uuid,
  p_contract_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.testnet_tester_profiles%rowtype;
  v_existing_grant public.commercial_entitlement_grants%rowtype;
  v_grant_id uuid;
  v_ends_at timestamptz;
begin
  if p_principal_id is null then raise exception 'TESTNET_PRINCIPAL_REQUIRED'; end if;
  if p_contract_version is null or char_length(p_contract_version) < 3 then
    raise exception 'TESTNET_ENTITLEMENT_VERSION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_principal_id::text,0));

  select * into v_profile
  from public.testnet_tester_profiles
  where principal_id = p_principal_id
  for update;

  if not found then raise exception 'TESTNET_PROFILE_NOT_FOUND'; end if;
  if v_profile.wallet_verified_at is null or v_profile.registration_status <> 'complete' then
    raise exception 'TESTNET_WALLET_NOT_VERIFIED';
  end if;
  if v_profile.suspended_at is not null or v_profile.access_status in ('suspended','revoked') then
    raise exception 'TESTNET_PROFILE_NOT_ACTIVE';
  end if;

  select * into v_existing_grant
  from public.commercial_entitlement_grants
  where principal_id = p_principal_id
    and tier = 'testnet_tester'
    and status = 'active'
  order by created_at asc
  limit 1
  for update;

  if found then
    update public.testnet_tester_profiles
    set current_entitlement_grant_id = v_existing_grant.id,
        access_status = 'active',
        updated_at = now()
    where id = v_profile.id;

    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'entitlement_grant_id', v_existing_grant.id,
      'credits_granted', 0,
      'quota_credits', 500,
      'expires_at', v_existing_grant.ends_at,
      'commercial_revenue', false
    );
  end if;

  v_ends_at := now() + interval '30 days';

  insert into public.commercial_entitlement_grants (
    principal_id, tier, included_credits, contract_version, source_type, source_reference,
    starts_at, ends_at, status, metadata
  ) values (
    p_principal_id, 'testnet_tester', 500, p_contract_version, 'free_provisioning',
    'testnet-wallet-verification:' || p_principal_id::text,
    now(), v_ends_at, 'active', jsonb_build_object(
      'offer_id', 'testnet_wallet_verified_500',
      'entitlement_kind', 'testnet_pass',
      'activation_method', 'verified_wallet',
      'quota_credits', 500,
      'fixed_quota_per_verified_wallet', true,
      'payment_required', false,
      'execution_authorized', false,
      'commercial_revenue', false
    )
  ) returning id into v_grant_id;

  insert into public.commercial_credit_accounts (
    principal_type, principal_id, tier, contract_version, included_credits, credits_used,
    period_started_at, period_ends_at, status
  ) values (
    'api_client', p_principal_id::text, 'testnet_tester', p_contract_version, 500, 0,
    now(), v_ends_at, 'active'
  )
  on conflict (principal_type, principal_id)
  do update set
    tier = 'testnet_tester',
    contract_version = excluded.contract_version,
    included_credits = 500,
    credits_used = least(public.commercial_credit_accounts.credits_used, 500),
    period_started_at = excluded.period_started_at,
    period_ends_at = excluded.period_ends_at,
    status = 'active',
    updated_at = now();

  update public.testnet_tester_profiles
  set current_entitlement_grant_id = v_grant_id,
      access_status = 'active',
      updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'entitlement_grant_id', v_grant_id,
    'credits_granted', 500,
    'quota_credits', 500,
    'expires_at', v_ends_at,
    'commercial_revenue', false
  );
end;
$$;

comment on function public.activate_wallet_verified_testnet_pass(uuid, text)
is 'Grants one fixed 500-credit, 30-day Geomacro Testnet entitlement to a verified unique wallet. No payment is required; the grant is Testnet-only and non-revenue.';
