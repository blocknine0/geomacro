import test from "node:test";
import assert from "node:assert/strict";
import {CORRIDOR_ONLY_SOURCE_IDS,assertDirectCorridorWebsiteSeparation,
 directGlobalCorridorRouteSources,directGlobalCorridorNewsFeeds}
 from "./direct-global-corridor-sources.mjs";
import {collectDirectCorridorSourceIntake}
 from "./direct-global-corridor-ingestion.mjs";

test("all named route authority feeds are isolated from Website Intelligence",()=>{
 assert.equal(assertDirectCorridorWebsiteSeparation(),true);
 assert.equal(CORRIDOR_ONLY_SOURCE_IDS.length,8);
 const only=directGlobalCorridorRouteSources();
 assert.equal(only.length,8);
 assert.ok(only.every(x=>x.channel==="CORRIDOR_ONLY"&&
   x.website_intelligence_enabled===false&&x.commercial_eligible===false));
 const websiteUrls=new Set(directGlobalCorridorNewsFeeds().map(x=>x.url));
 assert.ok(only.every(x=>!websiteUrls.has(x.url)));
});
test("standalone corridor reader never emits website news or canonical paid signals",async()=>{
 const seen=[];
 const fetchImpl=async url=>{
   seen.push(url);
   return new Response("<html><body>Official index</body></html>",{
    status:200,headers:{"Content-Type":"text/html"}});
 };
 const result=await collectDirectCorridorSourceIntake({
  now:new Date("2026-11-02T00:00:00Z"),fetchImpl,
  observeUkmto:async()=>({status:"RECENT_INDEX_CONTEXT_OBSERVED",
    candidate_corridor_ids:["bab_el_mandeb"],recent_index_report_candidates:1}),
  observeIndependent:async()=>({sources:[{
    id:"recaap_isc_weekly_reports",index_state:"OFFICIAL_PERIODIC_REPORT_INDEX_OBSERVED",
    metadata_candidate_count:2}]}),
 });
 assert.equal(result.source_count,8);
 assert.equal(result.source_checks.length,8);
 assert.equal(result.total_index_metadata_candidates,3);
 assert.deepEqual(result.candidate_corridors,["bab_el_mandeb"]);
 assert.equal(seen.length,5);
 assert.equal(result.channel,"CORRIDOR_ONLY");
 assert.equal(result.website_intelligence_writes,0);
 assert.equal(result.website_intelligence_enabled,false);
 assert.equal(result.native_event_evidence_written_to_canonical_db,false);
 assert.equal(result.chargeable,false);
 assert.equal(result.signed_gro_generated,false);
 assert.ok(result.source_checks.every(r=>r.event_verified===false&&r.flow_verified===false));
 assert.ok(!JSON.stringify(result).includes("Official index"));
});
test("provider authentication and rate limits never trigger paywall bypass",async()=>{
 const result=await collectDirectCorridorSourceIntake({
  now:new Date("2026-11-02T00:00:00Z"),
  fetchImpl:async()=>new Response("",{status:403}),
  observeUkmto:async()=>{throw Error("PROVIDER_DENIED")},
  observeIndependent:async()=>({sources:[]})
 });
 assert.equal(result.source_checks.find(x=>x.id==="ukmto_incidents").state,"PROVIDER_UNAVAILABLE");
 assert.equal(result.source_checks.find(x=>x.id==="suez_navigation").state,"DENIED_NO_RETRY");
 assert.equal(result.source_checks.find(x=>x.id==="freightos_fbx").state,"PROVIDER_API_AUTH_REQUIRED");
 assert.equal(result.website_intelligence_writes,0);
});
