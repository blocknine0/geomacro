-- =============================================================================
-- Geomacro Flash Corroboration Graph
--
-- Purpose:
--   Fast/unofficial sources are allowed into live_flash_events immediately.
--   Promotion is evidence-based and requires independent corroboration.
--
-- Sources of corroboration:
--   1. another live_flash_event from a different source_id
--   2. an existing live_structured_event, normally backed by GDELT evidence
--
-- Nothing in this migration grants direct scoring eligibility.
-- =============================================================================

alter table public.live_flash_events
  add column if not exists verification_score numeric(6,3)
    check (
      verification_score is null
      or (
        verification_score >= 0
        and verification_score <= 100
      )
    ),
  add column if not exists corroboration_count integer not null default 0
    check (corroboration_count >= 0),
  add column if not exists independent_source_count integer not null default 1
    check (independent_source_count >= 1),
  add column if not exists verified_at timestamptz,
  add column if not exists verification_reason text;

create table if not exists public.live_flash_corroborations (
  id bigint generated always as identity primary key,

  flash_id text not null
    references public.live_flash_events(flash_id)
    on delete cascade,

  corroboration_kind text not null
    check (
      corroboration_kind in (
        'FLASH',
        'STRUCTURED_EVENT'
      )
    ),

  corroborating_flash_id text
    references public.live_flash_events(flash_id)
    on delete cascade,

  structured_event_id uuid
    references public.live_structured_events(id)
    on delete cascade,

  corroborating_source_id text not null,

  similarity numeric(6,5) not null
    check (
      similarity >= 0
      and similarity <= 1
    ),

  country_overlap boolean not null default false,

  time_delta_seconds integer
    check (
      time_delta_seconds is null
      or time_delta_seconds >= 0
    ),

  relationship_method text not null,

  created_at timestamptz not null default now(),

  check (
    (
      corroboration_kind = 'FLASH'
      and corroborating_flash_id is not null
      and structured_event_id is null
    )
    or
    (
      corroboration_kind = 'STRUCTURED_EVENT'
      and structured_event_id is not null
      and corroborating_flash_id is null
    )
  ),

  check (
    corroborating_flash_id is null
    or corroborating_flash_id <> flash_id
  )
);

create unique index if not exists
  live_flash_corroborations_flash_pair_uidx
on public.live_flash_corroborations (
  flash_id,
  corroborating_flash_id
)
where corroboration_kind = 'FLASH';

create unique index if not exists
  live_flash_corroborations_structured_uidx
on public.live_flash_corroborations (
  flash_id,
  structured_event_id
)
where corroboration_kind = 'STRUCTURED_EVENT';

create index if not exists
  live_flash_corroborations_flash_idx
on public.live_flash_corroborations (
  flash_id,
  created_at desc
);

create index if not exists
  live_flash_verification_idx
on public.live_flash_events (
  verification_status,
  verification_score desc,
  published_at desc
);

alter table public.live_flash_corroborations
  enable row level security;

comment on table public.live_flash_corroborations is
  'Deterministic evidence links used to promote breaking flashes only after independent corroboration.';

comment on column public.live_flash_events.verification_score is
  'Deterministic 0-100 corroboration score. This is not the GRI and does not itself imply commercial scoring eligibility.';
