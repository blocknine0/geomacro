-- =============================================================================
-- Geomacro Critical-Minerals Fast Intelligence Candidates
--
-- These providers are valuable for critical-minerals intelligence but are not
-- silently scraped or treated as unrestricted free data. Register them now so
-- a future licensed feed/API can plug into the same governed source layer.
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
values
(
  'metalminer_candidate',
  'MetalMiner Candidate',
  'MetalMiner',
  'CRITICAL_MINERALS',
  'MIXED',
  'ACCOUNT',
  'https://agmetalminer.com/',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'MetalMiner offers proprietary metals intelligence and partner/API/content-feed integrations. Do not scrape the public site. Candidate for a future commercial data/partner agreement and AI-agent feed integration.'
),
(
  'argus_battery_materials_candidate',
  'Argus Battery Materials Candidate',
  'Argus Media',
  'CRITICAL_MINERALS',
  'MIXED',
  'ACCOUNT',
  'https://www.argusmedia.com/en/commodities/battery-materials',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'REAL_TIME',
  'Argus provides battery/critical-minerals prices, market news and analytics through commercial services. Keep disabled until Geomacro has licensed machine access and explicit downstream-use rights.'
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
