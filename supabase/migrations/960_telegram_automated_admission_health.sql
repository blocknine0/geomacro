-- =============================================================================
-- Geomacro Telegram automated admission + health contract
--
-- Replaces founder/operator approval as the runtime admission gate. Telegram
-- remains a lead layer: every item is forced to UNVERIFIED and cannot directly
-- authorize GRI, Risk Gate, paid delivery, or public intelligence.
-- =============================================================================

alter table public.live_telegram_channel_registry
  add column if not exists auto_admission_status text not null default 'PENDING',
  add column if not exists source_role text not null default 'local_news',
  add column if not exists country_iso3 text,
  add column if not exists language text,
  add column if not exists telegram_public_channel_key text,
  add column if not exists telegram_public_source_url text,
  add column if not exists last_health_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_telegram_channel_registry_auto_admission_status_check'
  ) then
    alter table public.live_telegram_channel_registry
      add constraint live_telegram_channel_registry_auto_admission_status_check
      check (auto_admission_status in ('PENDING','ACTIVE','DEGRADED','QUARANTINED','REJECTED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'live_telegram_channel_registry_source_role_check'
  ) then
    alter table public.live_telegram_channel_registry
      add constraint live_telegram_channel_registry_source_role_check
      check (source_role in (
        'official_authority','publisher','local_news','regional_news',
        'independent_osint','sector_signal'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'live_telegram_channel_registry_country_iso3_check'
  ) then
    alter table public.live_telegram_channel_registry
      add constraint live_telegram_channel_registry_country_iso3_check
      check (country_iso3 is null or country_iso3 ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'live_telegram_channel_registry_public_url_check'
  ) then
    alter table public.live_telegram_channel_registry
      add constraint live_telegram_channel_registry_public_url_check
      check (
        telegram_public_source_url is null
        or telegram_public_source_url ~ '^https://t\.me/[A-Za-z0-9_]+/?$'
      );
  end if;
end
$$;

-- Runtime admission is now machine-governed. Historical manual-review columns
-- remain for audit compatibility but are no longer required by ingestion.
update public.live_telegram_channel_registry
set
  telegram_public_channel_key = coalesce(
    telegram_public_channel_key,
    channel_key
  ),
  telegram_public_source_url = coalesce(
    telegram_public_source_url,
    'https://t.me/' || channel_key
  ),
  auto_admission_status = case
    when enabled = true
      and rights_status in ('INTERNAL_RESEARCH_ONLY','DERIVED_ONLY','COMMERCIAL_OK','REVIEW_REQUIRED')
      then 'ACTIVE'
    else 'PENDING'
  end,
  last_health_at = now(),
  updated_at = now()
where telegram_public_channel_key is null
   or telegram_public_source_url is null
   or auto_admission_status = 'PENDING';

comment on column public.live_telegram_channel_registry.auto_admission_status is
  'Machine-governed runtime state. ACTIVE permits raw lead ingestion; DEGRADED/QUARANTINED/PENDING/REJECTED block ingestion. No founder approval is required.';
comment on column public.live_telegram_channel_registry.source_role is
  'Automated source role used for country coverage and corroboration policy.';
comment on column public.live_telegram_channel_registry.last_health_at is
  'Last machine health observation for this Telegram source.';
comment on column public.live_telegram_channel_registry.last_seen_at is
  'Last successfully ingested Telegram message observed from this source.';

create index if not exists live_telegram_channel_registry_auto_status_idx
  on public.live_telegram_channel_registry(auto_admission_status, enabled);

create index if not exists live_telegram_channel_registry_country_idx
  on public.live_telegram_channel_registry(country_iso3, auto_admission_status);

create index if not exists live_telegram_channel_registry_health_idx
  on public.live_telegram_channel_registry(last_health_at, last_seen_at);
