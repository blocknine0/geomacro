begin;

alter table public.live_telegram_channel_registry
  add column if not exists discovery_country_iso3 text references public.live_country_registry(iso3),
  add column if not exists discovery_category text
    check (discovery_category is null or discovery_category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  add column if not exists discovered_at timestamptz,
  add column if not exists discovery_method text;

create index if not exists live_telegram_channel_registry_discovery_country_idx
  on public.live_telegram_channel_registry(discovery_country_iso3,discovery_category);

comment on column public.live_telegram_channel_registry.discovery_country_iso3 is
  'Canonical country context used only for source discovery. It does not prove that every message concerns this country.';

comment on column public.live_telegram_channel_registry.discovery_category is
  'Raw-discovery category hint. It does not grant verification or scoring eligibility.';

commit;
