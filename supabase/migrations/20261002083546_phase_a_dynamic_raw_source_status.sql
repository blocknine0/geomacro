create or replace view public.live_raw_source_runtime_100_status
with (security_invoker=true)
as
with country_status as (
  select iso3, bool_and(raw_runtime_fresh) as complete
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
  'Operational raw-runtime gate with a dynamic live_country_registry denominator. Every enabled canonical registry row must have recent raw runtime in all three Phase A domains.';

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
    on t.country_iso3 = r.iso3 and t.enabled = true
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
  'Raw internal source-coverage gate with a dynamic live_country_registry denominator. Every enabled canonical registry row must have targets in GEOPOLITICS, MACRO and CRITICAL_MINERALS.';
