alter table public.live_external_observations set (toast_tuple_target = 2040);
alter table public.live_external_observations alter column provenance set compression pglz;
