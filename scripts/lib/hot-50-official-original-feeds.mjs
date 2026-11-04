/**
 * Reuse the repository's already reviewed official UK OGL Atom publisher
 * inventory inside the existing private 15-minute original-source collector.
 * No Telegram, no extra scheduled job, no commercial rights promotion.
 * Every live tick still checks actual HTTP, native item time and topic.
 */
import {readFileSync} from "node:fs";
const CATEGORY=Object.freeze({
 GEOPOLITICS:"geopolitics",MACRO:"macro",CRITICAL_MINERALS:"rare_earth"
});
const LIVE_PUBLISHER_IDS=new Set([
 "uk_fcdo_ogl_official_atom",
 "uk_hmt_ogl_official_atom",
 "uk_dbt_ogl_minerals_atom",
 "uk_desnz_ogl_minerals_atom",
 "uk_mod_ogl_security_atom",
 "uk_cabinet_ogl_security_atom",
 "uk_obr_ogl_macro_atom",
]);
export const HOT50_OFFICIAL_OGL_FEED_COUNT=LIVE_PUBLISHER_IDS.size;
export function hot50OfficialOriginalFeeds(){
 const registry=JSON.parse(readFileSync(new URL(
  "../../config/official-ogl-atom-sources.json",import.meta.url),"utf8"));
 if(registry.schema!=="geomacro.official-free-atom-license-registry.v1"||
    !Array.isArray(registry.sources))throw Error("HOT50_OGL_REGISTRY_INVALID");
 const rows=[],seen=new Set();
 for(const source of registry.sources){
  if(!LIVE_PUBLISHER_IDS.has(source.source_id))continue;
  const url=new URL(source.feed_url);
  const path="/government/organisations/";
  if(seen.has(source.source_id)||source.owner_country_iso3!=="GBR"||
   !CATEGORY[source.category]||
   !source.source_id.startsWith("uk_")||
   !url.href.startsWith("https://www.gov.uk"+path)||
   !url.pathname.endsWith(".atom")||
   url.username||url.password||url.port||url.hash||
   source.ingest_transport!=="DIRECT_OFFICIAL_ATOM"||
   source.uses_publisher_native_clock_only!==true||
   source.private_research_only!==true||
   source.commercial_promotion_requires_separate_main_gates!==true)
   throw Error("HOT50_OGL_SOURCE_UNSAFE:"+source.source_id);
  seen.add(source.source_id);
  rows.push(Object.freeze({
   id:"private_hot50_"+source.source_id,
   url:source.feed_url,type:"atom",
   categories:[CATEGORY[source.category]],
   supported:true,continent:"europe",publisher_country_iso3:"GBR",
   activation_state:"RUNTIME_PROBE_REQUIRED",
   scope:"private_official_original_candidate",
   publisher_native_dates_required:true,
   transport_verified_at_registration:false,commercial_eligible:false,
   rights_verified:false,publicly_deliverable:false,
   private_hot50_original_candidate:true,
  }));
 }
 if(rows.length!==LIVE_PUBLISHER_IDS.size)
  throw Error("HOT50_OGL_SOURCE_COUNT_MISMATCH");
 return Object.freeze(rows);
}
