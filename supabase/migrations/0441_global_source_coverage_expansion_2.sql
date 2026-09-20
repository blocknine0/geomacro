begin;

update public.live_external_sources
set base_url='https://www.ungeneva.org/news-media/meeting-summaries-list/rss.xml',
    updated_at=now(),
    notes='Official UN Geneva meeting-summary RSS path from the current UN Geneva RSS catalogue. Detection/provenance only.'
where source_id='un_geneva_meeting_summaries_rss';

insert into public.live_external_sources (
source_id,source_name,provider_name,category,access_type,authentication_type,base_url,
licence_name,commercial_usage_status,raw_redistribution_allowed,attribution_required,
enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes)
values
('reliefweb_reports_api','ReliefWeb Reports API v2','United Nations Office for the Coordination of Humanitarian Affairs','GEOPOLITICS','API','APP_NAME','https://api.reliefweb.int/v2/reports',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','OCHA ReliefWeb public read API. Requires a pre-approved appname; disabled until approved and collector-configured.'),
('imf_sdmx_central','IMF SDMX Central','International Monetary Fund','MACRO','API','NONE','https://sdmxcentral.imf.org/sdmx/v2/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','PERIODIC','Official IMF SDMX Central web service for structures and data.'),
('imf_data_api','IMF Data API','International Monetary Fund','MACRO','API','NONE','https://data.imf.org/en/Resource-Pages/IMF-API',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','PERIODIC','Official IMF Data API entry point; dataset-level collector contract required.'),
('eurostat_sdmx_api','Eurostat SDMX API','Eurostat','MACRO','API','NONE','https://ec.europa.eu/eurostat/api/dissemination/sdmx/3.0/',null,'COMMERCIAL_OK',false,true,false,false,'EUROPE','PERIODIC','Official Eurostat SDMX 3.0 REST API.'),
('ilostat_sdmx_api','ILOSTAT SDMX API','International Labour Organization','MACRO','API','NONE','https://webapps.ilo.org/ilostat-files/Documents/SDMX_User_Guide.pdf',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','PERIODIC','Official ILOSTAT SDMX interface documentation; dataset endpoint selection remains governed.'),
('who_emro_rss','WHO Eastern Mediterranean RSS','World Health Organization Regional Office for the Eastern Mediterranean','GEOPOLITICS','RSS','NONE','https://www.emro.who.int/rss-feeds.html',null,'REVIEW_REQUIRED',false,true,false,false,'EMRO','NEAR_REAL_TIME','Official WHO EMRO RSS catalogue; exact feed URL requires certification before enablement.'),
('osce_news_rss_candidate','OSCE News RSS Candidate','Organization for Security and Co-operation in Europe','GEOPOLITICS','RSS','NONE','https://www.osce.org/rssnews/',null,'REVIEW_REQUIRED',false,true,false,false,'EUROPE','NEAR_REAL_TIME','OSCE documents RSS availability but legacy endpoint currently returns 404; disabled candidate.'),
('oas_council_rss_candidate','OAS Council RSS Candidate','Organization of American States','GEOPOLITICS','RSS','NONE','https://www.oas.org/en/council/RSS/',null,'REVIEW_REQUIRED',false,true,false,false,'AMERICAS','NEAR_REAL_TIME','Official OAS RSS catalogue; exact feed endpoints require revalidation and certification.')
on conflict(source_id) do update set
source_name=excluded.source_name,provider_name=excluded.provider_name,category=excluded.category,
access_type=excluded.access_type,authentication_type=excluded.authentication_type,base_url=excluded.base_url,
licence_name=excluded.licence_name,commercial_usage_status=excluded.commercial_usage_status,
raw_redistribution_allowed=excluded.raw_redistribution_allowed,attribution_required=excluded.attribution_required,
enabled_for_ingestion=excluded.enabled_for_ingestion,enabled_for_commercial_signals=excluded.enabled_for_commercial_signals,
country_scope=excluded.country_scope,freshness_class=excluded.freshness_class,notes=excluded.notes,updated_at=now();

insert into public.live_source_coverage_targets
(coverage_id,category,scope_type,scope_code,source_class,required,minimum_independent_paths,status,primary_source_id,fallback_source_id,notes)
values
('geo-humanitarian-global','GEOPOLITICS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY',true,2,'PARTIAL','reliefweb_reports_api','gdelt_v2','OCHA/ReliefWeb humanitarian disruption path; API approval required.'),
('geo-europe-osce','GEOPOLITICS','REGION','EUROPE','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','osce_news_rss_candidate','gdelt_v2','OSCE endpoint requires revalidation.'),
('geo-americas-oas','GEOPOLITICS','REGION','AMERICAS','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','oas_council_rss_candidate','gdelt_v2','OAS catalogue verified; exact feed endpoints pending certification.'),
('geo-emro-health-disruption','GEOPOLITICS','REGION','EMRO','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','who_emro_rss','gdelt_v2','WHO EMRO catalogue verified; exact feed certification pending.'),
('macro-imf-global','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','imf_sdmx_central','world_bank_indicators','IMF SDMX global macro path.'),
('macro-ilo-global','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','ilostat_sdmx_api','world_bank_indicators','ILOSTAT global labour-market path.'),
('macro-eu-eurostat','MACRO','REGION','EUROPE','STRUCTURED_DATA',true,2,'PARTIAL','eurostat_sdmx_api','ecb_press_rss','Eurostat machine-readable regional macro path.')
on conflict(category,scope_type,scope_code,source_class) do update set
required=excluded.required,minimum_independent_paths=excluded.minimum_independent_paths,status=excluded.status,
primary_source_id=excluded.primary_source_id,fallback_source_id=excluded.fallback_source_id,notes=excluded.notes,updated_at=now();

alter table public.live_source_coverage_targets enable row level security;
alter table public.live_external_sources enable row level security;
commit;
