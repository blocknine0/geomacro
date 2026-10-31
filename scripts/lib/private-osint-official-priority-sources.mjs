/** Bounded official RSS/Atom priority candidates. Not transport or commercial certification. */
import {readFileSync} from "node:fs";
const PINNED=Object.freeze(new Map([
 ["private_priority_aus_ga_news","https://www.ga.gov.au/news-events/news/rss"],
 ["private_priority_can_nrcan_news","https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada"],
 ["private_priority_ind_rbi_press","https://www.rbi.org.in/pressreleases_rss.xml"],
 ["private_priority_bis_research","https://www.bis.org/doclist/bis_fsi_publs.rss"],
 ["private_priority_gdacs_24h","https://www.gdacs.org/xml/rss_24h.xml"],
 ["private_priority_iea_news","https://www.iea.org/news/rss"],
]));
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const CONTINENTS=new Set(["global","africa","asia","europe","north_america","south_america","oceania"]);
export const OFFICIAL_PRIORITY_CANDIDATE_COUNT=PINNED.size;
export function privateOsintOfficialPrioritySources(){
 const m=JSON.parse(readFileSync(new URL("../../config/private-osint-official-priority-additions.v1.json",import.meta.url),"utf8"));
 if(m.schema!=="geomacro.private-osint-official-priority-additions.v1"||
    m.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(m.sources)||m.sources.length!==PINNED.size)
   throw Error("PRIVATE_OFFICIAL_PRIORITY_MANIFEST_INVALID");
 const seen=new Set();
 return Object.freeze(m.sources.map(s=>{
  let url,reference;
  try{url=new URL(s.url);reference=new URL(s.discovery_reference_url)}catch{throw Error("PRIVATE_OFFICIAL_PRIORITY_URL_INVALID")}
  if(!PINNED.has(s.id)||PINNED.get(s.id)!==s.url||seen.has(s.id)||
     url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     reference.protocol!=="https:"||reference.username||reference.password||reference.port||reference.hash||
     !CONTINENTS.has(s.continent)||
     !(s.publisher_country_iso3===null||/^[A-Z]{3}$/u.test(s.publisher_country_iso3))||
     (s.continent==="global")!==(s.publisher_country_iso3===null)||
     !["rss","atom"].includes(s.type)||!Array.isArray(s.categories)||
     !s.categories.length||new Set(s.categories).size!==s.categories.length||
     s.categories.some(c=>!CATEGORIES.has(c))||
     s.source_kind!=="OFFICIAL_PRIMARY_FEED_CANDIDATE"||
     s.activation_state!=="RUNTIME_PROBE_REQUIRED"||
     s.publisher_native_dates_required!==true||
     s.transport_verified_at_registration!==false||
     s.provider_rights_verified!==false||
     s.commercial_eligible!==false||
     s.access_verified_in_production!==false||
     s.publicly_deliverable!==false||
     s.private_only!==true)
   throw Error("PRIVATE_OFFICIAL_PRIORITY_SOURCE_UNSAFE:"+s?.id);
  seen.add(s.id);
  return Object.freeze({...s,categories:Object.freeze([...s.categories]),supported:true,private_priority_official:true});
 }));
}
