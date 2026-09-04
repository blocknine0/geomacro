-- Geomacro Live Intelligence
-- Country attribution + structured-event evidence foundation.

create table if not exists public.live_country_registry (
  iso2 text primary key
    check (iso2 ~ '^[A-Z]{2}$'),

  iso3 text not null unique
    check (iso3 ~ '^[A-Z]{3}$'),

  country_name text not null unique,

  region text,
  subregion text,

  aliases text[] not null default '{}',
  demonyms text[] not null default '{}',

  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_structured_event_evidence (
  event_id uuid not null
    references public.live_structured_events(id)
    on delete cascade,

  fingerprint text not null
    check (fingerprint ~ '^[0-9a-f]{64}$'),

  fragment_id uuid not null
    references public.live_fragment_manifest(id),

  fragment_ordinal integer not null
    check (fragment_ordinal >= 0),

  source_domain text,
  source_url text,

  evidence_title text,
  evidence_published_at timestamptz,

  country_iso3 text
    references public.live_country_registry(iso3),

  country_confidence numeric(6,3)
    check (
      country_confidence is null
      or (
        country_confidence >= 0
        and country_confidence <= 100
      )
    ),

  country_method text,

  created_at timestamptz not null default now(),

  primary key (event_id, fingerprint)
);

create index if not exists live_event_evidence_fingerprint_idx
  on public.live_structured_event_evidence(fingerprint);

create index if not exists live_event_evidence_country_idx
  on public.live_structured_event_evidence(
    country_iso3,
    evidence_published_at desc
  );

alter table public.live_country_registry enable row level security;
alter table public.live_structured_event_evidence enable row level security;

comment on table public.live_country_registry is
  'Canonical country registry for current and forward Geomacro intelligence.';

comment on table public.live_structured_event_evidence is
  'Internal provenance bridge from structured intelligence to immutable compressed evidence.';
