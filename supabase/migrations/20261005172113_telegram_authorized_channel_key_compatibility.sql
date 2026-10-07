create or replace function public.enforce_telegram_flash_authorization()
returns trigger
language plpgsql
as $$
declare
  channel public.live_telegram_channel_registry%rowtype;
  normalized_key text;
begin
  if new.source_id = 'telegram_mtproto_flash' then
    raise exception 'legacy public Telegram MTProto ingestion is disabled';
  end if;

  if new.source_id = 'telegram_authorized_publisher_feed' then
    normalized_key := lower(trim(coalesce(new.source_channel_key, new.source_channel, '')));
    normalized_key := regexp_replace(normalized_key, '^@+', '');

    if normalized_key = '' or normalized_key !~ '^[a-z0-9_]{5,32}$' then
      raise exception 'authorized Telegram source_channel/source_channel_key is required';
    end if;

    new.source_channel_key := normalized_key;

    select * into channel
    from public.live_telegram_channel_registry
    where channel_key = normalized_key;

    if not found
       or channel.enabled is not true
       or channel.manual_review_status <> 'APPROVED'
       or channel.publisher_authorized is not true
       or channel.authorization_scope is null
       or length(trim(channel.authorization_scope)) = 0
       or channel.authorization_reference is null
       or length(trim(channel.authorization_reference)) = 0
       or channel.authorization_granted_at is null
       or (channel.authorization_expires_at is not null and channel.authorization_expires_at <= now()) then
      raise exception 'Telegram publisher authorization is not valid for channel %', normalized_key;
    end if;

    new.verification_status := 'UNVERIFIED';
  end if;

  return new;
end
$$;