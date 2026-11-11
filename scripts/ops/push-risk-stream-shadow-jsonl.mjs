#!/usr/bin/env node
// Reads 20-50 real observed, pre-normalized JSONL candidates from stdin.
// Never asserts original attestation from unverified GDELT index results.
// Requires the isolated SHADOW Worker URL, not api.geomacro.live.
import {createInterface} from "node:readline";
const url=String(process.env.RISK_STREAM_SHADOW_URL||"");
const bearer=String(process.env.STREAM_SHADOW_ADMIN_BEARER||"");
if(!/^https:\/\/[a-z0-9-]+[.][a-z0-9-]+[.]workers[.]dev\/v1\/internal\/shadow\/events$/iu.test(url))
 throw Error("SHADOW_WORKERS_DEV_ENDPOINT_REQUIRED");
if(bearer.length<32)throw Error("SHADOW_ADMIN_AUTH_MISSING");
const items=[];
for await(const raw of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(!raw.trim())continue;
 if(raw.length>12000||items.length>=50)throw Error("SHADOW_EVENT_COUNT_OR_SIZE_INVALID");
 let item;try{item=JSON.parse(raw)}catch{throw Error("SHADOW_CANDIDATE_JSON_INVALID")}
 if(item?.schema!=="geomacro.risk-stream-candidate.v1"||
    !["GDELT_INDEX","RSS","WEBSITE_INTELLIGENCE","OFFICIAL_API"].includes(item.feed_origin)||
    (item.feed_origin==="GDELT_INDEX"&&item.kind!=="INDEX_ONLY")||
    (item.kind==="VERIFIED_ORIGINAL"&&
      (!item.proof?.facts_signature_b64||!item.proof?.rights_signature_b64)))
   throw Error("SHADOW_CANDIDATE_ORIGINALITY_UNVERIFIED");
 items.push(item);
}
if(items.length<20)throw Error("SHADOW_REQUIRES_20_TO_50_REAL_EVENTS");
const r=await fetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(30000),
 headers:{Authorization:"Bearer "+bearer,"Content-Type":"application/json"},
 body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items})});
if(r.status!==202)throw Error("SHADOW_INGEST_REJECTED_"+r.status);
const response=await r.json();
if(response.status!=="DURABLY_QUEUED_NOT_YET_VERIFIED"||
   response.accepted!==items.length||response.commercial_delivery!==false)
 throw Error("SHADOW_INGEST_RECEIPT_UNVERIFIED");
console.log(JSON.stringify({status:"SHADOW_DURABLY_QUEUED_NOT_YET_VERIFIED",
 accepted:items.length,signature_readbacks:"PENDING_QUEUE_CONSUMPTION",
 d1_503:"PENDING_PROVIDER_RECEIPT",commercial_delivery:false}));
