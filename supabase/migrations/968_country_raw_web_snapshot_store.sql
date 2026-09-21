begin;

insert into public.live_source_registry (
  source_key,source_name,provider,source_type,base_url,enabled,cadence_seconds,
  raw_storage_policy,redistribution_allowed,derivative_intelligence_allowed,
  attribution_required,notes
)
values (
  'country_raw_web_mesh',
  'Country Raw Web Source Mesh',
  'Geomacro internal acquisition layer',
  'news_discovery',
  'https://geomacro.live/',
  true,
  60,
  'internal_only',
  false,
  true,
  true,
  'Private acquisition transport for country-scoped public web sources. It is not itself a third-party factual source and is never included in the required commercial certification universe.'
)
on conflict (source_key) do update set
  enabled=true,
  cadence_seconds=60,
  updated_at=now();

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
  on public.live_raw_source_snapshots(target_id,fetched_at desc);

create index if not exists live_raw_source_snapshots_country_category_idx
  on public.live_raw_source_snapshots(country_iso3,category,fetched_at desc);

comment on table public.live_raw_source_snapshots is
  'Private immutable-ish raw web acquisition snapshots. These bytes are internal evidence and are never customer-delivered as a raw source feed.';

commit;
