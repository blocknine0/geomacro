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
