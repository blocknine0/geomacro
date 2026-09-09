-- =============================================================================
-- Geomacro GOAT x402 partner pilot evidence chain
--
-- PURPOSE
-- - bind one client idempotency identity to one exact paid intelligence request
-- - preserve the prepared structured intelligence resource before payment
-- - preserve the normalized GOAT payment challenge after order creation
-- - reconcile one confirmed GOAT settlement to one delivered resource
--
-- SECURITY / COMMERCIAL BOUNDARY
-- - structured intelligence only; no raw/private warehouse rows
-- - no wallet private keys or merchant secrets stored here
-- - testnet and mainnet remain explicitly separated
-- - testnet records are never revenue evidence
-- - execution_authorized=false is enforced in stored/delivered resource evidence
-- - service-role only
-- =============================================================================

create table if not exists public.agent_goat_pilot_requests (
  request_id uuid primary key
    references public.agent_api_requests(id),

  external_agent_id text not null,
  idempotency_key text not null,
  request_hash text not null
    check (request_hash ~ '^[a-f0-9]{64}$'),

  sku text not null
    check (sku = 'risk_preflight_v1'),

  environment text not null
    check (environment in ('testnet3', 'mainnet')),

  merchant_id text not null,
  payer_address text not null
    check (payer_address ~ '^0x[0-9a-f]{40}$'),

  token_symbol text not null
    check (token_symbol ~ '^[A-Z0-9][A-Z0-9._-]{1,15}$'),

  token_contract text not null
    check (token_contract ~ '^0x[0-9a-f]{40}$'),

  amount_wei text not null
    check (amount_wei ~ '^(0|[1-9][0-9]{0,77})$'),

  created_at timestamptz not null default now(),

  unique (external_agent_id, idempotency_key)
);

create index if not exists
  agent_goat_pilot_requests_created_idx
on public.agent_goat_pilot_requests (
  created_at desc
);


create table if not exists public.agent_goat_pilot_resources (
  request_id uuid primary key
    references public.agent_goat_pilot_requests(request_id),

  resource_hash text not null
    check (resource_hash ~ '^[a-f0-9]{64}$'),

  payload jsonb not null,

  prepared_at timestamptz not null default now(),

  constraint agent_goat_pilot_resource_execution_check
    check (
      (
        jsonb_typeof(payload) = 'object'
        and payload ->> 'ok' = 'true'
        and payload -> 'risk_gate' -> 'execution_authorized' = 'false'::jsonb
        and payload -> 'boundaries' -> 'execution_authorized' = 'false'::jsonb
      ) is true
    )
);


create table if not exists public.agent_goat_order_challenges (
  request_id uuid primary key
    references public.agent_goat_pilot_requests(request_id),

  goat_order_id text not null unique,
  challenge_hash text not null
    check (challenge_hash ~ '^[a-f0-9]{64}$'),
  challenge jsonb not null,
  created_at timestamptz not null default now(),

  constraint agent_goat_order_challenge_shape_check
    check (
      (
        jsonb_typeof(challenge) = 'object'
        and challenge ->> 'x402_version' = '2'
        and challenge ->> 'order_id' = goat_order_id
        and challenge ->> 'flow' = 'ERC20_DIRECT'
        and challenge ->> 'dapp_order_id' is not null
        and challenge ->> 'token_symbol' is not null
        and challenge ->> 'token_contract' is not null
        and challenge ->> 'pay_to' is not null
        and challenge ->> 'from_address' is not null
        and challenge ->> 'amount_wei' is not null
      ) is true
    )
);


create table if not exists public.agent_goat_pilot_fulfillments (
  request_id uuid primary key
    references public.agent_goat_pilot_requests(request_id),

  payment_id uuid not null unique
    references public.agent_payments(id),

  goat_order_id text not null unique,
  tx_hash text not null unique
    check (tx_hash ~ '^0x[0-9a-f]{64}$'),

  resource_hash text not null
    check (resource_hash ~ '^[a-f0-9]{64}$'),

  execution_authorized boolean not null default false
    check (execution_authorized = false),

  delivered_at timestamptz not null,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Immutable evidence rows.
-- GOAT provider lifecycle remains mutable only in agent_goat_orders; prepared
-- resource/challenge/final fulfillment evidence must never be rewritten.
-- ---------------------------------------------------------------------------

create or replace function
  public.prevent_agent_goat_pilot_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'GOAT partner-pilot evidence records are immutable';
end;
$$;

create trigger agent_goat_pilot_requests_immutable
before update or delete
on public.agent_goat_pilot_requests
for each row
execute function public.prevent_agent_goat_pilot_evidence_mutation();

create trigger agent_goat_pilot_resources_immutable
before update or delete
on public.agent_goat_pilot_resources
for each row
execute function public.prevent_agent_goat_pilot_evidence_mutation();

create trigger agent_goat_order_challenges_immutable
before update or delete
on public.agent_goat_order_challenges
for each row
execute function public.prevent_agent_goat_pilot_evidence_mutation();

create trigger agent_goat_pilot_fulfillments_immutable
before update or delete
on public.agent_goat_pilot_fulfillments
for each row
execute function public.prevent_agent_goat_pilot_evidence_mutation();


-- ---------------------------------------------------------------------------
-- Claim one commercial/test request identity.
-- The advisory transaction lock serializes only this hashed client/idempotency
-- identity. Same identity + different canonical request hash fails closed.
-- ---------------------------------------------------------------------------

create or replace function
  public.claim_agent_goat_pilot_request(
    p_external_agent_id text,
    p_idempotency_key text,
    p_request_hash text,
    p_environment text,
    p_merchant_id text,
    p_payer_address text,
    p_token_symbol text,
    p_token_contract text,
    p_amount_wei text
  )
returns table (
  disposition text,
  request_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.agent_goat_pilot_requests%rowtype;
  v_request_id uuid := gen_random_uuid();
begin
  if
    p_external_agent_id is null
    or char_length(p_external_agent_id) < 1
    or char_length(p_external_agent_id) > 256
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$'
    or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_environment not in ('testnet3', 'mainnet')
    or p_merchant_id is null
    or char_length(p_merchant_id) < 1
    or char_length(p_merchant_id) > 128
    or p_payer_address !~ '^0x[0-9a-f]{40}$'
    or p_token_symbol !~ '^[A-Z0-9][A-Z0-9._-]{1,15}$'
    or p_token_contract !~ '^0x[0-9a-f]{40}$'
    or p_amount_wei !~ '^(0|[1-9][0-9]{0,77})$'
    or p_amount_wei::numeric <= 0
  then
    raise exception
      'invalid GOAT partner-pilot request claim';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_external_agent_id || ':' || p_idempotency_key,
      0
    )
  );

  select *
  into v_existing
  from public.agent_goat_pilot_requests pilot
  where
    pilot.external_agent_id = p_external_agent_id
    and pilot.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.request_hash <> p_request_hash then
      return query
      select
        'CONFLICT'::text,
        v_existing.request_id;
      return;
    end if;

    return query
    select
      'REPLAY'::text,
      v_existing.request_id;
    return;
  end if;

  insert into public.agent_api_requests (
    id,
    capability,
    external_agent_id,
    idempotency_key,
    status,
    response_code
  )
  values (
    v_request_id,
    'goat_risk_preflight_v1',
    p_external_agent_id,
    p_idempotency_key,
    'started',
    'GOAT_PILOT_PREPARING'
  );

  insert into public.agent_goat_pilot_requests (
    request_id,
    external_agent_id,
    idempotency_key,
    request_hash,
    sku,
    environment,
    merchant_id,
    payer_address,
    token_symbol,
    token_contract,
    amount_wei
  )
  values (
    v_request_id,
    p_external_agent_id,
    p_idempotency_key,
    p_request_hash,
    'risk_preflight_v1',
    p_environment,
    p_merchant_id,
    p_payer_address,
    p_token_symbol,
    p_token_contract,
    p_amount_wei
  );

  return query
  select
    'CLAIMED'::text,
    v_request_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- Atomically bind a successfully-created GOAT order and normalized challenge
-- to the exact durable creation claim. The provider call must already have been
-- marked attempted, making ambiguous provider creation non-reclaimable.
-- ---------------------------------------------------------------------------

create or replace function
  public.persist_agent_goat_pilot_order(
    p_request_id uuid,
    p_claim_token uuid,
    p_goat_order_id text,
    p_dapp_order_id text,
    p_pay_to_address text,
    p_payment_flow text,
    p_expires_at timestamptz,
    p_challenge_hash text,
    p_challenge jsonb
  )
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pilot public.agent_goat_pilot_requests%rowtype;
  v_claim public.agent_goat_order_creation_claims%rowtype;
  v_existing public.agent_goat_orders%rowtype;
  v_existing_challenge public.agent_goat_order_challenges%rowtype;
begin
  select *
  into v_pilot
  from public.agent_goat_pilot_requests pilot
  where pilot.request_id = p_request_id
  limit 1;

  if not found then
    raise exception 'GOAT pilot request does not exist';
  end if;

  select *
  into v_claim
  from public.agent_goat_order_creation_claims claim
  where
    claim.request_id = p_request_id
    and claim.claim_token = p_claim_token
    and claim.dapp_order_id = p_dapp_order_id
    and claim.provider_creation_attempted_at is not null
  limit 1;

  if not found then
    raise exception 'GOAT order creation claim is not owned/attempted';
  end if;

  if
    p_goat_order_id is null
    or char_length(p_goat_order_id) < 1
    or char_length(p_goat_order_id) > 256
    or p_dapp_order_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_pay_to_address !~ '^0x[0-9a-f]{40}$'
    or p_payment_flow <> 'ERC20_DIRECT'
    or p_expires_at <= now()
    or p_challenge_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_challenge) <> 'object'
  then
    raise exception 'invalid GOAT order persistence payload';
  end if;

  if not (
    p_challenge ->> 'order_id' = p_goat_order_id
    and p_challenge ->> 'dapp_order_id' = p_dapp_order_id
    and p_challenge ->> 'from_address' = v_pilot.payer_address
    and p_challenge ->> 'token_symbol' = v_pilot.token_symbol
    and p_challenge ->> 'token_contract' = v_pilot.token_contract
    and p_challenge ->> 'amount_wei' = v_pilot.amount_wei
    and p_challenge ->> 'pay_to' = p_pay_to_address
    and p_challenge ->> 'flow' = 'ERC20_DIRECT'
    and (p_challenge ->> 'chain_id')::bigint =
      case when v_pilot.environment = 'testnet3' then 48816 else 2345 end
  ) then
    raise exception 'GOAT challenge does not match persisted pilot terms';
  end if;

  select *
  into v_existing
  from public.agent_goat_orders o
  where o.request_id = p_request_id
  limit 1;

  if found then
    select *
    into v_existing_challenge
    from public.agent_goat_order_challenges c
    where c.request_id = p_request_id
    limit 1;

    if
      v_existing.goat_order_id = p_goat_order_id
      and v_existing.dapp_order_id = p_dapp_order_id
      and v_existing_challenge.challenge_hash = p_challenge_hash
    then
      return true;
    end if;

    raise exception 'conflicting GOAT order already exists for request';
  end if;

  insert into public.agent_goat_orders (
    request_id,
    goat_order_id,
    dapp_order_id,
    payer_address,
    source_chain_id,
    token_symbol,
    token_contract,
    amount_wei,
    pay_to_address,
    order_status,
    payment_flow,
    expires_at
  )
  values (
    p_request_id,
    p_goat_order_id,
    p_dapp_order_id,
    v_pilot.payer_address,
    case when v_pilot.environment = 'testnet3' then 48816 else 2345 end,
    v_pilot.token_symbol,
    v_pilot.token_contract,
    v_pilot.amount_wei,
    p_pay_to_address,
    'CHECKOUT_VERIFIED',
    'ERC20_DIRECT',
    p_expires_at
  );

  insert into public.agent_goat_order_challenges (
    request_id,
    goat_order_id,
    challenge_hash,
    challenge
  )
  values (
    p_request_id,
    p_goat_order_id,
    p_challenge_hash,
    p_challenge
  );

  update public.agent_api_requests req
  set
    status = 'payment_required',
    http_status = 402,
    response_code = 'GOAT_X402_PAYMENT_REQUIRED',
    updated_at = now()
  where req.id = p_request_id;

  update public.agent_goat_order_creation_claims claim
  set
    lease_expires_at = now(),
    updated_at = now()
  where
    claim.request_id = p_request_id
    and claim.claim_token = p_claim_token;

  return true;
end;
$$;


-- ---------------------------------------------------------------------------
-- Complete exactly one paid fulfillment from an already server-verified GOAT
-- order status. The transaction hash is the provider/payment identity.
-- ---------------------------------------------------------------------------

create or replace function
  public.complete_agent_goat_pilot_fulfillment(
    p_request_id uuid,
    p_goat_order_id text,
    p_order_status text,
    p_tx_hash text,
    p_confirmed_at timestamptz
  )
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.agent_goat_orders%rowtype;
  v_resource public.agent_goat_pilot_resources%rowtype;
  v_existing public.agent_goat_pilot_fulfillments%rowtype;
  v_payment_id uuid;
begin
  if
    p_order_status not in ('PAYMENT_CONFIRMED', 'INVOICED')
    or p_tx_hash !~ '^0x[0-9a-f]{64}$'
    or p_confirmed_at is null
  then
    raise exception 'invalid GOAT paid-fulfillment payload';
  end if;

  select *
  into v_order
  from public.agent_goat_orders o
  where
    o.request_id = p_request_id
    and o.goat_order_id = p_goat_order_id
  for update;

  if not found then
    raise exception 'GOAT order does not exist for fulfillment';
  end if;

  select *
  into v_resource
  from public.agent_goat_pilot_resources resource
  where resource.request_id = p_request_id
  limit 1;

  if not found then
    raise exception 'prepared GOAT intelligence resource is unavailable';
  end if;

  if
    v_resource.payload -> 'risk_gate' -> 'execution_authorized'
      is distinct from 'false'::jsonb
    or v_resource.payload -> 'boundaries' -> 'execution_authorized'
      is distinct from 'false'::jsonb
  then
    raise exception 'GOAT resource violates execution boundary';
  end if;

  select *
  into v_existing
  from public.agent_goat_pilot_fulfillments fulfillment
  where fulfillment.request_id = p_request_id
  limit 1;

  if found then
    if
      v_existing.goat_order_id = p_goat_order_id
      and v_existing.tx_hash = p_tx_hash
      and v_existing.resource_hash = v_resource.resource_hash
    then
      return v_existing.payment_id;
    end if;

    raise exception 'conflicting GOAT fulfillment already exists';
  end if;

  if exists (
    select 1
    from public.agent_payments payment
    where
      payment.provider = 'x402'
      and payment.provider_reference = p_tx_hash
      and payment.request_id <> p_request_id
  ) then
    raise exception 'GOAT transaction hash is already assigned to another request';
  end if;

  insert into public.agent_payments (
    request_id,
    provider,
    status,
    amount,
    asset,
    network,
    rail,
    provider_reference,
    settled_at
  )
  values (
    p_request_id,
    'x402',
    'settled',
    v_order.amount_wei,
    v_order.token_symbol,
    'eip155:' || v_order.source_chain_id::text,
    'goat_flow_direct',
    p_tx_hash,
    p_confirmed_at
  )
  returning id into v_payment_id;

  update public.agent_goat_orders o
  set
    order_status = p_order_status,
    tx_hash = p_tx_hash,
    confirmed_at = p_confirmed_at,
    updated_at = now()
  where o.request_id = p_request_id;

  update public.agent_api_requests req
  set
    payment_id = v_payment_id,
    status = 'delivered',
    http_status = 200,
    response_code = 'GOAT_X402_SETTLED_DELIVERED',
    completed_at = p_confirmed_at,
    updated_at = now()
  where req.id = p_request_id;

  insert into public.agent_goat_pilot_fulfillments (
    request_id,
    payment_id,
    goat_order_id,
    tx_hash,
    resource_hash,
    execution_authorized,
    delivered_at
  )
  values (
    p_request_id,
    v_payment_id,
    p_goat_order_id,
    p_tx_hash,
    v_resource.resource_hash,
    false,
    p_confirmed_at
  );

  return v_payment_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- RLS / privileges
-- ---------------------------------------------------------------------------

alter table public.agent_goat_pilot_requests enable row level security;
alter table public.agent_goat_pilot_resources enable row level security;
alter table public.agent_goat_order_challenges enable row level security;
alter table public.agent_goat_pilot_fulfillments enable row level security;

revoke all on table public.agent_goat_pilot_requests
  from PUBLIC, anon, authenticated;
revoke all on table public.agent_goat_pilot_resources
  from PUBLIC, anon, authenticated;
revoke all on table public.agent_goat_order_challenges
  from PUBLIC, anon, authenticated;
revoke all on table public.agent_goat_pilot_fulfillments
  from PUBLIC, anon, authenticated;

grant all on table public.agent_goat_pilot_requests to service_role;
grant all on table public.agent_goat_pilot_resources to service_role;
grant all on table public.agent_goat_order_challenges to service_role;
grant all on table public.agent_goat_pilot_fulfillments to service_role;

revoke all on function public.claim_agent_goat_pilot_request(
  text, text, text, text, text, text, text, text, text
) from PUBLIC, anon, authenticated;
revoke all on function public.persist_agent_goat_pilot_order(
  uuid, uuid, text, text, text, text, timestamptz, text, jsonb
) from PUBLIC, anon, authenticated;
revoke all on function public.complete_agent_goat_pilot_fulfillment(
  uuid, text, text, text, timestamptz
) from PUBLIC, anon, authenticated;

grant execute on function public.claim_agent_goat_pilot_request(
  text, text, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.persist_agent_goat_pilot_order(
  uuid, uuid, text, text, text, text, timestamptz, text, jsonb
) to service_role;
grant execute on function public.complete_agent_goat_pilot_fulfillment(
  uuid, text, text, text, timestamptz
) to service_role;

revoke all on function public.prevent_agent_goat_pilot_evidence_mutation()
  from PUBLIC, anon, authenticated;
grant execute on function public.prevent_agent_goat_pilot_evidence_mutation()
  to service_role;

comment on table public.agent_goat_pilot_resources is
  'Immutable structured intelligence resource prepared before GOAT payment; delivery is permitted only after verified settlement and execution_authorized=false.';

comment on table public.agent_goat_order_challenges is
  'Immutable normalized GOAT Flow x402 challenge evidence. Does not store merchant secrets or buyer private keys.';

comment on table public.agent_goat_pilot_fulfillments is
  'Immutable mapping from one confirmed GOAT settlement to one exact prepared Geomacro intelligence resource.';
