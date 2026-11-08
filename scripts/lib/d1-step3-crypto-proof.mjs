/**
 * Exact Phase2H Worker pointer-MAC v1 verifier (not a fabricated B2 ACK).
 * The source of truth for the envelope is the Worker module
 * workers/control-plane/src/phase2h-raw-object-refs.mjs.
 * Requires the *real* PHASE2H_R2_REFERENCE_HMAC_KEY and CONTROL_PLANE_TOKEN.
 */
import {createHmac,createHash,timingSafeEqual} from "node:crypto";
const HEX=/^[a-f0-9]{64}$/u;
const ID=/^[a-f0-9]{64}$/u;
const sha=x=>createHash("sha256").update(x).digest("hex");
const fail=why=>{throw Error("STEP3_POINTER_"+why)};
const fields=[
 "record_id","category","original_published_at","first_ingested_at",
 "raw_sha256","object_sha256","object_key","bundle_bytes",
 "record_sha256","record_bytes","bundle_index","signed_at",
 "pointer_hmac_sha256","risk_country_iso3","storage_backend"
];
const PREFIX="geomacro/private/phase2h/ref-only/v1/";
export function pointerEnvelope(row){
 if(!row||fields.some(k=>!Object.hasOwn(row,k))||
    !ID.test(row.record_id)||!HEX.test(row.raw_sha256)||
    !HEX.test(row.object_sha256)||!HEX.test(row.record_sha256)||
    !HEX.test(row.pointer_hmac_sha256)||
    row.storage_backend!=="private_r2"||
    row.object_key!==PREFIX+row.object_sha256+".json"||
    !Number.isSafeInteger(row.bundle_index)||row.bundle_index<0||row.bundle_index>49)
  fail("POINTER_FIELDS_INVALID");
 return JSON.stringify(["geomacro.phase2h.raw-object-pointer.v1",
  row.record_id,row.category,row.original_published_at,row.first_ingested_at,
  row.raw_sha256,row.object_sha256,row.object_key,row.bundle_bytes,
  row.record_sha256,row.record_bytes,row.bundle_index,row.signed_at,
  row.risk_country_iso3,row.storage_backend]);
}
export function assertRealPointerMac(row,hexKey){
 if(!HEX.test(hexKey??""))fail("REAL_SIGNING_KEY_MISSING");
 const expected=createHmac("sha256",Buffer.from(hexKey,"hex"))
  .update(pointerEnvelope(row)).digest("hex");
 const left=Buffer.from(row.pointer_hmac_sha256,"hex");
 const right=Buffer.from(expected,"hex");
 if(left.length!==right.length||!timingSafeEqual(left,right))
  fail("HMAC_SHA256_REJECTED");
 return true;
}
export function inspectPointerProofCount(rows){
 if(!Array.isArray(rows)||rows.length>10)fail("POINTER_PROOF_PAGE_INVALID");
 return rows.length===0?Object.freeze({
  status:"NOT_YET_VERIFIED",reason:"NO_REAL_R2_POINTER_ROWS",
  real_provider_pointer_count:0,cryptographic_readback_verified:false
 }):null;
}
export async function verifyRealPhase2hPointerRows({
 rows,env=process.env,fetchImpl=fetch
}={}){
 const absent=inspectPointerProofCount(rows);
 if(absent)return absent;
 const host=env.GEOMACRO_STEP3_VERIFIED_WORKER_HOST;
 if(typeof host!=="string"||!/^(?:api\.geomacro\.live|geomacro-control-plane\.[a-z0-9-]+\.workers\.dev)$/u.test(host)||
    typeof env.CONTROL_PLANE_TOKEN!=="string"||
    env.CONTROL_PLANE_TOKEN.length<32||
    !HEX.test(env.PHASE2H_R2_REFERENCE_HMAC_KEY??""))
  fail("AUTH_OR_WORKER_IDENTITY_NOT_PROVEN");
 let tested=0;
 for(const row of rows){
  assertRealPointerMac(row,env.PHASE2H_R2_REFERENCE_HMAC_KEY);
  const url="https://"+host+"/v1/internal/phase2h-raw-object-ref?record_id="+row.record_id;
  let response;
  try{response=await fetchImpl(url,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{"Authorization":"Bearer "+env.CONTROL_PLANE_TOKEN,
    "Cache-Control":"no-store"},
   signal:AbortSignal.timeout(12000)
  })}catch{fail("WORKER_RETRIEVAL_UNAVAILABLE")}
  if(response?.status!==200||response.redirected)
   fail("AUTHENTICATED_WORKER_RETRIEVAL_REJECTED");
  let data;try{data=await response.json()}catch{fail("WORKER_RESPONSE_INVALID")}
  if(data?.ok!==true||
     data.schema!=="geomacro.phase2h.private-r2-reference-readback.v1"||
     data.pointer_and_object_verified!==true||
     data.legacy_fallback!==false||data.paid_eligible!==false||
     data.b2_archive_verified!==false||
     data.record?.record_id!==row.record_id||
     data.record?.raw_sha256!==row.raw_sha256||
     data.record?.category!==row.category||
     data.record?.ingested_at!==row.first_ingested_at||
     data.record?.original?.original_published_at!==row.original_published_at)
   fail("WORKER_R2_SHA_AND_METADATA_MISMATCH");
  const raw=JSON.stringify(data.record);
  if(Buffer.byteLength(raw)!==row.record_bytes||
     sha(raw)!==row.record_sha256)
   fail("WORKER_RETURNED_RECORD_BYTES_MISMATCH");
  tested++;
 }
 // Worker intentionally DOES NOT certify independent B2 archival here.
 // R2 is only a staging lane. Do not promote this partial proof as Step3 PASS.
 return Object.freeze({
  status:"PASS_REAL_WORKER_HMAC_R2_POINTER_BYTES_ONLY",
  verified_count:tested,cryptographic_readback_verified:true,
  b2_physical_parity:"NOT_YET_VERIFIED",
  signed_gro_verified:false,paid_delivery_authorized:false,
  all_step3_acceptance_proven:false
 });
}
