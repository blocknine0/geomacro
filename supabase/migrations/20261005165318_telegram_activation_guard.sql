create or replace function public.enforce_telegram_source_activation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.source_id = 'telegram_mtproto_flash' then
    if new.enabled_for_ingestion or new.enabled_for_commercial_signals then
      raise exception 'PUBLIC_TELEGRAM_MTPROTO_DISABLED';
    end if;
    return new;
  end if;

  if new.source_id = 'telegram_authorized_publisher_feed' then
    if new.enabled_for_commercial_signals then
      raise exception 'TELEGRAM_DIRECT_COMMERCIAL_SIGNALS_FORBIDDEN';
    end if;

    if new.enabled_for_ingestion and not exists (
      select 1
      from public.live_telegram_channel_registry c
      where c.enabled = true
        and c.manual_review_status = 'APPROVED'
        and c.publisher_authorized = true
        and c.authorization_scope is not null
        and length(trim(c.authorization_scope)) > 0
        and c.authorization_reference is not null
        and length(trim(c.authorization_reference)) > 0
        and c.authorization_granted_at is not null
        and (c.authorization_expires_at is null or c.authorization_expires_at > now())
    ) then
      raise exception 'TELEGRAM_AUTHORIZED_FEED_REQUIRES_ACTIVE_PUBLISHER_AUTHORIZATION';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_telegram_source_activation on public.live_external_sources;
create trigger trg_enforce_telegram_source_activation
before insert or update of enabled_for_ingestion, enabled_for_commercial_signals
on public.live_external_sources
for each row
when (new.source_id in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed'))
execute function public.enforce_telegram_source_activation();