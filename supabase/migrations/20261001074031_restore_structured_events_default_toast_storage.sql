alter table public.live_structured_events set (toast_tuple_target = 2040);
alter table public.live_structured_events alter column structured_payload set compression pglz;
