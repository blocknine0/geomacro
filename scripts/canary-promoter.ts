#!/usr/bin/env node
/** Guarded Cloudflare Workers versions promotion: 0,1,5,25,50,100; no funds. */
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {api,graphql,need,UUID_RE,envString,assertOfficialMain,signedReport,verifySignedEnvelopeFile,canonical,canonicalContentSha256,holdError,ORIGIN,WORKER,D1_DAILY_READ_CEILING,D1_DAILY_WRITE_CEILING} from './release-common.ts';
import {
 checkD1PaidMonthlyHeadroom,paidD1BillingCycle
} from './lib/d1-workers-paid-monthly-governor.mjs';
import {admitSignedStep3ProductionFile}
  from './lib/d1-step3-production-canary-admission.mjs';
import {assessReviewedHot50BindingParity} from './lib/canary-additive-binding-parity.mjs';
const HOLD='config/d1-hotspot-v2-canary.hold';
const STAGES=[0,1,5,25,50,100] as const;
const stageWindowMs=(percent:number)=>percent===1?30*60*1000:15*60*1000;
const INTERVAL_MS=30000;
// The owner's retired 140k/day cap no longer applies. Provider Paid
// allowance is 25B reads / 50M writes per 5th-to-5th billing cycle.
const MONTHLY_READ_SOFT=17_500_000_000;
const MONTHLY_WRITE_SOFT=35_000_000;
const D1_MONTHLY_RESERVE_PCT=30;
const D1_HOURLY_READ_CAP=24_000_000;
const D1_HOURLY_WRITE_CAP=45_000;
const D1_MIN_RATE_SAMPLE_MS=5*60*1000;
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const route=`/workers/scripts/${WORKER}/deployments`;
const info=(id:string)=>`/workers/scripts/${WORKER}/versions/${id}`;
// Cloudflare Workers invocation quantiles expose wallTimeP99 in MICROSECONDS,
// not requestDurationP99 in milliseconds. Query the exact routed Worker
// version, not the aggregate script; a 1% canary can be hidden by 99% baseline.
const GRAPH=`query CanaryObservability($accountTag:string!,$script:string!,$version:string!,$zoneTag:string!,$host:string!,$start:Time!,$end:Time!){
 viewer{
  accounts(filter:{accountTag:$accountTag}){
   workersInvocationsAdaptive(limit:1,filter:{scriptName:$script,scriptVersion:$version,datetime_geq:$start,datetime_leq:$end}){
    dimensions{scriptVersion} sum{requests errors} quantiles{wallTimeP95 wallTimeP99}
   }
  }
  zones(filter:{zoneTag:$zoneTag}){
   httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:$start,datetime_lt:$end,clientRequestHTTPHost:$host}){
    count ratio{status5xx}
   }
  }
 }
}`;
async function liveCurrent():Promise<any>{
 const r=await api(route+'?per_page=1');
 need(Array.isArray(r.deployments)&&r.deployments.length===1,'CANARY_DEPLOYMENT_UNVERIFIED');
 return r.deployments[0];
}
const distribution=(base:string,candidate:string,percent:number)=>percent===100?
 [{version_id:candidate,percentage:100}]:[
 {version_id:base,percentage:100-percent},{version_id:candidate,percentage:percent}];
function verifyDistribution(deployment:any,expected:any[]){
 const actual=deployment?.versions;
 need(Array.isArray(actual)&&actual.length===expected.length&&
  expected.every(x=>actual.some((a:any)=>a.version_id===x.version_id&&Number(a.percentage)===x.percentage)),
  'CANARY_REMOTE_SPLIT_MISMATCH');
}
async function deployVersions(base:string,candidate:string,percent:number){
 const versions=distribution(base,candidate,percent);
 const result=await api(route,{method:'POST',body:JSON.stringify({strategy:'percentage',versions})});
 verifyDistribution(result,versions);
 for(let tries=0;tries<6;tries++){
  try{verifyDistribution(await liveCurrent(),versions);return}catch{await wait(3000)}
 }
 throw Error('CANARY_DEPLOYMENT_READBACK_TIMEOUT');
}
async function deployBaseline(base:string){
 const versions=[{version_id:base,percentage:100}];
 const result=await api(route,{method:'POST',body:JSON.stringify({strategy:'percentage',versions})});
 verifyDistribution(result,versions);
 for(let tries=0;tries<6;tries++){
  try{verifyDistribution(await liveCurrent(),versions);return}catch{await wait(3000)}
 }
 throw Error('CANARY_ROLLBACK_BASELINE_READBACK_FAILED');
}
async function checkSource(candidate:string,expectedSha:string){
 const response=await fetch(ORIGIN+'/health',{headers:{'Cloudflare-Workers-Version-Overrides':`${WORKER}="${candidate}"`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 const b=await response.json().catch(()=>null);
 need(response.status===200&&b?.ok===true&&b?.deployed_source_sha===expectedSha,'CANARY_DIRECTED_HEALTH_SHA_UNVERIFIED');
}
async function checkVersionParity(base:string,candidate:string,headSha:string,{requireFreshReview=true}={}){
 const [a,b]=await Promise.all([api(info(base)),api(info(candidate))]);
 need(a.id===base&&b.id===candidate,'CANARY_VERSIONS_NOT_VERIFIED');
 // Flag opt-in is always reviewed, including when no new secrets were needed.
 // The owner signature is bound to both immutable version UUIDs and exact main.
 const file='artifacts/release/canary-reviewed-additive-bindings.json';
 need(existsSync(file),'CANARY_HOT50_SIGNED_OWNER_REVIEW_MISSING');
 const review=verifySignedEnvelopeFile(file);
 need(review.schema==='geomacro.canary.additive-secret-review.v1'&&
  review.status==='PASS'&&review.source_sha===headSha&&
  review.baseline_version===base&&review.candidate_version===candidate&&
  review.no_funds===true&&review.commercial_release_authorized===false&&
  review.hold_cleared===false&&
  review.reviewed_hot50_runtime==='ENABLE_HOT50_RESEARCH_NO_FUNDS'&&
  review.owner_workflow_confirmation==='PROMOTE_HOT50_NO_FUNDS'&&
  Array.isArray(review.reviewed_secret_names)&&
  Number.isFinite(Date.parse(String(review.reviewed_at)))&&
  (!requireFreshReview||Date.now()-Date.parse(String(review.reviewed_at))<3_600_000)&&
  Date.now()>=Date.parse(String(review.reviewed_at)),
  'CANARY_HOT50_REVIEW_NOT_EXACT_OR_FRESH');
 return assessReviewedHot50BindingParity(a,b,headSha,review.reviewed_secret_names);
}

async function verifiedLiveObservability(start:string,end:string,version:string,requireVolume=true){
 const account=envString('CLOUDFLARE_ACCOUNT_ID',32),zone=envString('CLOUDFLARE_ZONE_ID',32);
 const graph=await graphql(GRAPH,{accountTag:account,script:WORKER,version,zoneTag:zone,host:'api.geomacro.live',start,end});
 const worker=graph.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
 const http=graph.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0];
 const requests=worker?.sum?.requests,errors=worker?.sum?.errors;
 const siteCount=http?.count,ratio=http?.ratio?.status5xx;
 const wallTimeP95Us=worker?.quantiles?.wallTimeP95;
 const wallTimeP99Us=worker?.quantiles?.wallTimeP99;
 // HTTP 5xx remains zone-host aggregate; Workers invocation errors are
 // exact scriptVersion. Both must pass, and low candidate volume holds.
 // wallTimeP99 is microseconds; convert to milliseconds for the 50ms SLO.
 need(worker?.dimensions?.scriptVersion===version&&
  Number.isSafeInteger(requests)&&Number.isSafeInteger(errors)&&
  Number.isSafeInteger(siteCount)&&
  typeof ratio==='number'&&ratio>=0&&ratio<=1&&
  typeof wallTimeP99Us==='number'&&Number.isFinite(wallTimeP99Us)&&wallTimeP99Us>=0&&
  typeof wallTimeP95Us==='number'&&Number.isFinite(wallTimeP95Us)&&wallTimeP95Us>=0,
  'CANARY_PROVIDER_VERSION_METRICS_UNAVAILABLE');
 const p95=wallTimeP95Us/1000;
 const p99=wallTimeP99Us/1000;
 need(p95<=p99,'CANARY_PROVIDER_QUANTILES_INCONSISTENT');
 if(requests<1000||siteCount<1000){
  need(!requireVolume,'CANARY_PROVIDER_SAMPLE_FLOOR_UNMET');
  return null;
 }
 return {worker_script_version:version,worker_requests:requests,worker_errors:errors,
  worker_error_ratio:errors/requests,host_requests:siteCount,
  http_5xx_ratio:ratio,worker_wall_time_p95_ms:p95,worker_wall_time_p99_ms:p99,
  http_5xx_under_0_5pct:ratio<=0.005,
  version_errors_under_0_5pct:errors/requests<=0.005,
  p99_under_50ms:p99<50,
  host_http_5xx_not_version_isolated:true,worker_metrics_version_isolated:true};
}
// All D1 databases and every day in the 5th-to-5th Paid billing cycle,
// never only the current UTC day. GraphQL telemetry lags; a provider
// response is a read-only observation, NOT an atomic payment/spend ceiling.
async function checkLiveD1Budget(){
 const now=new Date();
 const receipt=await checkD1PaidMonthlyHeadroom({
  env:process.env,now,lane:'canary'});
 need(receipt.status==='PASS'&&
  receipt.provider_subscription_verified===true&&
  receipt.old_daily_140k_policy_applied===false&&
  receipt.monthly_ceiling_read===MONTHLY_READ_SOFT&&
  receipt.monthly_ceiling_written===MONTHLY_WRITE_SOFT&&
  receipt.reserve_pct===D1_MONTHLY_RESERVE_PCT&&
  receipt.operational_daily_ceiling_written===1_100_000&&
  receipt.operational_daily_ceiling_read===580_000_000&&
  receipt.operational_hourly_ceiling_written===D1_HOURLY_WRITE_CAP&&
  Number.isSafeInteger(receipt.observed_rows_read)&&
  Number.isSafeInteger(receipt.observed_rows_written),
  'CANARY_PAID_MONTHLY_D1_PROVIDER_UNVERIFIED');
 const cycle=paidD1BillingCycle(now);
 need(receipt.cycle_start_utc===cycle.start_utc&&
  receipt.cycle_end_exclusive_utc===cycle.end_exclusive_utc,
  'CANARY_PAID_BILLING_CYCLE_STALE');
 return {rows_read:receipt.observed_rows_read,
  rows_written:receipt.observed_rows_written,
  cycle_start_utc:receipt.cycle_start_utc,
  cycle_end_exclusive_utc:receipt.cycle_end_exclusive_utc,
  monthly_soft_read:receipt.monthly_ceiling_read,
  monthly_soft_written:receipt.monthly_ceiling_written,
  elapsed_cycle_ms:cycle.elapsed_ms,cycle_duration_ms:cycle.duration_ms,
  observed_at_ms:Date.now(),provider_metrics_delayed:true,
  remaining_rows_read:receipt.remaining_rows_read,
  remaining_rows_written:receipt.remaining_rows_written};
}
/** Physical provider-observed monthly-paced growth, with independent
 * read and write rates. A rollover invalidates the sample (HOLD);
 * no daily 5,800 rows/hour gate or synthetic spike PASS.
 */
function assertD1ObservedHourlyPace(start:any,latest:any){
 need(start?.cycle_start_utc===latest?.cycle_start_utc&&
  start?.cycle_end_exclusive_utc===latest?.cycle_end_exclusive_utc&&
  Number.isSafeInteger(start?.observed_at_ms)&&
  Number.isSafeInteger(latest?.observed_at_ms),
  'CANARY_D1_BILLING_CYCLE_OR_CLOCK_UNVERIFIED');
 const ms=latest.observed_at_ms-start.observed_at_ms;
 if(ms<D1_MIN_RATE_SAMPLE_MS)return {status:'INSUFFICIENT_INTERVAL'};
 const read=latest.rows_read-start.rows_read;
 const written=latest.rows_written-start.rows_written;
 need(read>=0&&written>=0,'CANARY_D1_PROVIDER_COUNTER_REWIND');
 const readRate=read*3600000/ms,writeRate=written*3600000/ms;
 const readRateMax=D1_HOURLY_READ_CAP;
 const writeRateMax=D1_HOURLY_WRITE_CAP;
 need(readRate<=readRateMax&&writeRate<=writeRateMax,
  'CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE');
 return {status:'PASS_OBSERVED_PAID_MONTHLY_PACE',
  reads_per_hour:readRate,writes_per_hour:writeRate,
  max_reads_per_hour:readRateMax,max_writes_per_hour:writeRateMax,
  observed_window_ms:ms,metrics_are_delayed:true};
}
async function observeStage(base:string,candidate:string,pct:number,sha:string){
 const began=Date.now();let intervals=0;
 const windowMs=stageWindowMs(pct);
 // Inspect provider D1 spend at the start and every two health ticks.
 // A missing delayed provider receipt is HOLD, never a synthetic PASS.
 let d1=await checkLiveD1Budget();
 const initialD1=d1;
 let rate={status:'INSUFFICIENT_INTERVAL'} as any;
 while(Date.now()-began<windowMs){
  if(pct===0){
   // Version override can target the candidate only when the 0%-candidate
   // participates in the Cloudflare split deployment; baseline keeps 100%.
   await checkSource(candidate,sha);
   const health=await fetch(ORIGIN+'/health',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
   const status=await health.json().catch(()=>null);
   need(health.status===200&&status?.ok===true,'CANARY_BASELINE_HEALTH_UNAVAILABLE');
  }else await checkSource(candidate,sha);
  const x=await liveCurrent();verifyDistribution(x,distribution(base,candidate,pct));
  intervals++;
  if(intervals%2===0){
   d1=await checkLiveD1Budget();
   rate=assertD1ObservedHourlyPace(initialD1,d1);
   // Early complete provider windows may be under the statistical floor; once
   // 1000 real observations exist, any 5xx/latency regression rolls back now.
   if(Date.now()-began>=120000){
    const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),
     pct===0?base:candidate,false);
    if(result)need(result.http_5xx_under_0_5pct&&
     result.version_errors_under_0_5pct&&result.p99_under_50ms,'CANARY_LIVE_SLO_BREACH');
   }
  }
  await wait(Math.min(INTERVAL_MS,Math.max(1,windowMs-(Date.now()-began))));
 }
 d1=await checkLiveD1Budget();
 rate=assertD1ObservedHourlyPace(initialD1,d1);
 need(rate.status==='PASS_OBSERVED_PAID_MONTHLY_PACE',
  'CANARY_D1_PAID_MONTHLY_PACE_UNVERIFIED');
 const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),
  pct===0?base:candidate,true);
 need(result.http_5xx_under_0_5pct&&result.version_errors_under_0_5pct&&result.p99_under_50ms,
  'CANARY_SLO_BREACH');
 return {stage_percent:pct,verified_minutes:(Date.now()-began)/60000,intervals,...result,
  latest_d1_provider_observation:d1,
  observed_d1_hourly_pace:rate};
}
function requireSchemaAcceptance(expectedSha:string){
 const file='artifacts/release/d1-schema-acceptance.json';
 need(existsSync(file),'CANARY_D1_SCHEMA_PROOF_MISSING');
 const report=verifySignedEnvelopeFile(file);
 need(report.schema==='geomacro.d1-0204-0211.schema-acceptance.v1'&&
  report.status==='PASS'&&
  report.migrations_verified?.length===8&&report.release_sha===expectedSha&&
  report.paid_monthly_subscription_verified===true&&
  report.paid_monthly_billing_cycle_verified===true&&
  report.provider_account_wide_d1_usage_observed===true&&
  report.old_daily_140k_policy_applied===false&&
  report.paid_monthly_cycle_start_utc===paidD1BillingCycle(new Date()).start_utc&&
  report.paid_monthly_cycle_end_exclusive_utc===paidD1BillingCycle(new Date()).end_exclusive_utc&&
  Number.isFinite(Date.parse(String(report.paid_monthly_provider_checked_at_utc)))&&
  Date.now()-Date.parse(String(report.paid_monthly_provider_checked_at_utc))<600000&&
  Date.now()>=Date.parse(String(report.paid_monthly_provider_checked_at_utc))&&
  Date.now()-Date.parse(String(report.verified_at))<600000&&Date.now()>=Date.parse(String(report.verified_at)),
  'CANARY_D1_SCHEMA_PROOF_NOT_ACCEPTED');
}
/** Verify the real previous closed UTC-day producer receipt, not invented
 * monthly fields. Caller MUST verify its signed envelope and separately
 * refresh the Paid monthly account-wide governor before any hold release. */
export function admitSignedClosedD1DayForCanary(proof:any,now=new Date()){
 const DAY=86_400_000,HOUR=3_600_000;
 const day=new Date(now.getTime()-DAY).toISOString().slice(0,10);
 const begin=Date.parse(day+'T00:00:00.000Z'),end=begin+DAY;
 need(proof?.schema==='geomacro.d1-account-utc-24h-observation.v1'&&
  proof.status==='PASS'&&proof.day===day&&
  proof.period_start_utc===new Date(begin).toISOString()&&
  proof.period_end_exclusive_utc===new Date(end).toISOString()&&
  proof.expected_last_second_utc===new Date(end-1000).toISOString()&&
  now.getTime()>=end+HOUR&&now.getTime()<end+2*DAY&&
  proof.all_account_databases===true&&
  proof.no_unreported_group_claimed===false&&
  proof.analytics_provider_observation_not_provider_signed_ledger===true&&
  proof.account_wide_atomic_hard_cap_guaranteed===false&&
  proof.no_funds===true&&
  /^[a-f0-9]{64}$/.test(proof.provider_query_result_hmac_sha256??'')&&
  ['BILLING_READ_TOKEN','EXISTING_ACCOUNT_API_TOKEN'].includes(proof.analytics_credential_source)&&
  proof.budget_rows_read===D1_DAILY_READ_CEILING&&
  proof.budget_rows_written===D1_DAILY_WRITE_CEILING&&
  Number.isSafeInteger(proof.rows_read)&&proof.rows_read>=0&&
  Number.isSafeInteger(proof.rows_written)&&proof.rows_written>=0&&
  proof.rows_read<=D1_DAILY_READ_CEILING&&
  proof.rows_written<=D1_DAILY_WRITE_CEILING&&
  Number.isFinite(Date.parse(String(proof.observed_at)))&&
  Date.parse(String(proof.observed_at))>=end+HOUR&&
  Date.parse(String(proof.observed_at))<=now.getTime()&&
  now.getTime()-Date.parse(String(proof.observed_at))<2*DAY,
  'CANARY_HOLD_RELEASE_24H_D1_PROOF_INVALID');
 const rows=proof.database_receipts;
 need(Array.isArray(rows)&&rows.length>=1&&rows.length<1000&&
  proof.database_count===rows.length,'CANARY_HOLD_RELEASE_D1_DATABASE_COUNT_INVALID');
 let read=0,written=0,last='';
 for(const row of rows){
  need(typeof row?.database_id==='string'&&row.database_id.length>=10&&
   row.database_id>last&&Number.isSafeInteger(row.rows_read)&&row.rows_read>=0&&
   Number.isSafeInteger(row.rows_written)&&row.rows_written>=0,
   'CANARY_HOLD_RELEASE_D1_DATABASE_ROW_INVALID');
  last=row.database_id;read+=row.rows_read;written+=row.rows_written;
  need(Number.isSafeInteger(read)&&Number.isSafeInteger(written),
   'CANARY_HOLD_RELEASE_D1_SUM_OVERFLOW');
 }
 need(read===proof.rows_read&&written===proof.rows_written,
  'CANARY_HOLD_RELEASE_D1_TOTALS_DIVERGED');
 return {status:'PASS_CLOSED_UTC_DAY',day,account_wide_report_verified:true,
  monthly_provider_verification_required_separately:true,
  zero_unindexed_database_claimed:false,no_funds:true,remote_hold_removed:false};
}

/** Pre-promotion verify checks the EXISTING 100% baseline. Requiring the new
 * main SHA here would deadlock every protected upgrade (the new SHA must be
 * verified on the 0% version override before routing any candidate traffic).
 * This check performs zero provider mutation and certifies no new deployment. */
export function assessLiveCanaryBaseline(active:any,health:any,status:number,mainSha:string){
 need(/^[a-f0-9]{40}$/u.test(mainSha),'CANARY_MAIN_SHA_INVALID');
 const versions=active?.versions;
 need(Array.isArray(versions)&&versions.length===1&&
  UUID_RE.test(versions[0]?.version_id??'')&&
  Number(versions[0]?.percentage)===100,
  'CANARY_PRODUCTION_VERSION_SPLIT_NOT_SETTLED');
 need(status===200&&health?.ok===true&&
  /^[a-f0-9]{40}$/u.test(health.deployed_source_sha??''),
  'CANARY_LIVE_BASELINE_HEALTH_UNVERIFIED');
 return Object.freeze({status:'PASS',
  scope:'LIVE_EXISTING_BASELINE_100_NO_FUNDS',
  baseline_version_id:versions[0].version_id,
  baseline_source_sha:health.deployed_source_sha,
  candidate_exact_main_sha:mainSha,
  candidate_not_yet_promoted:health.deployed_source_sha!==mainSha,
  deployment_mutated:false,provider_evidence_signed:false,
  no_funds:true,remote_hold_unchanged:true});
}


/**
 * Offline shape admission ONLY. The caller must first verify each historical
 * receipt signature, exact GitHub workflow identity, current cloud version,
 * original source and fresh daily B2/Hot50/D1 account-wide proofs.
 * A completed 100% canary MUST NOT be replayed from 0% for HOLD review.
 */
export function admitCompletedCanaryForHoldReview({
 promotion,stageReceipts,headSha,baseline,candidate,stage2RunId
}:any){
 need(/^[a-f0-9]{40}$/u.test(headSha??'')&&
  UUID_RE.test(baseline??'')&&UUID_RE.test(candidate??'')&&
  baseline!==candidate&&/^[1-9][0-9]{5,20}$/u.test(String(stage2RunId??'')),
  'CANARY_HOLD_REVIEW_IDENTITY_INVALID');
 need(promotion?.schema==='geomacro.hot50.promotion.v1'&&
  promotion.status==='PASS'&&promotion.source_sha===headSha&&
  promotion.baseline_version===baseline&&
  promotion.candidate_version===candidate&&
  promotion.approved_stage2_run===String(stage2RunId)&&
  /^[a-f0-9]{64}$/u.test(promotion.signed_stage2_receipt_sha256??'')&&
  promotion.hold_still_present===true&&promotion.payments_authorized===false&&
  promotion.no_funds===true&&
  promotion.independent_hot50_gate_acceptance_not_inferred===true&&
  Array.isArray(promotion.stages)&&promotion.stages.length===STAGES.length&&
  Array.isArray(stageReceipts)&&stageReceipts.length===STAGES.length,
  'CANARY_HOLD_REVIEW_SIGNED_PROMOTION_INCOMPLETE');
 let lastObservedAt=0;
 for(let i=0;i<STAGES.length;i++){
  const current=promotion.stages[i],proof=stageReceipts[i],pct=STAGES[i];
  const {schema,status,source_sha,baseline_version,candidate_version,
   no_funds,...observed}=proof??{};
  need(schema==='geomacro.hot50.canary-slo.v1'&&status==='PASS'&&
    source_sha===headSha&&baseline_version===baseline&&
    candidate_version===candidate&&no_funds===true&&
    canonical(observed)===canonical(current)&&
    current?.stage_percent===pct&&
    typeof current.verified_minutes==='number'&&
    current.verified_minutes>=stageWindowMs(pct)/60000&&
    current.worker_script_version===(pct===0?baseline:candidate)&&
    Number.isSafeInteger(current.worker_requests)&&current.worker_requests>=1000&&
    Number.isSafeInteger(current.host_requests)&&current.host_requests>=1000&&
    current.http_5xx_under_0_5pct===true&&
    current.version_errors_under_0_5pct===true&&
    current.p99_under_50ms===true&&
    current.observed_d1_hourly_pace?.status==='PASS_OBSERVED_PAID_MONTHLY_PACE'&&
    Number.isSafeInteger(current.latest_d1_provider_observation?.rows_read)&&
    Number.isSafeInteger(current.latest_d1_provider_observation?.rows_written)&&
    Number.isSafeInteger(current.latest_d1_provider_observation?.observed_at_ms)&&
    current.latest_d1_provider_observation.observed_at_ms>lastObservedAt,
    'CANARY_HOLD_REVIEW_SIX_SIGNED_STAGES_UNVERIFIED');
  lastObservedAt=current.latest_d1_provider_observation.observed_at_ms;
 }
 return Object.freeze({status:'PASS_SIGNED_PROMOTION_SHAPE',
  source_sha:headSha,approved_stage2_run:String(stage2RunId),
  candidate_version:candidate,fully_verified_stages:STAGES.length,
  promotion_completed_at_ms:lastObservedAt,
  independent_provider_readback_and_signatures_required:true,
  no_funds:true,traffic_mutated:false,remote_hold_removed:false});
}

async function main(){
 const args=process.argv.slice(2);
 need(args.length<=1&&(!args.length||
   args[0]==='--promote'||args[0]==='--review-hold'),
  'CANARY_ARGS_INVALID_OR_UNSAFE_REPROMOTION');
 const promote=args[0]==='--promote',reviewHold=args[0]==='--review-hold';
 const mainSha=assertOfficialMain();
 need(existsSync(HOLD),'CANARY_EXISTING_PROTECTION_REQUIRED');

 if(reviewHold){
  // Read-only final admission AFTER a separately signed, complete 100%
  // rollout. Never call deployVersions, rollback, D1 SQL or unlink(HOLD).
  requireSchemaAcceptance(mainSha);
  const base=envString('BASELINE_VERSION_ID'),candidate=envString('CANDIDATE_VERSION_ID');
  const run=envString('GEOMACRO_STEP3_APPROVED_PRODUCTION_RUN_ID');
  const promotionRun=envString('GEOMACRO_APPROVED_CANARY_PROMOTION_RUN_ID');
  need(/^[1-9][0-9]{5,20}$/u.test(promotionRun)&&
    envString('RELEASE_CONFIRMATION')==='REVIEW_HOT50_HOLD_NO_FUNDS',
    'CANARY_HOLD_REVIEW_OWNER_AND_RUN_APPROVAL_REQUIRED');
  const promotion=verifySignedEnvelopeFile('artifacts/release/canary-promotion.json');
  const stages=STAGES.map(pct=>verifySignedEnvelopeFile(
   'artifacts/release/canary-stage-'+pct+'.json'));
  const admitted=admitCompletedCanaryForHoldReview({
   promotion,stageReceipts:stages,headSha:mainSha,
   baseline:base,candidate,stage2RunId:run});
  const active=await liveCurrent();
  verifyDistribution(active,[{version_id:candidate,percentage:100}]);
  await checkVersionParity(base,candidate,mainSha,{requireFreshReview:false});
  await checkSource(candidate,mainSha);
  const response=await fetch(ORIGIN+'/health',{
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const health=await response.json().catch(()=>null);
  need(response.status===200&&health?.ok===true&&
    health.deployed_source_sha===mainSha,
    'CANARY_HOLD_REVIEW_PUBLIC_100_PERCENT_SHA_UNVERIFIED');
  const now=new Date();
  for(const file of [
    'artifacts/release/b2-physical-parity-certificate.json',
    'artifacts/release/hot50-risk-gate-proof.json'
  ]){
   need(existsSync(file),'CANARY_HOLD_RELEASE_DEPENDENCY_MISSING');
   const proof=verifySignedEnvelopeFile(file);
   const time=Date.parse(String(proof.verified_at??proof.generated_at??''));
   need(proof.status==='PASS'&&time<=now.getTime()&&
     now.getTime()-time<3_600_000,
     'CANARY_HOLD_RELEASE_CERTIFICATE_UNVERIFIED');
  }
  const previous=new Date(now.getTime()-86_400_000).toISOString().slice(0,10);
  const dayPath='artifacts/release/d1-quota-proof-'+previous+'.json';
  need(!process.env.D1_24H_PROOF_PATH||
    process.env.D1_24H_PROOF_PATH===dayPath,
    'CANARY_HOLD_RELEASE_D1_PROOF_PATH_MISMATCH');
  need(existsSync(dayPath),'CANARY_HOLD_RELEASE_24H_D1_PROOF_MISSING');
  const signedDay=verifySignedEnvelopeFile(dayPath);
  const daily=admitSignedClosedD1DayForCanary(signedDay,now);
  // The closed day must cover a FULL UTC-day after actual 100% rollout.
  // A pre-rollout calendar-day receipt is never a 24-hour canary proof.
  need(Date.parse(String(signedDay.period_start_utc??''))>=
    admitted.promotion_completed_at_ms,
    'CANARY_HOLD_RELEASE_POST_PROMOTION_FULL_UTC_DAY_MISSING');
  need(daily.status==='PASS_CLOSED_UTC_DAY',
    'CANARY_HOLD_RELEASE_24H_D1_PROOF_INVALID');
  const freshPaid=await checkLiveD1Budget();
  // This is a review receipt, never remote permission to remove the HOLD.
  // The remote repository hold requires a separately authorized reviewed PR.
  signedReport('artifacts/release/hold-release-review.json',{
   schema:'geomacro.canary.hold-review.v2',status:'PASS',
   source_sha:mainSha,completed_canary_run_id:promotionRun,
   approved_stage2_run:run,
   signed_promotion_payload_sha256:canonicalContentSha256(canonical(promotion)),
   signed_stages_verified:admitted.fully_verified_stages,
   actual_candidate_version:admitted.candidate_version,
   remote_candidate_100_percent_verified:true,
   current_deployed_source_sha_verified:true,
   closed_utc_day_d1_verified:daily.day,
   fresh_paid_monthly_provider_observation:true,
   paid_observed_rows_read:freshPaid.rows_read,
   paid_observed_rows_written:freshPaid.rows_written,
   independent_b2_and_hot50_receipts_verified:true,
   removed_from_ephemeral_checkout:false,
   remote_main_hold_not_removed:true,
   reviewed_release_commit_required:true,no_funds:true,
   traffic_mutated:false,payments_authorized:false});
  console.log(JSON.stringify({status:'PASS',scope:'HOLD_REVIEW_READ_ONLY',
   signed_stages_verified:admitted.fully_verified_stages,
   traffic_mutated:false,remote_main_hold_not_removed:true}));
  return;
 }
 if(!promote){
  const active=await liveCurrent();
  const res=await fetch(ORIGIN+'/health',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const health=await res.json().catch(()=>null);
  // The baseline can legitimately be the last released SHA until the
  // protected 0%-version-directed smoke and ordered promotion succeed.
  console.log(JSON.stringify(assessLiveCanaryBaseline(active,health,res.status,mainSha)));
  return;
 }
 requireSchemaAcceptance(mainSha);
 const signedStage2=admitSignedStep3ProductionFile();
 const base=envString('BASELINE_VERSION_ID'),candidate=envString('CANDIDATE_VERSION_ID');
 need(UUID_RE.test(base)&&UUID_RE.test(candidate)&&base!==candidate,'CANARY_VERSION_IDS_INVALID');
 need(envString('RELEASE_CONFIRMATION')==='PROMOTE_HOT50_NO_FUNDS','CANARY_OWNER_CONFIRMATION_REQUIRED');
 const initial=await liveCurrent();
 verifyDistribution(initial,[{version_id:base,percentage:100}]);
 await checkVersionParity(base,candidate,mainSha);
 const records:any[]=[];let mutated=false;
 let baselineP95Ms:number|null=null;
 try{
  // Stage 0 creates a genuine two-version 100%/0% provider deployment so
  // the directed candidate health probe does not fall through to baseline.
  mutated=true;await deployVersions(base,candidate,0);
  for(const pct of STAGES){
   if(pct>0){mutated=true;await deployVersions(base,candidate,pct)}
   const x=await observeStage(base,candidate,pct,mainSha);
   if(pct===0)baselineP95Ms=x.worker_wall_time_p95_ms;
   else need(Number.isFinite(baselineP95Ms)&&
    x.worker_wall_time_p95_ms<=baselineP95Ms,
    'CANARY_P95_BASELINE_LATENCY_REGRESSION');
   records.push(x);
   signedReport(`artifacts/release/canary-stage-${pct}.json`,{schema:'geomacro.hot50.canary-slo.v1',status:'PASS',source_sha:mainSha,
    baseline_version:base,candidate_version:candidate,no_funds:true,...x});
  }
  // Keep the repository hold after successful traffic promotion until all
  // independent 24h usage, B2 parity and Hot50 fact proofs are accepted.
  signedReport('artifacts/release/canary-promotion.json',{
   schema:'geomacro.hot50.promotion.v1',status:'PASS',source_sha:mainSha,stages:records,
   hold_still_present:existsSync(HOLD),payments_authorized:false,
   no_funds:true,baseline_version:base,candidate_version:candidate,
   approved_stage2_run:signedStage2.approved_stage2_run,
   signed_stage2_receipt_sha256:signedStage2.signed_receipt_sha256,
   independent_hot50_gate_acceptance_not_inferred:true});

 }catch(e){
  if(mutated){
   try{await deployBaseline(base);console.error('CANARY_ROLLBACK_BASELINE_100_VERIFIED')}
   catch{console.error('CANARY_ROLLBACK_PROVIDER_CONFIRMATION_FAILED')}
  }
  throw e;
 }
 console.log(JSON.stringify({status:'PASS',stages:records.length,remote_hold_unchanged:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),payments:0}));process.exitCode=2});
}