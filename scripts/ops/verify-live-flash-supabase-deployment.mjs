#!/usr/bin/env node
/** Read-only proof for frozen Supabase Edge Function. No deployment, D1 writes,
 * database migration, synthetic news, secret logging, payments or PREDGE work.
 */
import {appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
export const PROJECT="ldpwajisioljyjtojvfx";
export const SLUG="live-flash-corroborate";
export const JOSE_SOURCE_MERGED_AT="2026-10-28T18:01:31Z";
const API="https://api.supabase.com/v1/projects/"+PROJECT+"/functions";
const EDGE="https://"+PROJECT+".supabase.co/functions/v1/"+SLUG;
function millis(x){
 if(typeof x==="string")return Date.parse(x);
 if(typeof x==="number"&&Number.isFinite(x))return x>1e12?x:x>1e9?x*1000:NaN;
 return NaN;
}
function status(reason,management=false,recent=false,guard=false,health=false){
 return Object.freeze({
  schema:"geomacro.frozen-supabase-flash-live-proof.v1",
  status:management&&recent&&guard&&health?"READONLY_HEALTH_AND_DEPLOYMENT_TIME_VERIFIED":"NOT_VERIFIED",
  project_ref:PROJECT,slug:SLUG,management_verified:management,
  deploy_after_jose_merge_verified:recent,public_method_guard_verified:guard,
  authenticated_health_verified:health,exact_deployed_bundle_hash_verified:false,
  reason,no_write:true,no_payment:true,no_secret_logging:true
 });
}
async function jsonBounded(response,max=300000){
 const s=await response.text();
 if(s.length>max)throw Error("OVERSIZED");
 return JSON.parse(s);
}
export async function checkFrozenSupabase({
 fetchImpl=fetch,accessToken,flashToken,now=Date.now()
}={}){
 if(!Number.isFinite(now)||typeof fetchImpl!=="function")return status("INVALID_CLOCK");
 if(typeof accessToken!=="string"||accessToken.length<8)return status("READ_TOKEN_NOT_CONFIGURED");
 let record;
 try{
  const r=await fetchImpl(API,{method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},
   signal:AbortSignal.timeout(15000)});
  if(r.status!==200||r.redirected)return status("READ_TOKEN_OR_API_UNAVAILABLE");
  const rows=await jsonBounded(r);
  if(!Array.isArray(rows)||rows.length>1200)return status("METADATA_MALFORMED");
  record=rows.find(x=>x&&x.slug===SLUG);
 }catch{return status("MANAGEMENT_READ_FAILED")}
 if(!record||record.status!=="ACTIVE"||
    !Number.isSafeInteger(record.version)||record.version<1)
  return status("FUNCTION_NOT_ACTIVE");
 const at=millis(record.updated_at);
 const recent=Number.isFinite(at)&&at>=Date.parse(JOSE_SOURCE_MERGED_AT)&&at<=now+60000;
 let guard=false;
 try{
  const r=await fetchImpl(EDGE,{method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  guard=r.status===405&&!r.redirected;
 }catch{}
 let health=false;
 if(guard&&typeof flashToken==="string"&&flashToken.length>=8){
  try{
   const r=await fetchImpl(EDGE+"?mode=health",{method:"POST",
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000),
    headers:{"Content-Type":"application/json","x-geomacro-flash-token":flashToken,
     Authorization:"Bearer "+flashToken},body:"{}"});
   if(r.status===200&&!r.redirected){
    const data=await jsonBounded(r,50000);
    health=data?.ok===true&&data?.health===true&&data?.authenticated===true;
   }
  }catch{}
 }
 return status(!recent?"NO_POST_JOSE_SOURCE_DEPLOYMENT":
  !guard?"PUBLIC_FUNCTION_METHOD_GUARD_NOT_VERIFIED":
  !flashToken?"HEALTH_TOKEN_NOT_CONFIGURED":
  !health?"READ_ONLY_HEALTH_NOT_VERIFIED":
  "DEPLOYED_BUNDLE_DIGEST_UNAVAILABLE",true,recent,guard,health);
}
export function summary(r){
 return ["### Supabase flash deployment independent acceptance",
  "","State: "+r.status,
  "","- Management API function ACTIVE: "+r.management_verified,
  "- Deployment newer than pinned jose fix: "+r.deploy_after_jose_merge_verified,
  "- Public no-write GET method guard: "+r.public_method_guard_verified,
  "- Authenticated read-only health: "+r.authenticated_health_verified,
  "- Exact deployed bundle SHA: NOT VERIFIED",
  "- Blocker: "+r.reason,
  "","Source merge and Deno check do not prove deployment. No source or secrets exposed."].join("\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main")throw Error("WRONG_MAIN");
  const r=await checkFrozenSupabase({
   accessToken:process.env.SUPABASE_ACCESS_TOKEN,
   flashToken:process.env.FLASH_INGEST_TOKEN,
  });
  console.log(JSON.stringify(r));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary(r));
  if(r.status!=="READONLY_HEALTH_AND_DEPLOYMENT_TIME_VERIFIED")process.exitCode=2;
 }catch{
  console.error("FROZEN_FLASH_SUPABASE_PROOF_FAILED_CLOSED");
  process.exitCode=2;
 }
}
