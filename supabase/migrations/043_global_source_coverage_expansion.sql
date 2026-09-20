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
alter table public.live_external_sources enable row level security;

commit;
