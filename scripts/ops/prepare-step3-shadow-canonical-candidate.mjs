#!/usr/bin/env node
/** Prepare ONLY unpromoted canonical API versions of two isolated Shadow Workers.
 * Inherit existing bindings in Cloudflare. Never touch prod, money, D1 SQL,
 * B2/R2 objects, public route toggles, credentials or traffic splits.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const BUCKET="geomacro-step3-shadow-private";
const WORKERS=[{name:"geomacro-step3-shadow",r2:true},
 {name:"geomacro-step3-shadow-legacy",r2:false}];
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const RECEIPT="artifacts/release/step3-shadow-canonical-unpromoted-candidates.json";
const fail=code=>{throw Error("STEP3_SHADOW_CANONICAL_"+code)};
const stable=v=>JSON.stringify(v,(_,o)=>o&&typeof o==="object"&&!Array.isArray(o)?
 Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))):o);

export function assertScope(e,hold=true){
 if(!hold||e.GITHUB_ACTIONS!=="true"||
 e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
 e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 e.GITHUB_REF!=="refs/heads/main"||!SHA.test(e.GITHUB_SHA??"")||
 e.SHADOW_CANONICAL_APPROVAL!=="STAGE_TWO_ISOLATED_SHADOW_CANONICAL_VERSIONS_NO_TRAFFIC"||
 e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
 (e.CLOUDFLARE_API_TOKEN??"").length<20||
 e.D1_DATABASE_ID!==PROD||e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
 e.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
 e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==BUCKET||
 e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==
 "geomacro-step3-shadow.daspallab202391.workers.dev"||
 e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==
 "geomacro-step3-shadow-legacy.daspallab202391.workers.dev"||
 !existsSync("workers/control-plane/src/index.mjs"))
 fail("EXACT_MAIN_APPROVAL_OR_SHADOW_SCOPE_INVALID");
 return true;
}
async function cf(e,path,fetchImpl=fetch){
 const prefix="/workers/scripts/";
 if(!path.startsWith(prefix)||
  !WORKERS.some(w=>path.startsWith(prefix+w.name+"/")))fail("PROVIDER_PATH_REJECTED");
 let r;
 try{r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
   ACCOUNT+path,{method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
    signal:AbortSignal.timeout(15000)})}
 catch{fail("PROVIDER_UNREACHABLE")}
 if(!r||r.redirected||r.status!==200)fail("PROVIDER_HTTP_"+(r?.status??0));
 let j;try{j=await r.json()}catch{fail("PROVIDER_JSON_INVALID")}
 if(j?.success!==true||j.result==null)fail("PROVIDER_RESULT_UNVERIFIED");
 return j.result;
}
function verifyBindingScope(bindings,w){
 if(!Array.isArray(bindings)||bindings.length===0||
  bindings.some(b=>typeof b.name!=="string"||
   !/^[A-Z][A-Z0-9_]{0,95}$/u.test(b.name)||
   typeof b.type!=="string"||
   !/^[a-z][a-z0-9_]{1,59}$/u.test(b.type))||
  new Set(bindings.map(b=>b.name)).size!==bindings.length)
  fail("BASELINE_BINDING_LIST_UNVERIFIED");
 const db=bindings.filter(x=>x.name==="DB"&&x.type==="d1");
 if(db.length!==1||String(db[0].database_id).toLowerCase()!==SHADOW||
   bindings.some(b=>b.type==="d1"&&
    String(b.database_id).toLowerCase()===PROD))
  fail("PRODUCTION_D1_LEAK_OR_SHADOW_DB_MISSING");
 if(bindings.filter(x=>x.name==="CONTROL_PLANE_TOKEN"&&
   x.type==="secret_text").length!==1)
  fail("SHADOW_BEARER_SECRET_NOT_INHERITABLE");
 if(w.r2&&bindings.filter(x=>x.name==="PHASE2H_PRIVATE_R2"&&
   x.type==="r2_bucket"&&x.bucket_name===BUCKET).length!==1)
  fail("SHADOW_R2_BINDING_NOT_INHERITABLE");
 if(bindings.some(x=>x.name==="ASSETS"))
  fail("UNREVIEWED_STATIC_ASSETS_BINDING");
 return true;
}
export function canonicalConfig(w,version,sha){
 if(!WORKERS.some(x=>x.name===w?.name&&x.r2===w.r2)||
  !SHA.test(sha))fail("CONFIG_SCOPE_INVALID");
 const b=version?.resources?.bindings,rt=version?.resources?.script_runtime;
 verifyBindingScope(b,w);
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(rt?.compatibility_date??"")||
  !Array.isArray(rt?.compatibility_flags??[])||
  (rt.compatibility_flags??[]).some(x=>typeof x!=="string"||
     !/^[a-z0-9_]{2,60}$/u.test(x))||
  rt.containers?.length||rt.migrations?.length)
  fail("BASELINE_RUNTIME_UNVERIFIED");
 return {
  name:w.name,main:"src/index.mjs",
  compatibility_date:rt.compatibility_date,
  compatibility_flags:rt.compatibility_flags??[],
  ...(rt.limits?{limits:rt.limits}:{}),
  ...(rt.cache_options?{cache:rt.cache_options}:{}),
  vars:{GEOMACRO_SOURCE_SHA:sha},
  unsafe:{bindings:b.filter(x=>x.name!=="GEOMACRO_SOURCE_SHA")
   .map(x=>({name:x.name,type:"inherit"}))}
 };
}
async function baseline(e,w,fetchImpl){
 const root="/workers/scripts/"+w.name;
 const [deploy,settings]=await Promise.all([
  cf(e,root+"/deployments",fetchImpl),
  cf(e,root+"/settings",fetchImpl)
 ]);
 const live=deploy.deployments?.[0]?.versions;
 if(!Array.isArray(live)||live.length!==1||
   Number(live[0]?.percentage)!==100||!UUID.test(live[0]?.version_id??""))
   fail("BASELINE_NOT_100_PERCENT_DEPLOYED");
 const v=await cf(e,root+"/versions/"+live[0].version_id,fetchImpl);
 verifyBindingScope(settings.bindings,w);
 verifyBindingScope(v.resources?.bindings,w);
 // No candidate until the deployed and current effective bindings agree.
 if(stable(settings.bindings.map(x=>({name:x.name,type:x.type})).sort((a,b)=>
    a.name.localeCompare(b.name)))!==
  stable(v.resources.bindings.map(x=>({name:x.name,type:x.type})).sort((a,b)=>
    a.name.localeCompare(b.name))))
  fail("EFFECTIVE_AND_VERSION_BINDING_TYPES_DIVERGED");
 return {id:live[0].version_id,deploy:live,version:v,
  config:canonicalConfig(w,v,e.GITHUB_SHA)};
}
function invokeUpload(run,w,sha,config){
 const file=resolve("workers/control-plane/wrangler.step3-"+w.name+".jsonc");
 mkdirSync("workers/control-plane",{recursive:true});
 writeFileSync(file,JSON.stringify(config,null,2)+"\n",{mode:0o600});
 try{
  run("npx",["-y","wrangler@4.136.3","versions","upload",
   "--config",file,"--message","geomacro-shadow-canonical:"+sha],
   {encoding:"utf8",stdio:"pipe",timeout:240000});
 }catch(error){
  const detail=String(error?.stderr??"")+String(error?.stdout??"");
  const codes=[...detail.matchAll(/\[code:\s*(\d+)\]/gu)].map(m=>m[1]);
  fail("CANDIDATE_UPLOAD_FAILED"+(codes.length?"_CF_"+codes.join("_"):""));
 }
}
function candidateBindingParity(baselineVersion,candidate,sha){
 const before=baselineVersion.resources.bindings;
 const expected=new Map(before.map(x=>[x.name,x]));
 expected.set("GEOMACRO_SOURCE_SHA",{name:"GEOMACRO_SOURCE_SHA",
  type:"plain_text",text:sha});
 const actual=candidate?.resources?.bindings;
 if(!Array.isArray(actual)||actual.length!==expected.size||
   new Set(actual.map(x=>x.name)).size!==actual.length)
  fail("CANDIDATE_BINDING_COUNT_DRIFT");
 for(const b of actual){
  if(stable(b)!==stable(expected.get(b.name)))
   fail("CANDIDATE_BINDING_VALUE_OR_RESOURCE_DRIFT");
 }
 if(stable(candidate.resources?.script_runtime)!==
    stable(baselineVersion.resources.script_runtime))
  fail("CANDIDATE_RUNTIME_PARITY_FAILED");
}
async function findCandidate(e,w,b,fetchImpl){
 const root="/workers/scripts/"+w.name;
 const list=await cf(e,root+"/versions?deployable=true",fetchImpl);
 const items=Array.isArray(list.items)?list.items.slice(0,12):[];
 const candidates=[];
 for(const item of items){
  if(!UUID.test(item.id??"")||item.id===b.id)continue;
  const v=await cf(e,root+"/versions/"+item.id,fetchImpl);
  if(v.resources?.bindings?.some(x=>x.name==="GEOMACRO_SOURCE_SHA"&&
     x.type==="plain_text"&&x.text===e.GITHUB_SHA)){
   candidateBindingParity(b.version,v,e.GITHUB_SHA);
   candidates.push(v);
  }
 }
 if(candidates.length!==1)fail("CANONICAL_CANDIDATE_UNIQUE_READBACK_MISSING");
 const active=await cf(e,root+"/deployments",fetchImpl);
 if(stable(active.deployments?.[0]?.versions)!==stable(b.deploy))
  fail("SHADOW_ACTIVE_DEPLOYMENT_CHANGED_DURING_UPLOAD");
 return candidates[0].id;
}
export async function prepareShadowCanonical({env=process.env,fetchImpl=fetch,
 run=execFileSync,holdPresent=existsSync("config/d1-hotspot-v2-canary.hold"),
 headCheck=()=>execFileSync("git",["ls-remote",
  "https://github.com/blocknine0/geomacro.git","refs/heads/main"],
  {encoding:"utf8"}).trim().split(/\s/u)[0]}={}){
 const receipt={schema:"geomacro.step3.shadow-canonical-unpromoted-candidate.v1",
  status:"HOLD",code:"NOT_STARTED",main_sha:env.GITHUB_SHA??null,
  upload_attempted:false,shadow_versions_uploaded:0,
  production_worker_changed:false,production_d1_mutated:false,
  shadow_d1_mutated:false,b2_or_r2_written:false,
  traffic_promoted:false,canary_hold_removed:false,payments_authorized:false,
  workers:[]};
 try{
  assertScope(env,holdPresent);
  if(headCheck()!==env.GITHUB_SHA)fail("MAIN_SHA_MOVED");
  const candidates=[];
  // Complete both isolation/preflight audits BEFORE uploading any version.
  for(const w of WORKERS)candidates.push({w,
   baseline:await baseline(env,w,fetchImpl)});
  for(const {w,baseline:b} of candidates){
   receipt.upload_attempted=true;
   invokeUpload(run,w,env.GITHUB_SHA,b.config);
   receipt.shadow_versions_uploaded++;
   const id=await findCandidate(env,w,b,fetchImpl);
   receipt.workers.push({name:w.name,previous_deployed_version:b.id,
    unpromoted_canonical_candidate_id:id,
    bindings_and_runtime_parity_verified:true,
    canonical_main:"src/index.mjs",
    candidate_live_http_verified:false,traffic_promoted:false});
  }
  receipt.status="PASS_CANDIDATES_UPLOADED_ZERO_TRAFFIC";
  receipt.code="TWO_ISOLATED_SHADOW_CANDIDATES_NO_DEPLOYMENT";
 }catch(e){
  const m=String(e?.message??"");
  receipt.code=/^STEP3_SHADOW_CANONICAL_[A-Z0-9_]+$/u.test(m)?
   m:"STEP3_SHADOW_CANONICAL_UNCLASSIFIED_HOLD";
 }
 receipt.completed_at=new Date().toISOString();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync(RECEIPT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const r=await prepareShadowCanonical();
 if(r.status!=="PASS_CANDIDATES_UPLOADED_ZERO_TRAFFIC")process.exitCode=3;
}
