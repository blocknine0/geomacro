-- =============================================================================
-- Geomacro commercial credit account concurrency hardening
--
-- PURPOSE
-- - serialize provisioning/refresh for one canonical principal even when the
--   account row does not exist yet
-- - close the missing-row race where two first requests can both observe no
--   row and then compete on the unique (principal_type, principal_id) insert
-- - preserve all existing quota, period and tier behavior
--
-- This is an availability/idempotency hardening only. It does not enable
-- billing, change prices, broaden entitlements or authorize execution.
-- =============================================================================

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
    or p_tier not in ('free','testnet_tester','analyst_pilot','api_pilot','institutional')
    or p_contract_version is null or char_length(p_contract_version) not between 3 and 64
    or p_included_credits is null or p_included_credits < 0
    or p_period_days is null or p_period_days < 1 or p_period_days > 366
  then
    raise exception 'invalid commercial credit account input';
  end if;

  -- SELECT ... FOR UPDATE cannot lock a row that does not exist. Serialize all
  -- provisioning/refresh work for this canonical principal before checking the
  -- table so concurrent first requests cannot race on the unique insert.
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

revoke all on function public.ensure_commercial_credit_account(text, text, text, text, integer, integer)
  from PUBLIC, anon, authenticated;
grant execute on function public.ensure_commercial_credit_account(text, text, text, text, integer, integer)
  to service_role;

comment on function public.ensure_commercial_credit_account(text, text, text, text, integer, integer) is
  'Creates or refreshes one authenticated credit account under a principal-scoped transaction advisory lock; concurrent first requests cannot race the unique account insert.';
