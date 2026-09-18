-- =============================================================================
-- Geomacro production intelligence watch ledger
--
-- PURPOSE
-- - preserve exact production Ask Geomacro responses for the 7-day watch
-- - bind every probe to a date/index/category/mode
-- - retain evidence timing analysis for current vs historical probes
-- - keep watch evidence append-only and service-role only
-- =============================================================================

create table if not exists public.production_intelligence_watch_results (
  id uuid primary key default gen_random_uuid(),
  watch_run_id uuid not null,
  watch_date date not null,
  probe_index integer not null,

  category text not null,
  mode text not null check (mode in ('current', 'historical')),
  as_of timestamptz,
  build_verified boolean not null default false,

  question text not null,
  question_sha256 text not null,

  request_id text,
  executed_at timestamptz not null default now(),

  http_status integer,
  outcome text not null check (
    outcome in (
      'success',
      'insufficient_evidence',
      'production_error',
      'transport_error',
      'invalid_response',
      'build_unverified'
    )
  ),

  response_sha256 text,
  response_bytes integer,
  response_raw text,
  response_json jsonb,

  evidence_metadata jsonb not null default '{}'::jsonb,

  current_gri numeric,
  mean_relevance numeric,
  evidence_count integer not null default 0,
  current_evidence_count integer not null default 0,
  historical_evidence_count integer not null default 0,

  latency_ms integer,
  error_code text,
  error_message text,

  production_build_sha text,
  production_build_schema text,

  created_at timestamptz not null default now(),

  constraint production_intelligence_watch_probe_index_check
    check (probe_index between 0 and 999),

  constraint production_intelligence_watch_category_check
    check (category in ('geopolitics', 'macro', 'critical_minerals')),

  constraint production_intelligence_watch_as_of_mode_check
    check ((mode = 'historical' and as_of is not null) or (mode = 'current' and as_of is null)),

  constraint production_intelligence_watch_question_check
    check (char_length(question) between 4 and 300),

  constraint production_intelligence_watch_question_sha_check
    check (question_sha256 ~ '^[a-f0-9]{64}$'),

  constraint production_intelligence_watch_response_sha_check
    check (response_sha256 is null or response_sha256 ~ '^[a-f0-9]{64}$'),

  constraint production_intelligence_watch_http_check
    check (http_status is null or http_status between 100 and 599),

  constraint production_intelligence_watch_response_bytes_check
    check (response_bytes is null or response_bytes >= 0),

  constraint production_intelligence_watch_latency_check
    check (latency_ms is null or latency_ms >= 0),

  constraint production_intelligence_watch_evidence_count_check
    check (evidence_count >= 0 and current_evidence_count >= 0 and historical_evidence_count >= 0)
);

create unique index if not exists production_intelligence_watch_date_probe_uidx
  on public.production_intelligence_watch_results (watch_date, probe_index);

create unique index if not exists production_intelligence_watch_date_question_uidx
  on public.production_intelligence_watch_results (watch_date, question_sha256);

create index if not exists production_intelligence_watch_date_category_idx
  on public.production_intelligence_watch_results (watch_date, category, mode, created_at desc);

create index if not exists production_intelligence_watch_run_idx
  on public.production_intelligence_watch_results (watch_run_id, created_at);

create or replace function public.prevent_production_intelligence_watch_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Production intelligence watch evidence is append-only';
end;
$$;

drop trigger if exists production_intelligence_watch_immutable
on public.production_intelligence_watch_results;

create trigger production_intelligence_watch_immutable
before update or delete
on public.production_intelligence_watch_results
for each row
execute function public.prevent_production_intelligence_watch_mutation();

alter table public.production_intelligence_watch_results enable row level security;

revoke all on table public.production_intelligence_watch_results from PUBLIC, anon, authenticated;
grant select, insert on table public.production_intelligence_watch_results to service_role;

comment on table public.production_intelligence_watch_results is
  'Private append-only production watch ledger. Stores exact Ask Geomacro response bytes plus bounded current/historical evidence timing metadata.';

comment on function public.prevent_production_intelligence_watch_mutation() is
  'Prevents mutation or deletion of production watch evidence after capture.';