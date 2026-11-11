import {test} from "node:test";
import assert from "node:assert/strict";
import shadow from "../../workers/risk-stream-shadow/src/index.mjs";
const request=new Request("https://shadow.example/v1/internal/shadow/events",{
 method:"POST",headers:{Authorization:"Bearer "+"a".repeat(40)},
 body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items:[]})});
const env={DB:{prepare(){throw Error("MUST_NOT_TOUCH_PROD")},batch(){}},
 RISK_STREAM_PRIVATE_R2:{put(){},get(){}},
 RISK_STREAM_QUEUE:{sendBatch(){throw Error("MUST_NOT_QUEUE")}},
 STREAM_SHADOW_ADMIN_BEARER:"a".repeat(40),RISK_STREAM_ACTIVE:"0",
 STREAM_INGESTION_ENABLED:"false",STREAM_MODE:"SHADOW_AUDIT"};
test("production stream flag can never be enabled for shadow mode",async()=>{
 const r=await shadow.fetch(request,{...env,STREAM_INGESTION_ENABLED:"true"});
 assert.equal(r.status,503);
 const r2=await shadow.fetch(request,{...env,RISK_STREAM_ACTIVE:"1"});
 assert.equal(r2.status,503);
});
test("isolated worker cannot process in LIVE production mode",async()=>{
 const r=await shadow.fetch(request,{...env,STREAM_MODE:"LIVE"});
 assert.equal(r.status,503);
});
test("shadow sample requires 20 to 50 real candidates",async()=>{
 const r=await shadow.fetch(request,env);
 assert.equal(r.status,400);
});
test("shadow consumer will not ack unknown queue or commercial context",async()=>{
 await assert.rejects(
  shadow.queue({queue:"geomacro-risk-stream-delivery",messages:[{body:{},ack(){}}]},env),
  /STREAM_SHADOW_QUEUE_MODE_OR_BATCH_INVALID/u);
});
test("missing protected operator token always denies",async()=>{
 const r=await shadow.fetch(request,{...env,STREAM_SHADOW_ADMIN_BEARER:""});
 assert.equal(r.status,401);
});
