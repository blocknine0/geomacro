begin;

-- Phase 2 promotion. Runtime code still requires a clean write-complete release
-- manifest, at least twenty concept-consistent peers, and a country-level
-- verified signal before Eurostat can supply sovereign_fiscal.
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
    raise exception 'Eurostat sovereign-fiscal promotion blocked: expected COMMERCIAL_OK, ingestion=true, signals=false';
  end if;
end;
$$;

update public.live_external_sources
set
  enabled_for_commercial_signals = true,
  updated_at = now()
where source_id = 'eurostat_government_finance'
  and commercial_usage_status = 'COMMERCIAL_OK'
  and enabled_for_ingestion = true
  and enabled_for_commercial_signals = false;

do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'eurostat_government_finance'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = true
  ) then
    raise exception 'Eurostat sovereign-fiscal promotion failed to activate the governed signal state';
  end if;
end;
$$;

commit;
