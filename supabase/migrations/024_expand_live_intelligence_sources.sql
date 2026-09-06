-- =============================================================================
-- Geomacro Live Intelligence Source Expansion
--
-- Adds additional current/public sources across:
--   1. GEOPOLITICS
--   2. MACRO
--   3. CRITICAL_MINERALS
--
-- IMPORTANT
-- Registration does not automatically mean commercial ingestion is enabled.
-- Each source is gated independently by provenance/licence status.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- GEOPOLITICS / HUMANITARIAN PRESSURE
-- ---------------------------------------------------------------------------

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
  'unhcr_refugee_statistics',
  'UNHCR Refugee Population Statistics',
  'UNHCR',
  'GEOPOLITICS',
  'API',
  'NONE',
  'https://api.unhcr.org/',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Forced displacement and statelessness observations. Preserve dataset-level provenance because some incorporated datasets may originate from other organisations.'
),

(
  'unhcr_operational_data',
  'UNHCR Operational Data Portal',
  'UNHCR',
  'GEOPOLITICS',
  'MIXED',
  'NONE',
  'https://data.unhcr.org/',
  'CC BY 4.0 DEFAULT',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'VARIABLE',
  'Registered for future event-level humanitarian pressure ingestion. Dataset-specific exceptions must be checked before enablement.'
),

(
  'reliefweb',
  'ReliefWeb',
  'United Nations OCHA',
  'GEOPOLITICS',
  'API',
  'NONE',
  'https://api.reliefweb.int/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Potential source for disaster, conflict and humanitarian-event context. Keep disabled until exact content reuse and downstream commercial terms are recorded.'
),

(
  'gdacs',
  'Global Disaster Alert and Coordination System',
  'United Nations / European Commission',
  'GEOPOLITICS',
  'MIXED',
  'NONE',
  'https://www.gdacs.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Candidate current disaster and alert signal. Keep commercially disabled until exact reuse terms are recorded.'
),

(
  'acled',
  'ACLED',
  'ACLED',
  'GEOPOLITICS',
  'API',
  'API_KEY',
  'https://acleddata.com/',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'High-value conflict source but must not enter commercial production without appropriate ACLED access/licensing.'
),


-- ---------------------------------------------------------------------------
-- MACRO / TRADE / DEVELOPMENT
-- ---------------------------------------------------------------------------

(
  'world_bank_data360',
  'World Bank Data360',
  'World Bank',
  'MACRO',
  'API',
  'NONE',
  'https://data360.worldbank.org/',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Additional structured World Bank datasets. Preserve individual dataset/source metadata and licence.'
),

(
  'world_bank_projects',
  'World Bank Projects and Operations',
  'World Bank',
  'MACRO',
  'API',
  'NONE',
  'https://search.worldbank.org/api/v2/projects',
  'CC BY 4.0 DEFAULT',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Potential sovereign-development and project pipeline signal. Keep ingestion disabled until project-level provenance mapping is implemented.'
),

(
  'oecd_sdmx',
  'OECD Data Explorer / SDMX',
  'OECD',
  'MACRO',
  'SDMX',
  'NONE',
  'https://sdmx.oecd.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Useful complementary macro source. Commercial/reuse status must be recorded before enabling.'
),

(
  'bis_statistics',
  'BIS Statistics',
  'Bank for International Settlements',
  'MACRO',
  'SDMX',
  'NONE',
  'https://data.bis.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Potential banking, credit, FX and financial-system stress signals. Disabled pending reuse review.'
),

(
  'fao_faostat',
  'FAOSTAT',
  'Food and Agriculture Organization',
  'MACRO',
  'MIXED',
  'NONE',
  'https://www.fao.org/faostat/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Potential food-price, production and food-security macro stress signals. Dataset terms must be checked before enablement.'
),


-- ---------------------------------------------------------------------------
-- CRITICAL MINERALS / SUPPLY CHAIN
-- ---------------------------------------------------------------------------

(
  'usgs_mcs',
  'USGS Mineral Commodity Summaries',
  'U.S. Geological Survey',
  'CRITICAL_MINERALS',
  'BULK_DOWNLOAD',
  'NONE',
  'https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries',
  'US PUBLIC DOMAIN / DATA RELEASE SPECIFIC',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'ANNUAL',
  'Use USGS-authored/public-domain or explicitly open data-release material only. Preserve release/version/DOI provenance.'
),

(
  'usgs_mineral_statistics',
  'USGS Mineral Commodity Statistics and Information',
  'U.S. Geological Survey',
  'CRITICAL_MINERALS',
  'MIXED',
  'NONE',
  'https://www.usgs.gov/centers/national-minerals-information-center',
  'US PUBLIC DOMAIN / ITEM SPECIFIC',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Registry entry for future current mineral statistics. Enable individual feeds only after item-level provenance is implemented.'
),

(
  'usgs_critical_minerals',
  'USGS Critical Minerals Information',
  'U.S. Geological Survey',
  'CRITICAL_MINERALS',
  'MIXED',
  'NONE',
  'https://www.usgs.gov/',
  'US PUBLIC DOMAIN / ITEM SPECIFIC',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Candidate source for critical-mineral classifications, production, reserves and supply-risk context.'
),

(
  'ec_rmis',
  'EU Raw Materials Information System',
  'European Commission Joint Research Centre',
  'CRITICAL_MINERALS',
  'MIXED',
  'NONE',
  'https://rmis.jrc.ec.europa.eu/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Umbrella RMIS source. Existing specific JRC supply-chain dataset remains separately governed.'
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
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();


comment on table public.live_external_sources is
  'Governed registry of external current/live sources. Registration never overrides dataset-specific licence, attribution, provenance, freshness or commercial-eligibility requirements.';
