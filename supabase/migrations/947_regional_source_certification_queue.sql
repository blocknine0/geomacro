begin;

-- Regional source-family coverage matrix. This prevents "global" sources from
-- being treated as sufficient for regional blind spots.
create table if not exists public.live_regional_source_requirements (
 region_id text primary key,
 region_name text not null,
 required_domains text not null,
 minimum_independent_paths integer not null default 2,
 status text not null default 'UNMAPPED',
 notes text,
 updated_at timestamptz not null default now()
);

insert into public.live_regional_source_requirements(region_id,region_name,required_domains) values
('NORTH_AMERICA','North America','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,DISASTER,WEATHER_CLIMATE,FINANCE,CYBER,TRANSPORT'),
('CENTRAL_AMERICA','Central America','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,DISASTER,MIGRATION,SHIPPING'),
('CARIBBEAN','Caribbean','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,DISASTER,SHIPPING,MIGRATION,CLIMATE'),
('SOUTH_AMERICA','South America','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,DISASTER,MINERALS,WATER,SHIPPING'),
('WESTERN_EUROPE','Western Europe','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,FINANCE,CYBER,SHIPPING'),
('EASTERN_EUROPE','Eastern Europe','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,SECURITY,FINANCE'),
('NORDICS','Nordics','GEOPOLITICS,MACRO,ENERGY,SHIPPING,WEATHER_CLIMATE,ARCTIC,FINANCE'),
('BALKANS','Balkans','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,MIGRATION,SECURITY'),
('CAUCASUS','Caucasus','GEOPOLITICS,ENERGY,TRADE,FOOD,WATER,TRANSPORT,SECURITY'),
('CENTRAL_ASIA','Central Asia','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,WATER,MINERALS,TRANSPORT'),
('RUSSIA_EURASIA','Russia and Eurasia','GEOPOLITICS,MACRO,ENERGY,MINERALS,FOOD,SECURITY,ARCTIC,TRANSPORT'),
('MIDDLE_EAST','Middle East','GEOPOLITICS,ENERGY,FOOD,WATER,HEALTH,FINANCE,SHIPPING,SECURITY'),
('NORTH_AFRICA','North Africa','GEOPOLITICS,MACRO,FOOD,ENERGY,WATER,MIGRATION,SHIPPING'),
('WEST_AFRICA','West Africa','GEOPOLITICS,FOOD,ENERGY,MIGRATION,HEALTH,SECURITY,TRADE'),
('CENTRAL_AFRICA','Central Africa','GEOPOLITICS,FOOD,ENERGY,MINERALS,HEALTH,DISPLACEMENT,SECURITY'),
('EAST_AFRICA','East Africa','GEOPOLITICS,FOOD,WATER,HEALTH,MIGRATION,SHIPPING,SECURITY'),
('SOUTHERN_AFRICA','Southern Africa','GEOPOLITICS,MACRO,ENERGY,MINERALS,FOOD,WATER,TRADE'),
('SOUTH_ASIA','South Asia','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,WATER,DISASTER,SHIPPING'),
('SOUTHEAST_ASIA','Southeast Asia','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,SHIPPING,SEMICONDUCTORS'),
('EAST_ASIA','East Asia','GEOPOLITICS,MACRO,TRADE,ENERGY,FOOD,HEALTH,SHIPPING,SEMICONDUCTORS,FINANCE'),
('OCEANIA','Oceania','GEOPOLITICS,TRADE,ENERGY,FOOD,HEALTH,DISASTER,WEATHER_CLIMATE,SHIPPING'),
('PACIFIC_ISLANDS','Pacific Islands','CLIMATE,DISASTER,FOOD,WATER,HEALTH,SHIPPING,MIGRATION'),
('ARCTIC','Arctic','CLIMATE,SHIPPING,ENERGY,MINERALS,SECURITY,WEATHER_CLIMATE'),
('ANTARCTIC','Antarctic','CLIMATE,WEATHER_CLIMATE,SHIPPING,ENVIRONMENTAL')
on conflict(region_id) do update set region_name=excluded.region_name,required_domains=excluded.required_domains,updated_at=now();

create table if not exists public.live_global_source_certification_queue (
 source_id text primary key,
 priority text not null default 'P2',
 collector_contract boolean not null default false,
 rights_verified boolean not null default false,
 provenance_verified boolean not null default false,
 coverage_verified boolean not null default false,
 freshness_verified boolean not null default false,
 corroboration_verified boolean not null default false,
 negative_tests_verified boolean not null default false,
 production_certified boolean not null default false,
 status text not null default 'REGISTERED',
 notes text,
 updated_at timestamptz not null default now()
);

insert into public.live_global_source_certification_queue(source_id,priority)
select source_id,case when source_id in ('gdelt_v2_events','worldbank_api','un_comtrade_api','noaa_ncei','gdacs','unhcr_global_public_api','usgs_earthquake_hazards') then 'P0' else 'P1' end
from public.live_external_sources
on conflict(source_id) do update set priority=excluded.priority,updated_at=now();

-- Promotion invariant: certification queue is authoritative and every source
-- remains disabled until all gates are explicitly true.
create or replace view public.live_global_source_promotion_gaps as
select source_id,
       priority,
       collector_contract,rights_verified,provenance_verified,coverage_verified,
       freshness_verified,corroboration_verified,negative_tests_verified,
       production_certified
from public.live_global_source_certification_queue
where not production_certified
   or not collector_contract
   or not rights_verified
   or not provenance_verified
   or not coverage_verified
   or not freshness_verified
   or not corroboration_verified
   or not negative_tests_verified;

commit;