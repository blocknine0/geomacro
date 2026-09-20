begin;

insert into public.live_external_sources
(source_id,source_name,provider_name,category,access_type,authentication_type,base_url,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes)
values
('un_comtrade_api','UN Comtrade API','United Nations Statistics Division','MACRO','API','SUBSCRIPTION_OPTIONAL','https://comtradeapi.un.org/public/v1/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','PERIODIC','Official UN Comtrade trade API. Preview endpoints are available without a key; full API access has subscription tiers. Use for bilateral trade and critical-mineral trade exposure.'),
('faostat_api','FAOSTAT API','Food and Agriculture Organization of the United Nations','MACRO','API','NONE','https://www.fao.org/faostat/en/#data','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','PERIODIC','Official FAOSTAT programmatic access. Covers 245+ countries and territories and food/agriculture datasets; dedicated collector contract required.'),
('eia_api_v2','EIA API v2','U.S. Energy Information Administration','MACRO','API','API_KEY','https://api.eia.gov/v2/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official EIA API v2. API key required. High-value energy supply, inventories, production and trade signals.'),
('oecd_sdmx_api','OECD SDMX REST API','Organisation for Economic Co-operation and Development','MACRO','API','NONE','https://sdmx.oecd.org/public/rest/v1/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','PERIODIC','Official OECD SDMX REST API for programmatic Data Explorer access.'),
('bis_rss_media_releases','BIS Media Releases RSS','Bank for International Settlements','MACRO','RSS','NONE','https://www.bis.org/doclist/all_pressrels.rss','REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Official BIS media-release feed.'),
('bis_rss_central_banker_speeches','BIS Central Bankers Speeches RSS','Bank for International Settlements','MACRO','RSS','NONE','https://www.bis.org/doclist/cbspeeches.rss','REVIEW_REQUIRED',false,true,true,false,'GLOBAL','NEAR_REAL_TIME','Official BIS central-bank speech feed.')
on conflict(source_id) do update set
base_url=excluded.base_url,enabled_for_ingestion=excluded.enabled_for_ingestion,
country_scope=excluded.country_scope,freshness_class=excluded.freshness_class,notes=excluded.notes,updated_at=now();

insert into public.live_source_coverage_targets
(coverage_id,category,scope_type,scope_code,source_class,required,minimum_independent_paths,status,primary_source_id,fallback_source_id,notes)
values
('macro-uncomtrade-global','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','un_comtrade_api','world_bank_indicators','Global trade-flow path; useful for country/corridor exposure and mineral trade.'),
('macro-faostat-global','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','faostat_api','world_bank_indicators','Food/agriculture and commodity-supply macro path.'),
('macro-energy-global','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','eia_api_v2','world_bank_indicators','Energy market path; API key required and collector not yet enabled.'),
('macro-oecd-global','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','oecd_sdmx_api','world_bank_indicators','OECD independent macro/statistical path.')
on conflict(category,scope_type,scope_code,source_class) do update set
required=excluded.required,minimum_independent_paths=excluded.minimum_independent_paths,status=excluded.status,
primary_source_id=excluded.primary_source_id,fallback_source_id=excluded.fallback_source_id,notes=excluded.notes,updated_at=now();

alter table public.live_external_sources enable row level security;
alter table public.live_source_coverage_targets enable row level security;
commit;
