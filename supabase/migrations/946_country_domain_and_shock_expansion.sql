begin;

-- Country-level national-source requirement: the global universe is not complete
-- when an international source exists alone. Each country/territory must have
-- an official-national source path where the domain is published locally.
create table if not exists public.live_country_source_requirements (
  iso3 text not null references public.live_global_country_coverage(iso3) on delete cascade,
  domain text not null,
  requirement_class text not null check (requirement_class in ('OFFICIAL_NATIONAL','REGIONAL','INTERNATIONAL_FALLBACK')),
  minimum_paths integer not null default 2,
  status text not null default 'UNMAPPED',
  source_id text,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (iso3, domain, requirement_class)
);

-- Every country/territory gets the same minimum domain universe. This is a
-- requirement matrix, not a claim that every country publishes every dataset.
insert into public.live_country_source_requirements(iso3,domain,requirement_class,minimum_paths,notes)
select c.iso3,d.domain,'OFFICIAL_NATIONAL',1,
  'Identify the authoritative national source where this domain is published; otherwise mark unavailable and retain independent international fallback.'
from public.live_global_country_coverage c
cross join (values
 ('GEOPOLITICS'),('MACRO'),('TRADE'),('ENERGY'),('FOOD'),('HEALTH'),
 ('DISPLACEMENT'),('DISASTER'),('WEATHER_CLIMATE'),('WATER'),('SHIPPING'),
 ('AVIATION'),('FINANCE'),('CYBER'),('CRITICAL_MINERALS'),('TRANSPORT')
) d(domain)
on conflict do nothing;

-- International fallback paths required when national data are unavailable.
insert into public.live_country_source_requirements(iso3,domain,requirement_class,minimum_paths,notes)
select c.iso3,d.domain,'INTERNATIONAL_FALLBACK',2,
  'At least two independent international/primary or governed secondary paths must cover the country when an official national path is unavailable.'
from public.live_global_country_coverage c
cross join (values
 ('GEOPOLITICS'),('MACRO'),('TRADE'),('ENERGY'),('FOOD'),('HEALTH'),
 ('DISPLACEMENT'),('DISASTER'),('WEATHER_CLIMATE'),('WATER'),('SHIPPING'),
 ('AVIATION'),('FINANCE'),('CYBER'),('CRITICAL_MINERALS'),('TRANSPORT')
) d(domain)
on conflict do nothing;

-- Expand shock taxonomy with operationally distinct subfamilies that can be
-- independently sourced and tested.
insert into public.live_global_shock_taxonomy(shock_id,shock_name) values
('ELECTION_RESULT','Election result / transition event'),
('ELECTION_VIOLENCE','Election-related violence/disruption'),
('CONSTITUTIONAL_CRISIS','Constitutional or institutional crisis'),
('GOVERNMENT_COLLAPSE','Government collapse / emergency administration'),
('MILITARY_MOBILIZATION','Military mobilization / force posture change'),
('MISSILE_ATTACK','Missile/drone attack'),
('AIRSPACE_CLOSURE','Airspace closure/restriction'),
('MARITIME_SECURITY','Maritime security incident'),
('PIRACY','Piracy / armed robbery at sea'),
('HOSTAGE_EVENT','Hostage / mass detention event'),
('REFINERY_OUTAGE','Refinery disruption'),
('PIPELINE_OUTAGE','Pipeline disruption'),
('LNG_OUTAGE','LNG facility disruption'),
('MINE_OUTAGE','Mine / mineral processing disruption'),
('SMELTER_OUTAGE','Smelter/refinery disruption'),
('RARE_EARTH','Rare-earth supply disruption'),
('BATTERY_METALS','Battery-metal supply disruption'),
('FERTILIZER_OUTAGE','Fertilizer plant / export disruption'),
('CROP_PEST','Crop pest / plant disease shock'),
('ANIMAL_DISEASE','Animal disease outbreak'),
('FISHERIES','Fisheries shock'),
('WATER_RESERVOIR','Reservoir/water-storage shock'),
('DAM_FAILURE','Dam / major water infrastructure failure'),
('POWER_OUTAGE','Large-scale electricity outage'),
('GRID_ATTACK','Grid cyber/physical attack'),
('DATA_CENTER','Data-center / cloud infrastructure outage'),
('SUBSEA_CABLE','Subsea cable disruption'),
('TELECOM_OUTAGE','Telecommunications outage'),
('GNSS_OUTAGE','GNSS/navigation disruption'),
('SATELLITE_LOSS','Satellite loss/degradation'),
('SPACE_LAUNCH','Major launch/spaceflight disruption'),
('PORT_STRIKE','Port strike/labour shutdown'),
('RAIL_STRIKE','Rail strike/labour shutdown'),
('AIRLINE_FAILURE','Airline/aviation operator failure'),
('BANK_FAILURE','Bank failure/resolution'),
('PAYMENTS_OUTAGE','Payments/settlement infrastructure outage'),
('CAPITAL_CONTROLS','Capital-control shock'),
('DEFAULT','Sovereign/corporate default'),
('CREDIT_EVENT','Major credit event'),
('LIQUIDITY','Systemic liquidity stress'),
('PROPERTY','Property/real-estate systemic stress'),
('TARIFF','Tariff escalation'),
('EMBARGO','Embargo / trade restriction'),
('TECH_EXPORT_CONTROL','Technology export-control shock'),
('DATA_REGULATION','Major cross-border data/regulatory shock'),
('AI_REGULATION','AI regulatory shock'),
('BIOSECURITY','Biosecurity incident'),
('CHEMICAL','Major chemical incident'),
('INDUSTRIAL','Major industrial accident'),
('OIL_SPILL','Major oil spill'),
('NUCLEAR_ACCIDENT','Nuclear accident'),
('RADIATION','Radiological release'),
('TOXIC_RELEASE','Toxic environmental release'),
('AIR_POLLUTION','Severe air-pollution episode'),
('DUST_STORM','Major dust/sand storm'),
('AVALANCHE','Avalanche disaster'),
('TSUNAMI','Tsunami'),
('EARTHQUAKE','Earthquake'),
('FLOOD_FLASH','Flash flood'),
('FIRE_WEATHER','Extreme fire-weather event'),
('SEA_LEVEL','Acute coastal/sea-level hazard'),
('GLACIAL','Glacial/cryosphere shock'),
('EL_NINO','ENSO-related systemic shock'),
('SOLAR_STORM','Solar storm'),
('MAGNETIC_STORM','Geomagnetic disturbance')
on conflict (shock_id) do update set shock_name=excluded.shock_name,updated_at=now();

-- Recompute the fail-closed gap universe. CERTIFIED is intentionally untouched.
create or replace view public.live_global_source_universe_gaps as
select 'COUNTRY' as dimension_type, iso3 as dimension_id, country_name as label
from public.live_global_country_coverage
where required and status <> 'CERTIFIED'
union all
select 'CORRIDOR', corridor_id, corridor_name
from public.live_global_corridor_coverage
where required and status <> 'CERTIFIED'
union all
select 'SHOCK', shock_id, shock_name
from public.live_global_shock_taxonomy
where required and status <> 'CERTIFIED'
union all
select 'COUNTRY_DOMAIN', iso3 || ':' || domain, iso3 || ' / ' || domain
from public.live_country_source_requirements
where status <> 'CERTIFIED';

commit;