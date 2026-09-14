begin;

create or replace view public.live_world_bank_indicator_latest
with (security_invoker = true)
as
select distinct on (
  o.country_iso3,
  o.metric
)
  o.observation_id,
  o.country_iso3,
  o.metric,
  o.value_numeric,
  o.unit,
  o.observed_at,
  o.published_at,
  o.normalized_hash,
  o.ingested_at,
  o.provenance,
  o.quality_status,
  o.commercial_eligibility_status
from public.live_external_observations o
where
  o.source_id = 'world_bank_indicators'
  and o.country_iso3 is not null
  and o.metric is not null
  and o.quality_status = 'VERIFIED'
  and o.commercial_eligibility_status = 'VERIFIED'
order by
  o.country_iso3,
  o.metric,
  o.observed_at desc nulls last,
  o.ingested_at desc,
  o.normalized_hash desc;

comment on view public.live_world_bank_indicator_latest is
  'Latest governed commercially eligible World Bank indicator per country and metric for server-side Risk Gate and risk-intelligence calculations.';

revoke all on public.live_world_bank_indicator_latest
  from public, anon, authenticated;
grant select on public.live_world_bank_indicator_latest
  to service_role;

commit;
