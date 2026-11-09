#!/usr/bin/env node
/** Build an immutable exact-main candidate, inheriting every production binding.
 * Never deploy traffic, change secrets/routes/consumers, issue D1 SQL or activate funds.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {checkD1PaidMonthlyHeadroom}
 from './lib/d1-workers-paid-monthly-governor.mjs';
import {assessWorkerPromotion} from './verify-protected-worker-promotion.mjs';
const UUID=/^[a-f0-9-]{36}$/i,SHA=/^[a-f0-9]{40}$/;
const NAME='geomacro-control-plane';
export function candidateConfig(version,sha){
 const bindings=version?.resources?.bindings,runtime=version?.resources?.script_runtime;
 if(!SHA.test(sha)||!Array.isArray(bindings)||!bindings.length||
    !/^\d{4}-\d{2}-\d{2}$/.test(runtime?.compatibility_date??''))
  throw Error('CANDIDATE_BASELINE_UNREADABLE');
 const names=new Set();
 for(const binding of bindings){
  if(typeof binding.name!=='string'||!binding.name||!binding.type||names.has(binding.name))
   throw Error('CANDIDATE_BASELINE_BINDING_INVALID');
  names.add(binding.name);
 }
 if(!names.has('DB')||!names.has('CONTROL_PLANE_TOKEN'))
  throw Error('CANDIDATE_PROTECTED_BINDING_MISSING');
 if(runtime.containers?.length)throw Error('CANDIDATE_CONTAINER_REVIEW_REQUIRED');
 return {name:NAME,main:'src/index.mjs',
  compatibility_date:runtime.compatibility_date,
  compatibility_flags:runtime.compatibility_flags??[],
  ...(runtime.limits?{limits:runtime.limits}:{}),
  ...(runtime.cache_options?{cache:runtime.cache_options}:{}),
  vars:{GEOMACRO_SOURCE_SHA:sha},
  unsafe:{bindings:bindings.filter(x=>x.name!=='GEOMACRO_SOURCE_SHA')
   .map(x=>({name:x.name,type:'inherit'}))}};
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function verifyCandidateBindings(baseline,candidate,sha){
 const before=baseline?.resources?.bindings,after=candidate?.resources?.bindings;
 if(!Array.isArray(before)||!Array.isArray(after))throw Error('CANDIDATE_BINDINGS_UNREADABLE');
 const expected=new Map(before.map(x=>[x.name,x]));
 expected.set('GEOMACRO_SOURCE_SHA',{name:'GEOMACRO_SOURCE_SHA',type:'plain_text',text:sha});
 if(after.length!==expected.size||new Set(after.map(x=>x.name)).size!==after.length)
  throw Error('CANDIDATE_BINDING_COUNT_CHANGED');
 for(const actual of after){
  if(canonical(actual)!==canonical(expected.get(actual.name)))
   throw Error('CANDIDATE_BINDING_RESOURCE_OR_VALUE_CHANGED');
 }
 if(canonical(baseline.resources.script_runtime)!==canonical(candidate.resources.script_runtime))
  throw Error('CANDIDATE_SCRIPT_RUNTIME_CHANGED');
 return true;
}
export async function prepareCandidate({env=process.env,fetchImpl=fetch,run=execFileSync}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
    env.GITHUB_REF!=='refs/heads/main'||!SHA.test(env.GITHUB_SHA??'')||
    !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
    (env.CLOUDFLARE_API_TOKEN??'').length<20)
  throw Error('CANDIDATE_PROTECTED_MAIN_REQUIRED');
 const head=run('git',['ls-remote','https://github.com/blocknine0/geomacro.git','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s/)[0];
 if(head!==env.GITHUB_SHA)throw Error('CANDIDATE_MAIN_MOVED');
 const root='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/'+NAME;
 const get=async path=>{
  const r=await fetchImpl(root+path,{headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN},
   redirect:'error',signal:AbortSignal.timeout(20000)});
  const body=await r.json();
  if(!r.ok||body.success!==true||!body.result)throw Error('CANDIDATE_PROVIDER_UNAVAILABLE');
  return body.result;
 };
 const deployment=await get('/deployments?per_page=1');
 const versions=deployment.deployments?.[0]?.versions;
 if(!Array.isArray(versions)||versions.length!==1||Number(versions[0].percentage)!==100||
    !UUID.test(versions[0].version_id??''))throw Error('CANDIDATE_BASELINE_NOT_100_PERCENT');
 const baselineId=versions[0].version_id,baseline=await get('/versions/'+baselineId);
 // No candidate version upload with a Free-plan or stale UTC-day quota.
 // Require the same physical monthly provider gate as the protected promoter.
 const quota=await checkD1PaidMonthlyHeadroom({env,fetchImpl,
  now:new Date(),lane:'canary'});
 if(quota.status!=='PASS'||quota.provider_subscription_verified!==true||
    quota.lane!=='canary')throw Error('CANDIDATE_PAID_MONTHLY_PROVIDER_HEADROOM_HOLD');
 const quotaSummary={checked_at:quota.checked_at_utc,day_utc:quota.day_utc,
  state:quota.status,monthly_cycle_start_utc:quota.cycle_start_utc,
  monthly_cycle_end_exclusive_utc:quota.cycle_end_exclusive_utc,
  observed_rows_read:quota.observed_rows_read,
  observed_rows_written:quota.observed_rows_written,
  monthly_read_headroom:quota.remaining_rows_read,
  monthly_write_headroom:quota.remaining_rows_written,
  normal_budget_held:quota.status!=='PASS',provider_metrics_delayed:true};
 const config=candidateConfig(baseline,env.GITHUB_SHA);
 writeFileSync('workers/control-plane/wrangler.optimized-candidate.jsonc',JSON.stringify(config),{mode:0o600});
 // No inherited binding values are copied to disk or printed. Inherit strictly
 // on Cloudflare; verify provider-returned resource identities after upload.
 try{run('npx',['-y','wrangler@4.136.3','versions','upload','--config',
  'workers/control-plane/wrangler.optimized-candidate.jsonc','--message','geomacro-main:'+env.GITHUB_SHA],
  {encoding:'utf8',stdio:'pipe',timeout:240000});}
 catch(error){
  const output=String(error?.stdout??'')+String(error?.stderr??'');
  const codes=[...output.matchAll(/\[code:\s*(\d+)\]/g)].map(x=>x[1]);
  throw Error('CANDIDATE_UPLOAD_FAILED'+(codes.length?'_PROVIDER_'+codes.join('_'):''));
 }
 const list=await get('/versions?deployable=true');
 const matches=(list.items??[]).filter(x=>
  (x.annotations?.['workers/message']??x.metadata?.annotations?.['workers/message']??'')===
   'geomacro-main:'+env.GITHUB_SHA);
 // Some API list responses omit annotations; resolve a bounded recent page
 // and require the immutable SHA binding, never pick "latest" blindly.
 const recent=(list.items??[]).slice(0,10);
 const found=[];
 for(const item of (matches.length?matches:recent)){
  if(!UUID.test(item.id??'')||item.id===baselineId)continue;
  const detail=await get('/versions/'+item.id);
  if(detail.resources?.bindings?.some(x=>x.name==='GEOMACRO_SOURCE_SHA'&&x.text===env.GITHUB_SHA))
   found.push(detail);
 }
 if(found.length!==1)throw Error('CANDIDATE_VERSION_IDENTITY_AMBIGUOUS');
 const candidate=found[0];
 // Preserve a safe provider receipt even when parity rejects a version.
 // Runtime metadata contains execution settings, never binding credentials.
 const runtimeFields=['compatibility_date','compatibility_flags','usage_model','limits','cache_options'];
 const runtimeSummary=v=>Object.fromEntries(runtimeFields.filter(k=>
  Object.hasOwn(v.resources?.script_runtime??{},k)).map(k=>[k,v.resources.script_runtime[k]]));
 const runtimeKeys=new Set([...Object.keys(baseline.resources.script_runtime??{}),
  ...Object.keys(candidate.resources.script_runtime??{})]);
 const changedRuntimeKeys=[...runtimeKeys].filter(k=>
  canonical(baseline.resources.script_runtime?.[k])!==canonical(candidate.resources.script_runtime?.[k]));
 mkdirSync('artifacts/protected-canary',{recursive:true});
 writeFileSync('artifacts/protected-canary/optimized-worker-candidate.json',JSON.stringify({
  schema:'geomacro.optimized-worker-candidate.v1',status:'PARITY_VERIFICATION_PENDING',
  source_sha:env.GITHUB_SHA,baseline_id:baselineId,candidate_id:candidate.id,
  baseline_runtime:runtimeSummary(baseline),candidate_runtime:runtimeSummary(candidate),
  owner_quota:quotaSummary,runtime_flags:Object.fromEntries(baseline.resources.bindings.filter(x=>
   ['GEOMACRO_D1_READ_HOTSPOT_V2','GEOMACRO_P1_FANOUT_ENABLED','GEOMACRO_P1_BUNDLED_LEASES_ENABLED',
    'GEOMACRO_P0B_ADMISSION_ACTIVE','RISK_GATE_COUNTRY_SCOPE'].includes(x.name)).map(x=>[x.name,x.text??null])),
  changed_runtime_keys:changedRuntimeKeys,d1_sql_queries:0,traffic_promoted:false,payments:0
 },null,2)+'\n');
 verifyCandidateBindings(baseline,candidate,env.GITHUB_SHA);
 const final=await get('/deployments?per_page=1');
 if(canonical(final.deployments?.[0]?.versions)!==canonical(versions))
  throw Error('CANDIDATE_PRODUCTION_DEPLOYMENT_CHANGED');
 const promotion=assessWorkerPromotion({deployment:final,baselineVersion:baseline,
  candidateVersion:candidate,baselineId,candidateId:candidate.id,targetPercent:0,
  sourceSha:env.GITHUB_SHA,quota,now:new Date()});
 writeFileSync('artifacts/protected-canary/worker-promotion-preflight.json',JSON.stringify(promotion,null,2)+'\n');
 const knownFlags=['GEOMACRO_D1_READ_HOTSPOT_V2' ,'GEOMACRO_P1_FANOUT_ENABLED',
  'GEOMACRO_P1_BUNDLED_LEASES_ENABLED','GEOMACRO_P0B_ADMISSION_ACTIVE','RISK_GATE_COUNTRY_SCOPE'];
 const result={schema:'geomacro.optimized-worker-candidate.v1',status:'CANDIDATE_UPLOADED_NOT_DEPLOYED',
  source_sha:env.GITHUB_SHA,baseline_id:baselineId,candidate_id:candidate.id,
  binding_resource_and_value_parity_verified:true,runtime_parity_verified:true,
  promotion_eligible:promotion.eligible,promotion_reason:promotion.reason,
  runtime_flags:Object.fromEntries(baseline.resources.bindings.filter(x=>knownFlags.includes(x.name))
   .map(x=>[x.name,x.text??null])),
  production_split_unchanged:true,owner_quota:quotaSummary,d1_sql_queries:0,traffic_promoted:false,payments:0};
 mkdirSync('artifacts/protected-canary',{recursive:true});
 writeFileSync('artifacts/protected-canary/optimized-worker-candidate.json',JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await prepareCandidate()));}
 catch(error){console.error(JSON.stringify({status:'HOLD',code:/^CANDIDATE_[A-Z0-9_]+$/.test(error.message)?
  error.message:'CANDIDATE_PREPARATION_UNAVAILABLE',traffic_promoted:false,payments:0}));process.exitCode=2;}
}
