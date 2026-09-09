-- =============================================================================
-- Geomacro Telegram Flash Channel Registry
--
-- Telegram is a lead/flash intake surface, not an automatic truth source.
-- Every monitored channel must be explicitly allowlisted with provenance and a
-- bounded source-reliability prior. Nothing from this table directly enters GRI.
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
  'High-speed conflict-location lead source. Channel exists publicly as @liveuamap, but Geomacro has not independently established channel ownership/licensing. Use only as an unverified lead requiring corroboration.'
),
(
  'financialjuice',
  'FinancialJuice relay',
  'UNOFFICIAL_RELAY',
  'INTERNAL_RESEARCH_ONLY',
  45,
  array['MACRO', 'GEOPOLITICS'],
  true,
  'The public channel description states that it is an automated Twitter-to-Telegram feed with no affiliation. Treat only as a discovery relay; never present it as an official FinancialJuice wire or let it directly drive scores.'
),
(
  'reutersworldchannel',
  'Reuters World relay',
  'UNOFFICIAL_RELAY',
  'INTERNAL_RESEARCH_ONLY',
  35,
  array['GEOPOLITICS'],
  false,
  'Explicitly disabled. The public channel description states that it is not an official Reuters channel. Reuters detection should come through the existing governed GDELT layer or a future licensed Reuters product.'
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
  'Server-side Telegram channel allowlist and provenance/reliability registry for unverified flash intake. Never an automatic scoring whitelist.';
