/**
 * Phase2H opt-in PRIVATE reference-only storage. No customer/public/paid path.
 * One R2 object (PUT + independent GET) holds up to 50 validated originals.
 * Canonical D1 stores HMAC-bound pointers and source clocks only, no raw JSON.
 *
 * This is a separate staged lane: legacy Phase2H archival/B2 counters and
 * signing gates MUST NOT be promoted on the strength of an R2 staging ACK.
 */
const HEX=/^[a-f0-9]{64}$/u;
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const PREFIX="geomacro/private/phase2h/ref-only/v1/";
const KEY_RE=/^geomacro\/private\/phase2h\/ref-only\/v1\/[a-f0-9]{64}\.json$/u;
const SCHEMA="geomacro.phase2h.r2-private-reference-bundle.v1";
const TEXT=new TextEncoder();
export const PHASE2H_REFERENCE_SCHEMA="geomacro.phase2h.raw-object-pointer.v1";
export const PHASE2H_MAX_REF_BUNDLE=50;
const MAX_BUNDLE_BYTES=600000;
const REQUIRED=Object.freeze([
 "record_id","category","original_published_at","first_ingested_at",
 "raw_sha256","object_sha256","object_key","bundle_bytes",
 "record_sha256","record_bytes","bundle_index","signed_at","pointer_hmac_sha256",
 "risk_country_iso3","storage_backend"
]);
const fail=code=>{throw Error("PHASE2H_REF_"+code)};
const isIso=x=>typeof x==="string"&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const isCountry=x=>x===null||typeof x==="string"&&/^[A-Z]{3}$/u.test(x);
const byteCount=x=>TEXT.encode(x).byteLength;

export async function phase2hSha256(bytes){
 const buf=typeof bytes==="string"?TEXT.encode(bytes):bytes;
 if(!(buf instanceof Uint8Array)&&!(buf instanceof ArrayBuffer))
  fail("HASH_INPUT_INVALID");
 const digest=await crypto.subtle.digest("SHA-256",buf);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function pointerEnvelope(row){
 return JSON.stringify([PHASE2H_REFERENCE_SCHEMA,row.record_id,row.category,
  row.original_published_at,row.first_ingested_at,row.raw_sha256,
  row.object_sha256,row.object_key,row.bundle_bytes,row.record_sha256,
  row.record_bytes,row.bundle_index,row.signed_at,row.risk_country_iso3,
  row.storage_backend]);
}
async function mac(env,row){
 const root=String(env?.PHASE2H_R2_REFERENCE_HMAC_KEY??"");
 if(!HEX.test(root))fail("SIGNING_KEY_UNCONFIGURED");
 const key=await crypto.subtle.importKey("raw",
  Uint8Array.from(root.match(/../gu),x=>parseInt(x,16)),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",key,TEXT.encode(pointerEnvelope(row)));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function constantTimeHexEqual(a,b){
 if(!HEX.test(a)||!HEX.test(b))return false;
 let mismatch=0;
 for(let i=0;i<64;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
export function validPhase2hObjectPointer(row){
 return row&&typeof row==="object"&&
  REQUIRED.every(k=>Object.hasOwn(row,k))&&
  HEX.test(row.record_id)&&HEX.test(row.raw_sha256)&&
  HEX.test(row.object_sha256)&&HEX.test(row.record_sha256)&&
  HEX.test(row.pointer_hmac_sha256)&&CATS.has(row.category)&&
  isIso(row.first_ingested_at)&&isIso(row.signed_at)&&
  typeof row.original_published_at==="string"&&
  row.original_published_at.length>=10&&row.original_published_at.length<=24&&
  KEY_RE.test(row.object_key)&&row.object_key===PREFIX+row.object_sha256+".json"&&
  Number.isSafeInteger(row.bundle_bytes)&&row.bundle_bytes>=300&&
  row.bundle_bytes<=MAX_BUNDLE_BYTES&&Number.isSafeInteger(row.record_bytes)&&
  row.record_bytes>=300&&row.record_bytes<=12000&&
  Number.isSafeInteger(row.bundle_index)&&row.bundle_index>=0&&row.bundle_index<50&&
  isCountry(row.risk_country_iso3)&&row.storage_backend==="private_r2";
}
async function assertPointer(env,row){
 if(!validPhase2hObjectPointer(row))fail("POINTER_INVALID");
 const expected=await mac(env,row);
 if(!constantTimeHexEqual(row.pointer_hmac_sha256,expected))
  fail("POINTER_SIGNATURE_MISMATCH");
}
async function objectBytes(object,maxBytes){
 if(!object||typeof object.arrayBuffer!=="function"||
    !Number.isSafeInteger(object.size)||object.size>maxBytes||object.size<300)
  fail("OBJECT_MISSING_OR_OVERSIZE");
 const bytes=new Uint8Array(await object.arrayBuffer());
 if(bytes.byteLength!==object.size||bytes.byteLength>maxBytes)
  fail("OBJECT_BYTES_DIVERGED");
 return bytes;
}
async function readVerifiedBundle(env,pointer){
 await assertPointer(env,pointer); // Before any remote object read.
 if(!env?.PHASE2H_PRIVATE_R2?.get)fail("PRIVATE_R2_BINDING_MISSING");
 const object=await env.PHASE2H_PRIVATE_R2.get(pointer.object_key);
 const bytes=await objectBytes(object,MAX_BUNDLE_BYTES);
 if(bytes.length!==pointer.bundle_bytes||
    await phase2hSha256(bytes)!==pointer.object_sha256)
  fail("BUNDLE_SHA256_MISMATCH");
 let data;try{data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
 catch{fail("BUNDLE_DECODE_INVALID")}
 if(data?.schema!==SCHEMA||!Array.isArray(data.records)||
    data.records.length<1||data.records.length>PHASE2H_MAX_REF_BUNDLE||
    data.records.some(x=>typeof x!=="string"))
  fail("BUNDLE_FORMAT_INVALID");
 return data.records;
}
export async function resolvePhase2hObjectPointer(env,pointer,validator,now=Date.now(),bundleCache=null){
 if(typeof validator!=="function"||!Number.isFinite(now))fail("VALIDATOR_MISSING");
 // A shared per-request map avoids N R2 GETs when pointers reference one
 // 50-original object. NEVER persist this map across user requests.
 await assertPointer(env,pointer);
 let records=bundleCache?.get(pointer.object_key);
 if(records===undefined){
  records=await readVerifiedBundle(env,pointer);
  bundleCache?.set(pointer.object_key,records);
 }
 const raw=records[pointer.bundle_index];
 if(typeof raw!=="string"||byteCount(raw)!==pointer.record_bytes||
    await phase2hSha256(raw)!==pointer.record_sha256)
  fail("RECORD_SHA256_MISMATCH");
 let record;try{record=JSON.parse(raw)}catch{fail("RECORD_JSON_INVALID")}
 if(record?.record_id!==pointer.record_id||
    record?.category!==pointer.category||
    record?.raw_sha256!==pointer.raw_sha256||
    record?.original?.original_published_at!==pointer.original_published_at||
    record?.ingested_at!==pointer.first_ingested_at)
  fail("RECORD_METADATA_MISMATCH");
 if(await validator(record,now,false)!==raw)fail("RECORD_PROOF_REJECTED");
 return record;
}
const COLUMNS="record_id,category,original_published_at,first_ingested_at,"+
 "raw_sha256,object_sha256,object_key,bundle_bytes,record_sha256,"+
 "record_bytes,bundle_index,signed_at,pointer_hmac_sha256,"+
 "risk_country_iso3,storage_backend";
const pointerRow=([record_id,category,original_published_at,first_ingested_at,
 raw_sha256,object_sha256,object_key,bundle_bytes,record_sha256,
 record_bytes,bundle_index,signed_at,pointer_hmac_sha256,
 risk_country_iso3,storage_backend])=>({
 record_id,category,original_published_at,first_ingested_at,raw_sha256,
 object_sha256,object_key,bundle_bytes,record_sha256,
 record_bytes,bundle_index,signed_at,pointer_hmac_sha256,
 risk_country_iso3,storage_backend
});
export async function publishPhase2hReferenceBatch(env,validated,now=Date.now()){
 if(env?.GEOMACRO_PHASE2H_REF_ONLY_V1!=="1"||!env?.DB?.prepare||
    !env?.PHASE2H_PRIVATE_R2?.put||!env?.PHASE2H_PRIVATE_R2?.get||
    !Array.isArray(validated)||validated.length<1||
    validated.length>PHASE2H_MAX_REF_BUNDLE||!Number.isFinite(now))
  fail("REF_ONLY_ADMISSION_BLOCKED");
 const byId=new Map();
 for(const entry of validated){
  const record=entry?.record,raw=entry?.raw;
  if(!record||typeof raw!=="string"||!HEX.test(record.record_id)||
     !HEX.test(record.raw_sha256)||!CATS.has(record.category)||
     !isIso(record.ingested_at)||!isCountry(entry.country_iso3)||
     byteCount(raw)<300||byteCount(raw)>12000||
     byId.has(record.record_id))
   fail("VALIDATED_BATCH_INVALID");
  byId.set(record.record_id,entry);
 }
 const ids=[...byId.keys()],bindings=ids.map(()=>( "?")).join(",");
 // Cross-lane ID reuse must not silently claim a new R2-only original.
 const legacy=await env.DB.prepare(
  "SELECT record_id,raw_sha256 FROM phase2h_private_raw_news WHERE record_id IN ("+bindings+")"
 ).bind(...ids).all();
 const old=await env.DB.prepare(
  "SELECT "+COLUMNS+" FROM phase2h_raw_object_refs_v1 WHERE record_id IN ("+bindings+")"
 ).bind(...ids).all();
 if(!Array.isArray(legacy?.results)||!Array.isArray(old?.results))
  fail("D1_BEFORE_READ_INVALID");
 const legacyById=new Map(legacy.results.map(x=>[x.record_id,x]));
 const existingById=new Map(old.results.map(x=>[x.record_id,x]));
 for(const [id,entry] of byId){
  const l=legacyById.get(id),o=existingById.get(id);
  if(l&&o||l&&l.raw_sha256!==entry.record.raw_sha256||
     o&&o.raw_sha256!==entry.record.raw_sha256)fail("CANONICAL_ID_CONFLICT");
  if(o)await assertPointer(env,o);
 }
 const news=[...byId.values()].filter(x=>!legacyById.has(x.record.record_id)&&
   !existingById.has(x.record.record_id))
  .sort((a,b)=>a.record.record_id.localeCompare(b.record.record_id));
 if(!news.length)return {new_records:0,previous_records:ids.length,
  r2_puts:0,r2_gets:0,record_ids:ids};
 const bundle=JSON.stringify({schema:SCHEMA,records:news.map(x=>x.raw)});
 const bytes=TEXT.encode(bundle),objectSHA=await phase2hSha256(bytes);
 if(bytes.byteLength>MAX_BUNDLE_BYTES)fail("BUNDLE_TOO_LARGE");
 const key=PREFIX+objectSHA+".json";
 const stored=await env.PHASE2H_PRIVATE_R2.put(key,bytes,{
  sha256:objectSHA,httpMetadata:{contentType:"application/json"},
  customMetadata:{schema:SCHEMA,sha256:objectSHA,count:String(news.length)}
 });
 if(!stored)fail("R2_PUT_NOT_CONFIRMED");
 // Physical readback BEFORE the first canonical D1 pointer write.
 const pointerBasis={object_sha256:objectSHA,object_key:key,
  bundle_bytes:bytes.byteLength};
 const fetched=await env.PHASE2H_PRIVATE_R2.get(key);
 const readBytes=await objectBytes(fetched,MAX_BUNDLE_BYTES);
 if(readBytes.byteLength!==bytes.byteLength||
    await phase2hSha256(readBytes)!==objectSHA||
    !readBytes.every((b,i)=>b===bytes[i]))fail("R2_READBACK_DIVERGED");
 const at=new Date(now).toISOString();
 const pointers=[];
 for(let i=0;i<news.length;i++){
  const record=news[i].record;
  const row={record_id:record.record_id,category:record.category,
   original_published_at:record.original.original_published_at,
   first_ingested_at:record.ingested_at,raw_sha256:record.raw_sha256,
   ...pointerBasis,record_sha256:await phase2hSha256(news[i].raw),
   record_bytes:byteCount(news[i].raw),bundle_index:i,signed_at:at,
   pointer_hmac_sha256:"0".repeat(64),risk_country_iso3:news[i].country_iso3,
   storage_backend:"private_r2"};
  row.pointer_hmac_sha256=await mac(env,row);
  if(!validPhase2hObjectPointer(row))fail("POINTER_GENERATION_INVALID");
  pointers.push(row);
 }
 const tuples=pointers.map(p=>Object.keys(pointerRow([])).map(k=>p[k]));
 // One D1 statement inserts up to 50 pointer rows. No original JSON binds.
 const stmt=env.DB.prepare(
  "INSERT INTO phase2h_raw_object_refs_v1("+COLUMNS+") "+
  "SELECT "+Array.from({length:15},(_,i)=>
    "json_extract(j.value,'$["+i+"]')").join(",")+
  " FROM json_each(?) AS j WHERE 1 ON CONFLICT(record_id) DO NOTHING"
 ).bind(JSON.stringify(tuples));
 const write=await stmt.run();
 if(write?.success===false)fail("D1_REFERENCE_INSERT_FAILED");
 const after=await env.DB.prepare(
  "SELECT "+COLUMNS+" FROM phase2h_raw_object_refs_v1 WHERE record_id IN ("+
  news.map(()=>"?").join(",")+")"
 ).bind(...news.map(x=>x.record.record_id)).all();
 if(!Array.isArray(after?.results)||after.results.length!==news.length)
  fail("D1_REFERENCE_READBACK_MISSING");
 for(const row of after.results){
  const p=pointers.find(x=>x.record_id===row.record_id);
  if(!p||Object.keys(p).some(k=>p[k]!==row[k]))fail("D1_REFERENCE_READBACK_DIVERGED");
  await assertPointer(env,row);
 }
 return {new_records:news.length,previous_records:ids.length-news.length,
  r2_puts:1,r2_gets:1,record_ids:ids,
  d1_rows_written: Number.isSafeInteger(write?.meta?.rows_written)?
   write.meta.rows_written:null,
  d1_rows_read:Number.isSafeInteger(write?.meta?.rows_read)?
   write.meta.rows_read:null,
  authenticated_reference_readback:true,
  b2_archival_proof:false,signing_authorizes_paid_delivery:false};
}
export async function readPhase2hReferenceOrLegacy(env,recordId,validator,now=Date.now()){
 if(!HEX.test(recordId)||!env?.DB?.prepare||typeof validator!=="function")
  fail("EXACT_READ_INVALID");
 // No public cross-tenant cache, and NEVER fall back after an invalid pointer.
 let p;
 try{p=await env.DB.prepare("SELECT "+COLUMNS+
   " FROM phase2h_raw_object_refs_v1 WHERE record_id=?").bind(recordId).first()}
 catch(error){
  // An unmigrated database may still serve its authentic legacy originals.
  if(!/no such table: phase2h_raw_object_refs_v1/u.test(String(error?.message)))
   throw error;
  p=null;
 }
 if(p){
  const record=await resolvePhase2hObjectPointer(env,p,validator,now);
  return {record,storage:"R2_POINTER_SHA256_AND_HMAC_VERIFIED",
   legacy_fallback:false,b2_archival_proof:false};
 }
 const old=await env.DB.prepare(
  "SELECT record_id,raw_sha256,raw_json,first_ingested_at "+
  "FROM phase2h_private_raw_news WHERE record_id=? LIMIT 1"
 ).bind(recordId).first();
 if(!old)return null;
 if(typeof old.raw_json!=="string"||old.raw_json.length>12000||
    !HEX.test(old.raw_sha256))fail("LEGACY_ROW_CORRUPT");
 let record;try{record=JSON.parse(old.raw_json)}catch{fail("LEGACY_JSON_INVALID")}
 if(record?.record_id!==old.record_id||record?.raw_sha256!==old.raw_sha256||
    record?.ingested_at!==old.first_ingested_at||
    await validator(record,now,false)!==old.raw_json)
  fail("LEGACY_VALIDATION_FAILED");
 return {record,storage:"LEGACY_D1_RAW_JSON_VERIFIED",
  legacy_fallback:true,b2_archival_proof:false};
}
