-- =============================================================================
-- GOAT partner-pilot paid-fulfillment concurrency hardening
--
-- Two status pollers can observe the same provider payment confirmation at the
-- same time. Serialize completion per request_id before checking/inserting the
-- immutable fulfillment/payment evidence so exact concurrent retries converge
-- on one payment record rather than racing a unique constraint.
-- =============================================================================

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

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_request_id::text,
      147
    )
  );

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

revoke all
on function public.complete_agent_goat_pilot_fulfillment(
  uuid,
  text,
  text,
  text,
  timestamptz
)
from PUBLIC, anon, authenticated;

grant execute
on function public.complete_agent_goat_pilot_fulfillment(
  uuid,
  text,
  text,
  text,
  timestamptz
)
to service_role;

comment on function public.complete_agent_goat_pilot_fulfillment(uuid, text, text, text, timestamptz) is
  'Serializes exact GOAT paid-fulfillment reconciliation per request and writes one payment-to-resource evidence chain.';
