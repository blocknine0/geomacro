-- ============================================================================
-- Geomacro observed-time contract for live structured intelligence
--
-- last_seen_at remains the source/event publication chronology.
-- last_observed_at records when the governed ingestion pipeline actually
-- observed the source evidence in a verified fragment.
--
-- Current-signal availability must use observation time. Evidence-age
-- qualification for Risk Objects continues to use evidence_published_at.
-- ============================================================================

alter table public.live_structured_events
  add column if not exists last_observed_at timestamptz;

update public.live_structured_events
set last_observed_at = coalesce(last_observed_at, last_seen_at)
where last_observed_at is null
  and last_seen_at is not null;

create index if not exists live_structured_events_observed_time_idx
  on public.live_structured_events(last_observed_at desc);

comment on column public.live_structured_events.last_seen_at is
  'Latest source/event publication timestamp represented by the structured story.';

comment on column public.live_structured_events.last_observed_at is
  'Latest timestamp at which Geomacro observed qualifying source evidence in a verified ingestion fragment. Current-signal freshness uses this field; source evidence age uses evidence_published_at.';
