-- =============================================================================
-- Geomacro Country Flash Intelligence
--
-- Adds a fast, provenance-preserving intake layer for breaking geopolitical
-- flashes without allowing unverified fast-wire content to directly contaminate
-- commercial country-state / GRO / Risk Gate calculations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Source-governance updates.
-- -----------------------------------------------------------------------------

update public.live_external_sources
set
  authentication_type = 'APPNAME',
  base_url = 'https://api.reliefweb.int/v2/',
  enabled_for_ingestion = true,
  enabled_for_commercial_signals = false,
  freshness_class = 'NEAR_REAL_TIME',
  notes = 'ReliefWeb API V2 metadata/context ingestion. Requires a pre-approved appname. Original partner reports may be copyrighted, so raw redistribution remains disabled and commercial signal use remains gated pending source-rights review.',
  updated_at = now()
where source_id = 'reliefweb';

update public.live_external_sources
set
  authentication_type = 'OAUTH',
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  notes = 'ACLED programmatic API authentication now uses OAuth. Keep disabled for Geomacro commercial production unless an access tier/licence explicitly permits the intended commercial use.',
  updated_at = now()
where source_id = 'acled';

insert into public.live_external_sources (
  source_id,
  source_name,
  provider_name,
  category,
  access_type,
  authentication_type,
  base_url,
  licence_name,
  commercial_usage_status,
  raw_redistribution_allowed,
  attribution_required,
  enabled_for_ingestion,
  enabled_for_commercial_signals,
  country_scope,
  freshness_class,
  notes
)
values
(
  'telegram_mtproto_flash',
  'Telegram MTProto Flash Intake',
  'Configured public Telegram channels',
  'GEOPOLITICS',
  'API',
  'MTPROTO_USER_SESSION',
  'https://core.telegram.org/mtproto',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'REAL_TIME',
  'Allowlist-only server-side listener for channels Geomacro is permitted to monitor. Each channel retains its own rights/provenance status. Fast-wire items enter as UNVERIFIED and cannot directly drive commercial risk signals.'
),
(
  'liveuamap_api',
  'Liveuamap API',
  'Liveuamap',
  'GEOPOLITICS',
  'API',
  'API_KEY',
  'https://liveuamap.com/',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'REAL_TIME',
  'Optional paid upgrade only. Not part of the free-first baseline and disabled until a commercial API plan and reuse rights are explicitly approved.'
)
on conflict (source_id)
do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  licence_name = excluded.licence_name,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = excluded.raw_redistribution_allowed,
  attribution_required = excluded.attribution_required,
  enabled_for_ingestion = excluded.enabled_for_ingestion,
  enabled_for_commercial_signals = excluded.enabled_for_commercial_signals,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();


-- -----------------------------------------------------------------------------
-- Fast flash event store.
--
-- One source message can affect multiple countries, so country attribution is
-- normalized into a bridge table instead of forcing one country per flash.
-- -----------------------------------------------------------------------------

create table if not exists public.live_flash_events (
  flash_id text primary key,

  source_id text not null
    references public.live_external_sources(source_id),

  source_record_id text not null,

  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  headline text not null,
  body text,

  source_channel text,
  source_url text,

  event_type text,

  severity numeric(6,3)
    check (
      severity is null
      or (
        severity >= 0
        and severity <= 100
      )
    ),

  source_reliability numeric(6,3)
    check (
      source_reliability is null
      or (
        source_reliability >= 0
        and source_reliability <= 100
      )
    ),

  verification_status text not null default 'UNVERIFIED'
    check (
      verification_status in (
        'UNVERIFIED',
        'CORROBORATING',
        'VERIFIED',
        'REJECTED'
      )
    ),

  latitude double precision,
  longitude double precision,

  commodity_tags text[] not null default '{}',

  raw_payload jsonb,

  content_hash text not null
    check (
      content_hash ~ '^[a-f0-9]{64}$'
    ),

  unique (source_id, source_record_id),

  check (
    latitude is null
    or (
      latitude >= -90
      and latitude <= 90
    )
  ),

  check (
    longitude is null
    or (
      longitude >= -180
      and longitude <= 180
    )
  )
);

create table if not exists public.live_flash_event_countries (
  flash_id text not null
    references public.live_flash_events(flash_id)
    on delete cascade,

  country_iso3 text not null
    references public.live_country_registry(iso3),

  is_primary boolean not null default false,

  confidence numeric(6,3) not null
    check (
      confidence >= 0
      and confidence <= 100
    ),

  attribution_method text not null,

  created_at timestamptz not null default now(),

  primary key (flash_id, country_iso3)
);

create index if not exists
  live_flash_events_published_idx
on public.live_flash_events (
  published_at desc,
  ingested_at desc
);

create index if not exists
  live_flash_events_verification_idx
on public.live_flash_events (
  verification_status,
  published_at desc
);

create index if not exists
  live_flash_events_source_idx
on public.live_flash_events (
  source_id,
  published_at desc
);

create index if not exists
  live_flash_event_countries_country_idx
on public.live_flash_event_countries (
  country_iso3,
  flash_id
);

alter table public.live_flash_events
  enable row level security;

alter table public.live_flash_event_countries
  enable row level security;

comment on table public.live_flash_events is
  'Internal low-latency breaking-flash intake. UNVERIFIED fast-wire content is quarantined from commercial scoring until corroborated.';

comment on table public.live_flash_event_countries is
  'Many-to-many country attribution for low-latency flash events with explicit confidence and method.';
