create index if not exists live_structured_events_archive_v2_cold_idx
on public.live_structured_events (last_seen_at asc, id)
where structured_payload->'_archive'->>'v' = '2';

analyze public.live_structured_events;
