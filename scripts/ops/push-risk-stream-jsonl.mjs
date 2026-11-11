#!/usr/bin/env node
/**
 * Feed-side adapter for GDELT, RSS and website_intelligence.
 * Accepts pre-normalized source events as JSONL on stdin. Facts and commercial
 * reuse MUST be verified and signed by independent upstream machine attest-
 * ers; this adapter NEVER fabricates a signature or upgrades GDELT index hints.
 *
 * Usage: GEOMACRO_STREAM_ADMIN_BEARER=<existing protected bearer> \
 *   node scripts/ops/push-risk-stream-jsonl.mjs < signed-originals.jsonl
 *
 * The source poll/transformer process can pipe live observations into this
 * adapter continuously. Each 10 items become one durable Queue ingress call.
 */
import {createInterface} from "node:readline";
import {setTimeout as delay} from "node:timers/promises";

const ENDPOINT="https://api.geomacro.live/v1/internal/risk-stream/events";
const token=String(process.env.GEOMACRO_STREAM_ADMIN_BEARER??"").trim();
if(token.length<32)throw Error("RISK_STREAM_PRODUCER_AUTH_MISSING");
const MAX=10;
const ALLOWED=new Set(["GDELT_INDEX","RSS","WEBSITE_INTELLIGENCE","OFFICIAL_API"]);
let total=0,flushes=0,queue=[];
async function flush(){
 if(queue.length===0)return;
 const items=queue;queue=[];
 for(let attempt=0;attempt<4;attempt++){
  let r=null;
  try{
   r=await fetch(ENDPOINT,{method:"POST",redirect:"error",
    signal:AbortSignal.timeout(30000),
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",
     Accept:"application/json"},
    body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items})});
  }catch{ /* Transient private network failure, no source body logged. */ }
  if(r?.status===202){
   const result=await r.json();
   if(result.status!=="DURABLY_QUEUED_NOT_YET_VERIFIED"||
      result.accepted!==items.length)
    throw Error("RISK_STREAM_PRODUCER_QUEUE_RECEIPT_DIVERGED");
   total+=items.length;flushes++;return;
  }
  if(r&&![408,429,500,502,503,504].includes(r.status))
   throw Error("RISK_STREAM_PRODUCER_REQUEST_REJECTED_"+r.status);
  if(attempt===3)throw Error("RISK_STREAM_PRODUCER_DURABLE_QUEUE_UNAVAILABLE");
  await delay(Math.min(4000,200*2**attempt)+Math.floor(Math.random()*100));
 }
}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(!line.trim())continue;
 if(line.length>12000)throw Error("RISK_STREAM_PRODUCER_LINE_OVERSIZE");
 let x;try{x=JSON.parse(line)}catch{throw Error("RISK_STREAM_PRODUCER_JSON_INVALID")}
 if(!x||x.schema!=="geomacro.risk-stream-candidate.v1"||
    !ALLOWED.has(x.feed_origin))throw Error("RISK_STREAM_PRODUCER_FEED_INVALID");
 if(x.feed_origin==="GDELT_INDEX"&&x.kind!=="INDEX_ONLY")
  throw Error("RISK_STREAM_PRODUCER_GDELT_CANNOT_ATTEST_ORIGINAL");
 if(x.kind==="VERIFIED_ORIGINAL"&&
    (!x.proof?.facts_signature_b64||!x.proof?.rights_signature_b64))
  throw Error("RISK_STREAM_PRODUCER_INDEPENDENT_PROOFS_REQUIRED");
 queue.push(x);
 if(queue.length===MAX)await flush();
}
await flush();
console.log(JSON.stringify({schema:"geomacro.risk-stream-producer.v1",
 status:"DURABLY_QUEUED_NOT_YET_VERIFIED",
 queued:total,flushes,
 commercial_delivery_certified:false,provider_503_guaranteed_zero:false}));
