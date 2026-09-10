-- =============================================================================
-- Geomacro Commercial Operations + Proof Ledger v1
--
-- PURPOSE
-- - centralize customer/machine usage, payment and delivery evidence
-- - separate testnet proof from mainnet/fiat commercial activity
-- - power an owner-only operations dashboard
-- - allow deliberately redacted, immutable proof snapshots to be shared publicly
--
-- PRIVACY / PRODUCT BOUNDARIES
-- - no raw API keys, private keys, wallet secrets, IP addresses or raw request bodies
-- - no upstream news/source names, source IDs, source URLs or publisher identities
-- - public proof snapshots never expose customer identity by default
-- - testnet activity is never classified as commercial revenue
-- =============================================================================

create table if not exists public.commercial_payment_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),

  environment text not null,
  network_family text not null,
  network_name text,
  chain_id text,

  provider text not null,
  provider_environment text,
  payment_method text not null,
  payment_status text not null,
  revenue_classification text not null,

  provider_order_id text,
  provider_payment_id text,
  provider_settlement_id text,
  invoice_id text,
  idempotency_key text,

  principal_id uuid references public.commercial_principals(id) on delete set null,
  entitlement_grant_id uuid references public.commercial_entitlement_grants(id) on delete set null,
  offer_id text,
  tier text,

  asset_symbol text,
  asset_contract text,
  amount_atomic numeric(78,0),
  amount_decimal numeric(38,18),
  invoice_currency text,
  invoice_amount numeric(38,8),
  settlement_currency text,
  settlement_amount numeric(38,8),
  fee_currency text,
  provider_fee_amount numeric(38,8),
  geomacro_fee_amount numeric(38,8),

  payer_reference_hash text,
  recipient_reference_hash text,
  tx_hash text,
  block_number numeric(30,0),
  confirmations integer,

  requested_at timestamptz,
  authorized_at timestamptz,
  settled_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  disputed_at timestamptz,

  failure_code text,
  reconciliation_status text not null default 'pending',
  reconciliation_reference text,

  commercial_revenue boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,

  constraint commercial_payment_environment_check
    check (environment in ('testnet','mainnet','fiat','sandbox','internal')),
  constraint commercial_payment_network_family_check
    check (network_family in ('evm','fiat','offchain','other')),
  constraint commercial_payment_status_check
    check (payment_status in ('created','requires_payment','authorized','submitted','settled','failed','refunded','partially_refunded','disputed','cancelled')),
  constraint commercial_payment_revenue_classification_check
    check (revenue_classification in ('testnet_non_revenue','commercial_pending_accounting','commercial_revenue','refunded','disputed','non_revenue_internal')),
  constraint commercial_payment_reconciliation_check
    check (reconciliation_status in ('pending','matched','mismatch','manual_review','not_applicable')),
  constraint commercial_payment_testnet_revenue_check
    check (not (environment = 'testnet' and commercial_revenue = true)),
  constraint commercial_payment_testnet_classification_check
    check (environment <> 'testnet' or revenue_classification = 'testnet_non_revenue'),
  constraint commercial_payment_payer_hash_check
    check (payer_reference_hash is null or payer_reference_hash ~ '^[0-9a-f]{64}$'),
  constraint commercial_payment_recipient_hash_check
    check (recipient_reference_hash is null or recipient_reference_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists commercial_payment_provider_payment_unique
  on public.commercial_payment_events (provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index if not exists commercial_payment_tx_unique
  on public.commercial_payment_events (network_name, tx_hash)
  where tx_hash is not null;
create index if not exists commercial_payment_time_idx
  on public.commercial_payment_events (occurred_at desc);
create index if not exists commercial_payment_principal_idx
  on public.commercial_payment_events (principal_id, occurred_at desc);
create index if not exists commercial_payment_environment_idx
  on public.commercial_payment_events (environment, payment_status, occurred_at desc);

create table if not exists public.commercial_usage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),

  environment text not null,
  access_surface text not null,
  principal_id uuid references public.commercial_principals(id) on delete set null,
  principal_type text,
  entitlement_grant_id uuid references public.commercial_entitlement_grants(id) on delete set null,
  payment_event_id uuid references public.commercial_payment_events(id) on delete set null,

  offer_id text,
  tier text,
  registry_version text,
  contract_version text,

  request_id text not null,
  delivery_id text,
  capability text not null,
  subject_type text,
  subject_key text,

  credits_charged integer not null default 0,
  credits_remaining integer,
  idempotent_replay boolean not null default false,

  http_status integer,
  latency_ms integer,
  success boolean not null,
  failure_code text,

  response_sha256 text,
  response_bytes integer,

  structural_observation_count integer not null default 0,
  evidence_reference_count integer not null default 0,
  independent_evidence_count integer not null default 0,
  history_item_count integer not null default 0,

  risk_object_id text,
  risk_object_version text,
  risk_object_signed boolean not null default false,
  risk_gate_included boolean not null default false,
  risk_gate_decision text,
  execution_authorized boolean not null default false,

  shareable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,

  constraint commercial_usage_environment_check
    check (environment in ('testnet','mainnet','fiat','sandbox','internal')),
  constraint commercial_usage_surface_check
    check (access_surface in ('public_web','free_api','paid_dashboard','commercial_api','agent_payment','institutional_integration','technical_proof')),
  constraint commercial_usage_request_id_check
    check (char_length(request_id) between 8 and 160),
  constraint commercial_usage_capability_check
    check (char_length(capability) between 2 and 80),
  constraint commercial_usage_nonnegative_counts_check
    check (
      credits_charged >= 0 and
      (credits_remaining is null or credits_remaining >= 0) and
      structural_observation_count >= 0 and
      evidence_reference_count >= 0 and
      independent_evidence_count >= 0 and
      history_item_count >= 0 and
      (latency_ms is null or latency_ms >= 0) and
      (response_bytes is null or response_bytes >= 0)
    ),
  constraint commercial_usage_execution_boundary_check
    check (execution_authorized = false),
  constraint commercial_usage_response_hash_check
    check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$')
);

create unique index if not exists commercial_usage_request_unique
  on public.commercial_usage_events (coalesce(principal_id::text, 'anonymous'), request_id, capability);
create index if not exists commercial_usage_time_idx
  on public.commercial_usage_events (occurred_at desc);
create index if not exists commercial_usage_capability_idx
  on public.commercial_usage_events (capability, occurred_at desc);
create index if not exists commercial_usage_principal_idx
  on public.commercial_usage_events (principal_id, occurred_at desc);
create index if not exists commercial_usage_environment_idx
  on public.commercial_usage_events (environment, access_surface, occurred_at desc);

create table if not exists public.commercial_proof_snapshots (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  period_started_at timestamptz not null,
  period_ends_at timestamptz not null,
  environment_scope text[] not null default array['testnet','mainnet','fiat']::text[],
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  status text not null default 'draft',
  proof_version text not null default 'commercial-proof-v1',
  redaction_version text not null default 'public-redaction-v1',
  payload jsonb not null,
  payload_sha256 text not null,
  created_by text not null default 'geomacro_internal',

  constraint commercial_proof_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{7,95}$'),
  constraint commercial_proof_period_check
    check (period_ends_at > period_started_at),
  constraint commercial_proof_status_check
    check (status in ('draft','published','expired','revoked')),
  constraint commercial_proof_hash_check
    check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists commercial_proof_status_idx
  on public.commercial_proof_snapshots (status, published_at desc);

-- Owner-only aggregate view. It deliberately excludes all upstream news/source
-- identities and never exposes raw secrets or request bodies.
create or replace view public.commercial_ops_usage_rollup
with (security_invoker = true)
as
select
  date_trunc('day', u.occurred_at) as day,
  u.environment,
  u.access_surface,
  u.tier,
  u.offer_id,
  u.capability,
  count(*)::bigint as request_count,
  count(*) filter (where u.success)::bigint as success_count,
  count(*) filter (where not u.success)::bigint as failure_count,
  count(distinct u.principal_id)::bigint as unique_principal_count,
  sum(u.credits_charged)::bigint as credits_charged,
  avg(u.latency_ms)::numeric(18,2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by u.latency_ms)
    filter (where u.latency_ms is not null) as p95_latency_ms,
  sum(u.structural_observation_count)::bigint as structural_observations_delivered,
  sum(u.evidence_reference_count)::bigint as evidence_references_delivered,
  sum(u.history_item_count)::bigint as history_items_delivered,
  count(*) filter (where u.risk_object_signed)::bigint as signed_risk_object_count,
  count(*) filter (where u.risk_gate_included)::bigint as risk_gate_count
from public.commercial_usage_events u
group by 1,2,3,4,5,6;

create or replace view public.commercial_ops_payment_rollup
with (security_invoker = true)
as
select
  date_trunc('day', p.occurred_at) as day,
  p.environment,
  p.network_family,
  p.network_name,
  p.provider,
  p.payment_method,
  p.payment_status,
  p.revenue_classification,
  p.asset_symbol,
  p.invoice_currency,
  p.settlement_currency,
  count(*)::bigint as payment_count,
  count(distinct p.principal_id)::bigint as unique_payer_count,
  sum(p.amount_decimal) as asset_amount,
  sum(p.invoice_amount) as invoice_amount,
  sum(p.settlement_amount) as settlement_amount,
  sum(p.provider_fee_amount) as provider_fee_amount,
  sum(p.geomacro_fee_amount) as geomacro_fee_amount,
  count(*) filter (where p.commercial_revenue)::bigint as commercial_revenue_payment_count,
  count(*) filter (where p.reconciliation_status = 'mismatch')::bigint as reconciliation_mismatch_count
from public.commercial_payment_events p
group by 1,2,3,4,5,6,7,8,9,10,11;

alter table public.commercial_payment_events enable row level security;
alter table public.commercial_usage_events enable row level security;
alter table public.commercial_proof_snapshots enable row level security;

revoke all on table public.commercial_payment_events from PUBLIC, anon, authenticated;
revoke all on table public.commercial_usage_events from PUBLIC, anon, authenticated;
revoke all on table public.commercial_proof_snapshots from PUBLIC, anon, authenticated;
revoke all on public.commercial_ops_usage_rollup from PUBLIC, anon, authenticated;
revoke all on public.commercial_ops_payment_rollup from PUBLIC, anon, authenticated;

grant all on table public.commercial_payment_events to service_role;
grant all on table public.commercial_usage_events to service_role;
grant all on table public.commercial_proof_snapshots to service_role;
grant select on public.commercial_ops_usage_rollup to service_role;
grant select on public.commercial_ops_payment_rollup to service_role;

comment on table public.commercial_payment_events is
  'Internal append-oriented payment/settlement evidence across testnet, mainnet, fiat and provider rails. No secrets or upstream news-source identities.';
comment on table public.commercial_usage_events is
  'Internal customer/machine data-consumption ledger. Records product/capability/subject/counts, never upstream news-source identities or raw request bodies.';
comment on table public.commercial_proof_snapshots is
  'Explicitly published redacted immutable proof snapshots. Public sharing must use snapshot payload only, never internal ledger rows directly.';
comment on view public.commercial_ops_usage_rollup is
  'Internal daily usage rollup with no upstream source identities.';
comment on view public.commercial_ops_payment_rollup is
  'Internal daily payment rollup keeping testnet/non-revenue and commercial revenue classifications separate.';
