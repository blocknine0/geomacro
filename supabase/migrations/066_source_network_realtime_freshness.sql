-- =============================================================================
-- Geomacro realtime freshness and endpoint-evidence bridge
-- =============================================================================

begin;

create or replace view public.live_realtime_source_freshness_status
with (security_invoker=true)
as
with latest_gdelt as (
  select
    period_end,
    sealed_at,
    verified_at,
    item_count
  from public.live_fragment_manifest
  where source_key = 'gdelt_gal'
    and stream_key = 'global-relevant'
  order by period_end desc nulls last
  limit 1
)
select
  now() evaluated_at,
  period_end as latest_source_period_end,
  sealed_at as latest_sealed_at,
  verified_at as latest_verified_at,
  item_count as latest_item_count,
  case
    when period_end is null then null
    else extract(epoch from (now() - period_end))::bigint
  end as lag_seconds,
  1800::bigint as max_allowed_lag_seconds,
  (
    period_end is not null
    and extract(epoch from (now() - period_end)) <= 1800
  ) as freshness_1800_complete
from latest_gdelt;

comment on view public.live_realtime_source_freshness_status is
 'Realtime source freshness gate. GDELT GAL must have a current global-relevant manifest with lag <= 1800 seconds. A transport-successful source does not imply freshness.';

create or replace view public.live_source_network_launch_status
with (security_invoker=true)
as
select
  s.*,
  coalesce(r.freshness_1800_complete, false) as gdelt_gal_freshness_complete,
  (
    s.source_network_100_complete
    and coalesce(r.freshness_1800_complete, false)
  ) as source_network_launch_complete
from public.live_source_network_100_status s
cross join lateral (
  select * from public.live_realtime_source_freshness_status
) r;

comment on view public.live_source_network_launch_status is
 'Combined source-network launch gate. Requires full source certification plus realtime GDELT GAL freshness. This is separate from inventory completeness.';

commit;
