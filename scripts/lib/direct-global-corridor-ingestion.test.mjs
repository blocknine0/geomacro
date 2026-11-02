import test from "node:test";
import assert from "node:assert/strict";
import {CORRIDOR_ONLY_SOURCE_IDS,assertDirectCorridorWebsiteSeparation,
 directGlobalCorridorRouteSources,directGlobalCorridorNewsFeeds}
 from "./direct-global-corridor-sources.mjs";
import {collectDirectCorridorSourceIntake}
 from "./direct-global-corridor-ingestion.mjs";
const DATE=new Date("2026-11-02T00:10:00Z");
const customObservers={
 observeUkmto:async()=>({status:"RECENT_INDEX_CONTEXT_OBSERVED",
   candidate_corridor_ids:["bab_el_mandeb"],recent_index_report_candidates:1}),
 observeIndependent:async()=>({sources:[{
   id:"recaap_isc_weekly_reports",index_state:"OFFICIAL_PERIODIC_REPORT_INDEX_OBSERVED",
   metadata_candidate_count:2}]}),
 observeOfficial:async()=>({
   schema:"geomacro.corridor-official-reference-intake.v1",
   channel:"CORRIDOR_ONLY",source_checks:[
     "gdelt_v2_15m","world_bank_wdi","ecb_data","eurostat_data","imf_portwatch"
   ].map(id=>({id,state:"NO_CURRENT_REFERENCE_OBSERVATION",observations:0})),
   observation_count:0,observations:[],
   website_intelligence_writes:0,commercial_rights_verified:false
 })
};
test("all 37 uploaded global / regional / chokepoint / mineral / crypto entries are corridor-only",()=>{
 assert.equal(assertDirectCorridorWebsiteSeparation(),true);
 assert.equal(CORRIDOR_ONLY_SOURCE_IDS.length,37);
 const sources=directGlobalCorridorRouteSources();
 assert.equal(sources.length,37);
 assert.equal(sources.reduce((n,x)=>n+x.source_references.length,0),39);
 assert.ok(sources.every(x=>x.channel==="CORRIDOR_ONLY"&&
   x.website_intelligence_enabled===false&&x.commercial_eligible===false));
 assert.deepEqual(directGlobalCorridorNewsFeeds(),[]);
});
test("all entries are included in independent receipts without website or paid writes",async()=>{
 const seen=[];
 const fetchImpl=async url=>{
   seen.push(url);
   return new Response("<html><body>Official index</body></html>",{
    status:200,headers:{"Content-Type":"text/html"}});
 };
 const result=await collectDirectCorridorSourceIntake({now:DATE,fetchImpl,...customObservers});
 assert.equal(result.schema,"geomacro.direct-corridor-source-intake.v2");
 assert.equal(result.source_count,37);
 assert.equal(result.source_checks.length,37);
 assert.equal(result.source_link_occurrences,39);
 assert.equal(result.unique_linked_sources,37);
 assert.equal(result.total_index_metadata_candidates,3);
 assert.deepEqual(result.candidate_corridors,["bab_el_mandeb"]);
 assert.equal(seen.length,12);
 assert.equal(result.source_checks.filter(s=>s.state==="NOT_A_NATIVE_FEED").length,6);
 assert.equal(result.source_checks.find(s=>s.id==="asean_customs").state,"PORTAL_TRANSPORT_OBSERVED_NO_EVENT");
 assert.ok(seen.includes("https://asean.org/our-communities/economic-community/asean-customs/"));
 assert.equal(result.missing_link_placeholders,0);
 assert.equal(result.channel,"CORRIDOR_ONLY");
 assert.equal(result.website_intelligence_writes,0);
 assert.equal(result.website_intelligence_enabled,false);
 assert.equal(result.native_event_evidence_written_to_canonical_db,false);
 assert.equal(result.news_candidate_count,0);
 assert.equal(result.native_news_sources_polled,6);
 assert.equal(result.official_reference_source_checks.length,9);
 assert.equal(result.official_reference_observation_count,0);
 assert.equal(result.source_checks.find(x=>x.id==="gdelt_v2_15m").state,
   "NO_CURRENT_REFERENCE_OBSERVATION");
 assert.equal(result.d1_writes,0);
 assert.equal(result.b2_writes,0);
 assert.equal(result.chargeable,false);
 assert.equal(result.signed_gro_generated,false);
 assert.ok(result.source_checks.every(r=>r.event_verified===false&&r.flow_verified===false));
 assert.ok(!JSON.stringify(result).includes("Official index"));
});
test("native RSS is parsed only inside the corridor receipt",async()=>{
 const rss='<rss><channel><item><title>Monetary policy information</title>'+
    '<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>'+
    '<link>https://www.bankofengland.co.uk/news/monetary-policy</link>'+
    '</item></channel></rss>';
 const result=await collectDirectCorridorSourceIntake({now:DATE,...customObservers,
   fetchImpl:async url=>String(url).includes("rss")||String(url).includes("feed")?
     new Response(rss,{headers:{"Content-Type":"application/rss+xml"}}):
     new Response("<html><body>Portal</body></html>",{
       headers:{"Content-Type":"text/html"}})});
 assert.ok(result.source_checks.some(x=>x.state==="NATIVE_NEWS_CANDIDATES_INGESTED"));
 assert.equal(result.news_candidate_count,1);
 assert.ok(result.news_candidates.every(x=>x.customer_delivery_enabled===false&&
   x.source_time_is_not_event_time===true));
 assert.equal(result.source_checks.find(x=>x.id==="boe_news").metadata_candidates,1);
 assert.equal(result.website_intelligence_writes,0);
 assert.ok(!JSON.stringify(result).includes("Monetary policy information"));
});
test("provider denial is visible but never retried or bypassed",async()=>{
 const result=await collectDirectCorridorSourceIntake({now:DATE,
  fetchImpl:async()=>new Response("",{status:403}),
  observeUkmto:async()=>{throw Error("PROVIDER_DENIED")},
  observeIndependent:async()=>({sources:[]}),
  observeOfficial:customObservers.observeOfficial});
 assert.equal(result.source_checks.find(x=>x.id==="ukmto_incidents").state,"PROVIDER_UNAVAILABLE");
 assert.equal(result.source_checks.find(x=>x.id==="suez_navigation").state,"DENIED_NO_RETRY");
 assert.equal(result.source_checks.find(x=>x.id==="asean_customs").state,"DENIED_NO_RETRY");
 assert.equal(result.source_checks.find(x=>x.id==="coindesk_rss").state,"DENIED_NO_RETRY");
 assert.equal(result.source_checks.find(x=>x.id==="freightos_fbx").state,"PROVIDER_ENTITLEMENT_DISABLED_NO_PAID_PROVIDER");
 assert.equal(result.website_intelligence_writes,0);
});
