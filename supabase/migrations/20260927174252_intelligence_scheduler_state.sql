-- Persist due-task state for the single production intelligence orchestrator.
-- This table is service-role only. No browser/public access is permitted.

create table if not exists public.live_intelligence_scheduler_state (
  source_id text primary key,
  source_kind text not null,
  payload jsonb not null default '{}'::jsonb,
  last_attempt_at timestamptz null,
  last_success_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.live_intelligence_scheduler_state enable row level security;

revoke all on table public.live_intelligence_scheduler_state from anon, authenticated;
grant select, insert, update, delete on table public.live_intelligence_scheduler_state to service_role;

create index if not exists live_intelligence_scheduler_state_updated_at_idx
  on public.live_intelligence_scheduler_state (updated_at desc);

comment on table public.live_intelligence_scheduler_state is
  'Private service-role scheduler state for the single Geomacro intelligence orchestrator.';
