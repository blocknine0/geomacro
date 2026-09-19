-- =============================================================================
-- Geomacro: governed Xinhua China RSS source registry
--
-- Registers the Xinhua source before any live-flash event can reference it.
-- Intake is enabled; commercial-signal use remains disabled pending explicit
-- source-rights review.
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
  'xinhua_english_china_rss',
  'Xinhua English China RSS',
  'Xinhua News Agency / Xinhuanet',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://www.xinhuanet.com/english/rss/chinarss.xml',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'CHN',
  'NEAR_REAL_TIME',
  'Governed China-focused RSS intake for real-time corroboration. Raw redistribution remains disabled and the source is not eligible for commercial signal use until rights are explicitly reviewed.'
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
