-- =============================================================================
-- Geomacro Live External Intelligence Source Layer
--
-- PURPOSE
-- Current/live external observations only.
-- Historical backfill remains in the separate private historical-data repo.
--
-- PRINCIPLE
-- External raw observation
--   -> normalization
--   -> country attribution
--   -> provenance / licence gate
--   -> structured Geomacro intelligence
--   -> GRO
--   -> Risk Gate
--
-- Raw third-party datasets are not the customer product.
-- =============================================================================

create table if not exists public.live_external_sources (
  source_id text primary key,

  source_name text not null,
  provider_name text not null,

  category text not null
    check (
      category in (
        'GEOPOLITICS',
        'MACRO',
        'CRITICAL_MINERALS',
        'MULTI_DOMAIN'
      )
    ),

  access_type text not null
    check (
      access_type in (
        'API',
        'BULK_DOWNLOAD',
        'XML',
        'CSV',
        'JSON',
        'SDMX',
        'RSS',
        'HTML',
        'MIXED'
      )
    ),

  authentication_type text not null default 'NONE',

  base_url text,

  licence_name text,

  commercial_usage_status text not null
    check (
      commercial_usage_status in (
        'COMMERCIAL_OK',
        'DERIVED_ONLY',
        'PERMISSION_REQUIRED',
        'INTERNAL_RESEARCH_ONLY',
        'REVIEW_REQUIRED'
      )
    ),

  raw_redistribution_allowed boolean not null default false,

  attribution_required boolean not null default true,

  enabled_for_ingestion boolean not null default false,
  enabled_for_commercial_signals boolean not null default false,

  country_scope text not null default 'GLOBAL',

  freshness_class text not null default 'VARIABLE',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.live_external_observations (
  observation_id text primary key,

  source_id text not null
    references public.live_external_sources(source_id),

  source_record_id text,

  category text not null
    check (
      category in (
        'GEOPOLITICS',
        'MACRO',
        'CRITICAL_MINERALS'
      )
    ),

  country_iso3 text,

  partner_country_iso3 text,

  observed_at timestamptz,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),

  metric text,
  value_numeric numeric,
  value_text text,
  unit text,

  commodity text,

  event_type text,
  signal_type text,

  source_url text,

  provenance jsonb not null default '{}'::jsonb,
  raw_payload jsonb,

  raw_hash text not null,
  normalized_hash text not null,

  quality_status text not null default 'PENDING'
    check (
      quality_status in (
        'PENDING',
        'VERIFIED',
        'PARTIAL',
        'REJECTED'
      )
    ),

  commercial_eligibility_status text not null default 'UNVERIFIED'
    check (
      commercial_eligibility_status in (
        'UNVERIFIED',
        'VERIFIED',
        'DERIVED_ONLY',
        'BLOCKED'
      )
    ),

  unique (source_id, normalized_hash)
);


create index if not exists
  live_external_observations_country_idx
on public.live_external_observations (
  country_iso3,
  published_at desc
);


create index if not exists
  live_external_observations_category_idx
on public.live_external_observations (
  category,
  published_at desc
);


create index if not exists
  live_external_observations_source_idx
on public.live_external_observations (
  source_id,
  published_at desc
);


-- ---------------------------------------------------------------------------
-- Initial verified source registry.
-- enabled_for_commercial_signals remains conservative.
-- ---------------------------------------------------------------------------

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
values

(
  'gdelt_v2',
  'GDELT 2.0',
  'GDELT Project',
  'GEOPOLITICS',
  'MIXED',
  'NONE',
  'https://www.gdeltproject.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Use only after final commercial/reuse review. Existing Geomacro historical GDELT work remains separate.'
),

(
  'world_bank_indicators',
  'World Bank Indicators API',
  'World Bank',
  'MACRO',
  'API',
  'NONE',
  'https://api.worldbank.org/v2/',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Dataset-specific licence must still be retained in provenance.'
),

(
  'iea_critical_minerals',
  'Critical Minerals Dataset',
  'International Energy Agency',
  'CRITICAL_MINERALS',
  'BULK_DOWNLOAD',
  'NONE',
  'https://www.iea.org/data-and-statistics/data-product/critical-minerals-dataset',
  'CC BY 4.0',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'PERIODIC',
  'Critical Minerals Dataset only. Do not generalise this licence to unrelated IEA datasets.'
),

(
  'jrc_rmis_supply_chain',
  'RMIS Supply Chain Viewer',
  'European Commission Joint Research Centre',
  'CRITICAL_MINERALS',
  'MIXED',
  'NONE',
  'https://data.jrc.ec.europa.eu/',
  'European Commission reuse notice',
  'COMMERCIAL_OK',
  true,
  true,
  true,
  true,
  'GLOBAL',
  'PERIODIC',
  'Reuse subject to acknowledgement and any item-specific copyright notices.'
),

(
  'un_comtrade',
  'UN Comtrade',
  'United Nations Statistics Division',
  'MULTI_DOMAIN',
  'API',
  'MIXED',
  'https://comtradeapi.un.org/',
  null,
  'DERIVED_ONLY',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Keep disabled until exact API tier and redistribution/derived-output terms are recorded.'
),

(
  'bgs_world_minerals',
  'World Mineral Statistics',
  'British Geological Survey',
  'CRITICAL_MINERALS',
  'MIXED',
  'NONE',
  'https://www.bgs.ac.uk/',
  null,
  'PERMISSION_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Do not enable for commercial production without permission.'
),

(
  'wto_timeseries',
  'WTO Timeseries',
  'World Trade Organization',
  'MACRO',
  'API',
  'API_KEY',
  'https://api.wto.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Commercial reuse status must be cleared before production enablement.'
),

(
  'imf_data',
  'IMF Data',
  'International Monetary Fund',
  'MACRO',
  'SDMX',
  'MIXED',
  'https://www.imf.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'SOURCE_DEPENDENT',
  'Dataset-specific terms must be reviewed before commercial enablement.'
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
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();


alter table public.live_external_sources
  enable row level security;

alter table public.live_external_observations
  enable row level security;


comment on table public.live_external_sources is
  'Governed registry of current/live external intelligence sources used by Geomacro.';

comment on table public.live_external_observations is
  'Normalized current/live external observations. Customer-facing products consume structured Geomacro intelligence rather than acting as raw third-party dataset resale.';
