#!/usr/bin/env bun
/**
 * Owner-supplied PRIVATE B2 Telegram Desktop JSON -> derived D1 JSON.
 * NEVER calls Telegram, follows post links, uploads raw bytes to Actions,
 * or reports source content/chat IDs in logs.
 */
import {createHash,createHmac} from "node:crypto";
import {realpathSync} from "node:fs";
import {resolve,sep} from "node:path";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {projectTelegramExport,TELEGRAM_EXPORT_LIMITS} from "../lib/telegram-export-derived-json.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

const PREFIX="telegram/owner-exports/";
const SOURCE_HOST="s3.us-east-005.backblazeb2.com";
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const sh=s=>createHash("sha256").update(s).digest("hex");
const H=(key,s)=>createHmac("sha256",key).update(s).digest();
function fail(){throw Error("TELEGRAM_EXPORT_PRODUCTION_FAIL_CLOSED")}
export function decodeXmlTextOnce(v){
 // Decode XML entities in one pass. Decoding &amp; first would allow a
 // doubly encoded value such as &amp;lt; to become < after a second replace.
 const entities={"amp":"&","lt":"<","gt":">","quot":'"',"apos":"'"};
 return v.replace(/&(?:amp|lt|gt|quot|apos);/gu,entity=>
   entities[entity.slice(1,-1)]??entity);
}
function signRequest(method,query,now,key,secret){
 const timestamp=now.toISOString().replace(/[:-]|\.\d{3}/gu,""),day=timestamp.slice(0,8);
 const region="us-east-005",scope=day+"/"+region+"/s3/aws4_request";
 const hashed=sh(Buffer.alloc(0));
 const headers="host:"+SOURCE_HOST+"\n"+"x-amz-content-sha256:"+hashed+"\n"+
  "x-amz-date:"+timestamp+"\n";
 const names="host;x-amz-content-sha256;x-amz-date";
 const path="/geomacro-private-archive";
 const canonical=[method,path,query,headers,names,hashed].join("\n");
 const toSign=["AWS4-HMAC-SHA256",timestamp,scope,sh(canonical)].join("\n");
 const dateKey=H("AWS4"+secret,day);
 const regionKey=H(dateKey,region),serviceKey=H(regionKey,"s3");
 const signingKey=H(serviceKey,"aws4_request");
 const signature=createHmac("sha256",signingKey).update(toSign).digest("hex");
 return {
  authorization:"AWS4-HMAC-SHA256 Credential="+key+"/"+scope+
    ", SignedHeaders="+names+", Signature="+signature,
  "x-amz-content-sha256":hashed,"x-amz-date":timestamp,
 };
}
export function parseOwnerExportList(xmlText,prefix=PREFIX){
 if(typeof xmlText!=="string"||xmlText.length>160000||
   !/<ListBucketResult(?:\s|>)/u.test(xmlText))fail();
 const items=[];
 for(const match of xmlText.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gu)){
  const key=match[1].match(/<Key>([\s\S]*?)<\/Key>/u)?.[1];
  const size=Number(match[1].match(/<Size>(\d+)<\/Size>/u)?.[1]);
  if(!key||!Number.isSafeInteger(size))fail();
  const value=decodeXmlTextOnce(key);
  // Avoid attacker-controlled paths or raw user identifiers in object names:
  // owner exports use opaque hex digest filenames (no chat names).
  if(value!==prefix+"result.json"&&
     !new RegExp("^"+prefix.replaceAll("/","\\/")+"[a-f0-9]{64}\\.json$","u").test(value))continue;
  if(size>=2&&size<=TELEGRAM_EXPORT_LIMITS.max_export_bytes)
   items.push({key:value,size});
  if(items.length>100)fail();
 }
 if(/<IsTruncated>true<\/IsTruncated>/u.test(xmlText))fail();
 return items;
}
export async function listOwnerExports({
 prefix=PREFIX,key,secret,now=new Date(),fetchImpl=fetch,governor,
}){
 if(prefix!==PREFIX||!key||!secret||!governor)fail();
 const query="list-type=2&max-keys=100&prefix=telegram%2Fowner-exports%2F";
 // LIST is conservatively charged against the existing shared GET budget.
 await governor.reserve("GET");
 const res=await fetchImpl("https://"+SOURCE_HOST+"/geomacro-private-archive?"+query,{
  method:"GET",redirect:"error",cache:"no-store",
  headers:signRequest("GET",query,now,key,secret),signal:AbortSignal.timeout(12000)});
 if(res.status!==200)fail();
 return parseOwnerExportList(await res.text(),prefix);
}
function isInsideRepo(path){
 const root=realpathSync(process.cwd()),target=resolve(path);
 return target===root||target.startsWith(root+sep);
}
export function assertExportFileIsPrivate(path){
 if(typeof path!=="string"||!path.startsWith("/")||isInsideRepo(path))
   throw Error("TELEGRAM_EXPORT_INPUT_MUST_BE_PRIVATE");
}
async function main(){
 const config=process.env;
 if(config.GEOMACRO_TELEGRAM_EXPORT_PREFIX===undefined||
    config.GEOMACRO_TELEGRAM_EXPORT_PREFIX===""){
  // Explicitly configured NO-INPUT schedule is intentionally inert.
  console.log(JSON.stringify({schema:"geomacro.telegram-export-job.v1",
   state:"NO_OWNER_EXPORT_PREFIX_CONFIGURED",items_accepted:0,telegram_network_calls:0}));
  return;
 }
 if(config.GEOMACRO_TELEGRAM_EXPORT_PREFIX!==PREFIX||
    config.GEOMACRO_TELEGRAM_EXPORT_LIFECYCLE_CONFIRMED!=="YES")
   fail();
 const root=config.GEOMACRO_COMMERCE_LEDGER_TOKEN??"";
 if(root.length<32||!config.B2_KEY_ID||!config.B2_APPLICATION_KEY||
    config.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    !config.D1_DATABASE_ID)fail();
 const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const governor=createB2D1AccountGovernor();
 const candidates=await listOwnerExports({
  key:config.B2_KEY_ID,secret:config.B2_APPLICATION_KEY,governor,
 });
 const reader=createB2Client({
  endpointUrl:"https://"+SOURCE_HOST,
  accessKey:config.B2_KEY_ID,secretKey:config.B2_APPLICATION_KEY,
  bucket:"geomacro-private-archive",allowedKeyPrefixes:[PREFIX],
 });
 const countryCodes=new Set(COUNTRIES_195.map(x=>x.iso3));
 let checked=0,accepted=0,already=0;
 // Two raw-file GETs maximum; no account quota bypass.
 for(const entry of candidates){
  if(checked>=2)break;
  const basename=entry.key.slice(PREFIX.length);
  const keySha=/^[a-f0-9]{64}\.json$/u.test(basename)?basename.slice(0,64):null;
  if(keySha){
    const state=await fetch(ROOT+"/v1/internal/telegram-export-derived-json?object_sha256="+keySha,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{authorization:"Bearer "+token},signal:AbortSignal.timeout(12000)});
    if(state.status!==200)fail();
    const seen=await state.json();
    if(seen.ok!==true||seen.paid_delivery_enabled!==false)fail();
    if(seen.object_processed===true){already++;continue}
    if(seen.object_processed!==false)fail();
  }
  const bytes=await reader.get(entry.key);
  if(!bytes||bytes.byteLength!==entry.size||
      keySha!==null&&sh(bytes)!==keySha)fail();
  const doc=projectTelegramExport(bytes,{countryCodes,countryRegistry:COUNTRIES_195});
  const objectSha=sh(bytes);
  bytes.fill(0);
  const batch={schema:"geomacro.telegram-export-derived-batch.v1",
    object_sha256:objectSha,items:doc.items};
  const r=await fetch(ROOT+"/v1/internal/telegram-export-derived-json",{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{authorization:"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify(batch),signal:AbortSignal.timeout(15000)});
  if(r.status!==200)fail();
  const out=await r.json();
  if(out.ok!==true||out.commercial_rights_verified!==false||
      out.paid_delivery_enabled!==false||
      (out.d1_readback_verified!==true&&out.already_processed!==true))fail();
  checked++;accepted+=out.accepted;already+=Number(out.already_processed===true);
 }
 console.log(JSON.stringify({schema:"geomacro.telegram-export-job.v1",
  objects_listed:candidates.length,objects_checked:checked,
  derived_items_accepted:accepted,already_processed_objects:already,
  raw_content_logged:false,telegram_network_calls:0,
  commercially_verified:false,paid_delivery_enabled:false,
  no_new_objects:candidates.length===0}));
}
if(import.meta.url===new URL("file://"+process.argv[1]).href){
 main().catch(()=>{console.error("TELEGRAM_EXPORT_INGEST_FAIL_CLOSED");process.exitCode=1});
}
