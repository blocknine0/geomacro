#!/usr/bin/env bun
/**
 * 5-minute BEST EFFORT news latency fastlane, exactly one existing first-party
 * original publisher per domain. NO GDELT-as-original, no paid source,
 * no 195-country completeness assertion and no customer raw article bytes.
 * Uses existing authenticated 72h Cloudflare D1 journal, zero new tables,
 * no B2, no signing, no x402 settlement.
 */
import {createHmac} from "node:crypto";
import {FIVE_MINUTE_NEWS_FASTLANE,readFiveMinuteNewsFastlane} from "../../src/lib/stateless-public-intelligence.server";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client";
import type {StatelessIntelligenceSignal} from "../../src/lib/stateless-intelligence-model";

const ROOT=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(ROOT.length<32)throw Error("FIVE_MIN_NEWS_PROTECTED_D1_AUTH_REQUIRED");
const token=createHmac("sha256",ROOT).update("geomacro-control-plane-v1").digest("hex");
const endpoint="https://geomacro-control-plane.daspallab202391.workers.dev/v1/website-derived-news";
const categories=["geopolitics","macro","rare_earth"] as const;
const runAt=Date.now();
// Full verified D1 baseline BEFORE origin polling. Repeated releases are never
// counted as fresh 20-minute deliveries or written again on every tick.
// Fail closed if the bounded journal reader is unavailable.
const baseline=await fetchAllDerivedNews(fetch,runAt);
const existingIds=new Set(baseline.map(s=>s.id));
const reports=await readFiveMinuteNewsFastlane(runAt,20);
let failure=false,allPublished:StatelessIntelligenceSignal[]=[];
for(const category of categories){
 const report=reports.find(r=>r.category===category);
 const expectedOrigins=FIVE_MINUTE_NEWS_FASTLANE.filter(s=>s.category===category).length;
 if(!report||report.feed_count!==expectedOrigins||report.healthy_feed_count<1){
   failure=true;
   console.warn("::warning::FASTLANE_ORIGINAL_PUBLISHER_UNAVAILABLE_"+category.toUpperCase());
   continue;
 }
 // Existing verifier already requires original-native published clock plus
 // 15m minimum delay. Do not override it, including day-only conservative lag.
 const candidates=report.signals.filter(s=>
   s.category===category&&s.severity===null&&
   s.same_event_corrob_verified===false&&!existingIds.has(s.id)&&
   Date.parse(s.published_at)>=runAt-72*3600000&&
   (s.date_precision==="exact"
      ?Date.parse(s.published_at)+15*60000<=runAt
      :Date.parse(s.published_at)+36*3600000+15*60000<=runAt));
 try {
  for(let i=0;i<candidates.length;i+=20){
   const batch=candidates.slice(i,i+20);
   const response=await fetch(endpoint,{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:batch}),
    signal:AbortSignal.timeout(12000),
   });
   if(!response.ok)throw Error("D1_WRITE_UNAVAILABLE");
   const receipt=await response.json() as {ok?:boolean;accepted?:number};
   if(receipt.ok!==true||receipt.accepted!==batch.length)throw Error("D1_ACK_INVALID");
   allPublished.push(...batch);
  }
 }catch{
   failure=true;
   console.error("::error::FASTLANE_D1_WRITE_UNVERIFIED_"+category.toUpperCase());
 }
 console.log(JSON.stringify({
   schema:"geomacro.5min-original-lane.v1",category,
   original_publisher_health:true,
   original_publishers_checked:expectedOrigins,
   original_publishers_reachable:report.healthy_feed_count,
   one_unreachable_publisher_does_not_block_other_origin:true,
   source_native_candidates:report.releases_examined,
   admitted_bounded_derived_records:candidates.length,
   historical_reference_is_not_new_event:true,
   external_source_rights_reviewed:false,
   independent_same_event_verified:false,chargeable:false,
 }));
}
if(allPublished.length){
 try{
  // Read the SAME journal via its strict 250/500-page complete verified reader;
  // don't report delivered only because D1 returned HTTP 200 on PUT.
  const records=await fetchAllDerivedNews(fetch,Date.now());
  const ids=new Set(records.map(s=>s.id));
  if(allPublished.some(s=>!ids.has(s.id)))throw Error("D1_INDEPENDENT_READBACK_MISSING");
  const ackNow=Date.now();
  const originalExact=allPublished.filter(s=>s.date_precision==="exact");
  const counts=originalExact.reduce((a,s)=>{
   const delay=ackNow-Date.parse(s.published_at);
   if(delay>=15*60000 && delay<=20*60000)a.in_target++;
   else a.outside_target++;
   return a;
  },{in_target:0,outside_target:0});
  console.log(JSON.stringify({
    schema:"geomacro.5min-original-news-latency.v1",
    objective_minutes:20,minimum_public_delay_minutes:15,
    github_schedule_guaranteed:false,
    source_portfolio_exhaustive_195x3:false,
    original_exact_publications_verified:originalExact.length,
    previously_retained_derived_ids_excluded:existingIds.size,
    newly_unobserved_to_prefetch_derived_rows:allPublished.length,
    exact_first_writer_attribution_verified:false,
    measurement_is_true_first_insert_utc:false,
    exact_publications_within_target_at_d1_readback:counts.in_target,
    exact_publications_outside_target_at_d1_readback:counts.outside_target,
    day_precision_excluded_from_20min_clock:allPublished.length-originalExact.length,
    verified_d1_readback_rows:allPublished.length,
    consumer_rights_verified:false,signed:false,chargeable:false,
    raw_upstream_delivered:false,
  }));
 }catch{
  failure=true;
  console.error("::error::FASTLANE_D1_FULL_JOURNAL_READBACK_FAILED");
 }
}
console.log(JSON.stringify({
 schema:"geomacro.5min-three-domain-original-news-run.v1",
 configured_categories:3,pinned_original_publishers:FIVE_MINUTE_NEWS_FASTLANE.length,
 scheduled_interval_minutes:5,latency_objective_minutes:20,
 max_derived_rows_per_category:20,all_world_news_guaranteed:false,
 publisher_source_clock_not_fetch_clock:true,
 existing_d1_72h_journal_only:true,b2_requests:0,supabase_requests:0,
 x402_charges:0,original_content_persisted:false,
}));
if(failure)process.exitCode=2;
