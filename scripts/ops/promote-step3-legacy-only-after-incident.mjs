#!/usr/bin/env node
/**
 * Complete the ONE remaining isolated Legacy Shadow Worker promotion.
 * Prior run 42583282859 applied Modern canonical version successfully,
 * independently verified in read-only run 42584512855. Do NOT touch Modern.
 *
 * Allow exactly one provider write: POST to legacy Shadow deployments with
 * pinned canonical immutable version at 100%. Bounded GET eventual-consistency
 * polling avoids misleading immediate-readback rollback.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const BUCKET="geomacro-step3-shadow-private";
const SOURCE="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const DOMAIN="daspallab202391.workers.dev";
const MODERN={name:"geomacro-step3-shadow",
 target:"1a49e55d-7c82-42b6-9f30-250423d9732c"};
const LEGACY={name:"geomacro-step3-shadow-legacy",
 old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
 target:"f72738eb-40ff-4e48-ba67-1d5c004a989d"};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const TOKEN=/^[a-f0-9]{64}$/u;
const OUT="artifacts/release/step3-legacy-only-live-reconciliation.json";
const err=x=>{throw Error("STEP3_LEGACY_ONLY_"+x)};
const silentHeaders=token=>({Authorization:"Bearer "+token});
export function assertLegacyScope(e,hold=true){
 if(!hold||e.GITHUB_ACTIONS!=="true"||
  e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
  e.GITHUB_REF!=="refs/heads/main"||!SHA.test(e.GITHUB_SHA??"")||
  e.STEP3_LEGACY_APPROVAL!=="PROMOTE_ONLY_VERIFIED_LEGACY_SHADOW_AFTER_MODERN_PROOF"||
  e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||(e.CLOUDFLARE_API_TOKEN??"").length<20||
  e.D1_DATABASE_ID!==PROD||e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
  e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==BUCKET||
  e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==MODERN.name+"."+DOMAIN||
  e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==LEGACY.name+"."+DOMAIN||
  e.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
  !TOKEN.test(e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??""))
   err("EXACT_MAIN_APPROVAL_AND_ACCOUNT_ISOLATION_REQUIRED");
 return true;
}
function providerScope(path,method,body){
 const allowed=new Set(["/d1/database/"+PROD,"/d1/database/"+SHADOW]);
 for(const w of [MODERN,LEGACY]){
  const root="/workers/scripts/"+w.name;
  allowed.add(root+"/deployments");
  allowed.add(root+"/subdomain");
  allowed.add(root+"/settings");
 }
 allowed.add("/workers/scripts/"+LEGACY.name+"/versions/"+LEGACY.target);
 allowed.add("/workers/workers/"+LEGACY.name+"/versions/"+LEGACY.target);
 if(method==="GET"&&allowed.has(path))return;
 if(method==="POST"&&path==="/workers/scripts/"+LEGACY.name+"/deployments"&&
   body?.strategy==="percentage"&&
   Array.isArray(body.versions)&&body.versions.length===1&&
   body.versions[0].version_id===LEGACY.target&&
   body.versions[0].percentage===100)return;
 err("PROVIDER_METHOD_OR_TARGET_OUTSIDE_ALLOWLIST");
}
async function provider(e,path,{method="GET",body,fetchImpl=fetch}={}){
 providerScope(path,method,body);
 let r;
 try{r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
   ACCOUNT+path,{method,redirect:"error",cache:"no-store",
   headers:{...silentHeaders(e.CLOUDFLARE_API_TOKEN),
     ...(method==="POST"?{"Content-Type":"application/json"}:{})},
   ...(method==="POST"?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(15000)})}
 catch{return {ok:false,reason:"PROVIDER_"+method+"_NETWORK_UNAVAILABLE"}}
 if(!r||r.redirected||![200,201].includes(r.status))
  return {ok:false,reason:"PROVIDER_"+method+"_HTTP_"+(r?.status??0)};
 let j;try{j=await r.json()}catch{
  return {ok:false,reason:"PROVIDER_BAD_JSON"}}
 if(j?.success!==true||j.result==null)
  return {ok:false,reason:"PROVIDER_RESULT_NOT_VERIFIED"};
 return {ok:true,data:j.result};
}
async function requireRead(e,path,fetchImpl){
 const d=await provider(e,path,{fetchImpl});
 if(!d.ok)err(d.reason);
 return d.data;
}
function activeDeploy(d){
 const dep=d?.deployments?.[0];
 if(!UUID.test(dep?.id??"")||!Array.isArray(dep.versions)||
   dep.versions.length!==1||
   Number(dep.versions[0]?.percentage)!==100||
   !UUID.test(dep.versions[0]?.version_id??""))
  err("SINGLE_100_DEPLOYMENT_NOT_VERIFIED");
 return {deployment_id:dep.id,version_id:dep.versions[0].version_id,
  percentage:100};
}
async function readActive(e,w,fetchImpl){
 return activeDeploy(await requireRead(e,
  "/workers/scripts/"+w.name+"/deployments",fetchImpl));
}
function checkBindings(bindings,modern=false){
 if(!Array.isArray(bindings)||!bindings.length||
    new Set(bindings.map(b=>b.name)).size!==bindings.length)
   err("BINDINGS_MISSING_DUPLICATED");
 const db=bindings.filter(b=>b.type==="d1");
 if(db.length!==1||db[0].name!=="DB"||
   db[0].database_id?.toLowerCase()!==SHADOW||
   bindings.some(b=>b.type==="d1"&&b.database_id?.toLowerCase()===PROD))
   err("D1_PRODUCTION_BINDING_LEAK_OR_SHADOW_MISSING");
 if(bindings.filter(b=>b.name==="CONTROL_PLANE_TOKEN"&&
   b.type==="secret_text").length!==1)
   err("CONTROL_PLANE_TOKEN_BINDING_MISSING");
 if(modern&&bindings.filter(b=>b.name==="PHASE2H_PRIVATE_R2"&&
   b.type==="r2_bucket"&&b.bucket_name===BUCKET).length!==1)
   err("MODERN_SHADOW_R2_BINDING_MISSING");
}
export function versionHost(urls){
 if(!Array.isArray(urls)||urls.length>8)return null;
 const re=/^[a-f0-9]{8}-geomacro-step3-shadow-legacy\.daspallab202391\.workers\.dev$/u;
 const candidates=[];
 for(const raw of urls){
  if(typeof raw!=="string")continue;
  let u;try{u=new URL(raw)}catch{continue}
  if(u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
    u.pathname==="/"&&!u.search&&!u.hash&&re.test(u.hostname))
    candidates.push(u.hostname);
 }
 return candidates.length===1?candidates[0]:null;
}
async function probe(w,host,kind,token,fetchImpl){
 if(![MODERN.name,LEGACY.name].includes(w.name)||
  typeof host!=="string"||
  !([MODERN.name+"."+DOMAIN,LEGACY.name+"."+DOMAIN].includes(host)||
    (w.name===LEGACY.name&&versionHost(["https://"+host])===host)))
   err("PROBE_HOST_OUTSIDE_ISOLATED_ALLOWLIST");
 if(!["public","invalid","valid"].includes(kind))err("PROBE_KIND_NOT_ALLOWED");
 const route=kind==="public"?"/v1/public/intelligence-publications":
   "/v1/internal/p0b/status?deep=invalid";
 let r;try{r=await fetchImpl("https://"+host+route,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+(kind==="valid"?token:"invalid"),
    Accept:"application/json"},signal:AbortSignal.timeout(16000)})}
 catch{return {verified:false,reason:"NETWORK_UNAVAILABLE"}}
 if(!r||r.redirected)return {verified:false,reason:"REDIRECT"};
 const status=r.status,ct=String(r.headers?.get("content-type")??"").toLowerCase();
 if(!ct.includes("application/json")||
  r.headers?.get("cf-mitigated")==="challenge")
  return {verified:false,http_status:status,reason:"NON_JSON_OR_CHALLENGE"};
 const len=Number(r.headers?.get("content-length")??0);
 if(!Number.isFinite(len)||len>4096)
  return {verified:false,http_status:status,reason:"OVERSIZED_JSON"};
 let body;try{body=await r.text()}catch{
  return {verified:false,http_status:status,reason:"BODY_UNREADABLE"}}
 if(body.length>4096)return {verified:false,reason:"OVERSIZED_JSON"};
 let j;try{j=JSON.parse(body)}catch{
  return {verified:false,http_status:status,reason:"INVALID_JSON"}}
 const spec=kind==="public"?{http:404,error:"NOT_FOUND"}:
  kind==="invalid"?{http:401,error:"UNAUTHORIZED"}:
  {http:400,error:"P0B_STATUS_QUERY_INVALID"};
 const ok=status===spec.http&&j?.ok===false&&j?.error===spec.error;
 return {verified:ok,http_status:status,error_category:ok?spec.error:"UNEXPECTED_JSON"};
}
async function proofTriple(w,host,token,fetchImpl){
 const p=[];
 for(const kind of ["public","invalid","valid"])
  p.push({kind,...await probe(w,host,kind,token,fetchImpl)});
 return p;
}
async function preflight(e,fetchImpl){
 const [prod,shadow]=await Promise.all([
  requireRead(e,"/d1/database/"+PROD,fetchImpl),
  requireRead(e,"/d1/database/"+SHADOW,fetchImpl)
 ]);
 if(prod.uuid?.toLowerCase()!==PROD||prod.name!=="geomacro-control-plane"||
   shadow.uuid?.toLowerCase()!==SHADOW||
   shadow.name!=="geomacro-d1-publisher-shadow")
   err("D1_IDENTITY_UNVERIFIED");
 const [modern,legacy]=await Promise.all([
  readActive(e,MODERN,fetchImpl),
  readActive(e,LEGACY,fetchImpl)
 ]);
 if(modern.version_id!==MODERN.target)
   err("MODERN_VERIFIED_CANONICAL_NO_LONGER_LIVE");
 if(legacy.version_id!==LEGACY.old)
   err("LEGACY_EXPECTED_OLD_100_NO_LONGER_ACTIVE");
 const [modernDomain,legacyDomain,modernSettings,legacySettings,
  candidate,version] = await Promise.all([
  requireRead(e,"/workers/scripts/"+MODERN.name+"/subdomain",fetchImpl),
  requireRead(e,"/workers/scripts/"+LEGACY.name+"/subdomain",fetchImpl),
  requireRead(e,"/workers/scripts/"+MODERN.name+"/settings",fetchImpl),
  requireRead(e,"/workers/scripts/"+LEGACY.name+"/settings",fetchImpl),
  requireRead(e,"/workers/scripts/"+LEGACY.name+"/versions/"+LEGACY.target,fetchImpl),
  requireRead(e,"/workers/workers/"+LEGACY.name+"/versions/"+LEGACY.target,fetchImpl)
 ]);
 if(modernDomain.enabled!==true||legacyDomain.enabled!==true||
  legacyDomain.previews_enabled!==true)err("SHADOW_ROUTE_NOT_ENABLED");
 checkBindings(modernSettings.bindings,true);
 checkBindings(legacySettings.bindings,false);
 if(candidate.id!==LEGACY.target||version.id!==LEGACY.target||
   version.main_module!=="index.js")
   err("LEGACY_CANONICAL_VERSION_NOT_MATCHED");
 checkBindings(candidate.resources?.bindings,false);
 if(candidate.resources.bindings.filter(b=>b.name==="GEOMACRO_SOURCE_SHA"&&
   b.type==="plain_text"&&b.text===SOURCE).length!==1)
   err("LEGACY_SOURCE_SHA_NOT_PINNED");
 const host=versionHost(version.urls);
 if(!host)err("IMMUTABLE_VERSION_HOST_UNAVAILABLE");
 const token=e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN;
 const [modernProbe,legacyProbe]=await Promise.all([
  proofTriple(MODERN,MODERN.name+"."+DOMAIN,token,fetchImpl),
  proofTriple(LEGACY,host,token,fetchImpl)
 ]);
 if(!modernProbe.every(p=>p.verified))
   err("MODERN_100_LIVE_AUTH_PROOF_MISSING");
 if(!legacyProbe.every(p=>p.verified))
   err("LEGACY_IMMUTABLE_404_401_400_NOT_VERIFIED");
 return {modern,legacy,modernProbe,legacyProbe};
}
async function finalRead(e,fetchImpl){
 const [modern,legacy]=await Promise.all([
  readActive(e,MODERN,fetchImpl),readActive(e,LEGACY,fetchImpl)
 ]);
 return {modern,legacy};
}
export async function promoteOnlyLegacy({
 env=process.env,fetchImpl=fetch,
 sleep=ms=>new Promise(r=>setTimeout(r,ms)),
 headCheck=()=>execFileSync("git",["ls-remote",
  "https://github.com/blocknine0/geomacro.git","refs/heads/main"],
  {encoding:"utf8"}).trim().split(/\s/u)[0],
 holdPresent=existsSync("config/d1-hotspot-v2-canary.hold")
}={}){
 const r={schema:"geomacro.step3.legacy-only-canonical-completion.v1",
  status:"HOLD",code:"NOT_STARTED",main_sha:env.GITHUB_SHA??null,
  source_incident_run:42583282859,independent_reconciliation_run:42584512855,
  scope:"ONE_LEGACY_SHADOW_DEPLOYMENT_ONLY",
  modern_target_version:MODERN.target,legacy_target_version:LEGACY.target,
  provider_post_attempted:false,provider_post_acknowledged:false,
  modern_deployment_changed_by_workflow:false,
  production_worker_changed:false,production_d1_mutated:false,
  shadow_d1_mutated:false,b2_or_r2_written:false,
  payments_authorized:false,canary_hold_removed:false,
  legacy_promotion_verified:false,workers:[]};
 try{
  assertLegacyScope(env,holdPresent);
  if(headCheck()!==env.GITHUB_SHA)err("MAIN_SHA_MOVED");
  const ready=await preflight(env,fetchImpl);
  r.workers.push({script:MODERN.name,unchanged_by_workflow:true,
   verified_current_version:ready.modern.version_id,
   expected_json_guards:ready.modernProbe.map(p=>p.verified),
   no_deployment_action:true});
  r.workers.push({script:LEGACY.name,prior_version:ready.legacy.version_id,
   immutable_guard_verified:true,provider_post_attempted:false});
  // Re-evaluate both before one and only one Cloudflare POST; no race bypass.
  if(headCheck()!==env.GITHUB_SHA)err("MAIN_SHA_MOVED_BEFORE_POST");
  const same=await finalRead(env,fetchImpl);
  if(same.modern.version_id!==MODERN.target||
     same.legacy.version_id!==LEGACY.old)
    err("SHADOW_DEPLOYMENT_CONCURRENT_DRIFT");
  r.provider_post_attempted=true;
  r.workers[1].provider_post_attempted=true;
  const deploy=await provider(env,
   "/workers/scripts/"+LEGACY.name+"/deployments",{
    method:"POST",body:{strategy:"percentage",
     versions:[{version_id:LEGACY.target,percentage:100}],
     annotations:{"workers/message":"geomacro-step3-legacy-only-recovered-after-42583282859"}},
    fetchImpl
  });
  r.provider_post_acknowledged=deploy.ok&&UUID.test(deploy.data?.id??"");
  r.provider_post_reason=deploy.ok?"PROVIDER_ACK":deploy.reason;
  // Cloudflare deployment propagation is not instantaneous. Never overwrite
  // uncertain status or auto-rollback; continue bounded GET observation.
  let stableTarget=false,observations=[];
  for(let attempt=1;attempt<=10;attempt++){
   let current;try{current=await finalRead(env,fetchImpl)}
   catch(e){observations.push({attempt,result:"UNVERIFIED_PROVIDER_READ"});break}
   const modernOk=current.modern.version_id===MODERN.target;
   const legacyId=current.legacy.version_id;
   const status=modernOk&&legacyId===LEGACY.target?"TARGET_OBSERVED":
     modernOk&&legacyId===LEGACY.old?"OLD_STILL_OBSERVED":
     "UNKNOWN_OR_CONCURRENT_DEPLOYMENT";
   observations.push({attempt,result:status,
    modern_version_id:current.modern.version_id,
    legacy_version_id:legacyId});
   if(status==="TARGET_OBSERVED"){
    stableTarget=true;break;
   }
   if(status!=="OLD_STILL_OBSERVED")break;
   if(attempt<10)await sleep(2000);
  }
  r.deployment_observations=observations;
  if(!stableTarget)err("POST_RESULT_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED");
  let contract=null;
  for(let i=1;i<=10;i++){
   const live=await proofTriple(LEGACY,LEGACY.name+"."+DOMAIN,
    env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl);
   contract={attempt:i,probes:live,verified:live.every(x=>x.verified)};
   if(contract.verified)break;
   if(i<10)await sleep(2000);
  }
  r.workers[1].live_http=contract;
  if(!contract?.verified)err("LEGACY_ORDINARY_HOST_HTTP_NOT_VERIFIED");
  const last=await finalRead(env,fetchImpl);
  if(last.modern.version_id!==MODERN.target||
     last.legacy.version_id!==LEGACY.target)
    err("FINAL_DUAL_PROVIDER_VERSION_DRIFT");
  const modernGuard=await proofTriple(MODERN,MODERN.name+"."+DOMAIN,
    env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl);
  if(!modernGuard.every(p=>p.verified))
    err("FINAL_MODERN_404_401_400_GUARD_LOST");
  if(headCheck()!==env.GITHUB_SHA)err("FINAL_MAIN_SHA_MOVED");
  r.workers[0].expected_json_guards=modernGuard.map(p=>p.verified);
  r.workers[1].new_live_version=LEGACY.target;
  r.workers[1].live_provider_100_percent_verified=true;
  r.legacy_promotion_verified=true;
  r.status="PASS_BOTH_SHADOW_CANONICAL_LIVE_WITH_ONLY_LEGACY_MUTATION";
  r.code="MODERN_UNCHANGED_LEGACY_100_AND_BOTH_JSON_404_401_400_PASS";
 }catch(e){
  const s=String(e?.message??"");
  r.code=/^STEP3_LEGACY_ONLY_[A-Z0-9_]+$/u.test(s)?
    s:"STEP3_LEGACY_ONLY_UNCLASSIFIED_HOLD";
 }
 r.completed_at=new Date().toISOString();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync(OUT,JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(r));
 return r;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const r=await promoteOnlyLegacy();
 if(r.status!=="PASS_BOTH_SHADOW_CANONICAL_LIVE_WITH_ONLY_LEGACY_MUTATION")
  process.exitCode=3;
}
