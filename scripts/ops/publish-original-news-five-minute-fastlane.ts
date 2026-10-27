#!/usr/bin/env bun
import {packDerivedNewsBatches} from "../lib/macro-fx-metals.mjs";
import {publishFastlaneSourceCheckpoints} from "../lib/fastlane-source-checkpoints.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {collectCriticalMineralsFastlane} from "../lib/critical-minerals-fastlane.mjs";
import {collectMacroFastlane} from "../lib/macro-fastlane-collector.mjs";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model";
/**
 * 5-minute BEST EFFORT news latency fastlane, exactly one existing first-party
 * original publisher per domain. NO GDELT-as-original, no paid source,
 * no 195-country completeness assertion and no customer raw article bytes.
 * Uses existing authenticated 72h Cloudflare D1 journal, zero new tables,
 * no B2, no signing, no x402 settlement.
 */
import {createHmac} from "node:crypto";
import {writeFileSync,mkdirSync} from 'node:fs';
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
const sourceIntakeOnly=process.env.GEOMACRO_SOURCE_INTAKE_ONLY==='1';
const runAt=Date.now();
// Full verified D1 baseline BEFORE origin polling. Repeated releases are never
// counted as fresh 20-minute deliveries or written again on every tick.
// Fail closed if the bounded journal reader is unavailable.
// Repair the bounded journal before reading: unrelated prior writers can
// leave a 601st row, which the strict bundle correctly refuses to serve.
const initialSweep=await fetch(endpoint,{method:"PUT",redirect:"error",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:[]}),signal:AbortSignal.timeout(12000)});
if(!initialSweep.ok)throw Error("FASTLANE_INITIAL_RETENTION_SWEEP_FAILED");
const baseline=await fetchAllDerivedNews(fetch,runAt);
const existingIds=new Set(baseline.map(s=>s.id));
const privateOriginals:StatelessSourceCandidate[]=[];
const reports=await readFiveMinuteNewsFastlane(runAt,20,
 items=>privateOriginals.push(...items));
// One existing quota-admitted run shares its complete D1 baseline and primary
// Fed/ECB origin reads with the Macro Economics FX/precious-metals bundle.
const macroStateUrl=controlPlaneOrigin+"/v1/internal/macro-fastlane";
let previousMacroState={};
try{
 const stateResponse=await fetch(macroStateUrl,{headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!stateResponse.ok)throw Error("MACRO_STATE_READ_UNAVAILABLE");
 previousMacroState=(await stateResponse.json() as {state:Record<string,unknown>}).state;
}catch{console.warn("::warning::MACRO_CURSOR_READ_UNAVAILABLE; bounded source polling continues without conditional-GET cursors");}
const macro=await collectMacroFastlane({now:runAt,quoteClock:Date.now,state:previousMacroState,
 reusedCandidates:privateOriginals,reusedIds:FIVE_MINUTE_NEWS_FASTLANE.filter(s=>s.category==="macro").map(s=>s.id)});
privateOriginals.push(...macro.candidates.filter(c=>!privateOriginals.some(p=>p.sourceId===c.sourceId&&p.articleUrl===c.articleUrl)));
const macroReport=reports.find(r=>r.category==="macro");
if(!macroReport)throw Error("MACRO_REPORT_ABSENT");
macroReport.signals=deriveStatelessSignals(macro.candidates,runAt,{maxSignals:40});
for(const shared of macroReport.primary_publisher_status??[]){
 if(["fed_press","ecb_press"].includes(shared.id))macro.state.source_checks=[...macro.state.source_checks.filter(c=>c.id!==shared.id),{id:shared.id,state:shared.reachable?"OK":"UNAVAILABLE",candidates:shared.native_candidate_count}];
}
console.log(JSON.stringify(macro.receipt));
const mineral=await collectCriticalMineralsFastlane({now:runAt,state:previousMacroState,reusedCandidates:privateOriginals,
 macroNeedsFallback:macro.state.source_checks.some(c=>!["OK","NOT_MODIFIED"].includes(c.state))||!macro.candidates.some(c=>runAt-Date.parse(c.publishedAt)<=60*60000)});
macro.state.mineral_cursors=mineral.cursors;
macro.state.mineral_checks=mineral.checks;
macro.state.mineral_regions=mineral.receipt.regional_groups;
for(const category of ["macro","rare_earth"] as const){
 const report=reports.find(r=>r.category===category);
 if(report)report.signals=[...new Map([...report.signals,...mineral.signals.filter(s=>s.category===category)].map(s=>[s.id,s])).values()].sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,60);
}
console.log(JSON.stringify(mineral.receipt));
let journalVerified=true;
let failure=false,allPublished:StatelessIntelligenceSignal[]=[];
const pending:StatelessIntelligenceSignal[]=[];
let verifiedArchiveSignals=baseline;
for(const category of categories){
 const report=reports.find(r=>r.category===category);
 const expectedOrigins=FIVE_MINUTE_NEWS_FASTLANE.filter(s=>s.category===category).length;
 // Every primary publisher is always attempted. Only if all primaries fail
 // or none has a qualifying recent release, ONE existing alternative is polled.
 if(!report||report.feed_count<expectedOrigins||
    report.feed_count>expectedOrigins+1||(report.healthy_feed_count<1&&!report.signals.length)){
   failure=true;
   console.warn("::warning::FASTLANE_ORIGINAL_PUBLISHER_UNAVAILABLE_"+category.toUpperCase());
   continue;
 }
 // Preserve native publication clocks and reject future originals.
 // Exact clocks have no added delay; day-only date uncertainty remains.
 const candidates=report.signals.filter(s=>
   verifyDerivedStory(s,runAt)&&s.category===category&&s.severity===null&&
   s.same_event_corrob_verified===false&&!existingIds.has(s.id)&&
   Date.parse(s.published_at)>=runAt-72*3600000&&
   (s.date_precision==="exact"
      ?Date.parse(s.published_at)<=runAt
      :Date.parse(s.published_at)+36*3600000<=runAt));
 pending.push(...candidates);
 console.log(JSON.stringify({
   schema:"geomacro.5min-original-lane.v1",category,
   original_publisher_health:report.healthy_feed_count>0,
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
// Source-only allocation caps newly written rows at 50, balanced across all
// three categories. The existing critical lane retains its normal wider cap.
const publishPending:StatelessIntelligenceSignal[]=[];
if(sourceIntakeOnly){
 const lanes=categories.map(c=>pending.filter(s=>s.category===c).sort((a,b)=>b.published_at.localeCompare(a.published_at)));
 for(let i=0;publishPending.length<50&&lanes.some(l=>i<l.length);i++)for(const lane of lanes)if(lane[i]&&publishPending.length<50)publishPending.push(lane[i]);
}else publishPending.push(...pending);
// Cross-category writes are packed into the maximum accepted 50-row batch.
// Empty ticks do not cause retention scans or write unchanged release rows.
try{
 for(const batch of packDerivedNewsBatches(publishPending)){
  const response=await fetch(endpoint,{method:"PUT",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:batch}),signal:AbortSignal.timeout(12000)});
  const ack=await response.json() as {ok?:boolean;accepted?:number};
  if(!response.ok||ack.ok!==true||ack.accepted!==batch.length)throw Error("BUNDLED_JOURNAL_ACK_INVALID");
  allPublished.push(...batch);
 }
}catch{journalVerified=false;failure=true;console.error("::error::BUNDLED_FASTLANE_JOURNAL_WRITE_FAILED");}
if(allPublished.length){
 try{
  // One retention sweep prevents a 601st row from making the next bounded
  // journal bundle unreadable. It preserves native clocks and archive history.
  const prune=await fetch(endpoint,{method:"PUT",redirect:"error",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:[]}),signal:AbortSignal.timeout(12000)});
  if(!prune.ok)throw Error("JOURNAL_RETENTION_SWEEP_FAILED");
  // Read the SAME journal via its strict 250/500-page complete verified reader;
  // don't report delivered only because D1 returned HTTP 200 on PUT.
  const records=await fetchAllDerivedNews(fetch,Date.now());
  const ids=new Set(records.map(s=>s.id));
  const retentionWithheld=allPublished.filter(s=>!ids.has(s.id)).length;
  if(retentionWithheld)console.log(JSON.stringify({schema:"geomacro.news-retention-held.v1",rows_not_retained:retentionWithheld,claimed_delivered:false}));
  allPublished=allPublished.filter(s=>ids.has(s.id));
  verifiedArchiveSignals=records;
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
  journalVerified=false;failure=true;
  console.error("::error::FASTLANE_D1_FULL_JOURNAL_READBACK_FAILED");
 }
}
// Advance conditional-GET cursors and grant a short release-time quota
// lease only after journal publication/readback succeeds. A failed run never
// loses candidates behind a persisted ETag or renews the minute poller.
if(journalVerified){
 const response=await fetch(macroStateUrl,{method:"PUT",redirect:"error",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(macro.state),signal:AbortSignal.timeout(12000)});
 if(!response.ok){failure=true;console.error("::error::MACRO_BUNDLE_STATE_WRITE_FAILED");}
 // The existing Predge continuity monitor reads these authenticated source
 // checkpoints. Refresh only after actual publication and complete readback.
 try{
  const financial=new Set(['fxstreet_news','google_macro_metals']);
  const supplementary={
   macro:{checks:[...macro.polledChecks,...mineral.checks.filter(c=>financial.has(c.id))],candidates:macro.candidates.length+mineral.signals.filter(s=>s.category==='macro').length},
   rare_earth:{checks:mineral.checks.filter(c=>!financial.has(c.id)),candidates:mineral.signals.filter(s=>s.category==='rare_earth').length},
  };
  console.log(JSON.stringify(await publishFastlaneSourceCheckpoints({reports,supplementary,published:allPublished,checkedAt:new Date().toISOString(),origin:controlPlaneOrigin,token})));
 }catch{failure=true;console.error('::error::FASTLANE_SOURCE_CHECKPOINT_WRITE_FAILED');}
}
console.log(JSON.stringify({
 schema:"geomacro.5min-three-domain-original-news-run.v1",
 configured_categories:3,pinned_original_publishers:FIVE_MINUTE_NEWS_FASTLANE.length,
 max_conditional_fallback_publishers_per_run:3,
 fallback_for_primary_outage_or_no_recent_release:true,
 scheduled_interval_minutes:5,latency_objective_minutes:20,
 max_derived_rows_per_category:60,all_world_news_guaranteed:false,
 publisher_source_clock_not_fetch_clock:true,
 existing_d1_72h_journal_only:true,b2_requests:0,supabase_requests:0,
 x402_charges:0,original_content_persisted:false,
}));
// Reuse the already verified complete baseline and successful writes. Static
// website publication must not perform another D1 fetch for the same batch.
if(journalVerified){
 mkdirSync("artifacts/derived-news",{recursive:true});
 const archiveSignals=verifiedArchiveSignals;
 writeFileSync("artifacts/derived-news/permanent-archive-candidates.json",JSON.stringify({schema:"geomacro.permanent-derived-news-candidates.v1",signals:archiveSignals}),{mode:0o600});
}
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
