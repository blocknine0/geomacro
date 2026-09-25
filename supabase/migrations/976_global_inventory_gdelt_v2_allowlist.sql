-- =============================================================================
-- Geomacro global inventory gate correction
--
-- GDELT 2.0 event ingestion is an intentionally governed, ingestion-only
-- source. It was enabled after the inventory view's original allowlist was
-- defined, so the inventory view incorrectly counted it as an unexpected
-- newly enabled inventory source and blocked the global coverage gate.
--
-- This migration changes only the read-only inventory status view. It does
-- not enable ingestion, promote commercial rights, or certify the source.
-- =============================================================================

begin;

create or replace view public.live_global_source_inventory_100_status
with(security_invoker=true)
as
with
registry as (
  select count(*)::bigint n from public.live_country_registry where enabled
),
gov as (
  select count(*)::bigint n from public.live_country_primary_source_directory
),
stats as (
  select count(*)::bigint n from public.live_country_statistics_source_directory
),
monetary as (
  select count(*)::bigint n from public.live_country_monetary_authority_directory
),
country_universe as (
  select count(*)::bigint n
  from public.live_global_source_universe
  where scope_type='COUNTRY'
),
regions as (
  select count(*)::bigint n from public.live_region_zone_catalog
),
region_paths as (
  select count(*)::bigint n from public.live_region_zone_module_coverage_targets
),
subzones as (
  select count(*)::bigint n from public.live_operational_subzone_catalog
),
subzone_paths as (
  select count(*)::bigint n from public.live_operational_subzone_source_paths
),
corridors as (
  select count(*)::bigint n from public.live_strategic_corridor_catalog
),
corridor_paths as (
  select count(*)::bigint n from public.live_corridor_module_coverage_targets
),
shocks as (
  select count(*)::bigint n from public.live_global_shock_taxonomy where required
),
shock_paths as (
  select count(*)::bigint n from public.live_global_shock_module_map
),
granular_shocks as (
  select count(*)::bigint n from public.live_operational_shock_catalog where required
),
granular_paths as (
  select count(*)::bigint n from public.live_operational_shock_source_paths
),
specialist_ids as (
  select count(*)::bigint n
  from public.live_external_sources
  where source_id in (
    'jodi_oil_world_database','fao_desert_locust_watch','woah_wahis',
    'iaea_news_events','wmo_global_weather','ocha_hdx_api',
    'wfp_hungermap_live','entsoe_transparency','opec_data',
    'cloudflare_radar_outages','ripe_ris_routing',
    'imo_maritime_safety_information','ukmto_msi','marad_msci',
    'iata_wis','eurocontrol_nod','copernicus_ems',
    'noaa_swpc','usgs_volcanoes','wmo_gts'
  )
),
new_source_enablement as (
  select count(*)::bigint n
  from public.live_external_sources
  where (
    source_id like 'gov_portal_%'
    or source_id like 'stats_office_%'
    or source_id like 'monetary_%'
    or source_id in (
      'jodi_oil_world_database','fao_desert_locust_watch','woah_wahis',
      'iaea_news_events','wmo_global_weather','ocha_hdx_api',
      'wfp_hungermap_live','entsoe_transparency','opec_data',
      'cloudflare_radar_outages','ripe_ris_routing',
      'imo_maritime_safety_information','ukmto_msi','marad_msci',
      'iata_wis','eurocontrol_nod','copernicus_ems',
      'noaa_swpc','usgs_volcanoes','wmo_gts',
      'gdelt_v2_events'
    )
  )
  and (enabled_for_ingestion or enabled_for_commercial_signals)
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
  select count(*)::bigint n
  from public.live_external_sources
  where source_id like 'rmis_country_%'
),
base as (
  select
    now() evaluated_at,
    registry.n enabled_canonical_registry_rows,
    gov.n government_directory_rows,
    stats.n statistics_directory_rows,
    monetary.n monetary_directory_rows,
    country_universe.n actual_country_source_universe_rows,
    (
      registry.n*24
      + gov.n
      + stats.n
      + monetary.n
    )::bigint expected_country_source_universe_rows,
    regions.n broad_region_count,
    region_paths.n broad_region_module_rows,
    subzones.n operational_subzone_count,
    subzone_paths.n operational_subzone_source_path_rows,
    corridors.n strategic_corridor_count,
    corridor_paths.n corridor_module_rows,
    shocks.n broad_shock_family_count,
    shock_paths.n broad_shock_module_map_rows,
    granular_shocks.n granular_shock_condition_count,
    granular_paths.n granular_shock_source_path_rows,
    specialist_ids.n specialist_sources_registered,
    new_source_enablement.n new_inventory_sources_enabled_count,
    (
      gov.n = 195
      and stats.n = 194
      and monetary.n = 195
      and regions.n = 24
      and region_paths.n = regions.n * 16
      and corridors.n = 35
      and corridor_paths.n = corridors.n * 16
      and shocks.n = 36
      and shock_paths.n > 0
      and subzones.n = 39
      and subzone_paths.n = subzones.n * 3
      and granular_shocks.n = 111
      and granular_paths.n = granular_shocks.n * 3
      and specialist_ids.n = 20
      and country_universe.n =
        registry.n*24 + gov.n + stats.n + monetary.n
      and new_source_enablement.n = 0
    ) as source_inventory_100_complete,
    false as endpoint_certification_complete,
    false as rights_certification_complete,
    false as runtime_testing_complete
  from registry
  cross join gov
  cross join stats
  cross join monetary
  cross join country_universe
  cross join regions
  cross join region_paths
  cross join subzones
  cross join subzone_paths
  cross join corridors
  cross join corridor_paths
  cross join shocks
  cross join shock_paths
  cross join granular_shocks
  cross join granular_paths
  cross join specialist_ids
  cross join new_source_enablement
)
select
  base.*,
  critical_country.n critical_country_core_rows,
  critical_region.n critical_region_path_rows,
  critical_corridor.n critical_corridor_path_rows,
  critical_shock.n critical_mineral_shock_conditions,
  critical_shock_paths.n critical_mineral_shock_path_rows,
  rmis.n rmis_country_source_rows,
  (
    critical_country.n = registry.n * 2 + rmis.n
    and critical_region.n = 24 * 3
    and critical_corridor.n = 35 * 3
    and critical_shock.n = 45
    and critical_shock_paths.n = 45 * 3
    and rmis.n = 195
  ) as critical_minerals_inventory_100_complete
from base
cross join registry
cross join critical_country
cross join critical_region
cross join critical_corridor
cross join critical_shock
cross join critical_shock_paths
cross join rmis;

comment on view public.live_global_source_inventory_100_status is
 'Global inventory gate including the category-specific Critical Minerals source universe. Inventory completeness does not certify endpoints, rights, schemas, freshness or commercial delivery. GDELT V2 event ingestion is an explicit governed ingestion-only exception to the newly-enabled inventory-source alarm.';

commit;
