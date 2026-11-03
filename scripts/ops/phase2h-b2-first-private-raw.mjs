/**
 * B2-FIRST 15-minute registered original metadata: gzip -> governed private
 * S3 PUT -> independent full GET/SHA -> D1 source write -> same-ID D1 B2 ACK.
 * A B2 denial never invents an archive receipt or blocks existing canonical
 * D1 pending/backlog recovery. No article HTML, customer output or signing.
 */
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {verifyPhase2hB2Lifecycle} from "./phase2h-verify-b2-72h-lifecycle.mjs";
import {buildPhase2hRawB2Plan,verifyPhase2hRawB2Restore}
 from "./phase2h-archive-private-raw-news.mjs";

const SOURCE_MAX=150;
const PREFIX="geomacro-evidence/v1/private/phase2h-raw-news/";
const safeFailure=code=>{throw Error("PHASE2H_B2_FIRST_"+code)};
export function assertB2FirstSourceEnv(env=process.env){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="registered_original_archive"||
    env.B2_REQUEST_BUDGET!=="12"||
    env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !/^[a-f0-9-]{36}$/iu.test(env.D1_DATABASE_ID??"")||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.B2_KEY_ID??"").length<12||
    (env.B2_APPLICATION_KEY??"").length<16)
  safeFailure("PROTECTED_QUOTA_CONFIG_REQUIRED");
 return true;
}
export async function stageB2FirstPrivateOriginals({
 rows,now=new Date(),env=process.env,fetchImpl=fetch,
 b2Factory=createB2Client,governorFactory=createB2D1AccountGovernor,
 lifecycleVerifier=verifyPhase2hB2Lifecycle,
}={}){
 if(!Array.isArray(rows)||rows.length>SOURCE_MAX||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
  safeFailure("SOURCE_BATCH_INVALID");
 if(rows.length===0)return Object.freeze({
  status:"NO_SELECTED_ORIGINALS",storage_confirmed:false,rows:[],
 });
 assertB2FirstSourceEnv(env);
 const governor=governorFactory({env,fetchImpl});
 const quota=await governor.status();
 const used=quota?.used,limit=quota?.limits;
 // Request cap: lifecycle check + S3 PUT + 2 actual full-body GETs,
 // with headroom for authorized native read fallback.
 if(quota?.ok!==true||!used||!limit||
    used.total>limit.total-12||used.GET>limit.GET-6||
    used.PUT>limit.PUT-2||used.NATIVE_AUTH>limit.NATIVE_AUTH-3)
  return Object.freeze({status:"B2_SHARED_ACCOUNT_HEADROOM_HELD",
   storage_confirmed:false,rows:[]});
 let lifecycle;
 try{lifecycle=await lifecycleVerifier({env,fetchImpl,governor})}
 catch(error){
  const reason=String(error?.message??"");
  // Preserve the verifier's finite redacted provider enum, never any raw
  // HTTP body, auth token, key, bucket metadata or publisher title.
  const expected=/^PHASE2H_B2_72H_(?:PROTECTED_GOVERNED_MAIN_REQUIRED|PROVIDER_UNAVAILABLE|PROVIDER_RESPONSE_INVALID|PROVIDER_JSON_INVALID|READ_BUCKET_LIFECYCLE_CAPABILITY_MISSING|STORAGE_API_ORIGIN_INVALID|BUCKET_LIST_UNVERIFIED|EXACT_BUCKET_NOT_VERIFIED|AUTOMATIC_DELETION_STILL_ENABLED|ARCHIVE_READ_PAIR_INCOMPLETE|PROVIDER_READ_CREDENTIAL_MISSING)$/u;
  if(expected.test(reason))safeFailure(reason.slice("PHASE2H_B2_72H_".length));
  safeFailure("PROVIDER_LIFECYCLE_UNVERIFIED");
 }
 if(lifecycle?.phase2h_raw_prefix_verified!==true||
    lifecycle?.auto_deletion_paused!==true||
    lifecycle?.no_bucket_mutation!==true)
  safeFailure("PROVIDER_LIFECYCLE_NOT_ACCEPTED");
 const plan=buildPhase2hRawB2Plan(rows,now);
 if(!plan.key.startsWith(PREFIX))safeFailure("OBJECT_PREFIX_INVALID");
 const b2=b2Factory({
  endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",
  accessKey:env.B2_KEY_ID,secretKey:env.B2_APPLICATION_KEY,
  readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY,
 });
 let first,second;
 try{
  first=await b2.putWithMetadataVerification(plan.key,plan.compressed,{
    verifyRestored:data=>verifyPhase2hRawB2Restore(Buffer.from(data),plan),
  });
  second=await b2.get(plan.key);
  verifyPhase2hRawB2Restore(Buffer.from(second),plan);
 }catch{safeFailure("PUT_OR_FULL_READBACK_UNVERIFIED")}
 if(first?.full_body_readback_verified!==true||
    first.sha256!==plan.compressed_sha256||
    first.bytes!==plan.compressed.length)
  safeFailure("SHA256_READBACK_MISMATCH");
 return Object.freeze({
  schema:"geomacro.phase2h.b2-first-selected-originals.v1",
  status:"B2_FIRST_GZIP_PUT_TWO_GET_SHA256_VERIFIED",
  storage_confirmed:true,object_sha256:plan.compressed_sha256,
  object_key:plan.key,rows:plan.rows,record_count:plan.record_count,
  b2_readback_sha256_verified:true,original_publisher_clock_preserved:true,
  d1_receipt_pending:true,paid_eligible:false,rights_verified:false,
 });
}
/** D1 exact-record ack only if all selected originals were newly and
 * immutably written; already retained projector versions may have a
 * different raw SHA, and must be archived by canonical recovery instead.
 */
export async function acknowledgeB2FirstD1({
 receipt,postResult,endpoint,token,fetchImpl=fetch,
}={}){
 if(receipt?.storage_confirmed!==true)return {
  status:"B2_FIRST_NOT_VERIFIED_D1_ARCHIVE_PENDING",archived:0};
 if(!Array.isArray(receipt.rows)||!Number.isSafeInteger(receipt.record_count)||
    receipt.record_count!==receipt.rows.length||receipt.record_count>SOURCE_MAX)
  safeFailure("ACK_INVALID_BATCH");
 if(postResult?.readback_verified!==true||
    postResult?.verified_originals!==receipt.record_count||
    postResult?.stored+postResult?.duplicate!==receipt.record_count||
    postResult?.rejected_conflicts!==0){
  return {status:"B2_FIRST_D1_HISTORIC_IDENTITY_NEEDS_RECOVERY",
    archived:0,deferred:receipt.record_count,storage_confirmed:true,
    all_selected_originals_archived:false};
 }
 if(endpoint!=="https://geomacro-control-plane.daspallab202391.workers.dev"||
    typeof token!=="string"||token.length<32)
  safeFailure("ACK_AUTH_REQUIRED");
 let archived=0,deferred=0;
 // Every original was independently D1-readback-verified by the canonical
 // writer. A prior duplicate may still have a different immutable projector
 // hash or an existing B2 ACK. Isolate exactly that ID, never block the other
 // freshly inserted originals in the same verified gzip object.
 // The Worker accepts up to 100 IDs in one verified D1 UPDATE/readback.
 // Reserve bounded isolation attempts for genuine immutable ACK conflicts.
 // Success: 50 originals per HTTP/D1 batch rather than one request per row.
 let attempts=0;
 const send=async group=>{
  if(++attempts>24){deferred+=group.length;return}
  let response=null,data=null;
  try{
   response=await fetchImpl(endpoint+"/v1/internal/phase2h-raw-news",{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({
     schema:"geomacro.phase2h.b2-archive-ack.v1",
     object_sha256:receipt.object_sha256,
     items:group.map(row=>({record_id:row.record_id,raw_sha256:row.raw_sha256})),
    }),signal:AbortSignal.timeout(15000),
   });
   data=await response.json();
  }catch{/* retry only a smaller independently verified cohort */}
  if(response?.status===200&&data?.ok===true&&
     data.archived===group.length&&
     data.independent_d1_archive_ack_verified===true&&
     data.rights_verified===false&&data.payments===0){
    archived+=group.length;return;
  }
  if(group.length===1||response?.status===401||response?.status===403||
     response?.status===429){deferred+=group.length;return;}
  const middle=Math.floor(group.length/2);
  await send(group.slice(0,middle));
  await send(group.slice(middle));
 };
 for(let i=0;i<receipt.rows.length;i+=50)
  await send(receipt.rows.slice(i,i+50));
 if(archived+deferred!==receipt.record_count)
  safeFailure("D1_ARCHIVE_ACK_COUNT_MISMATCH");
 return {
  schema:"geomacro.phase2h.b2-first-d1-ack.v1",
  status:archived===receipt.record_count?
   "B2_FIRST_AND_CANONICAL_D1_FULL_READBACK_ACCEPTED":
   archived>0?"B2_FIRST_PARTIAL_D1_ACK_VERIFIED":
   "B2_FIRST_D1_ACK_ALL_DEFERRED_FOR_RECOVERY",
  archived,deferred,
  b2_verified:archived>0,d1_ack_verified:archived>0,
  all_selected_originals_archived:deferred===0,
  paid_eligible:false,commercial_rights_verified:false,
 };
}
