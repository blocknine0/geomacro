begin;

-- =============================================================================
-- Geomacro Global Humanitarian / Food / Health Source Family Expansion
--
-- Registry-only phase. These sources are deliberately NOT enabled for live
-- ingestion or commercial signals. Each source requires an exact collector
-- contract, provenance/release manifest, rights review, negative tests and
-- production certification before promotion.
--
-- Sources:
--   * IOM DTM API 3.0: displacement / mobility pressure
--   * OCHA ReliefWeb API v2: continuously updated humanitarian event context
--   * FAOSTAT API: food/agriculture structural and macro stress context
--   * WHO Global Health Observatory OData: health-shock context
--
-- Raw publisher content is not redistributed by this registry.
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
  'iom_dtm_api_v3',
  'IOM Displacement Tracking Matrix API v3',
  'International Organization for Migration',
  'GEOPOLITICS',
  'API',
  'API_KEY',
  'https://dtm.iom.int/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Official DTM API v3 provides structured displacement data, including drivers, origins, sex and P-coded administrative geography. API access requires registration/authentication. Exact dataset-level reuse terms, rate limits, field contract and attribution must be certified before ingestion.'
),
(
  'ocha_reliefweb_api_v2',
  'OCHA ReliefWeb API v2',
  'United Nations Office for the Coordination of Humanitarian Affairs',
  'GEOPOLITICS',
  'API',
  'APP_NAME',
  'https://api.reliefweb.int/v2/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official read-only API for ReliefWeb curated and continuously updated humanitarian content. Since 1 Nov 2025 a pre-approved appname is required. Returned reports may contain third-party copyrighted material; retain only governed metadata/derived signals unless item-level reuse rights are established.'
),
(
  'faostat_api',
  'FAOSTAT API',
  'Food and Agriculture Organization of the United Nations',
  'MACRO',
  'API',
  'NONE',
  'https://www.fao.org/faostat/',
  'CC BY 4.0 with FAO Statistical Database additional terms and dataset-specific exceptions',
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Official 2026 FAOSTAT API developer portal exposes machine-readable food/agriculture datasets. Database terms include additional restrictions on use in conjunction with promotion of commercial enterprises/products and third-party exceptions. Keep disabled for paid delivery until exact intended use is cleared.'
),
(
  'who_gho_odata_api',
  'WHO Global Health Observatory OData API',
  'World Health Organization',
  'MULTI_DOMAIN',
  'OData',
  'NONE',
  'https://ghoapi.azureedge.net/api/',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Official WHO GHO OData interface provides indicator/dimension queries. Commercial reuse conditions must be established for the exact datasets and intended product use before any production or paid signal path.'
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

-- Keep humanitarian coverage governance separate from source activation.
insert into public.live_source_coverage_targets (
  coverage_id,
  category,
  scope_type,
  scope_code,
  source_class,
  required,
  minimum_independent_paths,
  status,
  primary_source_id,
  fallback_source_id,
  notes
)
values
(
  'geo-displacement-dtm',
  'GEOPOLITICS',
  'GLOBAL',
  'GLOBAL',
  'INTERNATIONAL_PRIMARY',
  true,
  2,
  'PARTIAL',
  'iom_dtm_api_v3',
  'unhcr_global_public_api',
  'Global displacement/mobility pressure. DTM and UNHCR remain separate evidence families; promotion requires independent-path corroboration and source-specific freshness/coverage measurement.'
),
(
  'geo-humanitarian-reliefweb',
  'GEOPOLITICS',
  'GLOBAL',
  'GLOBAL',
  'GLOBAL_AGGREGATOR',
  true,
  2,
  'PARTIAL',
  'ocha_reliefweb_api_v2',
  'gdelt_v2_events',
  'Humanitarian event discovery/corroboration. ReliefWeb is a curated aggregator, so it must not be treated as equivalent to an original publisher.'
),
(
  'macro-food-agriculture',
  'MACRO',
  'GLOBAL',
  'GLOBAL',
  'STRUCTURED_DATA',
  true,
  2,
  'PARTIAL',
  'faostat_api',
  'world_bank_data360',
  'Food/agriculture structural stress context. Exact FAOSTAT dataset terms and compatible indicators must be certified before scoring use.'
)
on conflict (category, scope_type, scope_code, source_class)
do update set
  required = excluded.required,
  minimum_independent_paths = excluded.minimum_independent_paths,
  status = excluded.status,
  primary_source_id = excluded.primary_source_id,
  fallback_source_id = excluded.fallback_source_id,
  notes = excluded.notes,
  updated_at = now();

-- Fail closed even if a previous manual change attempted to enable these IDs.
update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  updated_at = now()
where source_id in (
  'iom_dtm_api_v3',
  'ocha_reliefweb_api_v2',
  'faostat_api',
  'who_gho_odata_api'
);

commit;
