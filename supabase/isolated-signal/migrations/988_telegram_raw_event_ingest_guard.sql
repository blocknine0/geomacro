-- #1414 Section 5: Telegram is a lead/raw-signal lane, never trusted at ingest.
-- Re-ingest/content updates are reset to UNVERIFIED; later corroboration-only
-- updates may promote status because they do not change content_hash.

create or replace function public.guard_telegram_raw_event_ingest()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.source_id in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed')
     and (tg_op = 'INSERT' or new.content_hash is distinct from old.content_hash) then
    new.verification_status := 'UNVERIFIED';
    new.severity := null;
    new.verified_at := null;
    new.body := null;
    new.raw_payload := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_telegram_raw_event_ingest on public.live_flash_events;
create trigger trg_guard_telegram_raw_event_ingest
before insert or update of content_hash on public.live_flash_events
for each row
when (new.source_id in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed'))
execute function public.guard_telegram_raw_event_ingest();
