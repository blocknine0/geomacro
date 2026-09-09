-- =============================================================================
-- Geomacro commercial credit ledger
--
-- PURPOSE
-- - provide durable, atomic usage accounting for authenticated commercial users
-- - keep anonymous public preview rate limiting separate from account credits
-- - support wallet identities today and future email/org/API principals later
-- - prevent retry double-charging through request-level idempotency
-- - allow future quota reductions only from the next billing period onward
--
-- IMPORTANT
-- - this migration only creates the ledger/RPC contract; it does not activate
--   production billing or change any current public endpoint by itself
-- - raw/private warehouse access is unrelated to credits and remains forbidden
-- =============================================================================

create table if not exists public.commercial_credit_accounts (
  id uuid primary key default gen_random_uuid(),

  principal_type text not null,
  principal_id text not null,

  tier text not null,
  contract_version text not null,

  included_credits integer not null,
  credits_used integer not null default 0,

  period_started_at timestamptz not null default now(),
  period_ends_at timestamptz not null default (now() + interval '30 days'),

  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commercial_credit_accounts_principal_type_check
    check (principal_type in ('wallet', 'email', 'organization', 'api_client', 'internal')),

  constraint commercial_credit_accounts_principal_id_check
    check (char_length(principal_id) between 3 and 256),

  constraint commercial_credit_accounts_tier_check
    check (tier in ('free', 'analyst_pilot', 'api_pilot', 'institutional')),

  constraint commercial_credit_accounts_contract_version_check
    check (char_length(contract_version) between 3 and 64),

  constraint commercial_credit_accounts_included_credits_check
    check (included_credits >= 0),

  constraint commercial_credit_accounts_credits_used_check
    check (credits_used >= 0 and credits_used <= included_credits),

  constraint commercial_credit_accounts_period_check
    check (period_ends_at > period_started_at),

  constraint commercial_credit_accounts_status_check
    check (status in ('active', 'suspended', 'closed')),

  unique (principal_type, principal_id)
);

create index if not exists commercial_credit_accounts_period_idx
  on public.commercial_credit_accounts (period_ends_at, status);

create table if not exists public.commercial_credit_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.commercial_credit_accounts(id) on delete cascade,
  request_id text not null,
  capability text not null,
  credit_cost integer not null,
  contract_version text not null,
  created_at timestamptz not null default now(),

  constraint commercial_credit_usage_request_id_check
    check (char_length(request_id) between 8 and 160),

  constraint commercial_credit_usage_capability_check
    check (char_length(capability) between 2 and 80),

  constraint commercial_credit_usage_credit_cost_check
    check (credit_cost > 0),

  constraint commercial_credit_usage_contract_version_check
    check (char_length(contract_version) between 3 and 64),

  unique (account_id, request_id)
);

create index if not exists commercial_credit_usage_account_time_idx
  on public.commercial_credit_usage (account_id, created_at desc);

-- Ensure/provision one credit account. During an active period the included
-- credit ceiling can increase immediately (upgrade) but cannot decrease.
-- A lower new quota is adopted only when a fresh period begins.
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
  if p_principal_type not in ('wallet', 'email', 'organization', 'api_client', 'internal')
    or p_principal_id is null
    or char_length(p_principal_id) not between 3 and 256
    or p_tier not in ('free', 'analyst_pilot', 'api_pilot', 'institutional')
    or p_contract_version is null
    or char_length(p_contract_version) not between 3 and 64
    or p_included_credits is null
    or p_included_credits < 0
    or p_period_days is null
    or p_period_days < 1
    or p_period_days > 366
  then
    raise exception 'invalid commercial credit account input';
  end if;

  select *
    into v_account
  from public.commercial_credit_accounts
  where principal_type = p_principal_type
    and principal_id = p_principal_id
  for update;

  if not found then
    insert into public.commercial_credit_accounts (
      principal_type,
      principal_id,
      tier,
      contract_version,
      included_credits,
      credits_used,
      period_started_at,
      period_ends_at
    ) values (
      p_principal_type,
      p_principal_id,
      p_tier,
      p_contract_version,
      p_included_credits,
      0,
      v_now,
      v_now + make_interval(days => p_period_days)
    )
    returning * into v_account;
  elsif v_account.period_ends_at <= v_now then
    update public.commercial_credit_accounts
    set
      tier = p_tier,
      contract_version = p_contract_version,
      included_credits = p_included_credits,
      credits_used = 0,
      period_started_at = v_now,
      period_ends_at = v_now + make_interval(days => p_period_days),
      updated_at = v_now
    where id = v_account.id
    returning * into v_account;
  else
    update public.commercial_credit_accounts
    set
      tier = p_tier,
      contract_version = p_contract_version,
      included_credits = greatest(included_credits, p_included_credits),
      updated_at = v_now
    where id = v_account.id
    returning * into v_account;
  end if;

  return jsonb_build_object(
    'account_id', v_account.id,
    'tier', v_account.tier,
    'included_credits', v_account.included_credits,
    'credits_used', v_account.credits_used,
    'credits_remaining', v_account.included_credits - v_account.credits_used,
    'period_started_at', v_account.period_started_at,
    'period_ends_at', v_account.period_ends_at,
    'status', v_account.status,
    'contract_version', v_account.contract_version
  );
end;
$$;

-- Atomically consume credits exactly once for a caller-generated request id.
-- Repeating the same request id never consumes a second time.
create or replace function public.consume_commercial_credits(
  p_principal_type text,
  p_principal_id text,
  p_request_id text,
  p_capability text,
  p_credit_cost integer,
  p_contract_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.commercial_credit_accounts%rowtype;
  v_existing public.commercial_credit_usage%rowtype;
  v_now timestamptz := now();
  v_remaining integer;
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_capability is null
    or char_length(p_capability) not between 2 and 80
    or p_credit_cost is null
    or p_credit_cost <= 0
    or p_contract_version is null
    or char_length(p_contract_version) not between 3 and 64
  then
    raise exception 'invalid commercial credit consumption input';
  end if;

  select *
    into v_account
  from public.commercial_credit_accounts
  where principal_type = p_principal_type
    and principal_id = p_principal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CREDIT_ACCOUNT_NOT_FOUND');
  end if;

  if v_account.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'CREDIT_ACCOUNT_INACTIVE');
  end if;

  if v_account.period_ends_at <= v_now then
    return jsonb_build_object('ok', false, 'code', 'CREDIT_PERIOD_EXPIRED');
  end if;

  select *
    into v_existing
  from public.commercial_credit_usage
  where account_id = v_account.id
    and request_id = p_request_id;

  if found then
    v_remaining := v_account.included_credits - v_account.credits_used;
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'credit_cost', v_existing.credit_cost,
      'credits_remaining', v_remaining,
      'period_ends_at', v_account.period_ends_at
    );
  end if;

  if v_account.credits_used + p_credit_cost > v_account.included_credits then
    return jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_CREDITS',
      'credits_remaining', v_account.included_credits - v_account.credits_used,
      'period_ends_at', v_account.period_ends_at
    );
  end if;

  update public.commercial_credit_accounts
  set
    credits_used = credits_used + p_credit_cost,
    updated_at = v_now
  where id = v_account.id
  returning * into v_account;

  insert into public.commercial_credit_usage (
    account_id,
    request_id,
    capability,
    credit_cost,
    contract_version
  ) values (
    v_account.id,
    p_request_id,
    p_capability,
    p_credit_cost,
    p_contract_version
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'credit_cost', p_credit_cost,
    'credits_remaining', v_account.included_credits - v_account.credits_used,
    'period_ends_at', v_account.period_ends_at
  );
end;
$$;

alter table public.commercial_credit_accounts enable row level security;
alter table public.commercial_credit_usage enable row level security;

revoke all on table public.commercial_credit_accounts from PUBLIC, anon, authenticated;
revoke all on table public.commercial_credit_usage from PUBLIC, anon, authenticated;
grant all on table public.commercial_credit_accounts to service_role;
grant all on table public.commercial_credit_usage to service_role;

revoke all on function public.ensure_commercial_credit_account(text, text, text, text, integer, integer)
  from PUBLIC, anon, authenticated;
grant execute on function public.ensure_commercial_credit_account(text, text, text, text, integer, integer)
  to service_role;

revoke all on function public.consume_commercial_credits(text, text, text, text, integer, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.consume_commercial_credits(text, text, text, text, integer, text)
  to service_role;

comment on table public.commercial_credit_accounts is
  'Server-only commercial credit accounts. Principal identifiers must be canonical non-secret identifiers; never store raw API keys.';
comment on table public.commercial_credit_usage is
  'Immutable commercial credit usage ledger with request-level idempotency.';
comment on function public.ensure_commercial_credit_account(text, text, text, text, integer, integer) is
  'Creates or refreshes an authenticated credit account. Active-period quota never decreases; reductions apply on the next period.';
comment on function public.consume_commercial_credits(text, text, text, text, integer, text) is
  'Atomically consumes credits once per request id and fails closed on insufficient or inactive accounts.';
