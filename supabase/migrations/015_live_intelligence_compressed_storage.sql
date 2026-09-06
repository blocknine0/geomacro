-- Geomacro Live Intelligence
-- Permanent compressed evidence storage foundation.
-- Raw source evidence is internal-only.
-- Customer-facing delivery is structured intelligence only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PRIVATE IMMUTABLE EVIDENCE BUCKET
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'geomacro-live-intelligence',
  'geomacro-live-intelligence',
  false,
  26214400,
  array[
    'application/gzip',
    'application/x-gzip',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- SOURCE RIGHTS + INGESTION REGISTRY
-- ---------------------------------------------------------------------------

create table if not exists public.live_source_registry (
  source_key text primary key,
  source_name text not null,
  provider text not null,
  source_type text not null check (
    source_type in (
      'news_discovery',
      'official_government',
      'central_bank',
      'statistics_office',
      'international_org',
      'trade',
      'critical_minerals',
      'calendar'
    )
  ),

  base_url text not null,
  enabled boolean not null default true,
  cadence_seconds integer not null check (cadence_seconds >= 60),

  raw_storage_policy text not null default 'internal_only'
    check (raw_storage_policy in ('internal_only', 'prohibited')),

  redistribution_allowed boolean not null default false,
  derivative_intelligence_allowed boolean not null default true,
  attribution_required boolean not null default true,

  license_url text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_source_registry (
  source_key,
  source_name,
  provider,
  source_type,
  base_url,
  cadence_seconds,
  raw_storage_policy,
  redistribution_allowed,
  derivative_intelligence_allowed,
  attribution_required,
  notes
)
values (
  'gdelt_gal',
  'GDELT Article List (GAL)',
  'GDELT',
  'news_discovery',
  'https://data.gdeltproject.org/gdeltv3/gal',
  60,
  'internal_only',
  false,
  true,
  true,
  'Global near-realtime article discovery. GAL provides rolling global coverage; raw evidence remains internal and Geomacro distributes structured intelligence only.'
)
on conflict (source_key) do nothing;

-- ---------------------------------------------------------------------------
-- PERMANENT FRAGMENT MANIFEST
-- Actual evidence bytes live in private Supabase Storage as compressed files.
-- ---------------------------------------------------------------------------

create table if not exists public.live_fragment_manifest (
  id uuid primary key default gen_random_uuid(),

  source_key text not null
    references public.live_source_registry(source_key),

  stream_key text not null,

  storage_bucket text not null
    default 'geomacro-live-intelligence',

  object_path text not null unique,

  schema_version text not null default 'live-evidence-v1.0.0',
  compression text not null default 'gzip'
    check (compression in ('gzip')),

  period_start timestamptz not null,
  period_end timestamptz not null
    check (period_end >= period_start),

  item_count integer not null check (item_count >= 0),

  uncompressed_bytes bigint not null
    check (uncompressed_bytes >= 0),

  compressed_bytes bigint not null
    check (compressed_bytes >= 0),

  payload_sha256 text not null
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),

  compressed_sha256 text not null
    check (compressed_sha256 ~ '^[0-9a-f]{64}$'),

  previous_fragment_sha256 text
    check (
      previous_fragment_sha256 is null
      or previous_fragment_sha256 ~ '^[0-9a-f]{64}$'
    ),

  chain_sha256 text not null
    check (chain_sha256 ~ '^[0-9a-f]{64}$'),

  topics text[] not null default '{}',
  countries text[] not null default '{}',
  source_domains text[] not null default '{}',

  sealed_at timestamptz not null,
  verified_at timestamptz not null,

  verification_method text not null
    default 'storage-readback-sha256',

  created_at timestamptz not null default now(),

  constraint live_fragment_nonempty_hashes
    check (length(payload_sha256) = 64 and length(compressed_sha256) = 64)
);

create index if not exists live_fragment_source_time_idx
  on public.live_fragment_manifest(source_key, period_end desc);

create index if not exists live_fragment_period_idx
  on public.live_fragment_manifest(period_start, period_end);

-- Sealed canonical manifests are immutable.
create or replace function public.prevent_live_fragment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'sealed live intelligence fragments are immutable';
end;
$$;

drop trigger if exists live_fragment_immutable_update
  on public.live_fragment_manifest;

create trigger live_fragment_immutable_update
before update or delete
on public.live_fragment_manifest
for each row
execute function public.prevent_live_fragment_mutation();

-- ---------------------------------------------------------------------------
-- INGESTION RUN AUDIT
-- ---------------------------------------------------------------------------

create table if not exists public.live_ingestion_runs (
  id uuid primary key default gen_random_uuid(),

  source_key text not null
    references public.live_source_registry(source_key),

  stream_key text not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'empty')),

  window_start timestamptz,
  window_end timestamptz,

  items_seen integer not null default 0,
  items_accepted integer not null default 0,
  items_duplicate integer not null default 0,
  items_rejected integer not null default 0,

  fragment_id uuid
    references public.live_fragment_manifest(id),

  error_code text,
  error_detail text,

  metrics jsonb not null default '{}'::jsonb
);

create index if not exists live_ingestion_runs_source_idx
  on public.live_ingestion_runs(source_key, started_at desc);

-- ---------------------------------------------------------------------------
-- CURSOR + HEALTH
-- ---------------------------------------------------------------------------

create table if not exists public.live_ingestion_cursors (
  source_key text not null
    references public.live_source_registry(source_key),

  stream_key text not null,

  cursor jsonb not null default '{}'::jsonb,

  status text not null default 'unknown'
    check (status in ('unknown', 'healthy', 'degraded', 'failed')),

  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_item_at timestamptz,

  consecutive_failures integer not null default 0
    check (consecutive_failures >= 0),

  updated_at timestamptz not null default now(),

  primary key (source_key, stream_key)
);

-- ---------------------------------------------------------------------------
-- RECENT DEDUP CACHE
-- NOT canonical evidence. Safe to expire after canonical fragment sealing.
-- ---------------------------------------------------------------------------

create table if not exists public.live_recent_fingerprints (
  fingerprint text primary key
    check (fingerprint ~ '^[0-9a-f]{64}$'),

  source_key text not null
    references public.live_source_registry(source_key),

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  fragment_id uuid
    references public.live_fragment_manifest(id),

  expires_at timestamptz not null
);

create index if not exists live_recent_fingerprints_expiry_idx
  on public.live_recent_fingerprints(expires_at);

-- ---------------------------------------------------------------------------
-- STRUCTURED CUSTOMER-FACING INTELLIGENCE FOUNDATION
-- Raw source material must never be copied here.
-- ---------------------------------------------------------------------------

create table if not exists public.live_structured_events (
  id uuid primary key default gen_random_uuid(),

  story_key text not null unique
    check (story_key ~ '^[0-9a-f]{64}$'),

  domain text not null
    check (domain in ('geopolitics', 'macro', 'rare_earth', 'multi')),

  event_type text,
  title text not null,
  summary text,

  primary_country text,
  countries text[] not null default '{}',

  severity numeric(6,3)
    check (severity is null or (severity >= 0 and severity <= 100)),

  confidence numeric(6,3)
    check (confidence is null or (confidence >= 0 and confidence <= 100)),

  direction text
    check (
      direction is null
      or direction in ('escalating', 'cooling', 'steady', 'unknown')
    ),

  status text not null default 'active'
    check (status in ('active', 'monitoring', 'resolved', 'superseded')),

  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,

  evidence_count integer not null default 0
    check (evidence_count >= 0),

  independent_source_count integer not null default 0
    check (independent_source_count >= 0),

  evidence_refs jsonb not null default '[]'::jsonb,

  structure_version text not null default 'live-structure-v1.0.0',
  classification_version text,

  structured_payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_structured_events_time_idx
  on public.live_structured_events(last_seen_at desc);

create index if not exists live_structured_events_domain_idx
  on public.live_structured_events(domain, last_seen_at desc);

create index if not exists live_structured_events_country_idx
  on public.live_structured_events(primary_country, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- FORWARD / SCHEDULED EVENTS
-- Only confirmed or source-backed upcoming events belong here.
-- Predictions must remain separate.
-- ---------------------------------------------------------------------------

create table if not exists public.live_scheduled_events (
  id uuid primary key default gen_random_uuid(),

  source_key text
    references public.live_source_registry(source_key),

  external_id text,

  domain text not null
    check (domain in ('geopolitics', 'macro', 'rare_earth', 'multi')),

  event_type text not null,
  title text not null,

  primary_country text,
  countries text[] not null default '{}',

  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  source_timezone text,

  confirmation_status text not null default 'confirmed'
    check (
      confirmation_status in (
        'announced',
        'confirmed',
        'tentative'
      )
    ),

  lifecycle_status text not null default 'scheduled'
    check (
      lifecycle_status in (
        'scheduled',
        'delayed',
        'cancelled',
        'completed'
      )
    ),

  source_url text not null,
  source_authority text,

  announced_at timestamptz,
  last_checked_at timestamptz not null default now(),

  metrics jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_key, external_id)
);

create index if not exists live_scheduled_events_start_idx
  on public.live_scheduled_events(scheduled_start);

create index if not exists live_scheduled_events_domain_idx
  on public.live_scheduled_events(domain, scheduled_start);

-- ---------------------------------------------------------------------------
-- STORAGE PRESSURE POLICY
-- Never automatically delete sealed canonical fragments.
-- ---------------------------------------------------------------------------

create table if not exists public.live_storage_policy (
  singleton boolean primary key default true
    check (singleton = true),

  normal_until_pct numeric(5,2) not null default 70,
  aggressive_compaction_pct numeric(5,2) not null default 80,
  low_value_rejection_pct numeric(5,2) not null default 90,

  auto_delete_sealed_fragments boolean not null default false
    check (auto_delete_sealed_fragments = false),

  updated_at timestamptz not null default now()
);

insert into public.live_storage_policy(singleton)
values (true)
on conflict (singleton) do nothing;

-- ---------------------------------------------------------------------------
-- SECURITY
-- Internal tables are server-side only for now.
-- Later customer access goes through entitlement-aware server/API functions.
-- ---------------------------------------------------------------------------

alter table public.live_source_registry enable row level security;
alter table public.live_fragment_manifest enable row level security;
alter table public.live_ingestion_runs enable row level security;
alter table public.live_ingestion_cursors enable row level security;
alter table public.live_recent_fingerprints enable row level security;
alter table public.live_structured_events enable row level security;
alter table public.live_scheduled_events enable row level security;
alter table public.live_storage_policy enable row level security;

comment on table public.live_fragment_manifest is
  'Immutable catalog of permanent compressed internal evidence fragments.';

comment on table public.live_structured_events is
  'Structured Geomacro intelligence. Contains no raw publisher article bodies.';

comment on table public.live_scheduled_events is
  'Source-backed future events only. Forecasts and predictions are separate.';
