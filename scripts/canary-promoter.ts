#!/usr/bin/env node
/** Guarded Cloudflare Workers versions promotion: 0,1,5,25,50,100; no funds. */
import {existsSync,readFileSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {api,graphql,need,UUID_RE,envString,assertOfficialMain,signedReport,verifySignedEnvelopeFile,holdError,ORIGIN,WORKER,BUDGET} from './release-common.ts';
const HOLD='config/d1-hotspot-v2-canary.hold';
const STAGES=[0,1,5,25,50,100] as const;
const stageWindowMs=(percent:number)=>percent===1?30*60*1000:15*60*1000;
const INTERVAL_MS=30000;
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
async function checkVersionParity(base:string,candidate:string){
 const [a,b]=await Promise.all([api(info(base)),api(info(candidate))]);
 const bindingList=(x:any)=>{
  const bindings=x?.resources?.bindings;
  need(bindings!=null,'CANARY_VERSION_BINDINGS_MISSING');
  const values=Array.isArray(bindings)?bindings:Object.entries(bindings).flatMap(([type,items]:any)=>
   Array.isArray(items)?items.map((v:any)=>({...v,type:v.type??type})):[]);
  return values.map((x:any)=>`${x.type}:${x.name}`).sort().join('|');
 };
 need(a.id===base&&b.id===candidate&&bindingList(a)===bindingList(b),'CANARY_BINDINGS_PARITY_FAILURE');
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
  http_5xx_under_0_1pct:ratio<0.001,
  version_errors_under_0_1pct:errors/requests<0.001,
  p99_under_50ms:p99<50,
  host_http_5xx_not_version_isolated:true,worker_metrics_version_isolated:true};
}
// Observe all account D1 databases during the rollout. Provider analytics
// are delayed: this triggers a rollback as soon as an overage is OBSERVED,
// not an impossible provider-side atomic per-row hard stop.
const LIVE_D1=`query LiveAccountD1($accountTag:string!,$start:Date!,$end:Date!){
 viewer{accounts(filter:{accountTag:$accountTag}){
  d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}){
   sum{rowsRead rowsWritten} dimensions{databaseId date}
  }
 }}
}`;
async function checkLiveD1Budget(){
 const day=new Date().toISOString().slice(0,10),account=envString('CLOUDFLARE_ACCOUNT_ID',32);
 const data=await graphql(LIVE_D1,{accountTag:account,start:day,end:day});
 const groups=data.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
 need(Array.isArray(groups)&&groups.length>0&&groups.length<1000,'CANARY_D1_ACCOUNT_METRICS_MISSING');
 let read=0,written=0;const ids=new Set<string>();
 for(const x of groups){
  const id=x?.dimensions?.databaseId,r=x?.sum?.rowsRead,w=x?.sum?.rowsWritten;
  need(typeof id==='string'&&id.length>=10&&!ids.has(id)&&x.dimensions?.date===day&&
   Number.isSafeInteger(r)&&r>=0&&Number.isSafeInteger(w)&&w>=0,'CANARY_D1_ACCOUNT_RECEIPT_INVALID');
  ids.add(id);read+=r;written+=w;
 }
 need(read<=BUDGET&&written<=BUDGET,'CANARY_D1_140K_PROVIDER_BREACH');
 return {rows_read:read,rows_written:written,day_utc:day,provider_metrics_delayed:true};
}
async function observeStage(base:string,candidate:string,pct:number,sha:string){
 const began=Date.now();let intervals=0;
 const windowMs=stageWindowMs(pct);
 // Inspect provider D1 spend at the start and every two health ticks.
 // A missing delayed provider receipt is HOLD, never a synthetic PASS.
 let d1=await checkLiveD1Budget();
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
   // Early complete provider windows may be under the statistical floor; once
   // 1000 real observations exist, any 5xx/latency regression rolls back now.
   if(Date.now()-began>=120000){
    const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),
     pct===0?base:candidate,false);
    if(result)need(result.http_5xx_under_0_1pct&&
     result.version_errors_under_0_1pct&&result.p99_under_50ms,'CANARY_LIVE_SLO_BREACH');
   }
  }
  await wait(Math.min(INTERVAL_MS,Math.max(1,windowMs-(Date.now()-began))));
 }
 d1=await checkLiveD1Budget();
 const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),
  pct===0?base:candidate,true);
 need(result.http_5xx_under_0_1pct&&result.version_errors_under_0_1pct&&result.p99_under_50ms,
  'CANARY_SLO_BREACH');
 return {stage_percent:pct,verified_minutes:(Date.now()-began)/60000,intervals,...result,
  latest_d1_provider_observation:d1};
}
function requireSchemaAcceptance(expectedSha:string){
 const file='artifacts/release/d1-schema-acceptance.json';
 need(existsSync(file),'CANARY_D1_SCHEMA_PROOF_MISSING');
 const report=verifySignedEnvelopeFile(file);
 need(report.migrations_verified?.length===8&&report.release_sha===expectedSha&&
  Date.now()-Date.parse(String(report.verified_at))<600000&&Date.now()>=Date.parse(String(report.verified_at)),
  'CANARY_D1_SCHEMA_PROOF_NOT_ACCEPTED');
}
async function main(){
 need(process.argv.slice(2).every(s=>s==='--promote'||s==='--release-hold'),'CANARY_ARGS_INVALID');
 const promote=process.argv.includes('--promote');
 const mainSha=assertOfficialMain();
 need(existsSync(HOLD),'CANARY_EXISTING_PROTECTION_REQUIRED');
 if(!promote){
  const active=await liveCurrent();
  need(active.versions?.length===1&&Number(active.versions[0]?.percentage)===100,
   'CANARY_PRODUCTION_VERSION_SPLIT_NOT_SETTLED');
  const res=await fetch(ORIGIN+'/health',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const health=await res.json().catch(()=>null);
  need(res.status===200&&health?.ok===true&&health.deployed_source_sha===mainSha,
   'CANARY_CURRENT_MAIN_SHA_NOT_DEPLOYED');
  console.log(JSON.stringify({status:'PASS',scope:'LIVE_MAIN_100_PERCENT_NO_FUNDS',source_sha:mainSha}));return;
 }
 requireSchemaAcceptance(mainSha);
 const base=envString('BASELINE_VERSION_ID'),candidate=envString('CANDIDATE_VERSION_ID');
 need(UUID_RE.test(base)&&UUID_RE.test(candidate)&&base!==candidate,'CANARY_VERSION_IDS_INVALID');
 need(envString('RELEASE_CONFIRMATION')==='PROMOTE_HOT50_NO_FUNDS','CANARY_OWNER_CONFIRMATION_REQUIRED');
 const initial=await liveCurrent();
 verifyDistribution(initial,[{version_id:base,percentage:100}]);
 await checkVersionParity(base,candidate);
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
   independent_hot50_gate_acceptance_not_inferred:true});
  if(process.argv.includes('--release-hold')){
   const files=['artifacts/release/b2-physical-parity-certificate.json','artifacts/release/hot50-risk-gate-proof.json'];
   for(const file of files){need(existsSync(file),'CANARY_HOLD_RELEASE_DEPENDENCY_MISSING');const p=verifySignedEnvelopeFile(file);
    need(p.status==='PASS'&&
      Date.now()-Date.parse(String(p.verified_at??p.generated_at))<3600000&&
      Date.now()>=Date.parse(String(p.verified_at??p.generated_at)),
      'CANARY_HOLD_RELEASE_CERTIFICATE_UNVERIFIED')}
   // A complete CLOSED UTC day proof remains mandatory for permanent release.
   const proof=envString('D1_24H_PROOF_PATH');need(existsSync(proof),'CANARY_HOLD_RELEASE_24H_D1_PROOF_MISSING');
   const p=verifySignedEnvelopeFile(proof);
   need(p.all_account_databases===true&&
    Number.isFinite(Date.parse(String(p.period_end_exclusive_utc)))&&
    Date.now()-Date.parse(String(p.period_end_exclusive_utc))<48*3600000,
    'CANARY_HOLD_RELEASE_24H_D1_PROOF_INVALID');
   // Remove only from the ephemeral job checkout: protected PR review/merge
   // is required to remove the authoritative hold from remote Git main.
   unlinkSync(HOLD);
   signedReport('artifacts/release/hold-release-review.json',{schema:'geomacro.canary.hold-review.v1',status:'PASS',
    source_sha:mainSha,removed_from_ephemeral_checkout:true,remote_main_hold_not_removed:true,
    reviewed_release_commit_required:true,no_funds:true});
  }
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