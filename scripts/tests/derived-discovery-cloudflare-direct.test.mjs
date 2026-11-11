import test from "node:test";
import assert from "node:assert/strict";
import {deliverWebsiteViaDirectQueue,pollWebsiteReceipt,verifiedDiscoveryQueue,
 readCommittedWebsiteReceipt,websiteQueueDigest}
 from "../lib/derived-discovery-cloudflare-direct.mjs";

const SHA=x=>x.repeat(64),QUEUE_ID="f".repeat(32),
 ACCOUNT="a".repeat(32),
 DB_ID="123e4567-e89b-42d3-a456-426614174000";
const env={
 CLOUDFLARE_ACCOUNT_ID:ACCOUNT,
 CLOUDFLARE_API_TOKEN:"test-cloudflare-token-with-32-characters",
 D1_DATABASE_ID:DB_ID,
 GEOMACRO_DERIVED_DISCOVERY_REST_FALLBACK:"1",
};
const body={
 schema:"geomacro.derived-risk-discovery-bridge.v1",
 lane:"website_intelligence",page_sha256:SHA("b"),
 checked_at:"2026-11-12T00:00:00.000Z",
 next_cursor:{cursor_at:"2026-11-12T00:00:00.000Z",
  cursor_ref:"geopolitics-deadbeef"},
 reviewed:[{original_ref:SHA("c"),
  status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",commercialEligible:false}]
};
function harness({consumer=true,redactedName=false,foreignName=false,
  receiptAfterPush=true,receiptRow,success=true}={}){
 const calls=[];let sent=0;
 const response=(value,status=200)=>Response.json(value,{status});
 const fetchImpl=async(url,opts)=>{
  const u=new URL(url);calls.push({path:u.pathname,method:opts.method,
   data:opts.body?JSON.parse(opts.body):null});
  if(u.pathname.endsWith("/queues")&&opts.method==="GET")
   return response({success:true,result:[{queue_name:"geomacro-derived-discovery",
    queue_id:QUEUE_ID}]});
  if(u.pathname.endsWith("/consumers")&&opts.method==="GET")
   return response({success:true,result:consumer?[{
    type:"worker",
    script_name:redactedName?null:foreignName?"foreign-worker":"geomacro-derived-discovery-consumer",
    dead_letter_queue:"geomacro-derived-discovery-dlq"
   }]:[]});
  if(u.pathname.endsWith("/messages")&&opts.method==="POST"){
   sent++;
   return response({success,result:{metadata:{}}});
  }
  if(u.pathname.endsWith("/query")&&opts.method==="POST"){
   assert.equal(opts.body.includes("derived_discovery_ack_receipts"),true);
   assert.equal(JSON.parse(opts.body).params[0],websiteQueueDigest(body));
   const row=receiptRow??{digest:websiteQueueDigest(body),
    lane:"website_intelligence",page_sha256:body.page_sha256,admitted:1};
   return response({success:true,result:[{success:true,
    results:receiptAfterPush&&sent? [row]:[],
    meta:{rows_read:1,rows_written:0}}]});
  }
  throw Error("UNEXPECTED_PROVIDER_CALL_"+u.pathname);
 };
 return {calls,fetchImpl,get sent(){return sent}};
}

test("direct Cloudflare Queue acceptance is followed by real exact D1 receipt",async()=>{
 const fake=harness();const clock=()=>Date.parse(body.checked_at);
 const result=await deliverWebsiteViaDirectQueue(body,{env,fetchImpl:fake.fetchImpl,
  clock,sleepFn:async()=>{}});
 assert.equal(fake.sent,1);
 assert.equal(result.d1_atomic_readback_verified,true);
 assert.equal(result.cursor_advanced,true);
 assert.equal(result.admitted,1);
 assert.equal(result.queue_to_d1_readback_latency_ms,0);
 assert.equal(result.atomic_receipt_verified_at,body.checked_at);
 const push=fake.calls.find(x=>x.path.endsWith("/messages"));
 assert.equal(push.data.content_type,"json");
 assert.equal(push.data.body.schema,"geomacro.derived-discovery-queued-ack.v1");
 assert.equal(push.data.body.digest,websiteQueueDigest(body));
 assert.equal(push.data.body.paidDeliveryAuthorized,false);
 assert.equal(push.data.body.commercialEligible,false);
 assert.equal(push.data.body.body.page_sha256,body.page_sha256);
});
test("already committed D1 receipt does not duplicate a queued message",async()=>{
 const fake=harness();fake.fetchImpl; // receipt pre-exists via dedicated mock
 const yes=async(url,opts)=>{
  if(url.endsWith("/query")){
   return Response.json({success:true,result:[{success:true,
    results:[{digest:websiteQueueDigest(body),lane:"website_intelligence",
     page_sha256:body.page_sha256,admitted:1}],
    meta:{rows_read:1,rows_written:0}}]});
  }
  throw Error("NO_REQUEUE_EXPECTED");
 };
 const result=await deliverWebsiteViaDirectQueue(body,{env,fetchImpl:yes});
 assert.equal(result.d1_atomic_readback_verified,true);
});
test("unbound Queue consumer or DLQ is HOLD and cannot submit",async()=>{
 const fake=harness({consumer:false});
 await assert.rejects(()=>deliverWebsiteViaDirectQueue(body,{
  env,fetchImpl:fake.fetchImpl}),/DIRECT_QUEUE_CONSUMER_AND_DLQ_UNVERIFIED/);
 assert.equal(fake.sent,0);
});
test("D1 receipts cannot be inferred from queue acceptance",async()=>{
 const fake=harness({receiptAfterPush:false});
 let time=0;
 await assert.rejects(()=>deliverWebsiteViaDirectQueue(body,{
  env,fetchImpl:fake.fetchImpl,clock:()=>time,
  sleepFn:async ms=>{time+=ms}}),
  /DIRECT_QUEUE_ACK_PENDING_NOT_D1_COMMITTED/);
 assert.equal(fake.sent,1);
 assert.equal(time,30000);
});
test("changed, wrong-lane or wrong-count receipt cannot certify",async()=>{
 const fake=harness({receiptRow:{digest:websiteQueueDigest(body),
  lane:"canonical",page_sha256:body.page_sha256,admitted:1}});
 await assert.rejects(()=>deliverWebsiteViaDirectQueue(body,{
  env,fetchImpl:fake.fetchImpl}),/DIRECT_D1_RECEIPT_MISMATCH/);
});
test("no authenticated account and D1 binding never posts",async()=>{
 const fake=harness();
 await assert.rejects(()=>deliverWebsiteViaDirectQueue(body,{
  env:{...env,CLOUDFLARE_API_TOKEN:""},
  fetchImpl:fake.fetchImpl}),/DIRECT_QUEUE_PROTECTED_BINDINGS_MISSING/);
 assert.equal(fake.calls.length,0);
});
test("strict 30-second poll window with delayed verified source",async()=>{
 let ms=0,n=0;
 const receipt=await pollWebsiteReceipt(body,{clock:()=>ms,
  sleepFn:async delay=>{ms+=delay},
  getReceipt:async()=>{n++;return n===3?{proof:true}:null}});
 assert.deepEqual(receipt,{proof:true});
 assert.equal(ms,6000);
});
test("cannot accept unverified commercial flags or untrusted page",async()=>{
 const fake=harness();
 await assert.rejects(()=>deliverWebsiteViaDirectQueue({
  ...body,reviewed:[{...body.reviewed[0],commercialEligible:true}]},
  {env,fetchImpl:fake.fetchImpl}),/DIRECT_QUEUE_UNVERIFIED_BODY/);
 assert.equal(fake.calls.length,0);
});

test("provider-redacted single worker consumer still requires exact D1 atomic readback",async()=>{
 const fake=harness({redactedName:true});
 const result=await deliverWebsiteViaDirectQueue(body,{env,fetchImpl:fake.fetchImpl,
  clock:()=>Date.parse(body.checked_at),sleepFn:async()=>{}});
 assert.equal(fake.sent,1);
 assert.equal(result.d1_atomic_readback_verified,true);
 assert.equal(result.atomic_receipt_verified_at,body.checked_at);
});
test("explicit foreign named worker never receives unverified discovery messages",async()=>{
 const fake=harness({foreignName:true});
 await assert.rejects(()=>deliverWebsiteViaDirectQueue(body,{
  env,fetchImpl:fake.fetchImpl}),/DIRECT_QUEUE_CONSUMER_AND_DLQ_UNVERIFIED/);
 assert.equal(fake.sent,0);
});
test("provider-redacted single worker without committed D1 receipt remains HOLD",async()=>{
 const fake=harness({redactedName:true,receiptAfterPush:false});
 let elapsed=0;
 await assert.rejects(()=>deliverWebsiteViaDirectQueue(body,{
  env,fetchImpl:fake.fetchImpl,clock:()=>elapsed,
  sleepFn:async ms=>{elapsed+=ms}}),
  /DIRECT_QUEUE_ACK_PENDING_NOT_D1_COMMITTED/);
 assert.equal(fake.sent,1);
 assert.equal(elapsed,30000);
});
