-- Founder-approved 2026-10-31 new-sale low-barrier tiers.
-- No payment provider is enabled by this migration. Existing settled grants,
-- testnet-only pricing and signed payment receipts remain unchanged.
BEGIN;
ALTER TABLE public.commercial_entitlement_grants DROP CONSTRAINT IF EXISTS commercial_entitlement_grants_tier_check;
ALTER TABLE public.commercial_entitlement_grants ADD CONSTRAINT commercial_entitlement_grants_tier_check
CHECK (tier IN ('free','testnet_tester','analyst_pilot','api_pilot','institutional','starter_dev','pro_analyst','business_pilot'));
ALTER TABLE public.commercial_credit_accounts DROP CONSTRAINT IF EXISTS commercial_credit_accounts_tier_check;
ALTER TABLE public.commercial_credit_accounts ADD CONSTRAINT commercial_credit_accounts_tier_check
CHECK (tier IN ('free','testnet_tester','analyst_pilot','api_pilot','institutional','starter_dev','pro_analyst','business_pilot'));
create or replace function public.ensure_commercial_credit_account(
  p_principal_type text,
  p_principal_id text,
  p_tier text,
  p_contract_version text,
  p_included_credits integer,
  p_period_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.commercial_credit_accounts%rowtype;
  v_now timestamptz := now();
begin
  if p_principal_type not in ('wallet','email','organization','api_client','internal')
    or p_principal_id is null or char_length(p_principal_id) not between 3 and 256
    or p_tier not in ('free','testnet_tester','analyst_pilot','api_pilot','institutional','starter_dev','pro_analyst','business_pilot')
    or p_contract_version is null or char_length(p_contract_version) not between 3 and 64
    or p_included_credits is null or p_included_credits < 0
    or p_period_days is null or p_period_days < 1 or p_period_days > 366
  then
    raise exception 'invalid commercial credit account input';
  end if;

  -- In fresh-schema replays, this migration is ordered after 20261031
  -- guard migrations. New paid tiers must not auto-provision credits.
  if p_tier in ('starter_dev','pro_analyst','business_pilot') then
    raise exception 'PAID_CREDITS_REQUIRE_VERIFIED_SETTLEMENT';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_principal_type || ':' || p_principal_id, 0)
  );

  select * into v_account
  from public.commercial_credit_accounts
  where principal_type = p_principal_type
    and principal_id = p_principal_id
  for update;

  if not found then
    insert into public.commercial_credit_accounts (
      principal_type,principal_id,tier,contract_version,included_credits,credits_used,
      period_started_at,period_ends_at
    ) values (
      p_principal_type,p_principal_id,p_tier,p_contract_version,p_included_credits,0,
      v_now,v_now + make_interval(days => p_period_days)
    ) returning * into v_account;
  elsif v_account.period_ends_at <= v_now then
    update public.commercial_credit_accounts set
      tier=p_tier,
      contract_version=p_contract_version,
      included_credits=p_included_credits,
      credits_used=0,
      period_started_at=v_now,
      period_ends_at=v_now + make_interval(days => p_period_days),
      status='active',
      updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  else
    update public.commercial_credit_accounts set
      tier=p_tier,
      contract_version=p_contract_version,
      included_credits=greatest(included_credits,p_included_credits),
      updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  end if;

  return jsonb_build_object(
    'account_id',v_account.id,
    'tier',v_account.tier,
    'included_credits',v_account.included_credits,
    'credits_used',v_account.credits_used,
    'credits_remaining',v_account.included_credits-v_account.credits_used,
    'period_started_at',v_account.period_started_at,
    'period_ends_at',v_account.period_ends_at,
    'status',v_account.status,
    'contract_version',v_account.contract_version
  );
end;
$$;


COMMIT;
