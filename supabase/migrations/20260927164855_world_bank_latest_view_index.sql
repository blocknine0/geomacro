-- Keep the governed WDI latest-observation view index-backed as the append-only
-- external observation ledger grows. This matches the DISTINCT ON ordering and
-- eligibility predicate in migration 918 without changing source-rights,
-- freshness, scoring, or delivery semantics.

create index if not exists live_external_observations_world_bank_latest_idx
  on public.live_external_observations (
    country_iso3,
    metric,
    observed_at desc nulls last,
    ingested_at desc,
    normalized_hash desc
  )
  where source_id = 'world_bank_indicators'
    and quality_status = 'VERIFIED'
    and commercial_eligibility_status = 'VERIFIED'
    and country_iso3 is not null
    and metric is not null
    and value_numeric is not null;

comment on index public.live_external_observations_world_bank_latest_idx is
  'Supports the governed live_world_bank_indicator_latest DISTINCT ON scan without relaxing commercial or quality predicates.';
