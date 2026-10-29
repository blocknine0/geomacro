import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {
 projectThreeDomainStructuredDelivery,
 deliverThreeDomainStructuredOutput,
 THREE_DOMAIN_STRUCTURED_DELIVERY_SCHEMA,
} from "../../workers/control-plane/src/three-domain-structured-delivery.mjs";
import {threeDomainEvidenceContinuity} from "../../workers/control-plane/src/three-domain-evidence-continuity.mjs";

const NOW=Date.parse("2026-10-29T18:10:00.000Z");
const ISO=new Date(NOW).toISOString();
const domains=["geopolitics","macro","rare_earth"] as const;
const official={
 geopolitics:"geopolitics",macro:"macro-fx",rare_earth:"critical-minerals",
} as const;
const news=(category:string)=>({
 id:category+"-deadbeef",category,
 topic:category==="macro"?"inflation and prices":category==="rare_earth"?
   "rare-earth supply":"foreign policy",
 development_type:"official release observation",
 published_at:"2026-10-29T15:33:50.000Z",date_precision:"exact",
 what_changed:"An issuer-native dated release is present within the observed category and source time window.",
 why_it_matters:"This dated finding may affect research context, but does not establish a verified market impact.",
});
const finding=(category:string)=>({
 finding_key:"official:2026:"+category,
 evidence_class:"official_open_data_unscored",
 observation_type:"annual_statistical_reference",observation_period:"2025",
 clock_semantics:"reference_year",
 geomacro_finds:"A publisher-derived annual reference context has an original reference year.",
 why_it_matters:"Annual data can inform baseline comparison but it is not a live event or market direction.",
 independent_same_event_verification:false,score:null,
});
const source=(options:{missing?:string,stale?:string,journal?:boolean}={})=>({
 ok:true,schema:"geomacro.three-domain-evidence-continuity.v1",
 checked_at:ISO,three_domains_returned:true,
 chargeable:false,commercial_rights_verified:false,raw_upstream_delivered:false,
 signed_gro_verified:false,gri_scored:false,journal_complete:options.journal!==false,
 categories:Object.fromEntries(domains.map(category=>[category,{
   category,chargeable:false,commercial_rights_verified:false,
   signed_intelligence_available:false,current_news_guaranteed:false,
   source_check_current:category!==options.stale,
   original_news_window_verified:options.journal!==false,
   native_news_event_count_72h:category===options.missing?0:1,
   source_neutral_news:category===options.missing||options.journal===false?[]:[news(category)],
   official_open_data_findings:category===options.missing?[]:[finding(category)],
   required_source_credits:category==="macro"?["Required official source attribution"]:[],
   latest_source_check_at:category===options.missing?null:
     category===options.stale?"2026-10-29T12:00:00.000Z":ISO,
 }])),
});
describe("three-domain D1-backed machine structured JSON delivery",()=>{
 it("projects 3 actual category-specific news+annual records, not copied generic analytical text",()=>{
   const body=projectThreeDomainStructuredDelivery(source(),NOW);
   expect(body.schema).toBe(THREE_DOMAIN_STRUCTURED_DELIVERY_SCHEMA);
   expect(body.category_count).toBe(3);
   expect(body.delivery_state).toBe("THREE_CATEGORIES_WITH_MEASURED_OBSERVATIONS");
   for(const category of domains){
     const result=body.categories[category];
     expect(result.delivery_state).toBe("OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK");
     expect(result.native_release_records).toHaveLength(1);
     expect(result.official_reference_records).toHaveLength(1);
     expect(result.native_release_records[0].topic).toBe(news(category).topic);
     expect(result.native_release_records[0].original_published_at).toBe("2026-10-29T15:33:50.000Z");
     expect(result.native_release_records[0].why_it_matters).toBe(news(category).why_it_matters);
     expect(result.official_reference_records[0].observation_period).toBe("2025");
     expect(result.official_reference_records[0].original_published_at).toBeNull();
     expect(result.official_reference_records[0].clock_semantics).toBe("reference_year");
     expect(result.qualified_paid_records_count).toBe(0);
     expect(result.signed_risk_available).toBe(false);
   }
   expect(body.categories.geopolitics.native_release_records[0].topic)
     .not.toBe(body.categories.macro.native_release_records[0].topic);
   expect(body.categories.rare_earth.native_release_records[0].topic)
     .not.toBe(body.categories.macro.native_release_records[0].topic);
   expect(body.commercial.payment_authorized).toBe(false);
   expect(body.raw_upstream_delivered).toBe(false);
   expect(JSON.stringify(body)).not.toContain("https://");
 });
 it("delivers all 3 category keys with explicit missing/stale readiness, never invents records",()=>{
   const body=projectThreeDomainStructuredDelivery(source({missing:"geopolitics",stale:"macro"}),NOW);
   expect(body.delivery_state).toBe("PARTIAL_OR_EMPTY_SOURCE_OBSERVATIONS");
   expect(body.categories.geopolitics).toMatchObject({
     delivery_state:"NO_OBSERVATION_AVAILABLE",native_release_records:[],
     official_reference_records:[],qualified_paid_records_count:0,
   });
   expect(body.categories.macro.delivery_state).toBe("OBSERVATIONS_WITHOUT_CURRENT_SOURCE_CHECK");
   expect(body.categories.macro.last_source_check_at).toBe("2026-10-29T12:00:00.000Z");
   expect(body.categories.rare_earth.delivery_state).toBe("OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK");
 });
 it("does not expose a journal news event when canonical 72h readback is incomplete",()=>{
   const body=projectThreeDomainStructuredDelivery(source({journal:false}),NOW);
   for(const category of domains)expect(body.categories[category].native_release_records).toHaveLength(0);
   expect(body.original_news_window_complete).toBe(false);
 });
 it("never allows a commercially promoted or signed source contract through free structured output",()=>{
   for(const mutation of [
     (x:any)=>{x.chargeable=true;},
     (x:any)=>{x.signed_gro_verified=true;},
     (x:any)=>{x.commercial_rights_verified=true;},
     (x:any)=>{x.categories.macro.commercial_rights_verified=true;},
     (x:any)=>{x.categories.macro.source_neutral_news[0].source_url="https://unsafe.example";},
     (x:any)=>{x.categories.macro.official_open_data_findings[0].score=88;},
     (x:any)=>{x.categories.rare_earth.source_neutral_news[0].published_at="2099-12-01T00:00:00.000Z";},
     (x:any)=>{x.categories.macro.source_neutral_news[0].what_changed="Click https://unsafe.example/original";},
     (x:any)=>{x.categories.geopolitics.category="macro";},
     (x:any)=>{x.categories.macro.source_neutral_news[0].date_precision="synthesized";},
   ]){
     const copy=structuredClone(source());
     mutation(copy);
     // Defence in depth: even the projection itself must reject any source
     // field that is absent from the canonical D1 journal contract.
     expect(()=>projectThreeDomainStructuredDelivery(copy,NOW)).toThrow();
   }
 });
 it("returns 503 instead of empty paid-looking 200 on real D1 outage or invalid source",async()=>{
   const env={DB:{}};
   const broken=async()=>Response.json({ok:false,error:"D1_DOWN"},{status:503});
   const response=await deliverThreeDomainStructuredOutput(env,NOW,broken);
   expect(response.status).toBe(503);
   expect(await response.json()).toMatchObject({ok:false,chargeable:false,
     error:"CANONICAL_THREE_DOMAIN_READBACK_UNAVAILABLE"});
   expect((await deliverThreeDomainStructuredOutput({},NOW)).status).toBe(503);
   const malicious=async()=>Response.json({...source(),chargeable:true});
   expect((await deliverThreeDomainStructuredOutput(env,NOW,malicious)).status).toBe(503);
 });
 it("reuses actual D1 continuity reader once, preserves verified native clock, never reads additional sources",async()=>{
   let calls=0;
   const reader=async()=>{
     calls++;
     return Response.json(source());
   };
   const response=await deliverThreeDomainStructuredOutput({DB:{}},NOW,reader);
   expect(response.status).toBe(200);
   expect(calls).toBe(1);
   const body=await response.json();
   expect(Object.keys(body.categories).sort()).toEqual([...domains].sort());
   expect(body.commercial.payment_required).toBe(false);
   expect(body.commercial.paid_evidence_must_be_separately_verified).toBe(true);
 });
 it("has dedicated public Worker GET with shared read-only edge caching, no partner path changes",()=>{
   const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
   expect(index).toContain('/v1/public/three-domain-structured-output');
   expect(index).toContain("deliverThreeDomainStructuredOutput(env,Date.now(),()=>");
   expect(index).toContain("publicReadCache(()=>threeDomainEvidenceContinuity(env),originalCacheRequest)");
   expect(index).toContain('new URL("/v1/public/three-domain-continuity",request.url)');
   const code=readFileSync("workers/control-plane/src/three-domain-structured-delivery.mjs","utf8");
   expect(code).not.toContain("settleCoinbaseX402");
   expect(code).not.toContain("requireRiskSupabase");
   expect(code).not.toContain("publishDerivedStories(env");
   expect(code).toContain("threeDomainEvidenceContinuity");
 });
});
