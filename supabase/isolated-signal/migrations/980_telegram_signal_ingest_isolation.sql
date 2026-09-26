-- =============================================================================
-- Geomacro Telegram Signal Ingest Isolation
--
-- The signal project is a raw/current intake boundary. It is deliberately
-- independent from the authoritative production Supabase project.
-- Raw Telegram content never becomes commercial intelligence by itself.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.live_external_sources (
  source_id text primary key,
  source_name text not null,
  provider_name text not null,
  category text not null,
  access_type text not null,
  authentication_type text not null,
  base_url text,
  licence_name text,
  commercial_usage_status text,
  raw_redistribution_allowed boolean not null default false,
  attribution_required boolean not null default true,
  enabled_for_ingestion boolean not null default false,
  enabled_for_commercial_signals boolean not null default false,
  country_scope text,
  freshness_class text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, commercial_usage_status,
  raw_redistribution_allowed, attribution_required,
  enabled_for_ingestion, enabled_for_commercial_signals,
  country_scope, freshness_class, notes
) values (
  'telegram_mtproto_flash',
  'Telegram MTProto Flash Intake',
  'Configured public Telegram channels',
  'GEOPOLITICS',
  'API',
  'MTPROTO_USER_SESSION',
  'https://core.telegram.org/mtproto',
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'REAL_TIME',
  'Raw/current signal intake only. Every item is UNVERIFIED and requires independent corroboration. Raw Telegram content is not customer-facing.'
), (
  'aljazeera_rss',
  'Al Jazeera RSS',
  'Al Jazeera',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Independent corroboration/feed intake only.'
), (
  'federal_reserve_press_rss',
  'Federal Reserve Press Releases',
  'Federal Reserve',
  'MACRO',
  'RSS',
  'NONE',
  'https://www.federalreserve.gov/feeds/press_all.xml',
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'USA',
  'NEAR_REAL_TIME',
  'Independent corroboration/feed intake only.'
), (
  'forexlive_rss',
  'ForexLive RSS',
  'ForexLive',
  'MACRO',
  'RSS',
  'NONE',
  'https://www.forexlive.com/feed/news',
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Independent corroboration/feed intake only.'
), (
  'usgs_minerals_news_rss',
  'USGS Minerals News RSS',
  'USGS',
  'CRITICAL_MINERALS',
  'RSS',
  'NONE',
  'https://www.usgs.gov/news/minerals/feed',
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Independent corroboration/feed intake only.'
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
  enabled_for_ingestion = excluded.enabled_for_ingestion,
  enabled_for_commercial_signals = excluded.enabled_for_commercial_signals,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

create table if not exists public.live_telegram_channel_registry (
  channel_key text primary key check (channel_key = lower(channel_key)),
  display_name text not null,
  official_status text not null check (
    official_status in ('OFFICIAL','UNVERIFIED_OWNERSHIP','UNOFFICIAL_RELAY')
  ),
  rights_status text not null check (
    rights_status in ('INTERNAL_RESEARCH_ONLY','DERIVED_ONLY','COMMERCIAL_OK','REVIEW_REQUIRED')
  ),
  source_reliability numeric(6,3) not null check (source_reliability >= 0 and source_reliability <= 100),
  domains text[] not null default '{}',
  enabled boolean not null default false,
  manual_review_status text not null default 'PENDING' check (
    manual_review_status in ('PENDING','APPROVED','REJECTED')
  ),
  manual_reviewed_at timestamptz,
  manual_reviewed_by text,
  manual_review_reference text,
  telegram_public_channel_key text,
  telegram_public_source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    manual_review_status <> 'APPROVED'
    or (
      enabled = true
      and telegram_public_channel_key is not null
      and telegram_public_source_url like 'https://t.me/%'
    )
  )
);

alter table public.live_telegram_channel_registry enable row level security;

create table if not exists public.live_flash_events (
  flash_id text primary key,
  source_id text not null references public.live_external_sources(source_id),
  source_record_id text not null,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  headline text not null,
  body text,
  source_channel text,
  source_url text,
  event_type text,
  severity numeric(6,3) check (severity is null or (severity >= 0 and severity <= 100)),
  source_reliability numeric(6,3) check (source_reliability is null or (source_reliability >= 0 and source_reliability <= 100)),
  verification_status text not null default 'UNVERIFIED' check (
    verification_status in ('UNVERIFIED','CORROBORATING','VERIFIED','REJECTED')
  ),
  latitude double precision,
  longitude double precision,
  commodity_tags text[] not null default '{}',
  raw_payload jsonb,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  verification_score numeric(6,3) check (verification_score is null or (verification_score >= 0 and verification_score <= 100)),
  corroboration_count integer not null default 0 check (corroboration_count >= 0),
  independent_source_count integer not null default 1 check (independent_source_count >= 1),
  verified_at timestamptz,
  verification_reason text,
  unique (source_id, source_record_id),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create index if not exists live_flash_events_published_idx
  on public.live_flash_events(published_at desc, ingested_at desc);
create index if not exists live_flash_events_verification_idx
  on public.live_flash_events(verification_status, published_at desc);
create index if not exists live_flash_events_source_idx
  on public.live_flash_events(source_id, published_at desc);

create table if not exists public.live_flash_event_countries (
  flash_id text not null references public.live_flash_events(flash_id) on delete cascade,
  country_iso3 text not null check (country_iso3 ~ '^[A-Z]{3}$'),
  is_primary boolean not null default false,
  confidence numeric(6,3) not null check (confidence between 0 and 100),
  attribution_method text not null,
  created_at timestamptz not null default now(),
  primary key (flash_id, country_iso3)
);

create index if not exists live_flash_event_countries_country_idx
  on public.live_flash_event_countries(country_iso3, flash_id);

create table if not exists public.live_flash_corroborations (
  id bigint generated always as identity primary key,
  flash_id text not null references public.live_flash_events(flash_id) on delete cascade,
  corroboration_kind text not null check (corroboration_kind = 'FLASH'),
  corroborating_flash_id text not null references public.live_flash_events(flash_id) on delete cascade,
  structured_event_id uuid,
  corroborating_source_id text not null,
  similarity numeric(6,5) not null check (similarity between 0 and 1),
  country_overlap boolean not null default false,
  time_delta_seconds integer check (time_delta_seconds is null or time_delta_seconds >= 0),
  relationship_method text not null,
  created_at timestamptz not null default now(),
  check (corroborating_flash_id <> flash_id),
  unique (flash_id, corroborating_flash_id)
);

create index if not exists live_flash_corroborations_flash_idx
  on public.live_flash_corroborations(flash_id, created_at desc);

alter table public.live_flash_events enable row level security;
alter table public.live_flash_event_countries enable row level security;
alter table public.live_flash_corroborations enable row level security;

comment on table public.live_flash_events is
  'Isolated raw/current flash intake. This project is not the authoritative production intelligence database.';
comment on table public.live_telegram_channel_registry is
  'Server-side manual Telegram allowlist. Candidates remain PENDING until explicitly reviewed.';
comment on table public.live_flash_corroborations is
  'Independent-source corroboration graph inside the isolated signal project.';
