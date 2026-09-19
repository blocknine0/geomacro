-- =============================================================================
-- Geomacro production repair: authoritative Federico event-family schema
--
-- Repairs schema-history drift where migrations 042/043 may be recorded as
-- applied while the authoritative production database is missing the tables
-- required by FEDERICO_STRICT Risk Object generation.
--
-- Idempotent and evidence-preserving. No existing event evidence is deleted.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.live_flash_event_families (
  family_id uuid primary key default gen_random_uuid(),
  signal_category text not null
    check (signal_category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  canonical_headline text not null,
  country_isos text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  current_version integer not null default 1
    check (current_version >= 1),
  current_status text not null default 'ACTIVE'
    check (current_status in ('ACTIVE','RESOLVED')),
  source_count integer not null default 0
    check (source_count >= 0),
  independent_source_count integer not null default 0
    check (independent_source_count >= 0),
  last_material_update_at timestamptz,
  latest_update_reason text,
  latest_flash_id text,
  latest_content_hash text
    check (latest_content_hash is null or latest_content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_flash_event_family_members (
  family_id uuid not null
    references public.live_flash_event_families(family_id)
    on delete cascade,
  flash_id text not null
    references public.live_flash_events(flash_id)
    on delete cascade,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (family_id, flash_id)
);

create table if not exists public.live_flash_event_family_versions (
  id bigint generated always as identity primary key,
  family_id uuid not null
    references public.live_flash_event_families(family_id)
    on delete cascade,
  version integer not null
    check (version >= 1),
  captured_at timestamptz not null default now(),
  trigger_flash_id text
    references public.live_flash_events(flash_id)
    on delete set null,
  canonical_headline text not null,
  signal_category text not null
    check (signal_category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  material_update_reason text not null,
  content_hash text not null
    check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (family_id, version)
);

create table if not exists public.live_flash_event_versions (
  id bigint generated always as identity primary key,
  flash_id text not null
    references public.live_flash_events(flash_id)
    on delete cascade,
  event_family_id uuid
    references public.live_flash_event_families(family_id)
    on delete set null,
  source_version integer not null
    check (source_version >= 1),
  captured_at timestamptz not null default now(),
  published_at timestamptz,
  headline text not null,
  content_hash text not null
    check (content_hash ~ '^[a-f0-9]{64}$'),
  signal_category text not null
    check (signal_category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS','UNCLASSIFIED')),
  material_update boolean not null default false,
  material_update_reason text,
  unique (flash_id, source_version)
);

alter table public.live_flash_events
  add column if not exists signal_category text not null default 'UNCLASSIFIED',
  add column if not exists source_version integer not null default 1,
  add column if not exists material_update boolean not null default false,
  add column if not exists material_update_reason text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_material_update_at timestamptz,
  add column if not exists event_family_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_flash_events_signal_category_check'
  ) then
    alter table public.live_flash_events
      add constraint live_flash_events_signal_category_check
      check (signal_category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS','UNCLASSIFIED'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_flash_events_event_family_fk'
  ) then
    alter table public.live_flash_events
      add constraint live_flash_events_event_family_fk
      foreign key (event_family_id)
      references public.live_flash_event_families(family_id)
      on delete set null;
  end if;
end
$$;

create index if not exists live_flash_events_family_idx
  on public.live_flash_events (event_family_id, last_seen_at desc);

create index if not exists live_flash_families_category_time_idx
  on public.live_flash_event_families (signal_category, last_seen_at desc);

create index if not exists live_flash_family_members_flash_idx
  on public.live_flash_event_family_members (flash_id, last_seen_at desc);

create index if not exists live_flash_event_versions_flash_idx
  on public.live_flash_event_versions (flash_id, source_version desc);

create index if not exists live_flash_family_versions_family_idx
  on public.live_flash_event_family_versions (family_id, version desc);

alter table public.live_flash_event_families enable row level security;
alter table public.live_flash_event_family_members enable row level security;
alter table public.live_flash_event_versions enable row level security;
alter table public.live_flash_event_family_versions enable row level security;
