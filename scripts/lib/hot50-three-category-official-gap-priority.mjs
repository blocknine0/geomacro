/**
 * Exact pinned, private-only original-publisher candidates for Hot50's three
 * category source gap. This never verifies transport, rights, same-event
 * independent issuers, signed GRO or payment eligibility.
 *
 * Existing catalogue IDs are preserved by URL-level merging in the producer.
 * Expired, retired, malformed or unreviewed manifest pins fail closed.
 */
import {readFileSync} from "node:fs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
const ROOT=new URL("../../",import.meta.url);
const manifest=JSON.parse(readFileSync(new URL("config/hot50-three-category-official-gap-priority.v1.json",ROOT),"utf8"));
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const expectedHosts=new Set(["www.gov.uk","finance.ec.europa.eu"]);
function fail(code){throw Error("HOT50_OFFICIAL_GAP_PRIORITY_"+code)}
function safeUrl(link){
 try{const u=new URL(link);return u.protocol==="https:"&&!u.username&&!u.password&&
   !u.port&&!u.hash&&u.hostname.includes(".")&&u.href.length<2000;}
 catch{return false}
}
function validate(s){
 if(!s||typeof s.id!=="string"||!/^private_[a-z0-9_]+$/u.test(s.id)||
    !safeUrl(s.url)||!["rss","rdf","atom"].includes(s.type)||
    !Array.isArray(s.categories)||!s.categories.length||
    s.categories.some(c=>!CATS.has(c))||
    !["GBR","CAN","CHL","RUS","SWE","NOR","CHE","THA","ZAF","USA",null].includes(s.publisher_country_iso3)||
    isRetiredPrivateOsintSource(s))fail("SOURCE_INVALID_OR_RETIRED");
}
export function hot50ThreeCategoryOfficialPrioritySources(){
 if(manifest.schema!=="geomacro.hot50-three-category-official-gap-priority.v1"||
    manifest.scope!=="PRIVATE_ORIGINAL_CANDIDATE_NO_FUNDS"||
    !Array.isArray(manifest.new_official_candidates)||
    manifest.new_official_candidates.length!==6||
    !manifest.pinned_existing||
    Object.keys(manifest.pinned_existing).length!==2)
   fail("MANIFEST_INVALID");
 const all=[];
 for(const [path,ids] of Object.entries(manifest.pinned_existing)){
  if(!["config/private-osint-regional-corridor-additions.v1.json",
        "config/private-osint-mineral-first-party-rss-expansion.v1.json"].includes(path)||
     !Array.isArray(ids)||ids.length===0)fail("UNREVIEWED_PATH");
  const doc=JSON.parse(readFileSync(new URL(path,ROOT),"utf8"));
  if(!Array.isArray(doc.sources))fail("SOURCE_MANIFEST_MISSING");
  for(const id of ids){
   const matches=doc.sources.filter(x=>x.id===id);
   if(matches.length!==1)fail("PIN_DRIFT");
   const s=matches[0];
   validate(s);
   // The externally reviewed list contains publisher-owned candidate URLs,
   // not editorial or mirror providers, and never promotes rights by label.
   if(s.provider_rights_verified!==false||
      s.commercial_eligible!==false||
      s.activation_state!=="RUNTIME_PROBE_REQUIRED")
     fail("UNVERIFIED_MANIFEST_ADMISSION");
   all.push({...s,private_official_hot50_gap_priority:true});
  }
 }
 for(const s of manifest.new_official_candidates){
  validate(s);
  if(!/^private_hot50_first_party_[a-z0-9_]+$/u.test(s.id)||
     !expectedHosts.has(new URL(s.url).hostname)||
     s.activation_state!=="RUNTIME_PROBE_REQUIRED"||
     s.publisher_native_dates_required!==true||
     s.transport_verified_at_registration!==false||
     s.original_article_verified!==false||
     s.provider_rights_verified!==false||
     s.commercial_eligible!==false||
     s.publicly_deliverable!==false)fail("NEW_FEED_NOT_PROVEN");
  if(s.url.startsWith("https://www.gov.uk/")&&
     !s.url.startsWith("https://www.gov.uk/government/organisations/")||
     s.url.startsWith("https://www.gov.uk/")&&!s.url.endsWith(".atom"))
   fail("UNEXPECTED_OFFICIAL_URL");
  all.push({...s,private_official_hot50_gap_priority:true});
 }
 const ids=new Set(),urls=new Set();
 for(const s of all){
  if(ids.has(s.id)||urls.has(s.url))fail("DUPLICATE_PUBLISHER_OR_ID");
  ids.add(s.id);urls.add(s.url);
 }
 if(all.length!==23||!["geopolitics","macro","rare_earth"].every(c=>
   all.some(s=>s.categories.includes(c))))fail("THREE_CATEGORY_COVERAGE_DRIFT");
 return Object.freeze(all.map(s=>Object.freeze({
  id:s.id,url:s.url,type:s.type,
  categories:Object.freeze([...s.categories]),
  continent:s.continent,publisher_country_iso3:s.publisher_country_iso3??null,
  supported:true,private_only:true,publisher_kind:"official",
  private_official_hot50_gap_priority:true,
  publisher_native_dates_required:true,
  original_article_verified:false,
  transport_verified_at_registration:false,
  rights_verified:false,provider_rights_verified:false,
  commercial_eligible:false,publicly_deliverable:false,
 })));
}
