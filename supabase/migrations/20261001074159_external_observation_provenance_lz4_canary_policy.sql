alter table public.live_external_observations set (toast_tuple_target = 128);
alter table public.live_external_observations alter column provenance set storage extended;
alter table public.live_external_observations alter column provenance set compression lz4;
