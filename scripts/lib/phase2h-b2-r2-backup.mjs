/**
 * Private AES-256-GCM R2 continuity archive for Phase2H when B2 storage,
 * PUT/GET quota, object lifecycle or provider credentials are unavailable.
 *
 * Explicitly NOT a B2 ACK, orphan-free bucket census, signed GRO, billing
 * certification or release of the Canary HOLD. This uses the existing
 * physically tested private recovery bucket and a DOMAIN-SEPARATED derived
 * key; there are no raw D1 writes or B2 API calls.
 *
 * One discoverable encrypted object per UTC hour, plus a separate HMAC-bound
 * keyset cursor. Calendar-addressable keys require no bucket enumeration.
 */
import {createCipheriv,createDecipheriv,createHash,createHmac,
 hkdfSync,randomBytes,timingSafeEqual} from "node:crypto";
import {brotliCompressSync,brotliDecompressSync,constants as Z} from "node:zlib";
import {
 COMPACT_RISK_FACTS_SCHEMA,MINIMUM_FACT_COLUMNS,
 minimumRiskFactsFromOriginals,checkMinimumRiskFact,
 minimumFactId,minimumFactClock
} from "./phase2h-risk-gate-minimum-facts.mjs";
const PREFIX="geomacro/private/phase2h-risk-minimum-br11/v2/";
export const PHASE2H_R2_BACKUP_PREFIX=PREFIX;
export const PHASE2H_R2_CURSOR_KEY=PREFIX+"cursor.json";
const DOC_SCHEMA="geomacro.phase2h.risk-minimum-brotli11-aesgcm.v2";
const CURSOR_SCHEMA="geomacro.phase2h.risk-minimum-cursor.v2";
const HEX=/^[a-f0-9]{64}$/u, SHA=/^[a-f0-9]{40}$/u;

const ISO=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const MAX_ROWS=25,MAX_BYTES=500_000,MAX_CIPHER=600_000;
const err=code=>{throw Error("PHASE2H_R2_BACKUP_"+code)};
const hash=b=>createHash("sha256").update(b).digest("hex");
const COLUMN_SHA=hash(JSON.stringify(MINIMUM_FACT_COLUMNS));
const canon=o=>JSON.stringify(o);
function keys(secretB64){
 if(typeof secretB64!=="string"||!/^[A-Za-z0-9+/]{43}=$/u.test(secretB64))
  err("EXACT_AES256_SECRET_REQUIRED");
 const source=Buffer.from(secretB64,"base64");
 if(source.length!==32||source.toString("base64")!==secretB64)
  err("EXACT_AES256_SECRET_REQUIRED");
 const salt=Buffer.from("geomacro|phase2h|risk-minimum-brotli11|v2","utf8");
 return {
  aead:Buffer.from(hkdfSync("sha256",source,salt,
   Buffer.from("aes256-gcm-risk-minimum-v2"),32)),
  mac:Buffer.from(hkdfSync("sha256",source,salt,
   Buffer.from("hmac-sha256-risk-minimum-cursor-v2"),32)),
 };
}
const mac=(key,value)=>createHmac("sha256",key).update(value).digest("hex");
const eq=(a,b)=>typeof a==="string"&&typeof b==="string"&&
 a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function phase2hBackupHour(now){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))err("CLOCK_INVALID");
 return now.toISOString().slice(0,13)+":00:00.000Z";
}
export function phase2hBackupHourKey(now,batchDigest=null){
 const hour=phase2hBackupHour(now);
 const dir=PREFIX+hour.slice(0,4)+"/"+hour.slice(5,7)+"/"+
  hour.slice(8,10)+"/"+hour.slice(11,13);
 if(batchDigest!==null&&!HEX.test(batchDigest))
  err("IMMUTABLE_BATCH_DIGEST_INVALID");
 // Retain legacy zero-argument slot for restoring already committed hours.
 // Every NEW batch is SHA256 content-addressed. Multiple exact batches in
 // the same hour cannot overwrite one another, even with differing sources.
 return batchDigest===null?dir+".br11.enc":dir+"/"+batchDigest+".br11.enc";
}
export function phase2hBackupSourceRows(rows,now){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS)
  err("VERIFIED_ORIGINALS_REQUIRED");
 const sorted=[...rows].sort((a,b)=>
  a.ingested_at===b.ingested_at?
   a.record_id.localeCompare(b.record_id):
   a.ingested_at.localeCompare(b.ingested_at));
 const ids=new Set();
 for(const r of sorted){
  if(!r||!HEX.test(r.record_id??"")||
   !HEX.test(r.raw_sha256??"")||
   !ISO.test(r.ingested_at??"")||
   !Number.isFinite(Date.parse(r.ingested_at))||
   Date.parse(r.ingested_at)>now.getTime()+120000||
   typeof r.original?.original_title!=="string"||
   typeof r.category!=="string"||
   !["geopolitics","macro","rare_earth"].includes(r.category)||
   r.commercial_rights_verified!==false||
   r.commercial_delivery_authorized!==false||
   ids.has(r.record_id))err("CANONICAL_ORIGINAL_UNVERIFIED");
  ids.add(r.record_id);
 }
 return sorted;
}
export function sealPhase2hR2Backup({
 rows,now=new Date(),sourceSha,secretB64,nonce=randomBytes(12),
 previousObjectKey="",previousObjectSha=""
}={}){
 const records=phase2hBackupSourceRows(rows,now);
 if(!SHA.test(sourceSha??"")||
    !Buffer.isBuffer(nonce)||nonce.length!==12)
  err("EXACT_SOURCE_OR_NONCE_INVALID");
 const h=phase2hBackupHour(now);
 if(typeof previousObjectKey!=="string"||
    typeof previousObjectSha!=="string"||
    Boolean(previousObjectKey)!==Boolean(previousObjectSha)||
    previousObjectKey!==""&&!previousObjectKey.startsWith(PREFIX)||
    previousObjectSha!==""&&!HEX.test(previousObjectSha))
  err("PREVIOUS_CHAIN_POINTER_INVALID");
 const facts=minimumRiskFactsFromOriginals(records);
 const plain=Buffer.from(canon({
  schema:DOC_SCHEMA,fact_schema:COMPACT_RISK_FACTS_SCHEMA,
  columns_sha256:COLUMN_SHA,source_sha:sourceSha,hour:h,
  record_count:facts.length,facts,
  previous_object_key:previousObjectKey,
  previous_object_sha256:previousObjectSha,
  independent_corroboration_verified:false,
  risk_gate_certified:false,full_private_originals_retained:false
 }),"utf8");
 if(plain.length>MAX_BYTES)err("PLAINTEXT_BATCH_OVER_CAP");
 const key=phase2hBackupHourKey(now,hash(plain));
 // Brotli quality 11 + 22-bit window is the highest reviewed text
 // compression mode, followed by AES-256-GCM authenticated encryption.
 const compressed=brotliCompressSync(plain,{params:{
  [Z.BROTLI_PARAM_QUALITY]:11,[Z.BROTLI_PARAM_LGWIN]:22
 }});
 const cryptKey=keys(secretB64).aead;
 const c=createCipheriv("aes-256-gcm",cryptKey,nonce);
 c.setAAD(Buffer.from(DOC_SCHEMA+"|"+h+"|"+sourceSha));
 const encrypted=Buffer.concat([c.update(compressed),c.final()]);
 const envelope={
  schema:DOC_SCHEMA,source_sha:sourceSha,hour:h,
  nonce:nonce.toString("base64"),tag:c.getAuthTag().toString("base64"),
  ciphertext:encrypted.toString("base64"),cipher:"AES-256-GCM",
  compression:"BROTLI_Q11",full_private_originals_retained:false,
 };
 const body=Buffer.from(JSON.stringify(envelope),"utf8");
 if(body.length>MAX_CIPHER)err("CIPHERTEXT_OVER_CAP");
 return Object.freeze({key,hour:h,body,body_sha256:hash(body),
  records_count:facts.length,
  first_record:{record_id:minimumFactId(facts[0]),ingested_at:minimumFactClock(facts[0])},
  last_record:{record_id:minimumFactId(facts.at(-1)),
   ingested_at:minimumFactClock(facts.at(-1))},
  plaintext_bytes:plain.length,compressed_bytes:compressed.length,
  full_private_originals_retained:false,
  independent_corroboration_verified:false});
}
export function openPhase2hR2Backup({body,secretB64,expectedHour,expectedSha}={}){
 if(!Buffer.isBuffer(body)||body.length>MAX_CIPHER||body.length<128)
  err("PROVIDER_CIPHERTEXT_INVALID");
 let envelope;
 try{envelope=JSON.parse(body.toString("utf8"))}
 catch{err("ENVELOPE_JSON_INVALID")}
 if(envelope?.schema!==DOC_SCHEMA||envelope.cipher!=="AES-256-GCM"||
   envelope.compression!=="BROTLI_Q11"||
   envelope.full_private_originals_retained!==false||
   Object.keys(envelope).sort().join("|")!==
    ["schema","source_sha","hour","nonce","tag","ciphertext","cipher",
      "compression","full_private_originals_retained"].sort().join("|")||
   envelope.hour!==expectedHour||!SHA.test(envelope.source_sha??"")||
   (expectedSha!=null&&expectedSha!==envelope.source_sha))
  err("ENVELOPE_IDENTITY_MISMATCH");
 let plain;
 try{
  const nonce=Buffer.from(envelope.nonce,"base64");
  const tag=Buffer.from(envelope.tag,"base64");
  const encrypted=Buffer.from(envelope.ciphertext,"base64");
  if(nonce.length!==12||tag.length!==16||encrypted.length<1||
    encrypted.length>MAX_BYTES)err("ENVELOPE_BYTES_INVALID");
  const d=createDecipheriv("aes-256-gcm",keys(secretB64).aead,nonce);
  d.setAAD(Buffer.from(DOC_SCHEMA+"|"+expectedHour+"|"+envelope.source_sha));
  d.setAuthTag(tag);
  const compressed=Buffer.concat([d.update(encrypted),d.final()]);
  plain=brotliDecompressSync(compressed,{maxOutputLength:MAX_BYTES});
 }catch{err("AES_GCM_OR_GZIP_AUTHENTICATION_FAILED")}
 let payload;
 try{payload=JSON.parse(plain.toString("utf8"))}
 catch{err("RECOVERED_JSON_INVALID")}
 if(payload?.schema!==DOC_SCHEMA||
   payload.fact_schema!==COMPACT_RISK_FACTS_SCHEMA||
   payload.columns_sha256!==COLUMN_SHA||
   payload.hour!==expectedHour||
   payload.source_sha!==envelope.source_sha||
   payload.independent_corroboration_verified!==false||
   payload.risk_gate_certified!==false||
   payload.full_private_originals_retained!==false||
   Object.keys(payload).sort().join("|")!==
    ["schema","fact_schema","columns_sha256","source_sha","hour",
      "record_count","facts","independent_corroboration_verified",
      "risk_gate_certified","full_private_originals_retained",
      ...("previous_object_key" in payload?
       ["previous_object_key","previous_object_sha256"]:[])].sort().join("|")||
   (("previous_object_key" in payload)!==("previous_object_sha256" in payload))||
   (payload.previous_object_key!==undefined&&
    (typeof payload.previous_object_key!=="string"||
     typeof payload.previous_object_sha256!=="string"||
     Boolean(payload.previous_object_key)!==Boolean(payload.previous_object_sha256)||
     payload.previous_object_key!==""&&
      !payload.previous_object_key.startsWith(PREFIX)||
     payload.previous_object_sha256!==""&&
      !HEX.test(payload.previous_object_sha256)))||
   !Array.isArray(payload.facts)||
   payload.facts.length<1||payload.facts.length>MAX_ROWS||
   payload.record_count!==payload.facts.length)
  err("RESTORED_DERIVED_FACTS_METADATA_MISMATCH");
 const checked=payload.facts;
 if(!checked.every(checkMinimumRiskFact)||
    new Set(checked.map(minimumFactId)).size!==checked.length)
  err("RESTORED_DERIVED_FACTS_INTEGRITY_FAILED");
 const sorted=[...checked].sort((a,b)=>
  minimumFactClock(a)===minimumFactClock(b)?
   minimumFactId(a).localeCompare(minimumFactId(b)):
   minimumFactClock(a).localeCompare(minimumFactClock(b)));
 if(canon(sorted)!==canon(checked))
  err("DERIVED_FACT_KEYSET_ORDER_DIVERGED");
 return Object.freeze({source_sha:payload.source_sha,
  hour:payload.hour,records:checked,
  previous_object_key:payload.previous_object_key??"",
  previous_object_sha256:payload.previous_object_sha256??"",
  full_private_originals_retained:false,
  independent_corroboration_verified:false,risk_gate_certified:false,
  body_sha256:hash(body),verified:true});
}
export function sealPhase2hBackupCursor({
 sourceSha,hour,objectKey,objectSha,lastClock,lastId,cycleComplete,secretB64
}={}){
 if(!SHA.test(sourceSha??"")||!ISO.test(hour??"")||
    !objectKey?.startsWith(PREFIX)||objectKey===PHASE2H_R2_CURSOR_KEY||
    !HEX.test(objectSha??"")||!ISO.test(lastClock??"")||
    !HEX.test(lastId??"")||typeof cycleComplete!=="boolean")
  err("CURSOR_INPUT_INVALID");
 const doc={schema:CURSOR_SCHEMA,source_sha:sourceSha,hour,
  object_key:objectKey,object_sha256:objectSha,
  last_clock:lastClock,last_id:lastId,cycle_complete:cycleComplete};
 const sig=mac(keys(secretB64).mac,canon(doc));
 return Buffer.from(canon({...doc,hmac_sha256:sig}),"utf8");
}
export function openPhase2hBackupCursor({body,secretB64}={}){
 if(!Buffer.isBuffer(body)||body.length>2500)err("CURSOR_PROVIDER_BODY_INVALID");
 let j;try{j=JSON.parse(body.toString("utf8"))}catch{err("CURSOR_JSON_INVALID")}
 if(j?.schema!==CURSOR_SCHEMA||!SHA.test(j.source_sha??"")||
    !ISO.test(j.hour??"")||!j.object_key?.startsWith(PREFIX)||
    !HEX.test(j.object_sha256??"")||!ISO.test(j.last_clock??"")||
    !HEX.test(j.last_id??"")||typeof j.cycle_complete!=="boolean"||
    !HEX.test(j.hmac_sha256??""))
  err("CURSOR_METADATA_INVALID");
 const {hmac_sha256,...doc}=j;
 if(!eq(mac(keys(secretB64).mac,canon(doc)),hmac_sha256))
  err("CURSOR_HMAC_MISMATCH");
 return Object.freeze(doc);
}
