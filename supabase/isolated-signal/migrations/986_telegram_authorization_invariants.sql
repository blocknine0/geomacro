-- #1414 Section 5: keep the isolated signal project aligned with the canonical
-- Telegram production boundary. Public MTProto is permanently disabled and no
-- Telegram source may directly become a commercial signal source.

update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  commercial_usage_status = 'PERMISSION_REQUIRED',
  updated_at = now()
where source_id = 'telegram_mtproto_flash';

update public.live_external_sources
set enabled_for_commercial_signals = false,
    updated_at = now()
where source_id = 'telegram_authorized_publisher_feed';

alter table public.live_telegram_channel_registry
  add column if not exists publisher_authorized boolean not null default false,
  add column if not exists authorization_scope text,
  add column if not exists authorization_reference text,
  add column if not exists authorization_granted_at timestamptz,
  add column if not exists authorization_expires_at timestamptz;

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
