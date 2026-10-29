import test from "node:test";
import assert from "node:assert/strict";
import {evaluateProductionSourceContinuity} from "../lib/production-source-continuity-evaluator.mjs";
import {observeProductionSourceContinuity} from "../ops/observe-production-three-domain-source-continuity.mjs";

const now=new Date("2026-10-29T15:00:00Z");
const domain=(category,{clock="2026-10-29T14:57:00Z",current=true,count=0}={})=>({
 category,service_state:current?"CURRENT_SOURCE_CHECK_NO_QUALIFYING_DATA":"NO_VERIFIED_SOURCE_CONTEXT",
 data_present:false,source_check_current:current,latest_source_check_at:clock,
 native_news_event_count_72h:count,current_news_guaranteed:false,chargeable:false,
 commercial_rights_verified:false,signed_intelligence_available:false,
 original_publisher_pulse:{status:"SOURCE_NATIVE_OBSERVED",last_checked_at:"2026-10-29T14:50:00Z"}
});
const sample=()=>({ok:true,schema:"geomacro.three-domain-evidence-continuity.v1",
 checked_at:"2026-10-29T14:59:00Z",three_domains_returned:true,
 categories:Object.fromEntries(["geopolitics","macro","rare_earth"].map(c=>[c,domain(c)]))
});
test("Three genuinely current source checks are NOT 585 payable current events",()=>{
 const receipt=evaluateProductionSourceContinuity(sample(),{now});
 assert.equal(receipt.all_three_source_checks_current,true);
 assert.equal(receipt.all_three_paid_signed_categories_verified,false);
 assert.equal(receipt.current_verified_original_events_in_all_195_countries,false);
 assert.equal(receipt.categories.rare_earth.status,"SOURCE_CHECK_CURRENT_NO_VERIFIED_NEW_EVENT");
});
test("Stale source checks remain degraded even if other domains are fine",()=>{
 const doc=sample();
 doc.categories.rare_earth=domain("rare_earth",{clock:"2026-10-29T09:00:00Z",current:false});
 const r=evaluateProductionSourceContinuity(doc,{now});
 assert.equal(r.all_three_source_checks_current,false);
 assert.deepEqual(r.stale_or_missing_source_categories,["rare_earth:SOURCE_CHECK_STALE_OR_MISSING"]);
});
test("Reject contradictory freshness or forged rights flags",()=>{
 const doc=sample();
 doc.categories.macro.source_check_current=false;
 assert.throws(()=>evaluateProductionSourceContinuity(doc,{now}),/SOURCE_CONTINUITY_SOURCE_CLOCK_CONTRADICTS/);
 doc.categories.macro.source_check_current=true;
 doc.categories.macro.commercial_rights_verified=true;
 assert.throws(()=>evaluateProductionSourceContinuity(doc,{now}),/SOURCE_CONTINUITY_DOMAIN_INVALID/);
});
test("HTTP 503 is a negative source receipt without claiming success",async()=>{
 const r=await observeProductionSourceContinuity({now,fetchImpl:async()=>new Response(JSON.stringify({ok:false}),{status:503,headers:{"content-type":"application/json"}})});
 assert.equal(r.health,"SOURCE_READBACK_UNAVAILABLE");
 assert.equal(r.reason,"D1_QUOTA_OR_CONTINUITY_503");
 assert.equal(r.paid_delivery_activated,false);
});
test("One bounded GET returns current only on valid D1 schema",async()=>{
 let calls=0;
 const r=await observeProductionSourceContinuity({now,fetchImpl:async(url,init)=>{
   calls++;assert.match(url,/^https:\/\/geomacro-control-plane\./);
   assert.equal(init.redirect,"error");
   return Response.json(sample());
 }});
 assert.equal(calls,1);
 assert.equal(r.health,"THREE_DOMAIN_SOURCE_CHECKS_CURRENT");
 assert.equal(r.all_three_paid_signed_categories_verified,false);
});
test("Reject oversized or non-JSON response without logging raw upstream content",async()=>{
 const r=await observeProductionSourceContinuity({now,fetchImpl:async()=>new Response("hello",{headers:{"content-type":"text/html"}})});
 assert.equal(r.health,"SOURCE_READBACK_UNAVAILABLE");
 assert.equal(r.reason,"SOURCE_CONTINUITY_CONTENT_TYPE_INVALID");
 assert.equal(r.source_content_logged,false);
});
