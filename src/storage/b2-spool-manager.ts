/**
 * P0-B Backblaze B2 encrypted durable spool. Uses S3 SigV4 (not a raw bearer
 * token), AES-256-GCM, exact remote GET+hash+decrypt verification, and the
 * existing account-wide D1 B2 quota ledger. No source payload enters public D1.
 */
import {reserveB2AccountQuota} from '../../workers/control-plane/src/b2-account-quota.mjs';
import {canonicalJson} from '../lib/canonical-json.ts';

export interface SpoolPayload {
 candidateSha256: string;
 sourceId: string;
 rawPayload: unknown;
 headers: Record<string,string>;
 discoveredAt: string;
}
export interface SpoolReceipt {
 b2Uri: string;
 byteSize: number;
 sha256: string;
 storedAt: string;
}
export interface B2SpoolEnv {
 DB: any;
 B2_S3_ENDPOINT: string;
 B2_KEY_ID: string;
 B2_APPLICATION_KEY: string;
 B2_SPOOL_BUCKET: string;
 B2_SPOOL_PREFIX?: string;
 B2_SPOOL_ENCRYPTION_KEY: string;
}
export type SpoolDependencies = {
 fetchImpl?: typeof fetch;
 reserve?: (kind:'PUT'|'GET')=>Promise<void>;
 now?: ()=>Date;
};
const ENCODER=new TextEncoder(),DECODER=new TextDecoder('utf-8',{fatal:true});
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9_.:-]{2,119}$/;
const BUCKET=/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const MAX_PLAIN_BYTES=256*1024,MAX_CIPHER_BYTES=1024*1024;
const HEX=(bytes:Uint8Array)=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const toBytes=(v:string|Uint8Array):ArrayBuffer=>{
 const input=typeof v==='string'?ENCODER.encode(v):v;
 const out=new ArrayBuffer(input.byteLength);
 new Uint8Array(out).set(input);
 return out;
};
export async function p0bSha256(v:string|Uint8Array){
 return HEX(new Uint8Array(await crypto.subtle.digest('SHA-256',toBytes(v))));
}
function base64(v:Uint8Array){let s='';for(const byte of v)s+=String.fromCharCode(byte);return btoa(s)}
function fromBase64(v:string){
 if(typeof v!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/u.test(v))throw Error('P0B_BASE64_INVALID');
 const value=atob(v);return Uint8Array.from(value,x=>x.charCodeAt(0));
}
async function hmac(key:Uint8Array,input:string){
 const k=await crypto.subtle.importKey('raw',toBytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,toBytes(input)));
}
function objectKey(sourceId:string,sha:string,day:string,prefix:string){
 if(!ID.test(sourceId)||!SHA.test(sha)||!/^\d{8}$/u.test(day))throw Error('P0B_SPOOL_ID_INVALID');
 return prefix+day+'/'+sourceId+'/'+sha+'.json';
}
function safeKey(uri:string,sha:string,sourceId:string,prefix:string){
 if(typeof uri!=='string'||!uri.startsWith('b2://'))throw Error('P0B_SPOOL_URI_INVALID');
 const key=uri.slice(5);
 const suffix=key.startsWith(prefix)?key.slice(prefix.length):'';
 if(!/^\d{8}\/[a-z0-9_.:-]{3,120}\/[a-f0-9]{64}\.json$/u.test(suffix)||
    !suffix.endsWith('/'+sha+'.json')||suffix.split('/')[1]!==sourceId)
  throw Error('P0B_SPOOL_URI_INVALID');
 return key;
}
function validateEnv(env:B2SpoolEnv){
 const endpoint=new URL(env?.B2_S3_ENDPOINT??'');
 if(endpoint.protocol!=='https:'||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||
   !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/u.test(endpoint.hostname)||
   !BUCKET.test(env.B2_SPOOL_BUCKET)||env.B2_KEY_ID?.length<5||
   env.B2_APPLICATION_KEY?.length<20||env.B2_SPOOL_ENCRYPTION_KEY?.length<32)
  throw Error('P0B_B2_CONFIGURATION_UNAVAILABLE');
 const region=endpoint.hostname.slice(3,-'.backblazeb2.com'.length);
 // Keep the original spool/ default while supporting B2 application keys
 // restricted to an already-owned, approved private archive prefix.
 const prefix=env.B2_SPOOL_PREFIX??'spool/';
 if(prefix.length>220||!/^(?:[a-zA-Z0-9._+-]+\/)*spool\/$/u.test(prefix)||
    prefix.includes('../')||prefix.includes('/./'))
  throw Error('P0B_SPOOL_PREFIX_INVALID');
 return {endpoint:endpoint.origin,region,prefix};
}

const BUNDLE_MAX_ITEMS=100, BUNDLE_MAX_PLAIN_BYTES=512*1024;
async function zipped(bytes:Uint8Array,mode:'gzip'|'ungzip'){
 const stream=new Blob([toBytes(bytes)]).stream().pipeThrough(
  mode==='gzip'?new CompressionStream('gzip'):new DecompressionStream('gzip'));
 const result=new Uint8Array(await new Response(stream).arrayBuffer());
 if(result.length>2*BUNDLE_MAX_PLAIN_BYTES)throw Error('P0B_BUNDLE_DECOMPRESSION_LIMIT');
 return result;
}
function bundleKey(prefix:string,day:string,group:string,stamp:string,sha:string){
 if(!/^\d{8}$/u.test(day)||!ID.test(group)||!/^\d{8}T\d{6}Z$/u.test(stamp)||
  !SHA.test(sha))throw Error('P0B_BUNDLE_KEY_INVALID');
 return prefix+day+'/'+group+'/bundle_'+stamp+'_'+sha+'.json.gz';
}
function verifiedBundleKey(uri:string,prefix:string){
 if(typeof uri!=='string'||!uri.startsWith('b2://'+prefix))
  throw Error('P0B_BUNDLE_URI_INVALID');
 const key=uri.slice(5),suffix=key.slice(prefix.length);
 const match=/^(\d{8})\/([a-z0-9][a-z0-9_.:-]{2,119})\/bundle_(\d{8}T\d{6}Z)_([a-f0-9]{64})\.json\.gz$/u.exec(suffix);
 if(!match)throw Error('P0B_BUNDLE_URI_INVALID');
 return {key,sha:match[4]};
}

export class B2SpoolManager {
 private env:B2SpoolEnv;
 private fetchImpl:typeof fetch;
 private reserve:(kind:'PUT'|'GET')=>Promise<void>;
 private now:()=>Date;
 private endpoint:string;
 private region:string;
 private prefix:string;
 constructor(env:B2SpoolEnv,opts:SpoolDependencies={}){
  const {endpoint,region,prefix}=validateEnv(env);
  this.env=env;this.endpoint=endpoint;this.region=region;this.prefix=prefix;
  this.fetchImpl=opts.fetchImpl??fetch;
  this.now=opts.now??(()=>new Date());
  this.reserve=opts.reserve??(async kind=>{
   const result=await reserveB2AccountQuota(env.DB,
    {kind,workflow_id:'p0b_durable_spool'},{now:this.now()});
   if(!result.ok||!result.reserved)throw Error('P0B_B2_QUOTA_HELD');
  });
 }
 private async aesKey(){
  const hash=await crypto.subtle.digest('SHA-256',ENCODER.encode(this.env.B2_SPOOL_ENCRYPTION_KEY));
  return crypto.subtle.importKey('raw',hash,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 private async seal(payload:SpoolPayload){
  const raw=JSON.stringify(payload);
  const plain=ENCODER.encode(raw);
  if(plain.length>MAX_PLAIN_BYTES)throw Error('P0B_SPOOL_PLAIN_TOO_LARGE');
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({
   name:'AES-GCM',iv:toBytes(nonce),
   additionalData:toBytes(payload.sourceId+'|'+payload.candidateSha256)
  },await this.aesKey(),toBytes(plain)));
  const envelope={
   schema:'geomacro.p0b-encrypted-spool.v1',algorithm:'AES-256-GCM',
   nonce:base64(nonce),ciphertext:base64(cipher),
   plaintext_sha256:await p0bSha256(plain)
  };
  const bytes=ENCODER.encode(JSON.stringify(envelope));
  if(bytes.length>MAX_CIPHER_BYTES)throw Error('P0B_SPOOL_CIPHER_TOO_LARGE');
  return bytes;
 }
 private async open(bytes:Uint8Array,sha:string,sourceId:string):Promise<SpoolPayload>{
  if(bytes.length>MAX_CIPHER_BYTES)throw Error('P0B_SPOOL_CIPHER_TOO_LARGE');
  let envelope:any;
  try{envelope=JSON.parse(DECODER.decode(bytes))}catch{throw Error('P0B_SPOOL_CIPHER_INVALID')}
  if(envelope?.schema!=='geomacro.p0b-encrypted-spool.v1'||
     envelope.algorithm!=='AES-256-GCM'||!SHA.test(envelope.plaintext_sha256??''))
   throw Error('P0B_SPOOL_CIPHER_INVALID');
  let plain:Uint8Array;
  try{plain=new Uint8Array(await crypto.subtle.decrypt({
   name:'AES-GCM',iv:toBytes(fromBase64(envelope.nonce)),
   additionalData:toBytes(sourceId+'|'+sha)
  },await this.aesKey(),toBytes(fromBase64(envelope.ciphertext))));}
  catch{throw Error('P0B_SPOOL_AUTHENTICATION_FAILED')}
  if(plain.length>MAX_PLAIN_BYTES||await p0bSha256(plain)!==envelope.plaintext_sha256)
   throw Error('P0B_SPOOL_INTEGRITY_MISMATCH');
  let payload:SpoolPayload;
  try{payload=JSON.parse(DECODER.decode(plain))}catch{throw Error('P0B_SPOOL_PAYLOAD_INVALID')}
  if(payload.sourceId!==sourceId||payload.candidateSha256!==sha||
    await p0bSha256(canonicalJson(payload.rawPayload))!==sha)
   throw Error('P0B_SPOOL_CONTENT_ID_MISMATCH');
  return payload;
 }
 private async signed(method:'PUT'|'GET',key:string,body:Uint8Array){
  const at=this.now(),time=at.toISOString().replace(/[:-]|\.\d{3}/gu,'');
  const date=time.slice(0,8),path='/'+[this.env.B2_SPOOL_BUCKET,...key.split('/')].map(encodeURIComponent).join('/');
  const host=new URL(this.endpoint).host,payloadHash=await p0bSha256(body);
  const headers='host:'+host+'\n'+'x-amz-content-sha256:'+payloadHash+'\n'+'x-amz-date:'+time+'\n';
  const signedHeaders='host;x-amz-content-sha256;x-amz-date';
  const scope=date+'/'+this.region+'/s3/aws4_request';
  const canonical=[method,path,'',headers,signedHeaders,payloadHash].join('\n');
  const stringToSign=['AWS4-HMAC-SHA256',time,scope,await p0bSha256(canonical)].join('\n');
  const kDate=await hmac(ENCODER.encode('AWS4'+this.env.B2_APPLICATION_KEY),date);
  const kRegion=await hmac(kDate,this.region),kService=await hmac(kRegion,'s3');
  const keySignature=await hmac(kService,'aws4_request');
  const signature=HEX(await hmac(keySignature,stringToSign));
  return {url:this.endpoint+path,headers:{
   'x-amz-content-sha256':payloadHash,'x-amz-date':time,
   Authorization:'AWS4-HMAC-SHA256 Credential='+this.env.B2_KEY_ID+'/'+scope+
    ', SignedHeaders='+signedHeaders+', Signature='+signature
  }};
 }
 private async request(method:'PUT'|'GET',key:string,body=new Uint8Array(0)){
  // A transient network timeout can happen even after B2 received a PUT.
  // Repeating the same immutable key and EXACT SAME ciphertext bytes is
  // idempotent; every attempt consumes its own shared B2 quota reservation.
  // Never retry real HTTP rejection (401/403/429), bad signatures, or
  // unverified response bodies. Only 1 transport retry is permitted.
  const request=await this.signed(method,key,body);
  for(let attempt=0;attempt<2;attempt++){
   await this.reserve(method);
   let response:Response;
   try{
    response=await this.fetchImpl(request.url,{method,headers:{
     ...request.headers,...(method==='PUT'?{'Content-Type':key.endsWith('.gz')?
      'application/gzip':'application/json'}:{})
    },body:method==='PUT'?(attempt===0?body:toBytes(body)):undefined,
    // A cross-host S3 redirect invalidates the signed Host header. Diagnose
    // 3xx as exact HTTP status but never follow or proxy upstream secrets.
    redirect:'manual',
    signal:AbortSignal.timeout(attempt===0?10000:16000)});
   }catch(error){
    if(attempt===0)continue;
    const code=error instanceof Error&&error.name==='TimeoutError'?
      'TIMEOUT':'TRANSPORT_UNAVAILABLE';
    throw Error('P0B_B2_'+method+'_'+code);
   }
   if(!response.ok)throw Error('P0B_B2_'+method+'_HTTP_'+response.status);
   if(method==='PUT')return new Uint8Array();
   const length=Number(response.headers.get('content-length')??'0');
   if(length>MAX_CIPHER_BYTES)throw Error('P0B_B2_GET_TOO_LARGE');
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length>MAX_CIPHER_BYTES)throw Error('P0B_B2_GET_TOO_LARGE');
   return bytes;
  }
  throw Error('P0B_B2_'+method+'_TRANSPORT_UNAVAILABLE');
 }
 async spoolAndVerify(payload:SpoolPayload):Promise<SpoolReceipt>{
  if(!payload||!SHA.test(payload.candidateSha256)||!ID.test(payload.sourceId)||
    !Number.isFinite(Date.parse(payload.discoveredAt))||
    await p0bSha256(canonicalJson(payload.rawPayload))!==payload.candidateSha256)
   throw Error('P0B_CANDIDATE_IDENTITY_INVALID');
  const day=this.now().toISOString().slice(0,10).replace(/-/gu,'');
  const key=objectKey(payload.sourceId,payload.candidateSha256,day,this.prefix);
  const bytes=await this.seal(payload);
  await this.request('PUT',key,bytes);
  const restored=await this.request('GET',key);
  if(restored.length!==bytes.length||await p0bSha256(restored)!==await p0bSha256(bytes))
   throw Error('P0B_B2_SPOOL_INTEGRITY_MISMATCH');
  await this.open(restored,payload.candidateSha256,payload.sourceId);
  return {b2Uri:'b2://'+key,byteSize:bytes.length,
   sha256:payload.candidateSha256,storedAt:this.now().toISOString()};
 }
 async readVerified(b2Uri:string,candidateSha256:string,sourceId:string){
  const key=safeKey(b2Uri,candidateSha256,sourceId,this.prefix);
  const bytes=await this.request('GET',key);
  return this.open(bytes,candidateSha256,sourceId);
 }

 async spoolBundleAndVerify(payloads:SpoolPayload[]){
  if(!Array.isArray(payloads)||payloads.length<1||payloads.length>BUNDLE_MAX_ITEMS)
   throw Error('P0B_BUNDLE_ITEM_COUNT_INVALID');
  const index:{candidateSha256:string;sourceId:string;byteOffset:number;byteLength:number}[]=[];
  const lines:Uint8Array[]=[];let offset=0;
  const seen=new Set<string>();
  for(const p of payloads){
   if(!p||!SHA.test(p.candidateSha256)||!ID.test(p.sourceId)||
    !Number.isFinite(Date.parse(p.discoveredAt))||seen.has(p.candidateSha256)||
    await p0bSha256(canonicalJson(p.rawPayload))!==p.candidateSha256)
    throw Error('P0B_BUNDLE_CANDIDATE_INVALID');
   seen.add(p.candidateSha256);
   const line=ENCODER.encode(canonicalJson({candidateSha256:p.candidateSha256,
    sourceId:p.sourceId,rawPayload:p.rawPayload,discoveredAt:p.discoveredAt})+'\n');
   if(line.length>MAX_PLAIN_BYTES||offset+line.length>BUNDLE_MAX_PLAIN_BYTES)
    throw Error('P0B_BUNDLE_PLAIN_TOO_LARGE');
   index.push({candidateSha256:p.candidateSha256,sourceId:p.sourceId,
    byteOffset:offset,byteLength:line.length});lines.push(line);offset+=line.length;
  }
  const bytes=new Uint8Array(offset);let at=0;
  for(const line of lines){bytes.set(line,at);at+=line.length;}
  const plain=ENCODER.encode(canonicalJson({
   schema:'geomacro.p0b.microbatch.v1',index,payload_base64:base64(bytes)}));
  if(plain.length>2*BUNDLE_MAX_PLAIN_BYTES)throw Error('P0B_BUNDLE_PLAIN_TOO_LARGE');
  const batchSha256=await p0bSha256(plain);
  const compressed=await zipped(plain,'gzip');
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({
   name:'AES-GCM',iv:toBytes(nonce),additionalData:toBytes('p0b.bundle|'+batchSha256)
  },await this.aesKey(),toBytes(compressed)));
  const envelope=ENCODER.encode(canonicalJson({
   schema:'geomacro.p0b.encrypted-microbatch.v1',algorithm:'AES-256-GCM',
   batch_sha256:batchSha256,compressed_sha256:await p0bSha256(compressed),
   item_count:index.length,nonce:base64(nonce),ciphertext:base64(ciphertext)
  }));
  const object=await zipped(envelope,'gzip');
  if(object.length>MAX_CIPHER_BYTES)throw Error('P0B_BUNDLE_CIPHER_TOO_LARGE');
  const stamp=this.now().toISOString().replace(/[-:]/gu,'').replace(/\.\d{3}/u,'');
  const day=stamp.slice(0,8);
  const group=new Set(payloads.map(p=>p.sourceId)).size===1?payloads[0].sourceId:'mixed';
  const key=bundleKey(this.prefix,day,group,stamp,batchSha256);
  await this.request('PUT',key,object);
  const readback=await this.request('GET',key);
  if(readback.length!==object.length||
   await p0bSha256(readback)!==await p0bSha256(object))
   throw Error('P0B_B2_BUNDLE_INTEGRITY_MISMATCH');
  const restored=await this.decodeBundle(readback,batchSha256);
  if(restored.items.length!==index.length)throw Error('P0B_BUNDLE_ITEM_READBACK_MISMATCH');
  return {b2Uri:'b2://'+key,byteSize:object.length,batchSha256,
   storedAt:this.now().toISOString(),items:index};
 }
 private async decodeBundle(object:Uint8Array,batchSha256:string){
  if(object.length>MAX_CIPHER_BYTES)throw Error('P0B_BUNDLE_CIPHER_TOO_LARGE');
  let env:any;
  try{env=JSON.parse(DECODER.decode(await zipped(object,'ungzip')))}
  catch{throw Error('P0B_BUNDLE_CIPHER_INVALID')}
  if(env?.schema!=='geomacro.p0b.encrypted-microbatch.v1'||
   env.algorithm!=='AES-256-GCM'||env.batch_sha256!==batchSha256||
   !SHA.test(env.compressed_sha256??'')||!Number.isInteger(env.item_count)||
   env.item_count<1||env.item_count>BUNDLE_MAX_ITEMS)
   throw Error('P0B_BUNDLE_CIPHER_INVALID');
  let compressed:Uint8Array;
  try{compressed=new Uint8Array(await crypto.subtle.decrypt({
   name:'AES-GCM',iv:toBytes(fromBase64(env.nonce)),
   additionalData:toBytes('p0b.bundle|'+batchSha256)
  },await this.aesKey(),toBytes(fromBase64(env.ciphertext))));}
  catch{throw Error('P0B_BUNDLE_AUTHENTICATION_FAILED')}
  if(await p0bSha256(compressed)!==env.compressed_sha256)
   throw Error('P0B_BUNDLE_INTEGRITY_MISMATCH');
  let bundle:any,plain:Uint8Array;
  try{plain=await zipped(compressed,'ungzip');
   if(await p0bSha256(plain)!==batchSha256)throw Error('HASH');
   bundle=JSON.parse(DECODER.decode(plain));}
  catch{throw Error('P0B_BUNDLE_INTEGRITY_MISMATCH')}
  if(bundle?.schema!=='geomacro.p0b.microbatch.v1'||
    !Array.isArray(bundle.index)||bundle.index.length!==env.item_count)
   throw Error('P0B_BUNDLE_MANIFEST_INVALID');
  const payload=fromBase64(bundle.payload_base64),items:SpoolPayload[]=[];
  let nextOffset=0;const seen=new Set<string>();
  for(const i of bundle.index){
   if(!SHA.test(i?.candidateSha256??'')||!ID.test(i?.sourceId??'')||
    !Number.isInteger(i.byteOffset)||!Number.isInteger(i.byteLength)||
    i.byteOffset!==nextOffset||i.byteLength<1||i.byteLength>MAX_PLAIN_BYTES||
    seen.has(i.candidateSha256)||i.byteOffset+i.byteLength>payload.length)
    throw Error('P0B_BUNDLE_MANIFEST_INVALID');
   nextOffset+=i.byteLength;seen.add(i.candidateSha256);
   let item:any;
   try{item=JSON.parse(DECODER.decode(payload.subarray(i.byteOffset,nextOffset)))}
   catch{throw Error('P0B_BUNDLE_ITEM_INVALID')}
   if(item.candidateSha256!==i.candidateSha256||item.sourceId!==i.sourceId||
    await p0bSha256(canonicalJson(item.rawPayload))!==i.candidateSha256||
    !Number.isFinite(Date.parse(item.discoveredAt)))
    throw Error('P0B_BUNDLE_ITEM_HASH_MISMATCH');
   items.push({candidateSha256:i.candidateSha256,sourceId:i.sourceId,
    rawPayload:item.rawPayload,headers:{},discoveredAt:item.discoveredAt});
  }
  if(nextOffset!==payload.length||payload.length>BUNDLE_MAX_PLAIN_BYTES)
   throw Error('P0B_BUNDLE_MANIFEST_INVALID');
  return {batchSha256,items,index:bundle.index};
 }
 async readBundleVerified(b2Uri:string,expectedSha256:string){
  const {key,sha}=verifiedBundleKey(b2Uri,this.prefix);
  if(!SHA.test(expectedSha256)||expectedSha256!==sha)
   throw Error('P0B_BUNDLE_URI_HASH_MISMATCH');
  return this.decodeBundle(await this.request('GET',key),expectedSha256);
 }

}
