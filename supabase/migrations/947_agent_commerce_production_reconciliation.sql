-- =============================================================================
-- Geomacro production agent-commerce reconciliation gate
--
-- PURPOSE
-- - promote a settled production payment to reconciled commercial revenue only
--   when provider settlement, durable delivery and successful usage evidence agree
-- - support the mature Coinbase-specific delivery ledger plus the provider-neutral
--   Circle/Nevermined ledger without weakening either replay boundary
-- - make reconciliation transactional, idempotent and service-role RPC-only
-- =============================================================================

-- Coinbase predates the provider-neutral ledger. Preserve that proven state
-- machine but add the exact prepared-response hash needed for independent
-- production reconciliation.
alter table public.coinbase_x402_deliveries
  add column if not exists response_sha256 text;

alter table public.coinbase_x402_deliveries
  drop constraint if exists coinbase_x402_response_sha256_check;
alter table public.coinbase_x402_deliveries
  add constraint coinbase_x402_response_sha256_check
  check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$');

create or replace function public.prepare_coinbase_x402_delivery(
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
  if p_response_payload is null or p_response_sha256 !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.coinbase_x402_deliveries d
  set
    state = 'prepared',
    response_payload = p_response_payload,
    response_sha256 = p_response_sha256,
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

revoke all on function public.prepare_coinbase_x402_delivery(text,uuid,jsonb,text)
  from PUBLIC, anon, authenticated;
grant execute on function public.prepare_coinbase_x402_delivery(text,uuid,jsonb,text)
  to service_role;

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

  v_delivery_id uuid;
  v_delivery_state text;
  v_delivery_environment text;
  v_delivery_payment_fingerprint text;
  v_delivery_response_payload jsonb;
  v_delivery_response_sha256 text;
  v_delivery_settlement_reference text;
  v_delivery_settlement_network text;
  v_delivery_amount numeric(78,0);
  v_delivery_recipient_hash text;
  v_delivery_payer_hash text;
  v_delivery_settled_at timestamptz;
  v_delivery_delivered_at timestamptz;

  v_delivery_provider text;
  v_usage_count bigint := 0;
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

  if v_payment.environment not in ('mainnet','fiat') then
    raise exception 'only mainnet or fiat payment events can become commercial revenue';
  end if;
  if v_payment.payment_status <> 'settled' then
    raise exception 'payment must be settled before reconciliation';
  end if;
  if trim(coalesce(v_payment.provider_settlement_id, '')) <> trim(p_expected_provider_settlement_id) then
    raise exception 'provider settlement id does not match expected reconciliation evidence';
  end if;

  -- Load the durable delivery state. Coinbase keeps its original dedicated
  -- ledger; Circle and Nevermined use the provider-neutral ledger.
  if v_payment.provider = 'coinbase_cdp_x402' then
    select
      d.id,
      d.state,
      d.environment,
      d.payment_fingerprint_sha256,
      d.response_payload,
      d.response_sha256,
      d.settlement_tx,
      d.settlement_network,
      d.amount_atomic,
      d.pay_to_hash,
      d.payer_reference_hash,
      d.settled_at,
      d.delivered_at
    into
      v_delivery_id,
      v_delivery_state,
      v_delivery_environment,
      v_delivery_payment_fingerprint,
      v_delivery_response_payload,
      v_delivery_response_sha256,
      v_delivery_settlement_reference,
      v_delivery_settlement_network,
      v_delivery_amount,
      v_delivery_recipient_hash,
      v_delivery_payer_hash,
      v_delivery_settled_at,
      v_delivery_delivered_at
    from public.coinbase_x402_deliveries d
    where d.environment = 'mainnet'
      and d.settlement_tx = v_payment.provider_settlement_id
    order by d.updated_at desc
    limit 1
    for update;

    if not found then
      raise exception 'matching Coinbase delivery record was not found';
    end if;
  else
    v_delivery_provider :=
      case v_payment.provider
        when 'circle_gateway_x402' then 'circle_gateway_x402'
        when 'nevermined_x402' then 'nevermined'
        else null
      end;

    if v_delivery_provider is null then
      raise exception 'unsupported production agent-commerce provider';
    end if;

    select
      d.id,
      d.state,
      d.provider_environment,
      d.payment_fingerprint_sha256,
      d.response_payload,
      d.response_sha256,
      d.settlement_reference,
      d.settlement_network,
      d.amount_atomic,
      d.recipient_reference_hash,
      d.payer_reference_hash,
      d.settled_at,
      d.delivered_at
    into
      v_delivery_id,
      v_delivery_state,
      v_delivery_environment,
      v_delivery_payment_fingerprint,
      v_delivery_response_payload,
      v_delivery_response_sha256,
      v_delivery_settlement_reference,
      v_delivery_settlement_network,
      v_delivery_amount,
      v_delivery_recipient_hash,
      v_delivery_payer_hash,
      v_delivery_settled_at,
      v_delivery_delivered_at
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
  end if;

  if v_delivery_state <> 'delivered'
     or v_delivery_delivered_at is null
     or v_delivery_settled_at is null then
    raise exception 'delivery record is not durably settled and delivered';
  end if;
  if v_delivery_response_sha256 <> p_expected_response_sha256 then
    raise exception 'delivered response hash does not match expected reconciliation evidence';
  end if;
  if v_delivery_response_payload is null then
    raise exception 'delivered response payload is missing';
  end if;
  if coalesce((v_delivery_response_payload ->> 'execution_authorized')::boolean, false) is distinct from false then
    raise exception 'execution boundary violated in delivered response';
  end if;
  if trim(coalesce(v_delivery_settlement_reference, '')) <> trim(v_payment.provider_settlement_id) then
    raise exception 'delivery settlement reference mismatch';
  end if;

  if v_payment.provider_payment_id is not null
     and v_payment.provider_payment_id <> v_delivery_payment_fingerprint then
    raise exception 'payment fingerprint mismatch';
  end if;
  if v_payment.amount_atomic is not null
     and v_delivery_amount is not null
     and v_payment.amount_atomic <> v_delivery_amount then
    raise exception 'payment amount mismatch';
  end if;
  if v_payment.recipient_reference_hash is not null
     and v_delivery_recipient_hash is not null
     and v_payment.recipient_reference_hash <> v_delivery_recipient_hash then
    raise exception 'payment recipient mismatch';
  end if;
  if v_payment.payer_reference_hash is not null
     and v_delivery_payer_hash is not null
     and v_payment.payer_reference_hash <> v_delivery_payer_hash then
    raise exception 'payment payer mismatch';
  end if;

  v_network_ok :=
    coalesce(v_payment.network_name, '') = coalesce(v_delivery_settlement_network, '')
    or (
      v_payment.chain_id is not null
      and v_delivery_settlement_network = 'eip155:' || v_payment.chain_id
    )
    or (
      lower(coalesce(v_payment.network_name, '')) = 'base'
      and v_payment.chain_id = '8453'
      and lower(coalesce(v_delivery_settlement_network, '')) in ('base','eip155:8453')
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
    and u.response_sha256 = v_delivery_response_sha256;

  if v_usage_count < 1 then
    raise exception 'successful delivery usage evidence is missing';
  end if;

  -- Idempotent success is allowed only after the same evidence has just been
  -- proven again above.
  if v_payment.reconciliation_status = 'matched'
     and v_payment.revenue_classification = 'commercial_revenue'
     and v_payment.commercial_revenue is true then
    return query
      select v_payment.id, v_payment.reconciliation_status,
             v_payment.revenue_classification, v_payment.commercial_revenue,
             v_delivery_id, v_delivery_response_sha256;
    return;
  end if;

  if v_payment.reconciliation_status not in ('pending','manual_review') then
    raise exception 'payment reconciliation state is not eligible for matching';
  end if;
  if v_payment.revenue_classification <> 'commercial_pending_accounting'
     or v_payment.commercial_revenue is true then
    raise exception 'payment is not in pending commercial accounting state';
  end if;

  update public.commercial_payment_events p
  set
    reconciliation_status = 'matched',
    reconciliation_reference = trim(p_reconciliation_reference),
    revenue_classification = 'commercial_revenue',
    commercial_revenue = true,
    metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'reconciled_agent_commerce_delivery_id', v_delivery_id,
      'reconciled_response_sha256', v_delivery_response_sha256,
      'reconciled_at', now(),
      'reconciliation_contract', 'agent-commerce-v1'
    )
  where p.id = v_payment.id
  returning * into v_payment;

  return query
    select v_payment.id, v_payment.reconciliation_status,
           v_payment.revenue_classification, v_payment.commercial_revenue,
           v_delivery_id, v_delivery_response_sha256;
end;
$$;

revoke all on function public.reconcile_agent_commerce_payment(uuid,text,text,text)
  from PUBLIC, anon, authenticated;
grant execute on function public.reconcile_agent_commerce_payment(uuid,text,text,text)
  to service_role;

-- For the three production agent-commerce rails, direct column promotion is
-- denied to the application service role. The SECURITY DEFINER RPC above is the
-- only application path that may flip pending accounting into revenue.
revoke update (
  reconciliation_status,
  reconciliation_reference,
  revenue_classification,
  commercial_revenue
) on table public.commercial_payment_events from service_role;

create or replace function public.guard_agent_commerce_revenue_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provider in ('coinbase_cdp_x402','circle_gateway_x402','nevermined_x402')
     and new.commercial_revenue is true then
    if new.environment not in ('mainnet','fiat')
       or new.payment_status <> 'settled'
       or new.reconciliation_status <> 'matched'
       or new.revenue_classification <> 'commercial_revenue'
       or coalesce(new.metadata ->> 'reconciliation_contract', '') <> 'agent-commerce-v1'
       or coalesce(new.metadata ->> 'reconciled_agent_commerce_delivery_id', '') = ''
       or coalesce(new.metadata ->> 'reconciled_response_sha256', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'agent-commerce revenue promotion requires matched delivery evidence';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agent_commerce_revenue_evidence_guard
  on public.commercial_payment_events;
create trigger agent_commerce_revenue_evidence_guard
before insert or update of payment_status,reconciliation_status,revenue_classification,commercial_revenue,metadata
on public.commercial_payment_events
for each row
execute function public.guard_agent_commerce_revenue_evidence();

revoke all on function public.guard_agent_commerce_revenue_evidence()
  from PUBLIC, anon, authenticated;

comment on function public.reconcile_agent_commerce_payment(uuid,text,text,text) is
  'Promotes one settled Coinbase/Circle/Nevermined production payment to commercial revenue only after durable delivery and successful usage evidence match.';
