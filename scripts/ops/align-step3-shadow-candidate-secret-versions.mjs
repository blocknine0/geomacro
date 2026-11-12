#!/usr/bin/env node
/**
 * Repair ONLY the TWO previously staged, unpromoted canonical Shadow Worker
 * candidates by creating new IMMUTABLE, NON-DEPLOYED secret-aligned versions.
 * Must never use "wrangler secret put" (auto-deploy), PATCH /settings, D1 SQL,
 * B2/R2 operations, live route updates, production credentials or payment.
 *
 * Owner token goes through child-process stdin ONLY and is never logged.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const BUCKET="geomacro-step3-shadow-private";
const SOURCE_SHA="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const WORKERS=Object.freeze([
 {name:"geomacro-step3-shadow",old:"48680b70-c41c-4af9-9e70-497213471dbb",
  staged:"565118e5-781f-4a3a-ad73-d304d4876e8a",r2:true},
 {name:"geomacro-step3-shadow-legacy",old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  staged:"214742c7-bc20-4ff8-bbed-cc3b41604aff",r2:false}
]);
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const TOKEN=/^[a-f0-9]{64}$/u;
const RECEIPT="artifacts/release/step3-shadow-secret-aligned-candidates.json";
const fail=c=>{throw Error("STEP3_SHADOW_SECRET_CANDIDATE_"+c)};
const stable=o=>JSON.stringify(o,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);

export function validateSecretCandidateScope(e,hold=true){
 if(!hold||e.GITHUB_ACTIONS!=="true"||
 e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
 e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 e.GITHUB_REF!=="refs/heads/main"||!SHA.test(e.GITHUB_SHA??"")||
 e.SHADOW_SECRET_CANDIDATE_APPROVAL!==
 "ALIGN_TWO_IMMUTABLE_SHADOW_CANDIDATE_SECRETS_NO_TRAFFIC"||
 e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||(e.CLOUDFLARE_API_TOKEN??"").length<20||
 e.D1_DATABASE_ID!==PROD||e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
 e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==BUCKET||
 !TOKEN.test(e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??"")||
 e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==
  "geomacro-step3-shadow.daspallab202391.workers.dev"||
 e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==
  "geomacro-step3-shadow-legacy.daspallab202391.workers.dev")
  fail("EXACT_MAIN_SCOPE_OR_OWNER_SECRET_UNVERIFIED");
 // Never fall back to production bearer or auto-generate an unexpected token.
 if(e.CONTROL_PLANE_TOKEN!==undefined&&
   e.CONTROL_PLANE_TOKEN===e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN)
  fail("PRODUCTION_AND_SHADOW_SECRET_REUSE_PROHIBITED");
 return true;
}
function scopedWorker(w){
 if(!WORKERS.some(x=>x.name===w?.name&&x.staged===w.staged))fail("WORKER_NOT_PINNED");
 return w;
}
async function cf(e,path,fetchImpl=fetch){
 const allowed=new Set(["/d1/database/"+PROD,"/d1/database/"+SHADOW]);
 for(const w of WORKERS){
  const base="/workers/scripts/"+w.name;
  for(const part of ["/versions?deployable=true","/deployments",
    "/versions/"+w.staged])allowed.add(base+part);
  allowed.add("/workers/workers/"+w.name+"/versions/"+w.staged);
 }
 if(!allowed.has(path)&&!WORKERS.some(w=>
  UUID.test(path.slice(("/workers/scripts/"+w.name+"/versions/").length))&&
  path.startsWith("/workers/scripts/"+w.name+"/versions/")||
  UUID.test(path.slice(("/workers/workers/"+w.name+"/versions/").length))&&
  path.startsWith("/workers/workers/"+w.name+"/versions/")))
  fail("PROVIDER_READ_OUTSIDE_SHADOW_SCOPE");
 let r;try{r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
  ACCOUNT+path,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
  signal:AbortSignal.timeout(15000)})}
 catch{fail("PROVIDER_NETWORK_UNAVAILABLE")}
 if(!r||r.redirected||r.status!==200)fail("PROVIDER_HTTP_"+(r?.status??0));
 let j;try{j=await r.json()}catch{fail("PROVIDER_INVALID_JSON")}
 if(j?.success!==true||j.result==null)fail("PROVIDER_RESULT_INVALID");
 return j.result;
}
function matchBindings(bindings,w,prior=null){
 if(!Array.isArray(bindings)||!bindings.length||
  new Set(bindings.map(x=>x.name)).size!==bindings.length)
  fail("BINDINGS_MISSING_OR_DUPLICATED");
 const db=bindings.filter(x=>x.name==="DB"&&x.type==="d1");
 if(db.length!==1||db[0].database_id?.toLowerCase()!==SHADOW||
   bindings.some(x=>x.type==="d1"&&x.database_id?.toLowerCase()===PROD))
  fail("D1_ISOLATION_VIOLATION");
 if(bindings.filter(x=>x.name==="CONTROL_PLANE_TOKEN"&&x.type==="secret_text").length!==1)
  fail("SHADOW_ADMIN_BINDING_MISSING");
 if(w.r2&&bindings.filter(x=>x.name==="PHASE2H_PRIVATE_R2"&&
   x.type==="r2_bucket"&&x.bucket_name===BUCKET).length!==1)
  fail("SHADOW_R2_IDENTITY_VIOLATION");
 if(bindings.filter(x=>x.name==="GEOMACRO_SOURCE_SHA"&&
   x.type==="plain_text"&&x.text===SOURCE_SHA).length!==1)
  fail("CANONICAL_SOURCE_SHA_NOT_PRESERVED");
 if(prior){
  if(stable(bindings)!==stable(prior))fail("BINDING_PARITY_DRIFT");
 }
 return true;
}
function liveDeploymentSnapshot(deploy){
 const v=deploy?.deployments?.[0]?.versions;
 if(!Array.isArray(v)||v.length!==1||
  !UUID.test(String(v[0]?.version_id??""))||Number(v[0]?.percentage)!==100)
  fail("LIVE_DEPLOYMENT_NOT_SINGLE_VERSION_100_PERCENT");
 return {version_id:v[0].version_id,percentage:100};
}
function deployedUnchanged(deploy,expected){
 const actual=liveDeploymentSnapshot(deploy);
 if(expected&&stable(actual)!==stable(expected))
  fail("LIVE_DEPLOYMENT_NOT_UNCHANGED");
 return actual;
}
export function providerVersionHost(urls,w){
 scopedWorker(w);
 if(!Array.isArray(urls)||urls.length>8)return {ok:false,reason:"URLS_MISSING_OR_TOO_MANY"};
 const hostRe=new RegExp("^[a-f0-9]{8}-"+w.name+
   "\\.daspallab202391\\.workers\\.dev$","u");
 const valid=[];
 for(const input of urls){
  if(typeof input!=="string")continue;
  let u;try{u=new URL(input)}catch{continue}
  if(u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
     u.pathname==="/"&&!u.search&&!u.hash&&hostRe.test(u.hostname))
    valid.push(u.hostname);
 }
 if(valid.length!==1)return {ok:false,reason:"NO_UNIQUE_PINNED_VERSION_URL"};
 return {ok:true,host:valid[0]};
}
async function probe(host,w,kind,secret,fetchImpl){
 const origin=providerVersionHost(["https://"+host],w);
 if(!origin.ok||origin.host!==host)fail("PROBE_HOST_NOT_PROVIDER_PINNED");
 if(!["RETIRED_404","INVALID_401","VALID_400"].includes(kind))
  fail("PROBE_KIND_OUT_OF_SCOPE");
 const path=kind==="RETIRED_404"?"/v1/public/intelligence-publications":
  "/v1/internal/p0b/status?deep=invalid";
 const bearer=kind==="VALID_400"?secret:"invalid";
 let r;try{r=await fetchImpl("https://"+host+path,{method:"GET",
  redirect:"error",cache:"no-store",
  headers:{Accept:"application/json",Authorization:"Bearer "+bearer},
  signal:AbortSignal.timeout(15000)})}
 catch{return {verified:false,reason:"NETWORK_UNAVAILABLE"}}
 if(!r||r.redirected)return {verified:false,reason:"REDIRECT"};
 const json=String(r.headers?.get("content-type")??"").toLowerCase()
   .includes("application/json");
 const status=Number(r.status);
 if(!json||r.headers?.get("cf-mitigated")==="challenge")
   return {verified:false,http_status:status,reason:"NON_JSON_OR_CLOUDFLARE_CHALLENGE"};
 let txt;try{txt=await r.text()}catch{return {verified:false,reason:"BODY_UNAVAILABLE"}}
 if(txt.length>4096)return {verified:false,reason:"BODY_TOO_LONG"};
 let d;try{d=JSON.parse(txt)}catch{return {verified:false,reason:"INVALID_JSON"}}
 const expected=kind==="RETIRED_404"?{s:404,e:"NOT_FOUND"}:
  kind==="INVALID_401"?{s:401,e:"UNAUTHORIZED"}:
  {s:400,e:"P0B_STATUS_QUERY_INVALID"};
 return {verified:status===expected.s&&d?.ok===false&&d?.error===expected.e,
  http_status:status,response_json:true,
  error_category:status===expected.s&&d?.error===expected.e?
    expected.e:"UNEXPECTED_JSON"};
}
async function baseline(e,w,fetchImpl,expectedLive=null){
 scopedWorker(w);
 const base="/workers/scripts/"+w.name;
 const [deploy,ver,vurl]=await Promise.all([
  cf(e,base+"/deployments",fetchImpl),
  cf(e,base+"/versions/"+w.staged,fetchImpl),
  cf(e,"/workers/workers/"+w.name+"/versions/"+w.staged,fetchImpl)
 ]);
 const live=deployedUnchanged(deploy,expectedLive);
 if(ver.id!==w.staged||
  vurl.id!==w.staged||vurl.main_module!=="index.js")
  fail("PINNED_CANONICAL_CANDIDATE_NOT_FOUND");
 matchBindings(ver.resources?.bindings,w);
 const oldHost=providerVersionHost(vurl.urls,w);
 if(!oldHost.ok)fail("ORIGINAL_CANONICAL_CANDIDATE_URL_MISSING");
 // Root cause confirmed: current inherited candidate secret has incorrect bearer.
 const invalid=await probe(oldHost.host,w,"INVALID_401","invalid",fetchImpl);
 const actual=await probe(oldHost.host,w,"VALID_400",
  e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl);
 if(invalid.verified!==true||
   !(actual.http_status===401&&actual.response_json&&
     actual.error_category==="UNEXPECTED_JSON"))
  fail("EXPECTED_SHADOW_BEARER_MISMATCH_NOT_PROVEN");
 return {bindings:ver.resources.bindings,runtime:ver.resources.script_runtime,
  live_deployment:live,
  original_ver:w.staged,original_main:vurl.main_module};
}
function versionsSecretPut(run,w,secret,sha){
 scopedWorker(w);
 // It creates a new version. It DOES NOT DEPLOY a version, unlike "secret put".
 // The independent SHA is an annotation only; no source/binding data is logged.
 const args=["-y","wrangler@4.136.3","versions","secret","put",
  "CONTROL_PLANE_TOKEN","--name",w.name,"--message",
  "geomacro-shadow-canonical-secret:"+sha];
 try{run("npx",args,{input:secret+"\n",encoding:"utf8",
  timeout:180000,maxBuffer:100000,stdio:["pipe","pipe","pipe"]})}
 catch(err){
  const s=String(err?.stderr??"")+String(err?.stdout??"");
  const codes=[...s.matchAll(/\[code:\s*(\d+)\]/gu)].map(x=>x[1]);
  fail("VERSIONS_SECRET_PUT_REJECTED"+(codes.length?"_CF_"+codes.join("_"):""));
 }
}
async function checkAfter(e,w,before,fetchImpl){
 const base="/workers/scripts/"+w.name;
 const [list,deploy]=await Promise.all([
  cf(e,base+"/versions?deployable=true",fetchImpl),
  cf(e,base+"/deployments",fetchImpl)
 ]);
 deployedUnchanged(deploy,before.live_deployment);
 const newId=list.items?.[0]?.id;
 if(!UUID.test(newId??"")||newId===w.staged||newId===w.old)
  fail("NEW_UNPROMOTED_VERSION_UNVERIFIED");
 const [candidate,raw]=await Promise.all([
  cf(e,base+"/versions/"+newId,fetchImpl),
  cf(e,"/workers/workers/"+w.name+"/versions/"+newId,fetchImpl)
 ]);
 if(candidate.id!==newId||raw.id!==newId||
  raw.main_module!==before.original_main||
  stable(candidate.resources?.script_runtime)!==stable(before.runtime))
  fail("NEW_VERSION_CODE_OR_RUNTIME_DRIFT");
 matchBindings(candidate.resources?.bindings,w,before.bindings);
 const h=providerVersionHost(raw.urls,w);
 if(!h.ok)return {version_id:newId,live_traffic_unchanged:true,
  bindings_runtime_parity_verified:true,status:"HOLD_VERSION_URL",http_probes:[]};
 const probes=[];
 for(const kind of ["RETIRED_404","INVALID_401","VALID_400"]){
  const p=await probe(h.host,w,kind,
    e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl);
  probes.push({kind,...p});
 }
 return {version_id:newId,live_traffic_unchanged:true,
  bindings_runtime_parity_verified:true,
  status:probes.every(x=>x.verified)?"PASS_IMMUTABLE_SECRET_ALIGNED_HTTP":
    "HOLD_HTTP_CONTRACT",http_probes:probes};
}
export async function alignShadowCandidateSecrets({env=process.env,fetchImpl=fetch,
 run=execFileSync,headCheck=()=>execFileSync("git",
  ["ls-remote","https://github.com/blocknine0/geomacro.git","refs/heads/main"],
  {encoding:"utf8"}).trim().split(/\s/u)[0],
 holdPresent=existsSync("config/d1-hotspot-v2-canary.hold")}={}){
 const receipt={schema:"geomacro.step3.shadow-candidate-secret-align.v1",
  status:"HOLD",code:"NOT_STARTED",current_main:env.GITHUB_SHA??null,
  canonical_source_sha:SOURCE_SHA,owner_approval_manual:true,
  production_worker_changed:false,production_d1_mutated:false,
  shadow_d1_mutated:false,shadow_traffic_changed:false,
  b2_or_r2_written:false,canary_hold_removed:false,payments_authorized:false,
  workers:[]};
 try{
  validateSecretCandidateScope(env,holdPresent);
  if(headCheck()!==env.GITHUB_SHA)fail("MAIN_SHA_DRIFT");
  const ids=await Promise.all([
   cf(env,"/d1/database/"+PROD,fetchImpl),
   cf(env,"/d1/database/"+SHADOW,fetchImpl)
  ]);
  if(ids[0].uuid?.toLowerCase()!==PROD||ids[0].name!=="geomacro-control-plane"||
   ids[1].uuid?.toLowerCase()!==SHADOW||
   ids[1].name!=="geomacro-d1-publisher-shadow")fail("DB_IDENTITY_UNVERIFIED");
  // Capture the exact already-live Shadow deployment after bearer sync. We
  // preserve that snapshot for every later pre/post write guard; do not pin
  // it to the stale pre-sync deployment UUID from a previous rehearsal.
  const base=[];
  for(const w of WORKERS)base.push(await baseline(env,w,fetchImpl));
  for(let i=0;i<WORKERS.length;i++){
   const w=WORKERS[i];
   // Pre-upload race guard: same candidate and same deployment observed at start.
   await baseline(env,w,fetchImpl,base[i].live_deployment);
   versionsSecretPut(run,w,env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,
    SOURCE_SHA);
   // A secret-version write may have succeeded even if physical proof fails.
   receipt.workers.push({script:w.name,status:"HOLD_POST_UPLOAD_NOT_VERIFIED",
    source_version:w.staged,unpromoted_new_version:null,
    live_traffic_unchanged_unverified:true,http_probes:[]});
   const newVersion=await checkAfter(env,w,base[i],fetchImpl);
   receipt.workers[receipt.workers.length-1]={
    script:w.name,source_version:w.staged,
    unpromoted_new_version:newVersion.version_id,
    status:newVersion.status,
    live_traffic_unchanged:newVersion.live_traffic_unchanged,
    bindings_runtime_parity_verified:newVersion.bindings_runtime_parity_verified,
    http_probes:newVersion.http_probes};
   if(newVersion.status!=="PASS_IMMUTABLE_SECRET_ALIGNED_HTTP")
    fail("NEW_VERSION_PHYSICAL_HTTP_NOT_VERIFIED");
  }
  receipt.status="PASS_TWO_SECRET_ALIGNED_CANONICAL_CANDIDATES_ZERO_TRAFFIC";
  receipt.code="BOTH_IMMUTABLE_AUTH_CONTRACTS_404_401_400_VERIFIED";
 }catch(err){
  const m=String(err?.message??"");
  receipt.code=/^STEP3_SHADOW_SECRET_CANDIDATE_[A-Z0-9_]+$/u.test(m)?
    m:"STEP3_SHADOW_SECRET_CANDIDATE_UNCLASSIFIED_HOLD";
 }
 receipt.completed_at=new Date().toISOString();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync(RECEIPT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const r=await alignShadowCandidateSecrets();
 if(r.status!=="PASS_TWO_SECRET_ALIGNED_CANONICAL_CANDIDATES_ZERO_TRAFFIC")
  process.exitCode=3;
}
