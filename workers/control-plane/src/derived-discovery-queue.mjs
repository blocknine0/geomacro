/**
 * Private, non-commercial derived discovery queue handoff.
 * Never acknowledges D1 durability from a Queue.send() response.
 * Only the atomic receipt written by websiteRiskRawAck is delivery proof.
 */
import {websiteRiskRawAck} from "./derived-risk-gate-website-raw.mjs";

export const DISCOVERY_QUEUE_NAME="geomacro-derived-discovery";
export const DISCOVERY_QUEUE_SCHEMA="geomacro.derived-discovery-queued-ack.v1";
const SHA=/^[0-9a-f]{64}$/u;
const CLOCK_SKEW=5*60_000;
const enc=new TextEncoder();
const out=(obj,status=200)=>Response.json(obj,{status,headers:{
  "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  "Retry-After":status===202?"5":"0",
}});
export async function sha256Text(value){
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value)));
  return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function signDerivedDiscoveryRequest(key,at,digest){
  if(typeof key!=="string"||key.length<32||!SHA.test(digest)||
     !/^[1-9][0-9]{12}$/u.test(String(at)))
    throw Error("DISCOVERY_MACHINE_ATTESTATION_INPUT_INVALID");
  const secret=await crypto.subtle.importKey("raw",enc.encode(key),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",secret,enc.encode(at+"."+digest));
  return [...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function equalHex(a,b){
  if(!SHA.test(a??"")||!SHA.test(b??""))return false;
  let diff=0;
  for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
export async function validateDiscoveryQueueAttestation(request,env,body,now=Date.now()){
  const at=request.headers.get("x-geomacro-request-at");
  const signature=request.headers.get("x-geomacro-request-mac");
  const digest=request.headers.get("x-geomacro-payload-sha256");
  if(!/^[1-9][0-9]{12}$/u.test(at??"")||!SHA.test(digest??"")||
     !SHA.test(signature??"")||!Number.isFinite(now)||
     Math.abs(Number(at)-now)>CLOCK_SKEW||
     !equalHex(digest,await sha256Text(JSON.stringify(body))))return false;
  const key=String(env?.CONTROL_PLANE_TOKEN??"");
  if(key.length<32)return false;
  return equalHex(signature,await signDerivedDiscoveryRequest(key,at,digest));
}
export async function enqueueDerivedDiscoveryAck(request,env,body,now=Date.now()){
  if(env?.DERIVED_DISCOVERY_QUEUE_ENABLED!=="1"||
     typeof env?.DERIVED_DISCOVERY_QUEUE?.send!=="function")
    return out({ok:false,error:"DERIVED_DISCOVERY_QUEUE_BINDING_UNAVAILABLE"},503);
  if(body?.schema!=="geomacro.derived-risk-discovery-bridge.v1"||
     body.lane!=="website_intelligence"||
     !SHA.test(body.page_sha256??"")||
     !Array.isArray(body.reviewed)||body.reviewed.length<1||
     body.reviewed.length>100||
     body.reviewed.some(x=>x.status!=="HOLD_SOURCE_ACCESS_OR_EXPRESSION"||
       x.commercialEligible!==false||!SHA.test(x.original_ref??"")))
    return out({ok:false,error:"DERIVED_DISCOVERY_QUEUE_PAYLOAD_INVALID"},400);
  if(!await validateDiscoveryQueueAttestation(request,env,body,now))
    return out({ok:false,error:"DERIVED_DISCOVERY_QUEUE_ATTESTATION_REJECTED"},401);
  const digest=await sha256Text(JSON.stringify(body));
  try{
    await env.DERIVED_DISCOVERY_QUEUE.send({
      schema:DISCOVERY_QUEUE_SCHEMA,digest,body,queued_at:new Date(now).toISOString(),
      commercialEligible:false,paidDeliveryAuthorized:false,
    });
  }catch{
    return out({ok:false,error:"DERIVED_DISCOVERY_QUEUE_SEND_UNAVAILABLE"},503);
  }
  return out({ok:true,schema:DISCOVERY_QUEUE_SCHEMA,queue_accepted:true,
    d1_atomic_readback_verified:false,ack_pending:true,digest,
    commercialEligible:false,paidDeliveryAuthorized:false},202);
}
export async function readDerivedDiscoveryAckReceipt(env,digest){
  if(!SHA.test(digest??""))return out({ok:false,error:"DISCOVERY_RECEIPT_ID_INVALID"},400);
  if(!env?.DB?.prepare)return out({ok:false,error:"DISCOVERY_RECEIPT_D1_UNAVAILABLE"},503);
  try{
    const row=await env.DB.prepare(
      "SELECT digest,lane,admitted,page_sha256 FROM derived_discovery_ack_receipts WHERE digest=?"
    ).bind(digest).first();
    if(!row)return out({ok:true,schema:DISCOVERY_QUEUE_SCHEMA,
      digest,ack_pending:true,d1_atomic_readback_verified:false},202);
    if(row.digest!==digest||row.lane!=="website_intelligence"||
       !Number.isSafeInteger(row.admitted)||row.admitted<1||
       row.admitted>100||!SHA.test(row.page_sha256??""))
      throw Error("DISCOVERY_RECEIPT_INVALID");
    return out({ok:true,schema:DISCOVERY_QUEUE_SCHEMA,digest,
      lane:row.lane,admitted:row.admitted,
      d1_atomic_readback_verified:true,cursor_advanced:true,
      commercialEligible:false,paidDeliveryAuthorized:false});
  }catch{return out({ok:false,error:"DISCOVERY_RECEIPT_D1_UNAVAILABLE"},503);}
}
export async function consumeDerivedDiscoveryQueue(batch,env){
  if(batch?.queue!==DISCOVERY_QUEUE_NAME||
     !Array.isArray(batch.messages))throw Error("DISCOVERY_QUEUE_SOURCE_INVALID");
  for(const message of batch.messages){
    const item=message.body;
    try{
      if(item?.schema!==DISCOVERY_QUEUE_SCHEMA||
         item?.body?.lane!=="website_intelligence"||
         !SHA.test(item.digest??"")||
         item.digest!==await sha256Text(JSON.stringify(item.body))||
         item.commercialEligible!==false||
         item.paidDeliveryAuthorized!==false)
        throw Error("DISCOVERY_QUEUE_MESSAGE_INTEGRITY_INVALID");
      // A retry may follow a D1 commit whose HTTP response was lost.
      const prior=await readDerivedDiscoveryAckReceipt(env,item.digest);
      if(prior.status===200){message.ack();continue;}
      if(prior.status!==202)throw Error("DISCOVERY_RECEIPT_STORE_UNAVAILABLE");
      const response=await websiteRiskRawAck(env,item.body);
      if(response.status!==200)throw Error("DISCOVERY_D1_ACK_NOT_COMMITTED");
      const doc=await response.json();
      if(doc?.ok!==true||doc?.d1_atomic_readback_verified!==true)
        throw Error("DISCOVERY_D1_ACK_UNVERIFIED");
      const confirmed=await readDerivedDiscoveryAckReceipt(env,item.digest);
      if(confirmed.status!==200)throw Error("DISCOVERY_QUEUE_READBACK_MISSING");
      message.ack();
    }catch{
      // Three additional retries (15,30,60 seconds), then Cloudflare's
      // configured DLQ receives the unacknowledged message.
      const attempt=Number.isSafeInteger(message.attempts)?message.attempts:1;
      message.retry({delaySeconds:[15,30,60][Math.min(Math.max(attempt-1,0),2)]});
    }
  }
}
