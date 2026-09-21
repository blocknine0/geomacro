begin;

-- Permanent control-plane source for the single Geomacro intelligence scheduler.
-- The scheduler stores task-level cadence/cursor state in live_ingestion_cursors.
insert into public.live_source_registry (
  source_key, source_name, provider, source_type, base_url, enabled,
  cadence_seconds, raw_storage_policy, redistribution_allowed,
  derivative_intelligence_allowed, attribution_required, notes
)
values (
  'geomacro_intelligence_orchestrator',
  'Geomacro Intelligence Orchestrator',
  'Geomacro',
  'news_discovery',
  'https://geomacro.live/',
  true,
  900,
  'internal_only',
  false,
  true,
  false,
  'Single scheduled control plane for live intelligence adapters. Task cadence is stored in live_ingestion_cursors; upstream source rights remain independently governed.'
)
on conflict (source_key) do update set
  source_name = excluded.source_name,
  provider = excluded.provider,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  enabled = true,
  cadence_seconds = 900,
  raw_storage_policy = excluded.raw_storage_policy,
  redistribution_allowed = excluded.redistribution_allowed,
  derivative_intelligence_allowed = excluded.derivative_intelligence_allowed,
  attribution_required = excluded.attribution_required,
  notes = excluded.notes,
  updated_at = now();

-- Restore the exact rights-reviewed GDELT V2 registry state required by its
-- governed ingestion adapter. This is not a commercial Risk Gate enablement.
insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required, enabled_for_ingestion,
  enabled_for_commercial_signals, country_scope, freshness_class, notes
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
  true,
  false,
  'GLOBAL',
  'REAL_TIME_15_MIN',
  'Governed GDELT V2 event metadata ingestion. Underlying publisher article text/media remain excluded from customer delivery; commercial Risk Gate signal activation remains disabled.'
)
on conflict (source_id) do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  licence_name = excluded.licence_name,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = excluded.raw_redistribution_allowed,
  attribution_required = excluded.attribution_required,
  enabled_for_ingestion = excluded.enabled_for_ingestion,
  enabled_for_commercial_signals = excluded.enabled_for_commercial_signals,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

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
    raise exception 'GDELT V2 governed source repair did not produce the required ingestion-only registry state';
  end if;
end;
$$;

commit;
