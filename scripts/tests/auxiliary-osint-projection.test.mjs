import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {submitAuxiliaryOsintProjection} from "../lib/auxiliary-osint-projection.mjs";

const endpoint="https://geomacro-control-plane.example/v1/internal/risk-gate/progressive-observations";
const token="x".repeat(48);
const records=()=>Array.from({length:26},(_,i)=>({
 country_iso3:"IND",derived_category:"geopolitics",
 event_fingerprint:String(i).padStart(64,"a"),
 rights_verified:false,commercial_eligible:false,
}));
const config=(items,fetchImpl)=>({
 records:items,endpoint,token,requestSchema:"geomacro.progressive-observation-projection-request.v1",
 requestField:"observations",receiptSchema:"geomacro.progressive-observation-projection.v1",
 validateReceipt:(r,b)=>r.unverified_observations===b.length&&
  r.rights_verified===false&&r.commercial_eligible===false&&
  r.standard_corroboration_admitted===false&&r.raw_news_text_stored===false,
 fetchImpl,
});
const receipt=n=>Response.json({
 ok:true,schema:"geomacro.progressive-observation-projection.v1",
 accepted:n,unverified_observations:n,rights_verified:false,commercial_eligible:false,
 standard_corroboration_admitted:false,raw_news_text_stored:false,
});
test("newly accepted source IDs keep actual D1 receipts while stale protected endpoint is 405",async()=>{
 let requests=0;
 const outcome=await submitAuxiliaryOsintProjection(config(records(),async(url,init)=>{
  requests++;
  assert.equal(url,endpoint);assert.equal(init.method,"POST");
  assert.equal(init.redirect,"error");
  assert.equal(init.headers.Authorization,"Bearer "+token);
  assert.equal(JSON.parse(init.body).observations.length,25);
  return new Response("",{status:405});
 }));
 assert.equal(requests,1);
 assert.equal(outcome.status,"DEFERRED_ENDPOINT_HTTP");
 assert.equal(outcome.reason,"WORKER_ROUTE_NOT_DEPLOYED_OR_METHOD_NOT_ALLOWED");
 assert.equal(outcome.http_status,405);
 assert.equal(outcome.acknowledged,0);
 assert.equal(outcome.deferred,26);
 assert.equal(outcome.complete,false);
 assert.equal(outcome.verified_original_source_d1_receipts_unchanged,true);
 for(const prop of ["rights_verified","commercial_eligible","signed_gro_published",
    "independent_reviewed","predge_delivered","raw_news_text_sent"])
  assert.equal(outcome[prop],false,prop);
 assert.equal(outcome.payments,0);
});
test("partial 25-item genuine receipt is not upgraded to all-accepted on 405",async()=>{
 let calls=0;
 const outcome=await submitAuxiliaryOsintProjection(config(records(),async()=>{
  calls++;
  return calls===1?receipt(25):new Response("",{status:405});
 }));
 assert.equal(outcome.acknowledged,25);
 assert.equal(outcome.deferred,1);
 assert.equal(outcome.requests,2);
 assert.equal(outcome.complete,false);
 assert.equal(outcome.production_endpoint_verified,false);
});
test("healthy route requires genuine exact schema, per-batch count and unverified rights",async()=>{
 const o=await submitAuxiliaryOsintProjection(config(records(),async(_url,init)=>{
  const body=JSON.parse(init.body);
  return receipt(body.observations.length);
 }));
 assert.equal(o.complete,true);
 assert.equal(o.status,"VERIFIED_UNVERIFIED_PROJECTION");
 assert.equal(o.acknowledged,26);
 assert.equal(o.deferred,0);
 assert.equal(o.signed_gro_published,false);
});
test("invalid positive-looking receipt is never counted as an ACK",async()=>{
 for(const bad of [
  Response.json({ok:true,schema:"geomacro.progressive-observation-projection.v1",accepted:26}),
  Response.json({ok:true,schema:"geomacro.progressive-observation-projection.v1",
   accepted:1,unverified_observations:1,rights_verified:true}),
  new Response("not-json",{status:200}),
 ]){
  const o=await submitAuxiliaryOsintProjection(config([records()[0]],async()=>bad));
  assert.equal(o.acknowledged,0);assert.equal(o.deferred,1);
  assert.equal(o.status,"DEFERRED_RECEIPT_UNVERIFIED");
 }
});
test("transport denial, provider 503 and invalid endpoint cannot grant authority",async()=>{
 const transport=await submitAuxiliaryOsintProjection(config(records(),async()=>{throw Error("unavailable")}));
 assert.equal(transport.status,"DEFERRED_TRANSPORT_UNAVAILABLE");
 const denied=await submitAuxiliaryOsintProjection(config(records(),async()=>new Response("",{status:503})));
 assert.equal(denied.http_status,503);assert.equal(denied.acknowledged,0);
 await assert.rejects(()=>submitAuxiliaryOsintProjection({...config(records(),async()=>receipt(25)),
  endpoint:"http://untrusted.example"}),/AUXILIARY_OSINT_PROJECTION_POLICY_INVALID/);
});
test("source-only production stage handles secondary projection 405 before durable encryption; never invents a Risk Gate",()=>{
 const source=readFileSync("scripts/ops/phase2i-source-only-raw-tick.ts","utf8");
 const stage=source.indexOf("if(stage.selected_count>0&&stage.d1_readback_verified!==true)");
 const projection=source.indexOf("const observationDelivery=await submitAuxiliaryOsintProjection");
 const queue=source.indexOf("const candidatesWithD1Receipts=queue.candidates.map");
 const cipher=source.indexOf("sealPrivatePhase2iSourceBacklog({");
 assert(stage>=0&&projection>stage&&queue>projection&&cipher>queue);
 assert(source.includes("...progressiveFactsProjection,raw_news_text_stored:false"));
 assert(source.includes("...observationDelivery,"));
 assert(!source.includes('throw Error("PROGRESSIVE_OBSERVATION_PROJECTION_HTTP_"'));
 assert(!source.includes('throw Error("PROGRESSIVE_FACT_PROJECTION_HTTP_"'));
 assert(source.includes('console.log("::warning::AUXILIARY_OSINT_OBSERVATIONS_"'));
 assert(source.includes("predge_modified:false,publication_attempted:false"));
});
