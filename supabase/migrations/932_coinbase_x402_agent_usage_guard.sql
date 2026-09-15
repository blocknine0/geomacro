-- =============================================================================
-- Coinbase x402 production payer spend / usage guard
--
-- The reservation is created after facilitator verification but BEFORE prepare
-- and settlement. Concurrent calls from the same payer serialize on an advisory
-- transaction lock, preventing a burst from bypassing the daily budget.
-- Ambiguous settlement keeps the reservation in manual_review and still counts
-- against budget until reconciliation; safe pre-settlement failures release it.
-- Raw wallet/payment authorization data is never stored.
-- =============================================================================

create table if not exists public.coinbase_x402_usage_reservations (
  payment_fingerprint_sha256 text primary key,
  payer_reference_hash text not null,
  environment text not null,
  amount_atomic numeric(78,0) not null,
  usage_day date not null default (now() at time zone 'utc')::date,
  state text not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  released_at timestamptz,
  constraint coinbase_x402_usage_payment_hash_check check (payment_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_usage_payer_hash_check check (payer_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_usage_environment_check check (environment in ('testnet','mainnet')),
  constraint coinbase_x402_usage_amount_check check (amount_atomic > 0),
  constraint coinbase_x402_usage_state_check check (state in ('reserved','settled','released','manual_review'))
);

create index if not exists coinbase_x402_usage_payer_day_idx
  on public.coinbase_x402_usage_reservations (payer_reference_hash, usage_day, state);

alter table public.coinbase_x402_usage_reservations enable row level security;
revoke all on table public.coinbase_x402_usage_reservations from PUBLIC, anon, authenticated;
grant all on table public.coinbase_x402_usage_reservations to service_role;

create or replace function public.reserve_coinbase_x402_usage(
  p_payment_fingerprint text,
  p_payer_hash text,
  p_environment text,
  p_amount_atomic numeric,
  p_max_daily_amount_atomic numeric,
  p_max_daily_requests integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_existing public.coinbase_x402_usage_reservations%rowtype;
  v_amount numeric := 0;
  v_count integer := 0;
begin
  if p_payment_fingerprint !~ '^[0-9a-f]{64}$'
     or p_payer_hash !~ '^[0-9a-f]{64}$'
     or p_environment not in ('testnet','mainnet')
     or p_amount_atomic <= 0
     or p_max_daily_amount_atomic <= 0
     or p_max_daily_requests <= 0 then
    raise exception 'invalid Coinbase x402 usage reservation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_payer_hash || ':' || v_day::text, 0));

  select * into v_existing
  from public.coinbase_x402_usage_reservations
  where payment_fingerprint_sha256 = p_payment_fingerprint;

  if found then
    if v_existing.payer_reference_hash <> p_payer_hash
       or v_existing.amount_atomic <> p_amount_atomic
       or v_existing.environment <> p_environment then
      return 'CONFLICT';
    end if;
    if v_existing.state in ('reserved','settled') then return 'RESERVED'; end if;
    if v_existing.state = 'manual_review' then return 'MANUAL_REVIEW'; end if;
  end if;

  select coalesce(sum(amount_atomic),0), count(*)
    into v_amount, v_count
  from public.coinbase_x402_usage_reservations
  where payer_reference_hash = p_payer_hash
    and usage_day = v_day
    and state in ('reserved','settled','manual_review');

  if v_amount + p_amount_atomic > p_max_daily_amount_atomic then return 'SPEND_LIMIT'; end if;
  if v_count + 1 > p_max_daily_requests then return 'REQUEST_LIMIT'; end if;

  insert into public.coinbase_x402_usage_reservations (
    payment_fingerprint_sha256, payer_reference_hash, environment, amount_atomic, usage_day, state
  ) values (
    p_payment_fingerprint, p_payer_hash, p_environment, p_amount_atomic, v_day, 'reserved'
  )
  on conflict (payment_fingerprint_sha256) do update set
    payer_reference_hash = excluded.payer_reference_hash,
    environment = excluded.environment,
    amount_atomic = excluded.amount_atomic,
    usage_day = excluded.usage_day,
    state = 'reserved',
    updated_at = now(),
    released_at = null;

  return 'RESERVED';
end;
$$;

create or replace function public.finalize_coinbase_x402_usage(p_payment_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_updated integer := 0;
begin
  update public.coinbase_x402_usage_reservations
  set state='settled', settled_at=coalesce(settled_at,now()), updated_at=now()
  where payment_fingerprint_sha256=p_payment_fingerprint and state in ('reserved','settled');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.release_coinbase_x402_usage(
  p_payment_fingerprint text,
  p_manual_review boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_updated integer := 0;
begin
  update public.coinbase_x402_usage_reservations
  set
    state = case when p_manual_review then 'manual_review' else 'released' end,
    released_at = case when p_manual_review then released_at else now() end,
    updated_at = now()
  where payment_fingerprint_sha256=p_payment_fingerprint and state='reserved';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reserve_coinbase_x402_usage(text,text,text,numeric,numeric,integer) from PUBLIC, anon, authenticated;
revoke all on function public.finalize_coinbase_x402_usage(text) from PUBLIC, anon, authenticated;
revoke all on function public.release_coinbase_x402_usage(text,boolean) from PUBLIC, anon, authenticated;
grant execute on function public.reserve_coinbase_x402_usage(text,text,text,numeric,numeric,integer) to service_role;
grant execute on function public.finalize_coinbase_x402_usage(text) to service_role;
grant execute on function public.release_coinbase_x402_usage(text,boolean) to service_role;

comment on table public.coinbase_x402_usage_reservations is
  'Private atomic x402 payer budget reservations. Stores SHA-256 payer/payment references only; ambiguous settlement remains budget-reserved until reconciliation.';
