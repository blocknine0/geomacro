/**
 * GeoMacro operator-supplied global/corridor directory (2026-11-02).
 * DIRECT source connectors, never OSINT routing or an authority to charge.
 * The existing registered-source D1 publisher consumes only the expressly
 * activated native RSS URLs below. Other sources remain visible with their
 * exact adapter/access blockers; a portal must not be scraped as a live feed.
 * Native publisher time, country attribution, independent verification and
 * commercial reuse rights are distinct downstream gates.
 */

import {readFileSync} from "node:fs";

export const DIRECT_GLOBAL_CORRIDOR_SOURCES=Object.freeze([
  {
    "id": "gdelt_v2_15m",
    "name": "GDELT 2.0 15-minute event batch",
    "url": "https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
    "format": "dataset",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "global"
    ],
    "state": "EXISTING_ADAPTER_UNVERIFIED"
  },
  {
    "id": "gdelt_cameo_codebook",
    "name": "GDELT/CAMEO Event Codebook",
    "url": "https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf",
    "format": "reference",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "global"
    ],
    "state": "REFERENCE_ONLY"
  },
  {
    "id": "reliefweb_v2",
    "name": "UN OCHA ReliefWeb V2 Reports",
    "url": "https://api.reliefweb.int/v2/reports",
    "format": "api",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "global"
    ],
    "state": "CREDENTIAL_REQUIRED"
  },
  {
    "id": "world_bank_wdi",
    "name": "World Bank World Development Indicators",
    "url": "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.KD.ZG?format=json",
    "format": "api",
    "categories": [
      "macro"
    ],
    "corridors": [
      "global"
    ],
    "state": "EXISTING_ADAPTER_UNVERIFIED"
  },
  {
    "id": "imf_data",
    "name": "IMF Data Portal",
    "url": "https://www.imf.org/en/Data",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "global"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "wto_tariffs",
    "name": "WTO Tariff and Trade Data",
    "url": "https://tariffdata.wto.org/",
    "format": "portal",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "global"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "adb_open_data",
    "name": "Asian Development Bank Open Data",
    "url": "https://data.adb.org/",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "apac"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "recaap_isc",
    "name": "ReCAAP ISC Ship Incident Alerts",
    "url": "https://www.recaap.org/",
    "format": "portal",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "malacca",
      "singapore-strait",
      "south-china-sea"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "boj_releases",
    "name": "Bank of Japan Releases",
    "url": "https://www.boj.or.jp/en/rss/whatsnew.xml",
    "format": "rss",
    "categories": [
      "macro"
    ],
    "corridors": [
      "apac"
    ],
    "state": "EXISTING_DIRECT_FEED"
  },
  {
    "id": "rbi_releases",
    "name": "Reserve Bank of India Press Releases",
    "url": "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "apac"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "asean_customs",
    "name": "ASEAN Customs — Official ASEAN Economic Community Portal",
    "url": "https://asean.org/our-communities/economic-community/asean-customs/",
    "format": "portal",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "apac"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "ukmto_incidents",
    "name": "UKMTO Recent Incidents",
    "url": "https://www.ukmto.org/recent-incidents",
    "format": "portal",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "hormuz",
      "bab-el-mandeb",
      "red-sea",
      "gulf-of-aden"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "ukmto_advisories",
    "name": "UKMTO Products and Advisories",
    "url": "https://www.ukmto.org/ukmto-products",
    "format": "portal",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "hormuz",
      "bab-el-mandeb",
      "red-sea"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "suez_navigation",
    "name": "Suez Canal Navigation Circulars",
    "url": "https://www.suezcanal.gov.eg/English/Navigation/NavigationCirculars/Pages/default.aspx",
    "format": "portal",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "suez"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "arab_monetary_fund",
    "name": "Arab Monetary Fund Data",
    "url": "https://www.amf.org.ae/en",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "mena"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "ecb_data",
    "name": "European Central Bank Data Portal",
    "url": "https://data.ecb.europa.eu/",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "europe"
    ],
    "state": "EXISTING_DIRECT_FEED"
  },
  {
    "id": "eurostat_data",
    "name": "Eurostat Statistical Database",
    "url": "https://ec.europa.eu/eurostat/web/main/data/database",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "europe"
    ],
    "state": "EXISTING_DIRECT_FEED"
  },
  {
    "id": "boe_news",
    "name": "Bank of England News RSS",
    "url": "https://www.bankofengland.co.uk/rss/news",
    "format": "rss",
    "categories": [
      "macro"
    ],
    "corridors": [
      "europe"
    ],
    "state": "POLL_DIRECT_FEED"
  },
  {
    "id": "snb_data",
    "name": "Swiss National Bank Data",
    "url": "https://www.snb.ch/en/",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "europe"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "panama_canal",
    "name": "Panama Canal Advisories to Shipping",
    "url": "https://pancanal.com/en/advisories-to-shipping/",
    "format": "portal",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "panama"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "eclac_cepal",
    "name": "UN ECLAC / CEPAL",
    "url": "https://www.cepal.org/en",
    "format": "portal",
    "categories": [
      "macro",
      "rare_earth"
    ],
    "corridors": [
      "latam"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "bcb_brazil",
    "name": "Banco Central do Brasil",
    "url": "https://www.bcb.gov.br/en",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "latam"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "afdb_documents",
    "name": "African Development Bank Documents",
    "url": "https://www.afdb.org/en/documents",
    "format": "portal",
    "categories": [
      "macro",
      "rare_earth"
    ],
    "corridors": [
      "africa"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "afcfta",
    "name": "AfCFTA Trade Hub",
    "url": "https://afcfta.au.int/",
    "format": "portal",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "africa"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "sarb",
    "name": "South African Reserve Bank",
    "url": "https://www.resbank.co.za/",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "africa"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "federal_reserve",
    "name": "Federal Reserve Releases RSS",
    "url": "https://www.federalreserve.gov/feeds/press_all.xml",
    "format": "rss",
    "categories": [
      "macro"
    ],
    "corridors": [
      "north-america"
    ],
    "state": "EXISTING_DIRECT_FEED"
  },
  {
    "id": "fred_api",
    "name": "FRED Economic Data API",
    "url": "https://api.stlouisfed.org/fred/series/observations",
    "format": "api",
    "categories": [
      "macro"
    ],
    "corridors": [
      "north-america",
      "global"
    ],
    "state": "CREDENTIAL_REQUIRED"
  },
  {
    "id": "bank_of_canada",
    "name": "Bank of Canada Press Releases",
    "url": "https://www.bankofcanada.ca/content_type/press-releases/feed/",
    "format": "rss",
    "categories": [
      "macro"
    ],
    "corridors": [
      "north-america"
    ],
    "state": "EXISTING_DIRECT_FEED"
  },
  {
    "id": "freightos_fbx",
    "name": "Freightos Baltic Index (FBX)",
    "url": "https://api.freightos.com/fd_external_apis/fbx/data/",
    "format": "api",
    "categories": [
      "macro"
    ],
    "corridors": [
      "global-shipping"
    ],
    "state": "CREDENTIAL_REQUIRED"
  },
  {
    "id": "nyfed_gscpi",
    "name": "New York Fed Global Supply Chain Pressure Index",
    "url": "https://www.newyorkfed.org/research/policy/gscpi",
    "format": "portal",
    "categories": [
      "macro"
    ],
    "corridors": [
      "global-shipping"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "imb_piracy",
    "name": "ICC IMB Piracy Reporting Centre",
    "url": "https://www.icc-ccs.org/piracy-reporting-centre",
    "format": "portal",
    "categories": [
      "geopolitics"
    ],
    "corridors": [
      "malacca",
      "gulf-of-guinea",
      "indian-ocean"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "usgs_mcs",
    "name": "USGS Mineral Commodity Summaries",
    "url": "https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries",
    "format": "dataset",
    "categories": [
      "rare_earth"
    ],
    "corridors": [
      "global"
    ],
    "state": "EXISTING_ADAPTER_UNVERIFIED"
  },
  {
    "id": "iea_minerals",
    "name": "IEA Critical Minerals Data Explorer",
    "url": "https://www.iea.org/data-and-statistics/data-tools/critical-minerals-data-explorer",
    "format": "portal",
    "categories": [
      "rare_earth"
    ],
    "corridors": [
      "global"
    ],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "rareearthexchanges_rss",
    "name": "Rare Earth Exchanges RSS",
    "url": "https://rareearthexchanges.com/feed/",
    "format": "rss",
    "categories": ["rare_earth"],
    "corridors": ["global"],
    "state": "EXISTING_ADAPTER_UNVERIFIED"
  },
  {
    "id": "mining_com_rare_earth",
    "name": "MINING.com Rare Earth Archive",
    "url": "https://www.mining.com/commodity/rare-earth/",
    "format": "portal",
    "categories": ["rare_earth"],
    "corridors": ["global"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "zmb_boz_public_notices",
    "name": "Bank of Zambia Public Notices",
    "url": "https://www.boz.zm/news/public-notices",
    "format": "portal",
    "categories": ["geopolitics"],
    "corridors": ["africa"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "fra_banque_france_news",
    "name": "Banque de France News",
    "url": "https://www.banque-france.fr/fr/actualites-et-evenements",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "ita_bancaditalia_news",
    "name": "Banca d'Italia News",
    "url": "https://www.bancaditalia.it/media/notizie/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "esp_bde_news",
    "name": "Banco de España News and Events",
    "url": "https://www.bde.es/wbe/es/noticias-eventos/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "nld_dnb_news",
    "name": "De Nederlandsche Bank News",
    "url": "https://www.dnb.nl/en/news/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "bel_nbb_news",
    "name": "National Bank of Belgium News",
    "url": "https://www.nbb.be/en/news",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "nor_norges_bank_news",
    "name": "Norges Bank News and Events",
    "url": "https://www.norges-bank.no/en/news-events/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "swe_riksbank_press",
    "name": "Sveriges Riksbank Press and Publications",
    "url": "https://www.riksbank.se/en-gb/press-and-published/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "pol_nbp_news",
    "name": "Narodowy Bank Polski",
    "url": "https://nbp.pl/en/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "tur_tcmb_announcements",
    "name": "Central Bank of the Republic of Türkiye Announcements",
    "url": "https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Announcements",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["europe"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "jpn_boj_home",
    "name": "Bank of Japan",
    "url": "https://www.boj.or.jp/en/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "kor_bok_home",
    "name": "Bank of Korea",
    "url": "https://www.bok.or.kr/eng/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "aus_rba_media_releases",
    "name": "Reserve Bank of Australia Media Releases",
    "url": "https://www.rba.gov.au/media-releases/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "sgp_mas_news",
    "name": "Monetary Authority of Singapore News",
    "url": "https://www.mas.gov.sg/news",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "idn_bi_home",
    "name": "Bank Indonesia",
    "url": "https://www.bi.go.id/en/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "mys_bnm_home",
    "name": "Bank Negara Malaysia",
    "url": "https://www.bnm.gov.my/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "phl_bsp_home",
    "name": "Bangko Sentral ng Pilipinas",
    "url": "https://www.bsp.gov.ph/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "tha_bot_home",
    "name": "Bank of Thailand",
    "url": "https://www.bot.or.th/en/home.html",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "vnm_sbv_home",
    "name": "State Bank of Vietnam",
    "url": "https://www.sbv.gov.vn/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "bgd_bangladesh_bank_home",
    "name": "Bangladesh Bank",
    "url": "https://www.bb.org.bd/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "pak_sbp_home",
    "name": "State Bank of Pakistan",
    "url": "https://www.sbp.org.pk/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "kaz_national_bank_home",
    "name": "National Bank of Kazakhstan",
    "url": "https://www.nationalbank.kz/en",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "mng_mongolbank_home",
    "name": "Bank of Mongolia",
    "url": "https://www.mongolbank.mn/en",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "mmr_central_bank_myanmar_home",
    "name": "Central Bank of Myanmar",
    "url": "https://www.cbm.gov.mm/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["apac"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "sau_sama_home",
    "name": "Saudi Central Bank",
    "url": "https://www.sama.gov.sa/en-us/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "are_central_bank_uae_home",
    "name": "Central Bank of the UAE",
    "url": "https://www.centralbank.ae/en",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "qat_qcb_home",
    "name": "Qatar Central Bank",
    "url": "https://www.qcb.gov.qa/en",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "omn_cbo_home",
    "name": "Central Bank of Oman",
    "url": "https://cbo.gov.om/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "egy_cbe_home",
    "name": "Central Bank of Egypt",
    "url": "https://www.cbe.org.eg/en",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "isr_boi_home",
    "name": "Bank of Israel",
    "url": "https://www.boi.org.il/en/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "irq_cbi_news",
    "name": "Central Bank of Iraq News",
    "url": "https://cbi.iq/news",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["mena"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "mex_banxico_home",
    "name": "Banco de México",
    "url": "https://www.banxico.org.mx/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["latam"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "arg_bcra_home",
    "name": "Banco Central de la República Argentina",
    "url": "https://www.bcra.gob.ar/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["latam"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "chl_bcentral_home",
    "name": "Central Bank of Chile",
    "url": "https://www.bcentral.cl/en",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["latam"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "per_bcrp_home",
    "name": "Central Reserve Bank of Peru",
    "url": "https://www.bcrp.gob.pe/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["latam"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "bol_bcb_home",
    "name": "Central Bank of Bolivia",
    "url": "https://www.bcb.gob.bo/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["latam"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "nga_cbn_home",
    "name": "Central Bank of Nigeria",
    "url": "https://www.cbn.gov.ng/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["africa"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "cod_bcc_home",
    "name": "Central Bank of the Congo",
    "url": "https://www.bcc.cd/",
    "format": "portal",
    "categories": ["macro"],
    "corridors": ["africa"],
    "state": "PORTAL_ENDPOINT_REQUIRED"
  },
  {
    "id": "mining_com",
    "name": "MINING.com RSS",
    "url": "https://www.mining.com/feed/",
    "format": "rss",
    "categories": [
      "rare_earth"
    ],
    "corridors": [
      "global"
    ],
    "state": "TRANSPORT_BLOCKED"
  },
  {
    "id": "cryptocompare_news",
    "name": "CryptoCompare / CCData News API",
    "url": "https://min-api.cryptocompare.com/data/v2/news/?lang=EN",
    "format": "api",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "digital-assets"
    ],
    "state": "CREDENTIAL_REQUIRED"
  },
  {
    "id": "coindesk_rss",
    "name": "CoinDesk RSS",
    "url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "format": "rss",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "digital-assets"
    ],
    "state": "POLL_DIRECT_FEED"
  },
  {
    "id": "cointelegraph_rss",
    "name": "Cointelegraph RSS",
    "url": "https://cointelegraph.com/rss",
    "format": "rss",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "corridors": [
      "digital-assets"
    ],
    "state": "POLL_DIRECT_FEED"
  }
].map(s=>Object.freeze({...s,categories:Object.freeze(s.categories),corridors:Object.freeze(s.corridors)})));
const ALLOWED_STATES=new Set(["EXISTING_ADAPTER_UNVERIFIED","EXISTING_DIRECT_FEED","POLL_DIRECT_FEED","PORTAL_ENDPOINT_REQUIRED","CREDENTIAL_REQUIRED","REFERENCE_ONLY","TRANSPORT_BLOCKED","REJECTED_REMOVED_LINK"]);
const ALLOWED_FORMATS=new Set(["rss","api","dataset","portal","reference","invalid"]);
const ALLOWED_CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const INVENTORY_ONLY_SOURCE_IDS=new Set([
  "rareearthexchanges_rss","mining_com_rare_earth",
  "zmb_boz_public_notices",
  "fra_banque_france_news","ita_bancaditalia_news","esp_bde_news",
  "nld_dnb_news","bel_nbb_news","nor_norges_bank_news","swe_riksbank_press",
  "pol_nbp_news","tur_tcmb_announcements","jpn_boj_home","kor_bok_home",
  "aus_rba_media_releases","sgp_mas_news","idn_bi_home","mys_bnm_home",
  "phl_bsp_home","tha_bot_home","vnm_sbv_home","bgd_bangladesh_bank_home",
  "pak_sbp_home","kaz_national_bank_home","mng_mongolbank_home",
  "mmr_central_bank_myanmar_home","sau_sama_home","are_central_bank_uae_home",
  "qat_qcb_home","omn_cbo_home","egy_cbe_home","isr_boi_home","irq_cbi_news",
  "mex_banxico_home","arg_bcra_home","chl_bcentral_home","per_bcrp_home",
  "bol_bcb_home","nga_cbn_home","cod_bcc_home"
]);
export function assertDirectGlobalCorridorRegistry(registry=DIRECT_GLOBAL_CORRIDOR_SOURCES){
  if(!Array.isArray(registry)||registry.length!==77)throw Error("DIRECT_GLOBAL_CORRIDOR_REGISTRY_COUNT_INVALID");
  const ids=new Set(),urls=new Set();
  for(const item of registry){
    if(!/^[a-z0-9_]+$/u.test(item.id)||ids.has(item.id)||
      !ALLOWED_STATES.has(item.state)||!ALLOWED_FORMATS.has(item.format)||
      !Array.isArray(item.categories)||item.categories.length===0||
      item.categories.some(c=>!ALLOWED_CATEGORIES.has(c))||
      !Array.isArray(item.corridors)||item.corridors.length===0)
      throw Error("DIRECT_GLOBAL_CORRIDOR_SOURCE_INVALID");
    ids.add(item.id);
    if(item.state==="REJECTED_REMOVED_LINK"){
      if(item.url!==null||item.format!=="invalid")throw Error("DIRECT_GLOBAL_CORRIDOR_REMOVED_LINK_UNSAFE");
    }else{
      const url=new URL(item.url);
      if(url.protocol!=="https:"||url.username||url.password||url.hash||url.port||
        url.hostname==="www.google.com"||url.hostname==="localhost"||
        urls.has(item.url))throw Error("DIRECT_GLOBAL_CORRIDOR_ENDPOINT_INVALID");
      urls.add(item.url);
    }
    if(item.state==="POLL_DIRECT_FEED"&&item.format!=="rss")
      throw Error("DIRECT_GLOBAL_CORRIDOR_ACTIVE_SOURCE_NOT_FEED");
  }
  return true;
}
// The uploaded 2026-11-02 Markdown document covers 37 source IDs. Additional
// operator-supplied inventory records are not fabricated document references.
// References are NOT evidence of live data, licenses or verified risk scores.
export function suppliedGlobalCorridorDirectory(){
 const record=JSON.parse(readFileSync(new URL("../../config/global-corridor-supplied-links.v1.json",import.meta.url),"utf8"));
 if(record.schema!=="geomacro.global-corridor-supplied-links.v1"||
    record.website_intelligence_enabled!==false||
    record.source_link_occurrences!==39||record.unique_source_ids_with_url!==37||
    record.original_markdown_link_occurrences!==38||
    record.followup_submitted_link_occurrences!==1||
    !Array.isArray(record.references)||record.references.length!==39||
    !Array.isArray(record.unresolved_removed_links)||record.unresolved_removed_links.length!==0||
    !Array.isArray(record.resolved_removed_links)||record.resolved_removed_links.length!==1)
   throw Error("DIRECT_CORRIDOR_SUPPLIED_DOCUMENT_CONTRACT_INVALID");
 const known=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>[s.id,s]));
 const seenIds=new Set(),seenLinks=new Set(),indices=new Set(),seenUrl=new Set();
 for(const link of record.references){
   const entry=known.get(link.source_id);
   if(!entry||!entry.url||indices.has(link.reference_index)||
      !Number.isSafeInteger(link.reference_index)||link.reference_index<1||link.reference_index>39||
      !["global","apac","mena","europe","latam","africa","north-america",
        "maritime-logistics","critical-minerals","digital-assets"].includes(link.section)||
      typeof link.supplied_url!=="string"||typeof link.linked_target_url!=="string"||
      !(link.supplied_url.startsWith("http://")||link.supplied_url.startsWith("https://"))||
      !(link.linked_target_url.startsWith("http://")||link.linked_target_url.startsWith("https://"))||
      typeof link.label!=="string"||!link.label)
    throw Error("DIRECT_CORRIDOR_SUPPLIED_LINK_INVALID");
   if(link.supplied_url.startsWith("https://www.google.com/search?q=")){
     if(decodeURIComponent(link.supplied_url.split("?q=")[1])!==link.linked_target_url)
       throw Error("DIRECT_CORRIDOR_SEARCH_WRAPPER_MISMATCH");
   }else if(link.supplied_url!==link.linked_target_url)
     throw Error("DIRECT_CORRIDOR_LINK_TARGET_CHANGED");
   seenIds.add(link.source_id);seenLinks.add(link.linked_target_url);
   indices.add(link.reference_index);seenUrl.add(link.supplied_url);
 }
 if(indices.size!==39||seenIds.size!==37||seenLinks.size!==37||
    record.resolved_removed_links[0]?.original_source_id!=="asean_customs_missing"||
    record.resolved_removed_links[0]?.source_id!=="asean_customs"||
    record.resolved_removed_links[0]?.replacement_official_url!==
      "https://asean.org/our-communities/economic-community/asean-customs/"||
    known.get("asean_customs")?.url!==
      "https://asean.org/our-communities/economic-community/asean-customs/"||
    known.has("asean_customs_missing")||known.size!==77)
   throw Error("DIRECT_CORRIDOR_DOCUMENT_MAPPING_INCOMPLETE");
 return Object.freeze(record);
}
export const CORRIDOR_ONLY_SOURCE_IDS=Object.freeze(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>s.id));
export function directGlobalCorridorRouteSources(){
 assertDirectGlobalCorridorRegistry();
 const directory=suppliedGlobalCorridorDirectory();
 const byId=new Map();
 for(const entry of directory.references){
   if(!byId.has(entry.source_id))byId.set(entry.source_id,[]);
   byId.get(entry.source_id).push(Object.freeze({...entry}));
 }
 return Object.freeze(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>Object.freeze({...s,
   channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,
   source_references:Object.freeze(byId.get(s.id)??[]),
   risk_gate_verified:false,commercial_eligible:false})));
}
// Explicitly empty: none of the 39 submitted links may be inserted into
// Website Intelligence. Historic independent publisher feeds are untouched.
export function directGlobalCorridorNewsFeeds(){return Object.freeze([]);}
export function assertDirectCorridorWebsiteSeparation(){
 const sources=directGlobalCorridorRouteSources();
 if(sources.length!==77||INVENTORY_ONLY_SOURCE_IDS.size!==40||
    sources.some(s=>s.channel!=="CORRIDOR_ONLY"||
     s.website_intelligence_enabled!==false||
     ((s.source_references.length===0)!==INVENTORY_ONLY_SOURCE_IDS.has(s.id)))||
    directGlobalCorridorNewsFeeds().length!==0)
   throw Error("DIRECT_CORRIDOR_SOURCE_LEAKED_TO_WEBSITE_INTELLIGENCE");
 return true;
}
export function directGlobalCorridorSourceCensus(){
 assertDirectCorridorWebsiteSeparation();
 const sources=directGlobalCorridorRouteSources();
 return Object.freeze({schema:"geomacro.direct-global-corridor-source-census.v2",
   source_link_occurrences:39,linked_unique_sources:37,
   total_registered_sources:sources.length,removed_link_placeholders:0,
   registered:sources.length,corridor_only_sources:sources.length,
   website_intelligence_sourced_feeds:0,
   active_direct_native_feeds:0,
   configured_rss_candidate_count:sources.filter(s=>s.format==="rss").length,
   known_existing_adapters_or_feeds:sources.filter(s=>
     ["EXISTING_DIRECT_FEED","EXISTING_ADAPTER_UNVERIFIED"].includes(s.state)).length,
   adapter_or_access_blockers:sources.filter(s=>
     ["PORTAL_ENDPOINT_REQUIRED","CREDENTIAL_REQUIRED","TRANSPORT_BLOCKED","REJECTED_REMOVED_LINK"].includes(s.state)).length,
   certified_country_cells:0,production_readbacks_proven:false,
   canonical_corridor_events_verified:false,
   commercial_source_rights_inferred:false,paid_publication_authorized:false});
}
