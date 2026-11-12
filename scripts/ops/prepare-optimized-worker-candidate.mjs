#!/usr/bin/env node
/** Build an immutable exact-main candidate, inheriting every production binding.
 * Never deploy traffic, change secrets/routes/consumers, issue D1 SQL or activate funds.
 */
import {mkdirSync,writeFileSync,readFileSync,rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {checkD1PaidMonthlyHeadroom}
 from '../lib/d1-workers-paid-monthly-governor.mjs';
import {assessWorkerPromotion} from './verify-protected-worker-promotion.mjs';
import {assessReviewedAdditiveBindingParity,parseReviewedAdditiveSecretNames,
 REVIEWABLE_ADDITIVE_SECRETS,HOT50_INTAKE_PROFILE,HOT50_INTAKE_VARS,
 FAIL_CLOSED_RELEASE_VARS,plainTextValue}
 from '../lib/canary-additive-binding-parity.mjs';
const UUID=/^[a-f0-9-]{36}$/i,SHA=/^[a-f0-9]{40}$/;
const NAME='geomacro-control-plane';
/** Only the fixed, named Hot50 intake flag profile can be owner-reviewed. */
export function candidateConfig(version,sha,{
 reviewedFlagProfile="",reviewedSecretNames=[]
}={}){
 const bindings=version?.resources?.bindings,runtime=version?.resources?.script_runtime;
 if(!SHA.test(sha)||!Array.isArray(bindings)||!bindings.length||
    !/^\d{4}-\d{2}-\d{2}$/.test(runtime?.compatibility_date??''))
  throw Error('CANDIDATE_BASELINE_UNREADABLE');
 if(reviewedFlagProfile!==""&&reviewedFlagProfile!==HOT50_INTAKE_PROFILE)
  throw Error('CANDIDATE_UNREVIEWED_FLAG_PROFILE');
 if(!Array.isArray(reviewedSecretNames)||
    new Set(reviewedSecretNames).size!==reviewedSecretNames.length||
    reviewedSecretNames.some(x=>!REVIEWABLE_ADDITIVE_SECRETS.includes(x)))
  throw Error('CANDIDATE_UNREVIEWED_SECRET_NAME');
 const names=new Set();
 for(const binding of bindings){
  if(typeof binding.name!=='string'||!binding.name||!binding.type||names.has(binding.name))
   throw Error('CANDIDATE_BASELINE_BINDING_INVALID');
  names.add(binding.name);
 }
 if(!names.has('DB')||!names.has('CONTROL_PLANE_TOKEN'))
  throw Error('CANDIDATE_PROTECTED_BINDING_MISSING');
 for(const name of ['GEOMACRO_P0B_ADMISSION_ACTIVE','GEOMACRO_P1_BUNDLED_LEASES_ENABLED'])
  if(plainTextValue(bindings.find(x=>x.name===name))!=='1')
   throw Error('CANDIDATE_PROTECTED_RUNTIME_NOT_ENABLED');
 for(const name of Object.keys(FAIL_CLOSED_RELEASE_VARS)){
  const old=bindings.find(x=>x.name===name);
  if(old&&plainTextValue(old)!=='0')
   throw Error('CANDIDATE_BASELINE_RELEASE_GATE_UNSAFE');
 }
 if(reviewedSecretNames.some(name=>names.has(name)))
  throw Error('CANDIDATE_REVIEWED_SECRET_NOT_ADDITIVE');
 if(runtime.containers?.length)throw Error('CANDIDATE_CONTAINER_REVIEW_REQUIRED');
 const vars={GEOMACRO_SOURCE_SHA:sha,...FAIL_CLOSED_RELEASE_VARS,
  ...(reviewedFlagProfile===HOT50_INTAKE_PROFILE?HOT50_INTAKE_VARS:{})};
 return {name:NAME,main:'src/index.mjs',
  compatibility_date:runtime.compatibility_date,
  compatibility_flags:runtime.compatibility_flags??[],
  ...(runtime.limits?{limits:runtime.limits}:{}),
  ...(runtime.cache_options?{cache:runtime.cache_options}:{}),
  vars,
  unsafe:{bindings:bindings.filter(x=>!Object.hasOwn(vars,x.name))
   .map(x=>({name:x.name,type:'inherit'}))}};
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function verifyCandidateBindings(baseline,candidate,sha,opts={}){
 let result;
 try{
  result=assessReviewedAdditiveBindingParity(baseline,candidate,{
   sourceSha:sha,reviewedFlagProfile:opts.reviewedFlagProfile??"",
   reviewedSecretNames:opts.reviewedSecretNames??[]
  });
 }catch(e){throw Error('CANDIDATE_BINDING_RESOURCE_OR_VALUE_CHANGED_'+e.message)}
 if(canonical(baseline.resources.script_runtime)!==canonical(candidate.resources.script_runtime))
  throw Error('CANDIDATE_SCRIPT_RUNTIME_CHANGED');
 return result.status==='PASS_BINDING_PARITY';
}
/**
 * Wrangler's structured machine output identifies the ONE version created
 * by THIS upload. A historical SHA match or "latest" page is never enough:
 * those are ambiguous across retries and concurrent CI workflows.
 */
export function uploadedVersionIdFromWranglerEvents(ndjson){
 if(typeof ndjson!=='string'||ndjson.length>100000)
  throw Error('CANDIDATE_WRANGLER_UPLOAD_RECEIPT_INVALID');
 let entries;
 try{
  entries=ndjson.trim().split('\n').map(line=>JSON.parse(line));
 }catch{throw Error('CANDIDATE_WRANGLER_UPLOAD_RECEIPT_INVALID')}
 const uploads=entries.filter(x=>x?.type==='version-upload');
 if(uploads.length!==1)
  throw Error('CANDIDATE_WRANGLER_UPLOAD_RECEIPT_MISSING_OR_AMBIGUOUS');
 const uploaded=uploads[0];
 if(uploaded.worker_name!==NAME||!UUID.test(uploaded.version_id??''))
  throw Error('CANDIDATE_WRANGLER_UPLOAD_IDENTITY_INVALID');
 return uploaded.version_id;
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
 mkdirSync('artifacts/protected-canary',{recursive:true});
 writeFileSync('artifacts/protected-canary/candidate-paid-monthly-headroom.json',
  JSON.stringify({schema:'geomacro.optimized-worker-candidate-paid-monthly-headroom.v1',
   status:quota.status,code:quota.code,reason:quota.reason,
   provider_subscription_verified:quota.provider_subscription_verified===true,
   cycle_start_utc:quota.cycle_start_utc,cycle_end_exclusive_utc:quota.cycle_end_exclusive_utc,
   observed_rows_read:quota.observed_rows_read,
   observed_rows_written:quota.observed_rows_written,
   monthly_read_headroom:quota.remaining_rows_read,
   monthly_write_headroom:quota.remaining_rows_written,
   reserve_pct:quota.reserve_pct,provider_metrics_delayed:true,
   version_uploaded:false,traffic_promoted:false,payments:0},null,2)+'\n',
  {mode:0o600});
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
 const profile=env.CANDIDATE_REVIEWED_FLAG_PROFILE??"";
 const reviewedSecrets=parseReviewedAdditiveSecretNames(
  env.CANDIDATE_REVIEWED_ADDITIVE_SECRET_NAMES??"");
 const config=candidateConfig(baseline,env.GITHUB_SHA,{
  reviewedFlagProfile:profile,reviewedSecretNames:reviewedSecrets});
 const baselineNames=new Set(baseline.resources.bindings.map(x=>x.name));
 const missing=REVIEWABLE_ADDITIVE_SECRETS.filter(x=>!baselineNames.has(x)).sort();
 // Review is exact, never a wildcard; Hot50 must carry ALL missing four names.
 if(profile===HOT50_INTAKE_PROFILE&&canonical(missing)!==canonical(reviewedSecrets))
  throw Error('CANDIDATE_MISSING_SECRET_REVIEW_REQUIRED');
 const secretValues={};
 for(const name of reviewedSecrets){
  if(typeof env[name]!=='string'||!env[name].trim())
   throw Error('CANDIDATE_REVIEWED_SECRET_VALUE_MISSING');
  secretValues[name]=env[name];
 }
 writeFileSync('workers/control-plane/wrangler.optimized-candidate.jsonc',JSON.stringify(config),{mode:0o600});
 // No inherited binding values are copied to disk or printed. Inherit strictly
 // on Cloudflare. Wrangler's NDJSON receipt pins the version this invocation
 // just uploaded, even if older versions share the same source SHA.
 const wranglerOutput=resolve('artifacts/protected-canary/.wrangler-upload.ndjson');
 rmSync(wranglerOutput,{force:true});
 let secretDir=null;
 try{
  const args=['-y','wrangler@4.136.3','versions','upload','--config',
   'workers/control-plane/wrangler.optimized-candidate.jsonc','--message',
   'geomacro-main:'+env.GITHUB_SHA];
  if(reviewedSecrets.length){
   // Cloudflare --secrets-file uploads code and secret additions as ONE version.
   // Never check in, upload as artifact, or log this temporary 0600 JSON.
   secretDir=mkdtempSync(join(tmpdir(),'geomacro-reviewed-version-'));
   const file=join(secretDir,'additive-secrets.json');
   writeFileSync(file,JSON.stringify(secretValues),{mode:0o600,flag:'wx'});
   args.push('--secrets-file',file);
  }
  run('npx',args,{encoding:'utf8',stdio:'pipe',timeout:240000,
   env:{...env,WRANGLER_OUTPUT_FILE_PATH:wranglerOutput}});
 }catch(error){
  const output=String(error?.stdout??'')+String(error?.stderr??'');
  const codes=[...output.matchAll(/\[code:\s*(\d+)\]/g)].map(x=>x[1]);
  throw Error('CANDIDATE_UPLOAD_FAILED'+(codes.length?'_PROVIDER_'+codes.join('_'):''));
 }finally{
  if(secretDir)rmSync(secretDir,{recursive:true,force:true});
 }
 let uploadedId;
 try{uploadedId=uploadedVersionIdFromWranglerEvents(
  readFileSync(wranglerOutput,'utf8'));}
 finally{rmSync(wranglerOutput,{force:true});}
 const candidate=await get('/versions/'+uploadedId);
 if(candidate.id!==uploadedId)
  throw Error('CANDIDATE_PROVIDER_VERSION_ID_MISMATCH');
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
  reviewed_flag_profile:profile,reviewed_additive_secret_names:reviewedSecrets,
  baseline_runtime:runtimeSummary(baseline),candidate_runtime:runtimeSummary(candidate),
  owner_quota:quotaSummary,runtime_flags:Object.fromEntries(baseline.resources.bindings.filter(x=>
   ['GEOMACRO_D1_READ_HOTSPOT_V2','GEOMACRO_P1_FANOUT_ENABLED','GEOMACRO_P1_BUNDLED_LEASES_ENABLED',
    'GEOMACRO_P0B_ADMISSION_ACTIVE','RISK_GATE_COUNTRY_SCOPE'].includes(x.name)).map(x=>[x.name,x.text??null])),
  changed_runtime_keys:changedRuntimeKeys,d1_sql_queries:0,traffic_promoted:false,payments:0
 },null,2)+'\n');
 verifyCandidateBindings(baseline,candidate,env.GITHUB_SHA,{reviewedFlagProfile:profile,reviewedSecretNames:reviewedSecrets});
 const final=await get('/deployments?per_page=1');
 if(canonical(final.deployments?.[0]?.versions)!==canonical(versions))
  throw Error('CANDIDATE_PRODUCTION_DEPLOYMENT_CHANGED');
 const promotion=assessWorkerPromotion({deployment:final,baselineVersion:baseline,
  candidateVersion:candidate,baselineId,candidateId:candidate.id,targetPercent:0,
  sourceSha:env.GITHUB_SHA,quota,now:new Date(),reviewedFlagProfile:profile,
  reviewedAdditiveSecretNames:reviewedSecrets});
 writeFileSync('artifacts/protected-canary/worker-promotion-preflight.json',JSON.stringify(promotion,null,2)+'\n');
 const knownFlags=['GEOMACRO_D1_READ_HOTSPOT_V2' ,'GEOMACRO_P1_FANOUT_ENABLED',
  'GEOMACRO_P1_BUNDLED_LEASES_ENABLED','GEOMACRO_P0B_ADMISSION_ACTIVE','RISK_GATE_COUNTRY_SCOPE'];
 const result={schema:'geomacro.optimized-worker-candidate.v1',status:'CANDIDATE_UPLOADED_NOT_DEPLOYED',
  source_sha:env.GITHUB_SHA,baseline_id:baselineId,candidate_id:candidate.id,
  reviewed_flag_profile:profile,reviewed_additive_secret_names:reviewedSecrets,
  binding_resource_and_value_parity_verified:true,runtime_parity_verified:true,
  promotion_eligible:promotion.eligible,promotion_reason:promotion.reason,
  runtime_flags:Object.fromEntries(candidate.resources.bindings.filter(x=>knownFlags.includes(x.name)||Object.hasOwn(HOT50_INTAKE_VARS,x.name)||Object.hasOwn(FAIL_CLOSED_RELEASE_VARS,x.name))
   .map(x=>[x.name,plainTextValue(x)])),
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
