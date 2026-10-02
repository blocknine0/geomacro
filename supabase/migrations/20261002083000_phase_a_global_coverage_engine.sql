-- Geomacro Phase A: registry-driven three-domain global coverage engine.
--
-- Corrects the historical hard-coded country denominator in migration 967
-- without modifying migration history. The canonical matrix is generated from
-- every enabled live_country_registry row crossed with exactly three public
-- intelligence domains. Missing/stale/uncertified coverage remains fail-closed.
-- This migration does not certify sources, expose raw provider details, enable
-- payment, or authorize execution.

begin;

create or replace view public.live_country_category_coverage_matrix
with (security_invoker=true)
as
with category_contract(domain, source_category, max_age_seconds) as (
  values
    ('geopolitics'::text, 'GEOPOLITICS'::text, 1800::bigint),
    ('macro'::text, 'MACRO'::text, 7200::bigint),
    ('rare_earth'::text, 'CRITICAL_MINERALS'::text, 14400::bigint)
),
matrix as (
  select
    r.iso2,
    r.iso3,
    r.country_name,
    c.domain,
    c.source_category,
    c.max_age_seconds
  from public.live_country_registry r
  cross join category_contract c
  where r.enabled = true
),
rolled as (
  select
    m.iso2,
    m.iso3,
    m.country_name,
    m.domain,
    m.source_category,
    m.max_age_seconds,
    count(t.target_id)::bigint as enabled_target_count,
    max(t.last_success_at) as latest_success_at,
    count(t.target_id) filter (
      where t.last_success_at is not null
        and t.last_success_at >= now() - make_interval(secs => m.max_age_seconds::double precision)
    )::bigint as fresh_target_count,
    count(t.target_id) filter (
      where t.source_id is not null
        and t.last_success_at is not null
        and t.last_success_at >= now() - make_interval(secs => m.max_age_seconds::double precision)
        and exists (
          select 1
          from public.live_source_certification_records cert
          join public.live_external_sources source
            on source.source_id = cert.source_id
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
        )
    )::bigint as certified_fresh_runtime_path_count,
    count(t.target_id) filter (
      where t.transport = 'GLOBAL_FALLBACK'
        and t.source_id is not null
        and exists (
          select 1
          from public.live_source_certification_records cert
          join public.live_external_sources source
            on source.source_id = cert.source_id
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
        )
    )::bigint as certified_fallback_path_count
  from matrix m
  left join public.live_raw_source_targets t
    on t.country_iso3 = m.iso3
   and t.category = m.source_category
   and t.enabled = true
  group by
    m.iso2,
    m.iso3,
    m.country_name,
    m.domain,
    m.source_category,
    m.max_age_seconds
),
classified as (
  select
    rolled.*,
    (fresh_target_count > 0) as raw_runtime_fresh,
    (
      fresh_target_count > 0
      and certified_fresh_runtime_path_count > 0
    ) as production_ready
  from rolled
)
select
  iso2,
  iso3,
  country_name,
  domain,
  source_category,
  max_age_seconds,
  enabled_target_count,
  latest_success_at,
  fresh_target_count,
  certified_fresh_runtime_path_count,
  certified_fallback_path_count,
  raw_runtime_fresh,
  production_ready,
  (
    not production_ready
    and certified_fallback_path_count > 0
  ) as realtime_fallback_eligible,
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
  'Phase A canonical country/area x three-domain matrix. Domains are geopolitics, macro and rare_earth; raw source category names remain backward-compatible. READY requires fresh raw runtime plus a fully certified runtime path. Missing, stale or uncertified evidence fails closed with an explicit reason. Certified fallback eligibility is explicit and never implies READY.';

revoke all on public.live_country_category_coverage_matrix from public, anon, authenticated;
grant select on public.live_country_category_coverage_matrix to service_role;

create or replace view public.live_country_category_coverage_matrix_status
with (security_invoker=true)
as
with registry as (
  select count(*)::bigint as enabled_country_count
  from public.live_country_registry
  where enabled = true
),
matrix as (
  select * from public.live_country_category_coverage_matrix
),
summary as (
  select
    count(*)::bigint as actual_matrix_rows,
    count(distinct domain)::bigint as actual_domain_count,
    count(*) filter (where production_ready)::bigint as production_ready_rows,
    count(*) filter (where realtime_fallback_eligible)::bigint as fallback_eligible_rows,
    count(*) filter (where not production_ready and missing_reason is null)::bigint as nonready_rows_missing_reason,
    count(*) filter (where domain not in ('geopolitics','macro','rare_earth'))::bigint as unknown_domain_rows,
    count(*) filter (where production_ready and certified_fresh_runtime_path_count < 1)::bigint as invalid_ready_rows,
    count(*) filter (
      where realtime_fallback_eligible
        and (production_ready or certified_fallback_path_count < 1)
    )::bigint as invalid_fallback_rows,
    count(*) - count(distinct iso3 || ':' || domain)::bigint as duplicate_matrix_rows
  from matrix
)
select
  now() as evaluated_at,
  registry.enabled_country_count,
  3::bigint as required_domain_count,
  (registry.enabled_country_count * 3)::bigint as expected_matrix_rows,
  summary.actual_matrix_rows,
  summary.actual_domain_count,
  summary.production_ready_rows,
  summary.fallback_eligible_rows,
  (summary.actual_matrix_rows - summary.production_ready_rows)::bigint as unavailable_rows,
  summary.nonready_rows_missing_reason,
  summary.unknown_domain_rows,
  summary.invalid_ready_rows,
  summary.invalid_fallback_rows,
  summary.duplicate_matrix_rows,
  (
    registry.enabled_country_count > 0
    and summary.actual_domain_count = 3
    and summary.actual_matrix_rows = registry.enabled_country_count * 3
    and summary.nonready_rows_missing_reason = 0
    and summary.unknown_domain_rows = 0
    and summary.invalid_ready_rows = 0
    and summary.invalid_fallback_rows = 0
    and summary.duplicate_matrix_rows = 0
  ) as matrix_contract_complete
from registry
cross join summary;

comment on view public.live_country_category_coverage_matrix_status is
  'Phase A invariant gate. Expected cardinality is always the current enabled canonical registry count multiplied by exactly three domains; no country denominator is hard-coded.';

revoke all on public.live_country_category_coverage_matrix_status from public, anon, authenticated;
grant select on public.live_country_category_coverage_matrix_status to service_role;

-- Backward-compatible operational status view with a dynamic registry-driven
-- denominator. Raw-runtime freshness is intentionally distinct from certified
-- production readiness in the Phase A matrix.
create or replace view public.live_raw_source_runtime_100_status
with (security_invoker=true)
as
with country_status as (
  select
    iso3,
    bool_and(raw_runtime_fresh) as complete
  from public.live_country_category_coverage_matrix
  group by iso3
),
registry as (
  select count(*)::bigint as enabled_country_count
  from public.live_country_registry
  where enabled = true
)
select
  now() as evaluated_at,
  registry.enabled_country_count as enabled_countries,
  count(*) filter (where country_status.complete)::bigint as countries_with_fresh_raw_runtime,
  (
    registry.enabled_country_count > 0
    and count(*) = registry.enabled_country_count
    and count(*) filter (where country_status.complete) = registry.enabled_country_count
  ) as raw_runtime_100_complete
from registry
left join country_status on true
group by registry.enabled_country_count;

comment on view public.live_raw_source_runtime_100_status is
  'Operational raw-runtime gate with a dynamic live_country_registry denominator. Every enabled canonical registry row must have recent raw runtime in all three Phase A domains. Certified production readiness is separately fail-closed in live_country_category_coverage_matrix.';

-- Preserve the historical raw-target coverage contract (13 minimum targets per
-- enabled canonical registry row) while removing the hard-coded country count.
create or replace view public.live_raw_source_coverage_100_status
with (security_invoker=true)
as
with registry as (
  select count(*)::bigint as enabled_country_count
  from public.live_country_registry
  where enabled = true
),
per_country as (
  select
    r.iso3,
    count(*) filter (where t.category = 'GEOPOLITICS')::bigint as geopolitics_targets,
    count(*) filter (where t.category = 'MACRO')::bigint as macro_targets,
    count(*) filter (where t.category = 'CRITICAL_MINERALS')::bigint as critical_minerals_targets
  from public.live_country_registry r
  left join public.live_raw_source_targets t
    on t.country_iso3 = r.iso3
   and t.enabled = true
  where r.enabled = true
  group by r.iso3
),
targets as (
  select count(*)::bigint as actual_target_rows
  from public.live_raw_source_targets
  where enabled = true
)
select
  now() as evaluated_at,
  registry.enabled_country_count,
  (registry.enabled_country_count * 13)::bigint as expected_target_rows,
  targets.actual_target_rows,
  count(*) filter (where per_country.geopolitics_targets > 0)::bigint as countries_with_geopolitics,
  count(*) filter (where per_country.macro_targets > 0)::bigint as countries_with_macro,
  count(*) filter (where per_country.critical_minerals_targets > 0)::bigint as countries_with_critical_minerals,
  count(*) filter (
    where per_country.geopolitics_targets > 0
      and per_country.macro_targets > 0
      and per_country.critical_minerals_targets > 0
  )::bigint as countries_with_all_three,
  (
    registry.enabled_country_count > 0
    and targets.actual_target_rows >= registry.enabled_country_count * 13
    and count(*) = registry.enabled_country_count
    and count(*) filter (
      where per_country.geopolitics_targets > 0
        and per_country.macro_targets > 0
        and per_country.critical_minerals_targets > 0
    ) = registry.enabled_country_count
  ) as raw_source_coverage_100_complete
from registry
cross join targets
left join per_country on true
group by registry.enabled_country_count, targets.actual_target_rows;

comment on view public.live_raw_source_coverage_100_status is
  'Raw internal source-coverage gate with a dynamic live_country_registry denominator. Every enabled canonical registry row must have targets in GEOPOLITICS, MACRO and CRITICAL_MINERALS. Commercial rights and certified production readiness remain separate fail-closed gates.';

commit;
