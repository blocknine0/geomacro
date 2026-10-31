import {readFileSync} from "node:fs";
const PINNED=Object.freeze(new Map([
 ["private_mineral_chl_cochilco_news",["https://www.cochilco.cl/web/noticias/feed/","CHL"]],
 ["private_mineral_aus_industry_news",["https://www.industry.gov.au/news.xml","AUS"]],
]));
export function privateMineralNationalRssSources(){
 const manifest=JSON.parse(readFileSync(new URL("../../config/private-osint-mineral-first-party-rss-expansion.v1.json",import.meta.url),"utf8"));
 if(manifest.schema!=="geomacro.mineral-first-party-rss-expansion.v1"||manifest.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(manifest.sources)||manifest.sources.length!==PINNED.size)throw Error("MINERAL_FIRST_PARTY_MANIFEST_INVALID");
 const seen=new Set();
 return Object.freeze(manifest.sources.map(s=>{
  const pinned=PINNED.get(s.id);
  if(!pinned||seen.has(s.id)||s.url!==pinned[0]||s.publisher_country_iso3!==pinned[1]||
     s.scope!=="national_primary"||s.type!=="rss"||
     !Array.isArray(s.categories)||!s.categories.includes("rare_earth")||
     s.categories.some(c=>!["rare_earth","macro"].includes(c))||
     s.activation_state!=="RUNTIME_PROBE_REQUIRED"||s.publisher_native_dates_required!==true||
     s.verified_first_party_rss_link!==true||s.feed_status_not_asserted!==true||
     s.provider_rights_verified!==false||s.commercial_eligible!==false||s.private_only!==true)
    throw Error("MINERAL_FIRST_PARTY_SOURCE_UNSAFE");
  seen.add(s.id);
  return Object.freeze({...s,supported:true});
 }));
}
