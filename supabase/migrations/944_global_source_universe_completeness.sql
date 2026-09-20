begin;

-- Machine-checkable completeness contract for the three parallel dimensions.
create or replace view public.live_global_source_universe_completeness as
select
  (select count(*) from public.live_global_country_coverage where required) as required_countries,
  (select count(*) from public.live_global_country_coverage where required and status='CERTIFIED') as certified_countries,
  (select count(*) from public.live_global_corridor_coverage where required) as required_corridors,
  (select count(*) from public.live_global_corridor_coverage where required and status='CERTIFIED') as certified_corridors,
  (select count(*) from public.live_global_shock_taxonomy where required) as required_shocks,
  (select count(*) from public.live_global_shock_taxonomy where required and status='CERTIFIED') as certified_shocks,
  (select count(*) from public.live_global_source_dimension_map where required and status='CERTIFIED') as certified_source_dimension_edges,
  (select count(*) from public.live_global_source_dimension_map where required) as required_source_dimension_edges;

-- Fail-closed audit view: a dimension cannot be considered complete merely because
-- a source is registered. It needs independently certified coverage edges.
create or replace view public.live_global_source_universe_gaps as
select 'COUNTRY' as dimension_type, iso3 as dimension_id, country_name as label
from public.live_global_country_coverage
where required and status <> 'CERTIFIED'
union all
select 'CORRIDOR', corridor_id, corridor_name
from public.live_global_corridor_coverage
where required and status <> 'CERTIFIED'
union all
select 'SHOCK', shock_id, shock_name
from public.live_global_shock_taxonomy
where required and status <> 'CERTIFIED';

commit;