create or replace view public.live_country_category_coverage_matrix
with (security_invoker=true)
as
with category_contract(domain, source_category, required_source_id, target_prefix, max_age_seconds) as (
  values
    ('geopolitics'::text, 'GEOPOLITICS'::text, 'gdelt_v2_events'::text, 'GEO:COVERAGE_FALLBACK:'::text, 7200::bigint),
    ('macro'::text, 'MACRO'::text, 'world_bank_indicators'::text, 'MACRO:COVERAGE_FALLBACK:'::text, 86400::bigint),
    ('rare_earth'::text, 'CRITICAL_MINERALS'::text, 'usgs_mcs'::text, 'MINERALS:COVERAGE_FALLBACK:'::text, 86400::bigint)
),
matrix as (
  select r.iso2, r.iso3, r.country_name, c.domain, c.source_category, c.required_source_id, c.target_prefix, c.max_age_seconds
  from public.live_country_registry r
  cross join category_contract c
  where r.enabled = true
),
rolled as (
  select
    m.iso2,m.iso3,m.country_name,m.domain,m.source_category,m.max_age_seconds,
    count(t.target_id)::bigint as enabled_target_count,
    max(t.last_success_at) as latest_success_at,
    count(t.target_id) filter (
      where t.last_success_at is not null
        and t.last_success_at >= now() - make_interval(secs => m.max_age_seconds::double precision)
    )::bigint as fresh_target_count,
    count(t.target_id) filter (
      where t.last_success_at is not null
        and t.last_success_at >= now() - make_interval(secs => m.max_age_seconds::double precision)
        and exists (
          select 1
          from public.live_source_certification_records cert
          join public.live_external_sources source on source.source_id = cert.source_id
          where cert.source_id = t.source_id
            and cert.certification_state = 'CERTIFIED'
            and cert.endpoint_status = 'PASS'
            and cert.rights_status in ('COMMERCIAL_OK','DERIVED_ONLY')
            and cert.schema_status in ('PASS','NOT_APPLICABLE')
            and cert.freshness_status in ('FRESH','VARIABLE','NOT_APPLICABLE')
            and cert.provenance_status in ('PASS','NOT_APPLICABLE')
            and cert.independence_status in ('PASS','NOT_APPLICABLE')
            and cert.adapter_status in ('TESTED','NOT_APPLICABLE')
            and cert.runtime_status in ('PASS','NOT_APPLICABLE')
            and cert.fallback_status in ('READY','NOT_REQUIRED')
            and cert.certified_at is not null
            and cert.certification_hash is not null
            and source.enabled_for_ingestion = true
            and source.enabled_for_commercial_signals = true
        )
    )::bigint as certified_fresh_runtime_path_count,
    count(t.target_id) filter (
      where exists (
          select 1
          from public.live_source_certification_records cert
          join public.live_external_sources source on source.source_id = cert.source_id
          where cert.source_id = t.source_id
            and cert.certification_state = 'CERTIFIED'
            and cert.endpoint_status = 'PASS'
            and cert.rights_status in ('COMMERCIAL_OK','DERIVED_ONLY')
            and cert.schema_status in ('PASS','NOT_APPLICABLE')
            and cert.freshness_status in ('FRESH','VARIABLE','NOT_APPLICABLE')
            and cert.provenance_status in ('PASS','NOT_APPLICABLE')
            and cert.independence_status in ('PASS','NOT_APPLICABLE')
            and cert.adapter_status in ('TESTED','NOT_APPLICABLE')
            and cert.runtime_status in ('PASS','NOT_APPLICABLE')
            and cert.fallback_status in ('READY','NOT_REQUIRED')
            and cert.certified_at is not null
            and cert.certification_hash is not null
            and source.enabled_for_ingestion = true
            and source.enabled_for_commercial_signals = true
        )
    )::bigint as certified_fallback_path_count
  from matrix m
  left join public.live_raw_source_targets t
    on t.country_iso3 = m.iso3
   and t.category = m.source_category
   and t.enabled = true
   and t.transport = 'GLOBAL_FALLBACK'
   and t.source_id = m.required_source_id
   and t.target_id = m.target_prefix || m.iso3
  group by m.iso2,m.iso3,m.country_name,m.domain,m.source_category,m.max_age_seconds
),
classified as (
  select rolled.*,
    (fresh_target_count > 0) as raw_runtime_fresh,
    (fresh_target_count > 0 and certified_fresh_runtime_path_count > 0) as production_ready
  from rolled
)
select
  iso2,iso3,country_name,domain,source_category,max_age_seconds,
  enabled_target_count,latest_success_at,fresh_target_count,
  certified_fresh_runtime_path_count,certified_fallback_path_count,
  raw_runtime_fresh,production_ready,
  (not production_ready and certified_fallback_path_count > 0) as realtime_fallback_eligible,
  case
    when production_ready then 'READY'
    when certified_fallback_path_count > 0 then 'FALLBACK_ELIGIBLE'
    when enabled_target_count = 0 then 'MISSING_TARGET'
    when latest_success_at is null then 'MISSING_RUNTIME_EVIDENCE'
    when not raw_runtime_fresh then 'STALE_RUNTIME_EVIDENCE'
    else 'UNCERTIFIED_RUNTIME'
  end::text as availability_state,
  case
    when production_ready then null
    when certified_fallback_path_count > 0 then 'PRIMARY_RUNTIME_NOT_READY_CERTIFIED_FALLBACK_AVAILABLE'
    when enabled_target_count = 0 then 'NO_ENABLED_TARGET'
    when latest_success_at is null then 'NO_SUCCESSFUL_RUNTIME_OBSERVATION'
    when not raw_runtime_fresh then 'LATEST_RUNTIME_OBSERVATION_STALE'
    else 'NO_CERTIFIED_FRESH_RUNTIME_PATH'
  end::text as missing_reason
from classified;

comment on view public.live_country_category_coverage_matrix is
  'Phase A canonical country/area x three-domain matrix. READY is bound to the exact certified commercial launch source for each domain. GDELT runtime evidence uses the existing two-hour current-evidence bound; World Bank and USGS use the existing 24-hour verified certification window without rewriting the underlying source-data date.';

grant select on public.live_country_category_coverage_matrix to service_role;
