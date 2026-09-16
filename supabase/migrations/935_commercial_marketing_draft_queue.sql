-- =============================================================================
-- Geomacro Commercial Marketing Draft Queue
--
-- PURPOSE
-- - automatically convert verified commercial milestones into private draft copy
-- - never treat testnet/sandbox activity as a revenue milestone
-- - never expose customer identity, wallet identity, raw requests or source URLs
-- - never auto-publish; every external post requires explicit owner approval
-- =============================================================================

create table if not exists public.commercial_marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  trigger_type text not null,
  trigger_key text not null unique,
  source_payment_event_id uuid references public.commercial_payment_events(id) on delete restrict,

  status text not null default 'draft',
  requires_human_approval boolean not null default true,
  auto_publish_allowed boolean not null default false,

  title text not null,
  channel_copies jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  evidence_sha256 text not null,

  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  published_at timestamptz,
  publication_reference text,

  constraint commercial_marketing_trigger_type_check
    check (trigger_type in (
      'reconciled_revenue_purchase_milestone',
      'marketplace_listing_verified',
      'production_endpoint_verified',
      'manual_verified_milestone'
    )),
  constraint commercial_marketing_trigger_key_check
    check (char_length(trigger_key) between 8 and 180),
  constraint commercial_marketing_status_check
    check (status in ('draft','approved','rejected','published')),
  constraint commercial_marketing_human_approval_check
    check (requires_human_approval = true),
  constraint commercial_marketing_auto_publish_check
    check (auto_publish_allowed = false),
  constraint commercial_marketing_evidence_hash_check
    check (evidence_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists commercial_marketing_drafts_status_idx
  on public.commercial_marketing_drafts (status, created_at desc);

create index if not exists commercial_marketing_drafts_trigger_idx
  on public.commercial_marketing_drafts (trigger_type, created_at desc);

alter table public.commercial_marketing_drafts enable row level security;
revoke all on table public.commercial_marketing_drafts from PUBLIC, anon, authenticated;
grant all on table public.commercial_marketing_drafts to service_role;

create or replace function public.queue_reconciled_commercial_marketing_milestone()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count bigint;
  v_trigger_key text;
  v_evidence jsonb;
  v_copy jsonb;
begin
  -- Only independently reconciled production revenue can create an automatic
  -- marketing draft. Testnet, sandbox, pending accounting, manual-review and
  -- mismatch states never enter this queue.
  if new.environment not in ('mainnet', 'fiat')
     or new.payment_status <> 'settled'
     or new.reconciliation_status <> 'matched'
     or new.commercial_revenue is not true
     or new.revenue_classification <> 'commercial_revenue' then
    return new;
  end if;

  select count(*)
    into v_count
  from public.commercial_payment_events p
  where p.environment in ('mainnet', 'fiat')
    and p.payment_status = 'settled'
    and p.reconciliation_status = 'matched'
    and p.commercial_revenue is true
    and p.revenue_classification = 'commercial_revenue';

  if v_count not in (1, 10, 100, 1000, 10000, 100000) then
    return new;
  end if;

  v_trigger_key := 'reconciled-production-purchases:' || v_count::text;
  v_evidence := jsonb_build_object(
    'milestone_type', 'reconciled_production_purchases',
    'reconciled_purchase_count', v_count,
    'source_payment_event_id', new.id,
    'provider', new.provider,
    'provider_environment', new.provider_environment,
    'network_name', new.network_name,
    'asset_symbol', new.asset_symbol,
    'payment_status', new.payment_status,
    'reconciliation_status', new.reconciliation_status,
    'commercial_revenue', new.commercial_revenue,
    'revenue_classification', new.revenue_classification,
    'generated_at', now()
  );

  v_copy := jsonb_build_object(
    'x', format(
      'Geomacro has recorded %s reconciled production purchase%s of machine-readable geopolitical and macro risk intelligence. Payment and delivery evidence are matched before revenue is counted. External posting remains owner-approved.',
      v_count,
      case when v_count = 1 then '' else 's' end
    ),
    'linkedin', format(
      'Commercial milestone: Geomacro has now recorded %s reconciled production purchase%s of its machine-readable geopolitical and macro risk intelligence. A purchase is counted only after settlement is matched to delivery evidence; testnet and sandbox activity are excluded. This draft still requires owner approval before publication.',
      v_count,
      case when v_count = 1 then '' else 's' end
    ),
    'discord', format(
      'Geomacro commercial milestone: %s reconciled production purchase%s recorded. Settlement and delivery evidence are matched; testnet/sandbox activity is excluded. Draft only, not auto-published.',
      v_count,
      case when v_count = 1 then '' else 's' end
    )
  );

  insert into public.commercial_marketing_drafts (
    trigger_type,
    trigger_key,
    source_payment_event_id,
    status,
    requires_human_approval,
    auto_publish_allowed,
    title,
    channel_copies,
    evidence,
    evidence_sha256
  ) values (
    'reconciled_revenue_purchase_milestone',
    v_trigger_key,
    new.id,
    'draft',
    true,
    false,
    format('Geomacro: %s reconciled production purchase%s', v_count, case when v_count = 1 then '' else 's' end),
    v_copy,
    v_evidence,
    encode(digest(convert_to(v_evidence::text, 'UTF8'), 'sha256'), 'hex')
  )
  on conflict (trigger_key) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_reconciled_commercial_marketing_milestone() from PUBLIC, anon, authenticated;
grant execute on function public.queue_reconciled_commercial_marketing_milestone() to service_role;

drop trigger if exists commercial_payment_marketing_milestone_trigger on public.commercial_payment_events;
create trigger commercial_payment_marketing_milestone_trigger
after insert or update of payment_status, reconciliation_status, commercial_revenue, revenue_classification
on public.commercial_payment_events
for each row
execute function public.queue_reconciled_commercial_marketing_milestone();

comment on table public.commercial_marketing_drafts is
  'Owner-only approval queue for evidence-backed commercial marketing drafts. No automatic public publishing is permitted.';
comment on function public.queue_reconciled_commercial_marketing_milestone() is
  'Creates private milestone drafts only from matched settled production revenue; excludes testnet/sandbox and never auto-publishes.';
