-- #1414 commercial corridor registry/census.
--
-- Geomacro does not materialize the full directed country-pair universe. The
-- stable registry is algorithmic over the canonical enabled country registry:
--   corridor_id = ORIGIN_ISO3>DESTINATION_ISO3, origin != destination.
-- The paid structural corridor product remains endpoint-composed and explicitly
-- NOT_MODELED for route/chokepoint geometry. Named strategic corridors stay
-- separately governed and are never promoted to a verified score by this view.

begin;

create or replace view public.live_commercial_corridor_registry_status
with (security_invoker = true)
as
with country_census as (
  select
    count(*) filter (where enabled)::bigint as enabled_country_count,
    count(*) filter (where enabled and iso3 !~ '^[A-Z]{3}$')::bigint as invalid_enabled_iso3_rows
  from public.live_country_registry
), strategic_census as (
  select
    count(*)::bigint as named_strategic_corridor_count,
    count(*) filter (where route_data_state <> 'NOT_YET_CERTIFIED')::bigint as named_route_data_promoted_rows
  from public.live_strategic_corridor_catalog
)
select
  now() as evaluated_at,
  'geomacro-corridor-registry-v1'::text as registry_version,
  'ORIGIN_ISO3>DESTINATION_ISO3'::text as stable_id_contract,
  'COUNTRY_PAIR_STRUCTURAL_V1'::text as corridor_type,
  c.enabled_country_count,
  (c.enabled_country_count * greatest(c.enabled_country_count - 1, 0))::bigint as supported_directed_pair_count,
  c.invalid_enabled_iso3_rows,
  s.named_strategic_corridor_count,
  s.named_route_data_promoted_rows,
  'ENDPOINT_COMPOSED_V0_1'::text as composition_method,
  'NOT_MODELED'::text as route_modeling_status,
  'NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY'::text as corridor_score_status,
  'EXPLICIT_UNAVAILABLE_OR_DEGRADED'::text as missing_route_evidence_behavior,
  (
    c.enabled_country_count >= 195
    and c.invalid_enabled_iso3_rows = 0
    and c.enabled_country_count * greatest(c.enabled_country_count - 1, 0) >= 195 * 194
  ) as commercial_corridor_registry_complete
from country_census c
cross join strategic_census s;

comment on view public.live_commercial_corridor_registry_status is
  'Versioned #1414 country-pair corridor census. Stable directed pair IDs map directly to canonical enabled ISO3 nodes; delivery is endpoint-composed structural intelligence, not a route-modelled or corridor-scored claim. Named strategic routes remain independently governed.';

commit;
