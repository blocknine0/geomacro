import test from "node:test";
import assert from "node:assert/strict";
import {
 DISCOVERY_QUEUE_NAME,DISCOVERY_QUEUE_SCHEMA,sha256Text,
 signDerivedDiscoveryRequest,enqueueDerivedDiscoveryAck,
 readDerivedDiscoveryAckReceipt,consumeDerivedDiscoveryQueue
} from "../../workers/control-plane/src/derived-discovery-queue.mjs";
const key="d".repeat(64),ref="a".repeat(64);
const body={schema:"geomacro.derived-risk-discovery-bridge.v1",
 lane:"website_intelligence",page_sha256:"b".repeat(64),
 checked_at:new Date().toISOString(),next_cursor:{cursor_at:new Date().toISOString(),cursor_ref:"geopolitics-deadbeef"},
 reviewed:Array.from({length:12},(_,i)=>({
  original_ref:i.toString(16).padStart(64,"0"),
  status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",commercialEligible:false
 }))};
async function request(packet,headers={}){
 const at=String(Date.now()),digest=await sha256Text(JSON.stringify(packet));
 return new Request("https://internal.invalid/v1/internal/risk-gate/derived-discovery",{
  method:"POST",headers:{"x-geomacro-request-at":at,
   "x-geomacro-payload-sha256":digest,
   "x-geomacro-request-mac":await signDerivedDiscoveryRequest(key,at,digest),...headers}
 });
}
test("12 real-shape private derived records are enqueued, not falsely acknowledged",async()=>{
 const sent=[],env={CONTROL_PLANE_TOKEN:key,DERIVED_DISCOVERY_QUEUE_ENABLED:"1",
   DERIVED_DISCOVERY_QUEUE:{send:async msg=>sent.push(msg)}};
 const response=await enqueueDerivedDiscoveryAck(await request(body),env,body);
 assert.equal(response.status,202);
 assert.equal(sent.length,1);
 assert.equal(sent[0].body.reviewed.length,12);
 assert.equal((await response.json()).d1_atomic_readback_verified,false);
 assert.equal(sent[0].commercialEligible,false);
});
test("machine timestamp, hash and MAC prevent tamper and replay",async()=>{
 const env={CONTROL_PLANE_TOKEN:key,DERIVED_DISCOVERY_QUEUE_ENABLED:"1",
   DERIVED_DISCOVERY_QUEUE:{send:async()=>{throw Error("must not send")}}};
 assert.equal((await enqueueDerivedDiscoveryAck(await request(body),
   env,{...body,page_sha256:"c".repeat(64)})).status,401);
 assert.equal((await enqueueDerivedDiscoveryAck(await request(body,{
  "x-geomacro-request-at":String(Date.now()-600000)}),env,body)).status,401);
});
test("missing D1 receipt stays explicitly pending, never 200",async()=>{
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>null})})}};
 const res=await readDerivedDiscoveryAckReceipt(env,await sha256Text(JSON.stringify(body)));
 assert.equal(res.status,202);
 assert.equal((await res.json()).d1_atomic_readback_verified,false);
});
test("queue redrives transient D1 failure with bounded exponential retry",async()=>{
 const digest=await sha256Text(JSON.stringify(body));
 let retry=null,acked=false;
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>null})})}};
 await consumeDerivedDiscoveryQueue({queue:DISCOVERY_QUEUE_NAME,messages:[{
  body:{schema:DISCOVERY_QUEUE_SCHEMA,digest,body,commercialEligible:false,
   paidDeliveryAuthorized:false},
  attempts:2,retry:x=>{retry=x},ack:()=>{acked=true}
 }]},env);
 assert.deepEqual(retry,{delaySeconds:30});
 assert.equal(acked,false);
});
