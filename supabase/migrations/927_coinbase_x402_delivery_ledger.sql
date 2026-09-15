-- =============================================================================
-- Geomacro Coinbase CDP x402 delivery ledger
--
-- PURPOSE
-- - bind one x402 payment payload to one normalized Geomacro request
-- - prevent concurrent/replayed delivery from causing a second settlement attempt
-- - cache the prepared response before the external settlement side effect
-- - make ambiguous settlement outcomes fail closed into manual review
-- - never persist raw payment signatures, authorizations, API secrets, or wallets
-- =============================================================================

create table if not exists public.coinbase_x402_deliveries (
  id uuid primary key default gen_random_uuid(),
  payment_fingerprint_sha256 text not null unique,
  request_fingerprint_sha256 text not null,
  client_request_id text,
  environment text not null,
  network text not null,
  asset text not null,
  amount_atomic numeric(78,0) not null,
  pay_to_hash text not null,
  payer_reference_hash text,
  state text not null default 'processing',
  claim_token uuid,
  lease_expires_at timestamptz,
  response_payload jsonb,
  settlement_tx text,
  settlement_network text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  delivered_at timestamptz,

  constraint coinbase_x402_payment_hash_check
    check (payment_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_request_hash_check
    check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_pay_to_hash_check
    check (pay_to_hash ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_payer_hash_check
    check (payer_reference_hash is null or payer_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint coinbase_x402_environment_check
    check (environment in ('testnet','mainnet')),
  constraint coinbase_x402_network_check
    check (network in ('eip155:84532','eip155:8453')),
  constraint coinbase_x402_state_check
    check (state in ('processing','prepared','delivered','failed','manual_review')),
  constraint coinbase_x402_amount_check
    check (amount_atomic > 0),
  constraint coinbase_x402_client_request_id_check
    check (client_request_id is null or char_length(client_request_id) between 4 and 128),
  constraint coinbase_x402_settlement_tx_check
    check (settlement_tx is null or settlement_tx ~ '^0x[a-fA-F0-9]{64}$')
);

create unique index if not exists coinbase_x402_settlement_tx_unique
  on public.coinbase_x402_deliveries (network, settlement_tx)
  where settlement_tx is not null;
create index if not exists coinbase_x402_delivery_state_time_idx
  on public.coinbase_x402_deliveries (state, updated_at desc);
create index if not exists coinbase_x402_delivery_client_request_idx
  on public.coinbase_x402_deliveries (client_request_id, created_at desc)
  where client_request_id is not null;

alter table public.coinbase_x402_deliveries enable row level security;
revoke all on table public.coinbase_x402_deliveries from PUBLIC, anon, authenticated;
grant all on table public.coinbase_x402_deliveries to service_role;

create or replace function public.claim_coinbase_x402_delivery(
  p_payment_fingerprint text,
  p_request_fingerprint text,
  p_client_request_id text,
  p_environment text,
  p_network text,
  p_asset text,
  p_amount_atomic numeric,
  p_pay_to_hash text
)
returns table (
  disposition text,
  claim_token uuid,
  response_payload jsonb,
  settlement_tx text,
  settlement_network text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_token uuid := gen_random_uuid();
  v_inserted integer := 0;
  v_row public.coinbase_x402_deliveries%rowtype;
begin
  if
    p_payment_fingerprint !~ '^[0-9a-f]{64}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_pay_to_hash !~ '^[0-9a-f]{64}$'
    or p_environment not in ('testnet','mainnet')
    or p_network not in ('eip155:84532','eip155:8453')
    or p_amount_atomic <= 0
  then
    raise exception 'invalid Coinbase x402 delivery claim';
  end if;

  insert into public.coinbase_x402_deliveries (
    payment_fingerprint_sha256,
    request_fingerprint_sha256,
    client_request_id,
    environment,
    network,
    asset,
    amount_atomic,
    pay_to_hash,
    state,
    claim_token,
    lease_expires_at
  ) values (
    p_payment_fingerprint,
    p_request_fingerprint,
    p_client_request_id,
    p_environment,
    p_network,
    p_asset,
    p_amount_atomic,
    p_pay_to_hash,
    'processing',
    v_token,
    v_now + interval '5 minutes'
  )
  on conflict (payment_fingerprint_sha256) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return query select 'CLAIMED'::text, v_token, null::jsonb, null::text, null::text;
    return;
  end if;

  select * into v_row
  from public.coinbase_x402_deliveries d
  where d.payment_fingerprint_sha256 = p_payment_fingerprint
  for update;

  if not found then
    raise exception 'Coinbase x402 delivery row disappeared during claim';
  end if;

  if
    v_row.request_fingerprint_sha256 <> p_request_fingerprint
    or v_row.environment <> p_environment
    or v_row.network <> p_network
    or lower(v_row.asset) <> lower(p_asset)
    or v_row.amount_atomic <> p_amount_atomic
    or v_row.pay_to_hash <> p_pay_to_hash
  then
    return query select 'CONFLICT'::text, null::uuid, null::jsonb, v_row.settlement_tx, v_row.settlement_network;
    return;
  end if;

  if v_row.state = 'delivered' and v_row.response_payload is not null then
    return query select 'REPLAY'::text, null::uuid, v_row.response_payload, v_row.settlement_tx, v_row.settlement_network;
    return;
  end if;

  if v_row.state = 'manual_review' then
    return query select 'MANUAL_REVIEW'::text, null::uuid, null::jsonb, v_row.settlement_tx, v_row.settlement_network;
    return;
  end if;

  -- PREPARED is the irreversible-side-effect boundary. The application writes
  -- the prepared response before calling the external facilitator settle API.
  -- If that process loses its lease or response after this point, we cannot
  -- prove whether the external settlement happened. Never auto-reclaim and
  -- never submit the authorization again; lock it for reconciliation instead.
  if v_row.state = 'prepared' then
    if v_row.lease_expires_at is not null and v_row.lease_expires_at > v_now then
      return query select 'IN_PROGRESS'::text, null::uuid, null::jsonb, v_row.settlement_tx, v_row.settlement_network;
      return;
    end if;

    update public.coinbase_x402_deliveries d
    set
      state = 'manual_review',
      claim_token = null,
      lease_expires_at = null,
      failure_code = 'PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED',
      updated_at = v_now
    where d.id = v_row.id;

    return query select 'MANUAL_REVIEW'::text, null::uuid, null::jsonb, v_row.settlement_tx, v_row.settlement_network;
    return;
  end if;

  -- FAILED is only written before an external settlement call, unless the
  -- caller explicitly requests manual_review. It is safe to reclaim. An
  -- expired PROCESSING lease is also pre-settlement and safe to reclaim.
  if
    v_row.state = 'failed'
    or (
      v_row.state = 'processing'
      and (v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now)
    )
  then
    update public.coinbase_x402_deliveries d
    set
      state = case when d.response_payload is null then 'processing' else 'prepared' end,
      claim_token = v_token,
      lease_expires_at = v_now + interval '5 minutes',
      failure_code = null,
      updated_at = v_now
    where d.id = v_row.id;

    return query select 'CLAIMED'::text, v_token, v_row.response_payload, v_row.settlement_tx, v_row.settlement_network;
    return;
  end if;

  return query select 'IN_PROGRESS'::text, null::uuid, null::jsonb, v_row.settlement_tx, v_row.settlement_network;
end;
$$;

create or replace function public.prepare_coinbase_x402_delivery(
  p_payment_fingerprint text,
  p_claim_token uuid,
  p_response_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_response_payload is null then return false; end if;
  update public.coinbase_x402_deliveries d
  set
    state = 'prepared',
    response_payload = p_response_payload,
    updated_at = now(),
    lease_expires_at = now() + interval '5 minutes'
  where
    d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state in ('processing','prepared');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.complete_coinbase_x402_delivery(
  p_payment_fingerprint text,
  p_claim_token uuid,
  p_payer_hash text,
  p_settlement_tx text,
  p_settlement_network text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_payer_hash is not null and p_payer_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  if p_settlement_tx is null or p_settlement_tx !~ '^0x[a-fA-F0-9]{64}$' then return false; end if;

  update public.coinbase_x402_deliveries d
  set
    state = 'delivered',
    claim_token = null,
    lease_expires_at = null,
    payer_reference_hash = p_payer_hash,
    settlement_tx = p_settlement_tx,
    settlement_network = p_settlement_network,
    failure_code = null,
    settled_at = now(),
    delivered_at = now(),
    updated_at = now()
  where
    d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state = 'prepared'
    and d.response_payload is not null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.release_coinbase_x402_delivery(
  p_payment_fingerprint text,
  p_claim_token uuid,
  p_failure_code text,
  p_manual_review boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.coinbase_x402_deliveries d
  set
    state = case when p_manual_review then 'manual_review' else 'failed' end,
    claim_token = null,
    lease_expires_at = null,
    failure_code = left(coalesce(p_failure_code, 'UNKNOWN'), 160),
    updated_at = now()
  where
    d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state in ('processing','prepared');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_coinbase_x402_delivery(text,text,text,text,text,text,numeric,text)
  from PUBLIC, anon, authenticated;
revoke all on function public.prepare_coinbase_x402_delivery(text,uuid,jsonb)
  from PUBLIC, anon, authenticated;
revoke all on function public.complete_coinbase_x402_delivery(text,uuid,text,text,text)
  from PUBLIC, anon, authenticated;
revoke all on function public.release_coinbase_x402_delivery(text,uuid,text,boolean)
  from PUBLIC, anon, authenticated;

grant execute on function public.claim_coinbase_x402_delivery(text,text,text,text,text,text,numeric,text)
  to service_role;
grant execute on function public.prepare_coinbase_x402_delivery(text,uuid,jsonb)
  to service_role;
grant execute on function public.complete_coinbase_x402_delivery(text,uuid,text,text,text)
  to service_role;
grant execute on function public.release_coinbase_x402_delivery(text,uuid,text,boolean)
  to service_role;

comment on table public.coinbase_x402_deliveries is
  'Private replay-safe Coinbase CDP x402 delivery ledger. Stores hashes and prepared/delivered response state, never raw payment signatures, authorizations, API credentials, or wallet addresses.';
