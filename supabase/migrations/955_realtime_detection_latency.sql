-- =============================================================================
-- Geomacro real-time detection latency evidence
--
-- Stores only compact timing metadata. No third-party raw payload is added.
-- source_updated_at_utc is the source publication/update timestamp supplied by
-- the adapter. detection_latency_ms measures source -> Geomacro ingestion latency.
-- =============================================================================

alter table public.live_flash_events
  add column if not exists source_updated_at_utc timestamptz,
  add column if not exists detection_latency_ms bigint;

alter table public.live_flash_event_versions
  add column if not exists source_updated_at_utc timestamptz,
  add column if not exists detection_latency_ms bigint;

alter table public.live_flash_event_family_versions
  add column if not exists source_updated_at_utc timestamptz,
  add column if not exists detection_latency_ms bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_flash_events_detection_latency_check'
  ) then
    alter table public.live_flash_events
      add constraint live_flash_events_detection_latency_check
      check (detection_latency_ms is null or detection_latency_ms >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'live_flash_event_versions_detection_latency_check'
  ) then
    alter table public.live_flash_event_versions
      add constraint live_flash_event_versions_detection_latency_check
      check (detection_latency_ms is null or detection_latency_ms >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'live_flash_event_family_versions_detection_latency_check'
  ) then
    alter table public.live_flash_event_family_versions
      add constraint live_flash_event_family_versions_detection_latency_check
      check (detection_latency_ms is null or detection_latency_ms >= 0);
  end if;
end
$$;

create index if not exists live_flash_events_latency_idx
  on public.live_flash_events(source_updated_at_utc desc, detection_latency_ms);

create index if not exists live_flash_event_versions_latency_idx
  on public.live_flash_event_versions(source_updated_at_utc desc, detection_latency_ms);

create index if not exists live_flash_event_family_versions_latency_idx
  on public.live_flash_event_family_versions(source_updated_at_utc desc, detection_latency_ms);

comment on column public.live_flash_events.source_updated_at_utc is
  'Timestamp supplied by the source adapter for publication or material source edit.';

comment on column public.live_flash_events.detection_latency_ms is
  'Non-negative source-to-Geomacro ingestion latency in milliseconds for the current source revision.';

comment on column public.live_flash_event_versions.detection_latency_ms is
  'Non-negative source-to-Geomacro ingestion latency in milliseconds for this immutable source revision.';

comment on column public.live_flash_event_family_versions.detection_latency_ms is
  'Non-negative source-to-Geomacro ingestion latency for the source revision that triggered this family version.';