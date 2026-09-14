begin;

-- Multi-source commercial activation registry.
-- Rights approval and operational activation are separate gates. New sources are
-- registered conservatively and remain disabled for ingestion/commercial signals
-- until an exact adapter, dataset contract and production evidence are present.

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
  'oecd_public_finance',
  'Government Finances and Public Sector Debt',
  'OECD',
  'MACRO',
  'SDMX',
  'NONE',
  'https://sdmx.oecd.org/public/rest/',
  'OECD Terms and Conditions - Data',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'OECD_AND_PARTNERS',
  'QUARTERLY',
  'Commercial use is permitted under OECD data terms unless dataset metadata identifies additional or third-party restrictions. Activation is limited to exact OECD-owned public-finance dataflows after adapter metadata checks. D1-D4 debt concepts must not be silently mixed with World Bank central-government debt.'
),
(
  'eurostat_government_finance',
  'Eurostat Government Finance Statistics',
  'European Commission / Eurostat',
  'MACRO',
  'SDMX',
  'NONE',
  'https://ec.europa.eu/eurostat/api/dissemination/',
  'European Commission reuse policy / Eurostat copyright notice',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'EU_EFTA_ACCESSION_CANDIDATES',
  'SOURCE_DEPENDENT',
  'Commercial reuse is generally authorised with attribution, subject to dataset-specific notices and Eurostat exceptions. Do not use third-party-owned or geographically restricted rows in paid delivery.'
),
(
  'adb_ado_macro_2026',
  'Asian Development Outlook 2026 macro datasets',
  'Asian Development Bank',
  'MACRO',
  'CSV',
  'NONE',
  'https://data.adb.org/',
  'CC BY 3.0 IGO where the exact dataset is marked accordingly',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'DEVELOPING_ASIA',
  'PERIODIC',
  'Only exact ADB Data Library datasets displaying CC BY 3.0 IGO may inherit this source contract. Dataset-specific licence metadata must be captured before ingestion is enabled.'
),
(
  'eia_international_energy',
  'EIA International Energy Data',
  'U.S. Energy Information Administration',
  'MULTI_DOMAIN',
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
  'EIA data/files/databases may be reused with acknowledgement. API requires a free key. Third-party protected materials and logos are excluded. Risk Gate energy_commodities remains blocked until a versioned methodology and adapter exist.'
),
(
  'usgs_earthquake_hazards',
  'USGS Earthquake Hazards Program feeds and catalog',
  'U.S. Geological Survey',
  'MULTI_DOMAIN',
  'JSON',
  'NONE',
  'https://earthquake.usgs.gov/earthquakes/feed/',
  'USGS-produced data: U.S. public domain; source credit requested',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'USGS-produced data may be reused with source credit; third-party copyrighted material is excluded. Risk Gate climate_environment_hazard remains blocked until schema and methodology are versioned.'
),
(
  'bis_statistics',
  'BIS Statistics',
  'Bank for International Settlements',
  'MACRO',
  'SDMX',
  'NONE',
  'https://stats.bis.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Keep outside paid Risk Gate delivery until commercial-product reuse conditions are deliberately cleared.'
),
(
  'vdem_v16',
  'V-Dem Dataset v16',
  'V-Dem Institute',
  'MULTI_DOMAIN',
  'BULK_DOWNLOAD',
  'NONE',
  'https://www.v-dem.net/data/the-v-dem-dataset/',
  'CC BY-SA 4.0',
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'ANNUAL',
  'Share-alike obligations require product/licensing review before any proprietary paid Risk Object or Risk Gate derivative uses this dataset.'
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

-- Existing registry rows whose old status was more permissive than the current
-- documented rights/adapter evidence must fail closed until deliberately re-promoted.
update public.live_external_sources
set
  commercial_usage_status = 'PERMISSION_REQUIRED',
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'Official UN Comtrade licence prohibits automated downloading/redistribution/commercial exploitation without prior written permission. Keep disabled until permission and exact API contract are recorded.',
  updated_at = now()
where source_id = 'un_comtrade';

update public.live_external_sources
set
  commercial_usage_status = 'PERMISSION_REQUIRED',
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'IMF statistical data has special reuse terms, but current IMF terms direct potential commercial reusers to request permission. Keep disabled for paid Risk Gate delivery until permission is recorded.',
  updated_at = now()
where source_id = 'imf_data';

update public.live_external_sources
set
  commercial_usage_status = 'REVIEW_REQUIRED',
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'Registry entry predates the current commercial-rights evidence register. Exact IEA Critical Minerals dataset/version, terms, provenance and operational adapter must be reviewed before re-enablement.',
  updated_at = now()
where source_id = 'iea_critical_minerals';

update public.live_external_sources
set
  commercial_usage_status = 'REVIEW_REQUIRED',
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'Registry entry predates the current commercial-rights evidence register. Exact JRC RMIS item-level reuse terms, provenance and operational adapter must be reviewed before re-enablement.',
  updated_at = now()
where source_id = 'jrc_rmis_supply_chain';

commit;
