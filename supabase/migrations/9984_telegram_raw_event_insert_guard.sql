-- #1414 Section 5: Telegram is a lead/raw-signal lane, never trusted at ingest.
-- Strip raw content and caller-provided scoring at the database boundary.

create or replace function public.guard_telegram_raw_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.source_id in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed') then
    new.verification_status := 'UNVERIFIED';
    new.severity := null;
    new.verified_at := null;
    new.body := null;
    new.raw_payload := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_telegram_raw_event_insert on public.live_flash_events;
create trigger trg_guard_telegram_raw_event_insert
before insert on public.live_flash_events
for each row
when (new.source_id in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed'))
execute function public.guard_telegram_raw_event_insert();
