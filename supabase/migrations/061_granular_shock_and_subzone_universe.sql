-- =============================================================================
-- Geomacro granular global shock + operational subzone source universe
--
-- Expands the 36-family headline taxonomy into operational shock conditions
-- and adds finer monitoring zones. All paths remain discovery/certification
-- candidates only. No source is enabled.
-- =============================================================================
begin;

create table if not exists public.live_operational_subzone_catalog (
  subzone_id text primary key,
  display_name text not null unique,
  parent_zone_id text not null,
  primary_source_id text not null references public.live_external_sources(source_id),
  secondary_source_id text not null references public.live_external_sources(source_id),
  fallback_source_id text not null references public.live_external_sources(source_id),
  status text not null default 'DISCOVERED'
    check(status in ('DISCOVERED','VERIFIED','REJECTED')),
  notes text not null default 'Operational subzone monitoring candidate; source endpoint/rights/freshness remain gated.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_operational_subzone_catalog
(subzone_id,display_name,parent_zone_id,primary_source_id,secondary_source_id,fallback_source_id)
values
('SAHEL','Sahel','WEST_AFRICA','ecowas_press_releases','au_press_releases','reliefweb_reports_api'),
('GULF_OF_GUINEA','Gulf of Guinea','WEST_AFRICA','ecowas_press_releases','imo_maritime_safety_information','afdb_press_releases'),
('AFRICAN_GREAT_LAKES','African Great Lakes','EAST_AFRICA_HORN','eac_press_releases','igad_news','unhcr_global_public_api'),
('MAGHREB','Maghreb','NORTH_AFRICA','arab_league_news','au_press_releases','un_security_council_docs_rss'),
('NILE_VALLEY','Nile Valley','NORTH_AFRICA','au_press_releases','un_security_council_docs_rss','gdelt_v2_events'),
('HORN_OF_AFRICA','Horn of Africa','EAST_AFRICA_HORN','igad_news','unhcr_global_public_api','ukmto_msi'),
('SOUTHERN_AFRICA_COMMODITIES','Southern Africa commodities','SOUTHERN_AFRICA','sadc_news','afdb_press_releases','usgs_mcs'),
('RED_SEA','Red Sea','MIDDLE_EAST','ukmto_msi','marad_msci','gdacs_global_events_api'),
('ARABIAN_PENINSULA_GULF','Arabian Peninsula & Gulf','MIDDLE_EAST','gcc_news','eia_api_v2','eia_api_v2'),
('LEVANT','Levant','MIDDLE_EAST','un_security_council_docs_rss','who_emro_rss','reliefweb_reports_api'),
('MESOPOTAMIA','Mesopotamia','MIDDLE_EAST','un_security_council_docs_rss','gdelt_v2_events','eia_api_v2'),
('EASTERN_MEDITERRANEAN','Eastern Mediterranean','SOUTHERN_EUROPE','un_security_council_docs_rss','emsa_maritime_safety','imo_maritime_safety_information'),
('BLACK_SEA','Black Sea','EASTERN_EUROPE','marad_msci','emsa_maritime_safety','un_security_council_docs_rss'),
('BALTIC_SEA','Baltic Sea','NORTHERN_EUROPE','nato_news','emsa_maritime_safety','ukmto_msi'),
('WESTERN_BALKANS','Western Balkans','BALKANS','osce_news','nato_news','eu_council_press_rss'),
('SOUTH_CAUCASUS','South Caucasus','CAUCASUS','traceca_intergovernmental','nato_news','un_security_council_docs_rss'),
('CENTRAL_EUROPE','Central Europe','WESTERN_EUROPE','eurostat_sdmx_api','eu_council_press_rss','ecb_press_rss'),
('NORDIC_ARCTIC_GATEWAY','Nordic Arctic gateway','NORTHERN_EUROPE','nato_news','arctic_council_news','oecd_sdmx_api'),
('IBERIAN_ATLANTIC','Iberian Atlantic','SOUTHERN_EUROPE','eurostat_sdmx_api','emsa_maritime_safety','nato_news'),
('BAY_OF_BENGAL','Bay of Bengal','SOUTH_ASIA','saarc_press_releases','imo_maritime_safety_information','gdacs_global_events_api'),
('HIMALAYAN_ARC','Himalayan arc','SOUTH_ASIA','saarc_press_releases','adb_data_library','gdacs_global_events_api'),
('INDO_GANGETIC_PLAIN','Indo-Gangetic plain','SOUTH_ASIA','world_bank_indicators','gdacs_global_events_api','noaa_ncei_cdo_api'),
('MEKONG','Mekong region','SOUTHEAST_ASIA','asean_news_portal','adb_data_library','gdacs_global_events_api'),
('MALACCA_MARITIME','Malacca maritime zone','SOUTHEAST_ASIA','recaap_reports','indonesia_dg_sea_transport','asean_news_portal'),
('MARITIME_SOUTHEAST_ASIA','Maritime Southeast Asia','SOUTHEAST_ASIA','recaap_reports','imo_maritime_safety_information','asean_news_portal'),
('TAIWAN_STRAIT','Taiwan Strait','EAST_ASIA','nato_news','imo_maritime_safety_information','gdelt_v2_events'),
('KOREAN_PENINSULA','Korean Peninsula','EAST_ASIA','un_security_council_docs_rss','nato_news','gdelt_v2_events'),
('EAST_CHINA_SEA','East China Sea','EAST_ASIA','imo_maritime_safety_information','nato_news','gdelt_v2_events'),
('ANDEAN','Andean region','SOUTH_AMERICA','oas_press_releases','idb_news','usgs_earthquake_hazards'),
('SOUTHERN_CONE','Southern Cone','SOUTH_AMERICA','oas_press_releases','idb_news','world_bank_indicators'),
('AMAZON_BASIN','Amazon Basin','SOUTH_AMERICA','idb_news','copernicus_ems','noaa_ncei_cdo_api'),
('CENTRAL_AMERICA_ISTHMUS','Central America isthmus','CENTRAL_AMERICA','oas_press_releases','idb_news','gdacs_global_events_api'),
('CARIBBEAN_ARC','Caribbean arc','CARIBBEAN','caricom_news','oas_press_releases','gdacs_global_events_api'),
('NORTH_ATLANTIC','North Atlantic','NORTH_AMERICA','emsa_maritime_safety','marad_msci','ukmto_msi'),
('ARCTIC','Arctic','ARCTIC_ANTARCTIC','arctic_council_news','noaa_swpc','noaa_ncei_cdo_api'),
('ANTARCTIC','Antarctic','ARCTIC_ANTARCTIC','antarctic_treaty_secretariat','noaa_ncei_cdo_api','copernicus_ems'),
('PACIFIC_ISLANDS','Pacific Islands','PACIFIC_ISLANDS','pacific_islands_forum_news','adb_data_library','gdacs_global_events_api'),
('AUSTRALASIA','Australasia','AUSTRALIA_NEW_ZEALAND','oecd_sdmx_api','amsa_marine_safety_information','oecd_sdmx_api'),
('TRANSATLANTIC','Transatlantic','NORTH_AMERICA','emsa_maritime_safety','marad_msci','icpc_submarine_cables')
on conflict(subzone_id) do update set
 display_name=excluded.display_name,
 parent_zone_id=excluded.parent_zone_id,
 primary_source_id=excluded.primary_source_id,
 secondary_source_id=excluded.secondary_source_id,
 fallback_source_id=excluded.fallback_source_id,
 updated_at=now();

create table if not exists public.live_operational_shock_catalog (
  shock_id text primary key,
  display_name text not null unique,
  module_id text not null references public.live_global_domain_catalog(module_id),
  detection_mode text not null check(detection_mode in ('CURRENT_EVENT','STRUCTURAL','HYBRID')),
  primary_source_id text not null references public.live_external_sources(source_id),
  secondary_source_id text not null references public.live_external_sources(source_id),
  fallback_source_id text not null references public.live_external_sources(source_id),
  required boolean not null default true,
  freshness_max_seconds integer not null default 172800 check(freshness_max_seconds > 0),
  status text not null default 'DISCOVERED'
    check(status in ('DISCOVERED','VERIFIED','REJECTED')),
  notes text not null default 'Granular shock candidate; no production scoring or payment eligibility is implied.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.live_operational_shock_catalog
(shock_id,display_name,module_id,detection_mode,primary_source_id,secondary_source_id,fallback_source_id)
values
('terrorism_mass_casualty','Mass-casualty terrorism','geopolitical_security','CURRENT_EVENT','gdelt_v2_events','un_security_council_docs_rss','ucdp_candidate'),
('insurgency_offensive','Insurgency offensive','geopolitical_security','HYBRID','ucdp_candidate','gdelt_v2_events','reliefweb_reports_api'),
('political_assassination','Political assassination','political_governance','CURRENT_EVENT','gdelt_v2_events','un_security_council_docs_rss','reliefweb_reports_api'),
('hostage_kidnapping','Hostage or mass-kidnapping shock','geopolitical_security','CURRENT_EVENT','gdelt_v2_events','reliefweb_reports_api','un_security_council_docs_rss'),
('border_incursion','Border incursion','geopolitical_security','CURRENT_EVENT','gdelt_v2_events','ucdp_candidate','un_security_council_docs_rss'),
('territorial_dispute_escalation','Territorial-dispute escalation','geopolitical_security','HYBRID','un_security_council_docs_rss','gdelt_v2_events','ucdp_candidate'),
('martial_law_emergency','Martial-law or state-of-emergency shock','political_governance','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss','reliefweb_reports_api'),
('constitutional_crisis','Constitutional crisis','political_governance','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss','osce_news'),
('election_violence','Election violence','political_governance','CURRENT_EVENT','gdelt_v2_events','osce_news','reliefweb_reports_api'),
('government_shutdown','Government shutdown / administrative interruption','political_governance','HYBRID','gdelt_v2_events','world_bank_indicators','un_all_documents_rss'),
('trade_embargo_new','New trade embargo','geoeconomic_trade','HYBRID','wto_trade_monitoring','un_security_council_docs_rss','un_comtrade_api'),
('export_quota_restriction','Export quota restriction','geoeconomic_trade','HYBRID','wto_trade_monitoring','un_comtrade_api','gdelt_v2_events'),
('import_license_shock','Import licensing shock','regulatory_legal','HYBRID','wto_trade_monitoring','un_all_documents_rss','gdelt_v2_events'),
('customs_system_failure','Customs-system failure','supply_chain_logistics','CURRENT_EVENT','wto_trade_monitoring','gdelt_v2_events','eac_press_releases'),
('port_closure','Port closure','supply_chain_logistics','CURRENT_EVENT','imo_maritime_safety_information','ukmto_msi','gdelt_v2_events'),
('port_congestion_extreme','Extreme port congestion','supply_chain_logistics','CURRENT_EVENT','gdelt_v2_events','imo_maritime_safety_information','un_comtrade_api'),
('canal_closure','Canal closure or transit suspension','supply_chain_logistics','CURRENT_EVENT','suez_canal_navigation','panama_canal_notices_to_shipping','marad_msci'),
('strait_restriction','Strategic strait transit restriction','supply_chain_logistics','CURRENT_EVENT','ukmto_msi','marad_msci','recaap_reports'),
('piracy_spike','Piracy / sea robbery spike','geopolitical_security','CURRENT_EVENT','recaap_reports','ukmto_msi','imo_maritime_safety_information'),
('maritime_mine_hazard','Maritime mine or explosive hazard','geopolitical_security','CURRENT_EVENT','ukmto_msi','marad_msci','imo_maritime_safety_information'),
('airspace_closure','Airspace closure','supply_chain_logistics','CURRENT_EVENT','eurocontrol_nod','gdelt_v2_events','imo_maritime_safety_information'),
('aviation_network_disruption','Aviation network disruption','supply_chain_logistics','CURRENT_EVENT','eurocontrol_nod','gdelt_v2_events','oecd_sdmx_api'),
('rail_corridor_disruption','Rail corridor disruption','supply_chain_logistics','CURRENT_EVENT','traceca_intergovernmental','carec_program_transport','gdelt_v2_events'),
('road_corridor_closure','Road corridor closure','supply_chain_logistics','CURRENT_EVENT','eac_press_releases','sadc_news','gdelt_v2_events'),
('bridge_or_tunnel_failure','Bridge or tunnel failure','infrastructure_cyber_technology','CURRENT_EVENT','gdacs_global_events_api','gdelt_v2_events','reliefweb_reports_api'),
('pipeline_outage','Pipeline outage','energy_commodities','CURRENT_EVENT','eia_api_v2','gdelt_v2_events','opec_data'),
('refinery_shutdown','Refinery shutdown','energy_commodities','CURRENT_EVENT','eia_api_v2','jodi_oil_world_database','gdelt_v2_events'),
('lng_terminal_disruption','LNG terminal disruption','energy_commodities','CURRENT_EVENT','eia_api_v2','gdelt_v2_events','opec_data'),
('power_generation_failure','Power-generation failure','energy_commodities','CURRENT_EVENT','entsoe_transparency','eia_api_v2','gdelt_v2_events'),
('grid_blackout_national','National grid blackout','infrastructure_cyber_technology','CURRENT_EVENT','entsoe_transparency','gdelt_v2_events','gdacs_global_events_api'),
('dam_failure','Dam failure','climate_environment_hazard','CURRENT_EVENT','gdacs_global_events_api','reliefweb_reports_api','gdelt_v2_events'),
('industrial_explosion','Major industrial explosion','infrastructure_cyber_technology','CURRENT_EVENT','gdacs_global_events_api','reliefweb_reports_api','gdelt_v2_events'),
('nuclear_accident','Nuclear or radiological accident','geopolitical_security','CURRENT_EVENT','iaea_news_events','gdelt_v2_events','reliefweb_reports_api'),
('nuclear_facility_attack','Attack on nuclear facility','geopolitical_security','CURRENT_EVENT','iaea_news_events','un_security_council_docs_rss','gdelt_v2_events'),
('mine_disaster','Major mine disaster','energy_commodities','CURRENT_EVENT','usgs_mcs','gdelt_v2_events','reliefweb_reports_api'),
('factory_shutdown','Strategic factory shutdown','supply_chain_logistics','CURRENT_EVENT','gdelt_v2_events','wto_trade_monitoring','un_comtrade_api'),
('semiconductor_fab_disruption','Semiconductor fabrication disruption','infrastructure_cyber_technology','HYBRID','wto_trade_monitoring','gdelt_v2_events','cisa_kev_catalog'),
('cloud_datacenter_outage','Cloud or data-center outage','infrastructure_cyber_technology','CURRENT_EVENT','cloudflare_radar_outages','gdelt_v2_events','ripe_ris_routing'),
('satellite_service_disruption','Satellite service disruption','infrastructure_cyber_technology','CURRENT_EVENT','gdelt_v2_events','noaa_swpc','reliefweb_reports_api'),
('space_weather_storm','Severe space-weather storm','infrastructure_cyber_technology','CURRENT_EVENT','noaa_swpc','gdelt_v2_events','wmo_global_weather'),
('subsea_cable_cut','Subsea cable cut','infrastructure_cyber_technology','CURRENT_EVENT','icpc_submarine_cables','gdelt_v2_events','itu_telecom_infrastructure'),
('gnss_interference','GNSS interference','infrastructure_cyber_technology','CURRENT_EVENT','gdelt_v2_events','noaa_swpc','itu_telecom_infrastructure'),
('internet_shutdown_national','National internet shutdown','infrastructure_cyber_technology','CURRENT_EVENT','cloudflare_radar_outages','gdelt_v2_events','ripe_ris_routing'),
('bgp_route_leak','Major BGP route leak','infrastructure_cyber_technology','CURRENT_EVENT','ripe_ris_routing','cloudflare_radar_outages','gdelt_v2_events'),
('ransomware_systemic','Systemic ransomware campaign','infrastructure_cyber_technology','CURRENT_EVENT','cisa_kev_catalog','gdelt_v2_events','cloudflare_radar_outages'),
('ddos_systemic','Systemic DDoS attack','infrastructure_cyber_technology','CURRENT_EVENT','cisa_kev_catalog','cloudflare_radar_outages','gdelt_v2_events'),
('data_breach_critical_infrastructure','Critical-infrastructure data breach','infrastructure_cyber_technology','CURRENT_EVENT','cisa_kev_catalog','gdelt_v2_events','itu_telecom_infrastructure'),
('bank_run','Bank run','banking_financial_system','CURRENT_EVENT','bis_rss_media_releases','gdelt_v2_events','bis_payment_systems_data'),
('bank_resolution','Bank resolution or forced closure','banking_financial_system','CURRENT_EVENT','bis_rss_media_releases','gdelt_v2_events','world_bank_indicators'),
('liquidity_freeze','Systemic liquidity freeze','banking_financial_system','HYBRID','bis_payment_systems_data','bis_rss_media_releases','gdelt_v2_events'),
('sovereign_downgrade','Sovereign credit downgrade','sovereign_fiscal','CURRENT_EVENT','gdelt_v2_events','world_bank_qpsd','bis_rss_media_releases'),
('sovereign_restructuring','Sovereign debt restructuring','sovereign_fiscal','HYBRID','world_bank_qpsd','gdelt_v2_events','imf_data_api'),
('sovereign_default','Sovereign default','sovereign_fiscal','HYBRID','world_bank_qpsd','gdelt_v2_events','imf_data_api'),
('corporate_debt_contagion','Corporate-debt contagion','banking_financial_system','HYBRID','bis_rss_media_releases','world_bank_indicators','gdelt_v2_events'),
('private_credit_stress','Private-credit stress','banking_financial_system','CURRENT_EVENT','bis_rss_media_releases','gdelt_v2_events','world_bank_indicators'),
('currency_devaluation','Currency devaluation','currency_capital_mobility','HYBRID','imf_data_api','world_bank_indicators','monetary_us'),
('hyperinflation_acceleration','Hyperinflation acceleration','macro_monetary','HYBRID','world_bank_indicators','imf_data_api','monetary_us'),
('reserve_depletion','Foreign-reserve depletion','currency_capital_mobility','HYBRID','imf_data_api','world_bank_indicators','bis_rss_media_releases'),
('capital_controls_new','New capital controls','currency_capital_mobility','HYBRID','imf_data_api','world_bank_indicators','wto_trade_monitoring'),
('fx_convertibility_restriction','FX convertibility restriction','currency_capital_mobility','HYBRID','imf_data_api','gdelt_v2_events','monetary_us'),
('tax_shock','Material tax shock','regulatory_legal','CURRENT_EVENT','wto_trade_monitoring','world_bank_indicators','gdelt_v2_events'),
('subsidy_removal_shock','Major subsidy removal','regulatory_legal','CURRENT_EVENT','world_bank_indicators','gdelt_v2_events','wto_trade_monitoring'),
('price_control_shock','Price-control intervention shock','regulatory_legal','CURRENT_EVENT','world_bank_indicators','gdelt_v2_events','wto_trade_monitoring'),
('fdI_screening_new','New FDI screening restriction','regulatory_legal','HYBRID','wto_trade_monitoring','oecd_sdmx_api','gdelt_v2_events'),
('nationalization_asset','Nationalization / expropriation','regulatory_legal','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss','wto_trade_monitoring'),
('insurance_withdrawal','Insurance market withdrawal','emerging_long_tail','CURRENT_EVENT','gdelt_v2_events','reliefweb_reports_api','marad_msci'),
('war_risk_repricing','War-risk premium repricing','emerging_long_tail','CURRENT_EVENT','marad_msci','gdelt_v2_events','ukmto_msi'),
('payment_rail_outage','Payment-rail outage','payments_treasury','CURRENT_EVENT','bis_payment_systems_data','bis_rss_media_releases','gdelt_v2_events'),
('correspondent_banking_disruption','Correspondent-banking disruption','payments_treasury','HYBRID','bis_payment_systems_data','gdelt_v2_events','ofac_sanctions_program'),
('swift_network_event','Major SWIFT/network event','payments_treasury','CURRENT_EVENT','bis_rss_media_releases','gdelt_v2_events','bis_payment_systems_data'),
('food_export_ban','Food export ban','energy_commodities','CURRENT_EVENT','wto_trade_monitoring','faostat_api','gdelt_v2_events'),
('fertilizer_supply_shock','Fertilizer supply shock','energy_commodities','HYBRID','faostat_api','wto_trade_monitoring','gdelt_v2_events'),
('crop_disease_outbreak','Crop-disease outbreak','energy_commodities','CURRENT_EVENT','faostat_api','gdelt_v2_events','reliefweb_reports_api'),
('livestock_disease_outbreak','Livestock disease outbreak','societal_labor_health','CURRENT_EVENT','woah_wahis','gdelt_v2_events','reliefweb_reports_api'),
('locust_surge','Desert-locust surge','climate_environment_hazard','HYBRID','fao_desert_locust_watch','gdacs_global_events_api','noaa_ncei_cdo_api'),
('food_insecurity_spike','Food-insecurity spike','societal_labor_health','HYBRID','wfp_hungermap_live','reliefweb_reports_api','faostat_api'),
('famine_declaration','Famine / IPC-scale emergency','societal_labor_health','CURRENT_EVENT','wfp_hungermap_live','reliefweb_reports_api','unhcr_global_public_api'),
('public_health_outbreak','Public-health outbreak','societal_labor_health','HYBRID','who_gho_odata','reliefweb_reports_api','who_emro_rss'),
('pandemic_alert','Pandemic alert','societal_labor_health','CURRENT_EVENT','who_gho_odata','reliefweb_reports_api','gdelt_v2_events'),
('health_supply_shortage','Critical health-supply shortage','societal_labor_health','CURRENT_EVENT','who_gho_odata','reliefweb_reports_api','gdelt_v2_events'),
('mass_displacement','Mass displacement event','societal_labor_health','HYBRID','unhcr_global_public_api','reliefweb_reports_api','iom_dtm_api'),
('return_migration_surge','Return-migration surge','societal_labor_health','CURRENT_EVENT','iom_dtm_api','unhcr_global_public_api','reliefweb_reports_api'),
('large_strike','Major nationwide strike','societal_labor_health','CURRENT_EVENT','gdelt_v2_events','ilostat_sdmx_api','reliefweb_reports_api'),
('port_worker_strike','Port worker strike','supply_chain_logistics','CURRENT_EVENT','gdelt_v2_events','ilostat_sdmx_api','imo_maritime_safety_information'),
('earthquake_major','Major earthquake','climate_environment_hazard','CURRENT_EVENT','usgs_earthquake_hazards','gdacs_global_events_api','copernicus_ems'),
('volcanic_eruption','Major volcanic eruption','climate_environment_hazard','CURRENT_EVENT','usgs_volcanoes','gdacs_global_events_api','copernicus_ems'),
('tsunami_alert','Tsunami alert','climate_environment_hazard','CURRENT_EVENT','gdacs_global_events_api','copernicus_ems','noaa_ncei_cdo_api'),
('cyclone_landfall','Major cyclone / hurricane landfall','climate_environment_hazard','CURRENT_EVENT','gdacs_global_events_api','noaa_ncei_cdo_api','copernicus_ems'),
('wildfire_extreme','Extreme wildfire','climate_environment_hazard','HYBRID','nasa_firms_modis_nrt','copernicus_ems','noaa_ncei_cdo_api'),
('flood_extreme','Extreme flood','climate_environment_hazard','HYBRID','gdacs_global_events_api','copernicus_ems','noaa_ncei_cdo_api'),
('drought_extreme','Extreme drought','climate_environment_hazard','HYBRID','noaa_ncei_cdo_api','gdacs_global_events_api','wfp_hungermap_live'),
('heatwave_extreme','Extreme heatwave','climate_environment_hazard','HYBRID','noaa_ncei_cdo_api','gdacs_global_events_api','wmo_global_weather'),
('water_shortage_city','Critical municipal water shortage','climate_environment_hazard','CURRENT_EVENT','gdacs_global_events_api','wmo_global_weather','gdelt_v2_events'),
('landslide_major','Major landslide','climate_environment_hazard','CURRENT_EVENT','gdacs_global_events_api','copernicus_ems','noaa_ncei_cdo_api'),
('insurance_capacity_crunch','Insurance capacity crunch','emerging_long_tail','CURRENT_EVENT','gdelt_v2_events','marad_msci','reliefweb_reports_api'),
('strategic_stockpile_release','Strategic stockpile release','energy_commodities','CURRENT_EVENT','usgs_mcs','eia_api_v2','wto_trade_monitoring'),
('critical_mineral_export_stop','Critical-mineral export stoppage','energy_commodities','HYBRID','usgs_mcs','wto_trade_monitoring','unctad_critical_minerals_data'),
('rare_earth_magnet_shortage','Rare-earth magnet shortage','energy_commodities','HYBRID','usgs_mcs','gdelt_v2_events','wto_trade_monitoring'),
('lithium_supply_disruption','Lithium supply disruption','energy_commodities','HYBRID','usgs_mcs','un_comtrade_api','gdelt_v2_events'),
('cobalt_supply_disruption','Cobalt supply disruption','energy_commodities','HYBRID','usgs_mcs','un_comtrade_api','gdelt_v2_events'),
('nickel_supply_disruption','Nickel supply disruption','energy_commodities','HYBRID','usgs_mcs','un_comtrade_api','gdelt_v2_events'),
('copper_supply_disruption','Copper supply disruption','energy_commodities','HYBRID','usgs_mcs','un_comtrade_api','gdelt_v2_events'),
('uranium_supply_disruption','Uranium supply disruption','energy_commodities','HYBRID','gdelt_v2_events','wto_trade_monitoring','un_comtrade_api'),
('semiconductor_export_ban','Semiconductor export ban','infrastructure_cyber_technology','HYBRID','wto_trade_monitoring','gdelt_v2_events','cisa_kev_catalog'),
('ai_compute_supply_shock','AI compute / cloud capacity shock','infrastructure_cyber_technology','CURRENT_EVENT','cloudflare_radar_outages','gdelt_v2_events','ripe_ris_routing'),
('regulatory_data_localization','Data-localization / digital-trade rule shock','regulatory_legal','CURRENT_EVENT','wto_trade_monitoring','itu_telecom_infrastructure','gdelt_v2_events'),
('disinformation_mass_influence','Mass information-influence event','information_influence','CURRENT_EVENT','gdelt_v2_events','un_all_documents_rss','osce_news'),
('internet_filtering_event','Large-scale Internet filtering event','information_influence','CURRENT_EVENT','cloudflare_radar_outages','ripe_ris_routing','gdelt_v2_events'),
('satellite_navigation_outage','Satellite-navigation outage','infrastructure_cyber_technology','CURRENT_EVENT','gdelt_v2_events','noaa_swpc','reliefweb_reports_api'),
('space_infrastructure_attack','Space-infrastructure attack','infrastructure_cyber_technology','CURRENT_EVENT','gdelt_v2_events','noaa_swpc','un_security_council_docs_rss'),
('commodity_price_spike','Strategic commodity price spike','energy_commodities','HYBRID','opec_data','jodi_oil_world_database','world_bank_indicators')
on conflict(shock_id) do update set
 display_name=excluded.display_name,
 module_id=excluded.module_id,
 detection_mode=excluded.detection_mode,
 primary_source_id=excluded.primary_source_id,
 secondary_source_id=excluded.secondary_source_id,
 fallback_source_id=excluded.fallback_source_id,
 freshness_max_seconds=excluded.freshness_max_seconds,
 updated_at=now();

create table if not exists public.live_operational_shock_source_paths (
  shock_id text not null references public.live_operational_shock_catalog(shock_id) on delete cascade,
  source_role text not null check(source_role in ('PRIMARY','SECONDARY','FALLBACK')),
  source_id text not null references public.live_external_sources(source_id),
  certification_state text not null default 'QUEUED'
    check(certification_state in ('QUEUED','CERTIFIED','REJECTED')),
  endpoint_check text not null default 'PENDING',
  rights_check text not null default 'PENDING',
  schema_check text not null default 'PENDING',
  freshness_check text not null default 'PENDING',
  created_at timestamptz not null default now(),
  primary key(shock_id,source_role)
);

insert into public.live_operational_shock_source_paths(shock_id,source_role,source_id)
select shock_id,'PRIMARY',primary_source_id from public.live_operational_shock_catalog
union all
select shock_id,'SECONDARY',secondary_source_id from public.live_operational_shock_catalog
union all
select shock_id,'FALLBACK',fallback_source_id from public.live_operational_shock_catalog
on conflict(shock_id,source_role) do update set source_id=excluded.source_id;

create table if not exists public.live_operational_subzone_source_paths (
  subzone_id text not null references public.live_operational_subzone_catalog(subzone_id) on delete cascade,
  source_role text not null check(source_role in ('PRIMARY','SECONDARY','FALLBACK')),
  source_id text not null references public.live_external_sources(source_id),
  certification_state text not null default 'QUEUED',
  endpoint_check text not null default 'PENDING',
  rights_check text not null default 'PENDING',
  schema_check text not null default 'PENDING',
  freshness_check text not null default 'PENDING',
  created_at timestamptz not null default now(),
  primary key(subzone_id,source_role)
);

insert into public.live_operational_subzone_source_paths(subzone_id,source_role,source_id)
select subzone_id,'PRIMARY',primary_source_id from public.live_operational_subzone_catalog
union all
select subzone_id,'SECONDARY',secondary_source_id from public.live_operational_subzone_catalog
union all
select subzone_id,'FALLBACK',fallback_source_id from public.live_operational_subzone_catalog
on conflict(subzone_id,source_role) do update set source_id=excluded.source_id;

create or replace view public.live_granular_source_universe_status
with(security_invoker=true)
as
select
 (select count(*) from public.live_operational_subzone_catalog)::bigint subzone_count,
 (select count(*) from public.live_operational_subzone_source_paths)::bigint subzone_source_path_count,
 (select count(*) from public.live_operational_shock_catalog where required)::bigint granular_shock_count,
 (select count(*) from public.live_operational_shock_source_paths)::bigint granular_shock_source_path_count,
 (select count(*) from public.live_operational_shock_catalog where required and status='DISCOVERED')::bigint granular_shocks_pending_certification,
 (select count(*) from public.live_operational_subzone_catalog where status='DISCOVERED')::bigint subzones_pending_certification,
 false certification_gate_open;

alter table public.live_operational_subzone_catalog enable row level security;
revoke all on public.live_operational_subzone_catalog from public,anon,authenticated;
grant select on public.live_operational_subzone_catalog to service_role;

alter table public.live_operational_shock_catalog enable row level security;
revoke all on public.live_operational_shock_catalog from public,anon,authenticated;
grant select on public.live_operational_shock_catalog to service_role;

alter table public.live_operational_shock_source_paths enable row level security;
revoke all on public.live_operational_shock_source_paths from public,anon,authenticated;
grant select on public.live_operational_shock_source_paths to service_role;

alter table public.live_operational_subzone_source_paths enable row level security;
revoke all on public.live_operational_subzone_source_paths from public,anon,authenticated;
grant select on public.live_operational_subzone_source_paths to service_role;

commit;
