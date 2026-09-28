-- Cover only high-activity / larger relations. This improves FK joins/deletes without changing data semantics.
create index if not exists live_structured_event_evidence_fragment_idx on public.live_structured_event_evidence(fragment_id);
create index if not exists live_source_cert_edges_from_idx on public.live_source_certification_evidence_edges(from_evidence_id);
create index if not exists live_source_cert_edges_to_idx on public.live_source_certification_evidence_edges(to_evidence_id);
create index if not exists live_recent_fingerprints_fragment_idx on public.live_recent_fingerprints(fragment_id);
create index if not exists live_recent_fingerprints_source_idx on public.live_recent_fingerprints(source_key);
create index if not exists gri_contributions_story_cluster_idx on public.gri_contributions(story_cluster_id);
create index if not exists live_source_cert_queue_module_idx on public.live_source_certification_queue(module_id);
create index if not exists live_source_cert_queue_source_idx on public.live_source_certification_queue(source_id);
create index if not exists live_raw_source_targets_source_idx on public.live_raw_source_targets(source_id);
create index if not exists gri_source_dispositions_story_cluster_idx on public.gri_source_dispositions(story_cluster_id);
create index if not exists live_flash_event_versions_family_idx on public.live_flash_event_versions(event_family_id);
create index if not exists live_country_module_primary_source_idx on public.live_country_module_coverage_targets(primary_source_id);
create index if not exists live_country_module_fallback_source_idx on public.live_country_module_coverage_targets(fallback_source_id);
create index if not exists live_flash_family_versions_trigger_idx on public.live_flash_event_family_versions(trigger_flash_id);
create index if not exists live_realtime_burst_queue_idx on public.live_realtime_burst_runs(queue_id);
create index if not exists live_source_cert_records_fallback_idx on public.live_source_certification_records(fallback_source_id);
