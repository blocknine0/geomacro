begin;

-- Stage 1 provider expansion catalog.
-- Disabled connectors are intentionally non-live until credentials, contracts
-- and adapter/runtime evidence are present. Adding a provider to this catalog
-- never makes it commercially deliverable automatically.

alter table public.live_source_registry
  add column if not exists activation_env text,
  add column if not exists connector_status text not null default 'registered'
    check (connector_status in ('registered','configured','active','disabled','retired'));

insert into public.live_source_registry (
  source_key, source_name, provider, source_type, base_url,
  enabled, cadence_seconds, raw_storage_policy, redistribution_allowed,
  derivative_intelligence_allowed, attribution_required, license_url,
  notes, commercial_usage_status, commercial_terms_reference,
  commercial_reviewed_at, activation_env, connector_status,
  realtime_hot_topic_enabled
)
values
(
  'dataminr_first_alert',
  'Dataminr First Alert',
  'Dataminr',
  'news_discovery',
  'https://www.dataminr.com/products/first-alert/',
  false, 60, 'internal_only', false, true, true,
  'https://www.dataminr.com/products/first-alert/',
  'Premium real-time multimodal breaking-event feed. Activate only with a valid commercial agreement and credentials.',
  'REVIEW_REQUIRED',
  'https://www.dataminr.com/products/first-alert/',
  null, 'DATAMINR_API_TOKEN', 'registered', false
),
(
  'eventregistry_news',
  'Event Registry News API',
  'Event Registry',
  'news_discovery',
  'https://www.eventregistry.org/',
  false, 120, 'internal_only', false, true, true,
  'https://www.eventregistry.org/',
  'Global multilingual news/event discovery connector candidate. Requires commercial API access before activation.',
  'REVIEW_REQUIRED',
  'https://www.eventregistry.org/',
  null, 'EVENTREGISTRY_API_KEY', 'registered', false
),
(
  'reuters_lseg_news',
  'LSEG Reuters Machine Readable News',
  'LSEG',
  'news_discovery',
  'https://developers.lseg.com/en/product/news/mrn_realtime_news',
  false, 5, 'internal_only', false, true, true,
  'https://developers.lseg.com/en/product/news/mrn_realtime_news',
  'Premium low-latency Reuters/LSEG machine-readable news connector candidate. Contract-specific use and redistribution restrictions apply.',
  'REVIEW_REQUIRED',
  'https://developers.lseg.com/en/product/news/mrn_realtime_news',
  null, 'LSEG_NEWS_CREDENTIAL', 'registered', true
),
(
  'tradingeconomics_macro',
  'Trading Economics Macro API',
  'Trading Economics',
  'calendar',
  'https://api.tradingeconomics.com/swagger/index.html',
  false, 60, 'internal_only', false, true, true,
  'https://tradingeconomics.com/api/pricing.aspx',
  'Real-time macro calendar and indicator connector candidate covering 196 countries. Requires paid API credentials.',
  'REVIEW_REQUIRED',
  'https://tradingeconomics.com/api/pricing.aspx',
  null, 'TRADINGECONOMICS_API_KEY', 'registered', true
),
(
  'spglobal_economic_analytics',
  'S&P Global Economic Analytics',
  'S&P Global',
  'statistics_office',
  'https://www.spglobal.com/market-intelligence/en/solutions/products/economic-analytics',
  false, 300, 'internal_only', false, true, true,
  'https://www.spglobal.com/market-intelligence/en/solutions/products/economic-analytics',
  'Premium country macro data connector candidate with minutes-level release updates. Contract-specific licence required.',
  'REVIEW_REQUIRED',
  'https://www.spglobal.com/market-intelligence/en/solutions/products/economic-analytics',
  null, 'SPGLOBAL_API_CREDENTIAL', 'registered', true
),
(
  'fastmarkets_critical_minerals',
  'Fastmarkets Critical Minerals',
  'Fastmarkets',
  'critical_minerals',
  'https://www.fastmarkets.com/insights/key-topics/critical-minerals-market-coverage/',
  false, 300, 'internal_only', false, true, true,
  'https://www.fastmarkets.com/insights/key-topics/critical-minerals-market-coverage/',
  'Premium critical-minerals prices/news connector candidate covering lithium, cobalt, nickel, graphite and rare earths. Requires customer API access.',
  'REVIEW_REQUIRED',
  'https://www.fastmarkets.com/insights/key-topics/critical-minerals-market-coverage/',
  null, 'FASTMARKETS_API_TOKEN', 'registered', true
),
(
  'argus_critical_minerals',
  'Argus Critical Minerals',
  'Argus Media',
  'critical_minerals',
  'https://www.argusmedia.com/en/methodology/key-commodity-prices/critical-minerals-price-risk-analysis',
  false, 300, 'internal_only', false, true, true,
  'https://www.argusmedia.com/en/methodology/key-commodity-prices/critical-minerals-price-risk-analysis',
  'Premium critical-minerals pricing/news connector candidate. Contract and redistribution rules are product-specific.',
  'REVIEW_REQUIRED',
  'https://www.argusmedia.com/en/methodology/key-commodity-prices/critical-minerals-price-risk-analysis',
  null, 'ARGUS_API_CREDENTIAL', 'registered', true
),
(
  'kpler_commodity_flows',
  'Kpler Commodity Flows and Maritime',
  'Kpler',
  'trade',
  'https://www.kpler.com/product/commodities/cargo-analytics',
  false, 60, 'internal_only', false, true, true,
  'https://www.kpler.com/product/commodities/cargo-analytics',
  'Premium physical commodity-flow and vessel intelligence connector candidate. Requires commercial contract and data access.',
  'REVIEW_REQUIRED',
  'https://www.kpler.com/product/commodities/cargo-analytics',
  null, 'KPLER_API_CREDENTIAL', 'registered', true
),
(
  'windward_maritime_ai',
  'Windward Maritime AI API',
  'Windward',
  'trade',
  'https://windward.ai/api/',
  false, 60, 'internal_only', false, true, true,
  'https://windward.ai/api/',
  'Real-time maritime behavior, compliance and early-detection connector candidate. Requires licensed API access.',
  'REVIEW_REQUIRED',
  'https://windward.ai/api/',
  null, 'WINDWARD_API_CREDENTIAL', 'registered', true
),
(
  'spire_maritime_ais',
  'Spire Maritime AIS',
  'Spire Global',
  'trade',
  'https://spire.com/maritime/solutions/standard-ais/',
  false, 60, 'internal_only', false, true, true,
  'https://spire.com/maritime/solutions/standard-ais/',
  'Satellite/AIS physical-movement connector candidate. Requires commercial data access.',
  'REVIEW_REQUIRED',
  'https://spire.com/maritime/solutions/standard-ais/',
  null, 'SPIRE_API_CREDENTIAL', 'registered', false
),
(
  'nasa_firms_fire',
  'NASA FIRMS Near-Real-Time Fire',
  'NASA FIRMS',
  'official_government',
  'https://firms.modaps.eosdis.nasa.gov/',
  false, 60, 'internal_only', false, true, true,
  'https://firms.modaps.eosdis.nasa.gov/',
  'Near-real-time global active-fire signal candidate. Map Key/API access required. Used as an auxiliary physical-world signal, not a standalone geopolitical truth source.',
  'COMMERCIAL_OK',
  'https://firms.modaps.eosdis.nasa.gov/',
  null, 'NASA_FIRMS_MAP_KEY', 'registered', false
)
on conflict (source_key) do update set
  source_name = excluded.source_name,
  provider = excluded.provider,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  enabled = excluded.enabled,
  cadence_seconds = excluded.cadence_seconds,
  raw_storage_policy = excluded.raw_storage_policy,
  redistribution_allowed = excluded.redistribution_allowed,
  derivative_intelligence_allowed = excluded.derivative_intelligence_allowed,
  attribution_required = excluded.attribution_required,
  license_url = excluded.license_url,
  notes = excluded.notes,
  commercial_usage_status = excluded.commercial_usage_status,
  commercial_terms_reference = excluded.commercial_terms_reference,
  activation_env = excluded.activation_env,
  connector_status = excluded.connector_status,
  realtime_hot_topic_enabled = excluded.realtime_hot_topic_enabled,
  updated_at = now();

commit;
