#!/usr/bin/env node
/**
 * Feed-side adapter for direct risk-stream candidates and privately reviewed
 * same-event source candidates. Facts and reuse rights MUST be signed by
 * independent upstream machine attesters; this adapter never signs evidence.
 *
 * Private source records must be piped directly from a protected source
 * transformer. Do not capture this process's input or candidate payloads in
 * public logs/artifacts. Only aggregate counts are printed.
 */
import {createInterface} from "node:readline";
import {setTimeout as delay} from "node:timers/promises";
import {producePrivateIndependentRiskStreamCandidates}
 from "../lib/private-independent-risk-stream-producer.mjs";

const ENDPOINT="https://api.geomacro.live/v1/internal/risk-stream/events";
const token=String(process.env.GEOMACRO_STREAM_ADMIN_BEARER??"").trim();
if(token.length<32)throw Error("RISK_STREAM_PRODUCER_AUTH_MISSING");
const MAX=10,MAX_PRIVATE=96,MAX_LINE=32*1024;
const ALLOWED=new Set(["GDELT_INDEX","RSS","WEBSITE_INTELLIGENCE","OFFICIAL_API"]);
const PRIVATE_SCHEMA="geomacro.private-independent-event-source-candidate.v1";
let total=0,flushes=0,privateCount=0,privatePairs=0,privateClaims=0;
const privateCandidates=[];
let queue=[];
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
 if(line.length>MAX_LINE)throw Error("RISK_STREAM_PRODUCER_LINE_OVERSIZE");
 let x;try{x=JSON.parse(line)}catch{throw Error("RISK_STREAM_PRODUCER_JSON_INVALID")}
 if(x?.schema===PRIVATE_SCHEMA){
  if(privateCandidates.length>=MAX_PRIVATE)
   throw Error("RISK_STREAM_PRODUCER_PRIVATE_BATCH_LIMIT");
  privateCandidates.push(x);continue;
 }
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
if(privateCandidates.length){
 const result=producePrivateIndependentRiskStreamCandidates({
  candidates:privateCandidates,now:new Date()
 });
 privateCount=privateCandidates.length;
 privatePairs=result.qualifying_event_pairs;
 privateClaims=result.event_claims_examined;
 for(const candidate of result.candidates){
  queue.push(candidate);
  if(queue.length===MAX)await flush();
 }
}
await flush();
console.log(JSON.stringify({schema:"geomacro.risk-stream-producer.v1",
 status:privateCount&&privatePairs===0?"NO_QUALIFIED_TWO_ORIGINAL_PAIRS":
  "DURABLY_QUEUED_NOT_YET_VERIFIED",
 queued:total,flushes,private_source_candidates:privateCount,
 canonical_event_claims_examined:privateClaims,
 qualifying_independent_pairs:privatePairs,
 proof_signatures_created:false,
 commercial_delivery_certified:false,execution_authorized:false,payments:0,
 provider_503_guaranteed_zero:false}));
