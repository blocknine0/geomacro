begin;

-- Fresh-replay compatibility for the short-version 946 Telegram review gate.
-- Existing production databases already carry these fields, so this is a no-op
-- there. A zero replay needs the schema before the dated Telegram governance
-- views/functions reference manual_review_status.

alter table public.live_telegram_channel_registry
  add column if not exists manual_review_status text not null default 'PENDING',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists review_reference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'live_telegram_channel_registry_manual_review_status_check'
      and conrelid = 'public.live_telegram_channel_registry'::regclass
  ) then
    alter table public.live_telegram_channel_registry
      add constraint live_telegram_channel_registry_manual_review_status_check
      check (manual_review_status in ('PENDING', 'APPROVED', 'REJECTED'));
  end if;
end
$$;

commit;
