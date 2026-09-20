-- =============================================================================
-- Geomacro Global Source Universe Expansion v1
--
-- Actual source inventory expansion after the structural 055 contract.
-- This migration registers country-wise, regional, corridor and shock source
-- paths. It deliberately does NOT certify endpoints, rights, schemas, freshness
-- or commercial use, and it does not enable new feeds.
-- =============================================================================
begin;

-- New source registrations. All remain fail-closed.
insert into public.live_external_sources (
 source_id,source_name,provider_name,category,access_type,authentication_type,base_url,
 licence_name,commercial_usage_status,raw_redistribution_allowed,attribution_required,
 enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes
) values
('bis_statistics','BIS Statistics','Bank for International Settlements','MACRO','SDMX','NONE','https://stats.bis.org/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','SOURCE_DEPENDENT','Official BIS statistics structural source candidate; dataset-level reuse and machine contract remain certification-gated.'),
('au_press_releases','African Union Press Releases','African Union','GEOPOLITICS','HTML','NONE','https://au.int/en/press-releases',null,'REVIEW_REQUIRED',false,true,false,false,'AFRICA','NEAR_REAL_TIME','Official AU institutional news/press surface; current regional primary candidate; rights and machine endpoint remain gated.'),
('ecowas_press_releases','ECOWAS Press Releases','ECOWAS Commission','GEOPOLITICS','HTML','NONE','https://www.ecowas.int/c/news/press-releases/?lang=en-en',null,'REVIEW_REQUIRED',false,true,false,false,'WEST_AFRICA','NEAR_REAL_TIME','Official ECOWAS regional source for West African security, trade and policy developments; endpoint/reuse gated.'),
('eac_press_releases','East African Community Press Releases','East African Community','GEOPOLITICS','HTML','NONE','https://www.eac.int/press-releases',null,'REVIEW_REQUIRED',false,true,false,false,'EAST_AFRICA','NEAR_REAL_TIME','Official EAC regional policy/trade/security surface; endpoint/reuse gated.'),
('igad_news','IGAD News','Intergovernmental Authority on Development','GEOPOLITICS','HTML','NONE','https://igad.int/news/',null,'REVIEW_REQUIRED',false,true,false,false,'HORN_OF_AFRICA','NEAR_REAL_TIME','Official IGAD regional security, humanitarian and resilience source candidate.'),
('sadc_news','SADC Latest News','Southern African Development Community','GEOPOLITICS','HTML','NONE','https://www.sadc.int/latest-news',null,'REVIEW_REQUIRED',false,true,false,false,'SOUTHERN_AFRICA','NEAR_REAL_TIME','Official SADC regional political, climate and economic early-warning source.'),
('afdb_press_releases','African Development Bank Press Releases','African Development Bank','MACRO','HTML','NONE','https://www.afdb.org/en/news-and-events/press-releases',null,'REVIEW_REQUIRED',false,true,false,false,'AFRICA','NEAR_REAL_TIME','Official AfDB regional development, finance and infrastructure source candidate.'),
('afreximbank_news','Afreximbank News','African Export-Import Bank','MACRO','HTML','NONE','https://www.afreximbank.com/news/',null,'REVIEW_REQUIRED',false,true,false,false,'AFRICA','NEAR_REAL_TIME','Official African trade-finance and intra-African commerce source candidate.'),
('nato_news','NATO News','NATO','GEOPOLITICS','HTML','NONE','https://www.nato.int/cps/en/natohq/news.htm',null,'REVIEW_REQUIRED',false,true,false,false,'EUROPE_NORTH_ATLANTIC','NEAR_REAL_TIME','Official NATO institutional security source candidate.'),
('osce_news','OSCE News','Organization for Security and Co-operation in Europe','GEOPOLITICS','HTML','NONE','https://www.osce.org/news',null,'REVIEW_REQUIRED',false,true,false,false,'EUROPE','NEAR_REAL_TIME','Official OSCE political-security source; use current page after endpoint revalidation.'),
('saarc_press_releases','SAARC Secretariat Press Releases','South Asian Association for Regional Cooperation','GEOPOLITICS','HTML','NONE','https://www.saarc-sec.org/press-releases/',null,'REVIEW_REQUIRED',false,true,false,false,'SOUTH_ASIA','NEAR_REAL_TIME','Official SAARC regional source candidate; endpoint/reuse gated.'),
('adb_data_library','ADB Data Library','Asian Development Bank','MACRO','API','NONE','https://data.adb.org/',null,'REVIEW_REQUIRED',false,true,false,false,'ASIA_PACIFIC','PERIODIC','Official ADB public data repository; exact dataset licence and API contract required before paid use.'),
('amro_news','AMRO Publications and News','ASEAN+3 Macroeconomic Research Office','MACRO','HTML','NONE','https://www.amro-asia.org/',null,'REVIEW_REQUIRED',false,true,false,false,'EAST_ASIA_SE_ASIA','NEAR_REAL_TIME','Official regional macro/financial surveillance source candidate.'),
('apec_press_room','APEC Press Room','Asia-Pacific Economic Cooperation','MACRO','HTML','NONE','https://www.apec.org/press-room',null,'REVIEW_REQUIRED',false,true,false,false,'ASIA_PACIFIC','NEAR_REAL_TIME','Official APEC policy/trade/economic source candidate.'),
('oas_press_releases','OAS Press Releases','Organization of American States','GEOPOLITICS','HTML','NONE','https://www.oas.org/en/media_center/press_releases.asp',null,'REVIEW_REQUIRED',false,true,false,false,'AMERICAS','NEAR_REAL_TIME','Official OAS regional governance, security and policy source; current press surface.'),
('idb_news','Inter-American Development Bank News','Inter-American Development Bank','MACRO','HTML','NONE','https://www.iadb.org/en/news-search',null,'REVIEW_REQUIRED',false,true,false,false,'AMERICAS','NEAR_REAL_TIME','Official IDB regional development, infrastructure and macro source candidate.'),
('caricom_news','CARICOM News','Caribbean Community','GEOPOLITICS','HTML','NONE','https://caricom.org/',null,'REVIEW_REQUIRED',false,true,false,false,'CARIBBEAN','NEAR_REAL_TIME','Official Caribbean regional-policy source candidate.'),
('gcc_news','GCC Secretariat News','Gulf Cooperation Council','GEOPOLITICS','HTML','NONE','https://www.gcc-sg.org/',null,'REVIEW_REQUIRED',false,true,false,false,'GULF','NEAR_REAL_TIME','Official GCC political/economic/security source candidate.'),
('arab_league_news','League of Arab States News','League of Arab States','GEOPOLITICS','HTML','NONE','https://www.lasportal.org/',null,'REVIEW_REQUIRED',false,true,false,false,'ARAB_WORLD','NEAR_REAL_TIME','Official Arab League institutional source candidate.'),
('iom_dtm_api','IOM Displacement Tracking Matrix API','International Organization for Migration','GEOPOLITICS','API','API_KEY','https://dtm.iom.int/data-and-analysis/dtm-api',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official IOM DTM programmatic access; API key/account and exact dataset terms required.'),
('itu_telecom_infrastructure','ITU Media and Telecom Infrastructure','International Telecommunication Union','MULTI_DOMAIN','HTML','NONE','https://www.itu.int/en/mediacentre/pages/all-pr.aspx',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official ITU infrastructure/telecom source candidate; exact statistical/dataset reuse terms remain gated.'),
('antarctic_treaty_secretariat','Antarctic Treaty Secretariat','Secretariat of the Antarctic Treaty','GEOPOLITICS','HTML','NONE','https://www.ats.aq/',null,'REVIEW_REQUIRED',false,true,false,false,'ANTARCTICA','PERIODIC','Official Antarctic Treaty governance source; candidate for polar policy/environment monitoring.'),
('imo_maritime_safety_info','IMO Maritime Safety Information','International Maritime Organization','GEOPOLITICS','HTML','NONE','https://www.imo.org/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL_MARITIME','NEAR_REAL_TIME','Official maritime safety/navigation governance source candidate; exact MSI machine interface to be certified.'),
('suez_canal_navigation','Suez Canal Authority Navigation Circulars','Suez Canal Authority','GEOPOLITICS','HTML','NONE','https://www.suezcanal.gov.eg/English/Navigation/NavigationCirculars/Pages/default.aspx',null,'REVIEW_REQUIRED',false,true,false,false,'SUEZ','NEAR_REAL_TIME','Official Suez navigation circulars and operational rules; current circulars observed. Rights/machine extraction gated.'),
('panama_canal_notices_to_shipping','Panama Canal Notices to Shipping','Panama Canal Authority','GEOPOLITICS','HTML','NONE','https://pancanal.com/en/maritime-services/notices-to-shipping/',null,'REVIEW_REQUIRED',false,true,false,false,'PANAMA','NEAR_REAL_TIME','Official canal notices/advisories for transit operations and constraints.'),
('recaap_reports','ReCAAP Reports and Alerts','ReCAAP Information Sharing Centre','GEOPOLITICS','HTML','NONE','https://www.recaap.org/reports',null,'REVIEW_REQUIRED',false,true,false,false,'SOUTHEAST_ASIA_MARITIME','NEAR_REAL_TIME','Official regional piracy/maritime-security reports and warnings.'),
('ukmto_maritime_security','UKMTO Maritime Security Information','UK Maritime Trade Operations','GEOPOLITICS','HTML','NONE','https://www.ukmto.org/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL_MARITIME','NEAR_REAL_TIME','Trusted maritime-security information source with operational reporting; machine/reuse contract gated.'),
('marad_msci_advisories','MARAD Maritime Security Communications with Industry','U.S. Maritime Administration','GEOPOLITICS','HTML','NONE','https://www.maritime.dot.gov/msci-advisories',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL_MARITIME','NEAR_REAL_TIME','Official U.S. government maritime-security advisories spanning major risk areas.'),
('turkish_straits_vts','Turkish Straits Vessel Traffic Services','Turkish Directorate General of Coastal Safety','GEOPOLITICS','HTML','NONE','https://kiyiemniyeti.gov.tr/vessel_traffic_and_pilotage_services',null,'REVIEW_REQUIRED',false,true,false,false,'TURKISH_STRAITS','NEAR_REAL_TIME','Official Turkish Straits VTS/pilotage information candidate.'),
('amsa_marine_safety_information','AMSA Maritime Safety Information','Australian Maritime Safety Authority','GEOPOLITICS','HTML','NONE','https://www.amsa.gov.au/safety-navigation/navigation-systems/maritime-safety-information',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL_MARITIME','NEAR_REAL_TIME','Official Australian maritime safety/navigation warning source and MSI database.'),
('samsa_marine_safety','South African Maritime Safety Authority','South African Maritime Safety Authority','GEOPOLITICS','HTML','NONE','https://www.samsa.org.za/',null,'REVIEW_REQUIRED',false,true,false,false,'SOUTHERN_AFRICA','NEAR_REAL_TIME','Official South African maritime safety/regulatory source candidate.'),
('gibraltar_port_authority','Gibraltar Port Authority','Gibraltar Port Authority','GEOPOLITICS','HTML','NONE','https://www.gibraltarport.com/',null,'REVIEW_REQUIRED',false,true,false,false,'GIBRALTAR','NEAR_REAL_TIME','Official Gibraltar port operational source candidate.'),
('emsa_maritime_safety','European Maritime Safety Agency','European Maritime Safety Agency','GEOPOLITICS','HTML','NONE','https://www.emsa.europa.eu/',null,'REVIEW_REQUIRED',false,true,false,false,'EUROPE_MARITIME','NEAR_REAL_TIME','Official EU maritime safety/traffic source candidate.'),
('indonesia_dg_sea_transport','Indonesia Directorate General of Sea Transportation','Ministry of Transportation Indonesia','GEOPOLITICS','HTML','NONE','https://hubla.dephub.go.id/',null,'REVIEW_REQUIRED',false,true,false,false,'INDONESIA','NEAR_REAL_TIME','Official Indonesian maritime/port authority source candidate.'),
('traceca_intergovernmental','TRACECA Intergovernmental Commission','TRACECA','GEOPOLITICS','HTML','NONE','https://traceca-org.org/',null,'REVIEW_REQUIRED',false,true,false,false,'CAUCASUS_CENTRAL_ASIA','PERIODIC','Official Euro-Asia transport corridor institution source candidate.'),
('northern_corridor_observatory','Northern Corridor Transport Observatory','Northern Corridor Transport Coordination Authority','MACRO','HTML','NONE','https://top.ttcanc.org/',null,'REVIEW_REQUIRED',false,true,false,false,'EAST_AFRICA_CORRIDOR','PERIODIC','Official Northern Corridor monitoring/observatory source; current indicator/reporting surface.'),
('central_corridor_authority','Central Corridor Transport Observatory','Central Corridor Transit Transport Facilitation Agency','MACRO','HTML','NONE','https://ccttfa.go.tz/',null,'REVIEW_REQUIRED',false,true,false,false,'EAST_AFRICA_CORRIDOR','PERIODIC','Official Central Corridor institution candidate; endpoint and reuse gated.'),
('lapsset_corridor_authority','LAPSSET Corridor Development Authority','LAPSSET Corridor Development Authority','MACRO','HTML','NONE','https://lapsset.go.ke/',null,'REVIEW_REQUIRED',false,true,false,false,'EAST_AFRICA_CORRIDOR','PERIODIC','Official LAPSSET corridor source candidate.'),
('walvis_bay_corridor_group','Walvis Bay Corridor Group','Walvis Bay Corridor Group','MACRO','HTML','NONE','https://www.wbcg.com.na/',null,'REVIEW_REQUIRED',false,true,false,false,'SOUTHERN_AFRICA_CORRIDOR','PERIODIC','Official corridor facilitation/transport source candidate.'),
('lobito_corridor_authority','Lobito Corridor Investment Promotion Authority','Lobito Corridor','MACRO','HTML','NONE','https://www.lobitocorridor.org/',null,'REVIEW_REQUIRED',false,true,false,false,'CENTRAL_SOUTHERN_AFRICA_CORRIDOR','PERIODIC','Official Lobito corridor investment/logistics source candidate.'),
('carec_program_transport','CAREC Program','Central Asia Regional Economic Cooperation','MACRO','HTML','NONE','https://www.carecprogram.org/',null,'REVIEW_REQUIRED',false,true,false,false,'CENTRAL_ASIA_CORRIDOR','PERIODIC','Official regional transport/trade program source candidate.'),
('instc_intergovernmental_route','International North-South Transport Corridor','INSTC','MACRO','HTML','NONE','https://instc.org/',null,'REVIEW_REQUIRED',false,true,false,false,'INSTC','PERIODIC','Intergovernmental corridor information candidate; endpoint and institutional status must be revalidated before certification.'),
('india_ports_authority','India Ministry of Ports Shipping and Waterways','Government of India','GEOPOLITICS','HTML','NONE','https://shipmin.gov.in/',null,'REVIEW_REQUIRED',false,true,false,false,'INDIA_MARITIME','NEAR_REAL_TIME','Official Indian ports/shipping policy source candidate for IMEC and maritime route monitoring.'),
('southern_gas_corridor_cjsc','Southern Gas Corridor CJSC','Southern Gas Corridor CJSC','MACRO','HTML','NONE','https://www.sgc.az/en',null,'REVIEW_REQUIRED',false,true,false,false,'SOUTHERN_GAS_CORRIDOR','NEAR_REAL_TIME','Official Southern Gas Corridor operator/institution source; current project/route information.'),
('tanap_pipeline','TANAP','Trans-Anatolian Natural Gas Pipeline','MACRO','HTML','NONE','https://www.tanap.com/',null,'REVIEW_REQUIRED',false,true,false,false,'TANAP','NEAR_REAL_TIME','Pipeline operator/infrastructure source candidate.'),
('tap_pipeline','TAP','Trans Adriatic Pipeline','MACRO','HTML','NONE','https://www.tap-ag.com/',null,'REVIEW_REQUIRED',false,true,false,false,'TAP','NEAR_REAL_TIME','Pipeline operator/infrastructure source candidate.'),
('cpc_pipeline','Caspian Pipeline Consortium','CPC','MACRO','HTML','NONE','https://www.cpc.ru/EN/Pages/default.aspx',null,'REVIEW_REQUIRED',false,true,false,false,'CPC','NEAR_REAL_TIME','Official CPC operational/news source; current 2026 press activity observed.'),
('icpc_submarine_cables','International Cable Protection Committee','ICPC','MULTI_DOMAIN','HTML','NONE','https://iscpc.org/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL_SUBSEA','PERIODIC','Industry/governance source for submarine cable protection and resilience.'),
('nasa_firms_modis_nrt','NASA FIRMS MODIS Near Real-Time Fire Detections','NASA LANCE / FIRMS','MULTI_DOMAIN','API','API_KEY','https://firms.modaps.eosdis.nasa.gov/api/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official NASA FIRMS API candidate; exact data product boundary and key required. Later 920 migration may refine rights state.')
on conflict(source_id) do nothing;

-- One canonical internal inventory: every source path attached to a country,
-- zone, corridor or shock family is explicit here.
create table if not exists public.live_global_source_universe (
 universe_id text primary key,
 scope_type text not null check(scope_type in ('COUNTRY','REGION','CORRIDOR','SHOCK')),
 scope_code text not null,
 source_role text not null,
 source_id text not null references public.live_external_sources(source_id),
 priority integer not null default 100 check(priority > 0),
 required boolean not null default true,
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(scope_type,scope_code,source_role,source_id)
);

create index if not exists live_global_source_universe_scope_idx
 on public.live_global_source_universe(scope_type,scope_code);
create index if not exists live_global_source_universe_source_idx
 on public.live_global_source_universe(source_id,scope_type);

-- Country-wise multi-source inventory for every canonical enabled country/area.
insert into public.live_global_source_universe
(universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
select 'COUNTRY:'||c.iso3||':'||'GLOBAL_GOVERNANCE_PRIMARY'||':'||'world_bank_wgi_political_stability','COUNTRY',c.iso3,'GLOBAL_GOVERNANCE_PRIMARY','world_bank_wgi_political_stability',10,true,'International structural governance baseline; not a national direct endpoint.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'GLOBAL_GOVERNANCE_EVENT'||':'||'un_security_council_docs_rss','COUNTRY',c.iso3,'GLOBAL_GOVERNANCE_EVENT','un_security_council_docs_rss',20,true,'Official multilateral event/document path.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'GLOBAL_MACRO_PRIMARY'||':'||'world_bank_indicators','COUNTRY',c.iso3,'GLOBAL_MACRO_PRIMARY','world_bank_indicators',10,true,'Global country-level macro baseline.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'GLOBAL_MACRO_SECONDARY'||':'||'imf_sdmx_central','COUNTRY',c.iso3,'GLOBAL_MACRO_SECONDARY','imf_sdmx_central',20,true,'Global macro/statistical cross-check.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'GLOBAL_FISCAL'||':'||'world_bank_qpsd','COUNTRY',c.iso3,'GLOBAL_FISCAL','world_bank_qpsd',30,true,'Sovereign/fiscal structural path where covered.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'FINANCIAL_SYSTEM'||':'||'bis_statistics','COUNTRY',c.iso3,'FINANCIAL_SYSTEM','bis_statistics',20,true,'Global banking/financial-system structural path.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'FINANCIAL_EVENTS'||':'||'bis_rss_media_releases','COUNTRY',c.iso3,'FINANCIAL_EVENTS','bis_rss_media_releases',30,true,'Current financial-system event path.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'SECURITY_PRIMARY'||':'||'ucdp_candidate','COUNTRY',c.iso3,'SECURITY_PRIMARY','ucdp_candidate',10,true,'Current organized-violence evidence path where available.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'SECURITY_EVENT'||':'||'gdelt_v2_events','COUNTRY',c.iso3,'SECURITY_EVENT','gdelt_v2_events',20,true,'Global current-event discovery/corroboration.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'TRADE_POLICY'||':'||'wto_trade_monitoring','COUNTRY',c.iso3,'TRADE_POLICY','wto_trade_monitoring',20,true,'Official trade-policy path.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'HUMANITARIAN'||':'||'unhcr_global_public_api','COUNTRY',c.iso3,'HUMANITARIAN','unhcr_global_public_api',30,true,'Displacement/emergency source path.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'HUMANITARIAN_SECONDARY'||':'||'reliefweb_reports_api','COUNTRY',c.iso3,'HUMANITARIAN_SECONDARY','reliefweb_reports_api',40,true,'Humanitarian reporting/corroboration path.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'HEALTH'||':'||'who_gho_odata','COUNTRY',c.iso3,'HEALTH','who_gho_odata',30,true,'Public-health structural/event source.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'LABOR'||':'||'ilostat_sdmx_api','COUNTRY',c.iso3,'LABOR','ilostat_sdmx_api',30,true,'Labour-market structural source.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'HAZARD_ALERTS'||':'||'gdacs_global_events_api','COUNTRY',c.iso3,'HAZARD_ALERTS','gdacs_global_events_api',20,true,'Global near-real-time disaster alerts.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'CLIMATE_HISTORY'||':'||'noaa_ncei_cdo_api','COUNTRY',c.iso3,'CLIMATE_HISTORY','noaa_ncei_cdo_api',40,true,'Climate/hazard historical observations.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'MINERALS'||':'||'usgs_mcs','COUNTRY',c.iso3,'MINERALS','usgs_mcs',20,true,'Mineral production/resource baseline.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'MINERALS_TRADE'||':'||'unctad_critical_minerals_data','COUNTRY',c.iso3,'MINERALS_TRADE','unctad_critical_minerals_data',30,true,'Critical-mineral trade baseline.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'MINERALS_POLICY'||':'||'oecd_critical_raw_materials_restrictions','COUNTRY',c.iso3,'MINERALS_POLICY','oecd_critical_raw_materials_restrictions',40,true,'Export-restriction policy source.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'AUTHORITY_DISCOVERY_IMF'||':'||'imf_sdmx_central','COUNTRY',c.iso3,'AUTHORITY_DISCOVERY_IMF','imf_sdmx_central',80,true,'Authority/dissemination discovery layer; not a direct national source.' from public.live_country_registry c where c.enabled = true
union all
select 'COUNTRY:'||c.iso3||':'||'AUTHORITY_DISCOVERY_BIS'||':'||'bis_statistics','COUNTRY',c.iso3,'AUTHORITY_DISCOVERY_BIS','bis_statistics',90,true,'Central-bank/financial authority discovery layer; not a direct national source.' from public.live_country_registry c where c.enabled = true
on conflict(scope_type,scope_code,source_role,source_id) do update set
 priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

-- 24 regional zones × 3 source paths.
insert into public.live_global_source_universe
(universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
values
('REGION:NORTH_AMERICA:REGIONAL_PRIMARY:oecd_sdmx_api','REGION','NORTH_AMERICA','REGIONAL_PRIMARY','oecd_sdmx_api',10,true,'Zone-specific institutional source candidate.'),
('REGION:NORTH_AMERICA:REGIONAL_SECONDARY:nato_rss_catalog','REGION','NORTH_AMERICA','REGIONAL_SECONDARY','nato_rss_catalog',20,true,'Independent regional corroboration source candidate.'),
('REGION:NORTH_AMERICA:GLOBAL_FALLBACK:world_bank_indicators','REGION','NORTH_AMERICA','GLOBAL_FALLBACK','world_bank_indicators',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:CENTRAL_AMERICA:REGIONAL_PRIMARY:oas_permanent_council_rss','REGION','CENTRAL_AMERICA','REGIONAL_PRIMARY','oas_permanent_council_rss',10,true,'Zone-specific institutional source candidate.'),
('REGION:CENTRAL_AMERICA:REGIONAL_SECONDARY:idb_news','REGION','CENTRAL_AMERICA','REGIONAL_SECONDARY','idb_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:CENTRAL_AMERICA:GLOBAL_FALLBACK:gdelt_v2_events','REGION','CENTRAL_AMERICA','GLOBAL_FALLBACK','gdelt_v2_events',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:CARIBBEAN:REGIONAL_PRIMARY:caricom_news','REGION','CARIBBEAN','REGIONAL_PRIMARY','caricom_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:CARIBBEAN:REGIONAL_SECONDARY:oas_press_releases','REGION','CARIBBEAN','REGIONAL_SECONDARY','oas_press_releases',20,true,'Independent regional corroboration source candidate.'),
('REGION:CARIBBEAN:GLOBAL_FALLBACK:idb_news','REGION','CARIBBEAN','GLOBAL_FALLBACK','idb_news',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:SOUTH_AMERICA:REGIONAL_PRIMARY:oas_press_releases','REGION','SOUTH_AMERICA','REGIONAL_PRIMARY','oas_press_releases',10,true,'Zone-specific institutional source candidate.'),
('REGION:SOUTH_AMERICA:REGIONAL_SECONDARY:idb_news','REGION','SOUTH_AMERICA','REGIONAL_SECONDARY','idb_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:SOUTH_AMERICA:GLOBAL_FALLBACK:gdelt_v2_events','REGION','SOUTH_AMERICA','GLOBAL_FALLBACK','gdelt_v2_events',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:NORTHERN_EUROPE:REGIONAL_PRIMARY:eurostat_sdmx_api','REGION','NORTHERN_EUROPE','REGIONAL_PRIMARY','eurostat_sdmx_api',10,true,'Zone-specific institutional source candidate.'),
('REGION:NORTHERN_EUROPE:REGIONAL_SECONDARY:nato_news','REGION','NORTHERN_EUROPE','REGIONAL_SECONDARY','nato_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:NORTHERN_EUROPE:GLOBAL_FALLBACK:ecb_press_rss','REGION','NORTHERN_EUROPE','GLOBAL_FALLBACK','ecb_press_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:WESTERN_EUROPE:REGIONAL_PRIMARY:eurostat_sdmx_api','REGION','WESTERN_EUROPE','REGIONAL_PRIMARY','eurostat_sdmx_api',10,true,'Zone-specific institutional source candidate.'),
('REGION:WESTERN_EUROPE:REGIONAL_SECONDARY:eu_council_press_rss','REGION','WESTERN_EUROPE','REGIONAL_SECONDARY','eu_council_press_rss',20,true,'Independent regional corroboration source candidate.'),
('REGION:WESTERN_EUROPE:GLOBAL_FALLBACK:ecb_press_rss','REGION','WESTERN_EUROPE','GLOBAL_FALLBACK','ecb_press_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:SOUTHERN_EUROPE:REGIONAL_PRIMARY:eurostat_sdmx_api','REGION','SOUTHERN_EUROPE','REGIONAL_PRIMARY','eurostat_sdmx_api',10,true,'Zone-specific institutional source candidate.'),
('REGION:SOUTHERN_EUROPE:REGIONAL_SECONDARY:nato_news','REGION','SOUTHERN_EUROPE','REGIONAL_SECONDARY','nato_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:SOUTHERN_EUROPE:GLOBAL_FALLBACK:ecb_press_rss','REGION','SOUTHERN_EUROPE','GLOBAL_FALLBACK','ecb_press_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:EASTERN_EUROPE:REGIONAL_PRIMARY:nato_news','REGION','EASTERN_EUROPE','REGIONAL_PRIMARY','nato_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:EASTERN_EUROPE:REGIONAL_SECONDARY:osce_news','REGION','EASTERN_EUROPE','REGIONAL_SECONDARY','osce_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:EASTERN_EUROPE:GLOBAL_FALLBACK:un_security_council_docs_rss','REGION','EASTERN_EUROPE','GLOBAL_FALLBACK','un_security_council_docs_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:BALKANS:REGIONAL_PRIMARY:osce_news','REGION','BALKANS','REGIONAL_PRIMARY','osce_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:BALKANS:REGIONAL_SECONDARY:nato_news','REGION','BALKANS','REGIONAL_SECONDARY','nato_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:BALKANS:GLOBAL_FALLBACK:eu_council_press_rss','REGION','BALKANS','GLOBAL_FALLBACK','eu_council_press_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:RUSSIA_BELARUS:REGIONAL_PRIMARY:un_security_council_docs_rss','REGION','RUSSIA_BELARUS','REGIONAL_PRIMARY','un_security_council_docs_rss',10,true,'Zone-specific institutional source candidate.'),
('REGION:RUSSIA_BELARUS:REGIONAL_SECONDARY:gdelt_v2_events','REGION','RUSSIA_BELARUS','REGIONAL_SECONDARY','gdelt_v2_events',20,true,'Independent regional corroboration source candidate.'),
('REGION:RUSSIA_BELARUS:GLOBAL_FALLBACK:bis_rss_media_releases','REGION','RUSSIA_BELARUS','GLOBAL_FALLBACK','bis_rss_media_releases',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:CAUCASUS:REGIONAL_PRIMARY:traceca_intergovernmental','REGION','CAUCASUS','REGIONAL_PRIMARY','traceca_intergovernmental',10,true,'Zone-specific institutional source candidate.'),
('REGION:CAUCASUS:REGIONAL_SECONDARY:un_security_council_docs_rss','REGION','CAUCASUS','REGIONAL_SECONDARY','un_security_council_docs_rss',20,true,'Independent regional corroboration source candidate.'),
('REGION:CAUCASUS:GLOBAL_FALLBACK:carec_program_transport','REGION','CAUCASUS','GLOBAL_FALLBACK','carec_program_transport',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:CENTRAL_ASIA:REGIONAL_PRIMARY:carec_program_transport','REGION','CENTRAL_ASIA','REGIONAL_PRIMARY','carec_program_transport',10,true,'Zone-specific institutional source candidate.'),
('REGION:CENTRAL_ASIA:REGIONAL_SECONDARY:adb_data_library','REGION','CENTRAL_ASIA','REGIONAL_SECONDARY','adb_data_library',20,true,'Independent regional corroboration source candidate.'),
('REGION:CENTRAL_ASIA:GLOBAL_FALLBACK:traceca_intergovernmental','REGION','CENTRAL_ASIA','GLOBAL_FALLBACK','traceca_intergovernmental',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:MIDDLE_EAST:REGIONAL_PRIMARY:gcc_news','REGION','MIDDLE_EAST','REGIONAL_PRIMARY','gcc_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:MIDDLE_EAST:REGIONAL_SECONDARY:arab_league_news','REGION','MIDDLE_EAST','REGIONAL_SECONDARY','arab_league_news',20,true,'Independent regional corroboration source candidate.'),
('REGION:MIDDLE_EAST:GLOBAL_FALLBACK:who_emro_rss','REGION','MIDDLE_EAST','GLOBAL_FALLBACK','who_emro_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:NORTH_AFRICA:REGIONAL_PRIMARY:arab_league_news','REGION','NORTH_AFRICA','REGIONAL_PRIMARY','arab_league_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:NORTH_AFRICA:REGIONAL_SECONDARY:au_press_releases','REGION','NORTH_AFRICA','REGIONAL_SECONDARY','au_press_releases',20,true,'Independent regional corroboration source candidate.'),
('REGION:NORTH_AFRICA:GLOBAL_FALLBACK:un_security_council_docs_rss','REGION','NORTH_AFRICA','GLOBAL_FALLBACK','un_security_council_docs_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:WEST_AFRICA:REGIONAL_PRIMARY:ecowas_press_releases','REGION','WEST_AFRICA','REGIONAL_PRIMARY','ecowas_press_releases',10,true,'Zone-specific institutional source candidate.'),
('REGION:WEST_AFRICA:REGIONAL_SECONDARY:au_press_releases','REGION','WEST_AFRICA','REGIONAL_SECONDARY','au_press_releases',20,true,'Independent regional corroboration source candidate.'),
('REGION:WEST_AFRICA:GLOBAL_FALLBACK:afdb_press_releases','REGION','WEST_AFRICA','GLOBAL_FALLBACK','afdb_press_releases',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:CENTRAL_AFRICA:REGIONAL_PRIMARY:au_press_releases','REGION','CENTRAL_AFRICA','REGIONAL_PRIMARY','au_press_releases',10,true,'Zone-specific institutional source candidate.'),
('REGION:CENTRAL_AFRICA:REGIONAL_SECONDARY:afdb_press_releases','REGION','CENTRAL_AFRICA','REGIONAL_SECONDARY','afdb_press_releases',20,true,'Independent regional corroboration source candidate.'),
('REGION:CENTRAL_AFRICA:GLOBAL_FALLBACK:unhcr_global_public_api','REGION','CENTRAL_AFRICA','GLOBAL_FALLBACK','unhcr_global_public_api',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:EAST_AFRICA_HORN:REGIONAL_PRIMARY:igad_news','REGION','EAST_AFRICA_HORN','REGIONAL_PRIMARY','igad_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:EAST_AFRICA_HORN:REGIONAL_SECONDARY:eac_press_releases','REGION','EAST_AFRICA_HORN','REGIONAL_SECONDARY','eac_press_releases',20,true,'Independent regional corroboration source candidate.'),
('REGION:EAST_AFRICA_HORN:GLOBAL_FALLBACK:au_press_releases','REGION','EAST_AFRICA_HORN','GLOBAL_FALLBACK','au_press_releases',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:SOUTHERN_AFRICA:REGIONAL_PRIMARY:sadc_news','REGION','SOUTHERN_AFRICA','REGIONAL_PRIMARY','sadc_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:SOUTHERN_AFRICA:REGIONAL_SECONDARY:afdb_press_releases','REGION','SOUTHERN_AFRICA','REGIONAL_SECONDARY','afdb_press_releases',20,true,'Independent regional corroboration source candidate.'),
('REGION:SOUTHERN_AFRICA:GLOBAL_FALLBACK:au_press_releases','REGION','SOUTHERN_AFRICA','GLOBAL_FALLBACK','au_press_releases',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:SOUTH_ASIA:REGIONAL_PRIMARY:saarc_press_releases','REGION','SOUTH_ASIA','REGIONAL_PRIMARY','saarc_press_releases',10,true,'Zone-specific institutional source candidate.'),
('REGION:SOUTH_ASIA:REGIONAL_SECONDARY:adb_data_library','REGION','SOUTH_ASIA','REGIONAL_SECONDARY','adb_data_library',20,true,'Independent regional corroboration source candidate.'),
('REGION:SOUTH_ASIA:GLOBAL_FALLBACK:un_security_council_docs_rss','REGION','SOUTH_ASIA','GLOBAL_FALLBACK','un_security_council_docs_rss',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:SOUTHEAST_ASIA:REGIONAL_PRIMARY:asean_news_portal','REGION','SOUTHEAST_ASIA','REGIONAL_PRIMARY','asean_news_portal',10,true,'Zone-specific institutional source candidate.'),
('REGION:SOUTHEAST_ASIA:REGIONAL_SECONDARY:recaap_reports','REGION','SOUTHEAST_ASIA','REGIONAL_SECONDARY','recaap_reports',20,true,'Independent regional corroboration source candidate.'),
('REGION:SOUTHEAST_ASIA:GLOBAL_FALLBACK:adb_data_library','REGION','SOUTHEAST_ASIA','GLOBAL_FALLBACK','adb_data_library',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:EAST_ASIA:REGIONAL_PRIMARY:apec_press_room','REGION','EAST_ASIA','REGIONAL_PRIMARY','apec_press_room',10,true,'Zone-specific institutional source candidate.'),
('REGION:EAST_ASIA:REGIONAL_SECONDARY:adb_data_library','REGION','EAST_ASIA','REGIONAL_SECONDARY','adb_data_library',20,true,'Independent regional corroboration source candidate.'),
('REGION:EAST_ASIA:GLOBAL_FALLBACK:amro_news','REGION','EAST_ASIA','GLOBAL_FALLBACK','amro_news',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:AUSTRALIA_NEW_ZEALAND:REGIONAL_PRIMARY:oecd_sdmx_api','REGION','AUSTRALIA_NEW_ZEALAND','REGIONAL_PRIMARY','oecd_sdmx_api',10,true,'Zone-specific institutional source candidate.'),
('REGION:AUSTRALIA_NEW_ZEALAND:REGIONAL_SECONDARY:amsa_marine_safety_information','REGION','AUSTRALIA_NEW_ZEALAND','REGIONAL_SECONDARY','amsa_marine_safety_information',20,true,'Independent regional corroboration source candidate.'),
('REGION:AUSTRALIA_NEW_ZEALAND:GLOBAL_FALLBACK:adb_data_library','REGION','AUSTRALIA_NEW_ZEALAND','GLOBAL_FALLBACK','adb_data_library',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:PACIFIC_ISLANDS:REGIONAL_PRIMARY:pacific_islands_forum_news','REGION','PACIFIC_ISLANDS','REGIONAL_PRIMARY','pacific_islands_forum_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:PACIFIC_ISLANDS:REGIONAL_SECONDARY:adb_data_library','REGION','PACIFIC_ISLANDS','REGIONAL_SECONDARY','adb_data_library',20,true,'Independent regional corroboration source candidate.'),
('REGION:PACIFIC_ISLANDS:GLOBAL_FALLBACK:unhcr_global_public_api','REGION','PACIFIC_ISLANDS','GLOBAL_FALLBACK','unhcr_global_public_api',30,true,'Global fallback/corroboration path; not a regional primary.'),
('REGION:ARCTIC_ANTARCTIC:REGIONAL_PRIMARY:arctic_council_news','REGION','ARCTIC_ANTARCTIC','REGIONAL_PRIMARY','arctic_council_news',10,true,'Zone-specific institutional source candidate.'),
('REGION:ARCTIC_ANTARCTIC:REGIONAL_SECONDARY:antarctic_treaty_secretariat','REGION','ARCTIC_ANTARCTIC','REGIONAL_SECONDARY','antarctic_treaty_secretariat',20,true,'Independent regional corroboration source candidate.'),
('REGION:ARCTIC_ANTARCTIC:GLOBAL_FALLBACK:noaa_ncei_cdo_api','REGION','ARCTIC_ANTARCTIC','GLOBAL_FALLBACK','noaa_ncei_cdo_api',30,true,'Global fallback/corroboration path; not a regional primary.')
on conflict(scope_type,scope_code,source_role,source_id) do update set
 priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

-- 35 strategic corridors × 3 route paths.
insert into public.live_global_source_universe
(universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
values
('CORRIDOR:SUEZ_RED_SEA:ROUTE_PRIMARY:suez_canal_navigation','CORRIDOR','SUEZ_RED_SEA','ROUTE_PRIMARY','suez_canal_navigation',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:SUEZ_RED_SEA:ROUTE_SECONDARY:ukmto_maritime_security','CORRIDOR','SUEZ_RED_SEA','ROUTE_SECONDARY','ukmto_maritime_security',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:SUEZ_RED_SEA:ROUTE_FALLBACK:marad_msci_advisories','CORRIDOR','SUEZ_RED_SEA','ROUTE_FALLBACK','marad_msci_advisories',30,true,'Fallback/corroboration path.'),
('CORRIDOR:BAB_EL_MANDEB:ROUTE_PRIMARY:ukmto_maritime_security','CORRIDOR','BAB_EL_MANDEB','ROUTE_PRIMARY','ukmto_maritime_security',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:BAB_EL_MANDEB:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','BAB_EL_MANDEB','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:BAB_EL_MANDEB:ROUTE_FALLBACK:recaap_reports','CORRIDOR','BAB_EL_MANDEB','ROUTE_FALLBACK','recaap_reports',30,true,'Fallback/corroboration path.'),
('CORRIDOR:STRAIT_OF_HORMUZ:ROUTE_PRIMARY:marad_msci_advisories','CORRIDOR','STRAIT_OF_HORMUZ','ROUTE_PRIMARY','marad_msci_advisories',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:STRAIT_OF_HORMUZ:ROUTE_SECONDARY:ukmto_maritime_security','CORRIDOR','STRAIT_OF_HORMUZ','ROUTE_SECONDARY','ukmto_maritime_security',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:STRAIT_OF_HORMUZ:ROUTE_FALLBACK:eia_api_v2','CORRIDOR','STRAIT_OF_HORMUZ','ROUTE_FALLBACK','eia_api_v2',30,true,'Fallback/corroboration path.'),
('CORRIDOR:MALACCA_STRAIT:ROUTE_PRIMARY:recaap_reports','CORRIDOR','MALACCA_STRAIT','ROUTE_PRIMARY','recaap_reports',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:MALACCA_STRAIT:ROUTE_SECONDARY:asean_news_portal','CORRIDOR','MALACCA_STRAIT','ROUTE_SECONDARY','asean_news_portal',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:MALACCA_STRAIT:ROUTE_FALLBACK:indonesia_dg_sea_transport','CORRIDOR','MALACCA_STRAIT','ROUTE_FALLBACK','indonesia_dg_sea_transport',30,true,'Fallback/corroboration path.'),
('CORRIDOR:PANAMA_CANAL:ROUTE_PRIMARY:panama_canal_notices_to_shipping','CORRIDOR','PANAMA_CANAL','ROUTE_PRIMARY','panama_canal_notices_to_shipping',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:PANAMA_CANAL:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','PANAMA_CANAL','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:PANAMA_CANAL:ROUTE_FALLBACK:oas_press_releases','CORRIDOR','PANAMA_CANAL','ROUTE_FALLBACK','oas_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:BOSPHORUS_DARDANELLES:ROUTE_PRIMARY:turkish_straits_vts','CORRIDOR','BOSPHORUS_DARDANELLES','ROUTE_PRIMARY','turkish_straits_vts',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:BOSPHORUS_DARDANELLES:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','BOSPHORUS_DARDANELLES','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:BOSPHORUS_DARDANELLES:ROUTE_FALLBACK:emsa_maritime_safety','CORRIDOR','BOSPHORUS_DARDANELLES','ROUTE_FALLBACK','emsa_maritime_safety',30,true,'Fallback/corroboration path.'),
('CORRIDOR:GIBRALTAR_STRAIT:ROUTE_PRIMARY:gibraltar_port_authority','CORRIDOR','GIBRALTAR_STRAIT','ROUTE_PRIMARY','gibraltar_port_authority',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:GIBRALTAR_STRAIT:ROUTE_SECONDARY:emsa_maritime_safety','CORRIDOR','GIBRALTAR_STRAIT','ROUTE_SECONDARY','emsa_maritime_safety',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:GIBRALTAR_STRAIT:ROUTE_FALLBACK:marad_msci_advisories','CORRIDOR','GIBRALTAR_STRAIT','ROUTE_FALLBACK','marad_msci_advisories',30,true,'Fallback/corroboration path.'),
('CORRIDOR:CAPE_OF_GOOD_HOPE:ROUTE_PRIMARY:samsa_marine_safety','CORRIDOR','CAPE_OF_GOOD_HOPE','ROUTE_PRIMARY','samsa_marine_safety',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:CAPE_OF_GOOD_HOPE:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','CAPE_OF_GOOD_HOPE','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:CAPE_OF_GOOD_HOPE:ROUTE_FALLBACK:amsa_marine_safety_information','CORRIDOR','CAPE_OF_GOOD_HOPE','ROUTE_FALLBACK','amsa_marine_safety_information',30,true,'Fallback/corroboration path.'),
('CORRIDOR:NORTH_SEA_ENGLISH_CHANNEL:ROUTE_PRIMARY:emsa_maritime_safety','CORRIDOR','NORTH_SEA_ENGLISH_CHANNEL','ROUTE_PRIMARY','emsa_maritime_safety',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:NORTH_SEA_ENGLISH_CHANNEL:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','NORTH_SEA_ENGLISH_CHANNEL','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:NORTH_SEA_ENGLISH_CHANNEL:ROUTE_FALLBACK:ukmto_maritime_security','CORRIDOR','NORTH_SEA_ENGLISH_CHANNEL','ROUTE_FALLBACK','ukmto_maritime_security',30,true,'Fallback/corroboration path.'),
('CORRIDOR:LOMBOK_SUNDA_STRAITS:ROUTE_PRIMARY:indonesia_dg_sea_transport','CORRIDOR','LOMBOK_SUNDA_STRAITS','ROUTE_PRIMARY','indonesia_dg_sea_transport',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:LOMBOK_SUNDA_STRAITS:ROUTE_SECONDARY:recaap_reports','CORRIDOR','LOMBOK_SUNDA_STRAITS','ROUTE_SECONDARY','recaap_reports',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:LOMBOK_SUNDA_STRAITS:ROUTE_FALLBACK:asean_news_portal','CORRIDOR','LOMBOK_SUNDA_STRAITS','ROUTE_FALLBACK','asean_news_portal',30,true,'Fallback/corroboration path.'),
('CORRIDOR:TRANS_CASPIAN_MIDDLE:ROUTE_PRIMARY:traceca_intergovernmental','CORRIDOR','TRANS_CASPIAN_MIDDLE','ROUTE_PRIMARY','traceca_intergovernmental',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:TRANS_CASPIAN_MIDDLE:ROUTE_SECONDARY:carec_program_transport','CORRIDOR','TRANS_CASPIAN_MIDDLE','ROUTE_SECONDARY','carec_program_transport',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:TRANS_CASPIAN_MIDDLE:ROUTE_FALLBACK:gdelt_v2_events','CORRIDOR','TRANS_CASPIAN_MIDDLE','ROUTE_FALLBACK','gdelt_v2_events',30,true,'Fallback/corroboration path.'),
('CORRIDOR:CHINA_EUROPE_RAIL:ROUTE_PRIMARY:traceca_intergovernmental','CORRIDOR','CHINA_EUROPE_RAIL','ROUTE_PRIMARY','traceca_intergovernmental',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:CHINA_EUROPE_RAIL:ROUTE_SECONDARY:carec_program_transport','CORRIDOR','CHINA_EUROPE_RAIL','ROUTE_SECONDARY','carec_program_transport',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:CHINA_EUROPE_RAIL:ROUTE_FALLBACK:wto_trade_monitoring','CORRIDOR','CHINA_EUROPE_RAIL','ROUTE_FALLBACK','wto_trade_monitoring',30,true,'Fallback/corroboration path.'),
('CORRIDOR:NORTH_SOUTH_TRANSPORT:ROUTE_PRIMARY:traceca_intergovernmental','CORRIDOR','NORTH_SOUTH_TRANSPORT','ROUTE_PRIMARY','traceca_intergovernmental',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:NORTH_SOUTH_TRANSPORT:ROUTE_SECONDARY:carec_program_transport','CORRIDOR','NORTH_SOUTH_TRANSPORT','ROUTE_SECONDARY','carec_program_transport',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:NORTH_SOUTH_TRANSPORT:ROUTE_FALLBACK:gdelt_v2_events','CORRIDOR','NORTH_SOUTH_TRANSPORT','ROUTE_FALLBACK','gdelt_v2_events',30,true,'Fallback/corroboration path.'),
('CORRIDOR:INSTC:ROUTE_PRIMARY:instc_intergovernmental_route','CORRIDOR','INSTC','ROUTE_PRIMARY','instc_intergovernmental_route',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:INSTC:ROUTE_SECONDARY:traceca_intergovernmental','CORRIDOR','INSTC','ROUTE_SECONDARY','traceca_intergovernmental',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:INSTC:ROUTE_FALLBACK:carec_program_transport','CORRIDOR','INSTC','ROUTE_FALLBACK','carec_program_transport',30,true,'Fallback/corroboration path.'),
('CORRIDOR:IMEC:ROUTE_PRIMARY:india_ports_authority','CORRIDOR','IMEC','ROUTE_PRIMARY','india_ports_authority',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:IMEC:ROUTE_SECONDARY:gcc_news','CORRIDOR','IMEC','ROUTE_SECONDARY','gcc_news',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:IMEC:ROUTE_FALLBACK:eu_council_press_rss','CORRIDOR','IMEC','ROUTE_FALLBACK','eu_council_press_rss',30,true,'Fallback/corroboration path.'),
('CORRIDOR:CHINA_CENTRAL_ASIA_WEST_ASIA:ROUTE_PRIMARY:carec_program_transport','CORRIDOR','CHINA_CENTRAL_ASIA_WEST_ASIA','ROUTE_PRIMARY','carec_program_transport',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:CHINA_CENTRAL_ASIA_WEST_ASIA:ROUTE_SECONDARY:traceca_intergovernmental','CORRIDOR','CHINA_CENTRAL_ASIA_WEST_ASIA','ROUTE_SECONDARY','traceca_intergovernmental',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:CHINA_CENTRAL_ASIA_WEST_ASIA:ROUTE_FALLBACK:adb_data_library','CORRIDOR','CHINA_CENTRAL_ASIA_WEST_ASIA','ROUTE_FALLBACK','adb_data_library',30,true,'Fallback/corroboration path.'),
('CORRIDOR:LOBITO_CORRIDOR:ROUTE_PRIMARY:lobito_corridor_authority','CORRIDOR','LOBITO_CORRIDOR','ROUTE_PRIMARY','lobito_corridor_authority',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:LOBITO_CORRIDOR:ROUTE_SECONDARY:afdb_press_releases','CORRIDOR','LOBITO_CORRIDOR','ROUTE_SECONDARY','afdb_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:LOBITO_CORRIDOR:ROUTE_FALLBACK:au_press_releases','CORRIDOR','LOBITO_CORRIDOR','ROUTE_FALLBACK','au_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:LAPSSET:ROUTE_PRIMARY:lapsset_corridor_authority','CORRIDOR','LAPSSET','ROUTE_PRIMARY','lapsset_corridor_authority',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:LAPSSET:ROUTE_SECONDARY:eac_press_releases','CORRIDOR','LAPSSET','ROUTE_SECONDARY','eac_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:LAPSSET:ROUTE_FALLBACK:afdb_press_releases','CORRIDOR','LAPSSET','ROUTE_FALLBACK','afdb_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:NORTHERN_CORRIDOR_EAC:ROUTE_PRIMARY:northern_corridor_observatory','CORRIDOR','NORTHERN_CORRIDOR_EAC','ROUTE_PRIMARY','northern_corridor_observatory',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:NORTHERN_CORRIDOR_EAC:ROUTE_SECONDARY:eac_press_releases','CORRIDOR','NORTHERN_CORRIDOR_EAC','ROUTE_SECONDARY','eac_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:NORTHERN_CORRIDOR_EAC:ROUTE_FALLBACK:afdb_press_releases','CORRIDOR','NORTHERN_CORRIDOR_EAC','ROUTE_FALLBACK','afdb_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:CENTRAL_CORRIDOR_EAC:ROUTE_PRIMARY:central_corridor_authority','CORRIDOR','CENTRAL_CORRIDOR_EAC','ROUTE_PRIMARY','central_corridor_authority',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:CENTRAL_CORRIDOR_EAC:ROUTE_SECONDARY:eac_press_releases','CORRIDOR','CENTRAL_CORRIDOR_EAC','ROUTE_SECONDARY','eac_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:CENTRAL_CORRIDOR_EAC:ROUTE_FALLBACK:afdb_press_releases','CORRIDOR','CENTRAL_CORRIDOR_EAC','ROUTE_FALLBACK','afdb_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:MAPUTO_CORRIDOR:ROUTE_PRIMARY:sadc_news','CORRIDOR','MAPUTO_CORRIDOR','ROUTE_PRIMARY','sadc_news',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:MAPUTO_CORRIDOR:ROUTE_SECONDARY:afdb_press_releases','CORRIDOR','MAPUTO_CORRIDOR','ROUTE_SECONDARY','afdb_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:MAPUTO_CORRIDOR:ROUTE_FALLBACK:au_press_releases','CORRIDOR','MAPUTO_CORRIDOR','ROUTE_FALLBACK','au_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:NACALA_CORRIDOR:ROUTE_PRIMARY:sadc_news','CORRIDOR','NACALA_CORRIDOR','ROUTE_PRIMARY','sadc_news',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:NACALA_CORRIDOR:ROUTE_SECONDARY:afdb_press_releases','CORRIDOR','NACALA_CORRIDOR','ROUTE_SECONDARY','afdb_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:NACALA_CORRIDOR:ROUTE_FALLBACK:au_press_releases','CORRIDOR','NACALA_CORRIDOR','ROUTE_FALLBACK','au_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:WALVIS_BAY_CORRIDOR:ROUTE_PRIMARY:walvis_bay_corridor_group','CORRIDOR','WALVIS_BAY_CORRIDOR','ROUTE_PRIMARY','walvis_bay_corridor_group',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:WALVIS_BAY_CORRIDOR:ROUTE_SECONDARY:sadc_news','CORRIDOR','WALVIS_BAY_CORRIDOR','ROUTE_SECONDARY','sadc_news',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:WALVIS_BAY_CORRIDOR:ROUTE_FALLBACK:afdb_press_releases','CORRIDOR','WALVIS_BAY_CORRIDOR','ROUTE_FALLBACK','afdb_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:ABIDJAN_LAGOS:ROUTE_PRIMARY:ecowas_press_releases','CORRIDOR','ABIDJAN_LAGOS','ROUTE_PRIMARY','ecowas_press_releases',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:ABIDJAN_LAGOS:ROUTE_SECONDARY:afdb_press_releases','CORRIDOR','ABIDJAN_LAGOS','ROUTE_SECONDARY','afdb_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:ABIDJAN_LAGOS:ROUTE_FALLBACK:au_press_releases','CORRIDOR','ABIDJAN_LAGOS','ROUTE_FALLBACK','au_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:DAKAR_LAGOS:ROUTE_PRIMARY:ecowas_press_releases','CORRIDOR','DAKAR_LAGOS','ROUTE_PRIMARY','ecowas_press_releases',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:DAKAR_LAGOS:ROUTE_SECONDARY:afdb_press_releases','CORRIDOR','DAKAR_LAGOS','ROUTE_SECONDARY','afdb_press_releases',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:DAKAR_LAGOS:ROUTE_FALLBACK:au_press_releases','CORRIDOR','DAKAR_LAGOS','ROUTE_FALLBACK','au_press_releases',30,true,'Fallback/corroboration path.'),
('CORRIDOR:DRUZHBA:ROUTE_PRIMARY:eia_api_v2','CORRIDOR','DRUZHBA','ROUTE_PRIMARY','eia_api_v2',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:DRUZHBA:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','DRUZHBA','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:DRUZHBA:ROUTE_FALLBACK:gdelt_v2_events','CORRIDOR','DRUZHBA','ROUTE_FALLBACK','gdelt_v2_events',30,true,'Fallback/corroboration path.'),
('CORRIDOR:BAKU_TBILISI_CEYHAN:ROUTE_PRIMARY:southern_gas_corridor_cjsc','CORRIDOR','BAKU_TBILISI_CEYHAN','ROUTE_PRIMARY','southern_gas_corridor_cjsc',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:BAKU_TBILISI_CEYHAN:ROUTE_SECONDARY:eia_api_v2','CORRIDOR','BAKU_TBILISI_CEYHAN','ROUTE_SECONDARY','eia_api_v2',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:BAKU_TBILISI_CEYHAN:ROUTE_FALLBACK:traceca_intergovernmental','CORRIDOR','BAKU_TBILISI_CEYHAN','ROUTE_FALLBACK','traceca_intergovernmental',30,true,'Fallback/corroboration path.'),
('CORRIDOR:SOUTHERN_GAS_CORRIDOR:ROUTE_PRIMARY:southern_gas_corridor_cjsc','CORRIDOR','SOUTHERN_GAS_CORRIDOR','ROUTE_PRIMARY','southern_gas_corridor_cjsc',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:SOUTHERN_GAS_CORRIDOR:ROUTE_SECONDARY:eia_api_v2','CORRIDOR','SOUTHERN_GAS_CORRIDOR','ROUTE_SECONDARY','eia_api_v2',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:SOUTHERN_GAS_CORRIDOR:ROUTE_FALLBACK:traceca_intergovernmental','CORRIDOR','SOUTHERN_GAS_CORRIDOR','ROUTE_FALLBACK','traceca_intergovernmental',30,true,'Fallback/corroboration path.'),
('CORRIDOR:TANAP_TAP:ROUTE_PRIMARY:tanap_pipeline','CORRIDOR','TANAP_TAP','ROUTE_PRIMARY','tanap_pipeline',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:TANAP_TAP:ROUTE_SECONDARY:tap_pipeline','CORRIDOR','TANAP_TAP','ROUTE_SECONDARY','tap_pipeline',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:TANAP_TAP:ROUTE_FALLBACK:southern_gas_corridor_cjsc','CORRIDOR','TANAP_TAP','ROUTE_FALLBACK','southern_gas_corridor_cjsc',30,true,'Fallback/corroboration path.'),
('CORRIDOR:EAST_SIBERIA_PACIFIC:ROUTE_PRIMARY:eia_api_v2','CORRIDOR','EAST_SIBERIA_PACIFIC','ROUTE_PRIMARY','eia_api_v2',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:EAST_SIBERIA_PACIFIC:ROUTE_SECONDARY:gdelt_v2_events','CORRIDOR','EAST_SIBERIA_PACIFIC','ROUTE_SECONDARY','gdelt_v2_events',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:EAST_SIBERIA_PACIFIC:ROUTE_FALLBACK:marad_msci_advisories','CORRIDOR','EAST_SIBERIA_PACIFIC','ROUTE_FALLBACK','marad_msci_advisories',30,true,'Fallback/corroboration path.'),
('CORRIDOR:KIRKUK_CEYHAN:ROUTE_PRIMARY:eia_api_v2','CORRIDOR','KIRKUK_CEYHAN','ROUTE_PRIMARY','eia_api_v2',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:KIRKUK_CEYHAN:ROUTE_SECONDARY:marad_msci_advisories','CORRIDOR','KIRKUK_CEYHAN','ROUTE_SECONDARY','marad_msci_advisories',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:KIRKUK_CEYHAN:ROUTE_FALLBACK:gdelt_v2_events','CORRIDOR','KIRKUK_CEYHAN','ROUTE_FALLBACK','gdelt_v2_events',30,true,'Fallback/corroboration path.'),
('CORRIDOR:CPC_CASPIAN_PIPELINE:ROUTE_PRIMARY:cpc_pipeline','CORRIDOR','CPC_CASPIAN_PIPELINE','ROUTE_PRIMARY','cpc_pipeline',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:CPC_CASPIAN_PIPELINE:ROUTE_SECONDARY:eia_api_v2','CORRIDOR','CPC_CASPIAN_PIPELINE','ROUTE_SECONDARY','eia_api_v2',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:CPC_CASPIAN_PIPELINE:ROUTE_FALLBACK:traceca_intergovernmental','CORRIDOR','CPC_CASPIAN_PIPELINE','ROUTE_FALLBACK','traceca_intergovernmental',30,true,'Fallback/corroboration path.'),
('CORRIDOR:GLOBAL_TRANSATLANTIC_SUBSEA:ROUTE_PRIMARY:icpc_submarine_cables','CORRIDOR','GLOBAL_TRANSATLANTIC_SUBSEA','ROUTE_PRIMARY','icpc_submarine_cables',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:GLOBAL_TRANSATLANTIC_SUBSEA:ROUTE_SECONDARY:itu_telecom_infrastructure','CORRIDOR','GLOBAL_TRANSATLANTIC_SUBSEA','ROUTE_SECONDARY','itu_telecom_infrastructure',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:GLOBAL_TRANSATLANTIC_SUBSEA:ROUTE_FALLBACK:cisa_kev_catalog','CORRIDOR','GLOBAL_TRANSATLANTIC_SUBSEA','ROUTE_FALLBACK','cisa_kev_catalog',30,true,'Fallback/corroboration path.'),
('CORRIDOR:RED_SEA_SUBSEA:ROUTE_PRIMARY:icpc_submarine_cables','CORRIDOR','RED_SEA_SUBSEA','ROUTE_PRIMARY','icpc_submarine_cables',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:RED_SEA_SUBSEA:ROUTE_SECONDARY:itu_telecom_infrastructure','CORRIDOR','RED_SEA_SUBSEA','ROUTE_SECONDARY','itu_telecom_infrastructure',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:RED_SEA_SUBSEA:ROUTE_FALLBACK:ukmto_maritime_security','CORRIDOR','RED_SEA_SUBSEA','ROUTE_FALLBACK','ukmto_maritime_security',30,true,'Fallback/corroboration path.'),
('CORRIDOR:ASIA_EUROPE_SUBSEA:ROUTE_PRIMARY:icpc_submarine_cables','CORRIDOR','ASIA_EUROPE_SUBSEA','ROUTE_PRIMARY','icpc_submarine_cables',10,true,'Route-specific operational source candidate.'),
('CORRIDOR:ASIA_EUROPE_SUBSEA:ROUTE_SECONDARY:itu_telecom_infrastructure','CORRIDOR','ASIA_EUROPE_SUBSEA','ROUTE_SECONDARY','itu_telecom_infrastructure',20,true,'Independent route/corridor corroboration source candidate.'),
('CORRIDOR:ASIA_EUROPE_SUBSEA:ROUTE_FALLBACK:cisa_kev_catalog','CORRIDOR','ASIA_EUROPE_SUBSEA','ROUTE_FALLBACK','cisa_kev_catalog',30,true,'Fallback/corroboration path.')
on conflict(scope_type,scope_code,source_role,source_id) do update set
 priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

-- 36 global shock families × 3 detection paths.
insert into public.live_global_source_universe
(universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
values
('SHOCK:armed_conflict_escalation:SHOCK_PRIMARY:ucdp_candidate','SHOCK','armed_conflict_escalation','SHOCK_PRIMARY','ucdp_candidate',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:armed_conflict_escalation:SHOCK_SECONDARY:un_security_council_docs_rss','SHOCK','armed_conflict_escalation','SHOCK_SECONDARY','un_security_council_docs_rss',20,true,'Independent corroboration path.'),
('SHOCK:armed_conflict_escalation:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','armed_conflict_escalation','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:ceasefire_deescalation:SHOCK_PRIMARY:un_security_council_docs_rss','SHOCK','ceasefire_deescalation','SHOCK_PRIMARY','un_security_council_docs_rss',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:ceasefire_deescalation:SHOCK_SECONDARY:ucdp_candidate','SHOCK','ceasefire_deescalation','SHOCK_SECONDARY','ucdp_candidate',20,true,'Independent corroboration path.'),
('SHOCK:ceasefire_deescalation:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','ceasefire_deescalation','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:sanctions_embargoes_export_controls:SHOCK_PRIMARY:ofac_sanctions_program','SHOCK','sanctions_embargoes_export_controls','SHOCK_PRIMARY','ofac_sanctions_program',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:sanctions_embargoes_export_controls:SHOCK_SECONDARY:un_security_council_docs_rss','SHOCK','sanctions_embargoes_export_controls','SHOCK_SECONDARY','un_security_council_docs_rss',20,true,'Independent corroboration path.'),
('SHOCK:sanctions_embargoes_export_controls:SHOCK_FALLBACK:wto_trade_monitoring','SHOCK','sanctions_embargoes_export_controls','SHOCK_FALLBACK','wto_trade_monitoring',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:tariffs_trade_restrictions:SHOCK_PRIMARY:wto_trade_monitoring','SHOCK','tariffs_trade_restrictions','SHOCK_PRIMARY','wto_trade_monitoring',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:tariffs_trade_restrictions:SHOCK_SECONDARY:un_all_documents_rss','SHOCK','tariffs_trade_restrictions','SHOCK_SECONDARY','un_all_documents_rss',20,true,'Independent corroboration path.'),
('SHOCK:tariffs_trade_restrictions:SHOCK_FALLBACK:eu_council_press_rss','SHOCK','tariffs_trade_restrictions','SHOCK_FALLBACK','eu_council_press_rss',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:election_government_transition:SHOCK_PRIMARY:gdelt_v2_events','SHOCK','election_government_transition','SHOCK_PRIMARY','gdelt_v2_events',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:election_government_transition:SHOCK_SECONDARY:un_all_documents_rss','SHOCK','election_government_transition','SHOCK_SECONDARY','un_all_documents_rss',20,true,'Independent corroboration path.'),
('SHOCK:election_government_transition:SHOCK_FALLBACK:oas_press_releases','SHOCK','election_government_transition','SHOCK_FALLBACK','oas_press_releases',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:coup_civil_unrest:SHOCK_PRIMARY:gdelt_v2_events','SHOCK','coup_civil_unrest','SHOCK_PRIMARY','gdelt_v2_events',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:coup_civil_unrest:SHOCK_SECONDARY:ucdp_candidate','SHOCK','coup_civil_unrest','SHOCK_SECONDARY','ucdp_candidate',20,true,'Independent corroboration path.'),
('SHOCK:coup_civil_unrest:SHOCK_FALLBACK:reliefweb_reports_api','SHOCK','coup_civil_unrest','SHOCK_FALLBACK','reliefweb_reports_api',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:monetary_policy_rate_shock:SHOCK_PRIMARY:imf_data_api','SHOCK','monetary_policy_rate_shock','SHOCK_PRIMARY','imf_data_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:monetary_policy_rate_shock:SHOCK_SECONDARY:bis_rss_central_banker_speeches','SHOCK','monetary_policy_rate_shock','SHOCK_SECONDARY','bis_rss_central_banker_speeches',20,true,'Independent corroboration path.'),
('SHOCK:monetary_policy_rate_shock:SHOCK_FALLBACK:ecb_press_rss','SHOCK','monetary_policy_rate_shock','SHOCK_FALLBACK','ecb_press_rss',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:inflation_growth_employment_shock:SHOCK_PRIMARY:world_bank_indicators','SHOCK','inflation_growth_employment_shock','SHOCK_PRIMARY','world_bank_indicators',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:inflation_growth_employment_shock:SHOCK_SECONDARY:imf_data_api','SHOCK','inflation_growth_employment_shock','SHOCK_SECONDARY','imf_data_api',20,true,'Independent corroboration path.'),
('SHOCK:inflation_growth_employment_shock:SHOCK_FALLBACK:oecd_sdmx_api','SHOCK','inflation_growth_employment_shock','SHOCK_FALLBACK','oecd_sdmx_api',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:fx_reserve_external_balance_stress:SHOCK_PRIMARY:imf_data_api','SHOCK','fx_reserve_external_balance_stress','SHOCK_PRIMARY','imf_data_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:fx_reserve_external_balance_stress:SHOCK_SECONDARY:world_bank_indicators','SHOCK','fx_reserve_external_balance_stress','SHOCK_SECONDARY','world_bank_indicators',20,true,'Independent corroboration path.'),
('SHOCK:fx_reserve_external_balance_stress:SHOCK_FALLBACK:bis_rss_media_releases','SHOCK','fx_reserve_external_balance_stress','SHOCK_FALLBACK','bis_rss_media_releases',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:sovereign_debt_fiscal_shock:SHOCK_PRIMARY:world_bank_qpsd','SHOCK','sovereign_debt_fiscal_shock','SHOCK_PRIMARY','world_bank_qpsd',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:sovereign_debt_fiscal_shock:SHOCK_SECONDARY:imf_data_api','SHOCK','sovereign_debt_fiscal_shock','SHOCK_SECONDARY','imf_data_api',20,true,'Independent corroboration path.'),
('SHOCK:sovereign_debt_fiscal_shock:SHOCK_FALLBACK:bis_statistics','SHOCK','sovereign_debt_fiscal_shock','SHOCK_FALLBACK','bis_statistics',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:banking_liquidity_contagion:SHOCK_PRIMARY:bis_payment_systems_data','SHOCK','banking_liquidity_contagion','SHOCK_PRIMARY','bis_payment_systems_data',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:banking_liquidity_contagion:SHOCK_SECONDARY:bis_rss_media_releases','SHOCK','banking_liquidity_contagion','SHOCK_SECONDARY','bis_rss_media_releases',20,true,'Independent corroboration path.'),
('SHOCK:banking_liquidity_contagion:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','banking_liquidity_contagion','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:payments_settlement_disruption:SHOCK_PRIMARY:bis_payment_systems_data','SHOCK','payments_settlement_disruption','SHOCK_PRIMARY','bis_payment_systems_data',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:payments_settlement_disruption:SHOCK_SECONDARY:bis_rss_media_releases','SHOCK','payments_settlement_disruption','SHOCK_SECONDARY','bis_rss_media_releases',20,true,'Independent corroboration path.'),
('SHOCK:payments_settlement_disruption:SHOCK_FALLBACK:wto_trade_monitoring','SHOCK','payments_settlement_disruption','SHOCK_FALLBACK','wto_trade_monitoring',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:energy_oil_gas_disruption:SHOCK_PRIMARY:eia_api_v2','SHOCK','energy_oil_gas_disruption','SHOCK_PRIMARY','eia_api_v2',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:energy_oil_gas_disruption:SHOCK_SECONDARY:world_bank_indicators','SHOCK','energy_oil_gas_disruption','SHOCK_SECONDARY','world_bank_indicators',20,true,'Independent corroboration path.'),
('SHOCK:energy_oil_gas_disruption:SHOCK_FALLBACK:southern_gas_corridor_cjsc','SHOCK','energy_oil_gas_disruption','SHOCK_FALLBACK','southern_gas_corridor_cjsc',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:electricity_grid_disruption:SHOCK_PRIMARY:eia_api_v2','SHOCK','electricity_grid_disruption','SHOCK_PRIMARY','eia_api_v2',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:electricity_grid_disruption:SHOCK_SECONDARY:gdacs_global_events_api','SHOCK','electricity_grid_disruption','SHOCK_SECONDARY','gdacs_global_events_api',20,true,'Independent corroboration path.'),
('SHOCK:electricity_grid_disruption:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','electricity_grid_disruption','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:food_agriculture_fertilizer_shock:SHOCK_PRIMARY:faostat_api','SHOCK','food_agriculture_fertilizer_shock','SHOCK_PRIMARY','faostat_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:food_agriculture_fertilizer_shock:SHOCK_SECONDARY:world_bank_indicators','SHOCK','food_agriculture_fertilizer_shock','SHOCK_SECONDARY','world_bank_indicators',20,true,'Independent corroboration path.'),
('SHOCK:food_agriculture_fertilizer_shock:SHOCK_FALLBACK:adb_data_library','SHOCK','food_agriculture_fertilizer_shock','SHOCK_FALLBACK','adb_data_library',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:critical_minerals_rare_earth_disruption:SHOCK_PRIMARY:usgs_mcs','SHOCK','critical_minerals_rare_earth_disruption','SHOCK_PRIMARY','usgs_mcs',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:critical_minerals_rare_earth_disruption:SHOCK_SECONDARY:unctad_critical_minerals_data','SHOCK','critical_minerals_rare_earth_disruption','SHOCK_SECONDARY','unctad_critical_minerals_data',20,true,'Independent corroboration path.'),
('SHOCK:critical_minerals_rare_earth_disruption:SHOCK_FALLBACK:oecd_critical_raw_materials_restrictions','SHOCK','critical_minerals_rare_earth_disruption','SHOCK_FALLBACK','oecd_critical_raw_materials_restrictions',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:shipping_chokepoint_disruption:SHOCK_PRIMARY:ukmto_maritime_security','SHOCK','shipping_chokepoint_disruption','SHOCK_PRIMARY','ukmto_maritime_security',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:shipping_chokepoint_disruption:SHOCK_SECONDARY:marad_msci_advisories','SHOCK','shipping_chokepoint_disruption','SHOCK_SECONDARY','marad_msci_advisories',20,true,'Independent corroboration path.'),
('SHOCK:shipping_chokepoint_disruption:SHOCK_FALLBACK:recaap_reports','SHOCK','shipping_chokepoint_disruption','SHOCK_FALLBACK','recaap_reports',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:supply_chain_logistics_disruption:SHOCK_PRIMARY:un_comtrade_api','SHOCK','supply_chain_logistics_disruption','SHOCK_PRIMARY','un_comtrade_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:supply_chain_logistics_disruption:SHOCK_SECONDARY:wto_trade_monitoring','SHOCK','supply_chain_logistics_disruption','SHOCK_SECONDARY','wto_trade_monitoring',20,true,'Independent corroboration path.'),
('SHOCK:supply_chain_logistics_disruption:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','supply_chain_logistics_disruption','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:border_customs_transit_disruption:SHOCK_PRIMARY:wto_trade_monitoring','SHOCK','border_customs_transit_disruption','SHOCK_PRIMARY','wto_trade_monitoring',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:border_customs_transit_disruption:SHOCK_SECONDARY:ecowas_press_releases','SHOCK','border_customs_transit_disruption','SHOCK_SECONDARY','ecowas_press_releases',20,true,'Independent corroboration path.'),
('SHOCK:border_customs_transit_disruption:SHOCK_FALLBACK:eac_press_releases','SHOCK','border_customs_transit_disruption','SHOCK_FALLBACK','eac_press_releases',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:natural_hazard_physical_disruption:SHOCK_PRIMARY:gdacs_global_events_api','SHOCK','natural_hazard_physical_disruption','SHOCK_PRIMARY','gdacs_global_events_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:natural_hazard_physical_disruption:SHOCK_SECONDARY:noaa_ncei_cdo_api','SHOCK','natural_hazard_physical_disruption','SHOCK_SECONDARY','noaa_ncei_cdo_api',20,true,'Independent corroboration path.'),
('SHOCK:natural_hazard_physical_disruption:SHOCK_FALLBACK:nasa_firms_modis_nrt','SHOCK','natural_hazard_physical_disruption','SHOCK_FALLBACK','nasa_firms_modis_nrt',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:climate_water_heat_stress:SHOCK_PRIMARY:noaa_ncei_cdo_api','SHOCK','climate_water_heat_stress','SHOCK_PRIMARY','noaa_ncei_cdo_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:climate_water_heat_stress:SHOCK_SECONDARY:gdacs_global_events_api','SHOCK','climate_water_heat_stress','SHOCK_SECONDARY','gdacs_global_events_api',20,true,'Independent corroboration path.'),
('SHOCK:climate_water_heat_stress:SHOCK_FALLBACK:nasa_firms_modis_nrt','SHOCK','climate_water_heat_stress','SHOCK_FALLBACK','nasa_firms_modis_nrt',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:public_health_emergency:SHOCK_PRIMARY:who_gho_odata','SHOCK','public_health_emergency','SHOCK_PRIMARY','who_gho_odata',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:public_health_emergency:SHOCK_SECONDARY:reliefweb_reports_api','SHOCK','public_health_emergency','SHOCK_SECONDARY','reliefweb_reports_api',20,true,'Independent corroboration path.'),
('SHOCK:public_health_emergency:SHOCK_FALLBACK:who_emro_rss','SHOCK','public_health_emergency','SHOCK_FALLBACK','who_emro_rss',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:migration_displacement_shock:SHOCK_PRIMARY:unhcr_global_public_api','SHOCK','migration_displacement_shock','SHOCK_PRIMARY','unhcr_global_public_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:migration_displacement_shock:SHOCK_SECONDARY:reliefweb_reports_api','SHOCK','migration_displacement_shock','SHOCK_SECONDARY','reliefweb_reports_api',20,true,'Independent corroboration path.'),
('SHOCK:migration_displacement_shock:SHOCK_FALLBACK:iom_dtm_api','SHOCK','migration_displacement_shock','SHOCK_FALLBACK','iom_dtm_api',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:labor_strike_workforce_disruption:SHOCK_PRIMARY:ilostat_sdmx_api','SHOCK','labor_strike_workforce_disruption','SHOCK_PRIMARY','ilostat_sdmx_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:labor_strike_workforce_disruption:SHOCK_SECONDARY:oecd_sdmx_api','SHOCK','labor_strike_workforce_disruption','SHOCK_SECONDARY','oecd_sdmx_api',20,true,'Independent corroboration path.'),
('SHOCK:labor_strike_workforce_disruption:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','labor_strike_workforce_disruption','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:cyber_systemic_attack:SHOCK_PRIMARY:cisa_kev_catalog','SHOCK','cyber_systemic_attack','SHOCK_PRIMARY','cisa_kev_catalog',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:cyber_systemic_attack:SHOCK_SECONDARY:itu_telecom_infrastructure','SHOCK','cyber_systemic_attack','SHOCK_SECONDARY','itu_telecom_infrastructure',20,true,'Independent corroboration path.'),
('SHOCK:cyber_systemic_attack:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','cyber_systemic_attack','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:telecom_internet_shutdown:SHOCK_PRIMARY:itu_telecom_infrastructure','SHOCK','telecom_internet_shutdown','SHOCK_PRIMARY','itu_telecom_infrastructure',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:telecom_internet_shutdown:SHOCK_SECONDARY:gdelt_v2_events','SHOCK','telecom_internet_shutdown','SHOCK_SECONDARY','gdelt_v2_events',20,true,'Independent corroboration path.'),
('SHOCK:telecom_internet_shutdown:SHOCK_FALLBACK:cisa_kev_catalog','SHOCK','telecom_internet_shutdown','SHOCK_FALLBACK','cisa_kev_catalog',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:submarine_cable_gnss_navigation_disruption:SHOCK_PRIMARY:icpc_submarine_cables','SHOCK','submarine_cable_gnss_navigation_disruption','SHOCK_PRIMARY','icpc_submarine_cables',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:submarine_cable_gnss_navigation_disruption:SHOCK_SECONDARY:itu_telecom_infrastructure','SHOCK','submarine_cable_gnss_navigation_disruption','SHOCK_SECONDARY','itu_telecom_infrastructure',20,true,'Independent corroboration path.'),
('SHOCK:submarine_cable_gnss_navigation_disruption:SHOCK_FALLBACK:marad_msci_advisories','SHOCK','submarine_cable_gnss_navigation_disruption','SHOCK_FALLBACK','marad_msci_advisories',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:regulatory_legal_policy_shock:SHOCK_PRIMARY:wto_trade_monitoring','SHOCK','regulatory_legal_policy_shock','SHOCK_PRIMARY','wto_trade_monitoring',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:regulatory_legal_policy_shock:SHOCK_SECONDARY:un_all_documents_rss','SHOCK','regulatory_legal_policy_shock','SHOCK_SECONDARY','un_all_documents_rss',20,true,'Independent corroboration path.'),
('SHOCK:regulatory_legal_policy_shock:SHOCK_FALLBACK:eu_council_press_rss','SHOCK','regulatory_legal_policy_shock','SHOCK_FALLBACK','eu_council_press_rss',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:information_influence_disinformation_shock:SHOCK_PRIMARY:gdelt_v2_events','SHOCK','information_influence_disinformation_shock','SHOCK_PRIMARY','gdelt_v2_events',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:information_influence_disinformation_shock:SHOCK_SECONDARY:un_all_documents_rss','SHOCK','information_influence_disinformation_shock','SHOCK_SECONDARY','un_all_documents_rss',20,true,'Independent corroboration path.'),
('SHOCK:information_influence_disinformation_shock:SHOCK_FALLBACK:osce_news','SHOCK','information_influence_disinformation_shock','SHOCK_FALLBACK','osce_news',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:insurance_market_withdrawal_war_risk:SHOCK_PRIMARY:gdelt_v2_events','SHOCK','insurance_market_withdrawal_war_risk','SHOCK_PRIMARY','gdelt_v2_events',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:insurance_market_withdrawal_war_risk:SHOCK_SECONDARY:reliefweb_reports_api','SHOCK','insurance_market_withdrawal_war_risk','SHOCK_SECONDARY','reliefweb_reports_api',20,true,'Independent corroboration path.'),
('SHOCK:insurance_market_withdrawal_war_risk:SHOCK_FALLBACK:marad_msci_advisories','SHOCK','insurance_market_withdrawal_war_risk','SHOCK_FALLBACK','marad_msci_advisories',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:expropriation_nationalization_shock:SHOCK_PRIMARY:gdelt_v2_events','SHOCK','expropriation_nationalization_shock','SHOCK_PRIMARY','gdelt_v2_events',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:expropriation_nationalization_shock:SHOCK_SECONDARY:un_all_documents_rss','SHOCK','expropriation_nationalization_shock','SHOCK_SECONDARY','un_all_documents_rss',20,true,'Independent corroboration path.'),
('SHOCK:expropriation_nationalization_shock:SHOCK_FALLBACK:wto_trade_monitoring','SHOCK','expropriation_nationalization_shock','SHOCK_FALLBACK','wto_trade_monitoring',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:investment_screening_restriction:SHOCK_PRIMARY:wto_trade_monitoring','SHOCK','investment_screening_restriction','SHOCK_PRIMARY','wto_trade_monitoring',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:investment_screening_restriction:SHOCK_SECONDARY:eu_council_press_rss','SHOCK','investment_screening_restriction','SHOCK_SECONDARY','eu_council_press_rss',20,true,'Independent corroboration path.'),
('SHOCK:investment_screening_restriction:SHOCK_FALLBACK:oecd_sdmx_api','SHOCK','investment_screening_restriction','SHOCK_FALLBACK','oecd_sdmx_api',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:technology_semiconductor_export_control_shock:SHOCK_PRIMARY:wto_trade_monitoring','SHOCK','technology_semiconductor_export_control_shock','SHOCK_PRIMARY','wto_trade_monitoring',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:technology_semiconductor_export_control_shock:SHOCK_SECONDARY:cisa_kev_catalog','SHOCK','technology_semiconductor_export_control_shock','SHOCK_SECONDARY','cisa_kev_catalog',20,true,'Independent corroboration path.'),
('SHOCK:technology_semiconductor_export_control_shock:SHOCK_FALLBACK:nato_news','SHOCK','technology_semiconductor_export_control_shock','SHOCK_FALLBACK','nato_news',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:capital_controls_convertibility_shock:SHOCK_PRIMARY:imf_data_api','SHOCK','capital_controls_convertibility_shock','SHOCK_PRIMARY','imf_data_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:capital_controls_convertibility_shock:SHOCK_SECONDARY:bis_rss_media_releases','SHOCK','capital_controls_convertibility_shock','SHOCK_SECONDARY','bis_rss_media_releases',20,true,'Independent corroboration path.'),
('SHOCK:capital_controls_convertibility_shock:SHOCK_FALLBACK:world_bank_indicators','SHOCK','capital_controls_convertibility_shock','SHOCK_FALLBACK','world_bank_indicators',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:rare_material_long_tail_supply_shock:SHOCK_PRIMARY:usgs_mcs','SHOCK','rare_material_long_tail_supply_shock','SHOCK_PRIMARY','usgs_mcs',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:rare_material_long_tail_supply_shock:SHOCK_SECONDARY:unctad_critical_minerals_data','SHOCK','rare_material_long_tail_supply_shock','SHOCK_SECONDARY','unctad_critical_minerals_data',20,true,'Independent corroboration path.'),
('SHOCK:rare_material_long_tail_supply_shock:SHOCK_FALLBACK:oecd_critical_raw_materials_restrictions','SHOCK','rare_material_long_tail_supply_shock','SHOCK_FALLBACK','oecd_critical_raw_materials_restrictions',30,true,'Fallback specialist/global corroboration path.'),
('SHOCK:trade_corridor_disruption:SHOCK_PRIMARY:un_comtrade_api','SHOCK','trade_corridor_disruption','SHOCK_PRIMARY','un_comtrade_api',10,true,'Primary shock detection path from governed taxonomy.'),
('SHOCK:trade_corridor_disruption:SHOCK_SECONDARY:traceca_intergovernmental','SHOCK','trade_corridor_disruption','SHOCK_SECONDARY','traceca_intergovernmental',20,true,'Independent corroboration path.'),
('SHOCK:trade_corridor_disruption:SHOCK_FALLBACK:gdelt_v2_events','SHOCK','trade_corridor_disruption','SHOCK_FALLBACK','gdelt_v2_events',30,true,'Fallback specialist/global corroboration path.')
on conflict(scope_type,scope_code,source_role,source_id) do update set
 priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

alter table public.live_global_source_universe enable row level security;
revoke all on public.live_global_source_universe from public,anon,authenticated;
grant select,insert,update on public.live_global_source_universe to service_role;

-- Keep the inventory synchronized for future enabled country additions.
create or replace function public.sync_live_global_country_source_universe()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.enabled then
    insert into public.live_global_source_universe
    (universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
    select 'COUNTRY:'||new.iso3||':'||'GLOBAL_GOVERNANCE_PRIMARY'||':'||'world_bank_wgi_political_stability','COUNTRY',new.iso3,'GLOBAL_GOVERNANCE_PRIMARY','world_bank_wgi_political_stability',10,true,'International structural governance baseline; not a national direct endpoint.'
union all
select 'COUNTRY:'||new.iso3||':'||'GLOBAL_GOVERNANCE_EVENT'||':'||'un_security_council_docs_rss','COUNTRY',new.iso3,'GLOBAL_GOVERNANCE_EVENT','un_security_council_docs_rss',20,true,'Official multilateral event/document path.'
union all
select 'COUNTRY:'||new.iso3||':'||'GLOBAL_MACRO_PRIMARY'||':'||'world_bank_indicators','COUNTRY',new.iso3,'GLOBAL_MACRO_PRIMARY','world_bank_indicators',10,true,'Global country-level macro baseline.'
union all
select 'COUNTRY:'||new.iso3||':'||'GLOBAL_MACRO_SECONDARY'||':'||'imf_sdmx_central','COUNTRY',new.iso3,'GLOBAL_MACRO_SECONDARY','imf_sdmx_central',20,true,'Global macro/statistical cross-check.'
union all
select 'COUNTRY:'||new.iso3||':'||'GLOBAL_FISCAL'||':'||'world_bank_qpsd','COUNTRY',new.iso3,'GLOBAL_FISCAL','world_bank_qpsd',30,true,'Sovereign/fiscal structural path where covered.'
union all
select 'COUNTRY:'||new.iso3||':'||'FINANCIAL_SYSTEM'||':'||'bis_statistics','COUNTRY',new.iso3,'FINANCIAL_SYSTEM','bis_statistics',20,true,'Global banking/financial-system structural path.'
union all
select 'COUNTRY:'||new.iso3||':'||'FINANCIAL_EVENTS'||':'||'bis_rss_media_releases','COUNTRY',new.iso3,'FINANCIAL_EVENTS','bis_rss_media_releases',30,true,'Current financial-system event path.'
union all
select 'COUNTRY:'||new.iso3||':'||'SECURITY_PRIMARY'||':'||'ucdp_candidate','COUNTRY',new.iso3,'SECURITY_PRIMARY','ucdp_candidate',10,true,'Current organized-violence evidence path where available.'
union all
select 'COUNTRY:'||new.iso3||':'||'SECURITY_EVENT'||':'||'gdelt_v2_events','COUNTRY',new.iso3,'SECURITY_EVENT','gdelt_v2_events',20,true,'Global current-event discovery/corroboration.'
union all
select 'COUNTRY:'||new.iso3||':'||'TRADE_POLICY'||':'||'wto_trade_monitoring','COUNTRY',new.iso3,'TRADE_POLICY','wto_trade_monitoring',20,true,'Official trade-policy path.'
union all
select 'COUNTRY:'||new.iso3||':'||'HUMANITARIAN'||':'||'unhcr_global_public_api','COUNTRY',new.iso3,'HUMANITARIAN','unhcr_global_public_api',30,true,'Displacement/emergency source path.'
union all
select 'COUNTRY:'||new.iso3||':'||'HUMANITARIAN_SECONDARY'||':'||'reliefweb_reports_api','COUNTRY',new.iso3,'HUMANITARIAN_SECONDARY','reliefweb_reports_api',40,true,'Humanitarian reporting/corroboration path.'
union all
select 'COUNTRY:'||new.iso3||':'||'HEALTH'||':'||'who_gho_odata','COUNTRY',new.iso3,'HEALTH','who_gho_odata',30,true,'Public-health structural/event source.'
union all
select 'COUNTRY:'||new.iso3||':'||'LABOR'||':'||'ilostat_sdmx_api','COUNTRY',new.iso3,'LABOR','ilostat_sdmx_api',30,true,'Labour-market structural source.'
union all
select 'COUNTRY:'||new.iso3||':'||'HAZARD_ALERTS'||':'||'gdacs_global_events_api','COUNTRY',new.iso3,'HAZARD_ALERTS','gdacs_global_events_api',20,true,'Global near-real-time disaster alerts.'
union all
select 'COUNTRY:'||new.iso3||':'||'CLIMATE_HISTORY'||':'||'noaa_ncei_cdo_api','COUNTRY',new.iso3,'CLIMATE_HISTORY','noaa_ncei_cdo_api',40,true,'Climate/hazard historical observations.'
union all
select 'COUNTRY:'||new.iso3||':'||'MINERALS'||':'||'usgs_mcs','COUNTRY',new.iso3,'MINERALS','usgs_mcs',20,true,'Mineral production/resource baseline.'
union all
select 'COUNTRY:'||new.iso3||':'||'MINERALS_TRADE'||':'||'unctad_critical_minerals_data','COUNTRY',new.iso3,'MINERALS_TRADE','unctad_critical_minerals_data',30,true,'Critical-mineral trade baseline.'
union all
select 'COUNTRY:'||new.iso3||':'||'MINERALS_POLICY'||':'||'oecd_critical_raw_materials_restrictions','COUNTRY',new.iso3,'MINERALS_POLICY','oecd_critical_raw_materials_restrictions',40,true,'Export-restriction policy source.'
union all
select 'COUNTRY:'||new.iso3||':'||'AUTHORITY_DISCOVERY_IMF'||':'||'imf_sdmx_central','COUNTRY',new.iso3,'AUTHORITY_DISCOVERY_IMF','imf_sdmx_central',80,true,'Authority/dissemination discovery layer; not a direct national source.'
union all
select 'COUNTRY:'||new.iso3||':'||'AUTHORITY_DISCOVERY_BIS'||':'||'bis_statistics','COUNTRY',new.iso3,'AUTHORITY_DISCOVERY_BIS','bis_statistics',90,true,'Central-bank/financial authority discovery layer; not a direct national source.'
    on conflict(scope_type,scope_code,source_role,source_id) do update set
      priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_live_global_country_source_universe on public.live_country_registry;
create trigger trg_sync_live_global_country_source_universe
after insert or update of enabled on public.live_country_registry
for each row execute function public.sync_live_global_country_source_universe();

-- Structural source-universe status. This is NOT certification.
create or replace view public.live_global_source_universe_status
with (security_invoker=true)
as
with
countries as (
  select count(*)::bigint n from public.live_country_registry where enabled
),
regions as (
  select count(*)::bigint n from public.live_region_zone_catalog
),
corridors as (
  select count(*)::bigint n from public.live_strategic_corridor_catalog
),
shocks as (
  select count(*)::bigint n from public.live_global_shock_taxonomy where required
),
country_rows as (
  select count(*)::bigint n from public.live_global_source_universe where scope_type='COUNTRY'
),
region_rows as (
  select count(*)::bigint n from public.live_global_source_universe where scope_type='REGION'
),
corridor_rows as (
  select count(*)::bigint n from public.live_global_source_universe where scope_type='CORRIDOR'
),
shock_rows as (
  select count(*)::bigint n from public.live_global_source_universe where scope_type='SHOCK'
),
country_min as (
  select count(*)::bigint n from (
    select scope_code from public.live_global_source_universe
    where scope_type='COUNTRY'
    group by scope_code
    having count(*) >= 21
  ) x
),
region_min as (
  select count(*)::bigint n from (
    select scope_code from public.live_global_source_universe
    where scope_type='REGION'
    group by scope_code
    having count(*) >= 3
  ) x
),
corridor_min as (
  select count(*)::bigint n from (
    select scope_code from public.live_global_source_universe
    where scope_type='CORRIDOR'
    group by scope_code
    having count(*) >= 3
  ) x
),
shock_min as (
  select count(*)::bigint n from (
    select scope_code from public.live_global_source_universe
    where scope_type='SHOCK'
    group by scope_code
    having count(*) >= 3
  ) x
)
select
 now() evaluated_at,
 countries.n country_count,
 21::bigint country_sources_per_subject,
 country_rows.n actual_country_source_rows,
 countries.n*21::bigint expected_country_source_rows,
 country_min.n countries_meeting_minimum,
 regions.n region_count,
 region_rows.n actual_region_source_rows,
 regions.n*3 expected_region_source_rows,
 region_min.n regions_meeting_minimum,
 corridors.n corridor_count,
 corridor_rows.n actual_corridor_source_rows,
 corridors.n*3 expected_corridor_source_rows,
 corridor_min.n corridors_meeting_minimum,
 shocks.n shock_count,
 shock_rows.n actual_shock_source_rows,
 shocks.n*3 expected_shock_source_rows,
 shock_min.n shocks_meeting_minimum,
 (
   countries.n>0
   and country_rows.n=countries.n*21
   and country_min.n=countries.n
   and regions.n=24
   and region_rows.n=regions.n*3
   and region_min.n=regions.n
   and corridors.n=35
   and corridor_rows.n=corridors.n*3
   and corridor_min.n=corridors.n
   and shocks.n=36
   and shock_rows.n=shocks.n*3
   and shock_min.n=shocks.n
 ) as source_universe_complete,
 false as certification_gate_open;

comment on view public.live_global_source_universe_status is
 'Internal source-universe inventory completeness only. All source certification, rights, endpoint, schema, freshness and commercial activation remain separately locked.';

commit;
