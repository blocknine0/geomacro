begin;

-- Global source-universe governance: three parallel coverage dimensions.
-- Registry/coverage only. No source is enabled by this migration.
create table if not exists public.live_global_country_coverage (
  iso3 text primary key,
  country_name text not null,
  scope_type text not null default 'COUNTRY',
  required boolean not null default true,
  min_independent_sources integer not null default 2,
  status text not null default 'UNMAPPED',
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.live_global_corridor_coverage (
  corridor_id text primary key,
  corridor_name text not null,
  dependency_domains text not null,
  required boolean not null default true,
  min_independent_sources integer not null default 2,
  status text not null default 'UNMAPPED',
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.live_global_shock_taxonomy (
  shock_id text primary key,
  shock_name text not null,
  required boolean not null default true,
  min_independent_sources integer not null default 2,
  status text not null default 'UNMAPPED',
  notes text,
  updated_at timestamptz not null default now()
);

-- ISO 3166-1 alpha-3 universe is populated by the source-governance seed.
-- This block is intentionally explicit so missing-country coverage is queryable.
insert into public.live_global_country_coverage (iso3,country_name,scope_type) values
('AFG','Afghanistan','COUNTRY'),('ALA','Åland Islands','COUNTRY'),('ALB','Albania','COUNTRY'),('DZA','Algeria','COUNTRY'),('ASM','American Samoa','COUNTRY'),('AND','Andorra','COUNTRY'),('AGO','Angola','COUNTRY'),('AIA','Anguilla','COUNTRY'),('ATA','Antarctica','COUNTRY'),('ATG','Antigua and Barbuda','COUNTRY'),('ARG','Argentina','COUNTRY'),('ARM','Armenia','COUNTRY'),('ABW','Aruba','COUNTRY'),('AUS','Australia','COUNTRY'),('AUT','Austria','COUNTRY'),('AZE','Azerbaijan','COUNTRY'),('BHS','Bahamas','COUNTRY'),('BHR','Bahrain','COUNTRY'),('BGD','Bangladesh','COUNTRY'),('BRB','Barbados','COUNTRY'),('BLR','Belarus','COUNTRY'),('BEL','Belgium','COUNTRY'),('BLZ','Belize','COUNTRY'),('BEN','Benin','COUNTRY'),('BMU','Bermuda','COUNTRY'),('BTN','Bhutan','COUNTRY'),('BOL','Bolivia, Plurinational State of','COUNTRY'),('BES','Bonaire, Sint Eustatius and Saba','COUNTRY'),('BIH','Bosnia and Herzegovina','COUNTRY'),('BWA','Botswana','COUNTRY'),('BVT','Bouvet Island','COUNTRY'),('BRA','Brazil','COUNTRY'),('IOT','British Indian Ocean Territory','COUNTRY'),('BRN','Brunei Darussalam','COUNTRY'),('BGR','Bulgaria','COUNTRY'),('BFA','Burkina Faso','COUNTRY'),('BDI','Burundi','COUNTRY'),('CPV','Cabo Verde','COUNTRY'),('KHM','Cambodia','COUNTRY'),('CMR','Cameroon','COUNTRY'),('CAN','Canada','COUNTRY'),('CYM','Cayman Islands','COUNTRY'),('CAF','Central African Republic','COUNTRY'),('TCD','Chad','COUNTRY'),('CHL','Chile','COUNTRY'),('CHN','China','COUNTRY'),('CXR','Christmas Island','COUNTRY'),('CCK','Cocos (Keeling) Islands','COUNTRY'),('COL','Colombia','COUNTRY'),('COM','Comoros','COUNTRY'),('COG','Congo','COUNTRY'),('COD','Congo, Democratic Republic of the','COUNTRY'),('COK','Cook Islands','COUNTRY'),('CRI','Costa Rica','COUNTRY'),('CIV',"Côte d'Ivoire",'COUNTRY'),('HRV','Croatia','COUNTRY'),('CUB','Cuba','COUNTRY'),('CUW','Curaçao','COUNTRY'),('CYP','Cyprus','COUNTRY'),('CZE','Czechia','COUNTRY'),('DNK','Denmark','COUNTRY'),('DJI','Djibouti','COUNTRY'),('DMA','Dominica','COUNTRY'),('DOM','Dominican Republic','COUNTRY'),('ECU','Ecuador','COUNTRY'),('EGY','Egypt','COUNTRY'),('SLV','El Salvador','COUNTRY'),('GNQ','Equatorial Guinea','COUNTRY'),('ERI','Eritrea','COUNTRY'),('EST','Estonia','COUNTRY'),('SWZ','Eswatini','COUNTRY'),('ETH','Ethiopia','COUNTRY'),('FLK','Falkland Islands (Malvinas)','COUNTRY'),('FRO','Faroe Islands','COUNTRY'),('FJI','Fiji','COUNTRY'),('FIN','Finland','COUNTRY'),('FRA','France','COUNTRY'),('GUF','French Guiana','COUNTRY'),('PYF','French Polynesia','COUNTRY'),('ATF','French Southern Territories','COUNTRY'),('GAB','Gabon','COUNTRY'),('GMB','Gambia','COUNTRY'),('GEO','Georgia','COUNTRY'),('DEU','Germany','COUNTRY'),('GHA','Ghana','COUNTRY'),('GIB','Gibraltar','COUNTRY'),('GRC','Greece','COUNTRY'),('GRL','Greenland','COUNTRY'),('GRD','Grenada','COUNTRY'),('GLP','Guadeloupe','COUNTRY'),('GUM','Guam','COUNTRY'),('GTM','Guatemala','COUNTRY'),('GGY','Guernsey','COUNTRY'),('GIN','Guinea','COUNTRY'),('GNB','Guinea-Bissau','COUNTRY'),('GUY','Guyana','COUNTRY'),('HTI','Haiti','COUNTRY'),('HMD','Heard Island and McDonald Islands','COUNTRY'),('VAT','Holy See','COUNTRY'),('HND','Honduras','COUNTRY'),('HKG','Hong Kong','COUNTRY'),('HUN','Hungary','COUNTRY'),('ISL','Iceland','COUNTRY'),('IND','India','COUNTRY'),('IDN','Indonesia','COUNTRY'),('IRN','Iran, Islamic Republic of','COUNTRY'),('IRQ','Iraq','COUNTRY'),('IRL','Ireland','COUNTRY'),('IMN','Isle of Man','COUNTRY'),('ISR','Israel','COUNTRY'),('ITA','Italy','COUNTRY'),('JAM','Jamaica','COUNTRY'),('JPN','Japan','COUNTRY'),('JEY','Jersey','COUNTRY'),('JOR','Jordan','COUNTRY'),('KAZ','Kazakhstan','COUNTRY'),('KEN','Kenya','COUNTRY'),('KIR','Kiribati','COUNTRY'),('PRK',"Korea, Democratic People's Republic of",'COUNTRY'),('KOR','Korea, Republic of','COUNTRY'),('KWT','Kuwait','COUNTRY'),('KGZ','Kyrgyzstan','COUNTRY'),('LAO',"Lao People's Democratic Republic",'COUNTRY'),('LVA','Latvia','COUNTRY'),('LBN','Lebanon','COUNTRY'),('LSO','Lesotho','COUNTRY'),('LBR','Liberia','COUNTRY'),('LBY','Libya','COUNTRY'),('LIE','Liechtenstein','COUNTRY'),('LTU','Lithuania','COUNTRY'),('LUX','Luxembourg','COUNTRY'),('MAC','Macao','COUNTRY'),('MDG','Madagascar','COUNTRY'),('MWI','Malawi','COUNTRY'),('MYS','Malaysia','COUNTRY'),('MDV','Maldives','COUNTRY'),('MLI','Mali','COUNTRY'),('MLT','Malta','COUNTRY'),('MHL','Marshall Islands','COUNTRY'),('MTQ','Martinique','COUNTRY'),('MRT','Mauritania','COUNTRY'),('MUS','Mauritius','COUNTRY'),('MYT','Mayotte','COUNTRY'),('MEX','Mexico','COUNTRY'),('FSM','Micronesia, Federated States of','COUNTRY'),('MDA','Moldova, Republic of','COUNTRY'),('MCO','Monaco','COUNTRY'),('MNG','Mongolia','COUNTRY'),('MNE','Montenegro','COUNTRY'),('MSR','Montserrat','COUNTRY'),('MAR','Morocco','COUNTRY'),('MOZ','Mozambique','COUNTRY'),('MMR','Myanmar','COUNTRY'),('NAM','Namibia','COUNTRY'),('NRU','Nauru','COUNTRY'),('NPL','Nepal','COUNTRY'),('NLD','Netherlands','COUNTRY'),('NCL','New Caledonia','COUNTRY'),('NZL','New Zealand','COUNTRY'),('NIC','Nicaragua','COUNTRY'),('NER','Niger','COUNTRY'),('NGA','Nigeria','COUNTRY'),('NIU','Niue','COUNTRY'),('NFK','Norfolk Island','COUNTRY'),('MKD','North Macedonia','COUNTRY'),('MNP','Northern Mariana Islands','COUNTRY'),('NOR','Norway','COUNTRY'),('OMN','Oman','COUNTRY'),('PAK','Pakistan','COUNTRY'),('PLW','Palau','COUNTRY'),('PSE','Palestine, State of','COUNTRY'),('PAN','Panama','COUNTRY'),('PNG','Papua New Guinea','COUNTRY'),('PRY','Paraguay','COUNTRY'),('PER','Peru','COUNTRY'),('PHL','Philippines','COUNTRY'),('PCN','Pitcairn','COUNTRY'),('POL','Poland','COUNTRY'),('PRT','Portugal','COUNTRY'),('PRI','Puerto Rico','COUNTRY'),('QAT','Qatar','COUNTRY'),('REU','Réunion','COUNTRY'),('ROU','Romania','COUNTRY'),('RUS','Russian Federation','COUNTRY'),('RWA','Rwanda','COUNTRY'),('BLM','Saint Barthélemy','COUNTRY'),('SHN','Saint Helena, Ascension and Tristan da Cunha','COUNTRY'),('KNA','Saint Kitts and Nevis','COUNTRY'),('LCA','Saint Lucia','COUNTRY'),('MAF','Saint Martin (French part)','COUNTRY'),('SPM','Saint Pierre and Miquelon','COUNTRY'),('VCT','Saint Vincent and the Grenadines','COUNTRY'),('WSM','Samoa','COUNTRY'),('SMR','San Marino','COUNTRY'),('STP','Sao Tome and Principe','COUNTRY'),('SAU','Saudi Arabia','COUNTRY'),('SEN','Senegal','COUNTRY'),('SRB','Serbia','COUNTRY'),('SYC','Seychelles','COUNTRY'),('SLE','Sierra Leone','COUNTRY'),('SGP','Singapore','COUNTRY'),('SXM','Sint Maarten (Dutch part)','COUNTRY'),('SVK','Slovakia','COUNTRY'),('SVN','Slovenia','COUNTRY'),('SLB','Solomon Islands','COUNTRY'),('SOM','Somalia','COUNTRY'),('ZAF','South Africa','COUNTRY'),('SGS','South Georgia and the South Sandwich Islands','COUNTRY'),('SSD','South Sudan','COUNTRY'),('ESP','Spain','COUNTRY'),('LKA','Sri Lanka','COUNTRY'),('SDN','Sudan','COUNTRY'),('SUR','Suriname','COUNTRY'),('SJM','Svalbard and Jan Mayen','COUNTRY'),('SWE','Sweden','COUNTRY'),('CHE','Switzerland','COUNTRY'),('SYR','Syrian Arab Republic','COUNTRY'),('TWN','Taiwan, Province of China','COUNTRY'),('TJK','Tajikistan','COUNTRY'),('TZA','Tanzania, United Republic of','COUNTRY'),('THA','Thailand','COUNTRY'),('TLS','Timor-Leste','COUNTRY'),('TGO','Togo','COUNTRY'),('TKL','Tokelau','COUNTRY'),('TON','Tonga','COUNTRY'),('TTO','Trinidad and Tobago','COUNTRY'),('TUN','Tunisia','COUNTRY'),('TUR','Türkiye','COUNTRY'),('TKM','Turkmenistan','COUNTRY'),('TCA','Turks and Caicos Islands','COUNTRY'),('TUV','Tuvalu','COUNTRY'),('UGA','Uganda','COUNTRY'),('UKR','Ukraine','COUNTRY'),('ARE','United Arab Emirates','COUNTRY'),('GBR','United Kingdom','COUNTRY'),('USA','United States','COUNTRY'),('UMI','United States Minor Outlying Islands','COUNTRY'),('URY','Uruguay','COUNTRY'),('UZB','Uzbekistan','COUNTRY'),('VUT','Vanuatu','COUNTRY'),('VEN','Venezuela, Bolivarian Republic of','COUNTRY'),('VNM','Viet Nam','COUNTRY'),('VGB','Virgin Islands, British','COUNTRY'),('VIR','Virgin Islands, U.S.','COUNTRY'),('WLF','Wallis and Futuna','COUNTRY'),('ESH','Western Sahara','COUNTRY'),('YEM','Yemen','COUNTRY'),('ZMB','Zambia','COUNTRY'),('ZWE','Zimbabwe','COUNTRY')
on conflict (iso3) do update set country_name=excluded.country_name, updated_at=now();

insert into public.live_global_corridor_coverage (corridor_id,corridor_name,dependency_domains) values
('EUR-NAM','Europe-North America','TRADE,FINANCE,AVIATION,DATA,STRATEGIC'),
('EUR-ASI','Europe-Asia','TRADE,ENERGY,RAIL,ROAD,DATA'),
('EUR-MENA','Europe-Middle East-North Africa','TRADE,ENERGY,MIGRATION,SHIPPING'),
('EUR-AFR','Europe-Africa','TRADE,ENERGY,MIGRATION,SHIPPING'),
('EUR-WAF','Europe-West Africa','TRADE,ENERGY,SHIPPING,MIGRATION'),
('EUR-EAF','Europe-East Africa','TRADE,SHIPPING,MIGRATION'),
('MED-BLK','Mediterranean-Black Sea','SHIPPING,ENERGY,FOOD,SECURITY'),
('MED-SUEZ','Mediterranean-Suez','SHIPPING,ENERGY,TRADE'),
('SUEZ-RED','Suez-Red Sea','SHIPPING,ENERGY,TRADE,SECURITY'),
('RED-IND','Red Sea-Indian Ocean','SHIPPING,ENERGY,TRADE'),
('GULF-ASI','Gulf-South Asia','ENERGY,SHIPPING,TRADE,MIGRATION'),
('GULF-EAS','Gulf-East Asia','ENERGY,SHIPPING,TRADE'),
('GULF-EUR','Gulf-Europe','ENERGY,SHIPPING,TRADE,FINANCE'),
('INDO-PAC','Indian Ocean-Western Pacific','SHIPPING,TRADE,ENERGY,SECURITY'),
('IND-SEA','India-Southeast Asia','TRADE,SHIPPING,ENERGY,DATA'),
('SEA-EAS','Southeast Asia-East Asia','TRADE,SHIPPING,SEMICONDUCTORS'),
('EAS-NAM','East Asia-North America','TRADE,SHIPPING,SEMICONDUCTORS,FINANCE'),
('EAS-EUR','East Asia-Europe','TRADE,RAIL,SHIPPING,ENERGY'),
('CHN-CAS','China-Central Asia','TRADE,RAIL,ENERGY,PIPELINES'),
('CAS-EUR','Central Asia-Europe','ENERGY,RAIL,TRADE'),
('CAS-SAS','Central Asia-South Asia','TRADE,ENERGY,ROAD,RAIL'),
('RUS-EUR','Russia-Europe','ENERGY,TRADE,SECURITY'),
('RUS-ASI','Russia-East Asia','ENERGY,TRADE,RAIL'),
('RUS-CAS','Russia-Central Asia','ENERGY,TRADE,RAIL'),
('RUS-ARC','Russia-Arctic','SHIPPING,ENERGY,MINERALS,SECURITY'),
('ARC-NAM','Arctic-North America','SHIPPING,ENERGY,MINERALS,SECURITY'),
('ARC-EUR','Arctic-Europe','SHIPPING,ENERGY,MINERALS'),
('PANAMA','Panama Canal','SHIPPING,TRADE,FOOD,ENERGY'),
('MALACCA','Strait of Malacca','SHIPPING,ENERGY,TRADE'),
('HORMUZ','Strait of Hormuz','ENERGY,SHIPPING,TRADE'),
('BAB-EL','Bab el-Mandeb','SHIPPING,ENERGY,TRADE,SECURITY'),
('BOSPORUS','Turkish Straits','SHIPPING,ENERGY,FOOD,SECURITY'),
('GIBRALTAR','Strait of Gibraltar','SHIPPING,TRADE,ENERGY'),
('TAIWAN','Taiwan Strait','SHIPPING,TRADE,SEMICONDUCTORS,SECURITY'),
('KOREA','Korean Peninsula','TRADE,ENERGY,SECURITY,SEMICONDUCTORS'),
('LAC-NAM','Latin America-North America','TRADE,ENERGY,MIGRATION,FOOD'),
('LAC-EAS','Latin America-East Asia','TRADE,SHIPPING,MINERALS,FOOD'),
('LAC-EUR','Latin America-Europe','TRADE,SHIPPING,FOOD,ENERGY'),
('AMZ','Amazon Basin','FOOD,CLIMATE,MINERALS,BIODIVERSITY'),
('AFR-ASI','Africa-Asia','TRADE,ENERGY,SHIPPING,MIGRATION'),
('AFR-LAC','Africa-Latin America','TRADE,SHIPPING,FOOD,MINERALS'),
('AFR-INTRA','Intra-Africa','TRADE,FOOD,ENERGY,MIGRATION'),
('SAHEL','Sahel Corridor','SECURITY,FOOD,MIGRATION,ENERGY'),
('HORN','Horn of Africa Corridor','SHIPPING,FOOD,MIGRATION,SECURITY'),
('NILE','Nile Basin','WATER,FOOD,ENERGY,SECURITY'),
('CONGO','Congo Basin','MINERALS,CLIMATE,FOOD,BIODIVERSITY'),
('SOUTHERN-AFR','Southern Africa','MINERALS,ENERGY,TRADE,FOOD'),
('CARIBBEAN','Caribbean','SHIPPING,ENERGY,FOOD,MIGRATION,CLIMATE'),
('PACIFIC-ISL','Pacific Islands','SHIPPING,FOOD,CLIMATE,MIGRATION'),
('NORTH-ATL','North Atlantic','SHIPPING,ENERGY,TRADE,CLIMATE'),
('SOUTH-ATL','South Atlantic','SHIPPING,FOOD,ENERGY,MINERALS'),
('SOUTH-PAC','South Pacific','SHIPPING,FOOD,MINERALS,CLIMATE')
on conflict (corridor_id) do update set corridor_name=excluded.corridor_name, dependency_domains=excluded.dependency_domains, updated_at=now();

insert into public.live_global_shock_taxonomy (shock_id,shock_name) values
('GEO_CONFLICT','Interstate armed conflict'),('CIVIL_WAR','Civil war and internal armed conflict'),('COUP','Coup and unconstitutional transfer of power'),('POLITICAL_INSTABILITY','Political instability and governance disruption'),('ELECTION','Election and electoral disruption'),('SANCTIONS','Sanctions and export-control shock'),('DIPLOMATIC_BREAK','Diplomatic rupture and interstate escalation'),('TERRORISM','Terrorism and mass-casualty attacks'),('INSURGENCY','Insurgency and armed non-state violence'),('CIVIL_UNREST','Civil unrest and protest escalation'),('BORDER_CLOSURE','Border closure and cross-border restriction'),('REFUGEE_SURGE','Refugee and displacement surge'),('NATURAL_DISASTER','Earthquake, tsunami and geological disaster'),('FLOOD','Flood and extreme precipitation'),('CYCLONE','Tropical cyclone and severe storm'),('DROUGHT','Drought and water stress'),('WILDFIRE','Wildfire and smoke event'),('EXTREME_HEAT','Extreme heat'),('EXTREME_COLD','Extreme cold and winter storm'),('VOLCANIC','Volcanic eruption'),('LANDSLIDE','Landslide and mass movement'),('CLIMATE_EXTREME','Climate-attribution-relevant extreme event'),('PANDEMIC','Pandemic and emerging infectious disease'),('EPIDEMIC','Epidemic and outbreak'),('HEALTH_SYSTEM','Health-system disruption'),('FOOD_SECURITY','Food security and food-price shock'),('CROP_FAILURE','Crop failure and agricultural production shock'),('LIVESTOCK','Livestock disease and production shock'),('FERTILIZER','Fertilizer supply shock'),('ENERGY_OIL','Crude oil supply/demand shock'),('ENERGY_GAS','Natural gas and LNG shock'),('POWER_GRID','Power-grid and electricity shock'),('NUCLEAR','Nuclear/radiological incident'),('COAL','Coal supply shock'),('CRITICAL_MINERALS','Critical-minerals supply shock'),('METALS','Industrial metals shock'),('SHIPPING','Maritime shipping disruption'),('PORT','Port closure and throughput disruption'),('CANAL','Canal/strait chokepoint disruption'),('AVIATION','Aviation disruption'),('RAIL','Rail corridor disruption'),('ROAD','Road/freight corridor disruption'),('SUPPLY_CHAIN','Global supply-chain disruption'),('SEMICONDUCTOR','Semiconductor supply shock'),('CYBER','Major cyber incident'),('INTERNET','Internet and communications outage'),('SATELLITE','Satellite/space infrastructure disruption'),('AI_TECH','AI/technology systemic shock'),('FINANCIAL','Financial-system stress'),('BANKING','Banking-system stress'),('SOVEREIGN_DEBT','Sovereign debt stress'),('CURRENCY','Currency and FX shock'),('INFLATION','Inflation shock'),('RATES','Interest-rate shock'),('COMMODITY','Broad commodity shock'),('TRADE_POLICY','Trade-policy and tariff shock'),('EXPORT_CONTROL','Export-control shock'),('WATER','Transboundary water shock'),('ENVIRONMENTAL','Major environmental contamination/ecological shock'),('SPACE_WEATHER','Space-weather disruption'),('GEOMAGNETIC','Geomagnetic storm'),('MIGRATION','Migration-system shock'),('HUMANITARIAN','Large-scale humanitarian emergency')
on conflict (shock_id) do update set shock_name=excluded.shock_name, updated_at=now();

create index if not exists idx_global_country_status on public.live_global_country_coverage(status);
create index if not exists idx_global_corridor_status on public.live_global_corridor_coverage(status);
create index if not exists idx_global_shock_status on public.live_global_shock_taxonomy(status);

commit;