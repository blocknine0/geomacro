import {riskStreamOriginalClaims} from "../../control-plane/src/risk-stream-pipeline.mjs";

const MAX_BODY=32*1024;
const text=new TextEncoder();
const fail=code=>{throw Error(code)};
function constantTimeEqual(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length>256||b.length>256)return false;
 let difference=a.length^b.length;
 for(let i=0;i<256;i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return difference===0;
}
function validToken(value){return typeof value==="string"&&
 /^[A-Za-z0-9+/_=-]{32,256}$/u.test(value)}
function authenticated(request,env){
 const expected=env.RIGHTS_ATTESTER_BEARER_TOKEN;
 const header=request.headers.get("authorization")??"";
 return validToken(expected)&&header.startsWith("Bearer ")&&
  constantTimeEqual(header.slice(7),expected);
}
async function bodyJson(request){
 const length=request.headers.get("content-length");
 if(length!==null&&(!/^\d+$/u.test(length)||Number(length)>MAX_BODY))fail("BODY_TOO_LARGE");
 if(!request.body)fail("BODY_INVALID");
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();fail("BODY_TOO_LARGE")}
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
 catch{fail("BODY_INVALID")}
}
function toB64(bytes){
 let binary="";for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
 return btoa(binary);
}
async function signingKey(env){
 const encoded=env.RIGHTS_ATTESTER_PKCS8_B64;
 if(typeof encoded!=="string"||! /^[A-Za-z0-9+/]+={0,2}$/u.test(encoded))
  fail("SIGNING_KEY_UNAVAILABLE");
 let raw;
 try{raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))}catch{fail("SIGNING_KEY_UNAVAILABLE")}
 if(raw.length!==48||toB64(raw)!==encoded)fail("SIGNING_KEY_UNAVAILABLE");
 try{
  const key=await crypto.subtle.importKey("pkcs8",raw,{name:"Ed25519"},false,["sign"]);
  if(key.algorithm?.name!=="Ed25519")fail("SIGNING_KEY_UNAVAILABLE");
  return key;
 }catch{fail("SIGNING_KEY_UNAVAILABLE")}
}
function response(body,status=200){
 return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
}
function isoExpiry(value){
 if(typeof value!=="string")return NaN;
 const normalized=/^\d{4}-\d\d-\d\d$/u.test(value)?value+"T00:00:00.000Z":value;
 return Date.parse(normalized);
}
async function registrySource(env,sourceId){
 if(!env.SOURCE_REGISTRY_READONLY?.prepare)fail("SOURCE_REGISTRY_BINDING_UNAVAILABLE");
 const statement=env.SOURCE_REGISTRY_READONLY.prepare(
  "SELECT source_id,publisher_root_domain,parent_media_entity,source_role,enabled,commercial_rights_approved,rights_expire_at FROM risk_stream_sources WHERE source_id = ? LIMIT 1");
 if(!statement?.bind)fail("SOURCE_REGISTRY_BINDING_UNAVAILABLE");
 return statement.bind(sourceId).first();
}
function sourceMatches(event,row,now){
 if(!row||row.source_id!==event.source_id||row.enabled!==1||
    row.commercial_rights_approved!==1||
    row.publisher_root_domain!==event.publisher_root_domain||
    row.parent_media_entity!==event.parent_media_entity||
    row.source_role!==event.source_role)return false;
 const expiry=isoExpiry(row.rights_expire_at);
 return Number.isFinite(expiry)&&expiry>now;
}
export async function attestRights(request,env,now=Date.now()){
 if(request.method!=="POST")return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(new URL(request.url).pathname!=="/v1/attest")
  return response({ok:false,error:"NOT_FOUND"},404);
 if(!authenticated(request,env))return response({ok:false,error:"UNAUTHORIZED"},401);
 let event,key,row;
 try{
  event=await bodyJson(request);
  if(!event||event.schema!=="geomacro.risk-stream-candidate.v1"||
     event.kind!=="VERIFIED_ORIGINAL"||event.proof!==null||
     typeof event.source_id!=="string"||typeof event.publisher_root_domain!=="string"||
     typeof event.parent_media_entity!=="string"||typeof event.source_role!=="string")
   fail("CANDIDATE_INVALID");
  row=await registrySource(env,event.source_id);
  if(!sourceMatches(event,row,now))fail("SOURCE_RIGHTS_UNVERIFIED_OR_EXPIRED");
  key=await signingKey(env);
 }catch(error){
  const code=String(error?.message??"");
  const status=code==="SIGNING_KEY_UNAVAILABLE"||code==="SOURCE_REGISTRY_BINDING_UNAVAILABLE"?503:
   code==="BODY_TOO_LARGE"?413:code==="SOURCE_RIGHTS_UNVERIFIED_OR_EXPIRED"?403:400;
  return response({ok:false,error:code||"RIGHTS_ATTESTATION_REFUSED"},status);
 }
 const message="geomacro.machine-commercial-rights.v1\n"+riskStreamOriginalClaims(event);
 try{
  const signature=await crypto.subtle.sign("Ed25519",key,text.encode(message));
  return response({ok:true,proof:{rights_signature_b64:toB64(signature)}});
 }catch{return response({ok:false,error:"SIGNING_FAILED"},503)}
}
export default {fetch:attestRights};
