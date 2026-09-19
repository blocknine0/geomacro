-- =============================================================================
-- Geomacro isolated Telegram automated admission
--
-- Replaces the old founder/manual-review activation dependency with the same
-- machine-governed admission state used by the authoritative registry.
-- Telegram remains an internal UNVERIFIED lead surface.
-- =============================================================================

alter table public.live_telegram_channel_registry
  add column if not exists auto_admission_status text not null default 'PENDING',
  add column if not exists source_role text,
  add column if not exists country_iso3 text,
  add column if not exists language text,
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
      check (
        source_role is null
        or source_role in (
          'official_authority',
          'publisher',
          'local_news',
          'regional_news',
          'independent_osint',
          'sector_signal'
        )
      );
  end if;
end
$$;

-- Preserve the old manual-review columns for backward compatibility, but they
-- no longer determine runtime admission. Public discovery remains conservative.
update public.live_telegram_channel_registry
set
  auto_admission_status = case
    when enabled = true
      and telegram_public_channel_key is not null
      and telegram_public_source_url like 'https://t.me/%'
    then 'ACTIVE'
    else 'PENDING'
  end,
  updated_at = now();

create index if not exists live_telegram_channel_registry_auto_admission_idx
  on public.live_telegram_channel_registry(auto_admission_status);

comment on column public.live_telegram_channel_registry.auto_admission_status is
  'Machine-governed runtime admission. ACTIVE permits internal lead ingestion; it does not verify events or grant commercial rights.';

comment on column public.live_telegram_channel_registry.manual_review_status is
  'Legacy compatibility field. It is retained for historical records but is not a runtime admission requirement.';
