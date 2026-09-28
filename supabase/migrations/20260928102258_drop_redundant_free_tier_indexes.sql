-- Free-tier quota recovery: remove indexes made redundant by later unique indexes.
-- These duplicates had zero observed scans in production before removal.
-- Keep the unique/canonical indexes that enforce the same key paths.

drop index if exists public.live_event_evidence_fingerprint_idx;
drop index if exists public.live_source_certification_queue_state_idx;
drop index if exists public.gri_benchmark_key_time_idx;
