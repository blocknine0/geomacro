-- =============================================================================
-- Geomacro production agent-commerce reconciliation gate
--
-- PURPOSE
-- - promote a settled production payment to reconciled commercial revenue only
--   when the provider payment event, provider-neutral delivery ledger and
--   successful usage record all agree
-- - make reconciliation transactional and idempotent
-- - prevent manual or application-side toggling of commercial_revenue without
--   delivery evidence
-- =============================================================================

create or replace function public.reconcile_agent_commerce_payment(
  p_payment_event_id uuid,
  p_reconciliation_reference text,
  p_expected_provider_settlement_id text,
  p_expected_response_sha256 text
)
returns table (
  payment_event_id uuid,
  reconciliation_status text,
  revenue_classification text,
  commercial_revenue boolean,
  delivery_id uuid,
  response_sha256 text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.commercial_payment_events%rowtype;
  v_delivery public.agent_commerce_deliveries%rowtype;
  v_delivery_provider text;
  v_usage_count bigint;
  v_network_ok boolean := false;
begin
  if p_payment_event_id is null then
    raise exception 'payment event id is required';
  end if;
  if p_reconciliation_reference is null
     or char_length(trim(p_reconciliation_reference)) not between 8 and 180 then
    raise exception 'bounded reconciliation reference is required';
  end if;
  if p_expected_provider_settlement_id is null
     or char_length(trim(p_expected_provider_settlement_id)) not between 1 and 256 then
    raise exception 'expected provider settlement id is required';
  end if;
  if p_expected_response_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'expected response sha256 is invalid';
  end if;

  select *
    into v_payment
  from public.commercial_payment_events p
  where p.id = p_payment_event_id
  for update;

  if not found then
    raise exception 'commercial payment event not found';
  end if;

  -- Idempotent success path.
  if v_payment.reconciliation_status = 'matched'
     and v_payment.revenue_classification = 'commercial_revenue'
     and v_payment.commercial_revenue is true then
    select *
      into v_delivery
    from public.agent_commerce_deliveries d
    where d.settlement_reference = v_payment.provider_settlement_id
      and d.response_sha256 = p_expected_response_sha256
      and d.state = 'delivered'
    limit 1;

    if not found then
      raise exception 'previously reconciled payment has no matching delivered ledger row';
    end if;

    return query
      select v_payment.id, v_payment.reconciliation_status,
             v_payment.revenue_classification, v_payment.commercial_revenue,
             v_delivery.id, v_delivery.response_sha256;
    return;
  end if;

  if v_payment.environment not in ('mainnet','fiat') then
    raise exception 'only mainnet or fiat payment events can become commercial revenue';
  end if;
  if v_payment.payment_status <> 'settled' then
    raise exception 'payment must be settled before reconciliation';
  end if;
  if v_payment.reconciliation_status not in ('pending','manual_review') then
    raise exception 'payment reconciliation state is not eligible for matching';
  end if;
  if v_payment.revenue_classification <> 'commercial_pending_accounting'
     or v_payment.commercial_revenue is true then
    raise exception 'payment is not in pending commercial accounting state';
  end if;
  if trim(coalesce(v_payment.provider_settlement_id, '')) <> trim(p_expected_provider_settlement_id) then
    raise exception 'provider settlement id does not match the expected reconciliation input';
  end if;

  v_delivery_provider :=
    case v_payment.provider
      when 'coinbase_cdp_x402' then 'coinbase_x402'
      when 'circle_gateway_x402' then 'circle_gateway_x402'
      when 'nevermined_x402' then 'nevermined'
      else null
    end;

  if v_delivery_provider is null then
    raise exception 'unsupported production agent-commerce provider';
  end if;

  select *
    into v_delivery
  from public.agent_commerce_deliveries d
  where d.provider = v_delivery_provider
    and d.provider_environment = v_payment.provider_environment
    and d.settlement_reference = v_payment.provider_settlement_id
  order by d.updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'matching provider-neutral delivery record was not found';
  end if;

  if v_delivery.state <> 'delivered'
     or v_delivery.delivered_at is null
     or v_delivery.settled_at is null then
    raise exception 'delivery record is not durably settled and delivered';
  end if;
  if v_delivery.response_sha256 <> p_expected_response_sha256 then
    raise exception 'delivered response hash does not match expected reconciliation evidence';
  end if;
  if v_delivery.response_payload is null then
    raise exception 'delivered response payload is missing';
  end if;
  if coalesce((v_delivery.response_payload ->> 'execution_authorized')::boolean, false) is distinct from false then
    raise exception 'execution boundary violated in delivered response';
  end if;

  if v_payment.provider_payment_id is not null
     and v_payment.provider_payment_id <> v_delivery.payment_fingerprint_sha256 then
    raise exception 'payment fingerprint mismatch';
  end if;
  if v_payment.amount_atomic is not null
     and v_delivery.amount_atomic is not null
     and v_payment.amount_atomic <> v_delivery.amount_atomic then
    raise exception 'payment amount mismatch';
  end if;
  if v_payment.recipient_reference_hash is not null
     and v_delivery.recipient_reference_hash is not null
     and v_payment.recipient_reference_hash <> v_delivery.recipient_reference_hash then
    raise exception 'payment recipient mismatch';
  end if;
  if v_payment.payer_reference_hash is not null
     and v_delivery.payer_reference_hash is not null
     and v_payment.payer_reference_hash <> v_delivery.payer_reference_hash then
    raise exception 'payment payer mismatch';
  end if;

  v_network_ok :=
    coalesce(v_payment.network_name, '') = coalesce(v_delivery.settlement_network, '')
    or (
      v_payment.chain_id is not null
      and v_delivery.settlement_network = 'eip155:' || v_payment.chain_id
    )
    or (
      lower(coalesce(v_payment.network_name, '')) = 'base'
      and v_payment.chain_id = '8453'
      and v_delivery.settlement_network in ('Base','base','eip155:8453')
    );

  if not v_network_ok then
    raise exception 'payment network mismatch';
  end if;

  select count(*)
    into v_usage_count
  from public.commercial_usage_events u
  where u.payment_event_id = v_payment.id
    and u.environment = v_payment.environment
    and u.access_surface = 'agent_payment'
    and u.success is true
    and u.execution_authorized is false
    and u.response_sha256 = v_delivery.response_sha256;

  if v_usage_count < 1 then
    raise exception 'successful delivery usage evidence is missing';
  end if;

  update public.commercial_payment_events p
  set
    reconciliation_status = 'matched',
    reconciliation_reference = trim(p_reconciliation_reference),
    revenue_classification = 'commercial_revenue',
    commercial_revenue = true,
    metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'reconciled_agent_commerce_delivery_id', v_delivery.id,
      'reconciled_response_sha256', v_delivery.response_sha256,
      'reconciled_at', now(),
      'reconciliation_contract', 'agent-commerce-v1'
    )
  where p.id = v_payment.id
  returning * into v_payment;

  return query
    select v_payment.id, v_payment.reconciliation_status,
           v_payment.revenue_classification, v_payment.commercial_revenue,
           v_delivery.id, v_delivery.response_sha256;
end;
$$;

revoke all on function public.reconcile_agent_commerce_payment(uuid,text,text,text)
  from PUBLIC, anon, authenticated;
grant execute on function public.reconcile_agent_commerce_payment(uuid,text,text,text)
  to service_role;

comment on function public.reconcile_agent_commerce_payment(uuid,text,text,text) is
  'Promotes one settled production agent-commerce payment to reconciled commercial revenue only when the payment event, delivered provider-neutral ledger row and successful usage evidence all match.';
