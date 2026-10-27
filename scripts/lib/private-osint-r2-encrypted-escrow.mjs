/**
 * Dedicated private Cloudflare R2 ciphertext-only escrow.
 * Independent from D1 SQL quota and the B2/D1 atomic quota governor.
 * This is NOT the public R2 source-neutral news projection, a canonical D1
 * database, a publisher-original archive, or a paid product.
 *
 * Only authenticated, already-AES-GCM-sealed private observations enter R2.
 * Two R2 operations per accepted cycle: PUT + exact-body GET verification.
 * Keys are SHA-256 content-addressed and scoped to a dedicated PRIVATE bucket.
 */
import {createHash,createHmac} from "node:crypto";
import {unsealPrivateOsintSpool,OSINT_SPOOL_ENVELOPE}
 from "./private-osint-encrypted-spool.mjs";

export const PRIVATE_OSINT_R2_PREFIX="geomacro/private-osint-held/v1";
export const PRIVATE_OSINT_R2_RECEIPT_SCHEMA="geomacro.private-osint-r2-encrypted-escrow-receipt.v1";
const hash=value=>createHash("sha256").update(value).digest("hex");
const hmac=(key,data)=>createHmac("sha256",key).update(data).digest();
const maxBytes=3_500_000;
const keyRe=/^geomacro\/private-osint-held\/v1\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{64}\.json$/u;
const bucketRe=/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u;
const hex32=/^[a-f0-9]{32}$/u;
function fail(s){throw Error("PRIVATE_OSINT_R2_"+s)}
const enc=new TextEncoder();

export function privateOsintR2Config(env){
 const account=env?.CLOUDFLARE_ACCOUNT_ID;
 const bucket=env?.GEOMACRO_PRIVATE_OSINT_R2_BUCKET;
 const access=env?.GEOMACRO_PRIVATE_OSINT_R2_ACCESS_KEY_ID;
 const secret=env?.GEOMACRO_PRIVATE_OSINT_R2_SECRET_ACCESS_KEY;
 if(!hex32.test(account??"")||!bucketRe.test(bucket??"")||
    !bucket.startsWith("geomacro-private-osint-")||
    typeof access!=="string"||access.length<16||access.length>256||
    typeof secret!=="string"||secret.length<32||secret.length>256)
  fail("DEDICATED_BUCKET_OR_SCOPED_CREDENTIALS_REQUIRED");
 return Object.freeze({account,bucket,access,secret});
}
export function privateOsintR2ObjectKey(envelope){
 if(envelope?.schema!==OSINT_SPOOL_ENVELOPE||
    typeof envelope.created_at!=="string"||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(envelope.created_at))
  fail("ENVELOPE_INVALID");
 const bytes=Buffer.from(JSON.stringify(envelope),"utf8");
 if(bytes.length===0||bytes.length>maxBytes)fail("ENVELOPE_OVERSIZE");
 const day=envelope.created_at.slice(0,10).replaceAll("-","/");
 return PRIVATE_OSINT_R2_PREFIX+"/"+day+"/"+hash(bytes)+".json";
}
function sigV4({method,endpoint,bucket,key,access,secret,body,now}){
 if(!keyRe.test(key)||method!=="PUT"&&method!=="GET"||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
  fail("SIGNATURE_INPUT_INVALID");
 const host=new URL(endpoint).host;
 const encoded=[bucket,...key.split("/")].map(encodeURIComponent).join("/");
 const url=endpoint+"/"+encoded;
 const time=now.toISOString().replace(/[-:]|\.\d{3}/gu,"");
 const date=time.slice(0,8);
 const payloadHash=hash(body);
 const canonicalHeaders="host:"+host+"\n"+
   "x-amz-content-sha256:"+payloadHash+"\n"+
   "x-amz-date:"+time+"\n";
 const signedHeaders="host;x-amz-content-sha256;x-amz-date";
 const canonical=[method,"/"+encoded,"",canonicalHeaders,signedHeaders,payloadHash].join("\n");
 const scope=date+"/auto/s3/aws4_request";
 const toSign="AWS4-HMAC-SHA256\n"+time+"\n"+scope+"\n"+hash(canonical);
 const kDate=hmac(Buffer.concat([Buffer.from("AWS4"),Buffer.from(secret)]),date);
 const kRegion=hmac(kDate,"auto"),kService=hmac(kRegion,"s3");
 const signing=hmac(kService,"aws4_request");
 const signature=hmac(signing,toSign).toString("hex");
 return Object.freeze({url,headers:{
  "Authorization":"AWS4-HMAC-SHA256 Credential="+access+"/"+scope+
   ", SignedHeaders="+signedHeaders+", Signature="+signature,
  "x-amz-content-sha256":payloadHash,
  "x-amz-date":time,
  ...(method==="PUT"?{"Content-Type":"application/json","Cache-Control":"no-store"}:{}),
 }});
}
export async function mirrorEncryptedOsintToPrivateR2({
 envelope,root,env=process.env,fetchImpl=fetch,now=new Date(),
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   typeof fetchImpl!=="function")fail("INPUT_INVALID");
 const config=privateOsintR2Config(env);
 // Decrypt only in protected runner memory. It is never sent to R2:
 // validates AEAD, strict publisher-native clocks and same source JSON hash.
 const checked=unsealPrivateOsintSpool(envelope,root,now.getTime());
 if(checked.items.length!==envelope.unverified_observation_count||
    checked.expired!==0||checked.verified_d1!==false||
    checked.shared_source_read.raw_publisher_stored!==false)
  fail("ORIGINAL_CLOCK_OR_PRIVATE_CONTRACT_INVALID");
 const bytes=Buffer.from(JSON.stringify(envelope),"utf8");
 const objectKey=privateOsintR2ObjectKey(envelope);
 const endpoint="https://"+config.account+".r2.cloudflarestorage.com";
 const put=sigV4({method:"PUT",endpoint,...config,key:objectKey,
  body:bytes,now});
 let response;
 try{response=await fetchImpl(put.url,{method:"PUT",redirect:"error",
   headers:put.headers,body:bytes,signal:AbortSignal.timeout(18000)});
 }catch{fail("PUT_UNAVAILABLE")}
 if(![200,201,204].includes(response?.status)||response.redirected)
  fail("PUT_DENIED_OR_QUOTA_LIMIT");
 const get=sigV4({method:"GET",endpoint,...config,key:objectKey,
  body:Buffer.alloc(0),now});
 try{response=await fetchImpl(get.url,{method:"GET",redirect:"error",
   headers:get.headers,signal:AbortSignal.timeout(18000)});
 }catch{fail("READBACK_UNAVAILABLE")}
 if(response?.status!==200||response.redirected)fail("READBACK_NOT_FOUND");
 if(Number(response.headers?.get?.("content-length")??0)>maxBytes)
  fail("READBACK_OVERSIZE");
 let restored;
 try{restored=Buffer.from(await response.arrayBuffer())}
 catch{fail("READBACK_UNAVAILABLE")}
 if(restored.length!==bytes.length||hash(restored)!==hash(bytes))
  fail("READBACK_SHA256_MISMATCH");
 // Do not log, return or expose the source-neutral item payload or token.
 return Object.freeze({
  schema:PRIVATE_OSINT_R2_RECEIPT_SCHEMA,
  private_ciphertext_written_and_readback_verified:true,
  object_key:objectKey,encrypted_sha256:hash(bytes),
  bytes_verified:bytes.length,source_neutral_items:checked.items.length,
  original_source_clock_preserved:true,
  independent_original_page_verification:false,
  d1_canonical_readback_verified:false,
  b2_d1_quota_governor_unchanged:true,
  d1_sql_queries:0,b2_requests:0,kv_requests:0,
  public_r2_news_written:false,raw_publisher_bytes_archived:false,
  canonical_d1_status:"PENDING_QUOTA_ADMISSION",
 });
}
