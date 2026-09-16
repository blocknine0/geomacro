-- =============================================================================
-- Geomacro provider-neutral agent commerce delivery ledger
--
-- PURPOSE
-- - give Coinbase, GOAT, Nevermined and future payment rails one durable
--   payment-to-delivery/idempotency contract
-- - bind one provider payment proof/token fingerprint to one normalized request
-- - durably prepare the exact response before any external settlement side effect
-- - prevent replay/concurrent duplicate settlement and double charge
-- - lock ambiguous post-prepare outcomes for reconciliation instead of retrying
-- - persist only bounded references and hashes; never payment tokens/signatures,
--   wallet private material, API credentials, facilitator secrets, or auth headers
-- =============================================================================

create table if not exists public.agent_commerce_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_environment text not null,
  payment_fingerprint_sha256 text not null,
  request_fingerprint_sha256 text not null,
  product_id text not null,
  client_request_id text,
  source_channel text,
  rail text,
  network text,
  asset text,
  amount_atomic numeric(78,0),
  recipient_reference_hash text,
  payer_reference_hash text,
  state text not null default 'processing',
  claim_token uuid,
  lease_expires_at timestamptz,
  response_payload jsonb,
  response_sha256 text,
  settlement_reference text,
  settlement_network text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  delivered_at timestamptz,

  constraint agent_commerce_provider_check
    check (provider ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  constraint agent_commerce_environment_check
    check (provider_environment ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  constraint agent_commerce_payment_hash_check
    check (payment_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint agent_commerce_request_hash_check
    check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  constraint agent_commerce_response_hash_check
    check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$'),
  constraint agent_commerce_recipient_hash_check
    check (recipient_reference_hash is null or recipient_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_commerce_payer_hash_check
    check (payer_reference_hash is null or payer_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_commerce_product_check
    check (char_length(product_id) between 3 and 128),
  constraint agent_commerce_client_request_check
    check (client_request_id is null or char_length(client_request_id) between 4 and 128),
  constraint agent_commerce_source_channel_check
    check (source_channel is null or char_length(source_channel) between 1 and 96),
  constraint agent_commerce_rail_check
    check (rail is null or char_length(rail) between 1 and 96),
  constraint agent_commerce_network_check
    check (network is null or char_length(network) between 1 and 128),
  constraint agent_commerce_asset_check
    check (asset is null or char_length(asset) between 1 and 128),
  constraint agent_commerce_amount_check
    check (amount_atomic is null or amount_atomic > 0),
  constraint agent_commerce_settlement_reference_check
    check (settlement_reference is null or char_length(settlement_reference) between 1 and 256),
  constraint agent_commerce_settlement_network_check
    check (settlement_network is null or char_length(settlement_network) between 1 and 128),
  constraint agent_commerce_state_check
    check (state in ('processing','prepared','delivered','failed','manual_review'))
);

create unique index if not exists agent_commerce_payment_unique
  on public.agent_commerce_deliveries (provider, provider_environment, payment_fingerprint_sha256);
create unique index if not exists agent_commerce_settlement_reference_unique
  on public.agent_commerce_deliveries (provider, provider_environment, settlement_reference)
  where settlement_reference is not null;
create index if not exists agent_commerce_state_time_idx
  on public.agent_commerce_deliveries (state, updated_at desc);
create index if not exists agent_commerce_product_time_idx
  on public.agent_commerce_deliveries (product_id, created_at desc);
create index if not exists agent_commerce_source_time_idx
  on public.agent_commerce_deliveries (source_channel, created_at desc)
  where source_channel is not null;

alter table public.agent_commerce_deliveries enable row level security;
revoke all on table public.agent_commerce_deliveries from PUBLIC, anon, authenticated;
grant all on table public.agent_commerce_deliveries to service_role;

create or replace function public.claim_agent_commerce_delivery(
  p_provider text,
  p_provider_environment text,
  p_payment_fingerprint text,
  p_request_fingerprint text,
  p_product_id text,
  p_client_request_id text,
  p_source_channel text,
  p_rail text,
  p_network text,
  p_asset text,
  p_amount_atomic numeric,
  p_recipient_hash text
)
returns table (
  disposition text,
  claim_token uuid,
  response_payload jsonb,
  response_sha256 text,
  settlement_reference text,
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
  v_row public.agent_commerce_deliveries%rowtype;
begin
  if
    p_provider !~ '^[a-z0-9][a-z0-9_.-]{1,63}$'
    or p_provider_environment !~ '^[a-z0-9][a-z0-9_.-]{1,63}$'
    or p_payment_fingerprint !~ '^[0-9a-f]{64}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or char_length(p_product_id) not between 3 and 128
    or (p_client_request_id is not null and char_length(p_client_request_id) not between 4 and 128)
    or (p_source_channel is not null and char_length(p_source_channel) not between 1 and 96)
    or (p_rail is not null and char_length(p_rail) not between 1 and 96)
    or (p_network is not null and char_length(p_network) not between 1 and 128)
    or (p_asset is not null and char_length(p_asset) not between 1 and 128)
    or (p_amount_atomic is not null and p_amount_atomic <= 0)
    or (p_recipient_hash is not null and p_recipient_hash !~ '^[0-9a-f]{64}$')
  then
    raise exception 'invalid agent commerce delivery claim';
  end if;

  insert into public.agent_commerce_deliveries (
    provider,
    provider_environment,
    payment_fingerprint_sha256,
    request_fingerprint_sha256,
    product_id,
    client_request_id,
    source_channel,
    rail,
    network,
    asset,
    amount_atomic,
    recipient_reference_hash,
    state,
    claim_token,
    lease_expires_at
  ) values (
    p_provider,
    p_provider_environment,
    p_payment_fingerprint,
    p_request_fingerprint,
    p_product_id,
    p_client_request_id,
    p_source_channel,
    p_rail,
    p_network,
    p_asset,
    p_amount_atomic,
    p_recipient_hash,
    'processing',
    v_token,
    v_now + interval '5 minutes'
  )
  on conflict (provider, provider_environment, payment_fingerprint_sha256) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return query select 'CLAIMED'::text, v_token, null::jsonb, null::text, null::text, null::text;
    return;
  end if;

  select * into v_row
  from public.agent_commerce_deliveries d
  where d.provider = p_provider
    and d.provider_environment = p_provider_environment
    and d.payment_fingerprint_sha256 = p_payment_fingerprint
  for update;

  if not found then
    raise exception 'agent commerce delivery row disappeared during claim';
  end if;

  if
    v_row.request_fingerprint_sha256 <> p_request_fingerprint
    or v_row.product_id <> p_product_id
    or coalesce(v_row.rail, '') <> coalesce(p_rail, '')
    or coalesce(v_row.network, '') <> coalesce(p_network, '')
    or lower(coalesce(v_row.asset, '')) <> lower(coalesce(p_asset, ''))
    or v_row.amount_atomic is distinct from p_amount_atomic
    or v_row.recipient_reference_hash is distinct from p_recipient_hash
  then
    return query select 'CONFLICT'::text, null::uuid, null::jsonb, v_row.response_sha256,
      v_row.settlement_reference, v_row.settlement_network;
    return;
  end if;

  if v_row.state = 'delivered' and v_row.response_payload is not null then
    return query select 'REPLAY'::text, null::uuid, v_row.response_payload, v_row.response_sha256,
      v_row.settlement_reference, v_row.settlement_network;
    return;
  end if;

  if v_row.state = 'manual_review' then
    return query select 'MANUAL_REVIEW'::text, null::uuid, null::jsonb, v_row.response_sha256,
      v_row.settlement_reference, v_row.settlement_network;
    return;
  end if;

  -- PREPARED means the exact payload was durably written immediately before an
  -- external settlement side effect. If its lease expires, settlement may have
  -- happened even if the process never observed the response. Never retry it.
  if v_row.state = 'prepared' then
    if v_row.lease_expires_at is not null and v_row.lease_expires_at > v_now then
      return query select 'IN_PROGRESS'::text, null::uuid, null::jsonb, v_row.response_sha256,
        v_row.settlement_reference, v_row.settlement_network;
      return;
    end if;

    update public.agent_commerce_deliveries d
    set
      state = 'manual_review',
      claim_token = null,
      lease_expires_at = null,
      failure_code = 'PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED',
      updated_at = v_now
    where d.id = v_row.id;

    return query select 'MANUAL_REVIEW'::text, null::uuid, null::jsonb, v_row.response_sha256,
      v_row.settlement_reference, v_row.settlement_network;
    return;
  end if;

  -- FAILED and expired PROCESSING are pre-settlement states and may be safely
  -- reclaimed. A prepared response carried from a deliberately released
  -- pre-settlement attempt stays prepared but still requires a fresh claim.
  if
    v_row.state = 'failed'
    or (
      v_row.state = 'processing'
      and (v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now)
    )
  then
    update public.agent_commerce_deliveries d
    set
      state = case when d.response_payload is null then 'processing' else 'prepared' end,
      claim_token = v_token,
      lease_expires_at = v_now + interval '5 minutes',
      failure_code = null,
      updated_at = v_now
    where d.id = v_row.id;

    return query select 'CLAIMED'::text, v_token, v_row.response_payload, v_row.response_sha256,
      v_row.settlement_reference, v_row.settlement_network;
    return;
  end if;

  return query select 'IN_PROGRESS'::text, null::uuid, null::jsonb, v_row.response_sha256,
    v_row.settlement_reference, v_row.settlement_network;
end;
$$;

create or replace function public.prepare_agent_commerce_delivery(
  p_provider text,
  p_provider_environment text,
  p_payment_fingerprint text,
  p_claim_token uuid,
  p_response_payload jsonb,
  p_response_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_response_payload is null or p_response_sha256 !~ '^[0-9a-f]{64}$' then return false; end if;

  update public.agent_commerce_deliveries d
  set
    state = 'prepared',
    response_payload = p_response_payload,
    response_sha256 = p_response_sha256,
    updated_at = now(),
    lease_expires_at = now() + interval '5 minutes'
  where
    d.provider = p_provider
    and d.provider_environment = p_provider_environment
    and d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state in ('processing','prepared');

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.complete_agent_commerce_delivery(
  p_provider text,
  p_provider_environment text,
  p_payment_fingerprint text,
  p_claim_token uuid,
  p_payer_hash text,
  p_settlement_reference text,
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
  if p_settlement_reference is null or char_length(p_settlement_reference) not between 1 and 256 then return false; end if;
  if p_settlement_network is not null and char_length(p_settlement_network) not between 1 and 128 then return false; end if;

  update public.agent_commerce_deliveries d
  set
    state = 'delivered',
    claim_token = null,
    lease_expires_at = null,
    payer_reference_hash = p_payer_hash,
    settlement_reference = p_settlement_reference,
    settlement_network = p_settlement_network,
    failure_code = null,
    settled_at = now(),
    delivered_at = now(),
    updated_at = now()
  where
    d.provider = p_provider
    and d.provider_environment = p_provider_environment
    and d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state = 'prepared'
    and d.response_payload is not null
    and d.response_sha256 is not null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.release_agent_commerce_delivery(
  p_provider text,
  p_provider_environment text,
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
  update public.agent_commerce_deliveries d
  set
    state = case when p_manual_review then 'manual_review' else 'failed' end,
    claim_token = null,
    lease_expires_at = null,
    failure_code = left(coalesce(p_failure_code, 'UNKNOWN'), 160),
    updated_at = now()
  where
    d.provider = p_provider
    and d.provider_environment = p_provider_environment
    and d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state in ('processing','prepared');

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_agent_commerce_delivery(text,text,text,text,text,text,text,text,text,text,numeric,text)
  from PUBLIC, anon, authenticated;
revoke all on function public.prepare_agent_commerce_delivery(text,text,text,uuid,jsonb,text)
  from PUBLIC, anon, authenticated;
revoke all on function public.complete_agent_commerce_delivery(text,text,text,uuid,text,text,text)
  from PUBLIC, anon, authenticated;
revoke all on function public.release_agent_commerce_delivery(text,text,text,uuid,text,boolean)
  from PUBLIC, anon, authenticated;

grant execute on function public.claim_agent_commerce_delivery(text,text,text,text,text,text,text,text,text,text,numeric,text)
  to service_role;
grant execute on function public.prepare_agent_commerce_delivery(text,text,text,uuid,jsonb,text)
  to service_role;
grant execute on function public.complete_agent_commerce_delivery(text,text,text,uuid,text,text,text)
  to service_role;
grant execute on function public.release_agent_commerce_delivery(text,text,text,uuid,text,boolean)
  to service_role;

comment on table public.agent_commerce_deliveries is
  'Private provider-neutral payment-to-delivery ledger for agent commerce. Stores payment/request hashes and bounded settlement references; never raw payment tokens/signatures, credentials, auth headers, or wallet private material.';
