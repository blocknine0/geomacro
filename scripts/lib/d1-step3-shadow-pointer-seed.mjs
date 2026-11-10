/**
 * SHADOW ONLY: create a real Phase2H HMAC pointer from one genuinely
 * validated B2-ACKNOWLEDGED shadow legacy row. Never generate fake news,
 * infer an independent B2 physical readback, or write production D1.
 * R2 is first PUT then byte-for-byte GET before any pointer INSERT.
 */
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {validPrivateRawNews}
 from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
import {assertRealPointerMac,pointerEnvelope}
 from "./d1-step3-crypto-proof.mjs";
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const DATE=/^20\d\d-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{3})?Z)?$/u;
const ISO=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const BUCKET=/^[a-z0-9][a-z0-9-]{2,62}$/u;
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const fail=s=>{throw Error("STEP3_SHADOW_SEED_"+s)};
const hash=b=>createHash("sha256").update(b).digest("hex");
function same(a,b){
 return Buffer.byteLength(a)===Buffer.byteLength(b)&&
  timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
// R2 REST API requires literal slashes inside path-like object keys.
export function shadowR2ObjectUrl(account,bucket,key){
 return "https://api.cloudflare.com/client/v4/accounts/"+account+
  "/r2/buckets/"+bucket+"/objects/"+key.split("/").map(encodeURIComponent).join("/");
}
// Fail closed with a non-secret HTTP status + numeric provider error code.
// Never emit response bodies, auth headers, original bytes, or Cloudflare messages.
export async function shadowR2Request(url,env,method,fetchImpl,body){
 if(method!=="PUT"&&method!=="GET")fail("R2_METHOD_UNSUPPORTED");
 // Identical to the physically proven recovery-checkpoint R2 PUT: the
 // REST object endpoint receives the exact bytes, not multipart FormData.
 if(method==="PUT"&&(!Buffer.isBuffer(body)||body.length<1||
    body.length>600000))fail("R2_PUT_BODY_INVALID");
 if(method==="GET"&&body!==undefined)fail("R2_GET_BODY_INVALID");
 // A verified existing Shadow pointer is immutable: retry ONLY a transient
 // R2 GET transport failure (including fetch timeout), never an HTTP auth
 // failure or a PUT whose provider acknowledgement is unknown.
 // Every attempt re-GETs the same signed object key and still requires
 // independent full-body SHA-256 + byte equality before any PASS.
 let res;
 for(let attempt=0;attempt<(method==="GET"?3:1);attempt++){
  try{
   res=await fetchImpl(url,{
    method,redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
     "Cache-Control":"no-store",
     ...(method==="PUT"?{"Content-Type":"application/octet-stream"}:{})},
    ...(method==="PUT"?{body}:{}),signal:AbortSignal.timeout(20000)
   });
   break;
  }catch{
   if(method!=="GET"||attempt===2)fail("R2_PROVIDER_UNAVAILABLE");
   // Strict bounded backoff: at most 3 GETs, 0 GET response rewrites,
   // no authorization bypass, no credential or response body in logs.
   await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
  }
 }
 if(!res||res.redirected)fail("R2_PROVIDER_UNAVAILABLE");
 if(!Number.isSafeInteger(res.status)||res.status<200||res.status>=300){
  let cloudflareCode="UNKNOWN";
  try{
   const err=await res.json();
   const raw=err?.errors?.[0]?.code??err?.code;
   const numeric=typeof raw==="string"&&/^\d{1,6}$/u.test(raw)?
    Number(raw):raw;
   if(Number.isSafeInteger(numeric)&&numeric>=0&&numeric<=999999)
    cloudflareCode=String(numeric);
  }catch{/* Cloudflare may return HTML; do not print bodies. */}
  const status=Number.isSafeInteger(res.status)&&res.status>=100&&
   res.status<=599?String(res.status):"UNKNOWN";
  fail("R2_"+method+"_HTTP_"+status+"_CF_"+cloudflareCode);
 }
 if(method==="PUT"){
  let ack;
  try{ack=await res.json()}catch{fail("R2_PUT_ACK_UNREADABLE")}
  if(ack?.success!==true||!ack.result||typeof ack.result!=="object")
   fail("R2_PUT_ACK_INVALID");
  const key=decodeURIComponent(new URL(url).pathname.split("/objects/")[1]??"");
  if(ack.result.key!==undefined&&ack.result.key!==key)
   fail("R2_PUT_ACK_KEY_MISMATCH");
  if(ack.result.size!==undefined&&
     Number(ack.result.size)!==body?.byteLength)
   fail("R2_PUT_ACK_SIZE_MISMATCH");
 }
 return res;
}
/**
 * Read-only physical idempotency proof for an ALREADY persisted Shadow D1
 * pointer. Only invoke after original B2-ACK source validation.
 * No new D1 INSERT, no R2 PUT and never a B2 parity claim.
 */
export async function verifyExistingShadowArchivedPointer({
 row,pointer,env=process.env,fetchImpl=fetch,now=Date.now()
}={}){
 if(!row||!pointer||!SHA.test(row.record_id??"")||
    typeof row.raw_json!=="string"||
    !SHA.test(row.raw_sha256??"")||
    !SHA.test(row.b2_object_sha256??"")||
    !Number.isFinite(now)||
    !SHA.test(env.PHASE2H_R2_REFERENCE_HMAC_KEY??"")||
    !BUCKET.test(env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET??"")||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??""))
  fail("EXISTING_POINTER_PREREQUISITES_INVALID");
 const bundle=Buffer.from(JSON.stringify({
  schema:"geomacro.phase2h.r2-private-reference-bundle.v1",
  records:[row.raw_json]
 }),"utf8");
 if(bundle.length<1||bundle.length>600000)
  fail("EXISTING_POINTER_BUNDLE_SIZE_INVALID");
 const objectSha=hash(bundle);
 const objectKey="geomacro/private/phase2h/ref-only/v1/"+
  objectSha+".json";
 const signedAt=Date.parse(pointer.signed_at??"");
 if(pointer.record_id!==row.record_id||
    pointer.category!==row.category||
    pointer.original_published_at!==row.original_published_at||
    pointer.first_ingested_at!==row.first_ingested_at||
    pointer.raw_sha256!==row.raw_sha256||
    pointer.object_sha256!==objectSha||
    pointer.object_key!==objectKey||
    pointer.bundle_bytes!==bundle.length||
    pointer.record_sha256!==hash(row.raw_json)||
    pointer.record_bytes!==Buffer.byteLength(row.raw_json)||
    pointer.bundle_index!==0||
    pointer.storage_backend!=="private_r2"||
    pointer.risk_country_iso3!==row.risk_country_iso3||
    !ISO.test(pointer.signed_at??"")||
    !Number.isFinite(signedAt)||signedAt>now+60_000||
    signedAt<Date.parse(row.first_ingested_at??""))
  fail("EXISTING_POINTER_IMMUTABLE_OR_METADATA_MISMATCH");
 try{assertRealPointerMac(pointer,env.PHASE2H_R2_REFERENCE_HMAC_KEY)}
 catch{fail("EXISTING_POINTER_HMAC_INVALID")}
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,
  env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,objectKey);
 const response=await shadowR2Request(url,env,"GET",fetchImpl);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length!==bundle.length||hash(bytes)!==objectSha||
    !same(bytes,bundle))
  fail("EXISTING_POINTER_R2_PHYSICAL_BYTE_READBACK_MISMATCH");
 return Object.freeze({
  status:"PASS_REAL_SHADOW_ARCHIVED_ORIGINAL_POINTER_STAGING_ONLY",
  reused_existing_pointer:true,r2_puts:0,r2_gets:1,
  d1_pointer_readback_verified:true,
  r2_object_byte_length:bundle.length,
  object_sha256:objectSha,
  original_record_id_sha256:hash(row.record_id),
  pointer_hmac_sha256_sha256:hash(pointer.pointer_hmac_sha256),
  b2_provider_byte_readback:"NOT_YET_VERIFIED",
  production_d1_mutated:false,paid_delivery_authorized:false
 });
}

export async function seedShadowArchivedPointer({
 env=process.env,readD1,writeD1,fetchImpl=fetch,now=Date.now()
}={}){
 if(env.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
    env.GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED!=="YES"||
    !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()===
     (env.D1_DATABASE_ID??"").toLowerCase()||
    !BUCKET.test(env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET??"")||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20||
    !SHA.test(env.PHASE2H_R2_REFERENCE_HMAC_KEY??"")||
    typeof readD1!=="function"||typeof writeD1!=="function"||
    !Number.isFinite(now))
  fail("SHADOW_ISOLATION_OR_CREDENTIAL_UNVERIFIED");
 const source=await readD1(
  "SELECT record_id,category,original_published_at,first_ingested_at,"+
  "raw_sha256,raw_json,b2_object_sha256,b2_archived_at,risk_country_iso3 "+
  "FROM phase2h_private_raw_news "+
  "WHERE b2_object_sha256 IS NOT NULL AND b2_archived_at IS NOT NULL "+
  "AND first_ingested_at >= '"+new Date(now-70*3600_000).toISOString()+"' "+
  "ORDER BY first_ingested_at DESC,record_id DESC LIMIT 1");
 if(!Array.isArray(source)||source.length>1)fail("REAL_SOURCE_READ_INVALID");
 if(!source.length)return {status:"NOT_YET_VERIFIED",
  code:"NO_REAL_B2_ACKNOWLEDGED_SHADOW_RECORD",r2_puts:0};
 const row=source[0];
 if(!SHA.test(row.record_id??"")||!SHA.test(row.raw_sha256??"")||
    !SHA.test(row.b2_object_sha256??"")||!CATS.has(row.category)||
    !DATE.test(row.original_published_at??"")||
    !ISO.test(row.first_ingested_at??"")||
    !ISO.test(row.b2_archived_at??"")||
    !(row.risk_country_iso3===null||
      /^[A-Z]{3}$/u.test(row.risk_country_iso3))||
    typeof row.raw_json!=="string"||
    Buffer.byteLength(row.raw_json)<300||
    Buffer.byteLength(row.raw_json)>12000)
  fail("ARCHIVED_SOURCE_IDENTITY_INVALID");
 let record;
 try{record=JSON.parse(row.raw_json)}
 catch{fail("SOURCE_RAW_JSON_INVALID")}
 if(record?.record_id!==row.record_id||
    record.raw_sha256!==row.raw_sha256||
    record.category!==row.category||
    record.original?.original_published_at!==row.original_published_at||
    record.ingested_at!==row.first_ingested_at||
    await validPrivateRawNews(record,now,false)!==row.raw_json)
  fail("SOURCE_ORIGINAL_VALIDATION_FAILED");
 // Duplicate shadow pointer is not silently overwritten: idempotent safety.
 const old=await readD1(
  "SELECT record_id,category,original_published_at,first_ingested_at,"+
  "raw_sha256,object_sha256,object_key,bundle_bytes,record_sha256,"+
  "record_bytes,bundle_index,signed_at,pointer_hmac_sha256,"+
  "risk_country_iso3,storage_backend FROM phase2h_raw_object_refs_v1 "+
  "WHERE record_id='"+row.record_id+"' LIMIT 1");
 if(!Array.isArray(old)||old.length>1)fail("POINTER_BEFORE_READ_INVALID");
 // A legitimate previous rehearsal may already have staged the exact
 // pointer. A duplicate must prove real D1 HMAC and R2 bytes, not abort.
 if(old.length)return verifyExistingShadowArchivedPointer({
  row,pointer:old[0],env,fetchImpl,now
 });
 const bundle=Buffer.from(JSON.stringify({
  schema:"geomacro.phase2h.r2-private-reference-bundle.v1",
  records:[row.raw_json]
 }),"utf8");
 if(bundle.length>600000)fail("BUNDLE_TOO_LARGE");
 const objectSha=hash(bundle);
 const objectKey="geomacro/private/phase2h/ref-only/v1/"+objectSha+".json";
 const bucket=env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET;
 const url=shadowR2ObjectUrl(env.CLOUDFLARE_ACCOUNT_ID,bucket,objectKey);
 await shadowR2Request(url,env,"PUT",fetchImpl,bundle);
 const read=Buffer.from(await (
  await shadowR2Request(url,env,"GET",fetchImpl)).arrayBuffer());
 if(read.length!==bundle.length||hash(read)!==objectSha||!same(read,bundle))
  fail("R2_PHYSICAL_BYTE_READBACK_MISMATCH");
 const signedAt=new Date(now).toISOString();
 const pointer={
  record_id:row.record_id,category:row.category,
  original_published_at:row.original_published_at,
  first_ingested_at:row.first_ingested_at,
  raw_sha256:row.raw_sha256,
  object_sha256:objectSha,object_key:objectKey,
  bundle_bytes:bundle.length,record_sha256:hash(row.raw_json),
  record_bytes:Buffer.byteLength(row.raw_json),
  bundle_index:0,signed_at:signedAt,
  pointer_hmac_sha256:"0".repeat(64),
  risk_country_iso3:row.risk_country_iso3,
  storage_backend:"private_r2"
 };
 pointer.pointer_hmac_sha256=createHmac("sha256",
  Buffer.from(env.PHASE2H_R2_REFERENCE_HMAC_KEY,"hex"))
  .update(pointerEnvelope(pointer)).digest("hex");
 assertRealPointerMac(pointer,env.PHASE2H_R2_REFERENCE_HMAC_KEY);
 // Values are already restricted to fixed enums/hex, ASCII dates, and
 // a deterministic R2 key. Raw article body is NEVER inserted into D1.
 const vals=[
  pointer.record_id,pointer.category,pointer.original_published_at,
  pointer.first_ingested_at,pointer.raw_sha256,pointer.object_sha256,
  pointer.object_key,pointer.bundle_bytes,pointer.record_sha256,
  pointer.record_bytes,pointer.bundle_index,pointer.signed_at,
  pointer.pointer_hmac_sha256,pointer.risk_country_iso3,
  pointer.storage_backend
 ];
 const cols=[
  "record_id","category","original_published_at","first_ingested_at",
  "raw_sha256","object_sha256","object_key","bundle_bytes",
  "record_sha256","record_bytes","bundle_index","signed_at",
  "pointer_hmac_sha256","risk_country_iso3","storage_backend"
 ];
 const sqlVal=x=>x===null?"NULL":typeof x==="number"?String(x):
  "'"+x+"'";
 await writeD1("INSERT INTO phase2h_raw_object_refs_v1 ("+
  cols.join(",")+") VALUES("+vals.map(sqlVal).join(",")+")");
 const proof=await readD1("SELECT record_id,raw_sha256,object_sha256,"+
  "object_key,record_sha256,pointer_hmac_sha256 "+
  "FROM phase2h_raw_object_refs_v1 WHERE record_id='"+
  pointer.record_id+"' LIMIT 1");
 if(!Array.isArray(proof)||proof.length!==1||
    proof[0].record_id!==pointer.record_id||
    proof[0].raw_sha256!==pointer.raw_sha256||
    proof[0].object_sha256!==pointer.object_sha256||
    proof[0].object_key!==pointer.object_key||
    proof[0].record_sha256!==pointer.record_sha256||
    proof[0].pointer_hmac_sha256!==pointer.pointer_hmac_sha256)
  fail("SHADOW_CANONICAL_D1_POINTER_READBACK_INVALID");
 return {
  status:"PASS_REAL_SHADOW_ARCHIVED_ORIGINAL_POINTER_STAGING_ONLY",
  r2_puts:1,r2_gets:1,
  d1_pointer_readback_verified:true,
  r2_object_byte_length:bundle.length,
  object_sha256:objectSha,
  original_record_id_sha256:hash(row.record_id),
  pointer_hmac_sha256_sha256:hash(pointer.pointer_hmac_sha256),
  b2_provider_byte_readback:"NOT_YET_VERIFIED",
  production_d1_mutated:false,paid_delivery_authorized:false
 };
}
