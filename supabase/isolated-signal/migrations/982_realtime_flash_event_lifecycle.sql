-- =============================================================================
-- Geomacro real-time flash lifecycle, category routing and event families
--
-- Keeps source-level flash evidence separate from a canonical event family:
--   * source row = one publisher/source record
--   * source_version = edits to that exact source record
--   * event family = one real-world event across independent sources
--   * event family version = material development of that real-world event
--
-- This is intentionally compact: no raw article body is copied into the
-- lifecycle/version tables. The existing signal isolation/archive boundary
-- remains authoritative for evidence retention.
-- =============================================================================

create extension if not exists pgcrypto;

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
    select 1
    from pg_constraint
    where conname = 'live_flash_events_signal_category_check'
  ) then
    alter table public.live_flash_events
      add constraint live_flash_events_signal_category_check
      check (
        signal_category in (
          'GEOPOLITICS',
          'MACRO',
          'CRITICAL_MINERALS',
          'UNCLASSIFIED'
        )
      );
  end if;
end
$$;

update public.live_flash_events
set
  signal_category = case
    when upper(coalesce(event_type, '')) like 'CRITICAL_MINERALS%'
      then 'CRITICAL_MINERALS'
    when upper(coalesce(event_type, '')) like 'MACRO%'
      then 'MACRO'
    when upper(coalesce(event_type, '')) like 'GEOPOLITICS%'
      then 'GEOPOLITICS'
    else 'UNCLASSIFIED'
  end,
  first_seen_at = coalesce(first_seen_at, ingested_at, now()),
  last_seen_at = coalesce(last_seen_at, updated_at, ingested_at, now())
where
  first_seen_at is null
  or last_seen_at is null
  or signal_category = 'UNCLASSIFIED';

create table if not exists public.live_flash_event_families (
  family_id uuid primary key default gen_random_uuid(),

  signal_category text not null
    check (
      signal_category in (
        'GEOPOLITICS',
        'MACRO',
        'CRITICAL_MINERALS'
      )
    ),

  canonical_headline text not null,
  country_isos text[] not null default '{}',

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  current_version integer not null default 1
    check (current_version >= 1),

  current_status text not null default 'ACTIVE'
    check (current_status in ('ACTIVE', 'RESOLVED')),

  source_count integer not null default 0
    check (source_count >= 0),

  independent_source_count integer not null default 0
    check (independent_source_count >= 0),

  last_material_update_at timestamptz,
  latest_update_reason text,
  latest_flash_id text
    references public.live_flash_events(flash_id)
    on delete set null,
  latest_content_hash text
    check (
      latest_content_hash is null
      or latest_content_hash ~ '^[a-f0-9]{64}$'
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_flash_events
  drop constraint if exists live_flash_events_event_family_fk;

alter table public.live_flash_events
  add constraint live_flash_events_event_family_fk
  foreign key (event_family_id)
  references public.live_flash_event_families(family_id)
  on delete set null;

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
    check (
      signal_category in (
        'GEOPOLITICS',
        'MACRO',
        'CRITICAL_MINERALS',
        'UNCLASSIFIED'
      )
    ),

  material_update boolean not null default false,
  material_update_reason text,

  unique (flash_id, source_version)
);

create index if not exists live_flash_events_category_time_idx
  on public.live_flash_events (
    signal_category,
    last_seen_at desc
  );

create index if not exists live_flash_events_family_idx
  on public.live_flash_events (
    event_family_id,
    last_seen_at desc
  );

create index if not exists live_flash_families_category_time_idx
  on public.live_flash_event_families (
    signal_category,
    last_seen_at desc
  );

create index if not exists live_flash_family_members_flash_idx
  on public.live_flash_event_family_members (
    flash_id,
    last_seen_at desc
  );

create index if not exists live_flash_event_versions_flash_idx
  on public.live_flash_event_versions (
    flash_id,
    source_version desc
  );

alter table public.live_flash_event_families enable row level security;
alter table public.live_flash_event_family_members enable row level security;
alter table public.live_flash_event_versions enable row level security;

insert into public.live_flash_event_versions (
  flash_id,
  event_family_id,
  source_version,
  captured_at,
  published_at,
  headline,
  content_hash,
  signal_category,
  material_update,
  material_update_reason
)
select
  e.flash_id,
  e.event_family_id,
  1,
  coalesce(e.first_seen_at, e.ingested_at, now()),
  e.published_at,
  e.headline,
  e.content_hash,
  e.signal_category,
  false,
  null
from public.live_flash_events e
where not exists (
  select 1
  from public.live_flash_event_versions v
  where v.flash_id = e.flash_id
    and v.source_version = 1
);

comment on column public.live_flash_events.signal_category is
  'Bounded hot-path category: GEOPOLITICS, MACRO, CRITICAL_MINERALS, or UNCLASSIFIED. Only the first three are event-family eligible.';

comment on column public.live_flash_events.source_version is
  'Monotonic version of the exact source record. Telegram edited_channel/new edit updates increment this when content changes.';

comment on column public.live_flash_events.material_update is
  'Whether the current source-record revision contains a material headline/fact change rather than punctuation/formatting noise.';

comment on table public.live_flash_event_families is
  'Canonical real-world event families used to deduplicate independent source flashes and represent material event developments as versions.';

comment on table public.live_flash_event_versions is
  'Compact immutable-ish source revision ledger. Stores headline/hash/provenance, never raw article bodies.';
