-- =============================================================================
-- Geomacro country monetary-authority / central-bank source directory
--
-- Discovery basis: current BIS member list plus ICOMON Central Banks of the
-- World directory and official central-bank / monetary-authority domains.
-- This is an internal discovery registry only. All rows remain REVIEW_REQUIRED
-- and disabled until exact endpoint, rights, schema and freshness checks.
-- =============================================================================
begin;

create table if not exists public.live_country_monetary_authority_directory (
  country_iso2 text primary key,
  authority_name text not null,
  authority_url text not null,
  authority_type text not null check (
    authority_type in (
      'NATIONAL_CENTRAL_BANK',
      'NATIONAL_MONETARY_AUTHORITY',
      'REGIONAL_CENTRAL_BANK',
      'EURO_SYSTEM',
      'CURRENCY_SYSTEM_FALLBACK'
    )
  ),
  discovery_basis text not null default 'BIS / ICOMON / first-party official domain',
  verification_state text not null default 'DISCOVERED'
    check (verification_state in ('DISCOVERED','VERIFIED','REJECTED')),
  notes text not null default 'Discovery source only. Exact machine endpoint, rights and commercial reuse remain certification-gated.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_country_monetary_authority_directory
(country_iso2,authority_name,authority_url,authority_type)
values
('AF','Da Afghanistan Bank','https://www.dab.gov.af','NATIONAL_CENTRAL_BANK'),
('AL','Bank of Albania','https://www.bankofalbania.org','NATIONAL_CENTRAL_BANK'),
('DZ','Bank of Algeria','https://www.bank-of-algeria.dz','NATIONAL_CENTRAL_BANK'),
('AD','Eurosystem / European Central Bank','https://www.ecb.europa.eu','EURO_SYSTEM'),
('AO','National Bank of Angola','https://www.bna.ao','NATIONAL_CENTRAL_BANK'),
('AG','Eastern Caribbean Central Bank','https://www.eccb-centralbank.org','REGIONAL_CENTRAL_BANK'),
('AR','Central Bank of Argentina','https://www.bcra.gob.ar','NATIONAL_CENTRAL_BANK'),
('AM','Central Bank of Armenia','https://www.cba.am','NATIONAL_CENTRAL_BANK'),
('AU','Reserve Bank of Australia','https://www.rba.gov.au','NATIONAL_CENTRAL_BANK'),
('AT','Oesterreichische Nationalbank','https://www.oenb.at','NATIONAL_CENTRAL_BANK'),
('AZ','Central Bank of Azerbaijan','https://en.cbar.az','NATIONAL_CENTRAL_BANK'),
('BS','Central Bank of The Bahamas','https://www.centralbankbahamas.com','NATIONAL_CENTRAL_BANK'),
('BH','Central Bank of Bahrain','https://www.cbb.gov.bh','NATIONAL_CENTRAL_BANK'),
('BD','Bangladesh Bank','https://www.bb.org.bd','NATIONAL_CENTRAL_BANK'),
('BB','Central Bank of Barbados','https://www.centralbank.org.bb','NATIONAL_CENTRAL_BANK'),
('BY','National Bank of the Republic of Belarus','https://www.nbrb.by','NATIONAL_CENTRAL_BANK'),
('BE','National Bank of Belgium','https://www.nbb.be','NATIONAL_CENTRAL_BANK'),
('BZ','Central Bank of Belize','https://www.centralbank.org.bz','NATIONAL_CENTRAL_BANK'),
('BJ','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('BT','Royal Monetary Authority of Bhutan','https://www.rma.org.bt','NATIONAL_MONETARY_AUTHORITY'),
('BO','Central Bank of Bolivia','https://www.bcb.gob.bo','NATIONAL_CENTRAL_BANK'),
('BA','Central Bank of Bosnia and Herzegovina','https://www.cbbh.ba','NATIONAL_CENTRAL_BANK'),
('BW','Bank of Botswana','https://www.bankofbotswana.bw','NATIONAL_CENTRAL_BANK'),
('BR','Central Bank of Brazil','https://www.bcb.gov.br','NATIONAL_CENTRAL_BANK'),
('BN','Brunei Darussalam Central Bank','https://www.bdcb.gov.bn','NATIONAL_CENTRAL_BANK'),
('BG','Bulgarian National Bank','https://www.bnb.bg','NATIONAL_CENTRAL_BANK'),
('BF','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('BI','Bank of the Republic of Burundi','https://www.brb.bi','NATIONAL_CENTRAL_BANK'),
('KH','National Bank of Cambodia','https://www.nbc.org.kh','NATIONAL_CENTRAL_BANK'),
('CM','Bank of Central African States','https://www.beac.int','REGIONAL_CENTRAL_BANK'),
('CA','Bank of Canada','https://www.bankofcanada.ca','NATIONAL_CENTRAL_BANK'),
('CV','Bank of Cape Verde','https://www.bcv.cv','NATIONAL_CENTRAL_BANK'),
('CF','Bank of Central African States','https://www.beac.int','REGIONAL_CENTRAL_BANK'),
('TD','Bank of Central African States','https://www.beac.int','REGIONAL_CENTRAL_BANK'),
('CL','Central Bank of Chile','https://www.bcentral.cl','NATIONAL_CENTRAL_BANK'),
('CN','People''s Bank of China','https://www.pbc.gov.cn','NATIONAL_CENTRAL_BANK'),
('CO','Bank of the Republic','https://www.banrep.gov.co','NATIONAL_CENTRAL_BANK'),
('KM','Central Bank of the Comoros','https://www.banque-comores.km','NATIONAL_CENTRAL_BANK'),
('CD','Central Bank of the Congo','https://www.bcc.cd','NATIONAL_CENTRAL_BANK'),
('CG','Bank of Central African States','https://www.beac.int','REGIONAL_CENTRAL_BANK'),
('CR','Central Bank of Costa Rica','https://www.bccr.fi.cr','NATIONAL_CENTRAL_BANK'),
('CI','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('HR','Croatian National Bank','https://www.hnb.hr','NATIONAL_CENTRAL_BANK'),
('CU','Central Bank of Cuba','https://www.bc.gob.cu','NATIONAL_CENTRAL_BANK'),
('CY','Central Bank of Cyprus','https://www.centralbank.cy','NATIONAL_CENTRAL_BANK'),
('CZ','Czech National Bank','https://www.cnb.cz','NATIONAL_CENTRAL_BANK'),
('DK','Danmarks Nationalbank','https://www.nationalbanken.dk','NATIONAL_CENTRAL_BANK'),
('DJ','Central Bank of Djibouti','https://www.banque-centrale.dj','NATIONAL_CENTRAL_BANK'),
('DM','Eastern Caribbean Central Bank','https://www.eccb-centralbank.org','REGIONAL_CENTRAL_BANK'),
('DO','Central Bank of the Dominican Republic','https://www.bancentral.gov.do','NATIONAL_CENTRAL_BANK'),
('EC','Central Bank of Ecuador','https://www.bce.fin.ec','NATIONAL_CENTRAL_BANK'),
('EG','Central Bank of Egypt','https://www.cbe.org.eg','NATIONAL_CENTRAL_BANK'),
('SV','Central Reserve Bank of El Salvador','https://www.bcr.gob.sv','NATIONAL_CENTRAL_BANK'),
('GQ','Bank of Central African States','https://www.beac.int','REGIONAL_CENTRAL_BANK'),
('ER','National Bank of Eritrea','https://www.boe.gov.er','NATIONAL_CENTRAL_BANK'),
('EE','Bank of Estonia','https://www.eestipank.ee','NATIONAL_CENTRAL_BANK'),
('SZ','Central Bank of Eswatini','https://www.centralbank.org.sz','NATIONAL_CENTRAL_BANK'),
('ET','National Bank of Ethiopia','https://www.nbe.gov.et','NATIONAL_CENTRAL_BANK'),
('FJ','Reserve Bank of Fiji','https://www.rbf.gov.fj','NATIONAL_CENTRAL_BANK'),
('FI','Bank of Finland','https://www.bof.fi','NATIONAL_CENTRAL_BANK'),
('FR','Bank of France','https://www.banque-france.fr','NATIONAL_CENTRAL_BANK'),
('GA','Bank of Central African States','https://www.beac.int','REGIONAL_CENTRAL_BANK'),
('GM','Central Bank of The Gambia','https://www.cbg.gm','NATIONAL_CENTRAL_BANK'),
('GE','National Bank of Georgia','https://www.nbg.gov.ge','NATIONAL_CENTRAL_BANK'),
('DE','Deutsche Bundesbank','https://www.bundesbank.de','NATIONAL_CENTRAL_BANK'),
('GH','Bank of Ghana','https://www.bog.gov.gh','NATIONAL_CENTRAL_BANK'),
('GR','Bank of Greece','https://www.bankofgreece.gr','NATIONAL_CENTRAL_BANK'),
('GD','Eastern Caribbean Central Bank','https://www.eccb-centralbank.org','REGIONAL_CENTRAL_BANK'),
('GT','Bank of Guatemala','https://www.banguat.gob.gt','NATIONAL_CENTRAL_BANK'),
('GN','Central Bank of the Republic of Guinea','https://www.bcrg-guinee.org','NATIONAL_CENTRAL_BANK'),
('GW','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('GY','Bank of Guyana','https://www.bankofguyana.org.gy','NATIONAL_CENTRAL_BANK'),
('HT','Bank of the Republic of Haiti','https://www.brh.net','NATIONAL_CENTRAL_BANK'),
('HN','Central Bank of Honduras','https://www.bch.hn','NATIONAL_CENTRAL_BANK'),
('HU','Hungarian National Bank','https://www.mnb.hu','NATIONAL_CENTRAL_BANK'),
('IS','Central Bank of Iceland','https://www.cb.is','NATIONAL_CENTRAL_BANK'),
('IN','Reserve Bank of India','https://www.rbi.org.in','NATIONAL_CENTRAL_BANK'),
('ID','Bank Indonesia','https://www.bi.go.id','NATIONAL_CENTRAL_BANK'),
('IR','Central Bank of the Islamic Republic of Iran','https://www.cbi.ir','NATIONAL_CENTRAL_BANK'),
('IQ','Central Bank of Iraq','https://www.cbi.iq','NATIONAL_CENTRAL_BANK'),
('IE','Central Bank of Ireland','https://www.centralbank.ie','NATIONAL_CENTRAL_BANK'),
('IL','Bank of Israel','https://www.boi.org.il','NATIONAL_CENTRAL_BANK'),
('IT','Bank of Italy','https://www.bancaditalia.it','NATIONAL_CENTRAL_BANK'),
('JM','Bank of Jamaica','https://www.boj.org.jm','NATIONAL_CENTRAL_BANK'),
('JP','Bank of Japan','https://www.boj.or.jp','NATIONAL_CENTRAL_BANK'),
('JO','Central Bank of Jordan','https://www.cbj.gov.jo','NATIONAL_CENTRAL_BANK'),
('KZ','National Bank of Kazakhstan','https://www.nationalbank.kz','NATIONAL_CENTRAL_BANK'),
('KE','Central Bank of Kenya','https://www.centralbank.go.ke','NATIONAL_CENTRAL_BANK'),
('KI','Currency system / external monetary authority','https://www.federalreserve.gov','CURRENCY_SYSTEM_FALLBACK'),
('KW','Central Bank of Kuwait','https://www.cbk.gov.kw','NATIONAL_CENTRAL_BANK'),
('KG','National Bank of the Kyrgyz Republic','https://www.nbkr.kg','NATIONAL_CENTRAL_BANK'),
('LA','Bank of the Lao PDR','https://www.bol.gov.la','NATIONAL_CENTRAL_BANK'),
('LV','Bank of Latvia','https://www.bank.lv','NATIONAL_CENTRAL_BANK'),
('LB','Bank of Lebanon','https://www.bdl.gov.lb','NATIONAL_CENTRAL_BANK'),
('LS','Central Bank of Lesotho','https://www.centralbank.org.ls','NATIONAL_CENTRAL_BANK'),
('LR','Central Bank of Liberia','https://www.cbl.org.lr','NATIONAL_CENTRAL_BANK'),
('LY','Central Bank of Libya','https://www.cbl.gov.ly','NATIONAL_CENTRAL_BANK'),
('LI','Financial Market Authority / Swiss franc monetary system','https://www.fma-li.li','CURRENCY_SYSTEM_FALLBACK'),
('LT','Bank of Lithuania','https://www.lb.lt','NATIONAL_CENTRAL_BANK'),
('LU','Central Bank of Luxembourg','https://www.bcl.lu','NATIONAL_CENTRAL_BANK'),
('MG','Central Bank of Madagascar','https://www.banque-centrale.mg','NATIONAL_CENTRAL_BANK'),
('MW','Reserve Bank of Malawi','https://www.rbm.mw','NATIONAL_CENTRAL_BANK'),
('MY','Bank Negara Malaysia','https://www.bnm.gov.my','NATIONAL_CENTRAL_BANK'),
('MV','Maldives Monetary Authority','https://www.mma.gov.mv','NATIONAL_MONETARY_AUTHORITY'),
('ML','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('MT','Central Bank of Malta','https://www.centralbankmalta.org','NATIONAL_CENTRAL_BANK'),
('MH','U.S. dollar monetary system / Federal Reserve reference','https://www.federalreserve.gov','CURRENCY_SYSTEM_FALLBACK'),
('MR','Central Bank of Mauritania','https://www.bcm.mr','NATIONAL_CENTRAL_BANK'),
('MU','Bank of Mauritius','https://www.bom.mu','NATIONAL_CENTRAL_BANK'),
('MX','Bank of Mexico','https://www.banxico.org.mx','NATIONAL_CENTRAL_BANK'),
('FM','U.S. dollar monetary system / Federal Reserve reference','https://www.federalreserve.gov','CURRENCY_SYSTEM_FALLBACK'),
('MD','National Bank of Moldova','https://www.bnm.md','NATIONAL_CENTRAL_BANK'),
('MC','Eurosystem / European Central Bank','https://www.ecb.europa.eu','EURO_SYSTEM'),
('MN','Bank of Mongolia','https://www.mongolbank.mn','NATIONAL_CENTRAL_BANK'),
('ME','Central Bank of Montenegro','https://www.cb-cg.org','NATIONAL_CENTRAL_BANK'),
('MA','Bank Al-Maghrib','https://www.bkam.ma','NATIONAL_CENTRAL_BANK'),
('MZ','Bank of Mozambique','https://www.bancomoc.mz','NATIONAL_CENTRAL_BANK'),
('MM','Central Bank of Myanmar','https://www.cbm.gov.mm','NATIONAL_CENTRAL_BANK'),
('NA','Bank of Namibia','https://www.bon.com.na','NATIONAL_CENTRAL_BANK'),
('NR','Australian dollar monetary system / Reserve Bank of Australia reference','https://www.rba.gov.au','CURRENCY_SYSTEM_FALLBACK'),
('NP','Nepal Rastra Bank','https://www.nrb.org.np','NATIONAL_CENTRAL_BANK'),
('NL','De Nederlandsche Bank','https://www.dnb.nl','NATIONAL_CENTRAL_BANK'),
('NZ','Reserve Bank of New Zealand','https://www.rbnz.govt.nz','NATIONAL_CENTRAL_BANK'),
('NI','Central Bank of Nicaragua','https://www.bcn.gob.ni','NATIONAL_CENTRAL_BANK'),
('NE','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('NG','Central Bank of Nigeria','https://www.cbn.gov.ng','NATIONAL_CENTRAL_BANK'),
('KP','Monetary authority discovery via official state portal','https://www.naenara.com.kp','CURRENCY_SYSTEM_FALLBACK'),
('MK','National Bank of the Republic of North Macedonia','https://www.nbrm.mk','NATIONAL_CENTRAL_BANK'),
('NO','Norges Bank','https://www.norges-bank.no','NATIONAL_CENTRAL_BANK'),
('OM','Central Bank of Oman','https://www.cbo-oman.org','NATIONAL_CENTRAL_BANK'),
('PK','State Bank of Pakistan','https://www.sbp.org.pk','NATIONAL_CENTRAL_BANK'),
('PW','U.S. dollar monetary system / Federal Reserve reference','https://www.federalreserve.gov','CURRENCY_SYSTEM_FALLBACK'),
('PA','Panama financial and monetary-system authority','https://www.banconal.com.pa','CURRENCY_SYSTEM_FALLBACK'),
('PG','Bank of Papua New Guinea','https://www.bankpng.gov.pg','NATIONAL_CENTRAL_BANK'),
('PY','Central Bank of Paraguay','https://www.bcp.gov.py','NATIONAL_CENTRAL_BANK'),
('PE','Central Reserve Bank of Peru','https://www.bcrp.gob.pe','NATIONAL_CENTRAL_BANK'),
('PH','Bangko Sentral ng Pilipinas','https://www.bsp.gov.ph','NATIONAL_CENTRAL_BANK'),
('PL','National Bank of Poland','https://www.nbp.pl','NATIONAL_CENTRAL_BANK'),
('PT','Banco de Portugal','https://www.bportugal.pt','NATIONAL_CENTRAL_BANK'),
('QA','Qatar Central Bank','https://www.qcb.gov.qa','NATIONAL_CENTRAL_BANK'),
('RO','National Bank of Romania','https://www.bnr.ro','NATIONAL_CENTRAL_BANK'),
('RU','Central Bank of the Russian Federation','https://www.cbr.ru','NATIONAL_CENTRAL_BANK'),
('RW','National Bank of Rwanda','https://www.bnr.rw','NATIONAL_CENTRAL_BANK'),
('KN','Eastern Caribbean Central Bank','https://www.eccb-centralbank.org','REGIONAL_CENTRAL_BANK'),
('LC','Eastern Caribbean Central Bank','https://www.eccb-centralbank.org','REGIONAL_CENTRAL_BANK'),
('VC','Eastern Caribbean Central Bank','https://www.eccb-centralbank.org','REGIONAL_CENTRAL_BANK'),
('WS','Central Bank of Samoa','https://www.cbs.gov.ws','NATIONAL_CENTRAL_BANK'),
('SM','Central Bank of San Marino','https://www.bcsm.sm','NATIONAL_CENTRAL_BANK'),
('ST','Central Bank of São Tomé and Príncipe','https://www.bcstp.st','NATIONAL_CENTRAL_BANK'),
('SA','Saudi Central Bank','https://www.sama.gov.sa','NATIONAL_CENTRAL_BANK'),
('SN','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('RS','National Bank of Serbia','https://www.nbs.rs','NATIONAL_CENTRAL_BANK'),
('SC','Central Bank of Seychelles','https://www.cbs.sc','NATIONAL_CENTRAL_BANK'),
('SL','Central Bank of Sierra Leone','https://www.bsl.gov.sl','NATIONAL_CENTRAL_BANK'),
('SG','Monetary Authority of Singapore','https://www.mas.gov.sg','NATIONAL_MONETARY_AUTHORITY'),
('SK','National Bank of Slovakia','https://www.nbs.sk','NATIONAL_CENTRAL_BANK'),
('SI','Bank of Slovenia','https://www.bsi.si','NATIONAL_CENTRAL_BANK'),
('SB','Central Bank of Solomon Islands','https://www.cbsi.com.sb','NATIONAL_CENTRAL_BANK'),
('SO','Central Bank of Somalia','https://www.centralbank.gov.so','NATIONAL_CENTRAL_BANK'),
('ZA','South African Reserve Bank','https://www.resbank.co.za','NATIONAL_CENTRAL_BANK'),
('KR','Bank of Korea','https://www.bok.or.kr','NATIONAL_CENTRAL_BANK'),
('SS','Bank of South Sudan','https://www.bankofsouthsudan.org','NATIONAL_CENTRAL_BANK'),
('ES','Bank of Spain','https://www.bde.es','NATIONAL_CENTRAL_BANK'),
('LK','Central Bank of Sri Lanka','https://www.cbsl.gov.lk','NATIONAL_CENTRAL_BANK'),
('SD','Central Bank of Sudan','https://www.cbos.gov.sd','NATIONAL_CENTRAL_BANK'),
('SR','Central Bank of Suriname','https://www.cbvs.sr','NATIONAL_CENTRAL_BANK'),
('SE','Sveriges Riksbank','https://www.riksbank.se','NATIONAL_CENTRAL_BANK'),
('CH','Swiss National Bank','https://www.snb.ch','NATIONAL_CENTRAL_BANK'),
('SY','Central Bank of Syria','https://www.banquecentrale.gov.sy','NATIONAL_CENTRAL_BANK'),
('TW','Central Bank of the Republic of China (Taiwan)','https://www.cbc.gov.tw','NATIONAL_CENTRAL_BANK'),
('TJ','National Bank of Tajikistan','https://www.nbt.tj','NATIONAL_CENTRAL_BANK'),
('TZ','Bank of Tanzania','https://www.bot.go.tz','NATIONAL_CENTRAL_BANK'),
('TH','Bank of Thailand','https://www.bot.or.th','NATIONAL_CENTRAL_BANK'),
('TL','Banco Central de Timor-Leste','https://www.bancocentral.tl','NATIONAL_CENTRAL_BANK'),
('TG','Central Bank of West African States','https://www.bceao.int','REGIONAL_CENTRAL_BANK'),
('TO','National Reserve Bank of Tonga','https://www.reservebank.to','NATIONAL_CENTRAL_BANK'),
('TT','Central Bank of Trinidad and Tobago','https://www.central-bank.org.tt','NATIONAL_CENTRAL_BANK'),
('TN','Central Bank of Tunisia','https://www.bct.gov.tn','NATIONAL_CENTRAL_BANK'),
('TR','Central Bank of the Republic of Türkiye','https://www.tcmb.gov.tr','NATIONAL_CENTRAL_BANK'),
('TM','Central Bank of Turkmenistan','https://www.cbt.tm','NATIONAL_CENTRAL_BANK'),
('TV','Australian dollar monetary system / Reserve Bank of Australia reference','https://www.rba.gov.au','CURRENCY_SYSTEM_FALLBACK'),
('UG','Bank of Uganda','https://www.bou.or.ug','NATIONAL_CENTRAL_BANK'),
('UA','National Bank of Ukraine','https://bank.gov.ua','NATIONAL_CENTRAL_BANK'),
('AE','Central Bank of the United Arab Emirates','https://www.centralbank.ae','NATIONAL_CENTRAL_BANK'),
('GB','Bank of England','https://www.bankofengland.co.uk','NATIONAL_CENTRAL_BANK'),
('US','Board of Governors of the Federal Reserve System','https://www.federalreserve.gov','NATIONAL_CENTRAL_BANK'),
('UY','Central Bank of Uruguay','https://www.bcu.gub.uy','NATIONAL_CENTRAL_BANK'),
('UZ','Central Bank of Uzbekistan','https://www.cbu.uz','NATIONAL_CENTRAL_BANK'),
('VU','Reserve Bank of Vanuatu','https://www.rbv.gov.vu','NATIONAL_CENTRAL_BANK'),
('VA','Administration of the Patrimony of the Apostolic See / euro system reference','https://www.vatican.va/roman_curia/uffici/apsa/index_en.htm','CURRENCY_SYSTEM_FALLBACK'),
('VE','Central Bank of Venezuela','https://www.bcv.org.ve','NATIONAL_CENTRAL_BANK'),
('VN','State Bank of Vietnam','https://www.sbv.gov.vn','NATIONAL_CENTRAL_BANK'),
('YE','Central Bank of Yemen','https://www.centralbank.gov.ye','NATIONAL_CENTRAL_BANK'),
('ZM','Bank of Zambia','https://www.boz.zm','NATIONAL_CENTRAL_BANK'),
('ZW','Reserve Bank of Zimbabwe','https://www.rbz.co.zw','NATIONAL_CENTRAL_BANK')
on conflict(country_iso2) do update set
 authority_name=excluded.authority_name,
 authority_url=excluded.authority_url,
 authority_type=excluded.authority_type,
 verification_state='DISCOVERED',
 updated_at=now();

insert into public.live_external_sources
(source_id,source_name,provider_name,category,access_type,authentication_type,base_url,licence_name,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes)
select
 'monetary_'||lower(d.country_iso2),
 'Monetary authority - '||d.authority_name,
 d.authority_name,
 'MACRO',
 'HTML',
 'NONE',
 d.authority_url,
 null,
 'REVIEW_REQUIRED',
 false,true,false,false,
 upper(coalesce(r.iso3,d.country_iso2)),
 'NEAR_REAL_TIME',
 'National/monetary-authority discovery source. BIS/ICOMON or first-party domain reference; machine endpoint, rights and commercial reuse remain certification-gated.'
from public.live_country_monetary_authority_directory d
left join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
on conflict(source_id) do update set
 source_name=excluded.source_name,provider_name=excluded.provider_name,base_url=excluded.base_url,
 commercial_usage_status=excluded.commercial_usage_status,
 enabled_for_ingestion=false,enabled_for_commercial_signals=false,
 country_scope=excluded.country_scope,freshness_class=excluded.freshness_class,
 notes=excluded.notes,updated_at=now();

insert into public.live_global_source_universe
(universe_id,scope_type,scope_code,source_role,source_id,priority,required,notes)
select
 'COUNTRY:'||r.iso3||':MONETARY_AUTHORITY:monetary_'||lower(d.country_iso2),
 'COUNTRY',r.iso3,'MONETARY_AUTHORITY','monetary_'||lower(d.country_iso2),
 6,true,'Direct or shared monetary-authority source candidate for rate, FX, reserves, liquidity and payments intelligence.'
from public.live_country_monetary_authority_directory d
join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
where r.enabled=true
on conflict(scope_type,scope_code,source_role,source_id) do update set
 priority=excluded.priority,required=excluded.required,notes=excluded.notes,updated_at=now();

insert into public.live_source_certification_queue
(queue_key,scope_type,scope_code,module_id,source_role,source_id,notes)
select
 'COUNTRY:'||r.iso3||':MONETARY_AUTHORITY:monetary_'||lower(d.country_iso2),
 'COUNTRY',r.iso3,NULL,'STATISTICS_OFFICE',
 'monetary_'||lower(d.country_iso2),
 'Monetary-authority path. Certification intentionally queued.'
from public.live_country_monetary_authority_directory d
join public.live_country_registry r on upper(r.iso2)=upper(d.country_iso2)
where r.enabled=true
on conflict(queue_key) do nothing;

create or replace view public.live_country_monetary_authority_directory_status
with (security_invoker=true)
as
select
 count(*)::bigint directory_rows,
 count(*) filter(where verification_state='VERIFIED')::bigint verified_rows,
 count(*) filter(where verification_state='DISCOVERED')::bigint discovered_rows,
 195::bigint expected_country_baseline,
 (count(*)=195) directory_complete,
 false certification_gate_open
from public.live_country_monetary_authority_directory;

alter table public.live_country_monetary_authority_directory enable row level security;
revoke all on public.live_country_monetary_authority_directory from public,anon,authenticated;
grant select on public.live_country_monetary_authority_directory to service_role;

-- Specialist source additions for shock families that are not adequately
-- represented by generic news/aggregate data.
insert into public.live_external_sources
(source_id,source_name,provider_name,category,access_type,authentication_type,base_url,licence_name,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class,notes)
values
('jodi_oil_world_database','JODI-Oil World Database','Joint Organisations Data Initiative','MACRO','CSV','NONE','https://www.jodidata.org/oil/database/data-downloads.aspx',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','MONTHLY','Global oil data with country-level products/flows; current download page exposes 2026 data.'),
('fao_desert_locust_watch','FAO Desert Locust Watch','FAO','MULTI_DOMAIN','HTML','NONE','https://www.fao.org/locust-watch/en',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Official locust early-warning and regional bulletins.'),
('woah_wahis','WOAH WAHIS Animal Health Information','World Organisation for Animal Health','MULTI_DOMAIN','HTML','NONE','https://wahis.woah.org/',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Official animal-disease event and monitoring information; public interface supports analysis and risk-based decision-making.'),
('iaea_news_events','IAEA News and Events','International Atomic Energy Agency','GEOPOLITICS','HTML','NONE','https://www.iaea.org/newscenter',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Official nuclear/radiological safety and geopolitical event source candidate.'),
('wmo_global_weather','WMO World Meteorological Organization','World Meteorological Organization','MULTI_DOMAIN','HTML','NONE','https://wmo.int/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Official global meteorological, climate and early-warning source candidate.'),
('ocha_hdx_api','OCHA Humanitarian Data Exchange','United Nations OCHA','MULTI_DOMAIN','API','NONE','https://data.humdata.org/about/api',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Humanitarian data API and country/cluster data discovery; exact dataset rights remain dataset-specific.'),
('wfp_hungermap_live','WFP HungerMap LIVE','World Food Programme','MULTI_DOMAIN','HTML','NONE','https://hungermap.wfp.org/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Food security/acute hunger monitoring candidate; exact machine extraction and reuse contract pending.'),
('entsoe_transparency','ENTSO-E Transparency Platform','ENTSO-E','MACRO','API','NONE','https://transparency.entsoe.eu/','REVIEW_REQUIRED',false,true,false,false,'EUROPE','NEAR_REAL_TIME','European electricity system generation/load/interconnector data candidate.'),
('opec_data','OPEC Data','Organization of the Petroleum Exporting Countries','MACRO','HTML','NONE','https://www.opec.org/data.html','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Official oil production/market data and publications candidate.'),
('cloudflare_radar_outages','Cloudflare Radar Outages API','Cloudflare','MULTI_DOMAIN','API','API_TOKEN','https://developers.cloudflare.com/api/resources/radar/subresources/annotations/subresources/outages/','CC BY-NC 4.0','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Internet outage/anomaly API. Non-commercial licence means paid commercial reuse remains explicitly blocked pending permission.'),
('ripe_ris_routing','RIPE NCC Routing Information Service API','RIPE NCC','MULTI_DOMAIN','API','NONE','https://stat.ripe.net/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','BGP routing visibility and Internet infrastructure source candidate; exact reuse boundary remains gated.'),
('imo_maritime_safety_information','IMO Maritime Safety Information','International Maritime Organization','GEOPOLITICS','HTML','NONE','https://www.imo.org/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Maritime safety/navigation source candidate; machine interface and reuse remain certification-gated.'),
('ukmto_msi','UKMTO Maritime Security Information','UK Maritime Trade Operations','GEOPOLITICS','HTML','NONE','https://www.ukmto.org/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Operational maritime security information candidate.'),
('marad_msci','MARAD Maritime Security Communications','U.S. Maritime Administration','GEOPOLITICS','HTML','NONE','https://www.maritime.dot.gov/msci-advisories',null,'REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Official maritime security advisory source.'),
('iata_wis','IATA World Air Transport Statistics','International Air Transport Association','MACRO','HTML','NONE','https://www.iata.org/en/publications/economics/statistics/','PERMISSION_REQUIRED','PERMISSION_REQUIRED',false,true,false,false,'GLOBAL','Aviation traffic/economic dataset candidate; rights are not assumed for paid derived products.'),
('eurocontrol_nod','EUROCONTROL Network Operations Data','EUROCONTROL','MULTI_DOMAIN','HTML','NONE','https://www.eurocontrol.int/network-operations','REVIEW_REQUIRED',false,true,false,false,'EUROPE','NEAR_REAL_TIME','European aviation/network operations source candidate.'),
('copernicus_ems','Copernicus Emergency Management Service','European Commission','MULTI_DOMAIN','HTML','NONE','https://emergency.copernicus.eu/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Earth-observation emergency mapping/rapid mapping candidate; exact product licence is dataset-specific.'),
('noaa_swpc','NOAA Space Weather Prediction Center','NOAA','MULTI_DOMAIN','API','NONE','https://www.swpc.noaa.gov/','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','NEAR_REAL_TIME','Space-weather/solar-storm warning source candidate.'),
('usgs_volcanoes','USGS Volcano Hazards Program','USGS','MULTI_DOMAIN','HTML','NONE','https://www.usgs.gov/programs/VHP','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Volcanic activity and hazard source candidate.'),
('wmo_gts','WMO Global Telecommunication System','World Meteorological Organization','MULTI_DOMAIN','MIXED','NONE','https://wmo.int/activities/wmo-information-system','REVIEW_REQUIRED',false,true,false,false,'GLOBAL','Global observation/data-exchange infrastructure candidate; machine access contract remains gated.')
on conflict(source_id) do update set
 source_name=excluded.source_name,provider_name=excluded.provider_name,category=excluded.category,
 access_type=excluded.access_type,authentication_type=excluded.authentication_type,base_url=excluded.base_url,
 licence_name=excluded.licence_name,commercial_usage_status=excluded.commercial_usage_status,
 raw_redistribution_allowed=excluded.raw_redistribution_allowed,attribution_required=excluded.attribution_required,
 enabled_for_ingestion=false,enabled_for_commercial_signals=false,country_scope=excluded.country_scope,
 freshness_class=excluded.freshness_class,notes=excluded.notes,updated_at=now();

commit;
