-- =============================================================================
-- #1414 Section 5: Telegram authorized-publisher production boundary
--
-- Telegram is supplementary lead evidence only. Public MTProto scraping is not
-- an approved production path. A Telegram channel can be enabled only after an
-- explicit publisher authorization record exists. Even then, Telegram evidence
-- enters UNVERIFIED and must pass normal corroboration/rights/provenance gates
-- before any derived commercial intelligence can use it.
-- =============================================================================

alter table public.live_telegram_channel_registry
  add column if not exists publisher_authorized boolean not null default false,
  add column if not exists authorization_scope text,
  add column if not exists authorization_reference text,
  add column if not exists authorization_granted_at timestamptz,
  add column if not exists authorization_expires_at timestamptz;

-- Legacy public-channel MTProto collection must remain disabled at source level.
update public.live_external_sources
set
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  commercial_usage_status = 'PERMISSION_REQUIRED',
  raw_redistribution_allowed = false,
  notes = 'Disabled by #1414 Telegram governance: public MTProto scraping is not an approved production source. Use telegram_authorized_publisher_feed only after explicit publisher authorization.',
  updated_at = now()
where source_id = 'telegram_mtproto_flash';

-- The only Telegram production candidate is explicit publisher-authorized input.
insert into public.live_external_sources (
  source_id,
  source_name,
  provider_name,
  category,
  access_type,
  authentication_type,
  base_url,
  commercial_usage_status,
  raw_redistribution_allowed,
  attribution_required,
  enabled_for_ingestion,
  enabled_for_commercial_signals,
  country_scope,
  freshness_class,
  notes
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
  'Default-off. Per-channel publisher authorization plus normal corroboration, rights, provenance and freshness gates are mandatory. Raw Telegram content is never customer-facing.'
)
on conflict (source_id) do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = false,
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

-- Existing unapproved rows remain disabled.
update public.live_telegram_channel_registry
set
  enabled = false,
  updated_at = now()
where manual_review_status <> 'APPROVED'
   or publisher_authorized is not true
   or authorization_scope is null
   or length(trim(authorization_scope)) = 0
   or authorization_reference is null
   or length(trim(authorization_reference)) = 0
   or authorization_granted_at is null
   or (authorization_expires_at is not null and authorization_expires_at <= now());

alter table public.live_telegram_channel_registry
  drop constraint if exists live_telegram_channel_registry_authorized_production_check;

alter table public.live_telegram_channel_registry
  add constraint live_telegram_channel_registry_authorized_production_check check (
    enabled = false
    or (
      manual_review_status = 'APPROVED'
      and publisher_authorized = true
      and authorization_scope is not null
      and length(trim(authorization_scope)) > 0
      and authorization_reference is not null
      and length(trim(authorization_reference)) > 0
      and authorization_granted_at is not null
      and (authorization_expires_at is null or authorization_expires_at > authorization_granted_at)
    )
  );

comment on column public.live_telegram_channel_registry.publisher_authorized is
  'True only when the channel/publisher has explicitly authorized Geomacro use for the recorded scope.';

comment on column public.live_telegram_channel_registry.authorization_reference is
  'Non-secret internal evidence reference proving publisher authorization.';

comment on table public.live_telegram_channel_registry is
  'Governed Telegram candidate registry. Discovery never authorizes ingestion. enabled=true requires APPROVED manual review plus explicit publisher authorization evidence.';
