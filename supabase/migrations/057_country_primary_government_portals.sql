-- =============================================================================
-- Geomacro country primary government portal directory (195-country baseline)
--
-- Discovery reference: August 2026 country/official-portal census. This is an
-- internal candidate-source layer only. Every row remains REVIEW_REQUIRED and
-- disabled until direct endpoint, rights and schema checks are completed.
-- =============================================================================
begin;

create table if not exists public.live_country_primary_source_directory (
  country_iso2 text primary key,
  country_name text not null,
  government_portal_url text not null,
  discovery_source_url text not null default 'https://planetdecoder.com/countries-capitals-currencies-of-the-world/',
  discovery_published_at date not null default date '2026-08-30',
  verification_state text not null default 'DISCOVERED'
    check (verification_state in ('DISCOVERED','VERIFIED','REJECTED')),
  notes text not null default 'Candidate official/government portal. Direct endpoint, machine-access method and commercial reuse remain certification-gated.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_country_primary_source_directory
(country_iso2,country_name,government_portal_url)
values
('AF','Afghanistan','https://mfa.gov.af'),
('AL','Albania','https://kryeministria.al'),
('DZ','Algeria','https://premier-ministre.gov.dz'),
('AD','Andorra','https://govern.ad'),
('AO','Angola','https://governo.gov.ao'),
('AG','Antigua and Barbuda','https://ab.gov.ag'),
('AR','Argentina','https://argentina.gob.ar'),
('AM','Armenia','https://gov.am'),
('AU','Australia','https://australia.gov.au'),
('AT','Austria','https://oesterreich.gv.at'),
('AZ','Azerbaijan','https://cabmin.gov.az'),
('BS','Bahamas','https://bahamas.gov.bs'),
('BH','Bahrain','https://bahrain.bh'),
('BD','Bangladesh','https://bangladesh.gov.bd'),
('BB','Barbados','https://gov.bb'),
('BY','Belarus','https://government.gov.by'),
('BE','Belgium','https://belgium.be'),
('BZ','Belize','https://belize.gov.bz'),
('BJ','Benin','https://gouv.bj'),
('BT','Bhutan','https://cabinet.gov.bt'),
('BO','Bolivia','https://bolivia.gob.bo'),
('BA','Bosnia and Herzegovina','https://vijeceministara.gov.ba'),
('BW','Botswana','https://gov.bw'),
('BR','Brazil','https://gov.br'),
('BN','Brunei','https://gov.bn'),
('BG','Bulgaria','https://gov.bg'),
('BF','Burkina Faso','https://gouvernement.gov.bf'),
('BI','Burundi','https://presidence.gov.bi'),
('KH','Cambodia','https://cambodia.gov.kh'),
('CM','Cameroon','https://spm.gov.cm'),
('CA','Canada','https://canada.ca'),
('CV','Cape Verde','https://governo.cv'),
('CF','Central African Republic','https://gouvernement.cf'),
('TD','Chad','https://gouvernement.td'),
('CL','Chile','https://gob.cl'),
('CN','China','https://gov.cn'),
('CO','Colombia','https://gov.co'),
('KM','Comoros','https://gouvernement.km'),
('CD','Democratic Republic of the Congo','https://primature.cd'),
('CG','Republic of the Congo','https://gouvernement.cg'),
('CR','Costa Rica','https://presidencia.go.cr'),
('CI','Côte d’Ivoire','https://gouv.ci'),
('HR','Croatia','https://vlada.gov.hr'),
('CU','Cuba','https://cubagob.gob.cu'),
('CY','Cyprus','https://cyprus.gov.cy'),
('CZ','Czech Republic','https://vlada.gov.cz'),
('DK','Denmark','https://stm.dk'),
('DJ','Djibouti','https://presidence.dj'),
('DM','Dominica','https://dominica.gov.dm'),
('DO','Dominican Republic','https://presidencia.gob.do'),
('EC','Ecuador','https://presidencia.gob.ec'),
('EG','Egypt','https://cabinet.gov.eg'),
('SV','El Salvador','https://presidencia.gob.sv'),
('GQ','Equatorial Guinea','https://guineaecuatorialpress.com'),
('ER','Eritrea','https://shabait.com'),
('EE','Estonia','https://valitsus.ee'),
('SZ','Eswatini','https://gov.sz'),
('ET','Ethiopia','https://pmo.gov.et'),
('FJ','Fiji','https://fiji.gov.fj'),
('FI','Finland','https://valtioneuvosto.fi'),
('FR','France','https://gouvernement.fr'),
('GA','Gabon','https://gouvernement.ga'),
('GM','Gambia','https://op.gov.gm'),
('GE','Georgia','https://gov.ge'),
('DE','Germany','https://bundesregierung.de'),
('GH','Ghana','https://ghana.gov.gh'),
('GR','Greece','https://primeminister.gr'),
('GD','Grenada','https://gov.gd'),
('GT','Guatemala','https://guatemala.gob.gt'),
('GN','Guinea','https://primature.gov.gn'),
('GW','Guinea-Bissau','https://gov.gw'),
('GY','Guyana','https://op.gov.gy'),
('HT','Haiti','https://primature.gouv.ht'),
('HN','Honduras','https://presidencia.gob.hn'),
('HU','Hungary','https://kormany.hu'),
('IS','Iceland','https://government.is'),
('IN','India','https://india.gov.in'),
('ID','Indonesia','https://indonesia.go.id'),
('IR','Iran','https://president.ir'),
('IQ','Iraq','https://gds.gov.iq'),
('IE','Ireland','https://gov.ie'),
('IL','Israel','https://gov.il'),
('IT','Italy','https://governo.it'),
('JM','Jamaica','https://opm.gov.jm'),
('JP','Japan','https://japan.go.jp'),
('JO','Jordan','https://jordan.gov.jo'),
('KZ','Kazakhstan','https://gov.kz'),
('KE','Kenya','https://president.go.ke'),
('KI','Kiribati','https://kiribati.gov.ki'),
('KW','Kuwait','https://cmgs.gov.kw'),
('KG','Kyrgyzstan','https://gov.kg'),
('LA','Laos','https://laogov.gov.la'),
('LV','Latvia','https://mk.gov.lv'),
('LB','Lebanon','https://pcm.gov.lb'),
('LS','Lesotho','https://gov.ls'),
('LR','Liberia','https://emansion.gov.lr'),
('LY','Libya','https://pm.gov.ly'),
('LI','Liechtenstein','https://regierung.li'),
('LT','Lithuania','https://lrv.lt'),
('LU','Luxembourg','https://gouvernement.lu'),
('MG','Madagascar','https://primature.gov.mg'),
('MW','Malawi','https://malawi.gov.mw'),
('MY','Malaysia','https://malaysia.gov.my'),
('MV','Maldives','https://presidency.gov.mv'),
('ML','Mali','https://primature.ml'),
('MT','Malta','https://gov.mt'),
('MH','Marshall Islands','https://rmi-government-digital.org'),
('MR','Mauritania','https://primature.gov.mr'),
('MU','Mauritius','https://govmu.org'),
('MX','Mexico','https://gob.mx'),
('FM','Micronesia','https://fsmgov.org'),
('MD','Moldova','https://gov.md'),
('MC','Monaco','https://gouv.mc'),
('MN','Mongolia','https://gov.mn'),
('ME','Montenegro','https://gov.me'),
('MA','Morocco','https://cg.gov.ma'),
('MZ','Mozambique','https://portaldogoverno.gov.mz'),
('MM','Myanmar','https://myanmar.gov.mm'),
('NA','Namibia','https://gov.na'),
('NR','Nauru','https://naurugov.nr'),
('NP','Nepal','https://nepal.gov.np'),
('NL','Netherlands','https://government.nl'),
('NZ','New Zealand','https://govt.nz'),
('NI','Nicaragua','https://ineter.gob.ni'),
('NE','Niger','https://pmo.ne'),
('NG','Nigeria','https://statehouse.gov.ng'),
('KP','North Korea','https://naenara.com.kp'),
('MK','North Macedonia','https://vlada.mk'),
('NO','Norway','https://regjeringen.no'),
('OM','Oman','https://omanportal.gov.om'),
('PK','Pakistan','https://pakistan.gov.pk'),
('PW','Palau','https://palaugov.pw'),
('PA','Panama','https://presidencia.gob.pa'),
('PG','Papua New Guinea','https://papuanewguinea.travel'),
('PY','Paraguay','https://presidencia.gov.py'),
('PE','Peru','https://gob.pe'),
('PH','Philippines','https://gov.ph'),
('PL','Poland','https://gov.pl'),
('PT','Portugal','https://portugal.gov.pt'),
('QA','Qatar','https://diwan.gov.qa'),
('RO','Romania','https://gov.ro'),
('RU','Russia','https://government.ru'),
('RW','Rwanda','https://gov.rw'),
('KN','Saint Kitts and Nevis','https://gov.kn'),
('LC','Saint Lucia','https://govt.lc'),
('VC','Saint Vincent and the Grenadines','https://gov.vc'),
('WS','Samoa','https://samoagovt.ws'),
('SM','San Marino','https://regione.sanmarino.sm'),
('ST','São Tomé and Príncipe','https://gov.st'),
('SA','Saudi Arabia','https://saudi.gov.sa'),
('SN','Senegal','https://sec.gouv.sn'),
('RS','Serbia','https://srbija.gov.rs'),
('SC','Seychelles','https://statehouse.gov.sc'),
('SL','Sierra Leone','https://statehouse.gov.sl'),
('SG','Singapore','https://gov.sg'),
('SK','Slovakia','https://vlada.gov.sk'),
('SI','Slovenia','https://gov.si'),
('SB','Solomon Islands','https://solomons.gov.sb'),
('SO','Somalia','https://somaligov.net'),
('ZA','South Africa','https://gov.za'),
('KR','South Korea','https://korea.go.kr'),
('SS','South Sudan','https://goss.org'),
('ES','Spain','https://lamoncloa.gob.es'),
('LK','Sri Lanka','https://gov.lk'),
('SD','Sudan','https://sudan.gov.sd'),
('SR','Suriname','https://gov.sr'),
('SE','Sweden','https://government.se'),
('CH','Switzerland','https://admin.ch'),
('SY','Syria','https://egov.sy'),
('TW','Taiwan','https://taiwan.gov.tw'),
('TJ','Tajikistan','https://khovar.tj'),
('TZ','Tanzania','https://tanzania.go.tz'),
('TH','Thailand','https://thaigov.go.th'),
('TL','Timor-Leste','https://timor-leste.gov.tl'),
('TG','Togo','https://gouvernement.gouv.tg'),
('TO','Tonga','https://mic.gov.to'),
('TT','Trinidad and Tobago','https://gov.tt'),
('TN','Tunisia','https://fr.tunisie.gov.tn'),
('TR','Turkey','https://turkiye.gov.tr'),
('TM','Turkmenistan','https://turkmenistan.gov.tm'),
('TV','Tuvalu','https://tuvalugov.tv'),
('UG','Uganda','https://statehouse.go.ug'),
('UA','Ukraine','https://kmu.gov.ua'),
('AE','United Arab Emirates','https://u.ae'),
('GB','United Kingdom','https://gov.uk'),
('US','United States','https://usa.gov'),
('UY','Uruguay','https://gub.uy'),
('UZ','Uzbekistan','https://gov.uz'),
('VU','Vanuatu','https://gov.vu'),
('VA','Vatican City','https://vaticanstate.va'),
('VE','Venezuela','https://mppre.gob.ve'),
('VN','Vietnam','https://chinhphu.vn'),
('YE','Yemen','https://yemen.gov.ye'),
('ZM','Zambia','https://pmo.gov.zm'),
('ZW','Zimbabwe','https://zim.gov.zw')
on conflict(country_iso2) do update set
  country_name=excluded.country_name,
  government_portal_url=excluded.government_portal_url,
  discovery_source_url=excluded.discovery_source_url,
  discovery_published_at=excluded.discovery_published_at,
  verification_state='DISCOVERED',
  notes=excluded.notes,
  updated_at=now();

-- One source registration per country for the government-portal detection path.
insert into public.live_external_sources (
 source_id,source_name,provider_name,category,access_type,authentication_type,base_url,
 licence_name,commercial_usage_status,raw_redistribution_allowed,attribution_required,
 enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes
)
select
 'gov_portal_' || lower(d.country_iso2),
 'Government portal - ' || d.country_name,
 'National government / official state portal',
 'GEOPOLITICS',
 'HTML',
 'NONE',
 d.government_portal_url,
 null,
 'REVIEW_REQUIRED',
 false,true,false,false,
 upper(coalesce(r.iso3,d.country_iso2)),
 'SOURCE_DEPENDENT',
 'Country-primary discovery source. Portal identity was discovered from a 2026 country/official-portal directory; direct endpoint and rights certification remain pending.'
from public.live_country_primary_source_directory d
left join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
on conflict(source_id) do update set
 source_name=excluded.source_name,
 provider_name=excluded.provider_name,
 base_url=excluded.base_url,
 commercial_usage_status=excluded.commercial_usage_status,
 country_scope=excluded.country_scope,
 freshness_class=excluded.freshness_class,
 notes=excluded.notes,
 updated_at=now();

-- Attach the country-primary source to every matching canonical country.
insert into public.live_global_source_universe
(universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
select
 'COUNTRY:' || r.iso3 || ':GOVERNMENT_PORTAL:gov_portal_' || lower(d.country_iso2),
 'COUNTRY', r.iso3, 'GOVERNMENT_PORTAL',
 'gov_portal_' || lower(d.country_iso2),
 5, true,
 'Direct national government portal candidate for country-level event/policy detection.'
from public.live_country_primary_source_directory d
join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
where r.enabled=true
on conflict(scope_type,scope_code,source_role,source_id) do update set
 priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

-- Status: all 195 directory records must exist before certification starts.
create or replace view public.live_country_primary_source_directory_status
with (security_invoker=true)
as
select
 count(*)::bigint as directory_rows,
 count(*) filter (where verification_state='VERIFIED')::bigint as verified_rows,
 count(*) filter (where verification_state='DISCOVERED')::bigint as discovered_rows,
 195::bigint as expected_195_baseline,
 (count(*)=195) as directory_complete,
 false as certification_gate_open
from public.live_country_primary_source_directory;

alter table public.live_country_primary_source_directory enable row level security;
revoke all on public.live_country_primary_source_directory from public,anon,authenticated;
grant select on public.live_country_primary_source_directory to service_role;

comment on table public.live_country_primary_source_directory is
 'Internal national government portal discovery directory. Derived from an August 2026 country/official-portal list; does not itself prove endpoint operation or reuse rights.';

commit;
