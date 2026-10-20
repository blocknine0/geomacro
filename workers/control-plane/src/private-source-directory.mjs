/**
 * Private Supabase-free country source DIRECTORY metadata access.
 * This is NOT a source activator, certification, raw-news publication or
 * commercial-rights grant. Never used by public/Predge response handlers.
 * Authentication is enforced by the parent control-plane router first.
 */
const FAMILIES=Object.freeze(["primary","statistics","monetary","critical_minerals"]);
const EXACT_COUNTS=Object.freeze({primary:195,statistics:194,monetary:195,critical_minerals:195});
const HEX=/^[a-f0-9]{64}$/;
const ISO2=/^[A-Z]{2}$/;
const reply=(obj,status=200)=>Response.json(obj,{status,headers:{
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
}});
const digest=async src=>{
 const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(src));
 return Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,"0")).join("");
};
export function validateDirectoryQuery(params){
 const keys=[...params.keys()];
 if(keys.length!==2||new Set(keys).size!==2||
    keys.some(k=>k!=="dataset"&&k!=="country_iso2"))return null;
 const dataset=params.get("dataset"),iso2=params.get("country_iso2");
 if(!FAMILIES.includes(dataset)||!ISO2.test(iso2??""))return null;
 return {dataset,iso2};
}
export async function getPrivateLegacySourceDirectory(env,params){
 const query=validateDirectoryQuery(params);
 if(!query)return reply({ok:false,error:"SOURCE_DIRECTORY_QUERY_INVALID"},400);
 try{
  const row=await env.DB.prepare(
    "SELECT dataset,country_iso2,source_row_json,source_row_sha256,verification_state "+
    "FROM legacy_official_source_directory_shadow WHERE dataset=? AND country_iso2=? LIMIT 1"
  ).bind(query.dataset,query.iso2).first();
  if(!row)return reply({ok:false,error:"SOURCE_DIRECTORY_ENTRY_UNAVAILABLE",
    dataset:query.dataset,country_iso2:query.iso2,commercially_usable:false},404);
  if(row.dataset!==query.dataset||row.country_iso2!==query.iso2||
     typeof row.source_row_json!=="string"||row.source_row_json.length>12_000||
     !HEX.test(String(row.source_row_sha256??"")))throw Error("CORRUPT_ENTRY");
  if(await digest(row.source_row_json)!==row.source_row_sha256)throw Error("HASH_MISMATCH");
  const metadata=JSON.parse(row.source_row_json);
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata)||
     metadata.country_iso2!==query.iso2)throw Error("SUBJECT_MISMATCH");
  return reply({
    ok:true,schema:"geomacro.private-legacy-source-directory.v1",
    country_iso2:query.iso2,dataset:query.dataset,
    source_directory_metadata:metadata,
    inherited_verification_state:String(row.verification_state??"UNCLASSIFIED"),
    metadata_sha256:row.source_row_sha256,
    data_origin:"legacy-supabase-verified-d1-shadow",
    source_activated:false,original_live_retrieval_verified:false,
    derivative_commercial_rights_approved:false,
    partner_output_authorized:false,chargeable:false,
  });
 }catch{
  return reply({ok:false,error:"SOURCE_DIRECTORY_INTEGRITY_UNAVAILABLE",chargeable:false},503);
 }
}
export async function getPrivateLegacySourceDirectoryCoverage(env,params){
 if(params.size!==0)return reply({ok:false,error:"SOURCE_DIRECTORY_QUERY_INVALID"},400);
 try{
  const all=await env.DB.prepare(
    "SELECT dataset,COUNT(*) AS row_count FROM legacy_official_source_directory_shadow GROUP BY dataset"
  ).all();
  if(!Array.isArray(all?.results))throw Error("MISSING_READBACK");
  const actual=Object.fromEntries(all.results.map(x=>[x.dataset,Number(x.row_count)]));
  if(Object.keys(actual).length!==4||
     FAMILIES.some(k=>!Number.isSafeInteger(actual[k])||actual[k]!==EXACT_COUNTS[k]))
     throw Error("NOT_FULL_SHADOW");
  return reply({
   ok:true,schema:"geomacro.private-source-directory-coverage.v1",
   country_directory_counts:actual,rows_verified_in_shadow:779,
   known_missing_statistics_iso2:["VA"],
   status:"PRIVATE_METADATA_COPIED_NOT_ACTIVATED",
   source_activated:false,real_time_source_health_verified:false,
   raw_news_delivery_enabled:false,commercial_rights_verified:false,
   supabase_requests:0,b2_requests:0,payments:0,chargeable:false,
  });
 }catch{
  return reply({ok:false,error:"SOURCE_DIRECTORY_SHADOW_NOT_READY",
   source_activated:false,chargeable:false},503);
 }
}
