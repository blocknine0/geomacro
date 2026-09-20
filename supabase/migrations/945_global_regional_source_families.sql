begin;

-- Regional / institutional source families needed to close geographic blind spots.
insert into public.live_external_sources (
 source_id,source_name,provider_name,category,access_type,authentication_type,base_url,
 commercial_usage_status,raw_redistribution_allowed,attribution_required,
 enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes
) values
('wmo_data','WMO Data','World Meteorological Organization','MULTI_DOMAIN','API','NONE','https://wmo.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Global authoritative weather/climate information family; exact dataset access and reuse must be certified.'),
('undrr_data','UNDRR Data','United Nations Office for Disaster Risk Reduction','MULTI_DOMAIN','WEB','NONE','https://www.undrr.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Disaster-risk and resilience indicators; dataset-level rights and update cadence require certification.'),
('unep_data','UNEP Data','United Nations Environment Programme','MULTI_DOMAIN','WEB','NONE','https://www.unep.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Environmental and pollution indicators; exact dataset terms require review.'),
('iaea_data','IAEA Data','International Atomic Energy Agency','GEOPOLITICS','WEB','NONE','https://www.iaea.org/data',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Nuclear safety/security and energy indicators; dataset-specific reuse requires certification.'),
('who_data','WHO Data','World Health Organization','MULTI_DOMAIN','API','NONE','https://data.who.int/',
 'PERMISSION_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Health indicators and surveillance context; exact dataset reuse must be cleared.'),
('iom_data','IOM Data','International Organization for Migration','GEOPOLITICS','WEB','NONE','https://www.iom.int/data-and-research',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Migration/displacement data family; source-specific access and reuse require certification.'),
('unhcr_data','UNHCR Operational Data Portal','UNHCR','GEOPOLITICS','API','NONE','https://data.unhcr.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Humanitarian displacement and operational data; exact dataset license and field contract must be captured.'),
('ilo_data','ILO Data','International Labour Organization','MACRO','API','NONE','https://ilostat.ilo.org/data/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Labour-market and social indicators; dataset-level reuse review required.'),
('un_population_data','UN Population Data','United Nations DESA','MACRO','WEB','NONE','https://population.un.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Population and demographic projections; product-specific terms require certification.'),
('ecb_data','ECB Data Portal','European Central Bank','MACRO','API','NONE','https://data.ecb.europa.eu/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official monetary, financial and macroeconomic statistics.'),
('federal_reserve_fred','FRED','Federal Reserve Bank of St. Louis','MACRO','API','API_KEY','https://fred.stlouisfed.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Economic and financial time series; source and series-level reuse terms require certification.'),
('bank_england_data','Bank of England Data','Bank of England','MACRO','API','NONE','https://www.bankofengland.co.uk/boeapps/database',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','UK monetary and financial statistics.'),
('rbi_data','RBI Database','Reserve Bank of India','MACRO','WEB','NONE','https://data.rbi.org.in/',
 'REVIEW_REQUIRED',false,true,false,false,'IND','SOURCE_DEPENDENT','India monetary, financial and macro indicators; exact reuse terms require certification.'),
('asean_stats','ASEANstats','Association of Southeast Asian Nations','MULTI_DOMAIN','WEB','NONE','https://data.aseanstats.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Regional trade, macro and social indicators for Southeast Asia.'),
('africa_union_data','African Union Data','African Union','MULTI_DOMAIN','WEB','NONE','https://au.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Continental policy, conflict, development and statistical source family.'),
('afdb_data','African Development Bank Data','African Development Bank','MACRO','API','NONE','https://dataportal.opendataforafrica.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','African macro/development indicators; dataset-level licensing requires review.'),
('oecd_data','OECD Data Explorer','OECD','MACRO','API','NONE','https://data-explorer.oecd.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','OECD country and regional statistics.'),
('oas_data','OAS Data','Organization of American States','GEOPOLITICS','WEB','NONE','https://www.oas.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Americas political/economic institutional source family.'),
('caricom_stats','CARICOM Statistics','CARICOM','MULTI_DOMAIN','WEB','NONE','https://statistics.caricom.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Caribbean regional statistics and indicators.'),
('mercosur_data','MERCOSUR','MERCOSUR','MULTI_DOMAIN','WEB','NONE','https://www.mercosur.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','South American trade/integration source family.'),
('ecowas_data','ECOWAS','Economic Community of West African States','MULTI_DOMAIN','WEB','NONE','https://ecowas.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','West African regional economic and security source family.'),
('eac_data','East African Community','East African Community','MULTI_DOMAIN','WEB','NONE','https://www.eac.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','East African regional trade, mobility and policy source family.'),
('sadc_data','SADC','Southern African Development Community','MULTI_DOMAIN','WEB','NONE','https://www.sadc.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Southern African regional integration and security source family.'),
('igad_data','IGAD','Intergovernmental Authority on Development','MULTI_DOMAIN','WEB','NONE','https://igad.int/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Horn of Africa drought, migration, conflict and resilience source family.'),
('arctic_council_data','Arctic Council','Arctic Council','MULTI_DOMAIN','WEB','NONE','https://arctic-council.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Arctic environmental, shipping and geopolitical context.'),
('osce_data','OSCE','Organization for Security and Co-operation in Europe','GEOPOLITICS','WEB','NONE','https://www.osce.org/',
 'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Conflict-prevention, election and security information family; exact reuse requires certification.')
on conflict (source_id) do update set
 source_name=excluded.source_name,provider_name=excluded.provider_name,category=excluded.category,
 access_type=excluded.access_type,authentication_type=excluded.authentication_type,base_url=excluded.base_url,
 commercial_usage_status=excluded.commercial_usage_status,enabled_for_ingestion=false,
 enabled_for_commercial_signals=false,country_scope=excluded.country_scope,freshness_class=excluded.freshness_class,
 notes=excluded.notes,updated_at=now();

update public.live_external_sources
set enabled_for_ingestion=false, enabled_for_commercial_signals=false, updated_at=now()
where source_id in ('wmo_data','undrr_data','unep_data','iaea_data','who_data','iom_data','unhcr_data','ilo_data',
'un_population_data','ecb_data','federal_reserve_fred','bank_england_data','rbi_data','asean_stats','africa_union_data',
'afdb_data','oecd_data','oas_data','caricom_stats','mercosur_data','ecowas_data','eac_data','sadc_data','igad_data',
'arctic_council_data','osce_data');

-- Attach regional families to the appropriate three-dimensional coverage graph.
insert into public.live_global_source_dimension_map(source_id,dimension_type,dimension_id,notes)
select s.source_id,'COUNTRY',c.iso3,'Regional/global source candidate; country resolution remains uncertified.'
from public.live_external_sources s cross join public.live_global_country_coverage c
where s.source_id in ('wmo_data','undrr_data','unep_data','who_data','iom_data','unhcr_data','ilo_data','un_population_data','ecb_data','oecd_data','asean_stats','africa_union_data','afdb_data','oas_data','caricom_stats','ecowas_data','eac_data','sadc_data','igad_data')
on conflict do nothing;

insert into public.live_global_source_dimension_map(source_id,dimension_type,dimension_id,notes)
select s.source_id,'CORRIDOR',c.corridor_id,'Regional/infrastructure candidate; route-level coverage remains uncertified.'
from public.live_external_sources s cross join public.live_global_corridor_coverage c
where s.source_id in ('wmo_data','unep_data','iea_data','eia_open_data','imo_gisis','icao_data','unctadstat_api','asean_stats','africa_union_data','afdb_data','arctic_council_data')
on conflict do nothing;

insert into public.live_global_source_dimension_map(source_id,dimension_type,dimension_id,notes)
select s.source_id,'SHOCK',k.shock_id,'Regional/institutional shock candidate; no production scoring eligibility yet.'
from public.live_external_sources s cross join public.live_global_shock_taxonomy k
where s.source_id in ('wmo_data','undrr_data','unep_data','iaea_data','who_data','iom_data','unhcr_data','ilo_data','ecb_data','federal_reserve_fred','bank_england_data','rbi_data','asean_stats','africa_union_data','afdb_data','oas_data','ecowas_data','eac_data','sadc_data','igad_data','arctic_council_data','osce_data')
on conflict do nothing;

commit;