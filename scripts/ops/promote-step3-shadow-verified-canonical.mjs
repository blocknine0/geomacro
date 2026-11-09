#!/usr/bin/env node
/**
 * Two Shadow-only canonical version promotions after separate immutable
 * provider 404/401/400 proof. NEVER touches production Worker or production D1.
 * A failed partial rollout attempts safe rollback of the exact touched Shadow
 * deployments; unverified rollback is explicitly HOLD, not success.
 *
 * Provider mutation: POST /workers/scripts/<2 pinned shadow names>/deployments
 * only. No SQL, payment, R2/B2, secrets, routes, or canary HOLD mutation.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const BUCKET="geomacro-step3-shadow-private";
const SOURCE="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const DOMAIN="daspallab202391.workers.dev";
const TOKEN=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const WORKERS=Object.freeze([
 {name:"geomacro-step3-shadow",
  old:"48680b70-c41c-4af9-9e70-497213471dbb",
  next:"1a49e55d-7c82-42b6-9f30-250423d9732c",r2:true},
 {name:"geomacro-step3-shadow-legacy",
  old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  next:"f72738eb-40ff-4e48-ba67-1d5c004a989d",r2:false}
]);
const RECEIPT="artifacts/release/step3-shadow-dual-promotion-live-acceptance.json";
const fail=c=>{throw Error("STEP3_SHADOW_PROMOTION_"+c)};
const stable=o=>JSON.stringify(o,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);

export function assertPromotionScope(e,hold=true){
 if(!hold||e.GITHUB_ACTIONS!=="true"||
 e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
 e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 e.GITHUB_REF!=="refs/heads/main"||!SHA.test(e.GITHUB_SHA??"")||
 e.SHADOW_PROMOTION_APPROVAL!=="PROMOTE_TWO_PINNED_CANONICAL_SHADOW_VERSIONS_ONLY"||
 e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||(e.CLOUDFLARE_API_TOKEN??"").length<20||
 e.D1_DATABASE_ID!==PROD||e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
 e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==BUCKET||
 !TOKEN.test(e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??"")||
 e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==
 "geomacro-step3-shadow."+DOMAIN||
 e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==
 "geomacro-step3-shadow-legacy."+DOMAIN||
 e.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES")
 fail("EXACT_MAIN_OWNER_APPROVAL_SHADOW_ISOLATION_OR_HOLD_MISSING");
 return true;
}
function scopeWorker(w){
 if(!WORKERS.some(x=>x.name===w?.name&&x.next===w.next&&x.old===w.old))
  fail("WORKER_OR_VERSION_NOT_PINNED");
 return w;
}
async function api(e,path,{method="GET",body,fetchImpl=fetch}={}){
 const getAllowed=new Set(["/d1/database/"+PROD,"/d1/database/"+SHADOW]);
 const postAllowed=new Set();
 for(const w of WORKERS){
  const b="/workers/scripts/"+w.name;
  getAllowed.add(b+"/deployments");
  getAllowed.add(b+"/subdomain");
  getAllowed.add(b+"/settings");
  getAllowed.add(b+"/versions/"+w.next);
  getAllowed.add(b+"/versions/"+w.old);
  getAllowed.add("/workers/workers/"+w.name+"/versions/"+w.next);
  postAllowed.add(b+"/deployments");
 }
 if(!(method==="GET"&&getAllowed.has(path))&&
    !(method==="POST"&&postAllowed.has(path)))
  fail("UNEXPECTED_PROVIDER_MUTATION_OR_PATH");
 if(method==="POST"){
  const version=WORKERS.find(x=>path==="/workers/scripts/"+x.name+"/deployments");
  if(!version||body?.strategy!=="percentage"||
     !Array.isArray(body?.versions)||body.versions.length!==1||
     Number(body.versions[0]?.percentage)!==100||
     ![version.old,version.next].includes(body.versions[0]?.version_id))
   fail("POST_BODY_OUTSIDE_PINNED_ROLLBACK_OR_PROMOTION");
 }
 let r;
 try{r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+path,{
   method,redirect:"error",cache:"no-store",headers:{
    Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN,
    ...(method==="POST"?{"Content-Type":"application/json"}:{})
   },
   ...(method==="POST"?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(16000)
  })}
 catch{fail("PROVIDER_"+method+"_NETWORK_UNAVAILABLE")}
 if(!r||r.redirected||![200,201].includes(r.status))
  fail("PROVIDER_"+method+"_HTTP_"+(r?.status??0));
 let d;try{d=await r.json()}catch{fail("PROVIDER_"+method+"_BAD_JSON")}
 if(d?.success!==true||d.result==null)
  fail("PROVIDER_"+method+"_REJECTED_OR_NO_RESULT");
 return d.result;
}
function matchDatabase(result,uuid,name){
 if(result?.uuid?.toLowerCase()!==uuid||result.name!==name)
  fail("PROVIDER_D1_UUID_NAME_MISMATCH");
}
function bindingCheck(bindings,w){
 scopeWorker(w);
 if(!Array.isArray(bindings)||!bindings.length||
    new Set(bindings.map(b=>b.name)).size!==bindings.length)
  fail("MISSING_OR_DUPLICATE_BINDINGS");
 const d1=bindings.filter(b=>b.type==="d1");
 if(d1.length!==1||d1[0].name!=="DB"||
   d1[0].database_id?.toLowerCase()!==SHADOW||
   bindings.some(b=>b.type==="d1"&&b.database_id?.toLowerCase()===PROD))
  fail("SHADOW_VS_PRODUCTION_D1_ISOLATION_FAILURE");
 if(bindings.filter(b=>b.name==="CONTROL_PLANE_TOKEN"&&
   b.type==="secret_text").length!==1)
  fail("SHADOW_ADMIN_TOKEN_BINDING_NOT_PRESENT");
 if(bindings.filter(b=>b.name==="GEOMACRO_SOURCE_SHA"&&
   b.type==="plain_text"&&b.text===SOURCE).length!==1)
  fail("CANONICAL_SOURCE_SHA_DRIFT");
 const r2=bindings.filter(b=>b.name==="PHASE2H_PRIVATE_R2");
 if(w.r2&&!(r2.length===1&&r2[0].type==="r2_bucket"&&
   r2[0].bucket_name===BUCKET))
  fail("SHADOW_PRIVATE_R2_BINDING_DRIFT");
 if(!w.r2&&r2.length!==0)
  fail("UNREVIEWED_LEGACY_R2_BINDING");
 return true;
}
function deployedId(deploy){
 const a=deploy?.deployments?.[0]?.versions;
 if(!Array.isArray(a)||a.length!==1||Number(a[0].percentage)!==100||
    !UUID.test(a[0].version_id??""))
  fail("DEPLOYMENT_IS_NOT_SINGLE_100_PERCENT");
 return a[0].version_id;
}
export function strictVersionHost(w,urls){
 scopeWorker(w);
 if(!Array.isArray(urls)||urls.length>8)
  return {ok:false,reason:"PROVIDER_VERSION_URL_MISSING_OR_UNBOUNDED"};
 const pat=new RegExp("^[a-f0-9]{8}-"+w.name+
  "\\.daspallab202391\\.workers\\.dev$","u");
 const accepted=[];
 for(const raw of urls){
  if(typeof raw!=="string")continue;
  let u;try{u=new URL(raw)}catch{continue}
  if(u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
     u.pathname==="/"&&!u.search&&!u.hash&&pat.test(u.hostname))
   accepted.push(u.hostname);
 }
 return accepted.length===1?{ok:true,host:accepted[0]}:
  {ok:false,reason:"NO_UNIQUE_PROVIDER_VERSION_HOST"};
}
export async function probeHttp(w,{host,kind,token,fetchImpl=fetch,immutable=false}={}){
 scopeWorker(w);
 const expectedHost=immutable?strictVersionHost(w,["https://"+host]):
  {ok:host===w.name+"."+DOMAIN};
 if(!expectedHost.ok)fail("HTTP_PROBE_HOST_NOT_PINNED");
 if(!["PUBLIC_404","INVALID_401","VALID_400"].includes(kind))
  fail("HTTP_PROBE_KIND_NOT_ALLOWED");
 if(kind==="VALID_400"&&!TOKEN.test(token??""))fail("VALID_BEARER_ABSENT");
 const url="https://"+host+(kind==="PUBLIC_404"?
   "/v1/public/intelligence-publications":
   "/v1/internal/p0b/status?deep=invalid");
 let r;try{r=await fetchImpl(url,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json",
    Authorization:"Bearer "+(kind==="VALID_400"?token:"invalid")},
   signal:AbortSignal.timeout(16000)
  })}catch{return {verified:false,reason:"HTTP_NETWORK_FAILURE"}}
 if(!r||r.redirected)return {verified:false,reason:"HTTP_REDIRECT"};
 const status=r.status;
 const ct=String(r.headers?.get("content-type")??"").toLowerCase();
 if(r.headers?.get("cf-mitigated")==="challenge"||
   !ct.includes("application/json"))
  return {verified:false,http_status:status,reason:"CLOUDFLARE_CHALLENGE_OR_NON_JSON"};
 const len=Number(r.headers?.get("content-length")??0);
 if(!Number.isFinite(len)||len>4096)
  return {verified:false,http_status:status,reason:"BODY_TOO_LARGE"};
 let raw;try{raw=await r.text()}catch{
  return {verified:false,http_status:status,reason:"BODY_UNAVAILABLE"}}
 if(raw.length>4096)
  return {verified:false,http_status:status,reason:"BODY_TOO_LARGE"};
 let j;try{j=JSON.parse(raw)}catch{
  return {verified:false,http_status:status,reason:"BODY_NOT_JSON"}}
 const exp=kind==="PUBLIC_404"?{code:404,error:"NOT_FOUND"}:
   kind==="INVALID_401"?{code:401,error:"UNAUTHORIZED"}:
   {code:400,error:"P0B_STATUS_QUERY_INVALID"};
 const verified=status===exp.code&&j?.ok===false&&j?.error===exp.error;
 return {verified,http_status:status,
  verified_error:verified?exp.error:"UNEXPECTED_JSON"};
}
async function threeProbes(w,host,token,fetchImpl,immutable){
 const out=[];
 for(const kind of ["PUBLIC_404","INVALID_401","VALID_400"])
  out.push({kind,...await probeHttp(w,{host,kind,token,fetchImpl,immutable})});
 return out;
}
/** Edge propagation can briefly serve the previous Shadow version.
 * Retry only the same three fixed no-D1 read-only contracts.
 */
async function probeLiveWithBoundedRetry(w,token,fetchImpl,sleep){
 let last=[];
 for(let attempt=1;attempt<=5;attempt++){
  last=await threeProbes(w,w.name+"."+DOMAIN,token,fetchImpl,false);
  if(last.every(x=>x.verified))return {attempts:attempt,probes:last,verified:true};
  if(attempt<5)await sleep(2000);
 }
 return {attempts:5,probes:last,verified:false};
}
async function preflight(e,w,fetchImpl){
 const base="/workers/scripts/"+w.name;
 const [d,domain,settings,v,imm]=await Promise.all([
  api(e,base+"/deployments",{fetchImpl}),
  api(e,base+"/subdomain",{fetchImpl}),
  api(e,base+"/settings",{fetchImpl}),
  api(e,base+"/versions/"+w.next,{fetchImpl}),
  api(e,"/workers/workers/"+w.name+"/versions/"+w.next,{fetchImpl})
 ]);
 if(deployedId(d)!==w.old||domain.enabled!==true||
   domain.previews_enabled!==true||
   v.id!==w.next||imm.id!==w.next||imm.main_module!=="index.js")
  fail("OLD_100_PERCENT_OR_IMMUTABLE_CANDIDATE_ID_MISMATCH");
 bindingCheck(v.resources?.bindings,w);
 const activeBindings=settings.bindings;
 if(!Array.isArray(activeBindings)||activeBindings.filter(b=>
  b.name==="DB"&&b.type==="d1"&&b.database_id===SHADOW).length!==1)
  fail("EFFECTIVE_SHADOW_SETTINGS_NOT_VERIFIED");
 const url=strictVersionHost(w,imm.urls);
 if(!url.ok)fail("IMMUTABLE_URL_UNVERIFIED");
 const probes=await threeProbes(w,url.host,
  e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl,true);
 if(!probes.every(p=>p.verified))fail("IMMUTABLE_AUTH_CONTRACT_NOT_VERIFIED");
 return {newBindings:v.resources.bindings,oldDeploymentId:d.deployments?.[0]?.id,
   versionUrlVerified:true,probes};
}
async function deployOne(e,w,versionId,fetchImpl){
 scopeWorker(w);
 const path="/workers/scripts/"+w.name+"/deployments";
 const body={strategy:"percentage",versions:[{version_id:versionId,percentage:100}],
  annotations:{"workers/message":"geomacro-step3-shadow-only-verified-candidate"}};
 return api(e,path,{method:"POST",body,fetchImpl});
}
async function readback(e,w,id,fetchImpl){
 const d=await api(e,"/workers/scripts/"+w.name+"/deployments",{fetchImpl});
 if(deployedId(d)!==id)fail("DEPLOYMENT_READBACK_WRONG_IMMUTABLE_VERSION");
 return d;
}
export async function promoteShadowOnly({env=process.env,fetchImpl=fetch,
 holdPresent=existsSync("config/d1-hotspot-v2-canary.hold"),
 sleep=ms=>new Promise(r=>setTimeout(r,ms)),
 headCheck=()=>execFileSync("git",
  ["ls-remote","https://github.com/blocknine0/geomacro.git","refs/heads/main"],
  {encoding:"utf8"}).trim().split(/\s/u)[0]}={}){
 const receipt={schema:"geomacro.step3.shadow-dual-canonical-promotion.v1",
  status:"HOLD",code:"NOT_STARTED",main_sha:env.GITHUB_SHA??null,
  canonical_source_sha:SOURCE,owner_approval:true,
  scope:"TWO_PINNED_SHADOW_WORKERS_ONLY",canary_hold_removed:false,
  production_worker_changed:false,production_d1_mutated:false,
  shadow_d1_mutated:false,b2_or_r2_written:false,payments_authorized:false,
  shadow_traffic_changed:false,rollback_fully_verified:null,workers:[]};
 const touched=[];
 try{
  assertPromotionScope(env,holdPresent);
  if(headCheck()!==env.GITHUB_SHA)fail("EXACT_MAIN_SHA_CHANGED");
  const [prod,shadow]=await Promise.all([
   api(env,"/d1/database/"+PROD,{fetchImpl}),
   api(env,"/d1/database/"+SHADOW,{fetchImpl})
  ]);
  matchDatabase(prod,PROD,"geomacro-control-plane");
  matchDatabase(shadow,SHADOW,"geomacro-d1-publisher-shadow");
  const prepared=[];
  // BOTH full physical preflights before ANY deployment change.
  for(const w of WORKERS)
   prepared.push({w,ready:await preflight(env,w,fetchImpl)});
  for(const {w} of prepared){
   if(headCheck()!==env.GITHUB_SHA)
    fail("MAIN_SHA_MOVED_DURING_DUAL_PROMOTION");
   const now=await api(env,"/workers/scripts/"+w.name+"/deployments",{fetchImpl});
   if(deployedId(now)!==w.old)fail("CONCURRENT_SHADOW_DEPLOYMENT_CHANGE");
   // Track the attempted mutation before POST, even if its HTTP ACK is lost.
   touched.push(w);
   await deployOne(env,w,w.next,fetchImpl);
   receipt.shadow_traffic_changed=true;
   await readback(env,w,w.next,fetchImpl);
   const observed=await probeLiveWithBoundedRetry(w,
      env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl,sleep);
   receipt.workers.push({script:w.name,previous_version:w.old,
    canonical_version:w.next,promoted_100_percent:true,
    live_404_401_400_verified:observed.verified,
    edge_propagation_probe_attempts:observed.attempts,
    live_probes:observed.probes});
   if(!observed.verified)fail("LIVE_SHADOW_HOST_HTTP_CONTRACT_FAILED");
  }
  // A contemporaneous final provider deployment readback prevents a
  // concurrent Shadow release being disguised as a verified dual release.
  for(const w of WORKERS)await readback(env,w,w.next,fetchImpl);
  if(headCheck()!==env.GITHUB_SHA)
    fail("MAIN_SHA_MOVED_BEFORE_FINAL_RELEASE_RECEIPT");
  receipt.status="PASS_BOTH_SHADOW_ONLY_WORKERS_CANONICAL_LIVE";
  receipt.code="TWO_SHADOW_100_PERCENT_VERSIONS_AND_404_401_400_HTTP_VERIFIED";
  receipt.rollback_fully_verified=null;
 }catch(err){
  const m=String(err?.message??"");
  receipt.code=/^STEP3_SHADOW_PROMOTION_[A-Z0-9_]+$/u.test(m)?
   m:"STEP3_SHADOW_PROMOTION_UNCLASSIFIED_HOLD";
  if(touched.length){
   const recovery=[];
   for(const w of [...touched].reverse()){
    const row={script:w.name,original_version:w.old,
      rollback_verified:false,manual_review_required:false};
    try{
     const now=await api(env,"/workers/scripts/"+w.name+"/deployments",{fetchImpl});
     const active=deployedId(now);
     if(active===w.next){
      await deployOne(env,w,w.old,fetchImpl);
      await readback(env,w,w.old,fetchImpl);
      row.rollback_verified=true;
     }else if(active===w.old){
      row.rollback_verified=true;
     }else{
      row.manual_review_required=true;
     }
    }catch{
     row.manual_review_required=true;
    }
    recovery.push(row);
   }
   receipt.recovery=recovery;
   receipt.rollback_fully_verified=recovery.length===touched.length&&
     recovery.every(x=>x.rollback_verified);
   if(!receipt.rollback_fully_verified)
    receipt.code+="_AND_ROLLBACK_REQUIRES_MANUAL_REVIEW";
   // A successful rollback is still HOLD, not a promotion PASS.
   receipt.status="HOLD";
   receipt.shadow_traffic_changed=!receipt.rollback_fully_verified;
  }
 }
 receipt.completed_at=new Date().toISOString();
 mkdirSync(resolve(RECEIPT,".."),{recursive:true,mode:0o700});
 writeFileSync(RECEIPT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const r=await promoteShadowOnly();
 if(r.status!=="PASS_BOTH_SHADOW_ONLY_WORKERS_CANONICAL_LIVE")
  process.exitCode=3;
}
