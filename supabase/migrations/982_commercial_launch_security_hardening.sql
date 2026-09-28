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

-- SECURITY DEFINER maintenance functions are service-role-only.  They are not public API RPCs.
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

-- Pin search_path on integrity/governance functions to prevent object-shadowing attacks.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'prevent_position_field_tampering',
        'prevent_published_gri_snapshot_mutation',
        'prevent_published_gri_contribution_mutation',
        'prevent_gri_benchmark_mutation',
        'prevent_published_gri_validation_mutation',
        'prevent_published_gri_validation_metric_mutation',
        'prevent_published_gri_replay_mutation',
        'prevent_published_gri_replay_snapshot_mutation',
        'prevent_gri_event_assessment_mutation',
        'prevent_gri_story_cluster_mutation',
        'prevent_gri_story_assignment_mutation',
        'enforce_gri_v11_story_provenance_on_publish',
        'enforce_gri_v11_comparison_metadata_on_publish',
        'enforce_gri_replay_v11_on_publish',
        'prevent_live_fragment_mutation',
        'prevent_geomacro_risk_object_mutation',
        'reject_country_intelligence_state_mutation',
        'prevent_published_gri_source_disposition_mutation',
        'enforce_gri_source_disposition_on_publish',
        'enforce_gri_three_domain_story_provenance_on_publish',
        'enforce_gri_three_domain_source_disposition_on_publish',
        'enforce_gri_three_domain_comparison_metadata_on_publish',
        'enforce_gri_three_domain_replay_on_publish',
        'global_coverage_certification_is_locked'
      )
  loop
    execute format('alter function %s set search_path = pg_catalog, public', r.fn);
  end loop;
end $$;

commit;
