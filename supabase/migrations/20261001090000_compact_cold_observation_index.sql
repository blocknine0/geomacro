-- Reduce free-tier database footprint without changing observation data.
-- The cold-row maintenance reader filters on the same partial predicate and
-- orders by ingested_at, observation_id. A single-column partial B-tree keeps
-- the selective time scan cheap; the small final tie-break is sorted in-memory
-- for the bounded (<=100 row) maintenance batch.

create index if not exists live_external_observations_cold_ingested_idx
  on public.live_external_observations (ingested_at)
  where raw_payload is null and archive_bundle_key is not null;

drop index if exists public.live_external_observations_cold_row_idx;
