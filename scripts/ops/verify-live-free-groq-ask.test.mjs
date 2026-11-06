import test from "node:test";
import assert from "node:assert/strict";
import {verifyLiveAskFreeGroq,readAsk} from "./verify-live-free-groq-ask.mjs";
const questionBodies=[];
function mockFetch(url,options){
 if(url==="https://geomacro.live/.well-known/geomacro-build.json")
   return Promise.resolve(new Response(JSON.stringify({canonical_repository:"blocknine0/geomacro",
     canonical_main_sha:"a".repeat(40)}),{status:200,headers:{"content-type":"application/json"}}));
 assert.equal(url,"https://geomacro.live/api/ask/v2/turn");
 assert.equal(options.method,"POST");
 assert.equal(options.headers.Origin,"https://geomacro.live");
 const body=JSON.parse(options.body);
 questionBodies.push(body.question);
 const cache=questionBodies.filter(q=>q===body.question).length>1?"hit":"miss";
 const answer={summary:"An approved educational answer.",answer_kind:"explainer",
  insufficient_evidence:false,low_confidence:false,gri:null,evidence:[],
  source_identity_exposed:false,durable_live_storage_write:false,
  model_rendering:"assisted",model_render_cache:cache,
  model_render_cache_scope:cache==="hit"?"distributed":"none"};
 return Promise.resolve(new Response("event: stage\ndata: {}\n\nevent: answer\ndata: "+JSON.stringify({ok:true,data:answer})+"\n\n",{
  status:200,headers:{"content-type":"text/event-stream"}}));
}
test("three domains and a repeated distributed answer have verifiable generation and cache proof",async()=>{
 questionBodies.length=0;
 const r=await verifyLiveAskFreeGroq("https://geomacro.live",mockFetch);
 assert.equal(r.model_generation_domains,3);
 assert.equal(r.warm_or_distributed_cache_hit_observed,true);
 assert.equal(r.distributed_cache_proven,true);
 assert.equal(questionBodies.length,4);
});
test("rejects nonproduction target",async()=>{
 await assert.rejects(()=>verifyLiveAskFreeGroq("https://not-geomacro.example",mockFetch),/NOT_PRODUCTION/);
});
test("does not infer a model completion from a canonical fallback",async()=>{
 const r=await readAsk("https://geomacro.live","What is inflation?",async()=>new Response(
  "event: answer\ndata: "+JSON.stringify({ok:true,data:{
   summary:"Canonical answer",answer_kind:"explainer",insufficient_evidence:false,
   low_confidence:false,gri:null,evidence:[],source_identity_exposed:false,
   durable_live_storage_write:false}})+"\n\n",{status:200,headers:{"content-type":"text/event-stream"}}));
 assert.equal(r.rendering,"unavailable");
});
