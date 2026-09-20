-- =============================================================================
-- Geomacro global source inventory handoff expansion
--
-- Adds newly discovered country government/statistics paths to the existing
-- fail-closed certification queue and updates the inventory completeness gate.
-- No source is certified or enabled by this migration.
-- =============================================================================
begin;

-- Extend the queue vocabulary for direct country-primary discovery paths.
alter table public.live_source_certification_queue
  drop constraint if exists live_source_certification_queue_source_role_check;

alter table public.live_source_certification_queue
  add constraint live_source_certification_queue_source_role_check
  check (
    source_role in (
      'PRIMARY_MODULE',
      'FALLBACK_MODULE',
      'REGIONAL_PRIMARY',
      'REGIONAL_FALLBACK',
      'ROUTE_PRIMARY',
      'ROUTE_FALLBACK',
      'SHOCK_PRIMARY',
      'SHOCK_FALLBACK',
      'GOVERNMENT_PORTAL',
      'STATISTICS_OFFICE'
    )
  );

insert into public.live_source_certification_queue (
  queue_key,scope_type,scope_code,module_id,source_role,source_id,notes
)
select
 'COUNTRY:'||r.iso3||':GOVERNMENT_PORTAL:'||'gov_portal_'||lower(d.country_iso2),
 'COUNTRY',r.iso3,NULL,'GOVERNMENT_PORTAL',
 'gov_portal_'||lower(d.country_iso2),
 'Country government portal discovery source. Endpoint/rights/schema/freshness certification intentionally queued.'
from public.live_country_primary_source_directory d
join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
where r.enabled=true
on conflict(queue_key) do nothing;

insert into public.live_source_certification_queue (
  queue_key,scope_type,scope_code,module_id,source_role,source_id,notes
)
select
 'COUNTRY:'||r.iso3||':STATISTICS_OFFICE:'||'stats_office_'||lower(d.country_iso2),
 'COUNTRY',r.iso3,NULL,'STATISTICS_OFFICE',
 'stats_office_'||lower(d.country_iso2),
 'Country national statistics office candidate. Endpoint/rights/schema/freshness certification intentionally queued.'
from public.live_country_statistics_source_directory d
join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
where r.enabled=true
on conflict(queue_key) do nothing;

-- Extend future-country synchronization with the new direct country paths.
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
    select
      'COUNTRY:'||new.iso3||':'||'GOVERNMENT_PORTAL:gov_portal_'||lower(d.country_iso2),
      'COUNTRY',new.iso3,'GOVERNMENT_PORTAL',
      'gov_portal_'||lower(d.country_iso2),5,true,
      'Direct national government portal candidate.'
    from public.live_country_primary_source_directory d
    where upper(d.country_iso2)=upper(new.iso2)
    on conflict(scope_type,scope_code,source_role,source_id) do update set
      priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

    insert into public.live_global_source_universe
    (universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
    select
      'COUNTRY:'||new.iso3||':'||'STATISTICS_OFFICE:stats_office_'||lower(d.country_iso2),
      'COUNTRY',new.iso3,'STATISTICS_OFFICE',
      'stats_office_'||lower(d.country_iso2),7,true,
      'Direct national statistics office candidate.'
    from public.live_country_statistics_source_directory d
    where upper(d.country_iso2)=upper(new.iso2)
    on conflict(scope_type,scope_code,source_role,source_id) do update set
      priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

    insert into public.live_source_certification_queue
    (queue_key,scope_type,scope_code,module_id,source_role,source_id,notes)
    select
      'COUNTRY:'||new.iso3||':'||'GOVERNMENT_PORTAL:gov_portal_'||lower(d.country_iso2),
      'COUNTRY',new.iso3,NULL,'GOVERNMENT_PORTAL',
      'gov_portal_'||lower(d.country_iso2),
      'Auto-queued new country government portal source.'
    from public.live_country_primary_source_directory d
    where upper(d.country_iso2)=upper(new.iso2)
    on conflict(queue_key) do nothing;

    insert into public.live_source_certification_queue
    (queue_key,scope_type,scope_code,module_id,source_role,source_id,notes)
    select
      'COUNTRY:'||new.iso3||':'||'STATISTICS_OFFICE:stats_office_'||lower(d.country_iso2),
      'COUNTRY',new.iso3,NULL,'STATISTICS_OFFICE',
      'stats_office_'||lower(d.country_iso2),
      'Auto-queued new country statistics office source.'
    from public.live_country_statistics_source_directory d
    where upper(d.country_iso2)=upper(new.iso2)
    on conflict(queue_key) do nothing;
  end if;

  return new;
end;
$$;

-- Stronger source-universe completeness view.
-- Country completeness means the direct government + statistics source
-- directories are populated for the 195-country baseline where applicable,
-- while all canonical enabled countries retain the global 21-role backbone.
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
country_core_min as (
  select count(*)::bigint n from (
    select scope_code from public.live_global_source_universe
    where scope_type='COUNTRY'
      and source_role in (
        'GLOBAL_GOVERNANCE_PRIMARY',
        'GLOBAL_MACRO_PRIMARY',
        'SECURITY_PRIMARY',
        'TRADE_POLICY',
        'HUMANITARIAN',
        'HAZARD_ALERTS',
        'MINERALS'
      )
    group by scope_code
    having count(*) >= 7
  ) x
),
gov_directory as (
  select count(*)::bigint n from public.live_country_primary_source_directory
),
stats_directory as (
  select count(*)::bigint n from public.live_country_statistics_source_directory
),
country_gov_paths as (
  select count(distinct r.iso3)::bigint n
  from public.live_country_registry r
  join public.live_global_source_universe u
    on u.scope_type='COUNTRY'
   and u.scope_code=r.iso3
   and u.source_role='GOVERNMENT_PORTAL'
  where r.enabled
),
country_stats_paths as (
  select count(distinct r.iso3)::bigint n
  from public.live_country_registry r
  join public.live_global_source_universe u
    on u.scope_type='COUNTRY'
   and u.scope_code=r.iso3
   and u.source_role='STATISTICS_OFFICE'
  where r.enabled
)
select
 now() evaluated_at,
 countries.n country_count,
 21::bigint country_sources_per_subject,
 country_rows.n actual_country_source_rows,
 countries.n*21::bigint expected_country_source_rows,
 country_core_min.n countries_meeting_minimum,
 gov_directory.n government_directory_rows,
 195::bigint expected_government_directory_rows,
 stats_directory.n statistics_directory_rows,
 194::bigint expected_statistics_directory_rows,
 country_gov_paths.n enabled_countries_with_government_path,
 country_stats_paths.n enabled_countries_with_statistics_path,
 regions.n region_count,
 region_rows.n actual_region_source_rows,
 regions.n*3 expected_region_source_rows,
 corridors.n corridor_count,
 corridor_rows.n actual_corridor_source_rows,
 corridors.n*3 expected_corridor_source_rows,
 shocks.n shock_count,
 shock_rows.n actual_shock_source_rows,
 shocks.n*3 expected_shock_source_rows,
 (
   countries.n>0
   and country_core_min.n=countries.n
   and gov_directory.n=195
   and stats_directory.n=194
   and country_gov_paths.n=countries.n
   and region_rows.n=regions.n*3
   and corridor_rows.n=corridors.n*3
   and shock_rows.n=shocks.n*3
   and regions.n=24
   and corridors.n=35
   and shocks.n=36
 ) as source_universe_complete,
 false as certification_gate_open
from countries
cross join regions
cross join corridors
cross join shocks
cross join country_rows
cross join region_rows
cross join corridor_rows
cross join shock_rows
cross join country_core_min
cross join gov_directory
cross join stats_directory
cross join country_gov_paths
cross join country_stats_paths;

comment on view public.live_global_source_universe_status is
 'Internal source-universe inventory completeness only. Government/statistics directories are discovery inventories; direct certification and commercial activation remain locked.';

commit;
