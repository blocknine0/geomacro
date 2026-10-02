alter table public.live_structured_events set (toast_tuple_target = 128);
alter table public.live_structured_events alter column structured_payload set storage extended;
alter table public.live_structured_events alter column structured_payload set compression lz4;
