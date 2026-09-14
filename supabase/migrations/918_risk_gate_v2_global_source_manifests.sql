begin;

-- Global Risk Gate support must distinguish "no observed event" from
-- "source was not checked". Persist one immutable-ish release manifest per
-- governed source release so module builders can rely on explicit completeness
-- evidence rather than treating missing rows as zero risk.
create table if not exists public.live_source_release_manifests (
  source_id text not null
    references public.live_external_sources(source_id),
  release_id text not null,
  dataset_version text,
  retrieved_at timestamptz not null,
  coverage_start timestamptz,
  coverage_end timestamptz,
  rows_downloaded integer not null default 0
    check (rows_downloaded >= 0),
  rows_normalized integer not null default 0
    check (rows_normalized >= 0),
  verified_rows integer not null default 0
    check (verified_rows >= 0),
  partial_rows integer not null default 0
    check (partial_rows >= 0),
  rejected_rows integer not null default 0
    check (rejected_rows >= 0),
  unmapped_rows integer not null default 0
    check (unmapped_rows >= 0),
  write_completed boolean not null default false,
  manifest_hash text not null
    check (manifest_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, release_id),
  check (
    coverage_start is null
    or coverage_end is null
    or coverage_start <= coverage_end
  )
);

alter table public.live_source_release_manifests
  enable row level security;

revoke all on public.live_source_release_manifests
  from public, anon, authenticated;
grant select, insert, update on public.live_source_release_manifests
  to service_role;

create index if not exists
  live_source_release_manifests_latest_idx
on public.live_source_release_manifests (
  source_id,
  coverage_end desc,
  retrieved_at desc
)
where write_completed = true;

-- WGI is governed separately from ordinary WDI source=2. Only the exact
-- Worldwide Governance Indicators political-stability dataset/API contract
-- reviewed in COMMERCIAL_SOURCE_RIGHTS.md is enabled here.
insert into public.live_external_sources (
  source_id,
  source_name,
  provider_name,
  category,
  access_type,
  authentication_type,
  base_url,
  licence_name,
  commercial_usage_status,
  raw_redistribution_allowed,
  attribution_required,
  enabled_for_ingestion,
  enabled_for_commercial_signals,
  country_scope,
  freshness_class,
  notes
)
values (
  'world_bank_wgi_political_stability',
  'Worldwide Governance Indicators - Political Stability',
  'World Bank',
  'GEOPOLITICS',
  'API',
  'NONE',
  'https://api.worldbank.org/v2/',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  false,
  true,
  true,
  true,
  'GLOBAL',
  'ANNUAL',
  'WGI 2025 Revision political-stability bundle only. Derived Risk Gate use; do not generalize this commercial state to underlying third-party WGI source material.'
)
on conflict (source_id)
do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  licence_name = excluded.licence_name,
  commercial_usage_status = excluded.commercial_usage_status,
  raw_redistribution_allowed = excluded.raw_redistribution_allowed,
  attribution_required = excluded.attribution_required,
  enabled_for_ingestion = excluded.enabled_for_ingestion,
  enabled_for_commercial_signals = excluded.enabled_for_commercial_signals,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

comment on table public.live_source_release_manifests is
  'Release-level completeness evidence for governed global sources. A clean manifest can support an evidence-backed zero-observed-event state; absence of a manifest cannot.';

commit;
