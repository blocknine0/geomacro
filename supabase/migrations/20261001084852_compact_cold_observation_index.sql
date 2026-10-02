create index if not exists live_external_observations_cold_ingested_idx on public.live_external_observations (ingested_at) where raw_payload is null and archive_bundle_key is not null;
drop index if exists public.live_external_observations_cold_row_idx;
