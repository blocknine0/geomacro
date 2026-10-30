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
 const hide=Math.min(...covered.map(r=>r.daysFromUploadingToHiding)
  .filter(Number.isSafeInteger));
 const erase=Math.min(...covered.map(r=>r.daysFromHidingToDeleting)
  .filter(Number.isSafeInteger));
 if(hide!==1||erase!==1)fail("THREE_DAY_EXPIRY_NOT_PROVEN");
 return Object.freeze({schema:"geomacro.phase2h.b2-72h-lifecycle.v1",
  phase2h_raw_prefix_verified:true,max_days_to_hide:1,max_days_after_hide:1,
  deletion_within_three_days_provider_rule:true,
  previous_b2_object_versions_independently_deleted:false,
  no_bucket_mutation:true,other_b2_prefixes_untouched:true});
}
export async function verifyPhase2hB2Lifecycle({
 env=process.env,fetchImpl=fetch,
 governor=createB2D1AccountGovernor({env,fetchImpl}),
}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="derived_news_backup"||
    typeof env.B2_KEY_ID!=="string"||env.B2_KEY_ID.length<12||
    typeof env.B2_APPLICATION_KEY!=="string"||env.B2_APPLICATION_KEY.length<16)
  fail("PROTECTED_GOVERNED_MAIN_REQUIRED");
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
   env.B2_KEY_ID+":"+env.B2_APPLICATION_KEY).toString("base64")});
 const storage=auth?.apiInfo?.storageApi;
 if(typeof auth.authorizationToken!=="string"||
    !/^[a-f0-9]{16,64}$/u.test(auth.accountId??"")||
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
 return assertPhase2hB2Lifecycle(selected[0].lifecycleRules);
}
if(process.argv[1]?.endsWith("/phase2h-verify-b2-72h-lifecycle.mjs")){
 try{console.log(JSON.stringify(await verifyPhase2hB2Lifecycle()))}
 catch(e){const m=String(e?.message??"");
  console.error(/^PHASE2H_B2_72H_[A-Z_]+$/u.test(m)?m:
   "PHASE2H_B2_72H_PROVIDER_PROOF_UNAVAILABLE");process.exitCode=2}
}
