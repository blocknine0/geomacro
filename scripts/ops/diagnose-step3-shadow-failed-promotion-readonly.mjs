#!/usr/bin/env node
/**
 * GeoMacro Step3 read-only incident snapshot AFTER an uncertain Shadow promotion.
 * ZERO provider writes, D1 queries, B2/R2, secret mutations, deployment actions,
 * canary hold changes or production traffic changes. Capture only allowlisted
 * provider deployment metadata and native JSON response classification.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const DOMAIN="daspallab202391.workers.dev";
const W=[
 {name:"geomacro-step3-shadow",old:"48680b70-c41c-4af9-9e70-497213471dbb",
  target:"1a49e55d-7c82-42b6-9f30-250423d9732c"},
 {name:"geomacro-step3-shadow-legacy",old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  target:"f72738eb-40ff-4e48-ba67-1d5c004a989d"}
];
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const RECEIPT="artifacts/release/step3-shadow-failed-promotion-readonly-incident.json";
const fail=code=>{throw Error("STEP3_SHADOW_POST_FAILURE_"+code)};
function strictEnv(e,hold){
 if(!hold||e.GITHUB_ACTIONS!=="true"||
  e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  e.GITHUB_REF!=="refs/heads/main"||
  !["push","workflow_dispatch"].includes(e.GITHUB_EVENT_NAME)||
  !SHA.test(e.GITHUB_SHA??"")||
  e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
  (e.CLOUDFLARE_API_TOKEN??"").length<20||
  e.D1_DATABASE_ID!==PROD||
  e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
  e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==W[0].name+"."+DOMAIN||
  e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==W[1].name+"."+DOMAIN)
  fail("EXACT_MAIN_ACCOUNT_SHADOW_SCOPE_UNVERIFIED");
 return true;
}
function safeWorkerName(w){if(!W.some(x=>x.name===w?.name))fail("SCRIPT_NOT_ISOLATED")}
async function readCF(e,path,{fetchImpl=fetch}={}){
 const allowed=new Set(["/d1/database/"+PROD,"/d1/database/"+SHADOW]);
 for(const w of W){
  allowed.add("/workers/scripts/"+w.name+"/deployments");
  allowed.add("/workers/scripts/"+w.name+"/subdomain");
  allowed.add("/workers/scripts/"+w.name+"/settings");
 }
 // Allow a deployment detail GET only if a valid pinned script and UUID.
 const detail=W.some(w=>
  path.startsWith("/workers/scripts/"+w.name+"/deployments/")&&
  UUID.test(path.slice(("/workers/scripts/"+w.name+"/deployments/").length)));
 if(!allowed.has(path)&&!detail)fail("UNALLOWLISTED_PROVIDER_GET_PATH");
 let r;try{
  r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
   ACCOUNT+path,{method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
   signal:AbortSignal.timeout(16000)});
 }catch{fail("PROVIDER_GET_UNREACHABLE")}
 if(!r||r.redirected||r.status!==200)
  fail("PROVIDER_GET_HTTP_"+(r?.status??0));
 let v;try{v=await r.json()}catch{fail("PROVIDER_GET_BAD_JSON")}
 if(v?.success!==true||v.result==null)fail("PROVIDER_GET_REJECTED");
 return v.result;
}
function sanitizeVersion(v){
 if(!UUID.test(v?.version_id??"")||Number(v.percentage)<0||
   Number(v.percentage)>100)fail("DEPLOYMENT_VERSION_INVALID");
 return {version_id:v.version_id,percentage:Number(v.percentage)};
}
function safeDeployment(dep){
 if(!UUID.test(dep?.id??"")||!Array.isArray(dep.versions)||
   dep.versions.length<1||dep.versions.length>2)
   fail("DEPLOYMENT_METADATA_INVALID");
 const vs=dep.versions.map(sanitizeVersion);
 const time=typeof dep.created_on==="string"&&
   /^\d{4}-\d{2}-\d{2}T/u.test(dep.created_on)?dep.created_on:null;
 return {id:dep.id,created_on:time,versions:vs};
}
function findSingleActive(d){
 if(!Array.isArray(d?.deployments)||d.deployments.length===0)
  fail("DEPLOYMENTS_LIST_MISSING");
 const list=d.deployments.slice(0,5).map(safeDeployment);
 const latest=list[0];
 if(latest.versions.length!==1||latest.versions[0].percentage!==100)
  return {state:"SPLIT_OR_AMBIGUOUS",active_id:null,latest,history:list};
 return {state:"SINGLE_100",active_id:latest.versions[0].version_id,
  latest,history:list};
}
async function capture(e,w,fetchImpl){
 safeWorkerName(w);
 const path="/workers/scripts/"+w.name+"/deployments";
 const list=await readCF(e,path,{fetchImpl});
 const info=findSingleActive(list);
 if(!info.latest?.id)fail("DEPLOYMENT_DETAIL_ID_UNVERIFIED");
 const detail=await readCF(e,path+"/"+info.latest.id,{fetchImpl});
 const normalized=safeDeployment(detail);
 if(JSON.stringify(normalized.versions)!==JSON.stringify(info.latest.versions)||
   normalized.id!==info.latest.id)
  fail("LIST_AND_DEPLOYMENT_DETAIL_DISAGREE");
 return info;
}
export async function probeHost(w,kind,{fetchImpl=fetch,shadowBearer=""}={}){
 safeWorkerName(w);
 if(!["retired","invalid","valid"].includes(kind))
  fail("PROBE_PATH_NOT_ALLOWED");
 if(kind==="valid"&&!/^[a-f0-9]{64}$/u.test(shadowBearer))
  return {status:"UNVERIFIED",reason:"SHADOW_BEARER_UNAVAILABLE"};
 const url="https://"+w.name+"."+DOMAIN+
   (kind==="retired"?"/v1/public/intelligence-publications":
    "/v1/internal/p0b/status?deep=invalid");
 let r;try{r=await fetchImpl(url,{method:"GET",redirect:"error",
   cache:"no-store",
   headers:{Authorization:"Bearer "+(kind==="valid"?shadowBearer:"invalid"),
    Accept:"application/json"},signal:AbortSignal.timeout(15000)})}
 catch{return {status:"UNVERIFIED",reason:"HTTP_NETWORK_FAILURE"}}
 if(!r||r.redirected)return {status:"UNVERIFIED",reason:"HTTP_REDIRECT"};
 const type=String(r.headers?.get("content-type")??"").toLowerCase();
 const status=Number(r.status);
 if(!type.includes("application/json")||
    r.headers?.get("cf-mitigated")==="challenge")
   return {status:"OBSERVED",http_status:status,json:false,
    expected_guard:false,reason:"NON_JSON_OR_CF_CHALLENGE"};
 const size=Number(r.headers?.get("content-length")??0);
 if(!Number.isFinite(size)||size>4096)
  return {status:"UNVERIFIED",reason:"OVERSIZED_JSON"};
 let body;try{body=await r.text()}catch{
  return {status:"UNVERIFIED",reason:"JSON_UNREADABLE"}}
 if(body.length>4096)return {status:"UNVERIFIED",reason:"OVERSIZED_JSON"};
 let json;try{json=JSON.parse(body)}catch{
  return {status:"UNVERIFIED",reason:"INVALID_JSON"}}
 const expected=kind==="retired"?{http:404,error:"NOT_FOUND"}:
   kind==="invalid"?{http:401,error:"UNAUTHORIZED"}:
   {http:400,error:"P0B_STATUS_QUERY_INVALID"};
 const valid=status===expected.http&&json?.ok===false&&
    json?.error===expected.error;
 return {status:"OBSERVED",http_status:status,json:true,expected_guard:valid,
    error_category:valid?expected.error:"UNEXPECTED_JSON"};
}
export async function diagnoseShadowAfterPromotion({
 env=process.env,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),
 holdPresent=existsSync("config/d1-hotspot-v2-canary.hold"),
 headCheck=()=>execFileSync("git",["ls-remote",
  "https://github.com/blocknine0/geomacro.git","refs/heads/main"],
  {encoding:"utf8"}).trim().split(/\s/u)[0]
}={}){
 const report={schema:"geomacro.step3.failed-shadow-promotion-readonly.v1",
  status:"HOLD",code:"UNKNOWN",
  main_sha:env.GITHUB_SHA??null,source_run:42583282859,
  incident_state:"MANUAL_REVIEW_REQUIRED",read_only:true,
  production_worker_changed:false,production_d1_mutated:false,
  shadow_d1_mutated:false,shadow_traffic_changed_by_audit:false,
  b2_or_r2_written:false,canary_hold_removed:false,
  payments_authorized:false,workers:[]};
 try{
  strictEnv(env,holdPresent);
  if(headCheck()!==env.GITHUB_SHA)fail("MAIN_SHA_MOVED");
  const [prod,shadow]=await Promise.all([
   readCF(env,"/d1/database/"+PROD,{fetchImpl}),
   readCF(env,"/d1/database/"+SHADOW,{fetchImpl})
  ]);
  if(prod.uuid?.toLowerCase()!==PROD||prod.name!=="geomacro-control-plane"||
   shadow.uuid?.toLowerCase()!==SHADOW||
   shadow.name!=="geomacro-d1-publisher-shadow")
   fail("D1_IDENTITIES_DIVERGED");
  let ambiguous=false;
  for(const w of W){
   const one=await capture(env,w,fetchImpl);
   await sleep(1500);
   const two=await capture(env,w,fetchImpl);
   const stable=one.latest.id===two.latest.id&&
    one.active_id===two.active_id;
   const deployed=two.active_id;
   const state=!stable?"UNSTABLE_PROVIDER_READBACK":
     deployed===w.old?"OLD_ORIGINAL_AT_100":
     deployed===w.target?"NEW_CANONICAL_AT_100":
     "UNEXPECTED_OR_SPLIT_VERSION_REVIEW";
   if(!stable||state==="UNEXPECTED_OR_SPLIT_VERSION_REVIEW")
    ambiguous=true;
   const [domain,settings]=await Promise.all([
    readCF(env,"/workers/scripts/"+w.name+"/subdomain",{fetchImpl}),
    readCF(env,"/workers/scripts/"+w.name+"/settings",{fetchImpl})
   ]);
   const bound=settings?.bindings;
   const isolated=Array.isArray(bound)&&
     bound.some(b=>b.name==="DB"&&b.type==="d1"&&
      b.database_id?.toLowerCase()===SHADOW)&&
     !bound.some(b=>b.type==="d1"&&b.database_id?.toLowerCase()===PROD);
   if(!isolated)ambiguous=true;
   const probes=[];
   for(const kind of ["retired","invalid","valid"])
    probes.push({kind,...await probeHost(w,kind,{fetchImpl,
     shadowBearer:env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??""})});
   report.workers.push({script:w.name,
    expected_old_version:w.old,verified_new_version:w.target,
    current_version_id:deployed,
    latest_deployment_id:two.latest.id,provider_state:state,
    snapshot_stable:stable,history:two.history,
    route_enabled:domain.enabled===true,
    shadow_d1_isolated:isolated,live_http_probes:probes});
  }
  report.status="OBSERVED_READONLY";
  report.incident_state=ambiguous?"MANUAL_REVIEW_REQUIRED":
   "STATE_IDENTIFIED_NO_MUTATION";
  report.code=ambiguous?
   "SOME_SHADOW_PROVIDER_DEPLOYMENT_STILL_UNKNOWN":
   "BOTH_SHADOW_PROVIDER_DEPLOYMENTS_RECONCILED_READONLY";
 }catch(e){
  const m=String(e?.message??"");
  report.code=/^STEP3_SHADOW_POST_FAILURE_[A-Z0-9_]+$/u.test(m)?
   m:"STEP3_SHADOW_POST_FAILURE_UNCLASSIFIED";
 }
 report.completed_at=new Date().toISOString();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync(RECEIPT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await diagnoseShadowAfterPromotion();
 if(report.status!=="OBSERVED_READONLY")process.exitCode=3;
}
