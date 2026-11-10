/** Read-only native Cloudflare D1 backend and Time Travel capability diagnostic.
 * Exact production UUID is checked against D1 list before any capability claim.
 * No D1 execute, migration, restore, Worker deployment, key change or payment.
 */
import {execFileSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const CODE=/^(?:production|beta|alpha)$/u;
function die(s){throw Error("STEP3_D1_DIAGNOSTIC_"+s)}
export function summarizeD1BackendMetadata(doc){
 const candidates=Array.isArray(doc)?doc:
  doc?.result&&typeof doc.result==="object"?[doc.result]:[doc];
 const items=candidates.filter(x=>x&&typeof x==="object"&&!Array.isArray(x));
 const labels=[...new Set(items.map(x=>x.version)
  .filter(x=>typeof x==="string"))];
 if(labels.length>1)die("CONFLICTING_BACKEND_LABELS");
 const version=labels[0]??null;
 return Object.freeze({
  info_response_shape:Array.isArray(doc)?"ARRAY":
    doc?.result&&typeof doc.result==="object"?"WRAPPED":"OBJECT",
  version_label:CODE.test(version??"")?version:
    version===null?"UNREPORTED":"UNRECOGNIZED",
  reported_version_known:CODE.test(version??""),
  time_travel_bookmark_proven:false,
  production_ddl_authorized:false
 });
}
export async function diagnoseStep3D1BackendReadOnly({
 env=process.env,command=execFileSync,fetchImpl=fetch
}={}){
 const db=String(env.D1_DATABASE_ID??"").toLowerCase();
 const account=String(env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(env.CLOUDFLARE_API_TOKEN??"");
 if(!UUID.test(db)||!ACCOUNT.test(account)||token.length<20||
    env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main")
  die("PROTECTED_IDENTITY_OR_CREDENTIAL_MISSING");
 const base=mkdtempSync(join(tmpdir(),"geomacro-d1-info-ro-"));
 const config=join(base,"wrangler.jsonc");
 // Exactly the DB binding/configuration used by the protected Stage2 runner.
 writeFileSync(config,JSON.stringify({
  name:"geomacro-step3-protected-db-only",
  compatibility_date:"2026-10-03",
  d1_databases:[{binding:"DB",database_name:"geomacro-control-plane",
    database_id:db,migrations_dir:base}]
 }),{mode:0o600});
 let version,identityMatched=false;
 try{
  const args=[...["-y","wrangler@4.136.3"]];
  const run=(cmdArgs)=>command("npx",[...args,...cmdArgs,"--config",config],{
   encoding:"utf8",timeout:60000,maxBuffer:1500000,
   stdio:["ignore","pipe","pipe"],env:{...env,CI:"true"}
  });
  let list,metadata;
  try{
   list=JSON.parse(run(["d1","list","--json"]));
   metadata=JSON.parse(run(["d1","info","DB","--json"]));
  }catch{die("WRANGLER_METADATA_UNAVAILABLE")}
  identityMatched=Array.isArray(list)&&
   list.filter(x=>x?.uuid?.toLowerCase()===db&&
    x?.name==="geomacro-control-plane").length===1;
  if(!identityMatched)die("PRODUCTION_UUID_AND_NAME_UNVERIFIED");
  version=summarizeD1BackendMetadata(metadata);
 }finally{rmSync(base,{recursive:true,force:true})}
 let bookmarkVerified=false,providerHTTP=null;
 try{
  const url="https://api.cloudflare.com/client/v4/accounts/"+
   account+"/d1/database/"+db+"/time_travel/bookmark";
  const response=await fetchImpl(url,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{"Authorization":"Bearer "+token,
    "Accept":"application/json","Cache-Control":"no-store"},
   signal:AbortSignal.timeout(12000)
  });
  providerHTTP=Number.isSafeInteger(response?.status)?response.status:null;
  if(response?.status===200&&!response.redirected){
   const data=await response.json();
   // Never log or persist the actual bookmark.
   bookmarkVerified=data?.success===true&&
    typeof data?.result?.bookmark==="string"&&
    data.result.bookmark.length>=16&&data.result.bookmark.length<=4096;
  }
 }catch{/* Provider errors are UNKNOWN/HOLD, never PASS. */}
 const status=bookmarkVerified&&version.version_label!=="alpha"&&
  version.version_label!=="UNRECOGNIZED"?
  "PASS_READONLY_NATIVE_TIME_TRAVEL_CAPABILITY":"HOLD";
 return Object.freeze({
  schema:"geomacro.step3.native-d1-backend-diagnostic.v1",
  status,code:status==="HOLD"?
   "STEP3_D1_NATIVE_BOOKMARK_OR_BACKEND_UNVERIFIED":"STEP3_D1_NATIVE_BOOKMARK_AVAILABLE",
  ...version,
  native_time_travel_bookmark_observed:bookmarkVerified,
  cloudflare_http_status:providerHTTP,
  canonical_database_uuid_verified:identityMatched,
  d1_rows_read:0,d1_rows_written:0,d1_sql_executed:false,
  production_migrations_applied:false,worker_deployed:false,
  payment_enabled:false,canary_hold_unchanged:true,
  recovery_checkpoint_created:false,
  // This is ONLY a non-authorizing diagnostic; Stage2 must still capture its
  // separate AES-256-GCM encrypted R2 checkpoint + signed manifest.
  stage2_release_authorized:false
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 diagnoseStep3D1BackendReadOnly().then(x=>{
  console.log(JSON.stringify(x));
  if(x.status!=="PASS_READONLY_NATIVE_TIME_TRAVEL_CAPABILITY")process.exitCode=2;
 }).catch(e=>{
  const code=/^STEP3_D1_DIAGNOSTIC_[A-Z_]+$/u.test(e?.message??"")?
   e.message:"STEP3_D1_DIAGNOSTIC_PROVIDER_UNKNOWN";
  console.error(JSON.stringify({status:"HOLD",code,
   d1_sql_executed:false,production_migrations_applied:false}));
  process.exitCode=2;
 });
}
