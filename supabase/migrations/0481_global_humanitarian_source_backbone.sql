begin;

insert into public.live_external_sources
(source_id,source_name,provider_name,category,access_type,authentication_type,base_url,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes)
values
('unhcr_global_public_api','UNHCR Global Public API','UNHCR','GEOPOLITICS','API','NONE','https://www.unhcr.org/what-we-do/reports-and-publications/data-and-statistics/global-public-api','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official UNHCR API. JSON access to UNHCR datasets; use for displacement/operational risk signals.'),
('unhcr_operational_data_portal','UNHCR Operational Data Portal','UNHCR','GEOPOLITICS','HTML','NONE','https://data.unhcr.org/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official emergency operational portal; country and regional situation products.'),
('unhcr_core_emergencies','UNHCR CORE Emergency Data','UNHCR','GEOPOLITICS','HTML','NONE','https://core.unhcr.org/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official CORE emergency publication surface with continuously updated emergency products.')
on conflict(source_id) do update set
base_url=excluded.base_url,enabled_for_ingestion=excluded.enabled_for_ingestion,
country_scope=excluded.country_scope,freshness_class=excluded.freshness_class,notes=excluded.notes,updated_at=now();

insert into public.live_source_coverage_targets
(coverage_id,category,scope_type,scope_code,source_class,required,minimum_independent_paths,status,primary_source_id,fallback_source_id,notes)
values ('geo-unhcr-global','GEOPOLITICS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY',true,2,'PARTIAL','unhcr_global_public_api','gdelt_v2','Global displacement/emergency primary path; collector certification required.')
on conflict(category,scope_type,scope_code,source_class) do update set
required=excluded.required,minimum_independent_paths=excluded.minimum_independent_paths,status=excluded.status,
primary_source_id=excluded.primary_source_id,fallback_source_id=excluded.fallback_source_id,notes=excluded.notes,updated_at=now();

insert into public.live_source_coverage_targets
(coverage_id,category,scope_type,scope_code,source_class,required,minimum_independent_paths,status,primary_source_id,fallback_source_id,notes)
values ('geo-unhcr-emergency','GEOPOLITICS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY',true,2,'PARTIAL','unhcr_core_emergencies','unhcr_operational_data_portal','Emergency situation publication path; disabled until machine extraction contract is certified.')
on conflict(category,scope_type,scope_code,source_class) do update set
required=excluded.required,minimum_independent_paths=excluded.minimum_independent_paths,status=excluded.status,
primary_source_id=excluded.primary_source_id,fallback_source_id=excluded.fallback_source_id,notes=excluded.notes,updated_at=now();

alter table public.live_external_sources enable row level security;
alter table public.live_source_coverage_targets enable row level security;
commit;
