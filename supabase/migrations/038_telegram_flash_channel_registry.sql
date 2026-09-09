-- =============================================================================
-- Geomacro Telegram Flash Channel Registry
--
-- Telegram is a lead/flash intake surface, not an automatic truth source.
-- Source trust does not determine whether a lead can be ingested. It determines
-- how much independent corroboration is required before a flash is promoted.
-- Nothing from this table directly enters GRI/Risk Gate.
-- =============================================================================

create table if not exists public.live_telegram_channel_registry (
  channel_key text primary key
    check (channel_key = lower(channel_key)),

  display_name text not null,

  official_status text not null
    check (
      official_status in (
        'OFFICIAL',
        'UNVERIFIED_OWNERSHIP',
        'UNOFFICIAL_RELAY'
      )
    ),

  rights_status text not null
    check (
      rights_status in (
        'INTERNAL_RESEARCH_ONLY',
        'DERIVED_ONLY',
        'COMMERCIAL_OK',
        'REVIEW_REQUIRED'
      )
    ),

  source_reliability numeric(6,3) not null
    check (
      source_reliability >= 0
      and source_reliability <= 100
    ),

  domains text[] not null default '{}',

  enabled boolean not null default false,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_telegram_channel_registry (
  channel_key,
  display_name,
  official_status,
  rights_status,
  source_reliability,
  domains,
  enabled,
  notes
)
values
(
  'liveuamap',
  'Liveuamap',
  'UNVERIFIED_OWNERSHIP',
  'INTERNAL_RESEARCH_ONLY',
  60,
  array['GEOPOLITICS'],
  true,
  'High-speed conflict-location lead source. Ingest immediately, but require independent corroboration before promotion into verified country intelligence.'
),
(
  'financialjuice',
  'FinancialJuice relay',
  'UNOFFICIAL_RELAY',
  'INTERNAL_RESEARCH_ONLY',
  45,
  array['MACRO', 'GEOPOLITICS'],
  true,
  'Public channel description states that it is an automated Twitter-to-Telegram relay with no affiliation. Still useful for speed. Ingest as a lead and corroborate against independent feeds/official releases/GDELT before verification.'
),
(
  'reutersworldchannel',
  'Reuters World relay',
  'UNOFFICIAL_RELAY',
  'INTERNAL_RESEARCH_ONLY',
  35,
  array['GEOPOLITICS'],
  true,
  'Public channel states it is not official Reuters. That does not block internal lead ingestion. Treat every item as unverified and corroborate against GDELT, official sources or independent publishers before promotion.'
)
on conflict (channel_key)
do update set
  display_name = excluded.display_name,
  official_status = excluded.official_status,
  rights_status = excluded.rights_status,
  source_reliability = excluded.source_reliability,
  domains = excluded.domains,
  enabled = excluded.enabled,
  notes = excluded.notes,
  updated_at = now();

alter table public.live_telegram_channel_registry
  enable row level security;

comment on table public.live_telegram_channel_registry is
  'Server-side Telegram lead allowlist. Low source trust reduces verification weight but does not block ingestion; independent corroboration is mandatory before scoring.';
