/**
 * Pinned extra first-party Canada Global Affairs Atom news sources, linked
 * from https://international.canada.ca/en/global-affairs/news/rss
 * These are poll CANDIDATES only; every actual tick must prove HTTP, Atom
 * native item clock, topic and origin. No inferred data usage rights.
 */
import {readFileSync} from "node:fs";
const PINS=Object.freeze({
 private_hot50_can_gac_newsreleases:"newsreleases",
 private_hot50_can_gac_statements:"statements",
});
export function hot50NewOfficialOriginalFeeds(){
 const f=JSON.parse(readFileSync(new URL(
  "../../config/hot-50-new-official-atom-sources.v1.json",import.meta.url),"utf8"));
 if(f.schema!=="geomacro.hot50-official-new-originals.v1"||
  f.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
  !Array.isArray(f.sources)||f.sources.length!==2)
  throw Error("HOT50_NEW_OFFICIAL_ATOM_REGISTRY_INVALID");
 const seen=new Set();
 return Object.freeze(f.sources.map(s=>{
  const u=new URL(s.url);
  const keys=[...u.searchParams.keys()].sort().join(",");
  if(!Object.hasOwn(PINS,s.id)||seen.has(s.id)||
   s.publisher_country_iso3!=="CAN"||
   s.continent!=="north_america"||
   s.type!=="atom"||
   s.activation_state!=="RUNTIME_PROBE_REQUIRED"||
   s.transport_verified_at_registration!==false||
   s.provider_rights_verified!==false||
   s.commercial_eligible!==false||
   s.publicly_deliverable!==false||
   JSON.stringify(s.categories)!==JSON.stringify(s.id==="private_hot50_can_gac_statements"?
    ["geopolitics"]:["geopolitics","macro"])||
   u.origin!=="https://api.io.canada.ca"||
   u.pathname!=="/io-server/gc/news/en/v2"||
   u.username||u.password||u.port||u.hash||
   keys!=="atomtitle,dept,format,orderBy,pick,publishedDate>,sort,type"||
   u.searchParams.get("dept")!=="departmentofforeignaffairstradeanddevelopment"||
   u.searchParams.get("format")!=="atom"||
   u.searchParams.get("sort")!=="publishedDate"||
   u.searchParams.get("orderBy")!=="desc"||
   u.searchParams.get("pick")!=="50"||
   u.searchParams.get("type")!==PINS[s.id])
    throw Error("HOT50_NEW_OFFICIAL_ATOM_SOURCE_INVALID:"+s?.id);
  seen.add(s.id);
  return Object.freeze({...s,supported:true,
   scope:"private_official_original_candidate",
   publisher_native_dates_required:true,
   private_hot50_original_candidate:true,
   rights_verified:false,private_only:true,
  });
 }));
}
