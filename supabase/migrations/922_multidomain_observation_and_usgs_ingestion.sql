begin;

-- Real-world hazard observations do not belong in geopolitics, macro, or
-- critical-minerals buckets. Extend the normalized observation contract rather
-- than misclassifying them merely to satisfy the old check constraint.
alter table public.live_external_observations
  drop constraint if exists live_external_observations_category_check;

alter table public.live_external_observations
  add constraint live_external_observations_category_check
  check (
    category in (
      'GEOPOLITICS',
      'MACRO',
      'CRITICAL_MINERALS',
      'MULTI_DOMAIN'
    )
  );

update public.live_external_sources
set
  enabled_for_ingestion = true,
  enabled_for_commercial_signals = false,
  notes = 'Governed USGS real-time earthquake GeoJSON feed approved for normalized hazard observation ingestion only. Coordinates are preserved, but no country ISO3 is assigned until a separately governed geospatial country-attribution method exists. Risk Gate climate/environment scoring remains disabled until methodology, mapping, tests and census evidence pass.',
  updated_at = now()
where source_id = 'usgs_earthquake_hazards'
  and commercial_usage_status = 'COMMERCIAL_OK';

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'usgs_earthquake_hazards'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = false
  ) then
    raise exception 'USGS earthquake ingestion promotion blocked: source registration is missing or no longer commercially approved';
  end if;
end;
$$;

commit;
