#!/usr/bin/env bun
/**
 * 5-minute BEST EFFORT news latency fastlane, exactly one existing first-party
 * original publisher per domain. NO GDELT-as-original, no paid source,
 * no 195-country completeness assertion and no customer raw article bytes.
 * Uses existing authenticated 72h Cloudflare D1 journal, zero new tables,
 * no B2, no signing, no x402 settlement.
 */
import {createHmac} from "node:crypto";
import {writeFileSync} from 'node:fs';
import {FIVE_MINUTE_NEWS_FASTLANE,readFiveMinuteNewsFastlane} from "../../src/lib/stateless-public-intelligence.server";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client";
import {reconcilePrivateDerivedSourceRefs,selectBoundedRetainedOriginalTargets,type StatelessSourceCandidate,type StatelessIntelligenceSignal} from "../../src/lib/stateless-intelligence-model";
import {DERIVED_NEWS_TOPIC_POLICY_REVISION,requireDerivedNewsWorkerPolicy} from "../lib/derived-news-readback-policy.mjs";

const ROOT=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(ROOT.length<32)throw Error("FIVE_MIN_NEWS_PROTECTED_D1_AUTH_REQUIRED");
const token=createHmac("sha256",ROOT).update("geomacro-control-plane-v1").digest("hex");
const controlPlaneOrigin="https://geomacro-control-plane.daspallab202391.workers.dev";
const endpoint=controlPlaneOrigin+"/v1/website-derived-news";
const categories=["geopolitics","macro","rare_earth"] as const;
const workerPolicy=await requireDerivedNewsWorkerPolicy({
 fetchImpl:globalThis.fetch,url:controlPlaneOrigin+"/health",
 expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
});
console.log(JSON.stringify(workerPolicy));
const runAt=Date.now();
// Full verified D1 baseline BEFORE origin polling. Repeated releases are never
// counted as fresh 20-minute deliveries or written again on every tick.
// Fail closed if the bounded journal reader is unavailable.
const baseline=await fetchAllDerivedNews(fetch,runAt,{fresh:true});
const existingIds=new Set(baseline.map(s=>s.id));
const privateOriginals:StatelessSourceCandidate[]=[];
const reports=await readFiveMinuteNewsFastlane(runAt,20,
 process.env.GEOMACRO_LOW_SOURCE_REVIEW==='1'?items=>privateOriginals.push(...items):undefined);
let failure=false,allPublished:StatelessIntelligenceSignal[]=[];
for(const category of categories){
 const report=reports.find(r=>r.category===category);
 const expectedOrigins=FIVE_MINUTE_NEWS_FASTLANE.filter(s=>s.category===category).length;
 // Every primary publisher is always attempted. Only if all primaries fail
 // or none has a qualifying recent release, ONE existing alternative is polled.
 if(!report||report.feed_count<expectedOrigins||
    report.feed_count>expectedOrigins+1||report.healthy_feed_count<1){
   failure=true;
   console.warn("::warning::FASTLANE_ORIGINAL_PUBLISHER_UNAVAILABLE_"+category.toUpperCase());
   continue;
 }
 // Preserve native publication clocks and reject future originals.
 // Exact clocks have no added delay; day-only date uncertainty remains.
 const candidates=report.signals.filter(s=>
   s.category===category&&s.severity===null&&
   s.same_event_corrob_verified===false&&!existingIds.has(s.id)&&
   Date.parse(s.published_at)>=runAt-72*3600000&&
   (s.date_precision==="exact"
      ?Date.parse(s.published_at)<=runAt
      :Date.parse(s.published_at)+36*3600000<=runAt));
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
   conditional_fallback_attempted:report.feed_count>expectedOrigins,
   fallback_reason:report.fallback_reason??null,
   primary_publishers_reachable:report.primary_healthy_feed_count??0,
   recent_qualifying_primary_releases:report.recent_primary_release_count??0,
   // Allowlisted source IDs expose the exact broken origin, never source URLs.
   primary_publisher_status:report.primary_publisher_status??[],
   fallback_publisher_status:report.fallback_publisher_status??[],
   fallback_source_reachable:report.feed_count>expectedOrigins&&
     report.healthy_feed_count>(report.primary_healthy_feed_count??0),
   no_extra_reads_when_recent_primary_release_available:report.feed_count===expectedOrigins,
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
  const records=await fetchAllDerivedNews(fetch,Date.now(),{fresh:true});
  const ids=new Set(records.map(s=>s.id));
  if(allPublished.some(s=>!ids.has(s.id)))throw Error("D1_INDEPENDENT_READBACK_MISSING");
  const ackNow=Date.now();
  const originalExact=allPublished.filter(s=>s.date_precision==="exact");
  const counts=originalExact.reduce((a,s)=>{
   const delay=ackNow-Date.parse(s.published_at);
   if(delay>=0 && delay<=20*60000)a.in_target++;
   else a.outside_target++;
   return a;
  },{in_target:0,outside_target:0});
  console.log(JSON.stringify({
    schema:"geomacro.5min-original-news-latency.v1",
    objective_minutes:20,minimum_public_delay_minutes:0,
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
 max_conditional_fallback_publishers_per_run:3,
 fallback_for_primary_outage_or_no_recent_release:true,
 scheduled_interval_minutes:5,latency_objective_minutes:20,
 max_derived_rows_per_category:20,all_world_news_guaranteed:false,
 publisher_source_clock_not_fetch_clock:true,
 existing_d1_72h_journal_only:true,b2_requests:0,supabase_requests:0,
 x402_charges:0,original_content_persisted:false,
}));
if(process.env.GEOMACRO_LOW_SOURCE_REVIEW==='1'){
 try{
  const path=process.env.GEOMACRO_LOW_REVIEW_REFS_FILE??'',temp=process.env.RUNNER_TEMP??'';
  if(!temp||!path.startsWith(temp+'/')||path.includes('/../'))throw Error('PRIVATE_HANDOFF_PATH_INVALID');
  // Recover retained exact D1 stories omitted by this poll's top-20
  // display budget. Reuse already fetched official candidates and the
  // initial authenticated journal baseline: NO extra publisher request.
  // Reconcile against the complete bounded baseline rather than the
  // default 250-target subset; exact source-ID/clock/payload matches still gate.
  const targets=selectBoundedRetainedOriginalTargets(
    reports.flatMap(r=>r.signals),baseline,600);
  const refs=reconcilePrivateDerivedSourceRefs(privateOriginals,targets,runAt);
  writeFileSync(path,JSON.stringify({refs:[...refs]}),{mode:0o600,flag:'wx'});
 }catch{failure=true;console.error('::error::FASTLANE_PRIVATE_HANDOFF_UNAVAILABLE');}
}
if(failure)process.exitCode=2;
