begin;

-- Environmental observations need their own storage category. This does not
-- promote them into any Risk Gate module.
alter table public.live_external_observations
  drop constraint if exists live_external_observations_category_check;

alter table public.live_external_observations
  add constraint live_external_observations_category_check
  check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS','MULTI_DOMAIN'));

update public.live_external_sources
set enabled_for_ingestion=true,
    enabled_for_commercial_signals=false,
    category='MULTI_DOMAIN',
    updated_at=now()
where source_id='noaa_ncei_cdo_api'
  and commercial_usage_status='COMMERCIAL_OK';

update public.live_external_sources
set enabled_for_ingestion=true,
    enabled_for_commercial_signals=false,
    updated_at=now()
where source_id='eia_api_v2'
  and commercial_usage_status='COMMERCIAL_OK';

commit;
