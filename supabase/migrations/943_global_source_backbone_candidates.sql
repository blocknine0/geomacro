begin;

-- Candidate source backbone for the three coverage dimensions.
-- Every entry is registry-only until exact rights/collector/corroboration gates pass.
create table if not exists public.live_global_source_dimension_map (
  source_id text not null,
  dimension_type text not null check (dimension_type in ('COUNTRY','CORRIDOR','SHOCK')),
  dimension_id text not null,
  required boolean not null default true,
  status text not null default 'REGISTERED',
  notes text,
  updated_at timestamptz not null default now(),
  primary key (source_id, dimension_type, dimension_id)
);

insert into public.live_external_sources (
 source_id,source_name,provider_name,category,access_type,authentication_type,base_url,
 commercial_usage_status,raw_redistribution_allowed,attribution_required,
 enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes
) values
('imf_data_api','IMF Data API','International Monetary Fund','MACRO','API','NONE','https://www.imf.org/en/Data',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Official macroeconomic and financial datasets; exact dataset licensing and delivery use must be certified.'),
('bis_statistics_api','BIS Statistics','Bank for International Settlements','MACRO','API','NONE','https://www.bis.org/statistics/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Global banking, credit, rates and financial-system statistics; dataset-level reuse review required.'),
('oecd_sdmx_api','OECD SDMX API','OECD','MACRO','API','NONE','https://sdmx.oecd.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Structured macro, trade, labour and policy statistics; exact reuse terms require certification.'),
('wto_stats_api','WTO Statistics','World Trade Organization','MACRO','API','NONE','https://stats.wto.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Trade and tariff statistics; commercial delivery rights require dataset review.'),
('unctadstat_api','UNCTADstat','UN Trade and Development','MACRO','API','NONE','https://unctadstat.unctad.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Trade, investment, shipping and development statistics.'),
('un_comtrade_api','UN Comtrade API','United Nations Statistics Division','MACRO','API','NONE','https://comtradeplus.un.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Detailed international merchandise trade data; rate, attribution and redistribution terms require certification.'),
('untrade_api','UN Trade Data','United Nations','MACRO','API','NONE','https://unstats.un.org/unsd/trade/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Official trade statistics and metadata.'),
('worldbank_api','World Bank Open Data API','World Bank','MACRO','API','NONE','https://api.worldbank.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official development and macro indicators; dataset-level license must be captured.'),
('worldbank_data360','World Bank Data360','World Bank','MULTI_DOMAIN','API','NONE','https://data360.worldbank.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Cross-domain country indicators and metadata.'),
('un_data_api','UN Data','United Nations','MULTI_DOMAIN','API','NONE','https://data.un.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','UN statistical catalogue and country indicators.'),
('eurostat_sdmx','Eurostat SDMX','European Commission','MACRO','API','NONE','https://ec.europa.eu/eurostat/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','European macro, trade, energy, migration and social statistics.'),
('iea_data','IEA Data','International Energy Agency','MACRO','WEB','NONE','https://www.iea.org/data-and-statistics',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Energy supply, demand, prices and security indicators; exact reuse terms require certification.'),
('eia_open_data','EIA Open Data','U.S. Energy Information Administration','MACRO','API','API_KEY','https://api.eia.gov/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Energy production, flows, inventories and prices.'),
('opec_data','OPEC Data','Organization of the Petroleum Exporting Countries','MACRO','WEB','NONE','https://www.opec.org/data.html',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Oil production, demand and market indicators.'),
('un_commodity_trade','UN Commodity Trade','United Nations','MACRO','API','NONE','https://comtradeplus.un.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Commodity trade exposure and concentration.'),
('imo_gisis','IMO GISIS','International Maritime Organization','MACRO','WEB','ACCOUNT','https://gisis.imo.org/',
 'PERMISSION_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Maritime safety/security and shipping information; access and reuse are gated.'),
('icao_data','ICAO Data','International Civil Aviation Organization','MACRO','WEB','NONE','https://www.icao.int/safety/Pages/Statistics.aspx',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Aviation traffic and safety indicators.'),
('noaa_ncei','NOAA NCEI','National Oceanic and Atmospheric Administration','MULTI_DOMAIN','API','NONE','https://www.ncei.noaa.gov/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Weather, climate, ocean and hazard data; source-specific attribution and API limits must be recorded.'),
('copernicus_cds','Copernicus Climate Data Store','European Union / Copernicus','MULTI_DOMAIN','API','ACCOUNT','https://cds.climate.copernicus.eu/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Climate, weather and environmental datasets; product-level terms must be certified.'),
('gdacs','GDACS','United Nations / European Commission','MULTI_DOMAIN','API','NONE','https://www.gdacs.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Global disaster alerts and impact estimates; use as alert/corroboration path, not original-source equivalence.'),
('emsc_csem','EMSC-CSEM','European-Mediterranean Seismological Centre','MULTI_DOMAIN','FEED','NONE','https://www.emsc-csem.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Earthquake alerts and seismic observations; independent corroboration candidate.'),
('nasa_earthdata','NASA Earthdata','NASA','MULTI_DOMAIN','API','ACCOUNT','https://www.earthdata.nasa.gov/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Earth observation and environmental data; exact product terms require certification.'),
('noaa_swpc','NOAA Space Weather Prediction Center','NOAA','MULTI_DOMAIN','API','NONE','https://www.swpc.noaa.gov/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Space-weather observations and alerts.'),
('wfp_dataviz','WFP Data','World Food Programme','MULTI_DOMAIN','WEB','NONE','https://data.humdata.org/organization/wfp',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Food security and humanitarian data; dataset-specific terms required.'),
('fews_net','FEWS NET','USAID','MULTI_DOMAIN','WEB','NONE','https://fews.net/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Food-security early warning and market context; provenance and reuse review required.'),
('unaids_data','UNAIDS Data','UNAIDS','MULTI_DOMAIN','WEB','NONE','https://www.unaids.org/en/dataanalysis',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','HIV/AIDS epidemiological context; dataset-specific terms require review.'),
('un_ocha_hdx','OCHA Humanitarian Data Exchange','United Nations OCHA','MULTI_DOMAIN','API','NONE','https://data.humdata.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Humanitarian datasets and metadata; third-party rights vary by dataset.'),
('worldpop','WorldPop','University of Southampton / WorldPop','MULTI_DOMAIN','API','NONE','https://www.worldpop.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Population and demographic spatial data; dataset license must be captured.'),
('acled','ACLED','Armed Conflict Location & Event Data','GEOPOLITICS','API','API_KEY','https://acleddata.com/',
 'PERMISSION_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Conflict and protest event data; access and commercial terms require explicit account/rights review.'),
('icews','ICEWS','Lockheed Martin / ICEWS','GEOPOLITICS','DATASET','ACCOUNT','https://dataverse.harvard.edu/',
 'PERMISSION_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Political event dataset candidate; provenance/licensing and commercial use must be cleared.'),
('gdelt_v2_events','GDELT 2.0 Events','GDELT Project','GEOPOLITICS','API','NONE','https://www.gdeltproject.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Global event/news-derived signals; derived-data provenance and publisher-rights boundary must be governed.'),
('unsc_open_data','UN Security Council Open Data','United Nations Security Council','GEOPOLITICS','API','NONE','https://main.un.org/securitycouncil/en/content/open-data',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Official resolutions, sanctions and Council records.'),
('un_sanctions','UN Security Council Consolidated List','United Nations','GEOPOLITICS','DATASET','NONE','https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official sanctions-list source candidate; exact redistribution and update contract require certification.')
on conflict (source_id) do update set
 source_name=excluded.source_name,provider_name=excluded.provider_name,category=excluded.category,
 access_type=excluded.access_type,authentication_type=excluded.authentication_type,base_url=excluded.base_url,
 commercial_usage_status=excluded.commercial_usage_status,raw_redistribution_allowed=false,
 attribution_required=excluded.attribution_required,enabled_for_ingestion=false,
 enabled_for_commercial_signals=false,country_scope='GLOBAL',freshness_class=excluded.freshness_class,
 notes=excluded.notes,updated_at=now();

-- Keep all newly registered candidates fail-closed.
update public.live_external_sources
set enabled_for_ingestion=false, enabled_for_commercial_signals=false, updated_at=now()
where source_id in (
'imf_data_api','bis_statistics_api','oecd_sdmx_api','wto_stats_api','unctadstat_api','un_comtrade_api',
'untrade_api','worldbank_api','worldbank_data360','un_data_api','eurostat_sdmx','iea_data','eia_open_data',
'opec_data','un_commodity_trade','imo_gisis','icao_data','noaa_ncei','copernicus_cds','gdacs','emsc_csem',
'nasa_earthdata','noaa_swpc','wfp_dataviz','fews_net','unaids_data','un_ocha_hdx','worldpop','acled',
'icews','gdelt_v2_events','unsc_open_data','un_sanctions'
);

-- Global dimension mapping starts with high-value cross-cutting sources.
insert into public.live_global_source_dimension_map(source_id,dimension_type,dimension_id,notes)
select s.source_id,'COUNTRY',c.iso3,'Global country backbone candidate; exact country-level resolution is certified per source.'
from public.live_external_sources s cross join public.live_global_country_coverage c
where s.source_id in ('worldbank_api','worldbank_data360','un_data_api','untrade_api','gdelt_v2_events','gdacs','noaa_ncei','un_ocha_hdx','unsc_open_data')
on conflict do nothing;

insert into public.live_global_source_dimension_map(source_id,dimension_type,dimension_id,notes)
select s.source_id,'CORRIDOR',c.corridor_id,'Corridor candidate; source-specific flow/route resolution must be measured before promotion.'
from public.live_external_sources s cross join public.live_global_corridor_coverage c
where s.source_id in ('un_comtrade_api','wto_stats_api','unctadstat_api','iea_data','eia_open_data','imo_gisis','icao_data','gdelt_v2_events','noaa_ncei')
on conflict do nothing;

insert into public.live_global_source_dimension_map(source_id,dimension_type,dimension_id,notes)
select s.source_id,'SHOCK',k.shock_id,'Shock-family candidate; no scoring eligibility until collector, provenance and corroboration gates pass.'
from public.live_external_sources s cross join public.live_global_shock_taxonomy k
where s.source_id in ('gdelt_v2_events','gdacs','noaa_ncei','copernicus_cds','emsc_csem','nasa_earthdata','noaa_swpc','acled','unsc_open_data','un_sanctions','imf_data_api','bis_statistics_api','worldbank_api','eia_open_data','iea_data','wfp_dataviz','fews_net','un_ocha_hdx')
on conflict do nothing;

commit;