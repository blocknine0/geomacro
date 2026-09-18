-- =============================================================================
-- Telegram -> Main controlled alignment boundary
--
-- The dedicated Telegram signal project is an intake/evidence system.
-- Main Supabase remains the authoritative production publisher.
-- Only independently corroborated, VERIFIED signals may be recorded here.
-- Raw Telegram body/media is never copied into this table.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.telegram_signal_alignment (
  id uuid primary key default gen_random_uuid(),

  signal_project_ref text not null
    check (signal_project_ref = 'qogpagklwbfdmrgnrhzi'),

  signal_flash_id text not null,
  signal_content_hash text not null
    check (signal_content_hash ~ '^[a-f0-9]{64}$'),

  source_channel text,
  source_url text,
  published_at timestamptz,

  verification_status text not null
    check (verification_status = 'VERIFIED'),
  verification_score_bps smallint not null
    check (verification_score_bps between 6500 and 10000),
  corroboration_count integer not null
    check (corroboration_count >= 1),
  independent_source_count integer not null
    check (independent_source_count >= 2),
  verification_reason text,

  corroboration_evidence jsonb not null default '[]'::jsonb,

  main_structured_event_id uuid
    references public.live_structured_events(id)
    on delete restrict,

  match_score_bps smallint not null
    check (match_score_bps between 0 and 10000),

  matched_country_iso3 text
    check (
      matched_country_iso3 is null
      or matched_country_iso3 ~ '^[A-Z]{3}$'
    ),

  alignment_policy_version text not null
    default 'telegram-main-alignment-v1.0.0',

  alignment_status text not null default 'ALIGNED'
    check (alignment_status in ('ALIGNED', 'QUARANTINED')),

  quarantine_reason text,

  alignment_sha256 text not null
    check (alignment_sha256 ~ '^[a-f0-9]{64}$'),

  aligned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (signal_project_ref, signal_flash_id),

  check (
    (alignment_status = 'ALIGNED' and main_structured_event_id is not null)
    or alignment_status = 'QUARANTINED'
  ),

  check (
    alignment_status <> 'QUARANTINED'
    or quarantine_reason is not null
  )
);

create index if not exists telegram_signal_alignment_event_idx
  on public.telegram_signal_alignment(main_structured_event_id, aligned_at desc);

create index if not exists telegram_signal_alignment_status_idx
  on public.telegram_signal_alignment(alignment_status, aligned_at desc);

create index if not exists telegram_signal_alignment_hash_idx
  on public.telegram_signal_alignment(signal_content_hash);

alter table public.telegram_signal_alignment enable row level security;

create or replace function public.prevent_telegram_signal_alignment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'telegram signal alignment records are immutable';
end;
$$;

drop trigger if exists telegram_signal_alignment_immutable
  on public.telegram_signal_alignment;

create trigger telegram_signal_alignment_immutable
before update or delete
on public.telegram_signal_alignment
for each row
execute function public.prevent_telegram_signal_alignment_mutation();

comment on table public.telegram_signal_alignment is
  'Immutable controlled alignment ledger from the isolated Telegram signal project into authoritative Main Supabase. Only VERIFIED independently corroborated signals may be ALIGNED. Raw Telegram content is prohibited.';
comment on column public.telegram_signal_alignment.corroboration_evidence is
  'Compact provenance/evidence snapshot only. Must not contain raw Telegram body, media, or payload.';
comment on column public.telegram_signal_alignment.alignment_sha256 is
  'SHA-256 of the canonical alignment envelope used to make the alignment auditable and reproducible.';
