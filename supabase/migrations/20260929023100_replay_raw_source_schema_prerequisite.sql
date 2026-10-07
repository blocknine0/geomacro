begin;

-- Replay compatibility for the legacy 967/968 raw-source migrations.
-- Older local Supabase migration runners do not apply those short-version
-- filenames in the timestamped chain. Production instances that already have
-- these tables are unchanged because every operation below is idempotent.

create table if not exists public.live_raw_source_targets (
  target_id text primary key,
  country_iso3 text not null
    references public.live_country_registry(iso3),
  category text not null
    check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  transport text not null
    check (transport in ('WEB','RSS','API','TELEGRAM_DISCOVERY','GLOBAL_FALLBACK')),
  source_id text references public.live_external_sources(source_id),
  target_url text,
  telegram_query text,
  display_name text not null,
  enabled boolean not null default true,
  raw_storage_allowed boolean not null default true,
  commercial_promotion_allowed boolean not null default false,
  cadence_seconds integer not null default 300
    check (cadence_seconds between 60 and 86400),
  priority integer not null default 50
    check (priority between 1 and 1000),
  discovery_state text not null default 'DISCOVERED'
    check (discovery_state in ('DISCOVERED','REACHABLE','UNREACHABLE','STALE','BLOCKED')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_observed_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_raw_source_targets_due_idx
  on public.live_raw_source_targets(enabled, last_attempt_at);

create index if not exists live_raw_source_targets_country_category_idx
  on public.live_raw_source_targets(country_iso3, category);

create index if not exists live_raw_source_targets_transport_idx
  on public.live_raw_source_targets(transport, enabled);

create table if not exists public.live_raw_source_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  target_id text not null references public.live_raw_source_targets(target_id) on delete cascade,
  country_iso3 text not null references public.live_country_registry(iso3),
  category text not null check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  fetched_at timestamptz not null,
  source_url text not null,
  http_status integer not null check (http_status >= 100 and http_status <= 599),
  content_type text,
  etag text,
  last_modified text,
  storage_bucket text not null default 'geomacro-live-intelligence',
  object_path text not null unique,
  byte_count integer not null check (byte_count >= 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  parser_status text not null default 'RAW_CAPTURED'
    check (parser_status in ('RAW_CAPTURED','HTML_LINKS_EXTRACTED','STRUCTURED_PAYLOAD','FAILED_PARSE')),
  extracted_item_count integer not null default 0 check (extracted_item_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists live_raw_source_snapshots_target_time_idx
  on public.live_raw_source_snapshots(target_id, fetched_at desc);

create index if not exists live_raw_source_snapshots_country_category_idx
  on public.live_raw_source_snapshots(country_iso3, category, fetched_at desc);

comment on table public.live_raw_source_snapshots is
  'Private raw web acquisition snapshots used as internal evidence; never a customer raw-feed entitlement.';

commit;
