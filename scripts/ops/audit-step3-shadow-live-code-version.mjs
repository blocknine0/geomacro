#!/usr/bin/env node
/** Exact-scoped read-only Shadow Worker deployed-version/code/HTTP audit.
 * It cannot change routes, versions, D1, R2/B2, secrets, payment or canary.
 * Never logs or persists Worker source, token, HTTP body or provider bindings.
 */
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const NAMES=Object.freeze(["geomacro-step3-shadow","geomacro-step3-shadow-legacy"]);
const SUBDOMAIN="daspallab202391";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const FILE="artifacts/release/step3-shadow-live-code-version-audit.json";
const fail=code=>{throw Error("STEP3_SHADOW_CODE_"+code)};

export function validateReadonlyScope(e,holdPresent=true){
 if(!holdPresent||e.GITHUB_ACTIONS!=="true"||
   e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   e.GITHUB_REF!=="refs/heads/main"||
   !SHA.test(e.GITHUB_SHA??"")||
   e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
   (e.CLOUDFLARE_API_TOKEN??"").length<20||
   e.D1_DATABASE_ID!==PROD||
   e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
   e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==
    NAMES[0]+"."+SUBDOMAIN+".workers.dev"||
   e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==
    NAMES[1]+"."+SUBDOMAIN+".workers.dev")
   fail("EXACT_MAIN_READONLY_SCOPE_UNVERIFIED");
 return true;
}
async function getJson(e,path,fetchImpl){
 if(!/^\/(?:workers\/(?:subdomain|scripts\/geomacro-step3-shadow(?:-legacy)?\/(?:subdomain|deployments|versions\/[a-f0-9-]{36}))|d1\/database\/[a-f0-9-]{36})$/u.test(path))
  fail("PROVIDER_PATH_OUTSIDE_ALLOWLIST");
 let r;try{r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+path,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
   signal:AbortSignal.timeout(14000)})}catch{fail("PROVIDER_NETWORK_UNAVAILABLE")}
 if(!r||r.redirected||r.status!==200)fail("PROVIDER_HTTP_"+(r?.status??0));
 let j;try{j=await r.json()}catch{fail("PROVIDER_JSON_INVALID")}
 if(j?.success!==true||j.result==null)fail("PROVIDER_RESULT_INVALID");
 return j.result;
}
export async function inspectDownloadedCode(e,name,{fetchImpl=fetch}={}){
 if(!NAMES.includes(name))fail("SCRIPT_NOT_ALLOWLISTED");
 let r;try{
  r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
   "/workers/scripts/"+name+"/content/v2",{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
    signal:AbortSignal.timeout(15000)});
 }catch{return {status:"UNAVAILABLE",reason:"CONTENT_PROVIDER_NETWORK_UNAVAILABLE"}}
 if(!r||r.redirected)return {status:"UNAVAILABLE",reason:"CONTENT_PROVIDER_REDIRECT"};
 if(r.status!==200)return {status:"UNAVAILABLE",reason:"CONTENT_PROVIDER_HTTP_"+r.status};
 const maxBytes=16*1024*1024;
 const size=Number(r.headers?.get("content-length")??0);
 if(!Number.isFinite(size)||size>maxBytes)return {status:"UNAVAILABLE",reason:"CONTENT_LENGTH_OUT_OF_BOUNDS"};
 const ct=String(r.headers?.get("content-type")??"").toLowerCase();
 if(ct.includes("application/json"))return {status:"UNAVAILABLE",reason:"CONTENT_PROVIDER_UNEXPECTED_JSON"};
 let buf;try{buf=await r.arrayBuffer()}catch{
  return {status:"UNAVAILABLE",reason:"CONTENT_DOWNLOAD_UNAVAILABLE"};
 }
 if(buf.byteLength<32||buf.byteLength>maxBytes)return {status:"UNAVAILABLE",reason:"CONTENT_BYTES_OUT_OF_BOUNDS"};
 const bytes=Buffer.from(buf);
 const source=bytes.toString("utf8"); // Intentionally memory-only.
 return {
   status:"CONTENT_ENDPOINT_READ_NOT_DEPLOYED_VERSION_CERTIFICATE",
   bytes:buf.byteLength,
   body_sha256:createHash("sha256").update(bytes).digest("hex"),
   markers:{
    root_auth:source.includes("CONTROL_PLANE_AUTH_UNCONFIGURED")&&source.includes("UNAUTHORIZED"),
    p0b_admin:source.includes("/v1/internal/p0b/status")&&source.includes("P0B_STATUS_QUERY_INVALID"),
    phase2h_ingress:source.includes("/v1/internal/phase2h-raw-news")
   }
 };
}
// Cloudflare's newer Workers version API supplies per-version immutable
// routable URLs, unlike the older scripts/{name}/versions metadata.
async function getDeployedVersionUrls(e,name,id,fetchImpl){
 if(!NAMES.includes(name)||!UUID.test(id))fail("VERSION_URL_SCOPE_INVALID");
 const path="/workers/workers/"+name+"/versions/"+id;
 let r;
 try{r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
  ACCOUNT+path,{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
  signal:AbortSignal.timeout(14000)})}
 catch{return {status:"UNAVAILABLE",reason:"VERSION_PROVIDER_NETWORK_UNAVAILABLE"}}
 if(!r||r.redirected)return {status:"UNAVAILABLE",reason:"VERSION_PROVIDER_REDIRECT"};
 if(r.status!==200)return {status:"UNAVAILABLE",reason:"VERSION_PROVIDER_HTTP_"+r.status};
 let v;try{v=await r.json()}catch{
  return {status:"UNAVAILABLE",reason:"VERSION_PROVIDER_INVALID_JSON"};
 }
 if(v?.success!==true||v.result?.id!==id||!Array.isArray(v.result?.urls))
  return {status:"UNAVAILABLE",reason:"VERSION_PROVIDER_RESULT_INVALID"};
 const allowed=[];
 for(const raw of v.result.urls.slice(0,8)){
  if(typeof raw!=="string")continue;
  let u;
  try{u=new URL(raw)}catch{continue}
  const hostPattern=new RegExp("^[a-f0-9]{8}-"+name+
     "\\."+SUBDOMAIN+"\\.workers\\.dev$","u");
  if(u.protocol!=="https:"||u.username||u.password||u.port||
    !hostPattern.test(u.hostname)||u.pathname!=="/"||u.search||u.hash||
    !u.hostname.startsWith(id.slice(0,8)+"-"))continue;
  allowed.push(u.hostname);
 }
 if(allowed.length!==1)return {status:"UNAVAILABLE",
  reason:"VERSION_PROVIDER_NO_UNIQUE_PINNED_URL"};
 return {status:"PINNED_URL_AVAILABLE",host:allowed[0]};
}
export async function probePinnedVersionUrl(name,id,host,{fetchImpl=fetch}={}){
 if(!NAMES.includes(name)||!UUID.test(id)||
   host!==id.slice(0,8)+"-"+name+"."+SUBDOMAIN+".workers.dev")
    fail("VERSION_PROBE_HOST_NOT_PINNED");
 return probeActualHost(name,{fetchImpl,hostOverride:host});
}
export async function probeActualHost(name,{fetchImpl=fetch,hostOverride=null}={}){
 if(hostOverride!==null&&
    (typeof hostOverride!=="string"||
     !/^[a-f0-9]{8}-geomacro-step3-shadow(?:-legacy)?\.daspallab202391\.workers\.dev$/u.test(hostOverride)))
   fail("PROBE_HOST_OUTSIDE_VERSION_ALLOWLIST");
 if(!NAMES.includes(name))fail("HOST_NOT_ALLOWLISTED");
 let r;
 try{r=await fetchImpl("https://"+(hostOverride??(name+"."+SUBDOMAIN+
  ".workers.dev"))+"/v1/internal/p0b/status?deep=invalid",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json",Authorization:"Bearer invalid"},
   signal:AbortSignal.timeout(12000)})
 }catch{return {status:"UNAVAILABLE",reason:"PUBLIC_HTTPS_CONNECT_FAILED"}}
 if(!r||r.redirected)return {status:"UNAVAILABLE",reason:"PUBLIC_HTTP_REDIRECT"};
 const response={status:"OBSERVED",http_status:r.status,
  json_type:String(r.headers?.get("content-type")??"").toLowerCase().includes("application/json"),
  cloudflare_challenge:r.headers?.get("cf-mitigated")==="challenge",
  expected_guard_verified:false};
 if(response.json_type){
  try{
   const body=await r.json();
   response.expected_guard_verified=r.status===401&&body?.ok===false&&
    body?.error==="UNAUTHORIZED";
   response.structured_error=
    ["UNAUTHORIZED","CONTROL_PLANE_AUTH_UNCONFIGURED","P0B_STATUS_QUERY_INVALID","NOT_FOUND"]
      .includes(body?.error)?body.error:"OTHER_OR_MISSING";
  }catch{response.structured_error="INVALID_JSON"}
 }
 // NEVER read non-JSON error pages, which may contain unsafe details.
 return response;
}
export async function auditShadowCode({env=process.env,fetchImpl=fetch,holdPresent=existsSync("config/d1-hotspot-v2-canary.hold")}={}){
 const report={schema:"geomacro.step3.shadow-live-code-version-audit.v1",
   status:"HOLD",code:"NOT_STARTED",main_sha:env.GITHUB_SHA??null,
   read_only:true,production_worker_mutated:false,
   production_d1_mutated:false,shadow_worker_mutated:false,canary_hold_removed:false,
   payments_authorized:false,workers:[]};
 try{
  validateReadonlyScope(env,holdPresent);
  const [acc,prod,shadow]=await Promise.all([
   getJson(env,"/workers/subdomain",fetchImpl),
   getJson(env,"/d1/database/"+PROD,fetchImpl),
   getJson(env,"/d1/database/"+SHADOW,fetchImpl)
  ]);
  if(acc.subdomain!==SUBDOMAIN||
    prod.uuid?.toLowerCase()!==PROD||prod.name!=="geomacro-control-plane"||
    shadow.uuid?.toLowerCase()!==SHADOW||shadow.name!=="geomacro-d1-publisher-shadow")
    fail("ACCOUNT_OR_D1_PROVIDER_IDENTITY_DIVERGED");
  for(const name of NAMES){
   const base="/workers/scripts/"+name;
   const [subdomain,deployments]=await Promise.all([
    getJson(env,base+"/subdomain",fetchImpl),
    getJson(env,base+"/deployments",fetchImpl)
   ]);
   const active=deployments.deployments?.[0]?.versions;
   if(typeof subdomain.enabled!=="boolean"||typeof subdomain.previews_enabled!=="boolean"||
      !Array.isArray(active)||active.length!==1||
      Number(active[0]?.percentage)!==100||!UUID.test(active[0]?.version_id??""))
    fail("ROUTE_OR_DEPLOYMENT_METADATA_UNVERIFIED");
   const version=await getJson(env,base+"/versions/"+active[0].version_id,fetchImpl);
   if(version.id!==active[0].version_id||!Array.isArray(version.resources?.bindings))
    fail("DEPLOYED_VERSION_METADATA_INVALID");
   const bindings=version.resources.bindings;
   if(bindings.filter(b=>b.type==="d1"&&b.name==="DB"&&
       b.database_id?.toLowerCase()===SHADOW).length!==1||
      bindings.some(b=>b.type==="d1"&&b.database_id?.toLowerCase()===PROD))
    fail("VERSION_NOT_ISOLATED_FROM_PRODUCTION_D1");
   const content=await inspectDownloadedCode(env,name,{fetchImpl});
   const publicProbe=await probeActualHost(name,{fetchImpl});
   const versionUrl=await getDeployedVersionUrls(env,name,active[0].version_id,fetchImpl);
   // Never construct a URL from a guessed version ID: use only exact
   // provider-returned immutable URL whose host is strictly pinned.
   const versionProbe=versionUrl.status==="PINNED_URL_AVAILABLE"?
     await probePinnedVersionUrl(name,active[0].version_id,versionUrl.host,{fetchImpl}):
     {status:"UNAVAILABLE",reason:versionUrl.reason};
   report.workers.push({
    script:name,route_enabled:subdomain.enabled,
    previews_enabled:subdomain.previews_enabled,
    deployed_version_id:active[0].version_id,
    deployed_fetch_handler:Array.isArray(version.resources?.script?.handlers)?
      version.resources.script.handlers.includes("fetch"):null,
    deployed_script_etag:typeof version.resources?.script?.etag==="string"?
      version.resources.script.etag:null,
    provider_content_endpoint:content,
    http_probe:publicProbe,
    version_url_provenance:{status:versionUrl.status,
      ...(versionUrl.reason?{reason:versionUrl.reason}:{}),
      immutable_version_id_match:versionUrl.status==="PINNED_URL_AVAILABLE"},
    immutable_version_http_probe:versionProbe
   });
  }
  report.status=report.workers.every(w=>w.route_enabled&&
     w.deployed_fetch_handler===true&&w.http_probe.expected_guard_verified)?
    "PASS_READONLY_ROUTE_CODE_BOUNDARY_NOT_AUTHENTICATED":
    "HOLD";
  const versionReady=report.workers.every(w=>
    w.immutable_version_http_probe.expected_guard_verified===true);
  const productionRoute404=report.workers.every(w=>
    w.http_probe.http_status===404&&!w.http_probe.json_type);
  report.code=report.status.startsWith("PASS")?
    "BOTH_SHADOW_ADMIN_AUTH_GUARDS_REACHABLE":
    (versionReady&&productionRoute404?
      "BOTH_IMMUTABLE_VERSIONS_AUTH_GUARD_PASS_BUT_PRODUCTION_WORKERSDEV_404":
     versionReady?
      "IMMUTABLE_VERSION_INGRESS_PASS_PRODUCTION_ROUTE_MISMATCH":
     "VERSION_OR_PUBLIC_SHADOW_INGRESS_NOT_VERIFIED");
 }catch(error){
  const m=String(error?.message??"");
  report.code=/^STEP3_SHADOW_CODE_[A-Z0-9_]+$/u.test(m)?
    m:"STEP3_SHADOW_CODE_UNCLASSIFIED_PROVIDER_HOLD";
 }
 report.completed_at=new Date().toISOString();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync(FILE,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await auditShadowCode();
 if(report.status!=="PASS_READONLY_ROUTE_CODE_BOUNDARY_NOT_AUTHENTICATED")
   process.exitCode=3;
}
