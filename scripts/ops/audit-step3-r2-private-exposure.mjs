#!/usr/bin/env node
/**
 * Real-provider R2 exposure inventory: no SQL, no object reads/writes, no
 * Worker changes, no API billing acceptance and never a Step3 release PASS.
 * Cloudflare's bucket metadata alone does NOT prove private access;
 * BOTH managed r2.dev and custom-domain exposure must be disabled.
 */
import {mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const ACCOUNT="fddd57d28199bad07a768445e7237693";
const RECOVERY="geomacro-d1-recovery-private";
const SHADOW="geomacro-step3-shadow-private";
const PINNED_REPO="blocknine0/geomacro";
const fail=code=>{throw Error("STEP3_R2_EXPOSURE_"+code)};
const MAX_PROVIDER_CALLS=6;
const endpoint=(bucket,suffix)=>"https://api.cloudflare.com/client/v4/accounts/"+
 ACCOUNT+"/r2/buckets/"+bucket+suffix;
const readSafe=async(url,{token,fetchImpl})=>{
 let response;
 try {
  response=await fetchImpl(url,{method:"GET",redirect:"error",
   cache:"no-store",headers:{Authorization:"Bearer "+token,
    "Cache-Control":"no-store"},signal:AbortSignal.timeout(12000)});
 }catch{fail("CLOUDFLARE_GET_UNAVAILABLE")}
 if(!response||response.status!==200||response.redirected)
  fail("CLOUDFLARE_GET_NON_200_OR_REDIRECT");
 let body;try{body=await response.json()}catch{fail("CLOUDFLARE_JSON_INVALID")}
 if(body?.success!==true||!body.result)fail("CLOUDFLARE_RESULT_UNVERIFIED");
 return body.result;
};
export function validateR2AuditIdentity(env){
 if(env.GITHUB_REPOSITORY!==PINNED_REPO||
    env.GITHUB_REF!=="refs/heads/main"||
    env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    env.GEOMACRO_D1_RECOVERY_R2_BUCKET!==RECOVERY||
    env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==SHADOW||
    RECOVERY===SHADOW||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20||
    !existsSync("config/d1-hotspot-v2-canary.hold"))
   fail("ACCOUNT_BUCKET_OR_HOLD_ISOLATION_UNVERIFIED");
 return true;
}
export function evaluateR2BucketExposure({name,metadata,managed,custom}){
 if(metadata?.name!==name||
    typeof managed?.enabled!=="boolean"||
    !Array.isArray(custom?.domains)||
    custom.domains.length>100||
    custom.domains.some(x=>typeof x?.enabled!=="boolean"||
      typeof x?.domain!=="string"||x.domain.length<3)||
    custom.domains.some((x,i)=>custom.domains.findIndex(y=>y.domain===x.domain)!==i))
   fail("PROVIDER_DOMAIN_INVENTORY_INCOMPLETE");
 const active=custom.domains.filter(x=>x.enabled).length;
 return Object.freeze({
  name,
  managed_r2_dev_enabled:managed.enabled,
  custom_domains_seen:custom.domains.length,
  enabled_custom_domain_count:active,
  private_access_verified:managed.enabled===false&&active===0
 });
}
export async function auditStep3PrivateR2Exposure({
 env=process.env,fetchImpl=fetch,now=new Date()
}={}){
 const receipt={
  schema:"geomacro.step3.r2-private-exposure.provider-observation.v1",
  status:"HOLD",code:"STEP3_R2_PRIVATE_EXPOSURE_NOT_VERIFIED",
  checked_at:now.toISOString(),scope:"REAL_CLOUDFLARE_READONLY_DOMAINS",
  provider_calls:0,production_d1_queries:0,shadow_d1_queries:0,
  provider_mutations:0,r2_object_gets:0,r2_object_puts:0,b2_requests:0,
  payments:0,encrypted_checkpoint_readback_verified:false,
  stage1_physical_pass:false,stage2_authorized:false,
  canary_hold_retained:true,buckets:[]
 };
 try {
  validateR2AuditIdentity(env);
  if(!Number.isFinite(now.getTime()))fail("CLOCK_INVALID");
  for(const bucket of [RECOVERY,SHADOW]){
   const get=async suffix=>{
    if(receipt.provider_calls>=MAX_PROVIDER_CALLS)
      fail("PROVIDER_CALL_BOUND_EXCEEDED");
    receipt.provider_calls++;
    return readSafe(endpoint(bucket,suffix),{
     token:env.CLOUDFLARE_API_TOKEN,fetchImpl});
   };
   const metadata=await get("");
   const managed=await get("/domains/managed");
   const custom=await get("/domains/custom");
   const result=evaluateR2BucketExposure({
    name:bucket,metadata,managed,custom});
   receipt.buckets.push(result);
   if(!result.private_access_verified)
    fail("PUBLIC_BUCKET_EXPOSURE_DETECTED");
  }
  receipt.status="PRIVATE_R2_DOMAIN_EXPOSURE_VERIFIED_ONLY";
  receipt.code="PRIVATE_BUCKETS_PROVIDER_DOMAINS_DISABLED_CHECKPOINT_PENDING";
 }catch(e){
  receipt.status="HOLD";
  receipt.code=/^STEP3_R2_EXPOSURE_[A-Z0-9_]+$/u.test(e?.message??"")?
    e.message:"STEP3_R2_EXPOSURE_PROVIDER_UNVERIFIED";
 }
 return Object.freeze(receipt);
}
export async function runStep3R2ExposureAudit(opts={}){
 const result=await auditStep3PrivateR2Exposure(opts);
 const path="artifacts/release/step3-r2-private-exposure-readonly.json";
 mkdirSync(resolve(path,".."),{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const r=await runStep3R2ExposureAudit();
 console.log(JSON.stringify(r));
 if(r.status!=="PRIVATE_R2_DOMAIN_EXPOSURE_VERIFIED_ONLY")process.exitCode=3;
}
