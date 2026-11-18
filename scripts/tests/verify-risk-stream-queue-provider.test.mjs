import test from "node:test";
import assert from "node:assert/strict";
import {verifyRiskStreamQueueProvider} from "../ops/verify-risk-stream-queue-provider.mjs";

const queueId="a".repeat(32),consumerId="b".repeat(32);
const page=(result,page,total_pages)=>({ok:true,status:200,json:async()=>({
 success:true,result,result_info:{page,total_pages}
})});
const answer=(status,result)=>({ok:status===200,status,json:async()=>({success:status===200,result})});

test("Queue provider receipt resolves a paginated queue and verifies producer, consumer, and retry settings",async()=>{
 const urls=[];
 const fetchImpl=async url=>{
  const parsed=new URL(url);urls.push(parsed.pathname+parsed.search);
  if(parsed.pathname.endsWith("/queues")&&parsed.searchParams.has("page")){
   const pageNumber=Number(parsed.searchParams.get("page"));
   return pageNumber===1?page([{queue_name:"other",queue_id:"c".repeat(32)}],1,2):
    page([{queue_name:"geomacro-risk-stream",queue_id:queueId}],2,2);
  }
  if(parsed.pathname.endsWith("/queues/"+queueId))return answer(200,{
   queue_name:"geomacro-risk-stream",queue_id:queueId,
   producers:[{type:"worker",script:"geomacro-control-plane"}]
  });
  if(parsed.pathname.endsWith("/queues/"+queueId+"/consumers"))return answer(200,[{
   consumer_id:consumerId,type:"worker",script_name:"geomacro-control-plane",
   queue_name:"geomacro-risk-stream",dead_letter_queue:"geomacro-risk-stream-dlq",
   settings:{batch_size:10,max_retries:8}
  }]);
  throw Error("unexpected provider request "+url);
 };
 const receipt=await verifyRiskStreamQueueProvider({accountId:"d".repeat(32),
  token:"t".repeat(48),fetchImpl,now:()=>Date.parse("2026-11-17T00:00:00.000Z")});
 assert.equal(receipt.status,undefined);
 assert.equal(receipt.schema,"geomacro.risk-stream-queue-provider-receipt.v1");
 assert.equal(receipt.queue_id,queueId);
 assert.equal(receipt.consumer_id,consumerId);
 assert.match(receipt.receipt_sha256,/^[a-f0-9]{64}$/u);
 assert.ok(urls.some(x=>x.includes("page=2")));
});

test("Queue provider fails closed if producer or live consumer binding differs",async()=>{
 const fetchImpl=async url=>{
  const parsed=new URL(url);
  if(parsed.pathname.endsWith("/queues")&&parsed.searchParams.has("page"))
   return page([{queue_name:"geomacro-risk-stream",queue_id:queueId}],1,1);
  if(parsed.pathname.endsWith("/queues/"+queueId))return answer(200,{
   queue_name:"geomacro-risk-stream",queue_id:queueId,
   producers:[{type:"worker",script:"stale-producer"}]
  });
  throw Error("unexpected provider request "+url);
 };
 await assert.rejects(()=>verifyRiskStreamQueueProvider({accountId:"d".repeat(32),
  token:"t".repeat(48),fetchImpl}),/RISK_STREAM_QUEUE_PROVIDER_PRODUCER_BINDING_UNVERIFIED/u);
});

test("Queue provider rejects malformed or missing provider IDs without producing a receipt",async()=>{
 const fetchImpl=async url=>{
  const parsed=new URL(url);
  if(parsed.pathname.endsWith("/queues")&&parsed.searchParams.has("page"))
   return page([{queue_name:"geomacro-risk-stream",queue_id:"not-a-provider-id"}],1,1);
  throw Error("unexpected provider request "+url);
 };
 await assert.rejects(()=>verifyRiskStreamQueueProvider({accountId:"d".repeat(32),
  token:"t".repeat(48),fetchImpl}),/RISK_STREAM_QUEUE_PROVIDER_ID_UNVERIFIED/u);
});

test("Queue provider verifies the live Cloudflare consumer script field and receipt",async()=>{
 const fetchImpl=async url=>{
  const parsed=new URL(url);
  if(parsed.pathname.endsWith("/queues")&&parsed.searchParams.has("page"))
   return page([{queue_name:"geomacro-risk-stream",queue_id:queueId}],1,1);
  if(parsed.pathname.endsWith("/queues/"+queueId))return answer(200,{
   queue_name:"geomacro-risk-stream",queue_id:queueId,
   producers:[{type:"worker",script:"geomacro-control-plane"}]
  });
  if(parsed.pathname.endsWith("/queues/"+queueId+"/consumers"))return answer(200,[{
   consumer_id:consumerId,type:"worker",script:"geomacro-control-plane",
   queue_name:"geomacro-risk-stream",dead_letter_queue:"geomacro-risk-stream-dlq",
   settings:{batch_size:10,max_retries:8}
  }]);
  throw Error("unexpected provider request "+url);
 };
 const receipt=await verifyRiskStreamQueueProvider({accountId:"d".repeat(32),
  token:"t".repeat(48),fetchImpl,now:()=>Date.parse("2026-11-19T00:00:00.000Z")});
 assert.equal(receipt.queue_id,queueId);
 assert.equal(receipt.consumer_id,consumerId);
 assert.equal(receipt.consumer_script,"geomacro-control-plane");
 assert.equal(receipt.dead_letter_queue,"geomacro-risk-stream-dlq");
 assert.deepEqual(receipt.settings,{batch_size:10,max_retries:8});
 assert.match(receipt.receipt_sha256,/^[a-f0-9]{64}$/u);
});
