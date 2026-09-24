begin;
update public.live_external_sources
set enabled_for_ingestion=true, enabled_for_commercial_signals=false, updated_at=now()
where source_id in ('eia_api_v2','noaa_ncei_cdo_api') and commercial_usage_status='COMMERCIAL_OK';
commit;
