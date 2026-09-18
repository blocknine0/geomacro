-- =============================================================================
-- Telegram signal storage hardening
--
-- Reuses Geomacro's compressed-first evidence pattern:
--   1. Supabase DB keeps only compact hot/index data.
--   2. Raw evidence is represented by hashes/provenance, never customer-facing.
--   3. Fractional values are stored as bounded integer units where practical.
--   4. Canonical compressed evidence is tracked by an immutable manifest.
-- =============================================================================

create extension if not exists pgcrypto;

-- Private compressed evidence bucket. The database remains the compact hot index.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'geomacro-telegram-signal',
  'geomacro-telegram-signal',
  false,
  26214400,
  array['application/gzip', 'application/x-gzip', 'application/octet-stream']
)
on conflict (id) do nothing;

create table if not exists public.live_signal_fragment_manifest (
  id uuid primary key default gen_random_uuid(),
  stream_key text not null,
  storage_bucket text not null default 'geomacro-telegram-signal',
  object_path text not null unique,
  compression text not null default 'gzip'
    check (compression in ('gzip')),
  schema_version text not null default 'telegram-signal-evidence-v1.0.0',
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end >= period_start),
  item_count integer not null check (item_count >= 0),
  uncompressed_bytes bigint not null check (uncompressed_bytes >= 0),
  compressed_bytes bigint not null check (compressed_bytes >= 0),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  compressed_sha256 text not null check (compressed_sha256 ~ '^[a-f0-9]{64}$'),
  previous_fragment_sha256 text check (
    previous_fragment_sha256 is null or previous_fragment_sha256 ~ '^[a-f0-9]{64}$'
  ),
  chain_sha256 text not null check (chain_sha256 ~ '^[a-f0-9]{64}$'),
  sealed_at timestamptz not null,
  verified_at timestamptz not null,
  verification_method text not null default 'storage-readback-sha256',
  created_at timestamptz not null default now()
);

create index if not exists live_signal_fragment_time_idx
  on public.live_signal_fragment_manifest(stream_key, period_end desc);

create or replace function public.prevent_live_signal_fragment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sealed signal fragments are immutable';
end;
$$;

drop trigger if exists live_signal_fragment_immutable
  on public.live_signal_fragment_manifest;

create trigger live_signal_fragment_immutable
before update or delete
on public.live_signal_fragment_manifest
for each row
execute function public.prevent_live_signal_fragment_mutation();

alter table public.live_signal_fragment_manifest enable row level security;

-- Compact fractional representation:
-- scores/confidence are hundredths of a point (0..10000).
-- coordinates are microdegrees (1e-6 degree).
alter table public.live_flash_events
  add column if not exists severity_bps smallint
    check (severity_bps is null or severity_bps between 0 and 10000),
  add column if not exists source_reliability_bps smallint
    check (source_reliability_bps is null or source_reliability_bps between 0 and 10000),
  add column if not exists verification_score_bps smallint
    check (verification_score_bps is null or verification_score_bps between 0 and 10000),
  add column if not exists latitude_e6 integer
    check (latitude_e6 is null or latitude_e6 between -90000000 and 90000000),
  add column if not exists longitude_e6 integer
    check (longitude_e6 is null or longitude_e6 between -180000000 and 180000000);

update public.live_flash_events
set
  severity_bps = case when severity is null then null else round(severity * 100)::smallint end,
  source_reliability_bps = case when source_reliability is null then null else round(source_reliability * 100)::smallint end,
  verification_score_bps = case when verification_score is null then null else round(verification_score * 100)::smallint end,
  latitude_e6 = case when latitude is null then null else round(latitude * 1000000)::integer end,
  longitude_e6 = case when longitude is null then null else round(longitude * 1000000)::integer end
where
  severity_bps is null
  or source_reliability_bps is null
  or verification_score_bps is null
  or latitude_e6 is null
  or longitude_e6 is null;

comment on column public.live_flash_events.severity_bps is
  'Compact fractional score: hundredths of a 0..100 score.';
comment on column public.live_flash_events.source_reliability_bps is
  'Compact fractional reliability: hundredths of a 0..100 score.';
comment on column public.live_flash_events.verification_score_bps is
  'Compact fractional verification score: hundredths of a 0..100 score.';
comment on column public.live_flash_events.latitude_e6 is
  'Compact coordinate: latitude multiplied by 1,000,000.';
comment on column public.live_flash_events.longitude_e6 is
  'Compact coordinate: longitude multiplied by 1,000,000.';

-- The signal project is a hot/current index, not a raw-text archive.
-- Keep columns for backward-compatible migration shape, but prohibit payload
-- retention at the ingest boundary. Canonical evidence belongs in compressed
-- fragments represented by live_signal_fragment_manifest.
comment on table public.live_signal_fragment_manifest is
  'Immutable catalog for private compressed Telegram signal fragments. Evidence bytes live in private Supabase Storage.';

comment on table public.live_flash_events is
  'Compact hot signal index only. Raw body/payload retention is prohibited at ingest; canonical evidence is compressed and manifest-addressed.';
