alter table public.live_telegram_channel_registry
  drop constraint if exists live_telegram_channel_registry_authorization_evidence_check;

alter table public.live_telegram_channel_registry
  add constraint live_telegram_channel_registry_authorization_evidence_check check (
    publisher_authorized = false
    or (
      authorization_scope is not null
      and length(trim(authorization_scope)) > 0
      and authorization_reference is not null
      and length(trim(authorization_reference)) > 0
      and authorization_granted_at is not null
      and (authorization_expires_at is null or authorization_expires_at > authorization_granted_at)
    )
  );

alter table public.live_external_sources
  drop constraint if exists live_external_sources_telegram_public_disabled_check;

alter table public.live_external_sources
  add constraint live_external_sources_telegram_public_disabled_check check (
    source_id <> 'telegram_mtproto_flash'
    or (
      enabled_for_ingestion = false
      and enabled_for_commercial_signals = false
    )
  );

alter table public.live_external_sources
  drop constraint if exists live_external_sources_telegram_never_direct_commercial_check;

alter table public.live_external_sources
  add constraint live_external_sources_telegram_never_direct_commercial_check check (
    source_id not in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed')
    or enabled_for_commercial_signals = false
  );