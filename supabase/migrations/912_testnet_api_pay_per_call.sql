-- Geomacro Testnet Developer API pay-per-call alignment.
-- Testnet only. Historical settlement rows remain unchanged.

alter table public.testnet_tester_profiles
  drop constraint if exists testnet_tester_access_status_check;

update public.testnet_tester_profiles
set access_status='pending_verification', updated_at=now()
where access_status='awaiting_payment';

alter table public.testnet_tester_profiles
  add constraint testnet_tester_access_status_check
  check (access_status in ('pending_verification','active','expired','suspended','revoked'));

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

alter table public.testnet_usdc_payment_claims
  drop constraint if exists testnet_usdc_claim_amount_check;

alter table public.testnet_usdc_payment_claims
  add constraint testnet_usdc_claim_amount_check
  check (amount_atomic >= 500000 and amount_usdc >= 0.5)
  not valid;

alter table public.testnet_usdc_payment_claims
  add column if not exists request_id text,
  add column if not exists capability text,
  add column if not exists credit_cost integer,
  add column if not exists required_amount_atomic numeric(78,0),
  add column if not exists pricing_version text;

create unique index if not exists testnet_usdc_payment_claim_principal_request_unique
  on public.testnet_usdc_payment_claims (principal_id, request_id)
  where request_id is not null;

create or replace function public.align_testnet_tester_grant_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tier = 'testnet_tester' then
    new.included_credits := 500;
    new.metadata := (coalesce(new.metadata, '{}'::jsonb) - 'quota_price_usdc') || jsonb_build_object(
      'offer_id', 'testnet_tester_metered_30d',
      'entitlement_kind', 'testnet_metered_access',
      'max_credits_per_30_days', 500,
      'credit_price_testnet_usdc', 0.5,
      'payment_model', 'pay_per_call',
      'upfront_payment_required', false,
      'testnet_api_pricing_version', 'testnet-api-pricing-v1.1.0',
      'payment_environment', 'testnet',
      'payment_asset', 'USDC',
      'commercial_revenue', false,
      'execution_authorized', false
    );
  end if;
  return new;
end;
$$;

update public.commercial_entitlement_grants
set included_credits = 500,
    metadata = (coalesce(metadata, '{}'::jsonb) - 'quota_price_usdc') || jsonb_build_object(
      'offer_id', 'testnet_tester_metered_30d',
      'entitlement_kind', 'testnet_metered_access',
      'max_credits_per_30_days', 500,
      'credit_price_testnet_usdc', 0.5,
      'payment_model', 'pay_per_call',
      'upfront_payment_required', false,
      'testnet_api_pricing_version', 'testnet-api-pricing-v1.1.0',
      'payment_environment', 'testnet',
      'payment_asset', 'USDC',
      'commercial_revenue', false,
      'execution_authorized', false
    ),
    updated_at = now()
where tier = 'testnet_tester' and status = 'active';

create or replace function public.provision_testnet_metered_access(
  p_principal_id uuid,
  p_registry_version text,
  p_contract_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.testnet_tester_profiles%rowtype;
  v_grant public.commercial_entitlement_grants%rowtype;
  v_ends_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_principal_id::text, 0));

  select * into v_profile
  from public.testnet_tester_profiles
  where principal_id = p_principal_id
  for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'TESTNET_PROFILE_NOT_FOUND'); end if;
  if v_profile.registration_status <> 'complete' or v_profile.wallet_verified_at is null then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_WALLET_VERIFICATION_REQUIRED');
  end if;
  if v_profile.suspended_at is not null or v_profile.access_status in ('suspended','revoked') then
    return jsonb_build_object('ok', false, 'code', 'TESTNET_PROFILE_NOT_ACTIVE');
  end if;

  select * into v_grant
  from public.commercial_entitlement_grants
  where principal_id = p_principal_id
    and tier = 'testnet_tester'
    and status = 'active'
    and contract_version = p_contract_version
    and ends_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    v_ends_at := now() + interval '30 days';
    insert into public.commercial_entitlement_grants (
      principal_id,tier,included_credits,contract_version,source_type,source_reference,
      starts_at,ends_at,status,metadata
    ) values (
      p_principal_id,'testnet_tester',500,p_contract_version,'internal','testnet-metered-access',
      now(),v_ends_at,'active',jsonb_build_object(
        'offer_id','testnet_tester_metered_30d',
        'entitlement_kind','testnet_metered_access',
        'structured_data_registry_version',p_registry_version,
        'max_credits_per_30_days',500,
        'credit_price_testnet_usdc',0.5,
        'payment_model','pay_per_call',
        'upfront_payment_required',false,
        'testnet_api_pricing_version','testnet-api-pricing-v1.1.0',
        'payment_environment','testnet',
        'payment_asset','USDC',
        'commercial_revenue',false,
        'execution_authorized',false
      )
    ) returning * into v_grant;
  else
    v_ends_at := v_grant.ends_at;
  end if;

  insert into public.commercial_credit_accounts (
    principal_type,principal_id,tier,contract_version,included_credits,credits_used,
    period_started_at,period_ends_at,status
  ) values (
    'api_client',p_principal_id::text,'testnet_tester',p_contract_version,500,0,
    now(),v_ends_at,'active'
  )
  on conflict (principal_type,principal_id)
  do update set
    tier='testnet_tester',
    contract_version=excluded.contract_version,
    included_credits=500,
    period_ends_at=greatest(public.commercial_credit_accounts.period_ends_at, excluded.period_ends_at),
    status='active',
    updated_at=now();

  update public.testnet_tester_profiles
  set current_entitlement_grant_id=v_grant.id,
      access_status='active',
      updated_at=now()
  where id=v_profile.id;

  return jsonb_build_object(
    'ok',true,
    'entitlement_grant_id',v_grant.id,
    'expires_at',v_ends_at,
    'max_credits_per_30_days',500,
    'credit_price_testnet_usdc',0.5,
    'payment_model','pay_per_call',
    'upfront_payment_required',false
  );
end;
$$;

revoke all on function public.provision_testnet_metered_access(uuid,text,text) from PUBLIC, anon, authenticated;
grant execute on function public.provision_testnet_metered_access(uuid,text,text) to service_role;
