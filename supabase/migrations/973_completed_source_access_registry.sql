begin;

-- Credential/access readiness registry.
-- This migration records sources whose access has already been obtained.
-- It deliberately does NOT enable ingestion or commercial signals and never
-- stores the actual API keys/tokens in Git.
--
-- Production activation remains a separate later gate:
-- credential -> adapter -> normalization -> runtime probe -> rights review
-- -> CI/certification -> enablement.

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
  'us_bls_api_v2',
  'BLS Public API v2',
  'U.S. Bureau of Labor Statistics',
  'MACRO',
  'API',
  'API_KEY',
  'https://api.bls.gov/publicAPI/v2/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL_US_PRIMARY',
  'SOURCE_DEPENDENT',
  'API v2 registration key obtained. Secret must be supplied at runtime as BLS_API_KEY. Key is intentionally not stored in Git. Adapter/runtime certification and commercial-rights review remain separate gates.'
),
(
  'bea_public_api',
  'BEA Public API',
  'U.S. Bureau of Economic Analysis',
  'MACRO',
  'API',
  'API_KEY',
  'https://apps.bea.gov/api/data/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL_US_PRIMARY',
  'SOURCE_DEPENDENT',
  'API key obtained. Secret must be supplied at runtime as BEA_API_KEY. Key is intentionally not stored in Git. Exact dataset reuse terms, adapter and runtime certification remain open.'
),
(
  'alpha_vantage_api',
  'Alpha Vantage API',
  'Alpha Vantage',
  'MACRO',
  'API',
  'API_KEY',
  'https://www.alphavantage.co/query',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Free API key obtained. Secret must be supplied at runtime as ALPHA_VANTAGE_API_KEY. No commercial production enablement until exact plan/terms, rate limits, adapter and runtime behavior are verified.'
),
(
  'eia_api_v2',
  'EIA API v2',
  'U.S. Energy Information Administration',
  'CRITICAL_MINERALS',
  'API',
  'API_KEY',
  'https://api.eia.gov/v2/',
  'U.S. Government public domain; EIA Copyrights and Reuse policy',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'API key obtained. Secret must be supplied at runtime as EIA_API_KEY. Source is registered for energy/supply-chain coverage but remains disabled until exact adapter, methodology, runtime certification and rights checks pass.'
),
(
  'noaa_ncei_cdo_api',
  'NOAA NCEI Climate Data Online API',
  'NOAA National Centers for Environmental Information',
  'GEOPOLITICS',
  'API',
  'API_KEY',
  'https://www.ncei.noaa.gov/cdo-web/api/v2/',
  'U.S. Government public data; source credit required where applicable',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'NCEI/CDO token obtained. Secret must be supplied at runtime as NOAA_NCEI_TOKEN. Token is intentionally not stored in Git. Hazard/climate methodology, adapter and runtime certification remain separate gates.'
),
(
  'wto_timeseries',
  'WTO Timeseries API',
  'World Trade Organization',
  'MACRO',
  'API',
  'API_KEY',
  'https://api.wto.org/timeseries/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Timeseries API access/subscription completed. Secret must be supplied at runtime as WTO_API_KEY. Existing source registry entry is retained and remains disabled until exact API adapter, dataset contract, runtime proof and commercial-use review are complete.'
),
(
  'opensanctions_hosted_api',
  'OpenSanctions Hosted API',
  'OpenSanctions',
  'GEOPOLITICS',
  'API',
  'API_KEY',
  'https://api.opensanctions.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Hosted API trial key obtained; trial currently expires 2026-10-23. Secret must be supplied at runtime as OPENSANCTIONS_API_KEY. Trial access is not treated as commercial production permission; licence/plan review, adapter and runtime certification are required before enablement.'
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
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

commit;
