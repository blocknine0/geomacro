begin;

update public.live_external_sources
set
  enabled_for_ingestion = true,
  enabled_for_commercial_signals = false,
  notes = 'Governed Eurostat gov_10q_ggdebt adapter is approved for normalized observation ingestion only. Metric is general-government gross debt (% GDP). Do not merge directly with World Bank central-government debt and do not use as a Risk Gate commercial signal until harmonisation methodology, tests and country-census evidence pass.',
  updated_at = now()
where source_id = 'eurostat_government_finance'
  and commercial_usage_status = 'COMMERCIAL_OK';

-- Fail closed if the source row is missing or its rights state changed.
do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'eurostat_government_finance'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = false
  ) then
    raise exception 'Eurostat ingestion promotion blocked: source registration is missing or no longer commercially approved';
  end if;
end;
$$;

commit;
