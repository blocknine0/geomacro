-- =============================================================================
-- Geomacro Global Source Coverage Expansion
--
-- Internal-only governed source registry expansion for global detection.
-- The table is RLS-protected and is not a public product/API surface.
-- Sources are used for detection/provenance; raw publisher content is not
-- redistributed.
-- =============================================================================

begin;

insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required, enabled_for_ingestion,
  enabled_for_commercial_signals, country_scope, freshness_class, notes
)
values

(
  'un_geneva_press_rss',
  'UN Geneva Press Releases RSS',
  'United Nations Office at Geneva',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://www.ungeneva.org/news-media/press-releases-list/rss.xml',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official UN Geneva press-release feed. Detection/provenance only; retain headline, URL and timestamps.'
),

(
  'un_security_council_docs_rss',
  'UN Security Council Documents RSS',
  'United Nations',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://docs.un.org/rss/scdocs.xml',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official Security Council document feed. High-value for sanctions, resolutions, meetings and security developments.'
),

(
  'eu_council_press_rss',
  'Council of the EU Press Releases RSS',
  'Council of the European Union',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://www.consilium.europa.eu/en/rss/pressreleases.ashx',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'EUROPE',
  'NEAR_REAL_TIME',
  'Official Council press-release feed. Covers foreign affairs, sanctions, security, trade and economic policy.'
),

(
  'ecb_press_rss',
  'ECB Press Releases RSS',
  'European Central Bank',
  'MACRO',
  'RSS',
  'NONE',
  'https://www.ecb.europa.eu/rss/press.html',
  null,
  'COMMERCIAL_OK',
  false,
  true,
  true,
  false,
  'EUROPE',
  'NEAR_REAL_TIME',
  'Official ECB RSS. ECB states its feeds deliver press releases, speeches, statistical releases and market communication automatically.'
),

(
  'ecb_market_information_rss',
  'ECB Market Information Dissemination RSS',
  'European Central Bank',
  'MACRO',
  'RSS',
  'NONE',
  'https://mid.ecb.europa.eu/rss/mid.xml',
  null,
  'COMMERCIAL_OK',
  false,
  true,
  true,
  false,
  'EUROPE',
  'REAL_TIME',
  'Structured market-information dissemination entry point. Use the governed RSS endpoints exposed by ECB MID.'
),

(
  'un_geneva_meeting_summaries_rss',
  'UN Geneva Meeting Summaries RSS',
  'United Nations Office at Geneva',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://www.ungeneva.org/news-media/meeting-summaries/rss.xml',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official UN Geneva meeting-summary feed. Detection/provenance only.'
),

(
  'nrcan_news_atom',
  'Natural Resources Canada News Releases Atom',
  'Natural Resources Canada',
  'CRITICAL_MINERALS',
  'RSS',
  'NONE',
  'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'CAN',
  'NEAR_REAL_TIME',
  'Official Natural Resources Canada Atom feed. Broad NRCan news; used as a critical-minerals government-primary detector with downstream keyword/topic classification.'
),

(
  'doe_critical_materials_news_candidate',
  'US DOE Critical Minerals and Materials News',
  'U.S. Department of Energy',
  'CRITICAL_MINERALS',
  'HTML',
  'NONE',
  'https://www.energy.gov/collection/filter/1380971',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'USA',
  'NEAR_REAL_TIME',
  'Official DOE critical-materials news collection. Candidate for governed page polling; kept disabled until a stable machine feed/fallback contract is verified.'
),

(
  'unctad_critical_minerals_data',
  'UNCTAD Critical Minerals Trade Data',
  'UN Trade and Development',
  'CRITICAL_MINERALS',
  'HTML',
  'NONE',
  'https://unctadstat.unctad.org/datacentre/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official bilateral critical-minerals trade dataset. Not a breaking-news feed; use for supply-chain baseline and structural risk context.'
),

(
  'bis_rss_media_releases',
  'BIS Media Releases RSS',
  'Bank for International Settlements',
  'MACRO',
  'RSS',
  'NONE',
  'https://www.bis.org/doclist/all_pressrels.rss',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official BIS RSS catalogue. Media releases are high-value global financial-system and central-bank signals; exact feed URL is resolved from the BIS RSS catalogue.'
),

(
  'bis_rss_central_banker_speeches',
  'BIS Central Bankers Speeches RSS',
  'Bank for International Settlements',
  'MACRO',
  'RSS',
  'NONE',
  'https://www.bis.org/doclist/cbspeeches.rss',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official BIS RSS catalogue. Central-bank speeches provide policy and financial-stability signals; exact feed URL is resolved from the BIS RSS catalogue.'
),

(
  'oecd_critical_raw_materials_restrictions',
  'OECD Critical Raw Materials Export Restrictions',
  'Organisation for Economic Co-operation and Development',
  'CRITICAL_MINERALS',
  'HTML',
  'NONE',
  'https://www.oecd.org/en/topics/export-restrictions-on-critical-raw-materials.html',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official OECD inventory of critical-raw-material export restrictions. Structural early-warning/corroboration source, not a breaking feed.'
),

(
  'oecd_critical_minerals_policy',
  'OECD Critical Minerals Policy',
  'Organisation for Economic Co-operation and Development',
  'CRITICAL_MINERALS',
  'HTML',
  'NONE',
  'https://www.oecd.org/en/topics/policy-issues/critical-minerals.html',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official OECD critical-minerals policy and research index. Structural supply-chain and policy-risk context.'
),

(
  'world_bank_critical_minerals',
  'World Bank Critical Minerals',
  'World Bank',
  'CRITICAL_MINERALS',
  'HTML',
  'NONE',
  'https://www.worldbank.org/en/programs/critical-minerals-for-development',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'World Bank critical-minerals programme and supply-chain/development research. Structural context source.'
),

(
  'wto_critical_minerals_dataset',
  'WTO Critical Minerals Dataset',
  'World Trade Organization',
  'CRITICAL_MINERALS',
  'MIXED',
  'NONE',
  'https://data.wto.org/dataset/critmin',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  false,
  false,
  'GLOBAL',
  'PERIODIC',
  'Official WTO critical-minerals trade/product classification dataset. Structural corroboration, not a breaking feed.'
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

-- Keep the registry internal. Existing RLS remains enabled and no public
-- SELECT policy is introduced here.

-- ---------------------------------------------------------------------------
-- Coverage governance metadata. This is intentionally internal and stores
-- detection coverage requirements separately from customer-facing data.
-- ---------------------------------------------------------------------------
create table if not exists public.live_source_coverage_targets (
  coverage_id text primary key,
  category text not null check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  scope_type text not null check (scope_type in ('GLOBAL','REGION','COUNTRY','CORRIDOR','COMMODITY')),
  scope_code text not null,
  source_class text not null check (
    source_class in (
      'GLOBAL_AGGREGATOR',
      'INTERNATIONAL_PRIMARY',
      'REGIONAL_PRIMARY',
      'COUNTRY_PRIMARY',
      'INDEPENDENT_MEDIA',
      'SPECIALIST_INDUSTRY',
      'STRUCTURED_DATA'
    )
  ),
  required boolean not null default true,
  minimum_independent_paths integer not null default 1,
  status text not null default 'PLANNED' check (
    status in ('PLANNED','PARTIAL','COVERED','BLOCKED','REVIEW_REQUIRED')
  ),
  primary_source_id text references public.live_external_sources(source_id),
  fallback_source_id text references public.live_external_sources(source_id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category, scope_type, scope_code, source_class)
);

create index if not exists live_source_coverage_targets_scope_idx
  on public.live_source_coverage_targets(category, scope_type, scope_code);

create index if not exists live_source_coverage_targets_status_idx
  on public.live_source_coverage_targets(status);

-- Global mandatory backbone requirements.
insert into public.live_source_coverage_targets
  (coverage_id, category, scope_type, scope_code, source_class, required,
   minimum_independent_paths, status, primary_source_id, notes)
values
  ('geo-global-aggregator','GEOPOLITICS','GLOBAL','GLOBAL','GLOBAL_AGGREGATOR',true,1,'COVERED','gdelt_v2','Global discovery/corroboration backbone.'),
  ('geo-un-primary','GEOPOLITICS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY',true,2,'PARTIAL','un_geneva_press_rss','UN official path; additional UN security/humanitarian feeds are governed separately.'),
  ('macro-wb-structured','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'COVERED','world_bank_indicators','Global country-level macro baseline.'),
  ('macro-bis-structured','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','bis_rss_media_releases','BIS global financial-system signal path.'),
  ('minerals-usgs','CRITICAL_MINERALS','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'COVERED','iea_critical_minerals','Global mineral supply/demand baseline.'),
  ('minerals-trade','CRITICAL_MINERALS','GLOBAL','GLOBAL','STRUCTURED_DATA',true,2,'PARTIAL','unctad_critical_minerals_data','Global trade-flow baseline.'),
  ('minerals-policy','CRITICAL_MINERALS','GLOBAL','GLOBAL','SPECIALIST_INDUSTRY',true,2,'PARTIAL','oecd_critical_raw_materials_restrictions','Global export-restriction intelligence.')
on conflict (category, scope_type, scope_code, source_class)
do update set
  required=excluded.required,
  minimum_independent_paths=excluded.minimum_independent_paths,
  status=excluded.status,
  primary_source_id=excluded.primary_source_id,
  notes=excluded.notes,
  updated_at=now();

alter table public.live_source_coverage_targets enable row level security;

alter table public.live_external_sources enable row level security;

commit;
