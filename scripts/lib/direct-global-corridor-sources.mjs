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
export function assertDirectGlobalCorridorRegistry(registry=DIRECT_GLOBAL_CORRIDOR_SOURCES){
  if(!Array.isArray(registry)||registry.length!==37)throw Error("DIRECT_GLOBAL_CORRIDOR_REGISTRY_COUNT_INVALID");
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
// Every entry in the uploaded 2026-11-02 Markdown document is a CORRIDOR
// source reference, including regional macro, minerals and digital-assets.
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
    known.has("asean_customs_missing")||known.size!==37)
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
 if(sources.length!==37||sources.some(s=>s.channel!=="CORRIDOR_ONLY"||
     s.website_intelligence_enabled!==false||s.source_references.length===0)||
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
