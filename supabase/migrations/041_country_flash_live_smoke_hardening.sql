-- =============================================================================
-- Geomacro country-flash production smoke-test hardening
--
-- 1) MINING.com RSS returned persistent CDN 403 responses from the live worker.
--    Keep the source registered for provenance/history, but disable it as an
--    active ingestion source until a supported machine endpoint is available.
-- 2) Register the official USGS Minerals News RSS endpoint as the preferred
--    critical-minerals candidate for the next hot-path activation.
-- 3) Remove the ambiguous Iceland alias "Island" from the canonical country
--    registry because it produced a false attribution for headlines such as
--    "Kharg Island" -> ISL during the first production smoke test.
-- =============================================================================

update public.live_external_sources
set
  enabled_for_ingestion = false,
  notes = concat_ws(
    ' ',
    nullif(notes, ''),
    'Production smoke test on 2026-09-09 returned repeated HTTP 403/CDN blocks from the RSS endpoint. Disabled from the active hot path until a supported machine endpoint is available.'
  ),
  updated_at = now()
where source_id = 'mining_com_rss';

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
  'usgs_minerals_news_rss',
  'USGS Minerals News RSS',
  'U.S. Geological Survey',
  'CRITICAL_MINERALS',
  'RSS',
  'NONE',
  'https://www.usgs.gov/news/minerals/feed',
  null,
  'DERIVED_ONLY',
  false,
  true,
  false,
  false,
  'USA',
  'SOURCE_DEPENDENT',
  'Official Mineral Resources Program news RSS endpoint. Registered as the preferred replacement for the blocked MINING.com hot-path feed. Keep disabled until the flash-ingest source allowlist and deployment are updated together.'
)
on conflict (source_id)
do update set
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

update public.live_country_registry
set
  aliases = coalesce(
    (
      select array_agg(alias_value order by ordinal_position)
      from unnest(aliases) with ordinality as alias_row(alias_value, ordinal_position)
      where lower(trim(alias_value)) <> 'island'
    ),
    '{}'::text[]
  ),
  updated_at = now()
where iso3 = 'ISL'
  and exists (
    select 1
    from unnest(aliases) as alias_value
    where lower(trim(alias_value)) = 'island'
  );
