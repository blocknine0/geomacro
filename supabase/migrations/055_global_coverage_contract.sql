-- =============================================================================
-- Geomacro Global Coverage Contract: 16 Modules × ISO Country/Areas × 24 Zones
--                           × Strategic Corridors × Expanded Shock Taxonomy
--
-- Design-complete coverage map only.
-- IMPORTANT: this migration does NOT certify a source, enable a feed, promote
-- commercial rights, or open production testing. All queue records remain
-- fail-closed and certification/test gates remain explicitly closed.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Compatibility registrations for source IDs introduced by later legacy/
-- production migrations. Registering them here preserves migration ordering;
-- later migrations may refine these records without changing this contract.
-- ---------------------------------------------------------------------------
insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required, enabled_for_ingestion,
  enabled_for_commercial_signals, country_scope, freshness_class, notes
)
values
(
  'gdelt_v2_events',
  'GDELT 2.0 Event Database',
  'GDELT Project',
  'GEOPOLITICS',
  'MIXED',
  'NONE',
  'https://data.gdeltproject.org/gdeltv2/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Provisional registry row for the governed GDELT v2 events adapter; later production migration owns the exact state.'
),
(
  'ucdp_ged',
  'UCDP Georeferenced Event Dataset',
  'Uppsala Conflict Data Program',
  'GEOPOLITICS',
  'BULK_DOWNLOAD',
  'NONE',
  'https://ucdp.uu.se/downloads/',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'ANNUAL',
  'Versioned UCDP GED structural source. Exact release/version is carried by the observation contract.'
),
(
  'world_bank_wgi_political_stability',
  'World Bank WGI Political Stability',
  'World Bank',
  'GEOPOLITICS',
  'BULK_DOWNLOAD',
  'NONE',
  'https://www.worldbank.org/en/publication/worldwide-governance-indicators',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'ANNUAL',
  'Versioned WGI political-stability source. Exact revision and observation year remain part of provenance.'
),
(
  'world_bank_qpsd',
  'World Bank Quarterly Public Sector Debt',
  'World Bank',
  'MACRO',
  'BULK_DOWNLOAD',
  'NONE',
  'https://www.worldbank.org/en/programs/debt-statistics',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Provisional source row for QPSD; later production migration owns exact source state and coverage proof.'
),
(
  'ofac_sanctions_program',
  'OFAC Sanctions List Service',
  'U.S. Department of the Treasury',
  'GEOPOLITICS',
  'MIXED',
  'NONE',
  'https://ofac.treasury.gov/sanctions-list-service',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official sanctions source candidate. Commercial reuse and exact dataset contract remain certification-gated.'
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


-- ---------------------------------------------------------------------------
-- 1. Additional governed source registrations required by the global matrix.
--    All new sources remain review-gated and disabled until exact contracts,
--    rights, endpoint and freshness checks are separately completed.
-- ---------------------------------------------------------------------------
insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required, enabled_for_ingestion,
  enabled_for_commercial_signals, country_scope, freshness_class, notes
)
values
(
  'wto_trade_monitoring',
  'WTO Trade Monitoring Database',
  'World Trade Organization',
  'MACRO',
  'HTML',
  'NONE',
  'https://data.wto.org/dataset/wto_tmdb',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official WTO trade-policy monitoring source. Candidate structural/cross-border corroboration source; exact dataset terms and machine-delivery contract remain gated.'
),
(
  'bis_payment_systems_data',
  'BIS Payment Systems Statistics',
  'Bank for International Settlements',
  'MACRO',
  'HTML',
  'NONE',
  'https://www.bis.org/statistics/payment_stats.htm',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official BIS payment and settlement-system statistics. Use for structural payment/settlement context only after dataset-specific commercial review.'
),
(
  'cisa_kev_catalog',
  'CISA Known Exploited Vulnerabilities Catalog',
  'Cybersecurity and Infrastructure Security Agency',
  'GEOPOLITICS',
  'API',
  'NONE',
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official CISA KEV feed candidate for systemic cyber-risk corroboration. Exact downstream storage/use boundary remains governed.'
),
(
  'gdacs_global_events_api',
  'GDACS Global Disaster Alerting System',
  'Global Disaster Alerting and Coordination System',
  'GEOPOLITICS',
  'HTML',
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
  'Global disaster alert source candidate. Kept disabled until exact machine endpoint and commercial/reuse contract are verified.'
),
(
  'noaa_ncei_cdo_api',
  'NOAA NCEI Climate Data Online API',
  'National Oceanic and Atmospheric Administration',
  'GEOPOLITICS',
  'API',
  'API_KEY',
  'https://www.ncei.noaa.gov/cdo-web/api/v2/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official NOAA NCEI CDO API. Token required. Candidate for hazard/climate historical observations and corroboration.'
),
(
  'who_gho_odata',
  'WHO Global Health Observatory OData API',
  'World Health Organization',
  'GEOPOLITICS',
  'API',
  'NONE',
  'https://ghoapi.azureedge.net/api/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official WHO GHO OData service. Candidate for public-health and health-system structural observations; dataset/use boundary remains governed.'
),
(
  'pacific_islands_forum_news',
  'Pacific Islands Forum Secretariat News',
  'Pacific Islands Forum Secretariat',
  'GEOPOLITICS',
  'HTML',
  'NONE',
  'https://forumsec.org/news/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'PACIFIC_ISLANDS',
  'NEAR_REAL_TIME',
  'Regional primary news surface for Pacific Islands policy and regional developments. Machine extraction remains certification-gated.'
),
(
  'arctic_council_news',
  'Arctic Council News',
  'Arctic Council',
  'GEOPOLITICS',
  'HTML',
  'NONE',
  'https://arctic-council.org/news/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'ARCTIC_ANTARCTIC',
  'NEAR_REAL_TIME',
  'Regional primary Arctic information surface. Antarctic monitoring remains supplemented by global and scientific sources until a dedicated Antarctic source contract is added.'
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

-- ---------------------------------------------------------------------------
-- 2. Canonical 16-module intelligence coverage contract.
--    These are the current Risk Gate v2 modules and are the country-level
--    domain expansion target for this source program.
-- ---------------------------------------------------------------------------
create table if not exists public.live_global_domain_catalog (
  module_id text primary key,
  display_name text not null unique,
  source_mode text not null check (
    source_mode in ('STRUCTURAL','CURRENT_EVENT','HYBRID')
  ),
  primary_source_id text not null
    references public.live_external_sources(source_id),
  fallback_source_id text not null
    references public.live_external_sources(source_id),
  minimum_independent_paths integer not null default 2
    check (minimum_independent_paths >= 2),
  freshness_max_seconds integer not null
    check (freshness_max_seconds > 0),
  required boolean not null default true,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_global_domain_catalog (
  module_id, display_name, source_mode,
  primary_source_id, fallback_source_id,
  minimum_independent_paths, freshness_max_seconds, notes
)
values
(
  'geopolitical_security',
  'Geopolitical & Security',
  'HYBRID',
  'ucdp_ged',
  'gdelt_v2_events',
  2,
  172800,
  'Conflict, escalation, terrorism/political violence, territorial and diplomatic-security signals.'
),
(
  'geoeconomic_trade',
  'Geo-economic Trade',
  'HYBRID',
  'wto_trade_monitoring',
  'un_comtrade_api',
  2,
  172800,
  'Sanctions, export controls, tariffs, quotas, trade restrictions and bilateral trade exposure.'
),
(
  'political_governance',
  'Political & Governance',
  'HYBRID',
  'world_bank_wgi_political_stability',
  'gdelt_v2_events',
  2,
  259200,
  'Government stability, institutional quality, political transitions and governance deterioration.'
),
(
  'sovereign_fiscal',
  'Sovereign & Fiscal',
  'STRUCTURAL',
  'world_bank_qpsd',
  'world_bank_indicators',
  2,
  51840000,
  'Sovereign debt, fiscal and public-finance observations. Numeric methodology remains governed/versioned.'
),
(
  'macro_monetary',
  'Macro & Monetary',
  'HYBRID',
  'world_bank_indicators',
  'imf_data_api',
  2,
  259200,
  'Growth, inflation, employment, rates and macro-cycle conditions.'
),
(
  'currency_capital_mobility',
  'Currency & Capital Mobility',
  'HYBRID',
  'imf_data_api',
  'world_bank_indicators',
  2,
  259200,
  'FX, reserves, convertibility, capital controls and external-balance risk.'
),
(
  'banking_financial_system',
  'Banking & Financial System',
  'HYBRID',
  'bis_payment_systems_data',
  'bis_rss_media_releases',
  2,
  259200,
  'Banking stress, liquidity, financial contagion and payment-system structural context.'
),
(
  'payments_treasury',
  'Payments & Treasury',
  'HYBRID',
  'bis_payment_systems_data',
  'bis_rss_media_releases',
  2,
  172800,
  'Cross-border payment, settlement, correspondent banking and treasury-repatriation disruption.'
),
(
  'supply_chain_logistics',
  'Supply Chain & Logistics',
  'HYBRID',
  'un_comtrade_api',
  'reliefweb_reports_api',
  2,
  172800,
  'Trade flows, logistics disruption, supplier concentration, customs and shipping effects.'
),
(
  'energy_commodities',
  'Energy & Commodities',
  'HYBRID',
  'eia_api_v2',
  'world_bank_indicators',
  2,
  172800,
  'Oil, gas, electricity, food, metals, critical minerals and strategic commodity dependency.'
),
(
  'regulatory_legal',
  'Regulatory & Legal',
  'HYBRID',
  'wto_trade_monitoring',
  'un_all_documents_rss',
  2,
  259200,
  'Regulatory changes, licensing, investment controls, product bans and legal disruption.'
),
(
  'infrastructure_cyber_technology',
  'Infrastructure, Cyber & Technology',
  'HYBRID',
  'cisa_kev_catalog',
  'gdelt_v2_events',
  2,
  172800,
  'Critical infrastructure, cyber, telecom, internet, cloud, satellite, GNSS, cable and semiconductor shocks.'
),
(
  'climate_environment_hazard',
  'Climate, Environment & Hazard',
  'HYBRID',
  'noaa_ncei_cdo_api',
  'gdacs_global_events_api',
  2,
  86400,
  'Extreme weather, floods, drought, wildfire, earthquake, storms, water and climate physical disruption.'
),
(
  'societal_labor_health',
  'Societal, Labor & Health',
  'HYBRID',
  'who_gho_odata',
  'ilostat_sdmx_api',
  2,
  259200,
  'Migration/displacement, labor disruption, workforce availability and public-health shocks.'
),
(
  'information_influence',
  'Information & Influence',
  'CURRENT_EVENT',
  'gdelt_v2_events',
  'un_all_documents_rss',
  2,
  86400,
  'Disinformation, foreign influence, information-integrity and market-moving false-information signals.'
),
(
  'emerging_long_tail',
  'Emerging Long Tail',
  'HYBRID',
  'gdelt_v2_events',
  'reliefweb_reports_api',
  2,
  172800,
  'Rare, novel and cross-domain risk states that do not fit a single established risk family.'
)
on conflict (module_id)
do update set
  display_name = excluded.display_name,
  source_mode = excluded.source_mode,
  primary_source_id = excluded.primary_source_id,
  fallback_source_id = excluded.fallback_source_id,
  minimum_independent_paths = excluded.minimum_independent_paths,
  freshness_max_seconds = excluded.freshness_max_seconds,
  notes = excluded.notes,
  updated_at = now();

alter table public.live_global_domain_catalog enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Country/area × 16-module coverage matrix.
--    Uses the canonical live_country_registry, so ISO/area additions are
--    automatically reflected and no static hand-maintained country allowlist
--    can silently become stale.
-- ---------------------------------------------------------------------------
create table if not exists public.live_country_module_coverage_targets (
  country_iso3 text not null
    references public.live_country_registry(iso3)
    on delete cascade,
  module_id text not null
    references public.live_global_domain_catalog(module_id)
    on delete cascade,
  primary_source_id text not null
    references public.live_external_sources(source_id),
  fallback_source_id text not null
    references public.live_external_sources(source_id),
  coverage_state text not null default 'QUEUED'
    check (coverage_state in ('QUEUED','SOURCE_MAPPED','FAIL_CLOSED')),
  certification_required boolean not null default true,
  certification_state text not null default 'NOT_CERTIFIED'
    check (certification_state in ('NOT_CERTIFIED','CERTIFIED','REJECTED')),
  last_coverage_check_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_iso3, module_id)
);

insert into public.live_country_module_coverage_targets (
  country_iso3, module_id, primary_source_id, fallback_source_id,
  coverage_state, certification_required, certification_state, notes
)
select
  c.iso3,
  d.module_id,
  d.primary_source_id,
  d.fallback_source_id,
  'QUEUED',
  true,
  'NOT_CERTIFIED',
  'Generated from canonical country/area registry × 16-module contract.'
from public.live_country_registry c
cross join public.live_global_domain_catalog d
where c.enabled = true
on conflict (country_iso3, module_id)
do update set
  primary_source_id = excluded.primary_source_id,
  fallback_source_id = excluded.fallback_source_id,
  coverage_state = case
    when public.live_country_module_coverage_targets.certification_state = 'CERTIFIED'
      then public.live_country_module_coverage_targets.coverage_state
    else 'QUEUED'
  end,
  certification_required = true,
  notes = excluded.notes,
  updated_at = now();

create index if not exists live_country_module_coverage_targets_module_idx
  on public.live_country_module_coverage_targets(module_id);

create index if not exists live_country_module_coverage_targets_state_idx
  on public.live_country_module_coverage_targets(coverage_state, certification_state);

alter table public.live_country_module_coverage_targets enable row level security;

create or replace function public.sync_live_country_module_targets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.enabled then
    insert into public.live_country_module_coverage_targets (
      country_iso3, module_id, primary_source_id, fallback_source_id,
      coverage_state, certification_required, certification_state, notes
    )
    select
      new.iso3,
      d.module_id,
      d.primary_source_id,
      d.fallback_source_id,
      'QUEUED',
      true,
      'NOT_CERTIFIED',
      'Auto-generated for newly enabled canonical country/area.'
    from public.live_global_domain_catalog d
    on conflict (country_iso3, module_id) do update
      set primary_source_id = excluded.primary_source_id,
          fallback_source_id = excluded.fallback_source_id,
          coverage_state = case
            when public.live_country_module_coverage_targets.certification_state = 'CERTIFIED'
              then public.live_country_module_coverage_targets.coverage_state
            else 'QUEUED'
          end,
          updated_at = now();
  else
    update public.live_country_module_coverage_targets
    set coverage_state = 'FAIL_CLOSED',
        certification_state = 'REJECTED',
        updated_at = now()
    where country_iso3 = new.iso3
      and certification_state <> 'CERTIFIED';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_live_country_module_targets
  on public.live_country_registry;

create trigger trg_sync_live_country_module_targets
after insert or update of enabled
on public.live_country_registry
for each row
execute function public.sync_live_country_module_targets();

-- ---------------------------------------------------------------------------
-- 4. Exactly 24 operational regional zones.
--    Zones are coverage/monitoring overlays, not claims that every country
--    belongs to only one analytical geography.
-- ---------------------------------------------------------------------------
create table if not exists public.live_region_zone_catalog (
  zone_id text primary key,
  display_name text not null unique,
  zone_order integer not null unique check (zone_order between 1 and 24),
  regional_primary_source_id text not null
    references public.live_external_sources(source_id),
  regional_fallback_source_id text not null
    references public.live_external_sources(source_id),
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_region_zone_catalog (
  zone_id, display_name, zone_order,
  regional_primary_source_id, regional_fallback_source_id, notes
)
values
('NORTH_AMERICA','North America',1,'oecd_sdmx_api','gdelt_v2_events','North American macro, trade and geopolitical monitoring overlay.'),
('CENTRAL_AMERICA','Central America',2,'oas_permanent_council_rss','gdelt_v2_events','Central American regional-policy and cross-border monitoring overlay.'),
('CARIBBEAN','Caribbean',3,'oas_permanent_council_rss','gdelt_v2_events','Caribbean governance, trade, disaster and external-risk overlay.'),
('SOUTH_AMERICA','South America',4,'oas_permanent_council_rss','gdelt_v2_events','South American regional-policy, trade and commodity overlay.'),
('NORTHERN_EUROPE','Northern Europe',5,'eurostat_sdmx_api','nato_rss_catalog','Northern European macro/security and trade overlay.'),
('WESTERN_EUROPE','Western Europe',6,'eurostat_sdmx_api','nato_rss_catalog','Western European institutional and macro overlay.'),
('SOUTHERN_EUROPE','Southern Europe',7,'eurostat_sdmx_api','nato_rss_catalog','Southern European macro, trade and security overlay.'),
('EASTERN_EUROPE','Eastern Europe',8,'nato_rss_catalog','un_security_council_docs_rss','Eastern European geopolitical/security overlay.'),
('BALKANS','Balkans',9,'nato_rss_catalog','un_security_council_docs_rss','Balkans political-security and corridor overlay.'),
('RUSSIA_BELARUS','Russia & Belarus',10,'un_security_council_docs_rss','gdelt_v2_events','Russia/Belarus geopolitical, sanctions and corridor overlay.'),
('CAUCASUS','Caucasus',11,'un_security_council_docs_rss','gdelt_v2_events','Caucasus security, transport and energy-transit overlay.'),
('CENTRAL_ASIA','Central Asia',12,'un_security_council_docs_rss','gdelt_v2_events','Central Asian political, trade, minerals and corridor overlay.'),
('MIDDLE_EAST','Middle East',13,'who_emro_rss','un_security_council_docs_rss','Middle East conflict, humanitarian, energy and payments-risk overlay.'),
('NORTH_AFRICA','North Africa',14,'african_union_news_rss','gdelt_v2_events','North African political, trade, energy and migration overlay.'),
('WEST_AFRICA','West Africa',15,'african_union_news_rss','gdelt_v2_events','West African governance, commodity and corridor overlay.'),
('CENTRAL_AFRICA','Central Africa',16,'african_union_news_rss','gdelt_v2_events','Central African conflict, humanitarian and resource overlay.'),
('EAST_AFRICA_HORN','East Africa & Horn',17,'african_union_news_rss','gdelt_v2_events','East African/Horn conflict, shipping, humanitarian and corridor overlay.'),
('SOUTHERN_AFRICA','Southern Africa',18,'african_union_news_rss','gdelt_v2_events','Southern African commodity, energy and corridor overlay.'),
('SOUTH_ASIA','South Asia',19,'un_security_council_docs_rss','gdelt_v2_events','South Asian geopolitics, macro, food, energy and corridor overlay.'),
('SOUTHEAST_ASIA','Southeast Asia',20,'asean_news_portal','gdelt_v2_events','ASEAN political-security, trade, supply-chain and maritime overlay.'),
('EAST_ASIA','East Asia',21,'un_security_council_docs_rss','gdelt_v2_events','East Asian trade, technology, security and supply-chain overlay.'),
('AUSTRALIA_NEW_ZEALAND','Australia & New Zealand',22,'oecd_sdmx_api','gdelt_v2_events','Australasia macro, commodities, maritime and strategic-resource overlay.'),
('PACIFIC_ISLANDS','Pacific Islands',23,'pacific_islands_forum_news','gdelt_v2_events','Pacific governance, climate, maritime and humanitarian overlay.'),
('ARCTIC_ANTARCTIC','Arctic & Antarctic',24,'arctic_council_news','un_security_council_docs_rss','Polar governance, shipping, climate and strategic-resource monitoring overlay.')
on conflict (zone_id)
do update set
  display_name = excluded.display_name,
  zone_order = excluded.zone_order,
  regional_primary_source_id = excluded.regional_primary_source_id,
  regional_fallback_source_id = excluded.regional_fallback_source_id,
  notes = excluded.notes,
  updated_at = now();

alter table public.live_region_zone_catalog enable row level security;

create table if not exists public.live_region_zone_module_coverage_targets (
  zone_id text not null
    references public.live_region_zone_catalog(zone_id)
    on delete cascade,
  module_id text not null
    references public.live_global_domain_catalog(module_id)
    on delete cascade,
  primary_source_id text not null
    references public.live_external_sources(source_id),
  fallback_source_id text not null
    references public.live_external_sources(source_id),
  regional_primary_source_id text not null
    references public.live_external_sources(source_id),
  regional_fallback_source_id text not null
    references public.live_external_sources(source_id),
  coverage_state text not null default 'QUEUED'
    check (coverage_state in ('QUEUED','SOURCE_MAPPED','FAIL_CLOSED')),
  certification_required boolean not null default true,
  certification_state text not null default 'NOT_CERTIFIED'
    check (certification_state in ('NOT_CERTIFIED','CERTIFIED','REJECTED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (zone_id, module_id)
);

insert into public.live_region_zone_module_coverage_targets (
  zone_id, module_id, primary_source_id, fallback_source_id,
  regional_primary_source_id, regional_fallback_source_id,
  coverage_state, certification_required, certification_state, notes
)
select
  z.zone_id,
  d.module_id,
  d.primary_source_id,
  d.fallback_source_id,
  z.regional_primary_source_id,
  z.regional_fallback_source_id,
  'QUEUED',
  true,
  'NOT_CERTIFIED',
  'Generated from 24-zone × 16-module contract.'
from public.live_region_zone_catalog z
cross join public.live_global_domain_catalog d
on conflict (zone_id, module_id)
do update set
  primary_source_id = excluded.primary_source_id,
  fallback_source_id = excluded.fallback_source_id,
  regional_primary_source_id = excluded.regional_primary_source_id,
  regional_fallback_source_id = excluded.regional_fallback_source_id,
  coverage_state = case
    when public.live_region_zone_module_coverage_targets.certification_state = 'CERTIFIED'
      then public.live_region_zone_module_coverage_targets.coverage_state
    else 'QUEUED'
  end,
  updated_at = now();

create index if not exists live_region_zone_module_coverage_state_idx
  on public.live_region_zone_module_coverage_targets(coverage_state, certification_state);

alter table public.live_region_zone_module_coverage_targets enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Strategic corridor catalogue.
--    These are monitoring entities. This is deliberately not a claim that a
--    route-risk score is already independently validated. Route-specific data
--    remains certification-gated.
-- ---------------------------------------------------------------------------
create table if not exists public.live_strategic_corridor_catalog (
  corridor_id text primary key,
  display_name text not null unique,
  corridor_type text not null check (
    corridor_type in ('MARITIME','TRADE_LAND','ENERGY','TELECOM','INTERMODAL')
  ),
  route_primary_source_id text not null
    references public.live_external_sources(source_id),
  route_fallback_source_id text not null
    references public.live_external_sources(source_id),
  chokepoints text[] not null default '{}',
  monitoring_scope text not null,
  route_data_state text not null default 'NOT_YET_CERTIFIED'
    check (route_data_state in ('NOT_YET_CERTIFIED','PARTIAL','CERTIFIED','FAIL_CLOSED')),
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_strategic_corridor_catalog (
  corridor_id, display_name, corridor_type,
  route_primary_source_id, route_fallback_source_id,
  chokepoints, monitoring_scope, route_data_state, notes
)
values
('SUEZ_RED_SEA','Suez Canal – Red Sea Corridor','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Suez Canal','Red Sea'],'Asia–Europe / Europe–Middle East maritime exposure','NOT_YET_CERTIFIED','Monitor canal, Red Sea security, rerouting, trade and insurance disruption.'),
('BAB_EL_MANDEB','Bab el-Mandeb Strait','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Bab el-Mandeb','Red Sea'],'Indian Ocean–Red Sea maritime exposure','NOT_YET_CERTIFIED','High-sensitivity maritime chokepoint monitoring overlay.'),
('STRAIT_OF_HORMUZ','Strait of Hormuz','MARITIME','eia_api_v2','gdelt_v2_events',ARRAY['Strait of Hormuz'],'Gulf energy and maritime exposure','NOT_YET_CERTIFIED','Energy-transit and shipping disruption monitoring overlay.'),
('MALACCA_STRAIT','Strait of Malacca','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Strait of Malacca'],'Indian Ocean–East Asia maritime exposure','NOT_YET_CERTIFIED','Global container, energy and trade-route exposure overlay.'),
('PANAMA_CANAL','Panama Canal','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Panama Canal'],'Atlantic–Pacific maritime exposure','NOT_YET_CERTIFIED','Canal capacity, weather, rerouting and trade disruption monitoring.'),
('BOSPHORUS_DARDANELLES','Turkish Straits','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Bosphorus','Dardanelles'],'Black Sea–Mediterranean maritime exposure','NOT_YET_CERTIFIED','Black Sea trade and energy-route monitoring overlay.'),
('GIBRALTAR_STRAIT','Strait of Gibraltar','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Strait of Gibraltar'],'Atlantic–Mediterranean maritime exposure','NOT_YET_CERTIFIED','Mediterranean shipping and trade-route monitoring.'),
('CAPE_OF_GOOD_HOPE','Cape of Good Hope Route','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Cape of Good Hope'],'Southern Africa maritime rerouting exposure','NOT_YET_CERTIFIED','Rerouting and shipping disruption overlay.'),
('NORTH_SEA_ENGLISH_CHANNEL','English Channel – North Sea','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['English Channel','North Sea'],'Northwestern Europe maritime exposure','NOT_YET_CERTIFIED','Ports, shipping, energy and trade-route disruption overlay.'),
('LOMBOK_SUNDA_STRAITS','Lombok – Sunda Straits','MARITIME','un_comtrade_api','gdelt_v2_events',ARRAY['Lombok Strait','Sunda Strait'],'Indonesia maritime alternative-route exposure','NOT_YET_CERTIFIED','Archipelagic shipping and diversion monitoring overlay.'),
('TRANS_CASPIAN_MIDDLE','Trans-Caspian Middle Corridor','TRADE_LAND','un_comtrade_api','gdelt_v2_events',ARRAY['Caspian Sea crossings'],'Central Asia–Caucasus–Europe trade exposure','NOT_YET_CERTIFIED','Intermodal Eurasian trade-route monitoring.'),
('CHINA_EUROPE_RAIL','China–Europe Rail Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Eurasian border crossings'],'East Asia–Europe land/intermodal exposure','NOT_YET_CERTIFIED','Rail, border, sanctions and supply-chain disruption monitoring.'),
('NORTH_SOUTH_TRANSPORT','North–South Transport Corridor','TRADE_LAND','un_comtrade_api','gdelt_v2_events',ARRAY['Caspian crossings','Russia–Central Asia connections'],'Eurasian North–South trade exposure','NOT_YET_CERTIFIED','Land, rail, port and trade-route monitoring.'),
('INSTC','International North–South Transport Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Caspian crossings','Persian Gulf connections'],'India–Iran–Central Asia–Russia trade exposure','NOT_YET_CERTIFIED','Intermodal trade and sanctions/corridor monitoring.'),
('IMEC','India–Middle East–Europe Economic Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Gulf maritime links','Mediterranean links'],'India–Middle East–Europe logistics exposure','NOT_YET_CERTIFIED','Trade, ports, logistics and geopolitical disruption overlay.'),
('CHINA_CENTRAL_ASIA_WEST_ASIA','China–Central Asia–West Asia Trade Corridor','TRADE_LAND','un_comtrade_api','gdelt_v2_events',ARRAY['Central Asian border crossings'],'China–Central/West Asia exposure','NOT_YET_CERTIFIED','Land-route, customs and strategic-resource monitoring.'),
('LOBITO_CORRIDOR','Lobito Corridor','TRADE_LAND','un_comtrade_api','gdelt_v2_events',ARRAY['Atlantic port interfaces'],'Central/Southern Africa–Atlantic resource logistics exposure','NOT_YET_CERTIFIED','Critical-mineral export and logistics corridor monitoring.'),
('LAPSSET','LAPSSET Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['East African port interfaces'],'East Africa transport and port exposure','NOT_YET_CERTIFIED','Port, road, rail, energy and logistics monitoring.'),
('NORTHERN_CORRIDOR_EAC','Northern Corridor (East Africa)','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['East African border crossings'],'East Africa trade corridor exposure','NOT_YET_CERTIFIED','Regional logistics and border-disruption monitoring.'),
('CENTRAL_CORRIDOR_EAC','Central Corridor (East Africa)','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Lake/road/rail interfaces'],'East Africa trade corridor exposure','NOT_YET_CERTIFIED','Regional logistics, ports and border monitoring.'),
('MAPUTO_CORRIDOR','Maputo Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Mozambique–South Africa border interfaces'],'Southern Africa trade/logistics exposure','NOT_YET_CERTIFIED','Port and land-corridor monitoring.'),
('NACALA_CORRIDOR','Nacala Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Nacala port interfaces'],'Mozambique–Malawi–Zambia logistics exposure','NOT_YET_CERTIFIED','Resource export and logistics monitoring.'),
('WALVIS_BAY_CORRIDOR','Walvis Bay Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Walvis Bay port interfaces'],'Southern Africa–Atlantic logistics exposure','NOT_YET_CERTIFIED','Port, road and regional trade monitoring.'),
('ABIDJAN_LAGOS','Abidjan–Lagos Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['Gulf of Guinea coastal links'],'West Africa coastal trade/logistics exposure','NOT_YET_CERTIFIED','Cross-border trade and coastal logistics monitoring.'),
('DAKAR_LAGOS','Dakar–Lagos Corridor','INTERMODAL','un_comtrade_api','gdelt_v2_events',ARRAY['West African border crossings'],'West Africa coastal trade/logistics exposure','NOT_YET_CERTIFIED','Cross-border and regional logistics monitoring.'),
('DRUZHBA','Druzhba Oil Pipeline System','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Central/Eastern European pipeline interfaces'],'Eurasian oil-transit exposure','NOT_YET_CERTIFIED','Pipeline, sanctions, supply and rerouting monitoring.'),
('BAKU_TBILISI_CEYHAN','Baku–Tbilisi–Ceyhan Pipeline','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Caucasus transit interfaces'],'Caspian–Mediterranean energy exposure','NOT_YET_CERTIFIED','Caspian oil transit and geopolitical disruption monitoring.'),
('SOUTHERN_GAS_CORRIDOR','Southern Gas Corridor','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Caucasus–Anatolia–Southeast Europe links'],'Caspian gas-to-Europe exposure','NOT_YET_CERTIFIED','Gas-flow, infrastructure and transit monitoring.'),
('TANAP_TAP','TANAP – TAP Gas Route','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Anatolian transit','Adriatic transmission links'],'Turkey–Southeast Europe gas exposure','NOT_YET_CERTIFIED','Pipeline-transit and energy-market monitoring.'),
('EAST_SIBERIA_PACIFIC','East Siberia–Pacific Ocean Pipeline','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Russian Far East export interfaces'],'Russia–East Asia oil exposure','NOT_YET_CERTIFIED','Energy export and geopolitical-disruption monitoring.'),
('KIRKUK_CEYHAN','Kirkuk–Ceyhan Oil Route','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Iraq–Türkiye transit interfaces'],'Iraq–Türkiye energy exposure','NOT_YET_CERTIFIED','Pipeline export, security and border monitoring.'),
('CPC_CASPIAN_PIPELINE','Caspian Pipeline Consortium Route','ENERGY','eia_api_v2','gdelt_v2_events',ARRAY['Black Sea terminal interfaces'],'Caspian–Black Sea oil export exposure','NOT_YET_CERTIFIED','Terminal, pipeline and export-disruption monitoring.'),
('GLOBAL_TRANSATLANTIC_SUBSEA','Transatlantic Subsea Connectivity','TELECOM','cisa_kev_catalog','gdelt_v2_events',ARRAY['North Atlantic subsea links'],'North America–Europe digital infrastructure exposure','NOT_YET_CERTIFIED','Cyber, cable, cloud and digital-connectivity disruption monitoring.'),
('RED_SEA_SUBSEA','Red Sea Subsea Connectivity','TELECOM','cisa_kev_catalog','gdelt_v2_events',ARRAY['Red Sea subsea links'],'Middle East–Europe–Asia digital infrastructure exposure','NOT_YET_CERTIFIED','Cable disruption and maritime-security monitoring.'),
('ASIA_EUROPE_SUBSEA','Asia–Europe Subsea Connectivity','TELECOM','cisa_kev_catalog','gdelt_v2_events',ARRAY['Indian Ocean subsea links'],'Asia–Europe digital infrastructure exposure','NOT_YET_CERTIFIED','Cable, cyber, telecom and geopolitical disruption monitoring.')
on conflict (corridor_id)
do update set
  display_name = excluded.display_name,
  corridor_type = excluded.corridor_type,
  route_primary_source_id = excluded.route_primary_source_id,
  route_fallback_source_id = excluded.route_fallback_source_id,
  chokepoints = excluded.chokepoints,
  monitoring_scope = excluded.monitoring_scope,
  route_data_state = case
    when public.live_strategic_corridor_catalog.route_data_state = 'CERTIFIED'
      then public.live_strategic_corridor_catalog.route_data_state
    else 'NOT_YET_CERTIFIED'
  end,
  notes = excluded.notes,
  updated_at = now();

alter table public.live_strategic_corridor_catalog enable row level security;

create table if not exists public.live_corridor_module_coverage_targets (
  corridor_id text not null
    references public.live_strategic_corridor_catalog(corridor_id)
    on delete cascade,
  module_id text not null
    references public.live_global_domain_catalog(module_id)
    on delete cascade,
  primary_source_id text not null
    references public.live_external_sources(source_id),
  fallback_source_id text not null
    references public.live_external_sources(source_id),
  route_primary_source_id text not null
    references public.live_external_sources(source_id),
  route_fallback_source_id text not null
    references public.live_external_sources(source_id),
  coverage_state text not null default 'QUEUED'
    check (coverage_state in ('QUEUED','SOURCE_MAPPED','FAIL_CLOSED')),
  certification_required boolean not null default true,
  certification_state text not null default 'NOT_CERTIFIED'
    check (certification_state in ('NOT_CERTIFIED','CERTIFIED','REJECTED')),
  route_data_state text not null default 'NOT_YET_CERTIFIED'
    check (route_data_state in ('NOT_YET_CERTIFIED','PARTIAL','CERTIFIED','FAIL_CLOSED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (corridor_id, module_id)
);

insert into public.live_corridor_module_coverage_targets (
  corridor_id, module_id, primary_source_id, fallback_source_id,
  route_primary_source_id, route_fallback_source_id,
  coverage_state, certification_required, certification_state, route_data_state, notes
)
select
  c.corridor_id,
  d.module_id,
  d.primary_source_id,
  d.fallback_source_id,
  c.route_primary_source_id,
  c.route_fallback_source_id,
  'QUEUED',
  true,
  'NOT_CERTIFIED',
  'NOT_YET_CERTIFIED',
  'Generated from strategic corridor × 16-module contract.'
from public.live_strategic_corridor_catalog c
cross join public.live_global_domain_catalog d
on conflict (corridor_id, module_id)
do update set
  primary_source_id = excluded.primary_source_id,
  fallback_source_id = excluded.fallback_source_id,
  route_primary_source_id = excluded.route_primary_source_id,
  route_fallback_source_id = excluded.route_fallback_source_id,
  coverage_state = case
    when public.live_corridor_module_coverage_targets.certification_state = 'CERTIFIED'
      then public.live_corridor_module_coverage_targets.coverage_state
    else 'QUEUED'
  end,
  certification_required = true,
  route_data_state = case
    when public.live_corridor_module_coverage_targets.route_data_state = 'CERTIFIED'
      then public.live_corridor_module_coverage_targets.route_data_state
    else 'NOT_YET_CERTIFIED'
  end,
  updated_at = now();

create index if not exists live_corridor_module_coverage_state_idx
  on public.live_corridor_module_coverage_targets(coverage_state, certification_state, route_data_state);

alter table public.live_corridor_module_coverage_targets enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Expanded global shock taxonomy.
--    35 families. Every family is mapped to at least one 16-module owner and
--    has primary/fallback detection paths. This is detection taxonomy only.
-- ---------------------------------------------------------------------------
create table if not exists public.live_global_shock_taxonomy (
  shock_id text primary key,
  display_name text not null unique,
  detection_mode text not null check (
    detection_mode in ('CURRENT_EVENT','STRUCTURAL','HYBRID')
  ),
  primary_source_id text not null
    references public.live_external_sources(source_id),
  fallback_source_id text not null
    references public.live_external_sources(source_id),
  freshness_max_seconds integer not null check (freshness_max_seconds > 0),
  required boolean not null default true,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_global_shock_taxonomy (
  shock_id, display_name, detection_mode,
  primary_source_id, fallback_source_id,
  freshness_max_seconds, notes
)
values
('armed_conflict_escalation','Armed conflict and military escalation','CURRENT_EVENT','gdelt_v2_events','ucdp_ged',172800,'War, strikes, mobilization and escalation evidence.'),
('ceasefire_deescalation','Ceasefire and de-escalation change','CURRENT_EVENT','gdelt_v2_events','un_security_council_docs_rss',172800,'Time-bounded de-escalation/ceasefire evidence.'),
('sanctions_embargoes_export_controls','Sanctions, embargoes and export controls','HYBRID','ofac_sanctions_program','un_security_council_docs_rss',86400,'Country/entity restrictions plus current policy changes.'),
('tariffs_trade_restrictions','Tariffs and trade restrictions','HYBRID','wto_trade_monitoring','un_comtrade_api',172800,'Tariff, quota, embargo and trade-restriction changes.'),
('election_government_transition','Elections and government transition','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss',259200,'Election, referendum, resignation and transition signals.'),
('coup_civil_unrest','Coups and civil unrest','CURRENT_EVENT','gdelt_v2_events','reliefweb_reports_api',172800,'Coup, protest, riot and emergency-state signals.'),
('monetary_policy_rate_shock','Monetary-policy and rate shock','HYBRID','world_bank_indicators','imf_data_api',172800,'Central-bank and policy-rate changes.'),
('inflation_growth_employment_shock','Inflation, growth and employment shock','HYBRID','world_bank_indicators','gdelt_v2_events',259200,'Growth, recession, inflation and labour-market event evidence.'),
('fx_reserve_external_balance_stress','FX, reserves and external-balance stress','HYBRID','imf_data_api','world_bank_indicators',259200,'Currency, reserve, balance-of-payments and external-funding stress.'),
('sovereign_debt_fiscal_shock','Sovereign debt and fiscal shock','HYBRID','world_bank_qpsd','world_bank_indicators',259200,'Debt default/restructuring and fiscal deterioration.'),
('banking_liquidity_contagion','Banking, liquidity and contagion stress','HYBRID','bis_payment_systems_data','bis_rss_media_releases',172800,'Bank failures, runs, liquidity and contagion evidence.'),
('payments_settlement_disruption','Payments and settlement disruption','HYBRID','bis_payment_systems_data','bis_rss_media_releases',172800,'Cross-border payments, settlement and correspondent constraints.'),
('energy_oil_gas_disruption','Oil, gas and energy disruption','HYBRID','eia_api_v2','gdelt_v2_events',172800,'Production, transit, outage and energy-market shocks.'),
('electricity_grid_disruption','Electricity and grid disruption','CURRENT_EVENT','gdelt_v2_events','reliefweb_reports_api',86400,'Grid outages, attacks and supply disturbances.'),
('food_agriculture_fertilizer_shock','Food, agriculture and fertilizer shock','HYBRID','faostat_api','gdelt_v2_events',259200,'Food, crop, fertilizer and agricultural-supply shocks.'),
('critical_minerals_rare_earth_disruption','Critical-mineral and rare-earth disruption','HYBRID','usgs_mcs','un_comtrade_api',259200,'Mineral production, trade and restriction shocks.'),
('shipping_chokepoint_disruption','Shipping and chokepoint disruption','CURRENT_EVENT','gdelt_v2_events','un_comtrade_api',86400,'Port, canal, strait, vessel and routing disruption evidence.'),
('supply_chain_logistics_disruption','Supply-chain and logistics disruption','HYBRID','un_comtrade_api','gdelt_v2_events',172800,'Freight, congestion, sourcing and logistics shocks.'),
('border_customs_transit_disruption','Border, customs and transit disruption','HYBRID','wto_trade_monitoring','un_comtrade_api',172800,'Border closures, customs restrictions and transit changes.'),
('natural_hazard_physical_disruption','Major natural hazard and physical disruption','HYBRID','noaa_ncei_cdo_api','gdacs_global_events_api',86400,'Earthquake, flood, wildfire, cyclone and physical-disruption signals.'),
('climate_water_heat_stress','Climate, water and heat stress','HYBRID','noaa_ncei_cdo_api','gdacs_global_events_api',259200,'Drought, heat, water stress and climate-physical risk.'),
('public_health_emergency','Public-health emergency','HYBRID','who_gho_odata','reliefweb_reports_api',172800,'Outbreak, health-system and emergency-health signals.'),
('migration_displacement_shock','Migration and displacement shock','HYBRID','unhcr_global_public_api','reliefweb_reports_api',172800,'Displacement and humanitarian movement signals.'),
('labor_strike_workforce_disruption','Labor strikes and workforce disruption','HYBRID','ilostat_sdmx_api','gdelt_v2_events',172800,'Strike, workforce availability and labor-market disruption.'),
('cyber_systemic_attack','Systemic cyber attack','HYBRID','cisa_kev_catalog','gdelt_v2_events',86400,'Exploitation and cyber events with systemic impact potential.'),
('telecom_internet_shutdown','Telecom outage and internet shutdown','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss',86400,'Telecom, internet and communications disruption.'),
('submarine_cable_gnss_navigation_disruption','Subsea cable, GNSS and navigation disruption','CURRENT_EVENT','gdelt_v2_events','cisa_kev_catalog',86400,'Cable, satellite and navigation-system disruption.'),
('regulatory_legal_policy_shock','Regulatory and legal policy shock','HYBRID','wto_trade_monitoring','un_all_documents_rss',259200,'Material regulatory, licensing, tax and product-policy changes.'),
('information_influence_disinformation_shock','Information influence and disinformation shock','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss',86400,'Foreign influence, misinformation and information-integrity events.'),
('insurance_market_withdrawal_war_risk','Insurance withdrawal and war-risk repricing','CURRENT_EVENT','gdelt_v2_events','reliefweb_reports_api',172800,'Insurance capacity withdrawal and war-risk pricing events.'),
('expropriation_nationalization_shock','Expropriation and nationalization shock','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss',172800,'Nationalization, expropriation and property-control events.'),
('investment_screening_restriction','Investment screening and capital-entry restriction','HYBRID','wto_trade_monitoring','un_all_documents_rss',259200,'Foreign-investment screening and market-access restrictions.'),
('technology_semiconductor_export_control_shock','Technology and semiconductor export-control shock','HYBRID','wto_trade_monitoring','gdelt_v2_events',172800,'Technology restrictions, semiconductor controls and industrial-access shocks.'),
('capital_controls_convertibility_shock','Capital-control and convertibility shock','HYBRID','imf_data_api','world_bank_indicators',172800,'Capital controls, FX restrictions and convertibility disruption.'),
('rare_material_long_tail_supply_shock','Rare-material long-tail supply shock','HYBRID','usgs_mcs','un_comtrade_api',259200,'Emerging strategic-material shortages and dependency shocks.')
on conflict (shock_id)
do update set
  display_name = excluded.display_name,
  detection_mode = excluded.detection_mode,
  primary_source_id = excluded.primary_source_id,
  fallback_source_id = excluded.fallback_source_id,
  freshness_max_seconds = excluded.freshness_max_seconds,
  notes = excluded.notes,
  updated_at = now();

alter table public.live_global_shock_taxonomy enable row level security;

create table if not exists public.live_global_shock_module_map (
  shock_id text not null
    references public.live_global_shock_taxonomy(shock_id)
    on delete cascade,
  module_id text not null
    references public.live_global_domain_catalog(module_id)
    on delete cascade,
  required boolean not null default true,
  primary key (shock_id, module_id)
);

insert into public.live_global_shock_module_map (shock_id, module_id)
values
('armed_conflict_escalation','geopolitical_security'),
('ceasefire_deescalation','geopolitical_security'),
('sanctions_embargoes_export_controls','geoeconomic_trade'),
('tariffs_trade_restrictions','geoeconomic_trade'),
('election_government_transition','political_governance'),
('coup_civil_unrest','political_governance'),
('monetary_policy_rate_shock','macro_monetary'),
('inflation_growth_employment_shock','macro_monetary'),
('fx_reserve_external_balance_stress','currency_capital_mobility'),
('sovereign_debt_fiscal_shock','sovereign_fiscal'),
('banking_liquidity_contagion','banking_financial_system'),
('payments_settlement_disruption','payments_treasury'),
('energy_oil_gas_disruption','energy_commodities'),
('electricity_grid_disruption','energy_commodities'),
('electricity_grid_disruption','infrastructure_cyber_technology'),
('food_agriculture_fertilizer_shock','energy_commodities'),
('critical_minerals_rare_earth_disruption','energy_commodities'),
('shipping_chokepoint_disruption','supply_chain_logistics'),
('supply_chain_logistics_disruption','supply_chain_logistics'),
('border_customs_transit_disruption','geoeconomic_trade'),
('border_customs_transit_disruption','supply_chain_logistics'),
('natural_hazard_physical_disruption','climate_environment_hazard'),
('climate_water_heat_stress','climate_environment_hazard'),
('public_health_emergency','societal_labor_health'),
('migration_displacement_shock','societal_labor_health'),
('labor_strike_workforce_disruption','societal_labor_health'),
('cyber_systemic_attack','infrastructure_cyber_technology'),
('telecom_internet_shutdown','infrastructure_cyber_technology'),
('submarine_cable_gnss_navigation_disruption','infrastructure_cyber_technology'),
('regulatory_legal_policy_shock','regulatory_legal'),
('information_influence_disinformation_shock','information_influence'),
('insurance_market_withdrawal_war_risk','emerging_long_tail'),
('expropriation_nationalization_shock','political_governance'),
('expropriation_nationalization_shock','geopolitical_security'),
('investment_screening_restriction','geoeconomic_trade'),
('investment_screening_restriction','regulatory_legal'),
('technology_semiconductor_export_control_shock','geoeconomic_trade'),
('technology_semiconductor_export_control_shock','infrastructure_cyber_technology'),
('capital_controls_convertibility_shock','currency_capital_mobility'),
('rare_material_long_tail_supply_shock','energy_commodities')
on conflict (shock_id, module_id) do update set required = excluded.required;

alter table public.live_global_shock_module_map enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Single fail-closed source-certification queue for every coverage node.
--    This queue is deliberately populated in PENDING state and is never a
--    substitute for actual endpoint/rights/schema/freshness certification.
-- ---------------------------------------------------------------------------
create table if not exists public.live_source_certification_queue (
  queue_key text primary key,
  scope_type text not null check (
    scope_type in ('COUNTRY','REGION','CORRIDOR','SHOCK')
  ),
  scope_code text not null,
  module_id text
    references public.live_global_domain_catalog(module_id),
  source_role text not null check (
    source_role in (
      'PRIMARY_MODULE',
      'FALLBACK_MODULE',
      'REGIONAL_PRIMARY',
      'REGIONAL_FALLBACK',
      'ROUTE_PRIMARY',
      'ROUTE_FALLBACK',
      'SHOCK_PRIMARY',
      'SHOCK_FALLBACK'
    )
  ),
  source_id text not null
    references public.live_external_sources(source_id),
  certification_state text not null default 'QUEUED'
    check (certification_state in ('QUEUED','CERTIFIED','REJECTED')),
  fail_closed boolean not null default true,
  endpoint_check text not null default 'PENDING',
  rights_check text not null default 'PENDING',
  schema_check text not null default 'PENDING',
  freshness_check text not null default 'PENDING',
  independence_check text not null default 'PENDING',
  last_attempt_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'COUNTRY:' || t.country_iso3 || ':' || t.module_id || ':PRIMARY:' || t.primary_source_id,
  'COUNTRY', t.country_iso3, t.module_id, 'PRIMARY_MODULE', t.primary_source_id,
  'Country × module primary source. Certification intentionally queued.'
from public.live_country_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'COUNTRY:' || t.country_iso3 || ':' || t.module_id || ':FALLBACK:' || t.fallback_source_id,
  'COUNTRY', t.country_iso3, t.module_id, 'FALLBACK_MODULE', t.fallback_source_id,
  'Country × module fallback source. Certification intentionally queued.'
from public.live_country_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'REGION:' || t.zone_id || ':' || t.module_id || ':REGIONAL_PRIMARY:' || t.regional_primary_source_id,
  'REGION', t.zone_id, t.module_id, 'REGIONAL_PRIMARY', t.regional_primary_source_id,
  'Region × module regional-primary source. Certification intentionally queued.'
from public.live_region_zone_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'REGION:' || t.zone_id || ':' || t.module_id || ':REGIONAL_FALLBACK:' || t.regional_fallback_source_id,
  'REGION', t.zone_id, t.module_id, 'REGIONAL_FALLBACK', t.regional_fallback_source_id,
  'Region × module regional-fallback source. Certification intentionally queued.'
from public.live_region_zone_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'CORRIDOR:' || t.corridor_id || ':' || t.module_id || ':PRIMARY:' || t.primary_source_id,
  'CORRIDOR', t.corridor_id, t.module_id, 'PRIMARY_MODULE', t.primary_source_id,
  'Corridor × module primary source. Certification intentionally queued.'
from public.live_corridor_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'CORRIDOR:' || t.corridor_id || ':' || t.module_id || ':FALLBACK:' || t.fallback_source_id,
  'CORRIDOR', t.corridor_id, t.module_id, 'FALLBACK_MODULE', t.fallback_source_id,
  'Corridor × module fallback source. Certification intentionally queued.'
from public.live_corridor_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'CORRIDOR:' || t.corridor_id || ':' || t.module_id || ':ROUTE_PRIMARY:' || t.route_primary_source_id,
  'CORRIDOR', t.corridor_id, t.module_id, 'ROUTE_PRIMARY', t.route_primary_source_id,
  'Corridor route-primary source. Route-specific certification intentionally queued.'
from public.live_corridor_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'CORRIDOR:' || t.corridor_id || ':' || t.module_id || ':ROUTE_FALLBACK:' || t.route_fallback_source_id,
  'CORRIDOR', t.corridor_id, t.module_id, 'ROUTE_FALLBACK', t.route_fallback_source_id,
  'Corridor route-fallback source. Route-specific certification intentionally queued.'
from public.live_corridor_module_coverage_targets t
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'SHOCK:' || s.shock_id || ':PRIMARY:' || s.primary_source_id,
  'SHOCK', s.shock_id, m.module_id, 'SHOCK_PRIMARY', s.primary_source_id,
  'Shock family primary detection source. Certification intentionally queued.'
from public.live_global_shock_taxonomy s
join lateral (
  select module_id
  from public.live_global_shock_module_map
  where shock_id = s.shock_id
  order by module_id
  limit 1
) m on true
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

insert into public.live_source_certification_queue (
  queue_key, scope_type, scope_code, module_id, source_role, source_id, notes
)
select
  'SHOCK:' || s.shock_id || ':FALLBACK:' || s.fallback_source_id,
  'SHOCK', s.shock_id, m.module_id, 'SHOCK_FALLBACK', s.fallback_source_id,
  'Shock family fallback detection source. Certification intentionally queued.'
from public.live_global_shock_taxonomy s
join lateral (
  select module_id
  from public.live_global_shock_module_map
  where shock_id = s.shock_id
  order by module_id
  limit 1
) m on true
on conflict (queue_key) do update set updated_at = now()
where public.live_source_certification_queue.certification_state = 'QUEUED';

create index if not exists live_source_certification_queue_scope_idx
  on public.live_source_certification_queue(scope_type, scope_code);

create index if not exists live_source_certification_queue_state_idx
  on public.live_source_certification_queue(certification_state, fail_closed);

alter table public.live_source_certification_queue enable row level security;

-- ---------------------------------------------------------------------------
-- 8. Design-completeness status view.
--    "design_complete" means all required matrix rows/entities exist and every
--    path is represented in the queue. It does NOT mean sources are certified.
-- ---------------------------------------------------------------------------
create or replace view public.live_global_coverage_design_status
with (security_invoker = true)
as
with
country_counts as (
  select
    count(*)::bigint as country_count
  from public.live_country_registry
  where enabled = true
),
country_targets as (
  select count(*)::bigint as actual
  from public.live_country_module_coverage_targets
),
region_counts as (
  select count(*)::bigint as region_count
  from public.live_region_zone_catalog
),
region_targets as (
  select count(*)::bigint as actual
  from public.live_region_zone_module_coverage_targets
),
corridor_counts as (
  select count(*)::bigint as corridor_count
  from public.live_strategic_corridor_catalog
),
corridor_targets as (
  select count(*)::bigint as actual
  from public.live_corridor_module_coverage_targets
),
domain_counts as (
  select count(*)::bigint as domain_count
  from public.live_global_domain_catalog
  where required = true
),
shock_counts as (
  select count(*)::bigint as shock_count
  from public.live_global_shock_taxonomy
  where required = true
),
shock_unmapped as (
  select count(*)::bigint as unmapped_shock_count
  from public.live_global_shock_taxonomy s
  where s.required
    and not exists (
      select 1
      from public.live_global_shock_module_map m
      where m.shock_id = s.shock_id
    )
),
queue_counts as (
  select
    count(*)::bigint as queue_count,
    count(*) filter (
      where fail_closed = false
         or certification_state <> 'QUEUED'
         or endpoint_check <> 'PENDING'
         or rights_check <> 'PENDING'
         or schema_check <> 'PENDING'
         or freshness_check <> 'PENDING'
         or independence_check <> 'PENDING'
    )::bigint as queue_nonqueued_count
  from public.live_source_certification_queue
)
select
  now() as evaluated_at,
  cc.country_count,
  dc.domain_count,
  (cc.country_count * dc.domain_count)::bigint as expected_country_module_rows,
  ct.actual as actual_country_module_rows,
  rc.region_count,
  (rc.region_count * dc.domain_count)::bigint as expected_region_module_rows,
  rt.actual as actual_region_module_rows,
  crc.corridor_count,
  (crc.corridor_count * dc.domain_count)::bigint as expected_corridor_module_rows,
  crt.actual as actual_corridor_module_rows,
  sc.shock_count,
  su.unmapped_shock_count,
  qc.queue_count,
  qc.queue_nonqueued_count,
  (
    dc.domain_count = 16
    and rc.region_count = 24
    and crc.corridor_count = 35
    and ct.actual = (cc.country_count * dc.domain_count)
    and rt.actual = (rc.region_count * dc.domain_count)
    and crt.actual = (crc.corridor_count * dc.domain_count)
    and sc.shock_count = 35
    and su.unmapped_shock_count = 0
    and qc.queue_count > 0
    and qc.queue_nonqueued_count = 0
  ) as design_complete,
  false as certification_gate_open,
  false as testing_gate_open;

comment on view public.live_global_coverage_design_status is
  'Internal fail-closed design status for 16 modules, canonical enabled country/area universe, 24 zones, 35 strategic corridors and 35 shock families. design_complete does not certify any source or open testing.';

-- ---------------------------------------------------------------------------
-- 9. Hard helper checks for future operators. These are audit functions only.
-- ---------------------------------------------------------------------------
create or replace function public.global_coverage_design_is_complete()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select design_complete
      from public.live_global_coverage_design_status
      limit 1
    ),
    false
  );
$$;

create or replace function public.global_coverage_certification_is_locked()
returns boolean
language sql
immutable
as $$
  select true;
$$;

commit;
