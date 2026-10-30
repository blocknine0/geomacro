/**
 * GeoMacro private, bounded multilateral hub overlay.
 *
 * These are source DISCOVERY candidates from the Global 120 country guide,
 * not a 123-country proof, original-page readback, rights grant or commercially
 * reusable content. Other hubs already exist in the pinned OSINT/source
 * registries; ReliefWeb V2 needs a separately approved appname and is not
 * silently replaced by the guide's obsolete V1 unauthenticated endpoint.
 *
 * Rotation steals NO extra network slots: the country index's capacity is
 * reduced by this overlay at the existing 512-source ceiling.
 */
const CANDIDATES=Object.freeze([
 Object.freeze({
  id:"private_hub_bis_central_bank_speeches",
  url:"https://www.bis.org/doclist/cbspeeches.rss",
  categories:Object.freeze(["macro"]),
  type:"rss",continent:"global",publisher_country_iso3:null,
  issuer:"Bank for International Settlements (aggregator of central-bank speeches)",
 }),
 Object.freeze({
  id:"private_hub_un_global_news",
  url:"https://news.un.org/feed/subscribe/en/news/all/rss.xml",
  categories:Object.freeze(["geopolitics","macro","rare_earth"]),
  type:"rss",continent:"global",publisher_country_iso3:null,
  issuer:"UN News (reported news, not an independent primary document)",
 }),
 Object.freeze({
  // OFAC retired its own RSS in 2025; do NOT poll the dead
  // ofac.treasury.gov/recent-actions.xml from the Gemini draft.
  // Federal Register agency-filtered RSS is an independent official
  // document publication channel, NOT an OFAC Recent Actions mirror.
  id:"private_hub_ofac_federal_register_notices",
  url:"https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=foreign-assets-control-office",
  categories:Object.freeze(["geopolitics"]),
  type:"rss",continent:"north_america",publisher_country_iso3:"USA",
  issuer:"Federal Register: Foreign Assets Control Office documents (not all OFAC recent actions)",
 }),
]);

export const GLOBAL_HUB_OVERLAY_COUNT=CANDIDATES.length;

export function privateOsintGlobalHubSources(){
 const ids=new Set(),urls=new Set();
 return Object.freeze(CANDIDATES.map(row=>{
  const url=new URL(row.url);
  if(!/^private_hub_[a-z0-9_]+$/u.test(row.id)||
     ids.has(row.id)||urls.has(row.url)||
     url.protocol!=="https:"||url.username||url.password||url.port||
     url.hash||!url.hostname.includes(".")||
     !Array.isArray(row.categories)||!row.categories.length||
     row.categories.some(x=>!["geopolitics","macro","rare_earth"].includes(x))||
     row.type!=="rss")
   throw Error("PRIVATE_MULTILATERAL_HUB_OVERLAY_INVALID");
  ids.add(row.id);urls.add(row.url);
  return Object.freeze({...row,categories:Object.freeze([...row.categories]),
   supported:true,private_hub_overlay:true,activation_state:"RUNTIME_PROBE_REQUIRED",
   publisher_native_dates_required:true,transport_verified_at_registration:false,
   provider_rights_verified:false,commercial_eligible:false,
   publicly_deliverable:false,private_only:true});
 }));
}
