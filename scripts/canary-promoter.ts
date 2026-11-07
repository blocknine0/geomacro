#!/usr/bin/env node
/** Guarded Cloudflare Workers versions promotion: 0,1,10,100; no funds. */
import {existsSync,readFileSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {api,graphql,need,UUID_RE,envString,assertOfficialMain,signedReport,verifySignedEnvelopeFile,holdError,ORIGIN,WORKER,BUDGET} from './release-common.ts';
const HOLD='config/d1-hotspot-v2-canary.hold';
const STAGES=[0,1,10,100] as const;
const WINDOW_MS=15*60*1000;
const INTERVAL_MS=30000;
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const route=`/workers/scripts/${WORKER}/deployments`;
const info=(id:string)=>`/workers/scripts/${WORKER}/versions/${id}`;
const GRAPH=`query CanaryObservability($accountTag:String!,$script:String!,$zoneTag:String!,$host:String!,$start:Time!,$end:Time!){
 viewer{
  accounts(filter:{accountTag:$accountTag}){
   workersInvocationsAdaptive(limit:1,filter:{scriptName:$script,datetime_geq:$start,datetime_leq:$end}){
    sum{requests errors} quantiles{requestDurationP99}
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
const distribution=(base:string,candidate:string,percent:number)=>percent===0?
 [{version_id:base,percentage:100}]:percent===100?
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
async function verifiedLiveObservability(start:string,end:string,requireVolume=true){
 const account=envString('CLOUDFLARE_ACCOUNT_ID',32),zone=envString('CLOUDFLARE_ZONE_ID',32);
 const graph=await graphql(GRAPH,{accountTag:account,script:WORKER,zoneTag:zone,host:'api.geomacro.live',start,end});
 const worker=graph.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
 const http=graph.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0];
 const requests=worker?.sum?.requests,errors=worker?.sum?.errors;
 const siteCount=http?.count,ratio=http?.ratio?.status5xx;
 const p99=worker?.quantiles?.requestDurationP99;
 // 5xx is zone-host HTTP response ratio; Workers errors != HTTP 5xx.
 // requestDurationP99 is only available on eligible Worker observability.
 need(Number.isSafeInteger(requests)&&Number.isSafeInteger(errors)&&
  Number.isSafeInteger(siteCount)&&
  typeof ratio==='number'&&ratio>=0&&ratio<=1&&
  typeof p99==='number'&&Number.isFinite(p99)&&p99>=0,'CANARY_PROVIDER_METRICS_UNAVAILABLE_OR_LOW_VOLUME');
 if(requests<1000||siteCount<1000){
  need(!requireVolume,'CANARY_PROVIDER_SAMPLE_FLOOR_UNMET');
  return null;
 }
 return {worker_requests:requests,worker_errors:errors,host_requests:siteCount,
  http_5xx_ratio:ratio,worker_request_duration_p99_ms:p99,
  http_5xx_under_0_1pct:ratio<0.001,p99_under_50ms:p99<50,
  observed_worker_and_host_metrics_not_candidate_isolated:true};
}
// Observe all account D1 databases during the rollout. Provider analytics
// are delayed: this triggers a rollback as soon as an overage is OBSERVED,
// not an impossible provider-side atomic per-row hard stop.
const LIVE_D1=`query LiveAccountD1($accountTag:String!,$start:Date!,$end:Date!){
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
 // Inspect provider D1 spend at the start and every two health ticks.
 // A missing delayed provider receipt is HOLD, never a synthetic PASS.
 let d1=await checkLiveD1Budget();
 while(Date.now()-began<WINDOW_MS){
  if(pct===0){
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
    const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),false);
    if(result)need(result.http_5xx_under_0_1pct&&result.p99_under_50ms,'CANARY_LIVE_SLO_BREACH');
   }
  }
  await wait(Math.min(INTERVAL_MS,Math.max(1,WINDOW_MS-(Date.now()-began))));
 }
 d1=await checkLiveD1Budget();
 const result=await verifiedLiveObservability(new Date(began).toISOString(),new Date().toISOString(),true);
 need(result.http_5xx_under_0_1pct&&result.p99_under_50ms,'CANARY_SLO_BREACH');
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
 verifyDistribution(await liveCurrent(),distribution(base,candidate,0));
 await checkVersionParity(base,candidate);
 const records:any[]=[];let mutated=false;
 try{
  for(const pct of STAGES){
   if(pct>0){mutated=true;await deployVersions(base,candidate,pct)}
   const x=await observeStage(base,candidate,pct,mainSha);
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
   try{await deployVersions(base,candidate,0);console.error('CANARY_ROLLBACK_BASELINE_100_VERIFIED')}
   catch{console.error('CANARY_ROLLBACK_PROVIDER_CONFIRMATION_FAILED')}
  }
  throw e;
 }
 console.log(JSON.stringify({status:'PASS',stages:records.length,remote_hold_unchanged:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),payments:0}));process.exitCode=2});
}