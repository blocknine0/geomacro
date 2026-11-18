#!/usr/bin/env node
/** Guarded Cloudflare Workers versions promotion: 0,1,5,25,50,100; no funds. */
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {api,queryCloudflareAnalytics,need,UUID_RE,envString,assertOfficialMain,signedReport,verifySignedEnvelopeFile,canonical,canonicalContentSha256,holdError,ORIGIN,WORKER,D1_DAILY_READ_CEILING,D1_DAILY_WRITE_CEILING} from './release-common.ts';
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
// Short-window cron bursts can exceed the operational hourly average while
// remaining safe under fresh Paid monthly pacing headroom.
const D1_PAID_BURST_WRITE_CAP=500_000;
const D1_HEALTHY_PAID_REMAINING_ROWS=1_000_000;
const D1_MIN_RATE_SAMPLE_MS=10*60*1000;
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const route=`/workers/scripts/${WORKER}/deployments`;
const info=(id:string)=>`/workers/scripts/${WORKER}/versions/${id}`;
/** A Cloudflare Zone is optional: Lovable-managed domains have none. If it
 * exists, retain edge 5xx telemetry; otherwise use exact Worker-version
 * errors, p95/p99, directed health/readiness, and the signed D1/B2 proofs. */
export function requireCanaryObservabilityPrerequisites(env:Record<string,string|undefined>){
 const zone=(env.CLOUDFLARE_ZONE_ID??'').trim();
 if(zone&&!/^[a-f0-9]{32}$/iu.test(zone))
  need(false,'CANARY_ZONE_ID_INVALID');
 return zone?'ZONE_AND_WORKER':'WORKER_D1_B2_ONLY';
}
// Cloudflare Workers invocation quantiles expose wallTimeP99 in MICROSECONDS,
// not requestDurationP99 in milliseconds. Query the exact routed Worker
// version, not the aggregate script; a 1% canary can be hidden by 99% baseline.
const GRAPH=`query CanaryObservability($accountTag:string!,$script:string!,$zoneTag:string!,$host:string!,$start:Time!,$end:Time!){
 viewer{
  accounts(filter:{accountTag:$accountTag}){
   workersInvocationsAdaptive(limit:100,filter:{scriptName:$script,datetime_geq:$start,datetime_leq:$end}){
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
const WORKER_GRAPH=`query CanaryWorkerObservability($accountTag:string!,$script:string!,$start:Time!,$end:Time!){
 viewer{accounts(filter:{accountTag:$accountTag}){
  workersInvocationsAdaptive(limit:100,filter:{scriptName:$script,datetime_geq:$start,datetime_leq:$end}){
   dimensions{scriptVersion} sum{requests errors} quantiles{wallTimeP95 wallTimeP99}
  }
 }}
}`;
/** Retry only transport failures and explicitly recognized edge propagation lag.
 * Policy, parity, SLO, signing, permission, and D1 admission errors are never retried. */
function errorChain(error:any){
 const rows=[];let current=error;const seen=new Set();
 while(current&&typeof current==='object'&&!seen.has(current)){
  seen.add(current);rows.push(current);
  current=current.cause;
 }
 return rows;
}
function canaryTransient(error:any){
 return errorChain(error).some((item:any)=>{
  const message=String(item?.message??'');
  const code=String(item?.code??'');
  return item?.name==='AbortError'||item?.name==='TimeoutError'||
   /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)$/u.test(code)||
   /(?:fetch failed|network error|socket hang up|timed?\s*out|timeout|HTTP[_ ](?:429|502|503|504)|STATUS[_ ](?:429|502|503|504))/iu.test(message);
 });
}
function logCanaryUnderlyingError(error:any,log=(entry:string)=>console.error(entry)){
 const chain=errorChain(error);
 log(JSON.stringify({event:'CANARY_PROVIDER_RETRY_OR_HOLD',
  error_message:String(chain[0]?.message??error??'unknown'),
  cause_message:chain[0]?.cause?String(chain[0].cause?.message??chain[0].cause):null}));
}
/** Four total attempts with bounded 2s/4s/8s backoff. */
export async function retryTransientCanaryProbe<T>(
 operation:()=>Promise<T>,{pause=wait,attempts=4,accept,allowPropagation=false,
 log=(entry:string)=>console.error(entry)}:any={}
):Promise<T>{
 need(Number.isInteger(attempts)&&attempts>=1&&attempts<=4,'CANARY_RETRY_BOUNDS_INVALID');
 let lastError:any;
 const delays=[2000,4000,8000];
 for(let n=0;n<attempts;n++){
  try{
   const response=await operation();
   const status=Number((response as any)?.status);
   const transportRetry=[429,502,503,504].includes(status);
   const propagated=allowPropagation&&typeof accept==='function'&&
    !accept(response)&&(!Number.isFinite(status)||status===200);
   if(!transportRetry&&!propagated)return response;
   lastError=new Error(propagated?'CANARY_PROVIDER_PROPAGATION_NOT_READY':'HTTP_'+status);
  }catch(error){
   if(!canaryTransient(error))throw error;
   lastError=error;
  }
  logCanaryUnderlyingError(lastError,log);
  if(n<attempts-1)await pause(delays[n]);
 }
 const exhausted=new Error(allowPropagation?'CANARY_DIRECTED_TRANSIENT_RETRY_EXHAUSTED':
  'CANARY_TRANSIENT_NETWORK_RETRY_EXHAUSTED',{cause:lastError});
 throw exhausted;
}
async function liveCurrent({providerApi=api,pause=wait}:any={}):Promise<any>{
 const r=await retryTransientCanaryProbe(()=>providerApi(route+'?per_page=1'),
  {pause,allowPropagation:true,
   accept:(v:any)=>Array.isArray(v?.deployments)&&v.deployments.length===1});
 need(Array.isArray(r.deployments)&&r.deployments.length===1,'CANARY_DEPLOYMENT_UNVERIFIED');
 return r.deployments[0];
}
export const distribution=(base:string,candidate:string,percent:number)=>percent===100?
 [{version_id:candidate,percentage:100}]:[
 {version_id:base,percentage:100-percent},{version_id:candidate,percentage:percent}];
/** Compare worker p95 only when both stages have usable, version-isolated
 * telemetry. A missing/cold low-volume sample is not a latency regression;
 * hard p99, error-rate and directed health/readiness gates remain enforced
 * whenever their respective measurements are available. */
export function assessP95LatencyRegression(baseline:any,current:any){
 const measured=(stage:any)=>stage?.worker_metrics_status==='VERIFIED'&&
  Number.isFinite(stage?.worker_wall_time_p95_ms)&&
  typeof stage?.worker_wall_time_p95_ms==='number';
 if(!measured(baseline)||!measured(current))return {
  status:'SKIPPED_UNAVAILABLE',
  reason:!measured(baseline)?'BASELINE_WORKER_P95_UNAVAILABLE':'CANDIDATE_WORKER_P95_UNAVAILABLE',
  baseline_p95_ms:baseline?.worker_wall_time_p95_ms??null,
  candidate_p95_ms:current?.worker_wall_time_p95_ms??null};
 need(current.worker_wall_time_p95_ms<=baseline.worker_wall_time_p95_ms,
  'CANARY_P95_BASELINE_LATENCY_REGRESSION');
 return {status:'PASS',baseline_p95_ms:baseline.worker_wall_time_p95_ms,
  candidate_p95_ms:current.worker_wall_time_p95_ms};
}
function deploymentVersionsField(deployment:any){
 // Workers Versions API responses have appeared as both {versions:[...]} and
 // {deployment:{versions:[...]}}. Prefer the specific deployment resource,
 // while distinguishing an absent field (eventual-consistency readback) from
 // an explicit malformed field (which must remain a HOLD).
 for(const resource of [deployment?.deployment,deployment])
  if(resource&&typeof resource==='object'&&Object.hasOwn(resource,'versions'))
   return {present:true,versions:resource.versions};
 return {present:false,versions:undefined};
}
export function verifyDistribution(deployment:any,expected:any[]){
 const actual=deploymentVersionsField(deployment).versions;
 need(Array.isArray(actual)&&Array.isArray(expected)&&expected.length>0&&
  expected.every(x=>typeof x?.version_id==='string'&&
   UUID_RE.test(x.version_id)&&Number.isSafeInteger(x.percentage)&&
   x.percentage>=0&&x.percentage<=100)&&
  new Set(expected.map(x=>x.version_id)).size===expected.length&&
  expected.reduce((sum,x)=>sum+x.percentage,0)===100&&
  actual.every((x:any)=>typeof x?.version_id==='string'&&UUID_RE.test(x.version_id)&&
   Number.isSafeInteger(Number(x.percentage))&&Number(x.percentage)>=0&&
   Number(x.percentage)<=100)&&
  new Set(actual.map((x:any)=>x.version_id)).size===actual.length&&
  actual.reduce((sum:number,x:any)=>sum+Number(x.percentage),0)===100&&
  actual.every((x:any)=>expected.some(y=>y.version_id===x.version_id&&
   Number(y.percentage)===Number(x.percentage))),
  'CANARY_REMOTE_SPLIT_MISMATCH');
 // Cloudflare may omit 0% entries from a deployment response. Normalize only
 // those absent zero rows; all live traffic percentages and IDs must still
 // match exactly. The caller's directed version-override probe proves that
 // the zero-traffic candidate is actually present and runnable in the split.
 const expectedTraffic=expected.filter(x=>x.percentage>0);
 const actualTraffic=actual.filter((x:any)=>Number(x.percentage)>0);
 need(actualTraffic.length===expectedTraffic.length&&
  expectedTraffic.every(x=>actualTraffic.some((a:any)=>a.version_id===x.version_id&&
   Number(a.percentage)===x.percentage)),
  'CANARY_REMOTE_SPLIT_MISMATCH');
 return true;
}
export async function deployVersions(base:string,candidate:string,percent:number,
 {providerApi=api,readCurrent=liveCurrent,pause=wait}:any={}){
 const versions=distribution(base,candidate,percent);
 const result=await retryTransientCanaryProbe(()=>
  providerApi(route,{method:'POST',body:JSON.stringify({strategy:'percentage',versions})}),{pause});
 // An explicit malformed or mismatched deployment response is a parity HOLD.
 if(deploymentVersionsField(result).present)verifyDistribution(result,versions);
 const observed=await retryTransientCanaryProbe(()=>readCurrent(),{pause,
  allowPropagation:true,accept:(v:any)=>deploymentVersionsField(v).present});
 verifyDistribution(observed,versions);
}
export async function deployBaseline(base:string,
 {providerApi=api,readCurrent=liveCurrent,pause=wait}:any={}){
 const versions=[{version_id:base,percentage:100}];
 const result=await retryTransientCanaryProbe(()=>
  providerApi(route,{method:'POST',body:JSON.stringify({strategy:'percentage',versions})}),{pause});
 if(deploymentVersionsField(result).present)verifyDistribution(result,versions);
 const observed=await retryTransientCanaryProbe(()=>readCurrent(),{pause,
  allowPropagation:true,accept:(v:any)=>deploymentVersionsField(v).present});
 verifyDistribution(observed,versions);
}
export async function checkSource(candidate:string,expectedSha:string,fetchImpl=fetch,
 {pause=wait,log=(entry:string)=>console.error(entry)}:any={}){
 const headers={'Cloudflare-Workers-Version-Overrides':`${WORKER}="${candidate}"`};
 const request=async(path:string)=>{
  const response=await fetchImpl(ORIGIN+path,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  return {status:response.status,body:await response.json().catch(()=>null)};
 };
 // A 200 with an old source SHA on a directed version override is a
 // propagation symptom ONLY for bounded retries; after 3 reads it HOLDs.
 const health=await retryTransientCanaryProbe(()=>request('/health'),{
  pause,attempts:4,log,allowPropagation:true,accept:(v:any)=>v.status===200&&v.body?.ok===true&&
   v.body?.deployed_source_sha===expectedSha});
 need(health.status===200&&health.body?.ok===true&&
  health.body?.deployed_source_sha===expectedSha,'CANARY_DIRECTED_HEALTH_SHA_UNVERIFIED');
 const readiness=await retryTransientCanaryProbe(()=>request('/v1/public/risk-gate-d1-readiness'),{
  pause,attempts:4,log,allowPropagation:true,accept:(v:any)=>v.status===200&&v.body?.status==='ready'});
 const checks=readiness.body?.checks;
 need(readiness.status===200&&readiness.body?.status==='ready'&&
  checks?.database===true&&checks?.audit_store===true&&
  checks?.isolated_partner_credential===true&&
  checks?.progressive_decision_ed25519_signer_configured===true&&
  readiness.body?.paid_launch_approved===false&&
  readiness.body?.execution_authorized===false,
  'CANARY_DIRECTED_D1_READINESS_UNVERIFIED');
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
  review.reviewed_predge_runtime_vars&&typeof review.reviewed_predge_runtime_vars==='object'&&
  Number.isFinite(Date.parse(String(review.reviewed_at)))&&
  (!requireFreshReview||Date.now()-Date.parse(String(review.reviewed_at))<3_600_000)&&
  Date.now()>=Date.parse(String(review.reviewed_at)),
  'CANARY_HOT50_REVIEW_NOT_EXACT_OR_FRESH');
 return assessReviewedHot50BindingParity(a,b,headSha,review.reviewed_secret_names,review.reviewed_predge_runtime_vars);
}

export async function verifiedLiveObservability(start:string,end:string,version:string,
 requireVolume=true,{query=queryCloudflareAnalytics,env=process.env,
  log=(entry:string)=>console.error(entry)}:any={}){
 const account=env===process.env?envString('CLOUDFLARE_ACCOUNT_ID',32):
  String(env.CLOUDFLARE_ACCOUNT_ID??'').trim();
 need(/^[a-f0-9]{32}$/iu.test(account),'RELEASE_ACCOUNT_INVALID');
 const zone=(env.CLOUDFLARE_ZONE_ID??'').trim();
 if(zone&&!/^[a-f0-9]{32}$/iu.test(zone))need(false,'CANARY_ZONE_ID_INVALID');
 const telemetryFallback=(diagnosticCode:string)=>{
  log(JSON.stringify({status:'DEGRADED',code:'CANARY_WORKER_TELEMETRY_UNAVAILABLE',
   diagnostic_code:diagnosticCode,version,
   fallback:'DIRECTED_HEALTH_READINESS_D1_MONTHLY_HEADROOM_SIGNED_B2_D1_PROOFS'}));
  return null;
 };
 let graph;
 try{
  graph=await retryTransientCanaryProbe(()=>zone?
   query(GRAPH,{accountTag:account,script:WORKER,zoneTag:zone,host:'api.geomacro.live',start,end}):
   query(WORKER_GRAPH,{accountTag:account,script:WORKER,start,end}),{attempts:4,log});
 }catch(error){
  logCanaryUnderlyingError(error,log);
  const code=holdError(error);
  // Analytics is an observational SLO signal, not an authorization gate. If
  // an unzoned Lovable domain cannot obtain Worker GraphQL telemetry, record
  // the provider's fixed diagnostic code and continue only with the mandatory
  // directed version probes, monthly D1 headroom, and signed release proofs.
  // A missing credential or a failure in any of those release gates still HOLDs.
  if(!zone&&code.startsWith('RELEASE_GRAPHQL_'))return telemetryFallback(code);
  throw error;
 }
 const workerRows=graph.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
 const worker=Array.isArray(workerRows)?workerRows.find((row:any)=>
  row?.dimensions?.scriptVersion===version):undefined;
 const http=zone?graph.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]:null;
 const requests=worker?.sum?.requests,errors=worker?.sum?.errors;
 const siteCount=http?.count,ratio=http?.ratio?.status5xx;
 const wallTimeP95Us=worker?.quantiles?.wallTimeP95;
 const wallTimeP99Us=worker?.quantiles?.wallTimeP99;
 if(!zone&&worker?.dimensions?.scriptVersion===version&&
    (!Number.isSafeInteger(requests)||requests<1000||
     !Number.isSafeInteger(errors)||
     typeof wallTimeP95Us!=='number'||!Number.isFinite(wallTimeP95Us)||
     typeof wallTimeP99Us!=='number'||!Number.isFinite(wallTimeP99Us)))
  return telemetryFallback('CANARY_WORKER_TELEMETRY_METRICS_INCOMPLETE');
 // Worker errors are exact-scriptVersion telemetry. Zone HTTP 5xx is an
 // additional edge signal only when the account actually owns a Cloudflare
 // Zone for the hostname; an unzoned Lovable domain has no such measurement.
 // wallTimeP99 is microseconds; convert to milliseconds for the 50ms SLO.
 if(!worker&&!zone)return telemetryFallback('CANARY_WORKER_TELEMETRY_VERSION_SAMPLE_MISSING');
 need(worker?.dimensions?.scriptVersion===version&&
  Number.isSafeInteger(requests)&&requests>0&&Number.isSafeInteger(errors)&&
  (!zone||Number.isSafeInteger(siteCount))&&
  (!zone||typeof ratio==='number'&&ratio>=0&&ratio<=1)&&
  typeof wallTimeP99Us==='number'&&Number.isFinite(wallTimeP99Us)&&wallTimeP99Us>=0&&
  typeof wallTimeP95Us==='number'&&Number.isFinite(wallTimeP95Us)&&wallTimeP95Us>=0,
  'CANARY_PROVIDER_VERSION_METRICS_UNAVAILABLE');
 const p95=wallTimeP95Us/1000;
 const p99=wallTimeP99Us/1000;
 need(p95<=p99,'CANARY_PROVIDER_QUANTILES_INCONSISTENT');
 if(!Number.isSafeInteger(requests)||requests<=0||requests<1000||(zone&&siteCount<1000)){
  // With no Cloudflare Zone, a new version can be correctly routed yet still
  // have an empty or delayed GraphQL window. Preserve the explicit absence in
  // the stage receipt; the caller has already passed version-directed health,
  // readiness and provider-observed D1 gates. Never invent a telemetry PASS.
  if(!zone)return telemetryFallback('CANARY_WORKER_TELEMETRY_SAMPLE_FLOOR_UNMET');
  need(!requireVolume,'CANARY_PROVIDER_SAMPLE_FLOOR_UNMET');
  return null;
 }
 const workerErrorRatio=errors/requests;
 return {worker_script_version:version,worker_requests:requests,worker_errors:errors,
  worker_error_ratio:workerErrorRatio,worker_error_ratio_under_0_5pct:workerErrorRatio<=0.005,
  observability_mode:zone?'ZONE_AND_WORKER':'WORKER_ONLY_NO_ZONE',
  host_requests:siteCount??null,
  http_5xx_ratio:ratio??null,worker_wall_time_p95_ms:p95,worker_wall_time_p99_ms:p99,
  http_5xx_under_0_5pct:zone?ratio<=0.005:null,
  zone_http_5xx_verified:!!zone,
  version_errors_under_0_5pct:errors/requests<=0.005,
  p99_under_50ms:p99<50,
  host_http_5xx_not_version_isolated:!!zone,
  zone_http_5xx_unavailable_reason:zone?null:'NO_CLOUDFLARE_ZONE_FOR_DOMAIN',
  worker_metrics_version_isolated:true};
}
// All D1 databases and every day in the 5th-to-5th Paid billing cycle,
// never only the current UTC day. GraphQL telemetry lags; a provider
// response is a read-only observation, NOT an atomic payment/spend ceiling.
async function checkLiveD1Budget({headroom=checkD1PaidMonthlyHeadroom,now=new Date(),pause=wait}:any={}){
 const receipt=await retryTransientCanaryProbe(()=>headroom({
  env:process.env,now,lane:'canary'}),{pause,attempts:4});
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
  Number.isSafeInteger(receipt.observed_rows_written)&&
  Number.isSafeInteger(receipt.remaining_rows_written)&&
  Number.isSafeInteger(receipt.monthly_paced_ceiling_written),
  'CANARY_PAID_MONTHLY_D1_PROVIDER_UNVERIFIED');
 const pacedRemainingRowsWritten=
  receipt.monthly_paced_ceiling_written-receipt.observed_rows_written;
 need(Number.isSafeInteger(pacedRemainingRowsWritten)&&
  pacedRemainingRowsWritten>=0,
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
  remaining_rows_written:receipt.remaining_rows_written,
  paced_remaining_rows_written:pacedRemainingRowsWritten};
}
/** Physical provider-observed monthly-paced growth, with independent
 * read and write rates. A rollover invalidates the sample (HOLD);
 * no daily 5,800 rows/hour gate or synthetic spike PASS.
 */
function throwPaidMonthlyPacedBurnSpike(metrics:any):never{
 const diagnostic={
  code:'CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE',
  ms:Number.isFinite(metrics?.ms)?metrics.ms:null,
  written:Number.isFinite(metrics?.written)?metrics.written:null,
  writeRate:Number.isFinite(metrics?.writeRate)?metrics.writeRate:null,
  read:Number.isFinite(metrics?.read)?metrics.read:null,
  readRate:Number.isFinite(metrics?.readRate)?metrics.readRate:null,
  paced_remaining_rows_written:Number.isSafeInteger(metrics?.paced_remaining_rows_written)?
   metrics.paced_remaining_rows_written:null,
  remaining_rows_written:Number.isSafeInteger(metrics?.remaining_rows_written)?
   metrics.remaining_rows_written:null
 };
 console.error(JSON.stringify(diagnostic));
 throw new Error('CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE');
}
export function assertD1ObservedHourlyPace(start:any,latest:any){
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
 if(!(Number.isSafeInteger(latest?.paced_remaining_rows_written)&&
  latest.paced_remaining_rows_written>0&&
  Number.isSafeInteger(latest?.remaining_rows_written)))
  throwPaidMonthlyPacedBurnSpike({ms,written,writeRate,read,readRate,
   paced_remaining_rows_written:latest?.paced_remaining_rows_written,
   remaining_rows_written:latest?.remaining_rows_written});
 const healthyPaidHeadroom=
  latest.remaining_rows_written>D1_HEALTHY_PAID_REMAINING_ROWS;
 const writeRateMax=healthyPaidHeadroom?
  D1_PAID_BURST_WRITE_CAP:D1_HOURLY_WRITE_CAP;
 if(!(readRate<=readRateMax&&writeRate<=writeRateMax))
  throwPaidMonthlyPacedBurnSpike({ms,written,writeRate,read,readRate,
   paced_remaining_rows_written:latest?.paced_remaining_rows_written,
   remaining_rows_written:latest?.remaining_rows_written});
 return {status:'PASS_OBSERVED_PAID_MONTHLY_PACE',
  reads_per_hour:readRate,writes_per_hour:writeRate,
  max_reads_per_hour:readRateMax,max_writes_per_hour:writeRateMax,
  observed_window_ms:ms,metrics_are_delayed:true};
}
export async function observeStage(base:string,candidate:string,pct:number,sha:string,
 {budgetProbe=checkLiveD1Budget,sourceProbe=(id:string,hash:string)=>checkSource(id,hash,fetch,{pause}),
  currentDeployment=()=>liveCurrent({pause}),observabilityProbe=verifiedLiveObservability,
  pause=wait,now=Date.now,windowMs:windowOverride}:any={}){
 const probeBudget=()=>retryTransientCanaryProbe(()=>budgetProbe(),{pause,attempts:4});
 const probeCurrent=()=>retryTransientCanaryProbe(()=>currentDeployment(),{pause,attempts:4,
  allowPropagation:true,accept:(v:any)=>deploymentVersionsField(v).present});
 const probeObservability=(...args:any[])=>retryTransientCanaryProbe(()=>observabilityProbe(...args),
  {pause,attempts:4});
 const began=Date.now();let intervals=0;
 const windowMs=stageWindowMs(pct);
 // Inspect provider D1 spend at the start and every two health ticks.
 // A missing delayed provider receipt is HOLD, never a synthetic PASS.
 let d1=await probeBudget();
 const initialD1=d1;
 let rate={status:'INSUFFICIENT_INTERVAL'} as any;
 while(Date.now()-began<windowMs){
  if(pct===0){
   // Version override can target the candidate only when the 0%-candidate
   // participates in the Cloudflare split deployment; baseline keeps 100%.
   await sourceProbe(candidate,sha);
   const baseline=await retryTransientCanaryProbe(async()=>{
    const health=await fetch(ORIGIN+'/health',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
    return {status:health.status,body:await health.json().catch(()=>null)};
   },{pause,attempts:4,allowPropagation:true,accept:(v:any)=>v.status===200&&v.body?.ok===true});
   need(baseline.status===200&&baseline.body?.ok===true,'CANARY_BASELINE_HEALTH_UNAVAILABLE');
  }else await sourceProbe(candidate,sha);
  const x=await probeCurrent();verifyDistribution(x,distribution(base,candidate,pct));
  intervals++;
  if(intervals%2===0){
   d1=await probeBudget();
   rate=assertD1ObservedHourlyPace(initialD1,d1);
   // Early complete provider windows may be under the statistical floor; once
   // 1000 real observations exist, any 5xx/latency regression rolls back now.
   if(now()-began>=120000){
    const result=await probeObservability(new Date(began).toISOString(),new Date(now()).toISOString(),
     pct===0?base:candidate,false);
    if(result)need(result.worker_error_ratio_under_0_5pct&&
     (!result.zone_http_5xx_verified||result.http_5xx_under_0_5pct)&&
     result.version_errors_under_0_5pct&&result.p99_under_50ms,'CANARY_LIVE_SLO_BREACH');
   }
  }
  await pause(Math.min(INTERVAL_MS,Math.max(1,windowMs-(now()-began))));
 }
 d1=await probeBudget();
 rate=assertD1ObservedHourlyPace(initialD1,d1);
 need(rate.status==='PASS_OBSERVED_PAID_MONTHLY_PACE',
  'CANARY_D1_PAID_MONTHLY_PACE_UNVERIFIED');
 const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),
  pct===0?base:candidate,true);
 if(result)need(result.worker_error_ratio_under_0_5pct&&
  (!result.zone_http_5xx_verified||result.http_5xx_under_0_5pct)&&
  result.version_errors_under_0_5pct&&result.p99_under_50ms,
  'CANARY_SLO_BREACH');
 return {stage_percent:pct,verified_minutes:(now()-began)/60000,intervals,
  ...(result??{worker_metrics_status:'DELAYED_OR_EMPTY',
   worker_metrics_unavailable_reason:'PROVIDER_WINDOW_NOT_YET_POPULATED',
   worker_script_version:pct===0?base:candidate,worker_requests:null,worker_errors:null,
   worker_error_ratio:null,worker_error_ratio_under_0_5pct:null,
   version_errors_under_0_5pct:null,p99_under_50ms:null,
   observability_mode:'DIRECTED_HEALTH_READINESS_AND_D1_ONLY',
   host_requests:null,http_5xx_ratio:null,worker_wall_time_p95_ms:null,
   worker_wall_time_p99_ms:null,zone_http_5xx_verified:false,
   host_http_5xx_not_version_isolated:false,worker_metrics_version_isolated:false}),
  worker_metrics_status:result?'VERIFIED':'DELAYED_OR_EMPTY',
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
    (current.zone_http_5xx_verified===true?
     Number.isSafeInteger(current.host_requests)&&current.host_requests>=1000:
     current.observability_mode==='WORKER_ONLY_NO_ZONE'&&
      current.host_requests===null)&&
    current.worker_error_ratio_under_0_5pct===true&&
    (current.zone_http_5xx_verified===true?current.http_5xx_under_0_5pct===true:
     current.observability_mode==='WORKER_ONLY_NO_ZONE')&&
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
 if(promote)requireCanaryObservabilityPrerequisites(process.env);

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
 let baselineStage:any=null;
 try{
  // Stage 0 creates a genuine two-version 100%/0% provider deployment so
  // the directed candidate health probe does not fall through to baseline.
  mutated=true;await deployVersions(base,candidate,0);
  for(const pct of STAGES){
   if(pct>0){mutated=true;await deployVersions(base,candidate,pct)}
   const x=await observeStage(base,candidate,pct,mainSha);
   if(pct===0)baselineStage=x;
   else x.p95_baseline_comparison=assessP95LatencyRegression(baselineStage,x);
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
