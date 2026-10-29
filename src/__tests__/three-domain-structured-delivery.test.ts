import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {
 projectThreeDomainStructuredDelivery,
 deliverThreeDomainStructuredOutput,
 deliverThreeDomainStructuredWithCacheRecovery,
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
     expect(result.native_release_records[0].news_desk).toMatchObject({
       what_happened:{text:news(category).what_changed,observation_verified:true},
       why_it_matters_analysis:{
         text:news(category).why_it_matters,claim_independently_verified:false,
       },
       market_relevance:{
         status:"POTENTIAL_CHANNELS_ONLY",affected_instruments_confirmed:[],
         observed_market_reaction_verified:false,price_direction:null,price_change:null,
       },
       what_to_watch:{
         focus_topic:news(category).topic,
         followup_trigger:"NEW_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION",
         confirmed_followup_scheduled:false,next_verified_event_at:null,
       },
       evidence_confidence:{
         tier:"ORIGINAL_DATE_VERIFIED_CLAIMS_UNCORROBORATED",
         original_publication_time:"2026-10-29T15:33:50.000Z",
         original_page_date_verified:true,
         event_claim_independently_verified:false,
         market_impact_verified:false,country_impact_verified:false,
         commercial_rights_verified:false,risk_scored:false,
       },
     });
     expect(result.native_release_records[0].news_desk).toMatchObject({
       schema:"geomacro.news-desk-item.v1",
       format:"EVENT_SPECIFIC_ORIGINAL_DATED_BRIEF",
       lede:news(category).what_changed,
       issue:news(category).topic,
       why_it_matters:news(category).why_it_matters,
       original_publication_at:"2026-10-29T15:33:50.000Z",
       event_country_independently_verified:false,
       economic_impact_verified:false,
       market_direction:null,forecast_price_change:null,
       next_confirmed_development_at:null,commercial_rights_verified:false,
       affected_assets_confirmed:[],
     });
     expect(result.official_reference_records[0].news_desk).toBeUndefined();
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
   expect(new Set(domains.map(category=>
     body.categories[category].native_release_records[0].news_desk.issue)).size).toBe(3);
   expect(body.commercial.payment_authorized).toBe(false);
   expect(body.raw_upstream_delivered).toBe(false);
   expect(JSON.stringify(body)).not.toContain("https://");
 });
 it("one original-dated release produces a complete five-part brief while other categories remain empty",()=>{
   const body=projectThreeDomainStructuredDelivery(
     source({missing:"macro",journal:true}),NOW);
   expect(body.categories.geopolitics.native_release_records).toHaveLength(1);
   const desk=body.categories.geopolitics.native_release_records[0].news_desk;
   expect(desk.market_relevance.potential_watch_channels).toEqual([]);
   expect(desk.what_to_watch.next_verified_event_at).toBeNull();
   expect(desk.evidence_confidence.event_claim_independently_verified).toBe(false);
   expect(body.categories.macro.native_release_records).toHaveLength(0);
   expect(body.categories.macro.official_reference_records).toHaveLength(0);
   expect(body.commercial.payment_authorized).toBe(false);
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
 it("valid cached D1 source is projected with ONE read and no origin miss",async()=>{
   let cached=0,origin=0;
   const response=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>{cached++;return Response.json(source());},
     async()=>{origin++;return Response.json(source());});
   expect(response.status).toBe(200);
   expect(cached).toBe(1);
   expect(origin).toBe(0);
   const body=await response.json();
   expect(body.category_count).toBe(3);
   expect(body.commercial.payment_authorized).toBe(false);
 });
 it("stale HTTP 200 continuity cached source is recovered ONCE from fresh D1, not returned as 503",async()=>{
   let cached=0,origin=0;
   const old=source();
   old.checked_at=new Date(NOW-11*60_000).toISOString();
   const response=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>{cached++;return Response.json(old);},
     async()=>{origin++;return Response.json(source());});
   expect(response.status).toBe(200);
   expect(cached).toBe(1);
   expect(origin).toBe(1);
   const body=await response.json();
   expect(body.categories.macro.native_release_records_count).toBe(1);
   expect(body.commercial.chargeable).toBe(false);
 });
 it("outdated cached source contract triggers exactly one fallback, never promotes invalid evidence",async()=>{
   let refreshed=0;
   const old=source();old.categories.macro.commercial_rights_verified=true;
   const response=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>Response.json(old),
     async()=>{refreshed++;return Response.json(source());});
   expect(response.status).toBe(200);
   expect(refreshed).toBe(1);
 });
 it("uses observation-time clock after awaited D1 I/O, not request-entry clock",async()=>{
   let clock=NOW;
   const later=source();
   later.checked_at=new Date(NOW+2000).toISOString();
   const reader=async()=>{clock=NOW+3000;return Response.json(later);};
   const direct=await deliverThreeDomainStructuredOutput({DB:{}},()=>clock,reader);
   expect(direct.status).toBe(200);
   expect((await direct.json()).category_count).toBe(3);
   clock=NOW;
   const cached=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},()=>clock,
     reader,async()=>{throw Error("UNNEEDED_ORIGIN_READ");});
   expect(cached.status).toBe(200);
   expect((await cached.json()).categories.macro.category).toBe("macro");
 });
 it("one transient cached D1 503 recovers with one canonical source read",async()=>{
   let refreshed=0;
   const restored=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>Response.json({ok:false},{status:503}),
     async()=>{refreshed++;return Response.json(source());});
   expect(restored.status).toBe(200);
   expect(refreshed).toBe(1);
   const body=await restored.json();
   expect(body.categories.geopolitics.native_release_records_count).toBe(1);
   expect(body.commercial.payment_authorized).toBe(false);
 });
 it("persistent 503 exhausts two paced retries and returns 503; invalid canonical recovery remains 503",async()=>{
   let refreshed=0;
   const down=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>Response.json({ok:false},{status:503}),
     async()=>{refreshed++;return Response.json({ok:false},{status:503});});
   expect(down.status).toBe(503);
   expect(refreshed).toBe(2);
   const previous=source();previous.checked_at=new Date(NOW-11*60_000).toISOString();
   const invalid=source();invalid.signed_gro_verified=true;
   const response=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>Response.json(previous),
     async()=>{refreshed++;return Response.json(invalid);});
   expect(response.status).toBe(503);
   expect(refreshed).toBe(3);
   const payload=await response.json();
   expect(payload).toMatchObject({chargeable:false,payment_authorized:false,
     raw_upstream_delivered:false});
 });
 it("intermittent 503 then 503 then 200 recovers only after two paced canonical reads",async()=>{
   let attempts=0;
   const response=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
     async()=>Response.json({ok:false},{status:503}),
     async()=>{attempts++;return attempts===1?
       Response.json({ok:false},{status:503}):Response.json(source());});
   expect(response.status).toBe(200);
   expect(attempts).toBe(2);
   expect((await response.json()).category_count).toBe(3);
 });
 it("coalesces a concurrent 503 burst to two total origin reads, not two per client",async()=>{
   const env={DB:{}};let origin=0;
   const cached=async()=>Response.json({ok:false},{status:503});
   const canonical=async()=>{origin++;return origin===1?
     Response.json({ok:false},{status:503}):Response.json(source());};
   const out=await Promise.all(Array.from({length:5},()=>
     deliverThreeDomainStructuredWithCacheRecovery(env,NOW,cached,canonical)));
   expect(out.map(r=>r.status)).toEqual([200,200,200,200,200]);
   expect(origin).toBe(2);
   expect((await out[0].json()).categories.geopolitics.category).toBe("geopolitics");
   expect((await out[4].json()).categories.rare_earth.category).toBe("rare_earth");
 });
 it("persistent provider 503 trips a bounded fail-closed cooldown without a retry stampede",async()=>{
   const env={DB:{}};let origin=0;
   const cached=async()=>Response.json({ok:false},{status:503});
   const canonical=async()=>{origin++;return Response.json({ok:false},{status:503});};
   expect((await deliverThreeDomainStructuredWithCacheRecovery(env,NOW,cached,canonical)).status).toBe(503);
   expect((await deliverThreeDomainStructuredWithCacheRecovery(env,NOW,cached,canonical)).status).toBe(503);
   expect(origin).toBe(2);
 });
 it("non-503 upstream restrictions do not trigger hidden retries",async()=>{
   for(const status of [400,401,429]){
     let origin=0;
     const response=await deliverThreeDomainStructuredWithCacheRecovery({DB:{}},NOW,
       async()=>Response.json({ok:false},{status}),
       async()=>{origin++;return Response.json(source());});
     expect(response.status).toBe(503); // public delivery stays fail-closed
     expect(origin).toBe(0);
   }
 });
 it("has dedicated public Worker GET with shared read-only edge caching, no partner path changes",()=>{
   const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
   expect(index).toContain('/v1/public/three-domain-structured-output');
   expect(index).toContain("deliverThreeDomainStructuredWithCacheRecovery(env,()=>Date.now(),");
   expect(index).toContain("publicReadCache(()=>threeDomainEvidenceContinuity(env),canonicalRequest)");
   expect(index).toContain("publicReadCache(()=>threeDomainEvidenceContinuity(env),originalCacheRequest)");
   expect(index).toContain('new URL("/v1/public/three-domain-continuity",request.url)');
   const code=readFileSync("workers/control-plane/src/three-domain-structured-delivery.mjs","utf8");
   expect(code).not.toContain("settleCoinbaseX402");
   expect(code).not.toContain("requireRiskSupabase");
   expect(code).not.toContain("publishDerivedStories(env");
   expect(code).toContain("threeDomainEvidenceContinuity");
 });
});
