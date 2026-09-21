begin;

-- Seed the exact governed GDELT v2 event registration when production history
-- does not yet contain migration 920. This keeps migration 923 idempotent and
-- scoped without re-applying unrelated source-registry changes.
insert into public.live_external_sources (
  source_id,
  source_name,
  provider_name,
  category,
  access_type,
  authentication_type,
  base_url,
  licence_name,
  commercial_usage_status,
  raw_redistribution_allowed,
  attribution_required,
  enabled_for_ingestion,
  enabled_for_commercial_signals,
  country_scope,
  freshness_class,
  notes
)
values (
  'gdelt_v2_events',
  'GDELT 2.0 Event Database',
  'GDELT Project',
  'GEOPOLITICS',
  'BULK_DOWNLOAD',
  'NONE',
  'https://data.gdeltproject.org/gdeltv2/',
  'GDELT Terms of Use - unlimited and unrestricted academic, commercial and governmental use with citation',
  'COMMERCIAL_OK',
  true,
  true,
  false,
  false,
  'GLOBAL',
  'REAL_TIME_15_MIN',
  'GDELT 2.0 event metadata is released every 15 minutes and permits commercial use and redistribution with citation. This source is event/news-derived evidence, not a substitute for authoritative conflict or government statistics. Do not redistribute underlying publisher article text.'
)
on conflict (source_id) do nothing;

update public.live_external_sources
set
  enabled_for_ingestion = true,
  enabled_for_commercial_signals = false,
  notes = 'Governed GDELT 2.0 Event Database adapter approved for normalized event-metadata ingestion only. Country attribution uses ActionGeo FIPS10-4 codes reconciled through the official GDELT FIPS lookup and Geomacro canonical country registry. This news-derived source is not a replacement for UCDP and is not a Risk Gate commercial signal until a versioned freshness-overlay methodology and country census pass.',
  updated_at = now()
where source_id = 'gdelt_v2_events'
  and commercial_usage_status = 'COMMERCIAL_OK';

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'gdelt_v2_events'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = false
  ) then
    raise exception 'GDELT ingestion promotion blocked: source registration is missing or no longer commercially approved';
  end if;
end;
$$;

commit;
