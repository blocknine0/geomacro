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
export function macroMineralsContinuitySources(){
 const manifest=JSON.parse(readFileSync(MANIFEST,"utf8"));
 if(manifest.schema!=="geomacro.official-free-atom-license-registry.v1"||
    !Array.isArray(manifest.sources))throw Error("MACRO_MINERALS_OFFICIAL_MANIFEST_INVALID");
 const selected=IDS.map(id=>{
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
 if(new Set(selected.map(s=>s.url)).size!==selected.length)
  throw Error("MACRO_MINERALS_OFFICIAL_DUPLICATE_URL");
 return Object.freeze(selected);
}
