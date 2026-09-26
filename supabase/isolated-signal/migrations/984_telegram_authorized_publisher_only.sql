-- Telegram production hardening: public-channel aggregation is not an approved
-- production intelligence input. Only explicitly publisher-authorized feeds may
-- be prepared for later activation, and remain disabled until rights evidence is recorded.

update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  commercial_usage_status = 'PERMISSION_REQUIRED',
  notes = 'Disabled: public Telegram channel scraping/aggregation is not an approved production intelligence source. Use telegram_authorized_publisher_feed only with explicit publisher authorization.',
  updated_at = now()
where source_id = 'telegram_mtproto_flash';

insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, commercial_usage_status,
  raw_redistribution_allowed, attribution_required,
  enabled_for_ingestion, enabled_for_commercial_signals,
  country_scope, freshness_class, notes
) values (
  'telegram_authorized_publisher_feed',
  'Telegram Authorized Publisher Feed',
  'Individually authorized Telegram publishers',
  'GEOPOLITICS',
  'API',
  'SIGNED_WEBHOOK_OR_BOT_SUBMISSION',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'REAL_TIME',
  'Default-off production candidate. Requires explicit publisher authorization for the specific channel/content scope. Raw content is not customer-facing; only governed derived signals may be promoted after independent corroboration and source-rights certification.'
)
on conflict (source_id) do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = excluded.raw_redistribution_allowed,
  attribution_required = excluded.attribution_required,
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

alter table public.live_telegram_channel_registry
  add column if not exists publisher_authorized boolean not null default false,
  add column if not exists authorization_scope text,
  add column if not exists authorization_reference text,
  add column if not exists authorization_granted_at timestamptz,
  add column if not exists authorization_expires_at timestamptz;

alter table public.live_telegram_channel_registry
  drop constraint if exists live_telegram_channel_registry_authorized_production_check;

alter table public.live_telegram_channel_registry
  add constraint live_telegram_channel_registry_authorized_production_check check (
    rights_status <> 'COMMERCIAL_OK'
    or (
      publisher_authorized = true
      and authorization_scope is not null
      and length(trim(authorization_scope)) > 0
      and authorization_reference is not null
      and length(trim(authorization_reference)) > 0
      and authorization_granted_at is not null
      and (authorization_expires_at is null or authorization_expires_at > authorization_granted_at)
    )
  );

comment on column public.live_telegram_channel_registry.publisher_authorized is
  'True only when the publisher/channel owner has explicitly authorized Geomacro use for the recorded scope.';
comment on column public.live_telegram_channel_registry.authorization_reference is
  'Internal evidence reference for publisher authorization; do not store secrets or private message content here.';
