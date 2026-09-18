-- =============================================================================
-- Geomacro Testnet Developer API funnel telemetry
--
-- PURPOSE
-- - capture developer API attempts before successful delivery
-- - identify the exact stage where activation/usage stops
-- - keep telemetry server-only and free of raw requests, credentials and source identity
-- =============================================================================

create table if not exists public.testnet_developer_api_funnel_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  occurred_at timestamptz not null default now(),

  principal_id uuid references public.commercial_principals(id) on delete set null,
  key_id text,

  request_id text,
  capability text,
  subject_type text,
  subject_key text,

  stage text not null,
  outcome text not null,

  http_status integer,
  error_code text,
  latency_ms integer,

  metadata jsonb not null default '{}'::jsonb,

  constraint testnet_developer_api_funnel_stage_check
    check (stage in (
      'request_received',
      'request_validation',
      'authentication',
      'scope_authorization',
      'availability_preflight',
      'request_binding',
      'payment',
      'intelligence_delivery',
      'completed'
    )),

  constraint testnet_developer_api_funnel_outcome_check
    check (outcome in ('started','passed','failed','required','skipped')),

  constraint testnet_developer_api_funnel_request_id_check
    check (request_id is null or char_length(request_id) between 8 and 160),

  constraint testnet_developer_api_funnel_capability_check
    check (capability is null or char_length(capability) between 2 and 80),

  constraint testnet_developer_api_funnel_http_status_check
    check (http_status is null or (http_status between 100 and 599)),

  constraint testnet_developer_api_funnel_latency_check
    check (latency_ms is null or latency_ms >= 0)
);

create index if not exists testnet_developer_api_funnel_attempt_idx
  on public.testnet_developer_api_funnel_events (attempt_id, occurred_at);

create index if not exists testnet_developer_api_funnel_principal_idx
  on public.testnet_developer_api_funnel_events (principal_id, occurred_at desc);

create index if not exists testnet_developer_api_funnel_stage_idx
  on public.testnet_developer_api_funnel_events (stage, outcome, occurred_at desc);

create or replace function public.prevent_testnet_developer_api_funnel_mutation()
returns trigger
language plpgsql
set search_path = public
as $
begin
  raise exception 'Testnet Developer API funnel telemetry is append-only';
end;
$;

drop trigger if exists testnet_developer_api_funnel_immutable
on public.testnet_developer_api_funnel_events;

create trigger testnet_developer_api_funnel_immutable
before update or delete
on public.testnet_developer_api_funnel_events
for each row
execute function public.prevent_testnet_developer_api_funnel_mutation();

alter table public.testnet_developer_api_funnel_events enable row level security;

revoke all on table public.testnet_developer_api_funnel_events from PUBLIC, anon, authenticated;
grant select, insert on table public.testnet_developer_api_funnel_events to service_role;

comment on table public.testnet_developer_api_funnel_events is
  'Server-only Testnet Developer API activation funnel telemetry. No raw request bodies, API secrets, IP addresses or upstream news-source identities.';

comment on function public.prevent_testnet_developer_api_funnel_mutation() is
  'Prevents mutation or deletion of Developer API funnel evidence after it has been recorded.';
