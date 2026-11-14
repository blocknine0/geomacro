import {riskStreamOriginalClaims} from "../../control-plane/src/risk-stream-pipeline.mjs";

const MAX_BODY=32*1024;
const MAX_AGE=72*3600000;
const HEX=/^[a-f0-9]{64}$/u;
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const PARENT=/^[a-z0-9_.:-]{1,100}$/u;
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const ROLE_CATEGORIES=Object.freeze({
 GOVERNMENT_WIRE:new Set(["GEOPOLITICS"]),
 INDEPENDENT_REGIONAL:new Set(["GEOPOLITICS"]),
 OFFICIAL_STATISTICS:new Set(["MACRO_FX"]),
 MARKET_PRICE:new Set(["MACRO_FX"]),
 TRADE_CUSTOMS:new Set(["CRITICAL_MINERALS"]),
 INDEPENDENT_INDUSTRY:new Set(["CRITICAL_MINERALS"])
});
const text=new TextEncoder();
const fail=code=>{throw Error(code)};
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|");
const sha=async value=>{
 const result=await crypto.subtle.digest("SHA-256",text.encode(value));
 return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,"0")).join("");
};
const toB64=bytes=>{
 let binary="";for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
 return btoa(binary);
};
function constantTimeEqual(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length>256||b.length>256)return false;
 let difference=a.length^b.length;
 for(let i=0;i<256;i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return difference===0;
}
function validToken(value){return typeof value==="string"&&
 /^[A-Za-z0-9+/_=-]{32,256}$/u.test(value)}
function authenticated(request,env){
 const expected=env.FACTS_ATTESTER_BEARER_TOKEN;
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
function checkedUrl(value,root){
 let url;try{url=new URL(value)}catch{fail("SOURCE_URL_INVALID")}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
    url.href.length>2048||!(url.hostname===root||url.hostname.endsWith("."+root)))
  fail("SOURCE_HOST_MISMATCH");
}
async function validateOriginal(event,now){
 const keys=["schema","kind","country_iso3","category","feed_origin","event_key",
  "event_fingerprint","entities","source_id","source_url","publisher_root_domain",
  "parent_media_entity","source_role","published_at","original_page_sha256",
  "derived","raw_payload","proof","rights_verification"];
 if(!exact(event,keys)||event.schema!=="geomacro.risk-stream-candidate.v1"||
    event.kind!=="VERIFIED_ORIGINAL"||event.proof!==null||
    !/^[A-Z]{3}$/u.test(event.country_iso3??"")||!CATEGORIES.has(event.category)||
    !["RSS","WEBSITE_INTELLIGENCE","OFFICIAL_API"].includes(event.feed_origin)||
    !/^[A-Z0-9][A-Z0-9:_-]{6,119}$/u.test(event.event_key??"")||
    !HEX.test(event.event_fingerprint??"")||!SOURCE.test(event.source_id??"")||
    !DOMAIN.test(event.publisher_root_domain??"")||
    typeof event.parent_media_entity!=="string"||!PARENT.test(event.parent_media_entity)||
    !ROLE_CATEGORIES[event.source_role]?.has(event.category)||!HEX.test(event.original_page_sha256??""))
  fail("CANDIDATE_INVALID");
 if(!Array.isArray(event.entities)||event.entities.length<1||event.entities.length>12||
    event.entities.some(value=>typeof value!=="string"||! /^[A-Z0-9:_-]{2,64}$/u.test(value))||
    new Set(event.entities).size!==event.entities.length||
    event.entities.join("|")!==[...event.entities].sort().join("|"))fail("ENTITIES_INVALID");
 if(!exact(event.derived,["what","why","market","watch"])||
    Object.values(event.derived).some(value=>typeof value!=="string"||value.length<6||
     value.length>360||/https?:\/\/|<[^>]+>|[\r\n]/iu.test(value)))fail("DERIVED_INVALID");
 if(typeof event.raw_payload!=="string"||event.raw_payload.length<16||
    text.encode(event.raw_payload).byteLength>8000||event.raw_payload.length>8000)
  fail("RAW_PAYLOAD_INVALID");
 if(!exact(event.rights_verification,["registry_source_id","registry_enabled",
    "registry_commercial_rights_approved","authorization_reference",
    "independent_reviewer_id","checked_at_utc","rights_expires_at_utc"])||
    event.rights_verification.registry_source_id!==event.source_id||
    event.rights_verification.registry_enabled!==true||
    event.rights_verification.registry_commercial_rights_approved!==true||
    typeof event.rights_verification.authorization_reference!=="string"||
    event.rights_verification.authorization_reference.length<8||
    event.rights_verification.authorization_reference.length>512||
    typeof event.rights_verification.independent_reviewer_id!=="string"||
    event.rights_verification.independent_reviewer_id.length<3||
    !Number.isFinite(Date.parse(event.rights_verification.checked_at_utc))||
    !Number.isFinite(Date.parse(event.rights_verification.rights_expires_at_utc)))
  fail("RIGHTS_REVIEW_METADATA_INVALID");
 checkedUrl(event.source_url,event.publisher_root_domain);
 if(typeof event.published_at!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(event.published_at))
  fail("PUBLICATION_CLOCK_INVALID");
 const published=Date.parse(event.published_at);
 if(!Number.isFinite(published)||published>now||now-published>MAX_AGE)
  fail("PUBLICATION_CLOCK_OUT_OF_WINDOW");
 if(await sha(event.raw_payload)!==event.original_page_sha256)
  fail("ORIGINAL_PAGE_HASH_MISMATCH");
 const fingerprint=await sha(JSON.stringify([
  event.country_iso3,event.category,event.event_key,event.entities
 ]));
 if(fingerprint!==event.event_fingerprint)fail("EVENT_FINGERPRINT_MISMATCH");
}
async function signingKey(env){
 const encoded=env.FACTS_ATTESTER_PKCS8_B64;
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
export async function attestFacts(request,env,now=Date.now()){
 if(request.method!=="POST")return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(new URL(request.url).pathname!=="/v1/attest")
  return response({ok:false,error:"NOT_FOUND"},404);
 if(!authenticated(request,env))return response({ok:false,error:"UNAUTHORIZED"},401);
 let event,key;
 try{
  event=await bodyJson(request);await validateOriginal(event,now);key=await signingKey(env);
 }catch(error){
  const code=String(error?.message??"");
  const status=code==="SIGNING_KEY_UNAVAILABLE"?503:
   code==="BODY_TOO_LARGE"?413:400;
  return response({ok:false,error:code||"FACTS_ATTESTATION_REFUSED"},status);
 }
 const message="geomacro.machine-original-facts.v1\n"+riskStreamOriginalClaims(event);
 try{
  const signature=await crypto.subtle.sign("Ed25519",key,text.encode(message));
  return response({ok:true,proof:{facts_signature_b64:toB64(signature)}});
 }catch{return response({ok:false,error:"SIGNING_FAILED"},503)}
}
export default {fetch:attestFacts};
