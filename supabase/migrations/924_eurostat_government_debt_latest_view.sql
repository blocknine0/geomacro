begin;

create or replace view public.live_eurostat_government_debt_latest
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
  o.source_id = 'eurostat_government_finance'
  and o.country_iso3 is not null
  and o.metric = 'general_government_gross_debt_pct_gdp'
  and o.quality_status = 'VERIFIED'
  and o.commercial_eligibility_status = 'VERIFIED'
order by
  o.country_iso3,
  o.metric,
  o.observed_at desc nulls last,
  o.ingested_at desc,
  o.normalized_hash desc;

comment on view public.live_eurostat_government_debt_latest is
  'Latest governed commercially eligible Eurostat general-government gross debt observation per country. This view is concept-specific and must not be merged directly with World Bank central-government debt values.';

grant select on public.live_eurostat_government_debt_latest
  to service_role;

-- Phase 1 is shadow-validation only. Creating the governed view must not
-- activate Eurostat as a commercial Risk Gate signal.
do $$
begin
  if not exists (
    select 1
    from public.live_external_sources
    where source_id = 'eurostat_government_finance'
      and commercial_usage_status = 'COMMERCIAL_OK'
      and enabled_for_ingestion = true
      and enabled_for_commercial_signals = false
  ) then
    raise exception 'Eurostat shadow methodology blocked: source must remain ingestion-enabled and scoring-disabled';
  end if;
end;
$$;

commit;
