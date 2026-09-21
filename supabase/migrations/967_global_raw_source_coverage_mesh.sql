begin;

create table if not exists public.live_raw_source_targets (
  target_id text primary key,
  country_iso3 text not null
    references public.live_country_registry(iso3),
  category text not null
    check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  transport text not null
    check (transport in ('WEB','RSS','API','TELEGRAM_DISCOVERY','GLOBAL_FALLBACK')),
  source_id text references public.live_external_sources(source_id),
  target_url text,
  telegram_query text,
  display_name text not null,
  enabled boolean not null default true,
  raw_storage_allowed boolean not null default true,
  commercial_promotion_allowed boolean not null default false,
  cadence_seconds integer not null default 300
    check (cadence_seconds between 60 and 86400),
  priority integer not null default 50
    check (priority between 1 and 1000),
  discovery_state text not null default 'DISCOVERED'
    check (discovery_state in ('DISCOVERED','REACHABLE','UNREACHABLE','STALE','BLOCKED')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_observed_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_raw_source_targets_due_idx
  on public.live_raw_source_targets(enabled, last_attempt_at);

create index if not exists live_raw_source_targets_country_category_idx
  on public.live_raw_source_targets(country_iso3, category);

create index if not exists live_raw_source_targets_transport_idx
  on public.live_raw_source_targets(transport, enabled);

-- GEO: every country gets its national government portal plus GDELT and a
-- Telegram discovery target. The latter is a search/discovery surface, not an
-- automatic channel authorization.
insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'GEO:WEB:' || r.iso3,
  r.iso3,
  'GEOPOLITICS',
  'WEB',
  'gov_portal_' || lower(d.country_iso2),
  d.government_portal_url,
  'National government portal - ' || d.country_name,
  true,false,300,10,
  'Raw lead source only. Endpoint/reuse certification is independent.'
from public.live_country_registry r
join public.live_country_primary_source_directory d
  on upper(d.country_iso2)=upper(r.iso2)
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  display_name=excluded.display_name,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'GEO:GLOBAL:GDELT:' || r.iso3,
  r.iso3,
  'GEOPOLITICS',
  'GLOBAL_FALLBACK',
  'gdelt_v2',
  'https://www.gdeltproject.org/',
  'GDELT global event fallback - ' || r.name,
  true,false,300,20,
  'Global fallback for country-level event discovery when national web/Telegram sources do not publish machine-readable material.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,telegram_query,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'GEO:TELEGRAM_DISCOVERY:' || r.iso3,
  r.iso3,
  'GEOPOLITICS',
  'TELEGRAM_DISCOVERY',
  lower(
    r.name ||
    ' government OR ministry OR presidency OR parliament OR breaking news'
  ),
  'Telegram public-channel discovery - ' || r.name,
  true,false,300,30,
  'Discovery only. Candidate channels are inserted into the manual review queue; this target never bypasses Telegram source approval.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  telegram_query=excluded.telegram_query,
  display_name=excluded.display_name,
  updated_at=now();

-- MACRO: every country gets its statistics office, monetary authority and a
-- global World Bank fallback. This removes the previous dependency on waiting
-- for premium macro vendors.
insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MACRO:STATS:' || r.iso3,
  r.iso3,
  'MACRO',
  'WEB',
  'stats_office_' || lower(d.country_iso2),
  d.office_url,
  'National statistics office - ' || r.name,
  true,false,900,10,
  'Raw macro release source. Dataset rights and exact machine adapter remain separately governed.'
from public.live_country_registry r
join public.live_country_statistics_source_directory d
  on upper(d.country_iso2)=upper(r.iso2)
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  display_name=excluded.display_name,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MACRO:MONETARY:' || r.iso3,
  r.iso3,
  'MACRO',
  'WEB',
  'monetary_' || lower(d.country_iso2),
  d.authority_url,
  'Monetary authority - ' || r.name,
  true,false,300,15,
  'Raw monetary-policy/release source. Commercial promotion remains rights/methodology gated.'
from public.live_country_registry r
join public.live_country_monetary_authority_directory d
  on upper(d.country_iso2)=upper(r.iso2)
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  display_name=excluded.display_name,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MACRO:GLOBAL:WORLD_BANK:' || r.iso3,
  r.iso3,
  'MACRO',
  'GLOBAL_FALLBACK',
  'world_bank_indicators',
  'https://api.worldbank.org/v2/',
  'World Bank macro/global fallback - ' || r.name,
  true,false,900,25,
  'Open global macro fallback used for country coverage and gap discovery.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,telegram_query,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MACRO:TELEGRAM_DISCOVERY:' || r.iso3,
  r.iso3,
  'MACRO',
  'TELEGRAM_DISCOVERY',
  lower(
    r.name ||
    ' central bank OR interest rates OR inflation OR GDP OR currency OR markets'
  ),
  'Telegram macro discovery - ' || r.name,
  true,false,300,35,
  'Discovery only. Candidate channels go to manual Telegram review.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  telegram_query=excluded.telegram_query,
  display_name=excluded.display_name,
  updated_at=now();

-- CRITICAL MINERALS: every country gets RMIS plus the globally comprehensive
-- USGS MCS / BGS baselines, with the global USGS news fallback and Telegram
-- discovery target.
insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,target_url,source_id,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MINERALS:RMIS:' || r.iso3,
  r.iso3,
  'CRITICAL_MINERALS',
  'WEB',
  d.rmis_country_profile_url,
  'jrc_rmis_supply_chain',
  'RMIS country minerals profile - ' || r.name,
  true,false,1800,10,
  'Country-level minerals profile. Exact page availability and rights remain separately governed.'
from public.live_country_registry r
join public.live_country_critical_mineral_source_directory d
  on upper(d.country_iso2)=upper(r.iso2)
where r.enabled
  and coalesce(d.rmis_country_profile_url,'') <> ''
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  display_name=excluded.display_name,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MINERALS:USGS:' || r.iso3,
  r.iso3,
  'CRITICAL_MINERALS',
  'GLOBAL_FALLBACK',
  'usgs_mcs',
  'https://www.usgs.gov/centers/national-minerals-information-center/data',
  'USGS minerals baseline - ' || r.name,
  true,false,3600,20,
  'Global country-comparable minerals baseline and current publication source.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MINERALS:BGS:' || r.iso3,
  r.iso3,
  'CRITICAL_MINERALS',
  'GLOBAL_FALLBACK',
  'bgs_world_minerals',
  'https://www.bgs.ac.uk/mineralsuk/statistics/worldStatistics.html',
  'BGS world minerals fallback - ' || r.name,
  true,false,3600,25,
  'Global minerals fallback. Commercial reuse remains separately gated.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  display_name=excluded.display_name,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MINERALS:USGS_NEWS:' || r.iso3,
  r.iso3,
  'CRITICAL_MINERALS',
  'GLOBAL_FALLBACK',
  'usgs_minerals_news_rss',
  'https://www.usgs.gov/news/minerals/feed',
  'USGS minerals news - ' || r.name,
  true,false,300,30,
  'Near-real-time minerals event lead fallback.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  updated_at=now();

insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,telegram_query,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MINERALS:TELEGRAM_DISCOVERY:' || r.iso3,
  r.iso3,
  'CRITICAL_MINERALS',
  'TELEGRAM_DISCOVERY',
  lower(
    r.name ||
    ' lithium OR cobalt OR nickel OR graphite OR rare earth OR mining OR minerals'
  ),
  'Telegram minerals discovery - ' || r.name,
  true,false,300,40,
  'Discovery only. Candidate channels go to manual Telegram review.'
from public.live_country_registry r
where r.enabled
on conflict (target_id) do update set
  telegram_query=excluded.telegram_query,
  display_name=excluded.display_name,
  updated_at=now();


-- Close the national-statistics directory exception with the official
-- government portal as an explicit raw release fallback.
insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MACRO:STATS_GOV_FALLBACK:' || r.iso3,
  r.iso3,
  'MACRO',
  'WEB',
  'gov_portal_' || lower(g.country_iso2),
  g.government_portal_url,
  'Government statistics-release fallback - ' || g.country_name,
  true,false,900,20,
  'Used only when a dedicated national statistics-office directory row is absent.'
from public.live_country_registry r
join public.live_country_primary_source_directory g
  on upper(g.country_iso2)=upper(r.iso2)
left join public.live_country_statistics_source_directory s
  on upper(s.country_iso2)=upper(r.iso2)
where r.enabled
  and s.country_iso2 is null
on conflict (target_id) do update set
  source_id=excluded.source_id,
  target_url=excluded.target_url,
  display_name=excluded.display_name,
  updated_at=now();

-- Every country also gets an explicit national government web target in the
-- critical-minerals domain for current mining/policy/news discovery.
insert into public.live_raw_source_targets (
  target_id,country_iso3,category,transport,source_id,target_url,
  display_name,raw_storage_allowed,commercial_promotion_allowed,
  cadence_seconds,priority,notes
)
select
  'MINERALS:GOV_WEB:' || r.iso3,
  r.iso3,
  'CRITICAL_MINERALS',
  'WEB',
  'gov_portal_' || lower(g.country_iso2),
  g.government_portal_url,
  'Government minerals/policy discovery - ' || g.country_name,
  true,false,900,35,
  'Broad national discovery source only; no mineral metric is inferred without an explicit source parser.'
from public.live_country_registry r
join public.live_country_primary_source_directory g
  on upper(g.country_iso2)=upper(r.iso2)
where r.enabled
on conflict (target_id) do update set
  source_id=excluded.source_id,
  target_url=excluded.target_url,
  display_name=excluded.display_name,
  updated_at=now();



create or replace view public.live_raw_source_runtime_100_status
with (security_invoker=true)
as
with country_category as (
  select
    r.iso3,
    cat.category,
    count(t.target_id)::bigint target_count,
    max(t.last_success_at) latest_success_at,
    min(t.discovery_state) filter (where t.last_success_at is not null) min_state
  from public.live_country_registry r
  cross join (
    values
      ('GEOPOLITICS'::text, 1800::bigint),
      ('MACRO'::text, 7200::bigint),
      ('CRITICAL_MINERALS'::text, 14400::bigint)
  ) as cat(category, max_age_seconds)
  left join public.live_raw_source_targets t
    on t.country_iso3 = r.iso3
   and t.category = cat.category
   and t.enabled = true
  where r.enabled = true
  group by r.iso3, cat.category
),
country_status as (
  select
    iso3,
    bool_and(
      target_count > 0
      and latest_success_at is not null
      and latest_success_at >= now() - make_interval(secs => case category
        when 'GEOPOLITICS' then 1800
        when 'MACRO' then 7200
        else 14400
      end)
    ) as complete
  from country_category
  group by iso3
)
select
  now() evaluated_at,
  count(*)::bigint enabled_countries,
  count(*) filter (where complete)::bigint countries_with_fresh_raw_runtime,
  (count(*) = 195 and count(*) filter (where complete) = 195) as raw_runtime_100_complete
from country_status;

comment on view public.live_raw_source_runtime_100_status is
  'Operational raw-runtime gate: every enabled canonical country must have at least one successful recent raw target in each of GEOPOLITICS, MACRO and CRITICAL_MINERALS. Licensed/commercial rights are separate.';

create or replace view public.live_raw_source_coverage_100_status
with (security_invoker=true)
as
with registry as (
  select count(*)::bigint n
  from public.live_country_registry
  where enabled
),
expected as (
  select
    registry.n enabled_country_count,
    registry.n * 13::bigint expected_target_rows,
    count(*)::bigint actual_target_rows
  from registry
  left join public.live_raw_source_targets t on true
  group by registry.n
),
per_country as (
  select
    r.iso3,
    count(*) filter (where t.category='GEOPOLITICS')::bigint geopolitics_targets,
    count(*) filter (where t.category='MACRO')::bigint macro_targets,
    count(*) filter (where t.category='CRITICAL_MINERALS')::bigint critical_minerals_targets
  from public.live_country_registry r
  left join public.live_raw_source_targets t on t.country_iso3 = r.iso3 and t.enabled
  where r.enabled
  group by r.iso3
)
select
  now() evaluated_at,
  (select enabled_country_count from expected) enabled_country_count,
  (select expected_target_rows from expected) expected_target_rows,
  (select actual_target_rows from expected) actual_target_rows,
  count(*) filter (where geopolitics_targets > 0)::bigint countries_with_geopolitics,
  count(*) filter (where macro_targets > 0)::bigint countries_with_macro,
  count(*) filter (where critical_minerals_targets > 0)::bigint countries_with_critical_minerals,
  count(*) filter (
    where geopolitics_targets > 0
      and macro_targets > 0
      and critical_minerals_targets > 0
  )::bigint countries_with_all_three,
  (
    (select enabled_country_count from expected) = 195
    and (select actual_target_rows from expected) >= (select expected_target_rows from expected)
    and count(*) filter (
      where geopolitics_targets > 0
        and macro_targets > 0
        and critical_minerals_targets > 0
    ) = 195
  ) as raw_source_coverage_100_complete
from per_country;

comment on view public.live_raw_source_coverage_100_status is
  'Raw internal source-coverage gate: every enabled canonical country has a complete 13-target mesh spanning national web, global fallbacks and Telegram discovery across GEOPOLITICS, MACRO and CRITICAL_MINERALS. Commercial rights/certification are intentionally separate gates.';

commit;
