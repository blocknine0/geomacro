-- Keep structured-evidence Phase-A archive discovery below the free-tier
-- statement timeout without adding a large evidence-table index. Candidate
-- selection already joins from structured events and requires archive v2 plus
-- a cold last_seen_at; this compact partial index makes that predicate
-- index-only while preserving every existing archive eligibility condition.

create index if not exists live_structured_events_archive_v2_cold_idx
on public.live_structured_events (
  last_seen_at asc,
  id
)
where structured_payload->'_archive'->>'v' = '2';

analyze public.live_structured_events;
