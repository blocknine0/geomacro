begin;

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
