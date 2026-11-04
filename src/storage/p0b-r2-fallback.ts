/**
 * P0-B private fallback when B2 SigV4 transport is unavailable.
 * This is an encrypted R2 outbox, NOT a B2 success receipt. Never stores
 * original headlines/URLs/payloads in D1 or public-facing storage.
 */
import {canonicalJson} from "../lib/canonical-json.ts";
import {p0bSha256} from "./b2-spool-manager.ts";
import type {B2SpoolEnv,SpoolPayload} from "./b2-spool-manager.ts";
export type R2FallbackEnv=B2SpoolEnv&{
 P0B_PRIVATE_FALLBACK_R2?:{
  put:(key:string,value:Uint8Array,opts?:unknown)=>Promise<unknown>;
  get:(key:string)=>Promise<{arrayBuffer:()=>Promise<ArrayBuffer>}|null>;
 }
};
const MAX_ITEMS=100,MAX_CIPHER=1536*1024,MAX_PLAIN=512*1024;
const HEX=/^[a-f0-9]{64}$/u,ID=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const prefix="p0b/private-fallback/v1/";
const enc=new TextEncoder();
const bytes=(x:string)=>enc.encode(x);
const toArrayBuffer=(x:Uint8Array):ArrayBuffer=>{
 const a=new ArrayBuffer(x.length);new Uint8Array(a).set(x);return a;
};
const b64=(x:Uint8Array)=>{let result="";for(const b of x)result+=String.fromCharCode(b);return btoa(result)};
const unb64=(x:string)=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
async function aes(env:R2FallbackEnv){
 if(typeof env.B2_SPOOL_ENCRYPTION_KEY!=="string"||
    env.B2_SPOOL_ENCRYPTION_KEY.length<32)
  throw Error("P0B_R2_FALLBACK_CRYPTO_UNAVAILABLE");
 const digest=await crypto.subtle.digest("SHA-256",bytes(env.B2_SPOOL_ENCRYPTION_KEY));
 return crypto.subtle.importKey("raw",digest,"AES-GCM",false,["encrypt","decrypt"]);
}
async function gzip(input:Uint8Array,decode=false){
 const stream=new Blob([toArrayBuffer(input)]).stream().pipeThrough(
  decode?new DecompressionStream("gzip"):new CompressionStream("gzip"));
 const output=new Uint8Array(await new Response(stream).arrayBuffer());
 if(output.length>MAX_CIPHER)throw Error("P0B_R2_FALLBACK_SIZE_INVALID");
 return output;
}
const valid=async (row:SpoolPayload)=>row&&HEX.test(row.candidateSha256??"")&&
 ID.test(row.sourceId??"")&&Number.isFinite(Date.parse(row.discoveredAt??""))&&
 await p0bSha256(canonicalJson(row.rawPayload))===row.candidateSha256;
export async function p0bFallbackBatchId(payloads:SpoolPayload[]){
 const keys=payloads.map(x=>x.sourceId+"|"+x.candidateSha256).sort();
 return p0bSha256(keys.join("\n"));
}
export async function restoreP0bR2Fallback(env:R2FallbackEnv,row:any){
 if(!env.P0B_PRIVATE_FALLBACK_R2||!HEX.test(row?.batch_id??"")||
    !HEX.test(row?.cipher_sha256??"")||
    typeof row?.object_key!=="string"||
    !row.object_key.startsWith(prefix)||
    !Number.isInteger(row?.item_count)||row.item_count<1||
    row.item_count>MAX_ITEMS)
  throw Error("P0B_R2_FALLBACK_POINTER_INVALID");
 const object=await env.P0B_PRIVATE_FALLBACK_R2.get(row.object_key);
 if(!object)throw Error("P0B_R2_FALLBACK_READBACK_MISSING");
 const cipher=new Uint8Array(await object.arrayBuffer());
 if(cipher.length>MAX_CIPHER||await p0bSha256(cipher)!==row.cipher_sha256)
  throw Error("P0B_R2_FALLBACK_CIPHER_MISMATCH");
 let envelope:any;
 try{envelope=JSON.parse(new TextDecoder().decode(await gzip(cipher,true)));}
 catch{throw Error("P0B_R2_FALLBACK_ENVELOPE_INVALID")}
 if(envelope?.schema!=="geomacro.p0b.r2-fallback-aead.v1"||
    envelope?.batch_id!==row.batch_id||!HEX.test(envelope?.plain_sha256??"")||
    typeof envelope?.nonce!=="string"||typeof envelope?.ciphertext!=="string")
  throw Error("P0B_R2_FALLBACK_ENVELOPE_INVALID");
 let plain:Uint8Array;
 try{
  plain=new Uint8Array(await crypto.subtle.decrypt({
   name:"AES-GCM",iv:toArrayBuffer(unb64(envelope.nonce)),
   additionalData:toArrayBuffer(bytes("p0b-r2-fallback|"+row.batch_id))
  },await aes(env),toArrayBuffer(unb64(envelope.ciphertext))));
 }catch{throw Error("P0B_R2_FALLBACK_AUTH_INVALID")}
 if(plain.length>MAX_PLAIN||await p0bSha256(plain)!==envelope.plain_sha256)
  throw Error("P0B_R2_FALLBACK_PLAIN_MISMATCH");
 let payloads:SpoolPayload[];
 try{payloads=JSON.parse(new TextDecoder().decode(plain)).items}
 catch{throw Error("P0B_R2_FALLBACK_ITEMS_INVALID")}
 if(!Array.isArray(payloads)||payloads.length!==row.item_count||
    await p0bFallbackBatchId(payloads)!==row.batch_id||
    !(await Promise.all(payloads.map(valid))).every(Boolean))
  throw Error("P0B_R2_FALLBACK_ITEMS_INVALID");
 return payloads;
}
export async function stageP0bR2Fallback(env:R2FallbackEnv,payloads:SpoolPayload[],now=new Date()){
 if(!env?.P0B_PRIVATE_FALLBACK_R2||!env.DB?.prepare||
    !Array.isArray(payloads)||payloads.length<1||
    payloads.length>MAX_ITEMS||!(now instanceof Date)||
    !Number.isFinite(now.getTime())||
    !(await Promise.all(payloads.map(valid))).every(Boolean))
  throw Error("P0B_R2_FALLBACK_STAGE_INVALID");
 const batchId=await p0bFallbackBatchId(payloads);
 if(new Set(payloads.map(x=>x.candidateSha256)).size!==payloads.length)
  throw Error("P0B_R2_FALLBACK_DUPLICATE_ID");
 const previous=await env.DB.prepare(
  "SELECT batch_id,object_key,cipher_sha256,item_count,state FROM p0b_private_r2_fallback WHERE batch_id=?"
 ).bind(batchId).first();
 if(previous){
  if(previous.item_count!==payloads.length)
   throw Error("P0B_R2_FALLBACK_BATCH_CONFLICT");
  await restoreP0bR2Fallback(env,previous);
  return {verified:true,batchId,itemCount:payloads.length,
   pendingB2:previous.state!=="B2_VERIFIED",reused:true};
 }
 const plain=bytes(canonicalJson({items:payloads}));
 if(plain.length>MAX_PLAIN)throw Error("P0B_R2_FALLBACK_PLAIN_TOO_LARGE");
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({
  name:"AES-GCM",iv:toArrayBuffer(nonce),
  additionalData:toArrayBuffer(bytes("p0b-r2-fallback|"+batchId))
 },await aes(env),toArrayBuffer(plain)));
 const envelope={schema:"geomacro.p0b.r2-fallback-aead.v1",
  batch_id:batchId,plain_sha256:await p0bSha256(plain),
  nonce:b64(nonce),ciphertext:b64(ciphertext)};
 const cipher=await gzip(bytes(canonicalJson(envelope)));
 if(cipher.length>MAX_CIPHER)throw Error("P0B_R2_FALLBACK_CIPHER_TOO_LARGE");
 const digest=await p0bSha256(cipher);
 const key=prefix+now.toISOString().slice(0,10).replaceAll("-","")+
  "/"+batchId+"_"+crypto.randomUUID()+".json.gz";
 const put=await env.P0B_PRIVATE_FALLBACK_R2.put(key,cipher,{
  httpMetadata:{contentType:"application/gzip"}});
 if(!put)throw Error("P0B_R2_FALLBACK_PUT_UNVERIFIED");
 const expected={batch_id:batchId,object_key:key,cipher_sha256:digest,
  item_count:payloads.length};
 await restoreP0bR2Fallback(env,expected); // independent R2 GET+SHA+AES
 await env.DB.prepare(
  "INSERT INTO p0b_private_r2_fallback "+
  "(batch_id,object_key,cipher_sha256,item_count,state,created_at,next_retry_at) "+
  "VALUES (?,?,?,?,'PENDING_B2',?,?) ON CONFLICT(batch_id) DO NOTHING"
 ).bind(batchId,key,digest,payloads.length,now.toISOString(),now.toISOString()).run();
 const saved=await env.DB.prepare(
  "SELECT batch_id,object_key,cipher_sha256,item_count,state FROM p0b_private_r2_fallback WHERE batch_id=?"
 ).bind(batchId).first();
 if(!saved||saved.item_count!==payloads.length)
  throw Error("P0B_R2_FALLBACK_D1_INDEX_UNVERIFIED");
 // If a concurrent writer won the immutable batch ID, verify its actual
 // R2 ciphertext rather than falsely claiming our orphan object indexed.
 await restoreP0bR2Fallback(env,saved);
 return {verified:true,batchId,itemCount:payloads.length,
  pendingB2:saved.state!=="B2_VERIFIED",reused:false};
}
