-- =============================================================================
-- Geomacro Early Warning Alert + Distribution Ledger
--
-- PURPOSE
-- - persist the canonical timestamped early-warning signal that existed at issue time
-- - preserve affected-country local time alongside canonical UTC
-- - keep CEWS inputs/contributions/methodology auditable
-- - record later observed outcomes and lead time without rewriting the original signal
-- - provide durable per-channel idempotency receipts for public distribution
--
-- IMPORTANT
-- - CEWS v0.1 is PROVISIONAL and not a validated market-prediction model
-- - public distribution remains disabled by config until separately authorized
-- - direct table access is service-role only; public APIs must expose bounded views
-- =============================================================================

create table if not exists public.early_warning_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  schema_version text not null default 'early-warning-1.0',
  methodology_version text not null default 'cews-v0.1.0-provisional',
  methodology_calibrated boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  content_type text not null default 'early_warning',
  visibility text not null default 'private',

  country_iso3 text not null,
  country_name text not null,
  country_timezone text not null,

  event_family text not null,
  event_title text not null,
  primary_cause text not null,

  status text not null,
  cews_score numeric(6,2) not null,
  cews_inputs jsonb not null,
  cews_contributions jsonb not null,

  confidence numeric(5,4) not null,
  independent_evidence_count integer not null default 0,
  official_source_present boolean not null default false,
  evidence_refs jsonb not null default '[]'::jsonb,

  transmission_channels jsonb not null default '[]'::jsonb,
  market_relevance jsonb not null default '{}'::jsonb,

  source_risk_object_id text,
  source_event_ids jsonb not null default '[]'::jsonb,

  first_source_seen_at_utc timestamptz,
  detected_at_utc timestamptz not null,
  detected_at_local text not null,
  published_at_utc timestamptz,

  public_url text,
  public_eligible boolean not null default false,
  public_policy_version text,
  public_eligibility_reasons jsonb not null default '[]'::jsonb,

  evidence_hash text not null,
  calculation_hash text not null,

  outcome_status text not null default 'PENDING',
  outcome_observed_at_utc timestamptz,
  outcome_summary text,
  lead_time_seconds bigint,
  outcome_evidence_refs jsonb not null default '[]'::jsonb,

  constraint early_warning_alert_key_length_check
    check (char_length(alert_key) between 8 and 200),
  constraint early_warning_schema_check
    check (schema_version = 'early-warning-1.0'),
  constraint early_warning_content_type_check
    check (content_type = 'early_warning'),
  constraint early_warning_visibility_check
    check (visibility in ('public','private')),
  constraint early_warning_iso3_check
    check (country_iso3 ~ '^[A-Z]{3}$'),
  constraint early_warning_country_name_check
    check (char_length(country_name) between 2 and 120),
  constraint early_warning_timezone_check
    check (char_length(country_timezone) between 3 and 80),
  constraint early_warning_status_check
    check (status in ('NORMAL','WATCH','ELEVATED','WARNING','CRITICAL')),
  constraint early_warning_cews_score_check
    check (cews_score >= 0 and cews_score <= 100),
  constraint early_warning_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint early_warning_evidence_count_check
    check (independent_evidence_count >= 0),
  constraint early_warning_cews_inputs_object_check
    check (jsonb_typeof(cews_inputs) = 'object'),
  constraint early_warning_cews_contributions_object_check
    check (jsonb_typeof(cews_contributions) = 'object'),
  constraint early_warning_evidence_array_check
    check (jsonb_typeof(evidence_refs) = 'array'),
  constraint early_warning_transmission_array_check
    check (jsonb_typeof(transmission_channels) = 'array'),
  constraint early_warning_market_relevance_object_check
    check (jsonb_typeof(market_relevance) = 'object'),
  constraint early_warning_source_event_ids_array_check
    check (jsonb_typeof(source_event_ids) = 'array'),
  constraint early_warning_public_reasons_array_check
    check (jsonb_typeof(public_eligibility_reasons) = 'array'),
  constraint early_warning_evidence_hash_check
    check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint early_warning_calculation_hash_check
    check (calculation_hash ~ '^[0-9a-f]{64}$'),
  constraint early_warning_outcome_status_check
    check (outcome_status in ('PENDING','MATERIAL_EVENT_CONFIRMED','NO_MATERIAL_EVENT','INVALIDATED')),
  constraint early_warning_outcome_refs_array_check
    check (jsonb_typeof(outcome_evidence_refs) = 'array'),
  constraint early_warning_published_after_detection_check
    check (published_at_utc is null or published_at_utc >= detected_at_utc),
  constraint early_warning_source_seen_order_check
    check (first_source_seen_at_utc is null or first_source_seen_at_utc <= detected_at_utc),
  constraint early_warning_outcome_order_check
    check (outcome_observed_at_utc is null or outcome_observed_at_utc >= detected_at_utc),
  constraint early_warning_lead_time_check
    check (lead_time_seconds is null or lead_time_seconds >= 0)
);

create index if not exists early_warning_alerts_country_time_idx
  on public.early_warning_alerts (country_iso3, detected_at_utc desc);

create index if not exists early_warning_alerts_status_time_idx
  on public.early_warning_alerts (status, detected_at_utc desc);

create index if not exists early_warning_alerts_public_idx
  on public.early_warning_alerts (public_eligible, detected_at_utc desc)
  where public_eligible is true;

create index if not exists early_warning_alerts_outcome_idx
  on public.early_warning_alerts (outcome_status, detected_at_utc desc);

create table if not exists public.early_warning_distribution_receipts (
  id uuid primary key default gen_random_uuid(),
  early_warning_alert_id uuid not null references public.early_warning_alerts(id) on delete restrict,
  channel text not null,
  idempotency_key text not null unique,
  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  published_at timestamptz,
  external_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint early_warning_distribution_channel_check
    check (channel in ('telegram','discord','bluesky','mastodon','linkedin','x','rss','webhook','email')),
  constraint early_warning_distribution_status_check
    check (status in ('PENDING','PUBLISHED','FAILED','SKIPPED')),
  constraint early_warning_distribution_attempt_check
    check (attempt_count >= 0),
  constraint early_warning_distribution_key_check
    check (idempotency_key ~ '^[0-9a-f]{64}$'),
  constraint early_warning_distribution_unique_channel
    unique (early_warning_alert_id, channel)
);

create index if not exists early_warning_distribution_status_idx
  on public.early_warning_distribution_receipts (status, created_at desc);

create or replace function public.guard_published_early_warning_core()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.published_at_utc is not null and (
    new.alert_key is distinct from old.alert_key or
    new.country_iso3 is distinct from old.country_iso3 or
    new.country_name is distinct from old.country_name or
    new.country_timezone is distinct from old.country_timezone or
    new.event_family is distinct from old.event_family or
    new.event_title is distinct from old.event_title or
    new.primary_cause is distinct from old.primary_cause or
    new.status is distinct from old.status or
    new.cews_score is distinct from old.cews_score or
    new.cews_inputs is distinct from old.cews_inputs or
    new.cews_contributions is distinct from old.cews_contributions or
    new.confidence is distinct from old.confidence or
    new.independent_evidence_count is distinct from old.independent_evidence_count or
    new.official_source_present is distinct from old.official_source_present or
    new.evidence_refs is distinct from old.evidence_refs or
    new.transmission_channels is distinct from old.transmission_channels or
    new.market_relevance is distinct from old.market_relevance or
    new.detected_at_utc is distinct from old.detected_at_utc or
    new.detected_at_local is distinct from old.detected_at_local or
    new.evidence_hash is distinct from old.evidence_hash or
    new.calculation_hash is distinct from old.calculation_hash or
    new.methodology_version is distinct from old.methodology_version
  ) then
    raise exception 'published early warning core fields are immutable; append a new alert instead';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.guard_published_early_warning_core() from PUBLIC, anon, authenticated;
grant execute on function public.guard_published_early_warning_core() to service_role;

drop trigger if exists early_warning_guard_published_core on public.early_warning_alerts;
create trigger early_warning_guard_published_core
before update on public.early_warning_alerts
for each row
execute function public.guard_published_early_warning_core();

alter table public.early_warning_alerts enable row level security;
alter table public.early_warning_distribution_receipts enable row level security;

revoke all on table public.early_warning_alerts from PUBLIC, anon, authenticated;
revoke all on table public.early_warning_distribution_receipts from PUBLIC, anon, authenticated;

grant all on table public.early_warning_alerts to service_role;
grant all on table public.early_warning_distribution_receipts to service_role;

comment on table public.early_warning_alerts is
  'Canonical timestamped Geomacro Early Warning ledger. Published signal core fields are immutable; outcomes are appended later.';
comment on table public.early_warning_distribution_receipts is
  'Durable per-channel idempotency and delivery receipts for bounded public Early Warning distribution.';
