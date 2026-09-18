-- =============================================================================
-- Geomacro canonical event-family version ledger
-- =============================================================================

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
    check (signal_category in (
      'GEOPOLITICS', 'MACRO', 'CRITICAL_MINERALS'
    )),
  material_update_reason text not null,
  content_hash text not null
    check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (family_id, version)
);

create index if not exists live_flash_family_versions_family_idx
  on public.live_flash_event_family_versions (family_id, version desc);

alter table public.live_flash_event_family_versions enable row level security;

create or replace function public.prevent_live_flash_event_family_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  raise exception 'live flash event family versions are append-only';
end;
$;

revoke all on function public.prevent_live_flash_event_family_version_mutation() from PUBLIC, anon, authenticated;
grant execute on function public.prevent_live_flash_event_family_version_mutation() to service_role;

drop trigger if exists prevent_live_flash_event_family_version_mutation
  on public.live_flash_event_family_versions;

create trigger prevent_live_flash_event_family_version_mutation
before update or delete
on public.live_flash_event_family_versions
for each row
execute function public.prevent_live_flash_event_family_version_mutation();

insert into public.live_flash_event_family_versions (
  family_id, version, captured_at, trigger_flash_id, canonical_headline,
  signal_category, material_update_reason, content_hash
)
select
  family.family_id,
  1,
  family.first_seen_at,
  family.latest_flash_id,
  family.canonical_headline,
  family.signal_category,
  'initial_event_family',
  coalesce(family.latest_content_hash, repeat('0', 64))
from public.live_flash_event_families family
where not exists (
  select 1
  from public.live_flash_event_family_versions version_row
  where version_row.family_id = family.family_id
    and version_row.version = 1
);

comment on table public.live_flash_event_family_versions is
  'Append-only audit ledger for material developments of a canonical real-world event family. UPDATE and DELETE are rejected at database level.';

comment on column public.live_flash_event_family_versions.version is
  'Material-development version. Additional independent source reports do not increment this value.';
