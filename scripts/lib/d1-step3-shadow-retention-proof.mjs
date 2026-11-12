/**
 * Strict retention-aware PHYSICAL readback for isolated Stage2 Shadow only.
 * An expired (72h) private pointer MUST NOT be "proved" by a live HTTP 200:
 * the deployed Worker intentionally returns 410 after expiry. For each expired
 * pointer, require authenticated HTTP 410 AND full HMAC/private R2 byte proof.
 * Every in-retention pointer still requires the unchanged Worker 200 +
 * exact authenticated HMAC + SHA256 record-byte verification AND an
 * independent direct private-R2 GET of the same signed object bytes.
 * No source, pointer, or signed digest may be substituted or skipped.
 *
 * No row skipped/deleted, no production DB write, no B2 listing or receipt,
 * no commercial signing or hold-clearance. Caller separately proves a fresh
 * genuine B2-ACK original, dual Workers and the Step3 migration ledger.
 */
import {createHash} from "node:crypto";
import {assertRealPointerMac,inspectPointerProofCount,
 verifyRealPhase2hPointerRows} from "./d1-step3-crypto-proof.mjs";
import {shadowR2ObjectUrl,shadowR2Request}
 from "./d1-step3-shadow-pointer-seed.mjs";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const HOST="geomacro-step3-shadow.daspallab202391.workers.dev";
const BUCKET="geomacro-step3-shadow-private";
const HEX=/^[a-f0-9]{64}$/u;
const ISO=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const sha=x=>createHash("sha256").update(x).digest("hex");
const fail=x=>{throw Error("STEP3_SHADOW_RETENTION_"+x)};
export function classifyShadowPointerRetention(row,now=Date.now()){
 const date=row?.first_ingested_at;
 if(!Number.isFinite(now)||!ISO.test(date??"")||
    !Number.isFinite(Date.parse(date))||
    new Date(date).toISOString()!==date||
    Date.parse(date)>now+60000)
  fail("CLOCK_OR_POINTER_INVALID");
 return Date.parse(date)>now-72*3600000?"ACTIVE":"EXPIRED";
}
export function requireExactShadowRetentionScope(env){
 if(env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    env.D1_DATABASE_ID!==PROD||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
    env.GEOMACRO_STEP3_VERIFIED_WORKER_HOST!==HOST||
    env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==HOST||
    env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==BUCKET||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.CONTROL_PLANE_TOKEN??"").length<32||
    !HEX.test(env.PHASE2H_R2_REFERENCE_HMAC_KEY??""))
  fail("EXACT_SHADOW_NOT_PROVIDER_VERIFIED");
 return true;
}
async function requireExpiredWorker410(row,env,fetchImpl,sleepImpl){
 const url="https://"+HOST+
  "/v1/internal/phase2h-raw-object-ref?record_id="+row.record_id;
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{response=await fetchImpl(url,{method:"GET",redirect:"error",
   cache:"no-store",headers:{Authorization:"Bearer "+env.CONTROL_PLANE_TOKEN,
    "Cache-Control":"no-store"},signal:AbortSignal.timeout(12000)})}
  catch{
   if(attempt===2)fail("EXPIRED_WORKER_TRANSPORT_NOT_VERIFIED");
   await sleepImpl(250*(attempt+1));continue;
  }
  if(response?.redirected)fail("EXPIRED_WORKER_REDIRECT_REJECTED");
  if(response?.status===410)return true;
  if(![429,500,502,503,504].includes(response?.status)||attempt===2)
   fail("EXPIRED_WORKER_EXPECTED_410_GOT_"+(
    Number.isSafeInteger(response?.status)&&response.status>=100&&
    response.status<=599?response.status:"UNKNOWN"));
  await sleepImpl(250*(attempt+1));
 }
 fail("EXPIRED_WORKER_410_NOT_VERIFIED");
}
async function verifyPhysicalShadowR2(row,env,fetchImpl,scope){
 if(scope!=="ACTIVE"&&scope!=="EXPIRED")fail("R2_SCOPE_INVALID");
 const failPhysical=code=>fail(scope+"_"+code);
 // A non-live row is not a bypass: it must still have a genuine pointer
 // signature and an exact immutable object/record byte readback.
 assertRealPointerMac(row,env.PHASE2H_R2_REFERENCE_HMAC_KEY);
 const url=shadowR2ObjectUrl(ACCOUNT,BUCKET,row.object_key);
 const response=await shadowR2Request(url,env,"GET",fetchImpl);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<300||bytes.length>600000||
    bytes.length!==row.bundle_bytes||sha(bytes)!==row.object_sha256)
  failPhysical("R2_BUNDLE_BYTES_OR_SHA_INVALID");
 let bundle;try{bundle=JSON.parse(bytes.toString("utf8"))}
 catch{failPhysical("R2_BUNDLE_JSON_INVALID")}
 if(bundle?.schema!=="geomacro.phase2h.r2-private-reference-bundle.v1"||
    !Array.isArray(bundle.records)||bundle.records.length<1||
    bundle.records.length>50||bundle.records.some(x=>typeof x!=="string")||
    row.bundle_index>=bundle.records.length)
  failPhysical("R2_MANIFEST_INVALID");
 const raw=bundle.records[row.bundle_index];
 if(Buffer.byteLength(raw)!==row.record_bytes||sha(raw)!==row.record_sha256)
  failPhysical("R2_EXACT_RECORD_SHA_INVALID");
 let record;try{record=JSON.parse(raw)}catch{failPhysical("RECORD_JSON_INVALID")}
 if(record?.schema!=="geomacro.phase2h.private-raw-observation.v1"||
    record.record_id!==row.record_id||
    record.category!==row.category||
    record.raw_sha256!==row.raw_sha256||
    record.ingested_at!==row.first_ingested_at||
    record.original?.original_published_at!==row.original_published_at)
  failPhysical("R2_CANONICAL_IDENTITY_INVALID");
 return true;
}
export async function verifyShadowRetentionBoundPointers({
 rows,env=process.env,now=Date.now(),fetchImpl=fetch,
 sleepImpl=ms=>new Promise(done=>setTimeout(done,ms))
}={}){
 requireExactShadowRetentionScope(env);
 const empty=inspectPointerProofCount(rows);
 if(empty)fail("NO_REAL_POINTERS");
 const active=[],expired=[];
 for(const row of rows){
  const state=classifyShadowPointerRetention(row,now);
  (state==="ACTIVE"?active:expired).push(row);
 }
 if(active.length===0)fail("NO_CURRENT_AUTHENTICATED_POINTER");
 const current=await verifyRealPhase2hPointerRows({
  rows:active,env,fetchImpl,sleepImpl});
 if(current.cryptographic_readback_verified!==true||
    current.verified_count!==active.length)
  fail("ACTIVE_WORKER_HMAC_R2_PROOF_MISSING");
 // Worker attestations are necessary, but a separate provider R2 GET
 // is required as well for every CURRENT pointer (not only expired ones).
 // Fail closed on wrong object bytes, missing object, or invalid identity.
 for(const row of active){
  await verifyPhysicalShadowR2(row,env,fetchImpl,"ACTIVE");
 }
 for(const row of expired){
  // Validate the actual signed pointer BEFORE any external request.
  assertRealPointerMac(row,env.PHASE2H_R2_REFERENCE_HMAC_KEY);
  // A 410 is expected ONLY beyond the immutable 72h first-ingested clock;
  // 401/403/404/500/redirect are HOLD, never accepted as expiry.
  await requireExpiredWorker410(row,env,fetchImpl,sleepImpl);
  await verifyPhysicalShadowR2(row,env,fetchImpl,"EXPIRED");
 }
 return Object.freeze({
  status:"PASS_REAL_SHADOW_ACTIVE_200_EXPIRED_410_R2_HMAC_READBACK",
  verified_count:rows.length,active_worker_200_verified:active.length,
  expired_worker_410_and_physical_r2_verified:expired.length,
  authenticated_active_r2_gets:active.length,
  authenticated_expired_r2_gets:expired.length,
  independent_full_object_r2_gets:rows.length,
  all_pointers_independent_full_r2_byte_readback_verified:true,
  cryptographic_readback_verified:true,
  all_hmac_and_r2_bytes_verified:true,
  historical_original_rights_not_inferred:true,
  b2_physical_parity:"NOT_YET_VERIFIED",
  signed_gro_verified:false,paid_delivery_authorized:false,
  all_step3_acceptance_proven:false,
  production_d1_mutations:0,shadow_d1_mutations:0,
  no_b2_requests:true,no_funds:true
 });
}
