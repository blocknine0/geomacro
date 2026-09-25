begin;

-- Global P0 source expansion.
-- This migration only registers and routes the missing authoritative sources.
-- Ingestion/commercial activation stays fail-closed until exact adapters,
-- endpoint tests, provenance and reuse-rights evidence are certified.

insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required, enabled_for_ingestion,
  enabled_for_commercial_signals, country_scope, freshness_class, notes
)
values
(
  'uk_sanctions_list',
  'UK Sanctions List',
  'UK Government',
  'GEOPOLITICS',
  'XML', 'NONE',
  'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'NEAR_REAL_TIME',
  'Official UK sanctions list. Register now for global sanctions coverage; exact machine endpoint, change-feed behavior and commercial reuse boundary must be certified before activation.'
),
(
  'eu_sanctions_consolidated',
  'EU Consolidated Financial Sanctions List',
  'European Commission / DG FISMA',
  'GEOPOLITICS',
  'HTML', 'NONE',
  'https://webgate.ec.europa.eu/fsd/fsf',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'NEAR_REAL_TIME',
  'Official EU consolidated financial-sanctions surface. Exact downloadable dataset, update cadence and reuse boundary must be certified before activation.'
),
(
  'opcw_news',
  'OPCW News',
  'Organisation for the Prohibition of Chemical Weapons',
  'GEOPOLITICS',
  'HTML', 'NONE',
  'https://www.opcw.org/media-centre/news',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'DAILY',
  'Official chemical-weapons/security event surface. Exact feed/endpoint and reuse terms require certification.'
),
(
  'icj_cases',
  'International Court of Justice Cases',
  'International Court of Justice',
  'GEOPOLITICS',
  'HTML', 'NONE',
  'https://www.icj-cij.org/cases',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'DAILY',
  'Official ICJ case and proceedings surface for interstate disputes and provisional-measures events.'
),
(
  'icc_news',
  'International Criminal Court News',
  'International Criminal Court',
  'GEOPOLITICS',
  'HTML', 'NONE',
  'https://www.icc-cpi.int/news',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'DAILY',
  'Official ICC proceedings/news surface. Exact feed and reuse boundary require certification.'
),
(
  'unctadstat_global',
  'UNCTADstat',
  'United Nations Trade and Development',
  'MACRO',
  'API', 'NONE',
  'https://unctadstat.unctad.org/datacentre/',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'PERIODIC',
  'Global trade, investment and macroeconomic statistical backbone. Exact API/dataflow and commercial reuse terms must be certified per dataset.'
),
(
  'world_bank_commodity_prices',
  'World Bank Commodity Markets / Pink Sheet',
  'World Bank',
  'MACRO',
  'BULK_DOWNLOAD', 'NONE',
  'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'GLOBAL', 'MONTHLY',
  'Global commodity-price benchmark for oil, gas, metals, food and related macro transmission. Exact dataset/version and reuse boundary must be certified before activation.'
),
(
  'china_mofcom_trade_controls',
  'China Ministry of Commerce',
  'Ministry of Commerce of the People''s Republic of China',
  'CRITICAL_MINERALS',
  'HTML', 'NONE',
  'https://exportcontrol.mofcom.gov.cn/',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'CHN', 'NEAR_REAL_TIME',
  'Primary Chinese trade-policy/export-control surface. Critical for mineral and strategic-material restriction events; endpoint and reuse terms require certification.'
),
(
  'australia_critical_minerals',
  'Australian Critical Minerals',
  'Australian Government',
  'CRITICAL_MINERALS',
  'HTML', 'NONE',
  'https://www.industry.gov.au/publications/australias-critical-minerals-list-and-strategic-materials-list',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'AUS', 'PERIODIC',
  'Primary Australian critical-minerals policy/project/supply-chain surface. Exact machine endpoint and reuse terms require certification.'
),
(
  'cochilco_minerals',
  'COCHILCO',
  'Chilean Copper Commission',
  'CRITICAL_MINERALS',
  'HTML', 'NONE',
  'https://www.cochilco.cl/web/anuario-de-estadisticas-del-cobre-y-otros-minerales/',
  null, 'REVIEW_REQUIRED', false, true, false, false, 'CHL', 'PERIODIC',
  'Primary Chilean copper/minerals market and supply information source. Exact machine endpoint and reuse terms require certification.'
)
on conflict (source_id) do update set
  source_name = excluded.source_name,
  provider_name = excluded.provider_name,
  category = excluded.category,
  access_type = excluded.access_type,
  authentication_type = excluded.authentication_type,
  base_url = excluded.base_url,
  commercial_usage_status = excluded.commercial_usage_status,
  enabled_for_ingestion = false,
  enabled_for_commercial_signals = false,
  country_scope = excluded.country_scope,
  freshness_class = excluded.freshness_class,
  notes = excluded.notes,
  updated_at = now();

-- Direct realtime routing. These targets are intentionally disabled by the
-- source registry gate until adapters are certified.
insert into public.live_realtime_scope_targets (
  target_id, scope_type, scope_code, category, transport, source_id,
  target_url, activation_mode, cadence_seconds, query_hint, notes, enabled
)
values
(
  'GLOBAL:P0:UK_SANCTIONS:GEOPOLITICS','HOT_TOPIC','sanctions_embargoes_export_controls',
  'GEOPOLITICS','WEB_DIRECT','uk_sanctions_list',
  'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml',
  'CONTINUOUS',900,'UK sanctions designation delisting asset freeze export restriction',
  'P0 global sanctions source; remains disabled until endpoint/rights certification.',false
),
(
  'GLOBAL:P0:EU_SANCTIONS:GEOPOLITICS','HOT_TOPIC','sanctions_embargoes_export_controls',
  'GEOPOLITICS','WEB_DIRECT','eu_sanctions_consolidated',
  'https://webgate.ec.europa.eu/fsd/fsf',
  'CONTINUOUS',900,'EU restrictive measures consolidated financial sanctions',
  'P0 global sanctions source; remains disabled until endpoint/rights certification.',false
),
(
  'GLOBAL:P0:OPCW:GEOPOLITICS','HOT_TOPIC','chemical_weapons_security',
  'GEOPOLITICS','WEB_DIRECT','opcw_news',
  'https://www.opcw.org/media-centre/news',
  'CONTINUOUS',900,'chemical weapons convention investigation declaration incident',
  'P0 WMD/security source; remains disabled until endpoint/rights certification.',false
),
(
  'GLOBAL:P0:ICJ:GEOPOLITICS','HOT_TOPIC','international_legal_escalation',
  'GEOPOLITICS','WEB_DIRECT','icj_cases',
  'https://www.icj-cij.org/cases',
  'CONTINUOUS',1800,'ICJ provisional measures judgment case order',
  'P0 international-law event source; remains disabled until endpoint/rights certification.',false
),
(
  'GLOBAL:P0:ICC:GEOPOLITICS','HOT_TOPIC','international_criminal_proceedings',
  'GEOPOLITICS','WEB_DIRECT','icc_news',
  'https://www.icc-cpi.int/news',
  'CONTINUOUS',1800,'ICC warrant investigation judgment situation',
  'P0 international-justice event source; remains disabled until endpoint/rights certification.',false
),
(
  'GLOBAL:P0:UNCTAD:MACRO','HOT_TOPIC','trade_investment_macro',
  'MACRO','WEB_DIRECT','unctadstat_global',
  'https://unctadstat.unctad.org/datacentre/',
  'CONTINUOUS',1800,'trade investment FDI merchandise services macro',
  'P0 global trade/investment statistical source; exact API adapter required.',false
),
(
  'GLOBAL:P0:WB_COMMODITIES:MACRO','HOT_TOPIC','commodity_price_shock',
  'MACRO','WEB_DIRECT','world_bank_commodity_prices',
  'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx',
  'CONTINUOUS',3600,'commodity prices oil gas metals food fertilizer',
  'P0 global commodity-price benchmark; exact dataset adapter required.',false
),
(
  'GLOBAL:P0:CHINA_MOFCOM:CRITICAL_MINERALS','HOT_TOPIC','mineral_export_control',
  'CRITICAL_MINERALS','WEB_DIRECT','china_mofcom_trade_controls',
  'https://exportcontrol.mofcom.gov.cn/',
  'CONTINUOUS',900,'critical minerals export control rare earth graphite gallium germanium',
  'P0 China policy/export-control source; exact endpoint adapter required.',false
),
(
  'GLOBAL:P0:AU_CRITICAL_MINERALS:CRITICAL_MINERALS','HOT_TOPIC','critical_mineral_supply',
  'CRITICAL_MINERALS','WEB_DIRECT','australia_critical_minerals',
  'https://www.industry.gov.au/publications/australias-critical-minerals-list-and-strategic-materials-list',
  'CONTINUOUS',3600,'critical minerals projects supply chain lithium rare earth nickel',
  'P0 Australian supply source; exact endpoint adapter required.',false
),
(
  'GLOBAL:P0:COCHILCO:CRITICAL_MINERALS','HOT_TOPIC','copper_supply',
  'CRITICAL_MINERALS','WEB_DIRECT','cochilco_minerals',
  'https://www.cochilco.cl/web/anuario-de-estadisticas-del-cobre-y-otros-minerales/',
  'CONTINUOUS',3600,'copper production supply price Chile mining',
  'P0 Chilean copper supply source; exact endpoint adapter required.',false
)
on conflict (target_id) do update set
  source_id=excluded.source_id,
  target_url=excluded.target_url,
  query_hint=excluded.query_hint,
  cadence_seconds=excluded.cadence_seconds,
  enabled=false,
  updated_at=now();

commit;
