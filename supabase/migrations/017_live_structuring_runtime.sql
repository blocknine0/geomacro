-- Geomacro Live Intelligence
-- Idempotent structuring runtime + audit.

-- One canonical evidence fingerprint may belong to one current structured story.
create unique index if not exists
  live_event_evidence_fingerprint_unique_idx
on public.live_structured_event_evidence(fingerprint);

create table if not exists public.live_structuring_runs (
  id uuid primary key default gen_random_uuid(),

  structure_version text not null,
  country_version text not null,
  story_version text not null,
  scoring_version text not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  status text not null default 'running'
    check (status in ('running', 'succeeded', 'empty', 'failed')),

  fragments_seen integer not null default 0,
  evidence_seen integer not null default 0,
  evidence_structured integer not null default 0,
  evidence_duplicate integer not null default 0,

  events_created integer not null default 0,
  events_updated integer not null default 0,

  country_attributed integer not null default 0,
  country_unknown integer not null default 0,

  error_code text,
  error_detail text,

  metrics jsonb not null default '{}'::jsonb
);

create index if not exists live_structuring_runs_time_idx
  on public.live_structuring_runs(started_at desc);

alter table public.live_structuring_runs enable row level security;

comment on table public.live_structuring_runs is
  'Audit trail for deterministic conversion of immutable evidence fragments into structured Geomacro intelligence.';
