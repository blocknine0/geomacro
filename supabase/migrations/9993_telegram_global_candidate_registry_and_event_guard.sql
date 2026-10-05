-- =============================================================================
-- #1414 Section 5: global Telegram candidate registry + per-event authorization
--
-- Discovery is not authorization. This registry may grow globally across the
-- three commercial domains without activating public scraping or commercial
-- use. Every accepted Telegram event must belong to an explicitly authorized
-- channel, and still enters as UNVERIFIED supplementary lead evidence.
-- =============================================================================

create table if not exists public.live_telegram_source_candidates (
  candidate_key text primary key,
  telegram_username text not null unique,
  public_url text not null,
  publisher_name text not null,
  category text not null check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  country_iso3 text references public.live_country_registry(iso3),
  official_evidence_url text,
  official_evidence_type text not null default 'DISCOVERY_ONLY'
    check (official_evidence_type in ('OFFICIAL_SITE_LINK','OFFICIAL_DOCUMENT','PUBLISHER_CONFIRMATION','DISCOVERY_ONLY')),
  discovery_method text not null,
  candidate_status text not null default 'DISCOVERED'
    check (candidate_status in ('DISCOVERED','IDENTITY_VERIFIED','AUTHORIZATION_PENDING','AUTHORIZED','REJECTED')),
  publisher_authorized boolean not null default false,
  authorization_reference text,
  activation_status text not null default 'DISABLED'
    check (activation_status in ('DISABLED','READY_FOR_REVIEW','ACTIVE')),
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  notes text,
  check (
    activation_status <> 'ACTIVE'
    or (
      candidate_status = 'AUTHORIZED'
      and publisher_authorized = true
      and authorization_reference is not null
      and length(trim(authorization_reference)) > 0
      and official_evidence_type <> 'DISCOVERY_ONLY'
    )
  )
);

comment on table public.live_telegram_source_candidates is
  'Discovery-only global Telegram source registry across the three Geomacro domains. Presence here never authorizes ingestion or commercial use.';

alter table public.live_flash_events
  add column if not exists source_channel_key text;

create or replace function public.enforce_telegram_event_channel_authorization()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  channel public.live_telegram_channel_registry%rowtype;
  normalized_key text;
begin
  if new.source_id = 'telegram_mtproto_flash' then
    raise exception 'PUBLIC_TELEGRAM_MTPROTO_DISABLED';
  end if;

  if new.source_id = 'telegram_authorized_publisher_feed' then
    normalized_key := lower(trim(coalesce(new.source_channel_key, new.source_channel, '')));
    normalized_key := regexp_replace(normalized_key, '^@+', '');

    if normalized_key = '' or normalized_key !~ '^[a-z0-9_]{5,32}$' then
      raise exception 'TELEGRAM_AUTHORIZED_EVENT_CHANNEL_REQUIRED';
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
      raise exception 'TELEGRAM_EVENT_PUBLISHER_AUTHORIZATION_INVALID:%', normalized_key;
    end if;

    new.verification_status := 'UNVERIFIED';
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_telegram_event_channel_authorization on public.live_flash_events;
create trigger trg_enforce_telegram_event_channel_authorization
before insert or update of source_id, source_channel_key, source_channel, verification_status
on public.live_flash_events
for each row
when (new.source_id in ('telegram_mtproto_flash', 'telegram_authorized_publisher_feed'))
execute function public.enforce_telegram_event_channel_authorization();

create or replace view public.live_telegram_governance_status as
select
  (select count(*) from public.live_telegram_channel_registry) as channel_registry_rows,
  (select count(*) from public.live_telegram_channel_registry where enabled) as enabled_channels,
  (select count(*) from public.live_telegram_channel_registry where enabled and (manual_review_status <> 'APPROVED' or publisher_authorized is not true)) as unsafe_enabled_channels,
  (select count(*) from public.live_external_sources where source_id='telegram_mtproto_flash' and enabled_for_ingestion) as legacy_mtproto_enabled,
  (select count(*) from public.live_external_sources where source_id like 'telegram%' and enabled_for_commercial_signals) as telegram_commercial_sources,
  (select count(*) from public.live_telegram_source_candidates) as candidate_rows,
  (select count(*) from public.live_telegram_source_candidates where activation_status='ACTIVE') as active_candidates;
