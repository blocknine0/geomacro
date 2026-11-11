/**
 * Dedicated, isolated production-shadow Risk Stream Worker.
 * Never points at the live control-plane D1, R2 or delivery queue.
 * No customer route, payment, Risk Index certification or production release.
 */
import {enqueueRiskStreamEvents,processRiskStreamBatch}
  from "../../control-plane/src/risk-stream-pipeline.mjs";

const encoder=new TextEncoder();
const hex=async value=>Array.from(new Uint8Array(await crypto.subtle.digest(
  "SHA-256",typeof value==="string"?encoder.encode(value):value)),
  b=>b.toString(16).padStart(2,"0")).join("");
const fail=code=>{throw Error("STREAM_SHADOW_"+code)};
const safe=env=>env?.STREAM_MODE==="SHADOW_AUDIT"&&
  env.STREAM_INGESTION_ENABLED==="false"&&env.RISK_STREAM_ACTIVE==="0"&&
  env.DB?.prepare&&env.DB?.batch&&env.RISK_STREAM_PRIVATE_R2?.put&&
  env.RISK_STREAM_PRIVATE_R2?.get&&env.RISK_STREAM_QUEUE?.sendBatch;
const json=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function isAdmin(request,env){
 const header=request.headers.get("Authorization")||"";
 const expected=env?.STREAM_SHADOW_ADMIN_BEARER;
 if(typeof expected!=="string"||expected.length<32||
    !header.startsWith("Bearer ")||header.length>512)return false;
 const [a,b]=await Promise.all([hex(header.slice(7)),hex(expected)]);
 // Equal fixed-length SHA256 digests, no authorization token in logs.
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
const perc95=arr=>{
 if(!arr.length)return null;
 const a=[...arr].sort((x,y)=>x-y);
 return Math.round(a[Math.ceil(a.length*0.95)-1]*100)/100;
};
function instrument(db,m){
 const wrap=statement=>({
  raw:statement,
  bind(...args){return wrap(statement.bind(...args))},
  run(){return measure("run",()=>statement.run())},
  all(){return measure("all",()=>statement.all())},
  first(){return measure("first",()=>statement.first())}
 });
 async function measure(kind,task){
  const started=performance.now();
  try{return await task()}catch(e){
   if(/(?:HTTP[_ ]?503|\b503\b)/iu.test(String(e?.message||"")))
    m.d1_503_observed++;
   throw e;
  }finally{
   const elapsed=Math.max(0,performance.now()-started);
   m.d1_calls++;m.d1_latency_ms.push(elapsed);
   if(kind==="run"||kind==="batch")m.d1_write_latency_ms.push(elapsed);
  }
 }
 return {
  prepare(sql){return wrap(db.prepare(sql))},
  batch(statements){return measure("batch",()=>db.batch(statements.map(x=>x.raw)))}
 };
}
const fromB64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
async function verifyReadback(db,items,env){
 const fps=[...new Set(items.map(x=>x.event_fingerprint))];
 const rs=await db.prepare("SELECT gro_id,payload_json,payload_sha256,signature_b64 "+
   "FROM risk_stream_signed_gro WHERE event_fingerprint IN "+
   "(SELECT value FROM json_each(?)) LIMIT 100").bind(JSON.stringify(fps)).all();
 const rows=rs?.results;
 if(!Array.isArray(rows)||rows.length>99)fail("SIGNATURE_READBACK_TRUNCATED");
 const key=await crypto.subtle.importKey("spki",
   fromB64(env.RISK_STREAM_GRO_VERIFY_SPKI_B64),
   {name:"Ed25519"},false,["verify"]);
 for(const r of rows){
  let payload;try{payload=JSON.parse(r.payload_json)}catch{fail("GRO_JSON_INVALID")}
  if(await hex(r.payload_json)!==r.payload_sha256||
     payload.customer_delivery_authorized!==false||
     payload.charged!==false||payload.certified_risk_index!==false||
     payload.execution_authorized!==false||
     !await crypto.subtle.verify("Ed25519",key,fromB64(r.signature_b64),
       encoder.encode(r.payload_json)))fail("INDEPENDENT_GRO_READBACK_FAILED");
 }
 return rows.length;
}
export default {
 async fetch(request,env){
  if(!safe(env))return json({ok:false,error:"SHADOW_MODE_OR_BINDING_HOLD"},503);
  if(!await isAdmin(request,env))return json({ok:false,error:"UNAUTHORIZED"},401);
  const url=new URL(request.url);
  if(request.method==="POST"&&url.pathname==="/v1/internal/shadow/events"&&!url.search){
   let body;try{body=await request.json()}catch{return json({ok:false,error:"JSON_INVALID"},400)}
   if(body?.schema!=="geomacro.risk-stream-ingest-batch.v1"||
      !Array.isArray(body.items)||body.items.length<20||body.items.length>50)
    return json({ok:false,error:"SHADOW_EVENT_COUNT_MUST_BE_20_TO_50"},400);
   const response=await enqueueRiskStreamEvents(
     {...env,RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true"},body);
   return response;
  }
  if(request.method==="GET"&&url.pathname==="/v1/internal/shadow/receipts"&&!url.search){
   try{
    const r=await env.DB.prepare("SELECT batch_id,started_at,event_count,"+
      "corroborated_and_signed,verified_signature_readbacks,d1_calls,"+
      "d1_503_observed,d1_write_p95_ms,batch_elapsed_ms,result_status "+
      "FROM risk_stream_shadow_audit_receipts ORDER BY started_at DESC LIMIT 20").all();
    return json({schema:"geomacro.risk-stream-shadow-receipts.v1",rows:r.results??[],
      commercial_release:false,b2_network_calls_by_shadow:0});
   }catch{return json({ok:false,error:"SHADOW_RECEIPTS_D1_UNAVAILABLE"},503)}
  }
  return json({ok:false,error:"NOT_FOUND"},404);
 },
 async queue(batch,env){
  if(!safe(env)||batch?.queue!=="geomacro-risk-stream-shadow"||
     !Array.isArray(batch.messages)||batch.messages.length<1||
     batch.messages.length>10)fail("QUEUE_MODE_OR_BATCH_INVALID");
  const items=batch.messages.map(m=>m.body),started=performance.now(),
    startedAt=new Date().toISOString(),metrics={
      d1_calls:0,d1_503_observed:0,d1_latency_ms:[],d1_write_latency_ms:[]};
  const db=instrument(env.DB,metrics);
  const active={...env,DB:db,RISK_STREAM_ACTIVE:"1",
   STREAM_INGESTION_ENABLED:"true"};
  // Do NOT enqueue the internal delivery outbox: this Worker has NO delivery queue.
  // processRiskStreamBatch only creates internal signed candidates in isolated D1.
  try{
   const result=await processRiskStreamBatch(active,items);
   const verified=await verifyReadback(env.DB,items,env);
   if(verified<result.corroborated_and_signed)fail("SIGNED_READBACK_COUNT_DIVERGED");
   const batchId=await hex(JSON.stringify(items.map(x=>[x.event_fingerprint,x.source_id])));
   const elapsed=Math.round((performance.now()-started)*100)/100;
   const resultStatus=metrics.d1_503_observed===0?"PASS_ZERO_503":"HOLD_503_OBSERVED";
   const writeP95=perc95(metrics.d1_write_latency_ms);
   await env.DB.prepare("INSERT INTO risk_stream_shadow_audit_receipts "+
    "(batch_id,started_at,event_count,corroborated_and_signed,"+
    "verified_signature_readbacks,d1_calls,d1_503_observed,d1_write_p95_ms,"+
    "batch_elapsed_ms,result_status) VALUES (?,?,?,?,?,?,?,?,?,?) "+
    "ON CONFLICT(batch_id) DO UPDATE SET d1_503_observed=MAX("+
    "risk_stream_shadow_audit_receipts.d1_503_observed,excluded.d1_503_observed),"+
    "result_status=CASE WHEN risk_stream_shadow_audit_receipts.d1_503_observed>0 "+
    "OR excluded.d1_503_observed>0 THEN 'HOLD_503_OBSERVED' "+
    "ELSE excluded.result_status END")
    .bind(batchId,startedAt,items.length,result.corroborated_and_signed,
      verified,metrics.d1_calls,metrics.d1_503_observed,writeP95,
      elapsed,resultStatus).run();
   console.log(JSON.stringify({schema:"geomacro.shadow-audit-batch.v1",
     count:items.length,signed:result.corroborated_and_signed,
     signature_readbacks:verified,write_p95_ms:writeP95,
     d1_503_observed:metrics.d1_503_observed,
     d1_call_count:metrics.d1_calls,batch_elapsed_ms:elapsed,
     status:resultStatus,commercial_delivery:false,
     b2_calls:0,private_r2_readback:true}));
   for(const m of batch.messages)m.ack();
  }catch(e){
   for(const m of batch.messages)m.retry({delaySeconds:30});
   console.error("STREAM_SHADOW_BATCH_HOLD",String(e?.message||"unknown").slice(0,120));
   throw e;
  }
 }
};
