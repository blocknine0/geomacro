/** Independent GOV.UK publisher Atom discovery for Macro/FX and Critical Minerals.
 * The four sources are already recorded in the official OGL candidate manifest.
 * They are backups/priority feeds, NOT a transport-success or licensing claim.
 * An upstream 401/403/429 stays denied; never proxy, spoof or bypass it.
 */
import {readFileSync} from "node:fs";
const MANIFEST=new URL("../../config/official-ogl-atom-sources.json",import.meta.url);
const IDS=Object.freeze([
 "uk_hmt_ogl_official_atom","uk_obr_ogl_macro_atom",
 "uk_dbt_ogl_minerals_atom","uk_desnz_ogl_minerals_atom"
]);
const CATEGORY=Object.freeze({MACRO:"macro",CRITICAL_MINERALS:"rare_earth"});
const EXTRA=Object.freeze([
 // Separate current government publishers. Each URL is a runtime probe candidate.
 ["uk_export_finance","uk-export-finance","macro"],
 ["uk_hmrc","hm-revenue-customs","macro"],
 ["uk_dwp","department-for-work-pensions","macro"],
 ["uk_cma","competition-and-markets-authority","macro"],
 ["uk_bist","department-for-business-innovation-science-and-trade","rare_earth"],
 ["uk_ukri","uk-research-and-innovation","rare_earth"],
]);

// Independent first-party alternatives for sources with blocked, oversized or
// unreliable fastlane transports. These are *distinct publishers*, not mirrors
// of BLS/CFTC/LBMA, and publisher reachability is proved only by the 20m runner.
// Pin exact issuer-controlled RSS endpoints documented by their publishers.
const NATIVE_OFFICIAL=Object.freeze([
 // These issuer-controlled feeds have already produced accepted RSS/Atom
 // parser states in prior fastlane or protected read-only CI observations.
 // Reuse URL-level source dedupe if another native collector pins the same URL.
 ["us_fed_monetary","https://www.federalreserve.gov/feeds/press_monetary.xml","USA","macro"],
 ["can_boc_press","https://www.bankofcanada.ca/content_type/press/feed/","CAN","macro"],
 ["us_bea_release","https://apps.bea.gov/rss/rss.xml","USA","macro"],
 ["jpn_boj_press","https://www.boj.or.jp/en/rss/whatsnew.xml","JPN","macro"],
 ["us_usgs_minerals","https://www.usgs.gov/news/minerals/feed","USA","rare_earth"],
 ["can_bc_minerals","https://news.gov.bc.ca/ministries/mining-and-critical-minerals/feed","CAN","rare_earth"],
 // Brazilian central bank issuer-owned RSS; discovery only until actual runtime
 // native-clock, commercial-rights and original-page verification succeeds.
 ["bra_bcb_focus","https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/focus","BRA","macro"],
]);

export function macroMineralsContinuitySources(){
 const manifest=JSON.parse(readFileSync(MANIFEST,"utf8"));
 if(manifest.schema!=="geomacro.official-free-atom-license-registry.v1"||
    !Array.isArray(manifest.sources))throw Error("MACRO_MINERALS_OFFICIAL_MANIFEST_INVALID");
 const fromManifest=IDS.map(id=>{
  const matches=manifest.sources.filter(s=>s.source_id===id);
  if(matches.length!==1)throw Error("MACRO_MINERALS_OFFICIAL_ID_INVALID");
  const s=matches[0],category=CATEGORY[s.category];
  let url;try{url=new URL(s.feed_url)}catch{throw Error("MACRO_MINERALS_OFFICIAL_URL_INVALID")}
  if(!category||url.protocol!=="https:"||url.hostname!=="www.gov.uk"||
     url.username||url.password||url.port||url.hash||
     !url.pathname.startsWith("/government/organisations/")||
     !url.pathname.endsWith(".atom")||
     s.owner_country_iso3!=="GBR"||
     s.ingest_transport!=="DIRECT_OFFICIAL_ATOM"||
     s.telegram_content_license!==false||
     s.private_research_only!==true)
   throw Error("MACRO_MINERALS_OFFICIAL_SOURCE_INVALID");
  return Object.freeze({
   id:"private_macro_minerals_continuity_"+s.source_id,
   url:s.feed_url,type:"atom",continent:"europe",
   publisher_country_iso3:"GBR",publisher_kind:"official",
   categories:Object.freeze([category]),supported:true,
   private_macro_minerals_continuity:true,
   publisher_native_dates_required:true,
   transport_verified_at_registration:false,
   original_article_verified:false,
   provider_rights_verified:false,commercial_eligible:false,
   publicly_deliverable:false,private_only:true
  });
 });
 const additional=EXTRA.map(([suffix,slug,category])=>Object.freeze({
  id:"private_macro_minerals_continuity_"+suffix,
  url:"https://www.gov.uk/government/organisations/"+slug+".atom",
  type:"atom",continent:"europe",publisher_country_iso3:"GBR",
  publisher_kind:"official",categories:Object.freeze([category]),
  supported:true,private_macro_minerals_continuity:true,
  publisher_native_dates_required:true,
  transport_verified_at_registration:false,original_article_verified:false,
  provider_rights_verified:false,commercial_eligible:false,
  publicly_deliverable:false,private_only:true
 }));
 const official=NATIVE_OFFICIAL.map(([suffix,url,country,category])=>{
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
     parsed.port||parsed.hash||parsed.search||!["USA","CAN","JPN","BRA"].includes(country)||
     !["macro","rare_earth"].includes(category))
   throw Error("MACRO_MINERALS_NATIVE_OFFICIAL_SOURCE_INVALID");
  return Object.freeze({
   id:"private_macro_minerals_continuity_"+suffix,url,type:"rss",
   continent:country==="JPN"?"asia":country==="BRA"?"south_america":"north_america",
   publisher_country_iso3:country,publisher_kind:"official",
   categories:Object.freeze([category]),supported:true,
   private_macro_minerals_continuity:true,
   publisher_native_dates_required:true,
   transport_verified_at_registration:false,
   original_article_verified:false,provider_rights_verified:false,
   commercial_eligible:false,publicly_deliverable:false,private_only:true,
  });
 });
 const selected=[...fromManifest,...additional,...official];
 if(new Set(selected.map(s=>s.url)).size!==selected.length||
    new Set(selected.map(s=>s.id)).size!==selected.length)
  throw Error("MACRO_MINERALS_OFFICIAL_DUPLICATE_URL_OR_ID");
 return Object.freeze(selected);
}
