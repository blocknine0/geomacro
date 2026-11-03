/**
 * P0-B Backblaze B2 encrypted durable spool. Uses S3 SigV4 (not a raw bearer
 * token), AES-256-GCM, exact remote GET+hash+decrypt verification, and the
 * existing account-wide D1 B2 quota ledger. No source payload enters public D1.
 */
import {reserveB2AccountQuota} from '../../workers/control-plane/src/b2-account-quota.mjs';

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
function objectKey(sourceId:string,sha:string,day:string){
 if(!ID.test(sourceId)||!SHA.test(sha)||!/^\d{8}$/u.test(day))throw Error('P0B_SPOOL_ID_INVALID');
 return 'spool/'+day+'/'+sourceId+'/'+sha+'.json';
}
function safeKey(uri:string,sha:string,sourceId:string){
 if(typeof uri!=='string'||!uri.startsWith('b2://'))throw Error('P0B_SPOOL_URI_INVALID');
 const key=uri.slice(5);
 if(!/^spool\/\d{8}\/[a-z0-9_.:-]{3,120}\/[a-f0-9]{64}\.json$/u.test(key)||
    !key.endsWith('/'+sha+'.json')||!key.split('/')[2]||key.split('/')[2]!==sourceId)
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
 return {endpoint:endpoint.origin,region};
}
export class B2SpoolManager {
 private env:B2SpoolEnv;
 private fetchImpl:typeof fetch;
 private reserve:(kind:'PUT'|'GET')=>Promise<void>;
 private now:()=>Date;
 private endpoint:string;
 private region:string;
 constructor(env:B2SpoolEnv,opts:SpoolDependencies={}){
  const {endpoint,region}=validateEnv(env);
  this.env=env;this.endpoint=endpoint;this.region=region;
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
    await p0bSha256(JSON.stringify(payload.rawPayload))!==sha)
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
  await this.reserve(method);
  const request=await this.signed(method,key,body);
  let response:Response;
  try{response=await this.fetchImpl(request.url,{method,headers:{
   ...request.headers,...(method==='PUT'?{'Content-Type':'application/json'}:{})
  },body:method==='PUT'?body:undefined,redirect:'error',
  signal:AbortSignal.timeout(10000)});}
  catch{throw Error('P0B_B2_'+method+'_UNAVAILABLE')}
  if(!response.ok)throw Error('P0B_B2_'+method+'_HTTP_'+response.status);
  if(method==='PUT')return new Uint8Array();
  const length=Number(response.headers.get('content-length')??'0');
  if(length>MAX_CIPHER_BYTES)throw Error('P0B_B2_GET_TOO_LARGE');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>MAX_CIPHER_BYTES)throw Error('P0B_B2_GET_TOO_LARGE');
  return bytes;
 }
 async spoolAndVerify(payload:SpoolPayload):Promise<SpoolReceipt>{
  if(!payload||!SHA.test(payload.candidateSha256)||!ID.test(payload.sourceId)||
    !Number.isFinite(Date.parse(payload.discoveredAt))||
    await p0bSha256(JSON.stringify(payload.rawPayload))!==payload.candidateSha256)
   throw Error('P0B_CANDIDATE_IDENTITY_INVALID');
  const day=this.now().toISOString().slice(0,10).replace(/-/gu,'');
  const key=objectKey(payload.sourceId,payload.candidateSha256,day);
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
  const key=safeKey(b2Uri,candidateSha256,sourceId);
  const bytes=await this.request('GET',key);
  return this.open(bytes,candidateSha256,sourceId);
 }
}
