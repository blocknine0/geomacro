-- =============================================================================
-- Geomacro BBC World RSS source registration
--
-- 037 predates the BBC source. This idempotent migration converges authoritative
-- production source governance without changing commercial rights policy.
-- =============================================================================

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
  'bbc_world_rss',
  'BBC News World RSS',
  'BBC',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Independent geopolitical corroboration/feed intake only. Store minimal feed metadata and Geomacro-derived intelligence; do not redistribute BBC article bodies. Commercial signal use remains gated pending explicit rights review.'
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

