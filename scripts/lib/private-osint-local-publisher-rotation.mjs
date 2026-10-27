/**
 * Existing 96 country-local RSS candidates across 94 countries are now an
 * active, bounded PRIVATE ingestion rotation. They are NOT 94 verified event
 * sources, three qualified category streams, or publishing entitlements.
 * No new providers are introduced: HTTPS URLs are pinned in a reviewed repo
 * manifest; failed/denied feeds yield explicit negative health observations.
 */
import {readFileSync} from "node:fs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {CONTINENT_COUNTRIES_195} from "./continent-country-195-rotation.mjs";
export const PRIVATE_LOCAL_FEEDS_PER_TICK=24;
export const PRIVATE_LOCAL_NOMINAL_CYCLE_MINUTES=60;
const PERIOD_MS=15*60*1000;
const ALLOWED_CATEGORIES=["geopolitics","macro","rare_earth"];
const ISOS=new Set(COUNTRIES_195.map(x=>x.iso3));
const REGION_BY_COUNTRY=new Map(Object.entries(CONTINENT_COUNTRIES_195)
 .flatMap(([region,countries])=>countries.map(iso3=>[iso3,region])));
function sourceManifest(){
 return JSON.parse(readFileSync(new URL(
  "../../config/private-osint-local-gaplane.v1.json",import.meta.url),"utf8"));
}
export function privateLocalPublisherCandidates(manifest=sourceManifest()){
 if(manifest?.schema!=="geomacro.private-osint-local-gaplane.v1"||
    manifest.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(manifest.sources)||manifest.sources.length!==96)
  throw Error("PRIVATE_LOCAL_PUBLISHER_MANIFEST_INVALID");
 const ids=new Set(),urls=new Set(),countries=new Set();
 const sources=manifest.sources.map(s=>{
  let url,reference;
  try{url=new URL(s.url);reference=new URL(s.discovery_reference_url)}
  catch{throw Error("PRIVATE_LOCAL_PUBLISHER_URL_INVALID")}
  if(!/^private_gaplane_[a-z0-9_]+$/u.test(s.id??"")||
     ids.has(s.id)||urls.has(s.url)||url.href!==s.url||
     url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !url.hostname.includes(".")||url.hostname==="localhost"||
     /(?:^|\\.)(?:localhost|local|internal|invalid)$/u.test(url.hostname)||
     reference.protocol!=="https:"||reference.username||reference.password||
     reference.port||reference.hash||!reference.hostname.includes(".")||
     !ISOS.has(s.publisher_country_iso3)||!REGION_BY_COUNTRY.has(s.publisher_country_iso3)||
     !["rss","atom"].includes(s.type)||!Array.isArray(s.categories)||
     s.categories.length!==3||new Set(s.categories).size!==3||
     s.categories.some(c=>!ALLOWED_CATEGORIES.includes(c))||
     s.activation_state!=="RUNTIME_PROBE_REQUIRED"||
     s.publisher_native_dates_required!==true||
     s.transport_verified_at_registration!==false||
     s.commercial_eligible!==false||s.publicly_deliverable!==false)
   throw Error("PRIVATE_LOCAL_PUBLISHER_CANDIDATE_UNSAFE");
  ids.add(s.id);urls.add(s.url);countries.add(s.publisher_country_iso3);
  return Object.freeze({
   id:s.id,url:s.url,type:s.type,access:"rss",
   categories:[...s.categories],supported:true,
   continent:REGION_BY_COUNTRY.get(s.publisher_country_iso3),
   publisher_country_iso3:s.publisher_country_iso3,
   publisher_countries:[s.publisher_country_iso3],
   private_country_local_candidate:true,
   publisher_native_dates_required:true,
   transport_verified_at_registration:false,
   activation_state:"PRIVATE_UNVERIFIED_OBSERVATION",
   rights_verified:false,commercial_eligible:false,publicly_deliverable:false,
  });
 });
 if(countries.size!==94)throw Error("PRIVATE_LOCAL_PUBLISHER_94_COUNTRY_REGISTRY_INVALID");
 return Object.freeze(sources.sort((a,b)=>
  a.publisher_country_iso3.localeCompare(b.publisher_country_iso3)||a.id.localeCompare(b.id)));
}
export function rotatingPrivateLocalPublisherSources(now=new Date(),all=privateLocalPublisherCandidates()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(all)||all.length!==96||
    new Set(all.map(x=>x?.id)).size!==96||
    new Set(all.map(x=>x?.url)).size!==96)
  throw Error("PRIVATE_LOCAL_PUBLISHER_ROTATION_INVALID");
 const slot=Math.floor(now.getTime()/PERIOD_MS)%4;
 return Object.freeze(all.slice(slot*PRIVATE_LOCAL_FEEDS_PER_TICK,
  (slot+1)*PRIVATE_LOCAL_FEEDS_PER_TICK));
}
