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
  'REAL_TIME_MINUTE',
  'USGS GeoJSON summary feeds are updated every minute. USGS-produced data may be reused with source credit; third-party copyrighted material is excluded. Risk Gate climate_environment_hazard remains blocked until schema and methodology are versioned.'
),
(
  'nasa_firms_modis_nrt',
  'FIRMS MODIS Near Real-Time Fire Detections',
  'NASA LANCE / FIRMS',
  'MULTI_DOMAIN',
  'API',
  'API_KEY',
  'https://firms.modaps.eosdis.nasa.gov/api/',
  'NASA Earthdata open-data policy; NASA-led mission data generally CC0 unless specifically restricted',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Use only NASA-led MODIS NRT detections under the reviewed NASA Earthdata open-data boundary. A free FIRMS MAP_KEY is required. Non-NASA or separately restricted satellite products must not inherit this status. Hazard methodology is not yet active.'
),
(
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
  false,
  false,
  'GLOBAL',
  'REAL_TIME_15_MIN',
  'GDELT 2.0 event metadata is released every 15 minutes and permits commercial use and redistribution with citation. This source is event/news-derived evidence, not a substitute for authoritative conflict or government statistics. Do not redistribute underlying publisher article text.'
),
(
  'faostat_global',
  'FAOSTAT Corporate Statistical Databases',
  'Food and Agriculture Organization of the United Nations',
  'MULTI_DOMAIN',
  'API',
  'NONE',
  'https://www.fao.org/faostat/',
  'Dataset-specific CC BY 4.0 plus FAO Statistical Database Terms of Use',
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL_245_PLUS_COUNTRIES_AND_TERRITORIES',
  'PERIODIC',
  'FAOSTAT offers broad global agriculture and trade coverage, but its additional database terms restrict use in conjunction with promotion of a commercial enterprise/product and may contain third-party exceptions. Keep outside paid Risk Gate delivery until legal/product-use review is closed for exact datasets.'
),
(
  'ilostat_global',
  'ILOSTAT labour statistics',
  'International Labour Organization',
  'MULTI_DOMAIN',
  'BULK_DOWNLOAD',
  'NONE',
  'https://rplumber.ilo.org/data/indicator/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'ILOSTAT provides programmatic and bulk access. Exact statistical-database reuse terms for paid derivative products must be recorded before commercial activation; publication-level CC BY terms are not sufficient evidence by themselves.'
),
(
  'gdacs_global_disasters',
  'Global Disaster Alert and Coordination System',
  'European Commission JRC / UN OCHA / UNOSAT',
  'MULTI_DOMAIN',
  'API',
  'NONE',
  'https://www.gdacs.org/gdacsapi/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'GDACS provides near-real-time multi-hazard alerts but its terms emphasise model limitations and do not by themselves establish a paid commercial reuse contract. Keep disabled until exact reuse rights and attribution are deliberately recorded.'
),
(
  'who_gho',
  'WHO Global Health Observatory',
  'World Health Organization',
  'MULTI_DOMAIN',
  'API',
  'NONE',
  'https://ghoapi.azureedge.net/',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'WHO_194_MEMBER_STATES',
  'SOURCE_DEPENDENT',
  'WHO dataset terms restrict commercial-enterprise promotion and broader modification; keep outside paid Risk Gate delivery unless the exact intended use is cleared.'
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

-- The legacy generic GDELT registry was review-gated before official terms were
-- captured. Keep it disabled operationally, but correct the rights state for the
-- exact GDELT datasets while the new v2 adapter/proof path is built.
update public.live_external_sources
set
  licence_name = 'GDELT Terms of Use - unrestricted academic, commercial and governmental use with citation',
  commercial_usage_status = 'COMMERCIAL_OK',
  raw_redistribution_allowed = true,
  attribution_required = true,
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'Official GDELT terms permit unrestricted commercial use and redistribution with citation. Legacy adapter remains disabled until the exact GDELT 2.0 15-minute ingestion and release-manifest path is operationally proven.',
  updated_at = now()
where source_id = 'gdelt_v2';

commit;
