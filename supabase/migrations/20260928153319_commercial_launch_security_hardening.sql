begin;

-- Internal acquisition/realtime tables must never be directly exposed through PostgREST.
alter table public.live_raw_source_targets enable row level security;
alter table public.live_raw_source_snapshots enable row level security;
alter table public.live_realtime_scope_targets enable row level security;
alter table public.live_realtime_escalation_queue enable row level security;
alter table public.live_realtime_burst_runs enable row level security;

revoke all on table public.live_raw_source_targets from anon, authenticated;
revoke all on table public.live_raw_source_snapshots from anon, authenticated;
revoke all on table public.live_realtime_scope_targets from anon, authenticated;
revoke all on table public.live_realtime_escalation_queue from anon, authenticated;
revoke all on table public.live_realtime_burst_runs from anon, authenticated;

-- SECURITY DEFINER maintenance functions are service-role-only. They are not public API RPCs.
revoke execute on function public.ensure_live_source_certification_record() from public, anon, authenticated;
revoke execute on function public.global_coverage_design_is_complete() from public, anon, authenticated;
revoke execute on function public.prevent_position_field_tampering() from public, anon, authenticated;
revoke execute on function public.sync_live_country_module_targets() from public, anon, authenticated;
revoke execute on function public.sync_live_global_country_source_universe() from public, anon, authenticated;
revoke execute on function public.sync_live_realtime_corridor_targets() from public, anon, authenticated;
revoke execute on function public.sync_live_realtime_hot_topic_targets() from public, anon, authenticated;

grant execute on function public.ensure_live_source_certification_record() to service_role;
grant execute on function public.global_coverage_design_is_complete() to service_role;
grant execute on function public.prevent_position_field_tampering() to service_role;
grant execute on function public.sync_live_country_module_targets() to service_role;
grant execute on function public.sync_live_global_country_source_universe() to service_role;
grant execute on function public.sync_live_realtime_corridor_targets() to service_role;
grant execute on function public.sync_live_realtime_hot_topic_targets() to service_role;

commit;
