-- Keep verified structured-evidence cold cleanup bounded below the free-tier
-- statement timeout. These partial indexes cover only archive-index rows that
-- still contain the full immutable source row and therefore remain eligible
-- for application-side B2 readback verification and Phase-B cleanup.

create index if not exists live_structured_evidence_archive_index_phase_b_oldest_idx
on public.live_structured_event_evidence_archive_index (
  archived_at asc,
  bundle_key asc,
  event_id,
  fingerprint
)
where row_json->'_archive' is null;

create index if not exists live_structured_evidence_archive_index_phase_b_bundle_idx
on public.live_structured_event_evidence_archive_index (
  bundle_key,
  event_id,
  fingerprint
)
where row_json->'_archive' is null;

analyze public.live_structured_event_evidence_archive_index;
analyze public.live_structured_event_evidence;
analyze public.live_fragment_manifest;
