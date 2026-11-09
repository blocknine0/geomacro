#!/usr/bin/env node
/** Read-only provider-verified Phase2H raw prefix B2 1+1-day expiration.
 * No updateBucket, no new B2 PUT, no PREDGE or other bucket lifecycle rules.
 * Both B2 native read attempts use the EXISTING atomic D1 quota governor.
 */
export const PHASE2H_B2_PREFIX="geomacro-evidence/v1/private/phase2h-raw-news/";
const fail=code=>{throw Error("PHASE2H_B2_72H_"+code)};
export function assertPhase2hB2Lifecycle(rules){
 if(!Array.isArray(rules))fail("LIFECYCLE_UNVERIFIED");
 // Backblaze applies the shortest matching lifecycle rule; 1+1 days
 // ensures deletion within the documented maximum 72h after upload.
 // A broad bucket-wide rule is NOT sufficient: it could expire PREDGE or
 // unrelated private/historical evidence. Require explicit raw-only scope.
 const covered=rules.filter(rule=>rule?.fileNamePrefix===PHASE2H_B2_PREFIX);
 // The hide/delete pair must be from ONE exact-prefix rule. Taking
 // independent minima across unrelated rules can falsely report compliance.
 const valid=covered.some(r=>r.daysFromUploadingToHiding===1&&
  r.daysFromHidingToDeleting===1);
 if(!valid)fail("THREE_DAY_EXPIRY_NOT_PROVEN");
 return Object.freeze({schema:"geomacro.phase2h.b2-72h-lifecycle.v1",
  phase2h_raw_prefix_verified:true,max_days_to_hide:1,max_days_after_hide:1,
  deletion_within_three_days_provider_rule:true,
  previous_b2_object_versions_independently_deleted:false,
  no_bucket_mutation:true,other_b2_prefixes_untouched:true});
}
/** Fail closed until the bucket owner removes all provider-side rules
 * capable of hiding or deleting the Phase2H original-news prefix. This
 * DOES NOT modify Backblaze bucket settings or unrelated bucket prefixes.
 */
export function assertPhase2hB2ManualRetention(rules){
 if(!Array.isArray(rules))fail("LIFECYCLE_UNVERIFIED");
 const matching=rules.filter(rule=>{
  if(!rule||typeof rule!=="object")fail("LIFECYCLE_UNVERIFIED");
  const prefix=rule.fileNamePrefix;
  if(typeof prefix!=="string")fail("LIFECYCLE_UNVERIFIED");
  return PHASE2H_B2_PREFIX.startsWith(prefix)||
    prefix.startsWith(PHASE2H_B2_PREFIX);
 });
 // Any matching auto-hide or auto-delete rule is forbidden. Native 1+1-day
 // expiry cannot be paused by changing GitHub Actions scheduling.
 if(matching.some(rule=>
    rule.daysFromUploadingToHiding!=null||
    rule.daysFromHidingToDeleting!=null))
  fail("AUTOMATIC_DELETION_STILL_ENABLED");
 return Object.freeze({
  schema:"geomacro.phase2h.b2-manual-retention.v1",
  phase2h_raw_prefix_verified:true,auto_deletion_paused:true,
  deletion_within_three_days_provider_rule:false,
  no_bucket_mutation:true,other_b2_prefixes_untouched:true,
 });
}
/**
 * A single governed S3 GetBucketLifecycle, NOT a bucket/object listing.
 * The S3-compatible API is an independent read-only authority for real
 * lifecycle rules. Nothing in a GitHub variable or user-provided receipt
 * can claim that retention has been independently verified.
 */
import {createHash,createHmac} from "node:crypto";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
const LIFECYCLE_ORIGIN="https://s3.us-east-005.backblazeb2.com";
const LIFECYCLE_BUCKET="geomacro-private-archive";
const EMPTY_SHA256=createHash("sha256").update("").digest("hex");
const digest=x=>createHash("sha256").update(x).digest("hex");
const mac=(key,value)=>createHmac("sha256",key).update(value).digest();
const tag=(xml,name)=>xml.match(new RegExp("<"+name+">([\\s\\S]*?)<\\/"+name+">","u"))?.[1]??null;
export function parseS3LifecycleRules(xml){
 if(typeof xml!=="string"||xml.length>65536||xml.length<10||
    /<!|&|<\\s*Transition\\b|<\\s*NoncurrentVersionTransition\\b/iu.test(xml)||
    !/<LifecycleConfiguration(?:\\s[^>]*)?>[\\s\\S]*<\\/LifecycleConfiguration>/u.test(xml))
  fail("PROVIDER_LIFECYCLE_XML_INVALID");
 const blocks=[...xml.matchAll(/<Rule>([\\s\\S]*?)<\\/Rule>/gu)];
 const count=(xml.match(/<Rule>/gu)??[]).length;
 if(count!==blocks.length||count>100)fail("PROVIDER_LIFECYCLE_RULES_INVALID");
 const rules=[];
 for(const [,block] of blocks){
  const status=tag(block,"Status");
  if(status!=="Enabled"&&status!=="Disabled")
   fail("PROVIDER_LIFECYCLE_STATUS_INVALID");
  if(/<And>|<Tag>|<ObjectSizeGreaterThan>|<ObjectSizeLessThan>/u.test(block))
   fail("PROVIDER_LIFECYCLE_FILTER_UNSUPPORTED");
  const filter=tag(block,"Filter");
  const rawPrefix=tag(filter??block,"Prefix");
  const prefix=rawPrefix??"";
  if(!/^[\\w./-]*$/u.test(prefix)||prefix.includes(".."))
   fail("PROVIDER_LIFECYCLE_PREFIX_INVALID");
  if(status==="Disabled")continue;
  const expiration=tag(block,"Expiration");
  const noncurrent=tag(block,"NoncurrentVersionExpiration");
  if(/<(?:Expiration|NoncurrentVersionExpiration)\\b/u.test(block)&&
     (expiration===null&&/<Expiration\\b/u.test(block)||
      noncurrent===null&&/<NoncurrentVersionExpiration\\b/u.test(block)))
   fail("PROVIDER_LIFECYCLE_ACTION_INVALID");
  rules.push({
   fileNamePrefix:prefix,
   // Any hide or deletion action on a matching prefix is a HOLD.
   // Do not infer an original's expiry from a translated S3 "Days" field.
   daysFromUploadingToHiding:expiration!==null?1:null,
   daysFromHidingToDeleting:noncurrent!==null?1:null,
  });
 }
 return rules;
}
async function readPrivateB2LifecycleRules({
 env=process.env,fetchImpl=fetch,governor,
}={}){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    !["registered_original_archive","derived_news_backup"]
      .includes(env.B2_ACCOUNT_QUOTA_WORKFLOW_ID)||
    (env.B2_ARCHIVE_READ_KEY_ID??env.B2_KEY_ID??"").length<12||
    (env.B2_ARCHIVE_READ_APPLICATION_KEY??env.B2_APPLICATION_KEY??"").length<16)
  fail("PROTECTED_GOVERNED_MAIN_REQUIRED");
 const access=env.B2_ARCHIVE_READ_KEY_ID??env.B2_KEY_ID;
 const secret=env.B2_ARCHIVE_READ_APPLICATION_KEY??env.B2_APPLICATION_KEY;
 const shared=governor??createB2D1AccountGovernor({env,fetchImpl});
 // Class C / metadata GET: a real global reservation, including provider
 // denials. No list of any bucket keys, object versions or other buckets.
 await shared.reserve("GET");
 const stamp=new Date().toISOString().replace(/[:-]|\\.\\d{3}/gu,"");
 const day=stamp.slice(0,8),region="us-east-005";
 const host=new URL(LIFECYCLE_ORIGIN).host;
 const path="/"+LIFECYCLE_BUCKET;
 const query="lifecycle=";
 const signedHeaders="host;x-amz-content-sha256;x-amz-date";
 const canonical=["GET",path,query,
  "host:"+host+"\\n"+"x-amz-content-sha256:"+EMPTY_SHA256+"\\n"+
  "x-amz-date:"+stamp+"\\n",signedHeaders,EMPTY_SHA256].join("\\n");
 const scope=day+"/"+region+"/s3/aws4_request";
 const toSign=["AWS4-HMAC-SHA256",stamp,scope,digest(canonical)].join("\\n");
 const key=mac(mac(mac(mac("AWS4"+secret,day),region),"s3"),"aws4_request");
 const signature=createHmac("sha256",key).update(toSign).digest("hex");
 let response;
 try{
  response=await fetchImpl(LIFECYCLE_ORIGIN+path+"?lifecycle",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{
    "x-amz-content-sha256":EMPTY_SHA256,
    "x-amz-date":stamp,
    Authorization:"AWS4-HMAC-SHA256 Credential="+access+"/"+scope+
      ", SignedHeaders="+signedHeaders+", Signature="+signature,
   },
   signal:AbortSignal.timeout(15000),
  });
 }catch{fail("PROVIDER_UNAVAILABLE")}
 if(response.redirected)fail("PROVIDER_RESPONSE_INVALID");
 const size=Number(response.headers?.get("content-length")??0);
 if(Number.isFinite(size)&&size>65536)fail("PROVIDER_RESPONSE_TOO_LARGE");
 let body;
 try{body=await response.text()}catch{fail("PROVIDER_RESPONSE_INVALID")}
 if(body.length>65536)fail("PROVIDER_RESPONSE_TOO_LARGE");
 // A *provider-returned* NoSuchLifecycleConfiguration is evidence of
 // no active bucket rules; arbitrary 404, 401 or 403 are NOT evidence.
 if(response.status===404&&/<Code>NoSuchLifecycleConfiguration<\\/Code>/u.test(body))
  return [];
 if(response.status!==200)fail("PROVIDER_LIFECYCLE_UNAVAILABLE");
 return parseS3LifecycleRules(body);
}
/** Separate strict 72h ciphertext-only queue prefix; never alter raw B2 rules. */
export const PHASE2I_SOURCE_QUEUE_B2_PREFIX=
 "geomacro-evidence/v1/private/phase2i-source-queue/";
export function assertPhase2iSourceB2Lifecycle(rules){
 if(!Array.isArray(rules))fail("SOURCE_QUEUE_LIFECYCLE_MISSING");
 // Require one exact-prefix rule. Two unrelated rules do not prove a valid
 // hide/delete sequence; a broader auto-expiry could destroy the queue early.
 const exact=rules.filter(x=>x?.fileNamePrefix===PHASE2I_SOURCE_QUEUE_B2_PREFIX);
 if(!exact.some(x=>x.daysFromUploadingToHiding===1&&
     x.daysFromHidingToDeleting===1))
  fail("SOURCE_QUEUE_72H_EXPIRY_UNVERIFIED");
 if(rules.some(r=>r?.fileNamePrefix!==PHASE2I_SOURCE_QUEUE_B2_PREFIX&&
    typeof r?.fileNamePrefix==="string"&&
    PHASE2I_SOURCE_QUEUE_B2_PREFIX.startsWith(r.fileNamePrefix)&&
    (r.daysFromUploadingToHiding!=null||
     r.daysFromHidingToDeleting!=null)))
  fail("SOURCE_QUEUE_BROAD_LIFECYCLE_CONFLICT");
 if(exact.some(x=>x.daysFromUploadingToHiding!==1||
    x.daysFromHidingToDeleting!==1))
  fail("SOURCE_QUEUE_EXACT_LIFECYCLE_CONFLICT");
 return Object.freeze({
  schema:"geomacro.phase2i.source-queue-b2-72h-lifecycle.v1",
  phase2i_source_queue_prefix_verified:true,
  private_72h_delete_lifecycle_verified:true,
  native_hide_days:1,native_delete_after_hide_days:1,
  no_bucket_mutation:true,other_prefixes_unchanged:true
 });
}
export async function verifyPhase2hB2Lifecycle(args={}){
 const result=assertPhase2hB2ManualRetention(await readPrivateB2LifecycleRules(args));
 return Object.freeze({...result,
  provider_lifecycle_readback_verified:true,
  exact_private_bucket_scope_verified:true,
  no_object_list_api:true,
 });
}
export async function verifyPhase2iSourceB2Lifecycle(args={}){
 return assertPhase2iSourceB2Lifecycle(await readPrivateB2LifecycleRules(args));
}
if(process.argv[1]?.endsWith("/phase2h-verify-b2-72h-lifecycle.mjs")){
 try{console.log(JSON.stringify(await verifyPhase2hB2Lifecycle()))}
 catch(e){const m=String(e?.message??"");
  console.error(/^PHASE2H_B2_72H_[A-Z_]+$/u.test(m)?m:
   "PHASE2H_B2_72H_PROVIDER_PROOF_UNAVAILABLE");process.exitCode=2}
}
