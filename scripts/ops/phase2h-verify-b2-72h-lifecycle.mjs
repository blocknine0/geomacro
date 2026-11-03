#!/usr/bin/env node
/** Read-only provider-verified Phase2H raw prefix B2 1+1-day expiration.
 * No updateBucket, no new B2 PUT, no PREDGE or other bucket lifecycle rules.
 * Both B2 native read attempts use the EXISTING atomic D1 quota governor.
 */
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
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
async function readPrivateB2LifecycleRules({
 env=process.env,fetchImpl=fetch,
 governor=createB2D1AccountGovernor({env,fetchImpl}),
}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    !["derived_news_backup","registered_original_archive"].includes(
      env.B2_ACCOUNT_QUOTA_WORKFLOW_ID)||
    typeof env.B2_KEY_ID!=="string"||env.B2_KEY_ID.length<12||
    typeof env.B2_APPLICATION_KEY!=="string"||env.B2_APPLICATION_KEY.length<16)
  fail("PROTECTED_GOVERNED_MAIN_REQUIRED");
 // Prefer the already-configured read-only archive principal for
 // lifecycle verification. The upload principal may intentionally lack
 // listBuckets, while archive PUT remains restricted to its original key.
 const hasReadId=(env.B2_ARCHIVE_READ_KEY_ID??"").length>0;
 const hasReadSecret=(env.B2_ARCHIVE_READ_APPLICATION_KEY??"").length>0;
 if(hasReadId!==hasReadSecret)fail("ARCHIVE_READ_PAIR_INCOMPLETE");
 const credentialId=hasReadId?env.B2_ARCHIVE_READ_KEY_ID:env.B2_KEY_ID;
 const credentialSecret=hasReadSecret?env.B2_ARCHIVE_READ_APPLICATION_KEY:env.B2_APPLICATION_KEY;
 if((credentialId??"").length<12||(credentialSecret??"").length<16)
  fail("PROVIDER_READ_CREDENTIAL_MISSING");
 const json=async(url,kind,headers)=>{
  await governor.reserve(kind);
  let res;
  try{res=await fetchImpl(url,{method:"GET",redirect:"error",cache:"no-store",
    headers,signal:AbortSignal.timeout(12000)})}
  catch{fail("PROVIDER_UNAVAILABLE")}
  if(res.status!==200||res.redirected)fail("PROVIDER_RESPONSE_INVALID");
  let data;try{data=await res.json()}catch{fail("PROVIDER_JSON_INVALID")}
  return data;
 };
 const auth=await json("https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
  "NATIVE_AUTH",{Authorization:"Basic "+Buffer.from(
   credentialId+":"+credentialSecret).toString("base64")});
 const storage=auth?.apiInfo?.storageApi;
 if(typeof auth.authorizationToken!=="string"||
    typeof auth.accountId!=="string"||
    !/^[a-zA-Z0-9_-]{6,128}$/u.test(auth.accountId)||
    !Array.isArray(storage?.allowed?.capabilities)||
    !storage.allowed.capabilities.includes("listBuckets"))
  fail("READ_BUCKET_LIFECYCLE_CAPABILITY_MISSING");
 const api=String(storage.apiUrl??"");
 if(!/^https:\/\/api\d+\.backblazeb2\.com$/u.test(api))
  fail("STORAGE_API_ORIGIN_INVALID");
 const url=new URL(api+"/b2api/v4/b2_list_buckets");
 url.searchParams.set("accountId",auth.accountId);
 url.searchParams.set("bucketName","geomacro-private-archive");
 const list=await json(url.href,"GET",{Authorization:auth.authorizationToken});
 const buckets=list?.buckets;
 if(!Array.isArray(buckets))fail("BUCKET_LIST_UNVERIFIED");
 const selected=buckets.filter(b=>b.bucketName==="geomacro-private-archive");
 if(selected.length!==1)fail("EXACT_BUCKET_NOT_VERIFIED");
 return selected[0].lifecycleRules;
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
 return assertPhase2hB2ManualRetention(await readPrivateB2LifecycleRules(args));
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
