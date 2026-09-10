-- =============================================================================
-- Backfill existing Geomacro agent/x402 Testnet telemetry into the centralized
-- commercial operations ledger. This migration is evidence-only and does not
-- reclassify any Testnet payment as commercial revenue.
-- =============================================================================

insert into public.commercial_payment_events (
  occurred_at,
  environment,
  network_family,
  network_name,
  chain_id,
  provider,
  provider_environment,
  payment_method,
  payment_status,
  revenue_classification,
  provider_payment_id,
  provider_settlement_id,
  asset_symbol,
  amount_atomic,
  amount_decimal,
  settled_at,
  reconciliation_status,
  commercial_revenue,
  metadata
)
select
  coalesce(p.settled_at, p.created_at),
  'testnet',
  case when p.network like 'eip155:%' then 'evm' else 'other' end,
  case when p.network = 'eip155:5042002' then 'Arc Testnet' else p.network end,
  case when p.network like 'eip155:%' then split_part(p.network, ':', 2) else null end,
  case when p.rail = 'circle_gateway_batch' then 'circle_gateway_x402' else p.provider end,
  'legacy_testnet',
  'x402',
  case when p.status = 'settled' then 'settled' else 'failed' end,
  'testnet_non_revenue',
  p.id::text,
  p.provider_reference,
  p.asset,
  p.amount::numeric,
  case when upper(p.asset) = 'USDC' then p.amount::numeric / 1000000 else null end,
  p.settled_at,
  'not_applicable',
  false,
  jsonb_build_object(
    'backfill', 'agent_payments_v1',
    'legacy_request_id', p.request_id,
    'provider_reference_is_not_assumed_tx_hash', true
  )
from public.agent_payments p
where not exists (
  select 1
  from public.commercial_payment_events existing
  where existing.provider_payment_id = p.id::text
);

insert into public.commercial_usage_events (
  occurred_at,
  environment,
  access_surface,
  request_id,
  capability,
  credits_charged,
  http_status,
  success,
  failure_code,
  risk_gate_included,
  execution_authorized,
  shareable,
  metadata
)
select
  coalesce(r.completed_at, r.created_at),
  'testnet',
  'technical_proof',
  r.id::text,
  case
    when r.capability = 'risk_preflight_x402' then 'risk_gate_bundle'
    else r.capability
  end,
  0,
  r.http_status,
  r.status = 'delivered',
  case when r.status = 'delivered' then null else coalesce(r.response_code, r.status) end,
  r.capability = 'risk_preflight_x402',
  false,
  true,
  jsonb_build_object(
    'backfill', 'agent_api_requests_v1',
    'external_agent_reference_present', r.external_agent_id is not null,
    'payment_id_present', r.payment_id is not null
  )
from public.agent_api_requests r
where not exists (
  select 1
  from public.commercial_usage_events existing
  where existing.request_id = r.id::text
    and existing.capability = case
      when r.capability = 'risk_preflight_x402' then 'risk_gate_bundle'
      else r.capability
    end
);

comment on table public.commercial_payment_events is
  'Internal append-oriented payment/settlement evidence across testnet, mainnet, fiat and provider rails. Legacy x402 Testnet history is backfilled as non-revenue. No secrets or upstream news-source identities.';
