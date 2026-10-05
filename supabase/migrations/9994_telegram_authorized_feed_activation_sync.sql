-- #1414 Section 5: keep the generic authorized Telegram feed synchronized to
-- the presence of at least one currently valid authorized publisher channel.
-- Commercial-signal eligibility is never enabled here.

create or replace function public.sync_telegram_authorized_feed_source_state()
returns void
language plpgsql
as $$
declare
  has_authorized_channel boolean;
begin
  select exists (
    select 1
    from public.live_telegram_channel_registry
    where enabled = true
      and manual_review_status = 'APPROVED'
      and publisher_authorized = true
      and authorization_scope is not null
      and length(trim(authorization_scope)) > 0
      and authorization_reference is not null
      and length(trim(authorization_reference)) > 0
      and authorization_granted_at is not null
      and (authorization_expires_at is null or authorization_expires_at > now())
  ) into has_authorized_channel;

  update public.live_external_sources
  set
    enabled_for_ingestion = has_authorized_channel,
    enabled_for_commercial_signals = false,
    raw_redistribution_allowed = false,
    commercial_usage_status = case
      when has_authorized_channel then 'REVIEW_REQUIRED'
      else 'REVIEW_REQUIRED'
    end,
    updated_at = now()
  where source_id = 'telegram_authorized_publisher_feed';

  update public.live_external_sources
  set
    enabled_for_ingestion = false,
    enabled_for_commercial_signals = false,
    raw_redistribution_allowed = false,
    commercial_usage_status = 'PERMISSION_REQUIRED',
    updated_at = now()
  where source_id = 'telegram_mtproto_flash';
end
$$;

create or replace function public.trg_sync_telegram_authorized_feed_source_state()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_telegram_authorized_feed_source_state();
  return coalesce(new, old);
end
$$;

drop trigger if exists trg_sync_telegram_authorized_feed_source_state on public.live_telegram_channel_registry;
create trigger trg_sync_telegram_authorized_feed_source_state
after insert or update or delete on public.live_telegram_channel_registry
for each statement execute function public.trg_sync_telegram_authorized_feed_source_state();

select public.sync_telegram_authorized_feed_source_state();
