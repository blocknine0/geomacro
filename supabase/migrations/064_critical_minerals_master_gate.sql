-- =============================================================================
-- Geomacro Critical Minerals master inventory gate
--
-- Canonical category-specific source inventory status. This does not certify
-- sources and never enables commercial signals.
-- =============================================================================
begin;

create or replace view public.live_global_source_inventory_100_status
with(security_invoker=true)
as
with
registry as (
  select count(*)::bigint n from public.live_country_registry where enabled
),
critical_country as (
  select count(*)::bigint n
  from public.live_global_source_universe
  where scope_type='COUNTRY'
    and source_role in (
      'CRITICAL_MINERALS_COUNTRY_PRIMARY',
      'CRITICAL_MINERALS_GLOBAL_PRIMARY',
      'CRITICAL_MINERALS_GLOBAL_SECONDARY'
    )
),
critical_region as (
  select count(*)::bigint n
  from public.live_global_source_universe
  where scope_type='REGION'
    and source_role like 'CRITICAL_MINERALS_%'
),
critical_corridor as (
  select count(*)::bigint n
  from public.live_global_source_universe
  where scope_type='CORRIDOR'
    and source_role like 'CRITICAL_MINERALS_%'
),
critical_shock as (
  select count(*)::bigint n
  from public.live_critical_mineral_shock_catalog
  where required
),
critical_shock_paths as (
  select count(*)::bigint n
  from public.live_global_source_universe
  where scope_type='SHOCK'
    and source_role like 'CRITICAL_MINERALS_%'
),
rmis as (
  select count(*)::bigint n from public.live_external_sources where source_id like 'rmis_country_%'
)
select
  now() evaluated_at,
  registry.n enabled_canonical_country_rows,
  critical_country.n critical_country_core_rows,
  critical_region.n critical_region_path_rows,
  critical_corridor.n critical_corridor_path_rows,
  critical_shock.n critical_mineral_shock_conditions,
  critical_shock_paths.n critical_mineral_shock_path_rows,
  rmis.n rmis_country_source_rows,
  (
    critical_country.n = registry.n * 3
    and critical_region.n = 24 * 3
    and critical_corridor.n = 35 * 3
    and critical_shock.n = 43
    and critical_shock_paths.n = 43 * 3
    and rmis.n = registry.n
  ) as critical_minerals_inventory_100_complete,
  false as endpoint_certification_complete,
  false as rights_certification_complete,
  false as runtime_testing_complete;

comment on view public.live_global_source_inventory_100_status is
 'Global inventory gate including the category-specific Critical Minerals source universe. Inventory completeness does not certify endpoints, rights, schemas, freshness or commercial delivery.';

commit;
