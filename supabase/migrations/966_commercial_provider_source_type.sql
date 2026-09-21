begin;

alter table public.live_source_registry
  drop constraint if exists live_source_registry_source_type_check;

alter table public.live_source_registry
  add constraint live_source_registry_source_type_check
  check (
    source_type in (
      'news_discovery',
      'official_government',
      'central_bank',
      'statistics_office',
      'international_org',
      'trade',
      'critical_minerals',
      'calendar',
      'internal_derived',
      'commercial_provider'
    )
  );

update public.live_source_registry
set source_type = 'commercial_provider',
    updated_at = now()
where source_key in (
  'dataminr_first_alert',
  'eventregistry_news',
  'reuters_lseg_news',
  'spglobal_economic_analytics',
  'fastmarkets_critical_minerals',
  'argus_critical_minerals',
  'kpler_commodity_flows',
  'windward_maritime_ai',
  'spire_maritime_ais'
);

commit;
