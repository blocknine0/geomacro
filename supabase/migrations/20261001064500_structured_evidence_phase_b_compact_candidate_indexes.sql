-- Replace the initial covering Phase-B indexes with compact partial indexes.
-- The candidate RPC only needs ordering by archived_at/bundle_key and direct
-- bundle lookup here; event/fingerprint resolution remains protected by the
-- table primary keys. This preserves the bounded query plan while avoiding
-- ~20 MiB of unnecessary index footprint on the free-tier database.

drop index if exists public.live_structured_evidence_archive_index_phase_b_oldest_idx;
drop index if exists public.live_structured_evidence_archive_index_phase_b_bundle_idx;

create index live_structured_evidence_archive_index_phase_b_oldest_idx
on public.live_structured_event_evidence_archive_index (
  archived_at asc,
  bundle_key asc
)
where row_json->'_archive' is null;

create index live_structured_evidence_archive_index_phase_b_bundle_idx
on public.live_structured_event_evidence_archive_index (bundle_key)
where row_json->'_archive' is null;

analyze public.live_structured_event_evidence_archive_index;
