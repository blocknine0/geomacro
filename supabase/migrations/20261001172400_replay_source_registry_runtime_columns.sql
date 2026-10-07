begin;

-- Replay compatibility for short-version 964/965 source-registry columns.
-- Timestamped acquisition migrations consume these fields before short-version
-- migrations are reached in some local Supabase replay orders.

alter table public.live_source_registry
  add column if not exists realtime_hot_topic_enabled boolean not null default false,
  add column if not exists activation_env text,
  add column if not exists connector_status text not null default 'registered'
    check (connector_status in ('registered','configured','active','disabled','retired'));

commit;
