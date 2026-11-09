import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditShadowCode,validateReadonlyScope,probeActualHost,inspectDownloadedCode,
 sanitizedVersionRouting} from "../ops/audit-step3-shadow-live-code-version.mjs";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const NAMES=["geomacro-step3-shadow","geomacro-step3-shadow-legacy"];
const ID="f37d1f52-ff5b-4f6f-9322-cc3cf0c8dfd8";
const PREFIX="9387e76d"; // Cloudflare API examples show this need not match ID first 8 hex.
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:"f".repeat(40),
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"c".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:
   NAMES[0]+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:
   NAMES[1]+".daspallab202391.workers.dev"
});
function mock({http=404,versionHttp=401,handler=true,codeMarkers=true,
 contentAllowed=true,wrongDb=false,versionReadDenied=false,
 unsafeVersionHost=false,assetFirst=false,missingMainModule=false}={}){
 const requests=[];
 const fetchImpl=async (url,opts)=>{
  const u=new URL(url); requests.push({host:u.hostname,path:u.pathname,method:opts.method});
  assert.equal(opts.method,"GET");
  assert(!opts.body,"Audit may never send body");
  if(u.hostname==="api.cloudflare.com"){
   const p=u.pathname;
   if(p.endsWith("/workers/subdomain"))
    return Response.json({success:true,result:{subdomain:"daspallab202391"}});
   if(p.includes("/d1/database/")){
    const id=p.split("/").at(-1);
    return Response.json({success:true,result:{uuid:id,
     name:id===PROD?"geomacro-control-plane":"geomacro-d1-publisher-shadow"}});
   }
   const name=NAMES.find(n=>p.includes("/workers/scripts/"+n+"/")||
     p.includes("/workers/workers/"+n+"/"));
   assert(name,"Provider request outside script allowlist");
   if(p.includes("/workers/workers/")&&p.includes("/versions/")){
    if(versionReadDenied)return new Response("denied",{status:403});
    return Response.json({success:true,result:{id:ID,
     main_module:missingMainModule?undefined:"src/index.mjs",
     compatibility_date:"2026-11-09",
     assets:{jwt:"NEVER_PERSIST_ASSETS_JWT_SECRET",
      config:{run_worker_first:!assetFirst,
       not_found_handling:assetFirst?"404-page":"none",
       html_handling:"auto-trailing-slash"}},
     urls:[unsafeVersionHost?"https://not-an-allowed-host.example.com":
      "https://"+PREFIX+"-"+name+".daspallab202391.workers.dev"]}});
   }
   if(p.endsWith("/subdomain"))return Response.json({
    success:true,result:{enabled:true,previews_enabled:true}});
   if(p.endsWith("/deployments"))return Response.json({
    success:true,result:{deployments:[{versions:[{version_id:ID,percentage:100}]}]}});
   if(p.endsWith("/versions/"+ID))return Response.json({
    success:true,result:{id:ID,resources:{
     bindings:[{name:"DB",type:"d1",database_id:wrongDb?PROD:SHADOW}],
     script:{etag:"opaque_etag",handlers:handler?["fetch"]:["scheduled"]}
    }}});
   if(p.endsWith("/content/v2")){
    if(!contentAllowed)return new Response("permission_denied",{
       status:403,headers:{"content-type":"text/plain"}});
    const code=codeMarkers?
     "CONTROL_PLANE_AUTH_UNCONFIGURED UNAUTHORIZED "+
     "/v1/internal/p0b/status P0B_STATUS_QUERY_INVALID "+
     "/v1/internal/phase2h-raw-news":
     "export default { fetch() { return new Response('older'); } }";
    return new Response(code,{status:200,headers:{"content-type":"application/javascript"}});
   }
   throw Error("Unexpected API path "+p);
  }
  const isVersion=NAMES.some(x=>
   u.hostname===PREFIX+"-"+x+".daspallab202391.workers.dev");
  assert(isVersion||NAMES.some(x=>u.hostname===x+".daspallab202391.workers.dev"));
  assert.equal(opts.headers.Authorization,"Bearer invalid");
  assert.equal(u.pathname,"/v1/internal/p0b/status");
  const effectiveHttp=isVersion?versionHttp:http;
  if(effectiveHttp===404)return new Response("<html>PRIVATE_UNTRUSTED_BODY</html>",{
   status:404,headers:{"content-type":"text/html"}});
  if(effectiveHttp===401)return Response.json({ok:false,error:"UNAUTHORIZED"},{
   status:401,headers:{"cf-ray":"do-not-persist"}});
  return Response.json({ok:false,error:"OTHER"}, {status:effectiveHttp});
 };
 return {fetchImpl,requests};
}
test("exact main and existing HOLD, no production/shadow UUID confusion",()=>{
 assert.equal(validateReadonlyScope(env(),true),true);
 assert.throws(()=>validateReadonlyScope(env(),false),/EXACT_MAIN/);
 assert.throws(()=>validateReadonlyScope({...env(),D1_DATABASE_ID:SHADOW},true),/EXACT_MAIN/);
 assert.throws(()=>validateReadonlyScope({...env(),GITHUB_REF:"refs/heads/audit"},true),/EXACT_MAIN/);
});
test("live 404 is captured for BOTH Workers even when Cloudflare route is enabled",async()=>{
 const f=mock();
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert.equal(report.workers.length,2);
 assert(report.workers.every(w=>w.route_enabled===true));
 assert(report.workers.every(w=>w.http_probe.http_status===404));
 assert(report.workers.every(w=>w.immutable_version_http_probe.http_status===401));
 assert(report.workers.every(w=>w.immutable_version_http_probe.expected_guard_verified===true));
 assert.equal(report.code,
  "BOTH_IMMUTABLE_VERSIONS_AUTH_GUARD_PASS_BUT_PRODUCTION_WORKERSDEV_404");
 assert(report.workers.every(w=>w.provider_content_endpoint.markers.p0b_admin===true));
 assert(!JSON.stringify(report).includes("PRIVATE_UNTRUSTED_BODY"));
 assert(!JSON.stringify(report).includes(env().CLOUDFLARE_API_TOKEN));
 assert(f.requests.every(x=>x.method==="GET"));
 assert(!f.requests.some(x=>x.path.endsWith("/query")));
});
test("live guard 401 + deployed fetch handler can be classified as read-only PASS",async()=>{
 const f=mock({http:401});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"PASS_READONLY_ROUTE_CODE_BOUNDARY_NOT_AUTHENTICATED");
 assert.equal(report.workers.length,2);
 assert(report.workers.every(w=>w.http_probe.expected_guard_verified===true));
 assert(report.workers.every(w=>w.deployed_fetch_handler===true));
 assert(report.workers.every(w=>w.provider_content_endpoint.status.includes("NOT_DEPLOYED_VERSION_CERTIFICATE")));
});
test("deployed Worker version with no fetch handler stays HOLD",async()=>{
 const f=mock({http:401,handler:false});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert(report.workers.every(w=>w.deployed_fetch_handler===false));
});
test("production-bound deployed Shadow version is rejected before public probes",async()=>{
 const f=mock({wrongDb:true});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert.equal(report.code,"STEP3_SHADOW_CODE_VERSION_NOT_ISOLATED_FROM_PRODUCTION_D1");
});
test("content read permissions absent remain UNKNOWN and never fabricate deployed parity",async()=>{
 const f=mock({http:401,contentAllowed:false});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert(report.workers.every(w=>w.provider_content_endpoint.reason==="CONTENT_PROVIDER_HTTP_403"));
 assert(report.workers.every(w=>w.provider_content_endpoint.status==="UNAVAILABLE"));
});
test("provider-authoritative version URL 404 is not misrepresented as code functioning",async()=>{
 const f=mock({versionHttp:404});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert(report.workers.every(w=>w.immutable_version_http_probe.http_status===404));
 assert.equal(report.code,"VERSION_OR_PUBLIC_SHADOW_INGRESS_NOT_VERIFIED");
});
test("new provider endpoint permission denial retains read-only uncertainty",async()=>{
 const f=mock({versionReadDenied:true});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert(report.workers.every(w=>w.version_url_provenance.reason==="VERSION_PROVIDER_HTTP_403"));
 assert(!f.requests.some(x=>x.method!=="GET"));
});
test("untrusted provider URL cannot redirect audit to unrelated domain",async()=>{
 const f=mock({unsafeVersionHost:true});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert(report.workers.every(w=>w.version_url_provenance.reason==="VERSION_PROVIDER_NO_UNIQUE_PINNED_URL"));
 assert(!f.requests.some(x=>x.host==="not-an-allowed-host.example.com"));
});
test("read-only deployed version metadata exposes entrypoint and asset routing WITHOUT JWT",async()=>{
 const f=mock({assetFirst:true});
 const report=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert.equal(report.status,"HOLD");
 assert(report.workers.every(w=>w.deployed_version_routing.immutable_version_scoped));
 assert(report.workers.every(w=>w.deployed_version_routing.main_module==="src/index.mjs"));
 assert(report.workers.every(w=>w.deployed_version_routing.static_assets_config_present));
 assert(report.workers.every(w=>w.deployed_version_routing.run_worker_first===false));
 assert(report.workers.every(w=>w.deployed_version_routing.not_found_handling==="404-page"));
 assert(!JSON.stringify(report).includes("NEVER_PERSIST_ASSETS_JWT_SECRET"));
 assert(!JSON.stringify(report).includes(env().CLOUDFLARE_API_TOKEN));
 assert(f.requests.every(x=>x.method==="GET"));
});
test("missing entrypoint and malformed assets patterns remain UNVERIFIED, not invented",()=>{
 const v=sanitizedVersionRouting({main_module:"../unsafe\\secret",
  compatibility_date:"invalid",
  assets:{jwt:"NEVER_PERSIST_ASSETS_JWT_SECRET",
   config:{run_worker_first:["/**",["not_valid"]],not_found_handling:"script"}}});
 assert.equal(v.main_module,"UNVERIFIED");
 assert.equal(v.run_worker_first,"UNVERIFIED");
 assert.equal(v.not_found_handling,"UNVERIFIED");
 assert.equal(v.compatibility_date,"UNVERIFIED");
 assert(!JSON.stringify(v).includes("NEVER_PERSIST_ASSETS_JWT_SECRET"));
});
test("absent version API metadata stays UNKNOWN and cannot imply assets absent",async()=>{
 const f=mock({versionReadDenied:true});
 const r=await auditShadowCode({env:env(),fetchImpl:f.fetchImpl,holdPresent:true});
 assert(r.workers.every(w=>w.deployed_version_routing.metadata_unavailable===true));
 assert(r.workers.every(w=>w.deployed_version_routing.immutable_version_scoped===false));
});
test("route host allowlist and scope protect against dynamic external URLs",async()=>{
 await assert.rejects(()=>probeActualHost("geomacro-control-plane",{fetchImpl:()=>{throw Error("never")}}),
  /HOST_NOT_ALLOWLISTED/);
 await assert.rejects(()=>inspectDownloadedCode(env(),"geomacro-control-plane",{fetchImpl:()=>{throw Error("never")}}),
  /SCRIPT_NOT_ALLOWLISTED/);
});
test("workflow uses production environment for READ-ONLY exact-main SHA without dispatching writes",()=>{
 const y=readFileSync(".github/workflows/step3-shadow-live-code-version-audit.yml","utf8");
 assert.match(y,/environment: production/);
 assert.match(y,/branches: \[main\]/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/POST|PATCH|PUT|wrangler deploy|migrations apply|continue-on-error: true/);
});
