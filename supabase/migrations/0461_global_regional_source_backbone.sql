begin;

insert into public.live_external_sources
(source_id,source_name,provider_name,category,access_type,authentication_type,base_url,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes)
values
('african_union_news_rss','African Union News RSS','African Union','GEOPOLITICS','RSS','NONE','https://au.int/en/happening/rss','REVIEW_REQUIRED',false,true,false,false,'AFRICA','NEAR_REAL_TIME','Official AU news RSS surface verified by the AU RSS/news pages; kept disabled until the exact machine-feed response is certified in the production collector.'),
('nato_rss_catalog','NATO RSS Catalogue','North Atlantic Treaty Organization','GEOPOLITICS','HTML','NONE','https://www.nato.int/cps/en/natohq/RSS.htm','REVIEW_REQUIRED',false,true,false,false,'EUROPE','NEAR_REAL_TIME','Official NATO RSS catalogue page. Current published catalogue URL is not directly machine-fetchable in this environment; disabled until collector certification.'),
('asean_news_portal','ASEAN Secretariat News Portal','Association of Southeast Asian Nations','GEOPOLITICS','HTML','NONE','https://asean.org/news/','REVIEW_REQUIRED',false,true,false,false,'SOUTHEAST_ASIA','NEAR_REAL_TIME','Official ASEAN Secretariat news portal with political-security and economic categories; disabled until stable machine feed/API endpoint is certified.'),
('oas_permanent_council_rss','OAS Permanent Council RSS Catalogue','Organization of American States','GEOPOLITICS','HTML','NONE','https://oas.org/en/council/RSS/','REVIEW_REQUIRED',false,true,false,false,'AMERICAS','NEAR_REAL_TIME','Official OAS RSS catalogue exposes feeds for General Assembly, Permanent Council and committees; individual XML endpoints require certification before enablement.')
on conflict(source_id) do update set
base_url=excluded.base_url,enabled_for_ingestion=excluded.enabled_for_ingestion,
country_scope=excluded.country_scope,freshness_class=excluded.freshness_class,notes=excluded.notes,updated_at=now();

insert into public.live_source_coverage_targets
(coverage_id,category,scope_type,scope_code,source_class,required,minimum_independent_paths,status,primary_source_id,fallback_source_id,notes)
values
('geo-africa-au','GEOPOLITICS','REGION','AFRICA','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','african_union_news_rss','gdelt_v2','AU regional primary path pending machine-feed certification.'),
('geo-nato-europe','GEOPOLITICS','REGION','EUROPE','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','nato_rss_catalog','gdelt_v2','NATO official RSS catalogue requires collector certification.'),
('geo-asean-seasia','GEOPOLITICS','REGION','SOUTHEAST_ASIA','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','asean_news_portal','gdelt_v2','ASEAN official news portal requires machine-feed/API certification.'),
('geo-oas-americas','GEOPOLITICS','REGION','AMERICAS','REGIONAL_PRIMARY',true,2,'REVIEW_REQUIRED','oas_permanent_council_rss','gdelt_v2','OAS RSS catalogue verified; XML feed endpoints require certification.')
on conflict(category,scope_type,scope_code,source_class) do update set
required=excluded.required,minimum_independent_paths=excluded.minimum_independent_paths,status=excluded.status,
primary_source_id=excluded.primary_source_id,fallback_source_id=excluded.fallback_source_id,notes=excluded.notes,updated_at=now();

alter table public.live_external_sources enable row level security;
alter table public.live_source_coverage_targets enable row level security;
commit;
