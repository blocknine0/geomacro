-- #1414 Section 5: Telegram remains a lead/raw-signal lane, never trusted at ingest.
-- Canonicalize the already-installed production boundary so schema replay, DR,
-- new environments and future migrations preserve the same fail-closed behavior.
--
-- Any Telegram insert or content-changing re-ingest is reset to UNVERIFIED,
-- scoreless and stripped of raw body/payload at the database boundary. Later
-- corroboration-only updates may promote the row because they do not change the
-- content hash and remain subject to the normal canonical promotion pipeline.

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

comment on function public.guard_telegram_raw_event_ingest() is
  'Fail-closed Telegram raw-event boundary: content inserts/changes are UNVERIFIED, scoreless and stripped of raw body/payload before persistence.';
