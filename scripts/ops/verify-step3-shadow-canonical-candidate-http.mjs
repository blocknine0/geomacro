#!/usr/bin/env node
/**
 * Strict read-only acceptance for TWO pinned unpromoted isolated Shadow Workers.
 * Checks both version URLs, JSON 404/401/400, original 100% deployed versions,
 * candidate source SHA, existing shadow-only D1, and bearer identity.
 * No deployment, SQL, B2/R2, secret mutation, payment or canary release.
 * Version URL provenance is provider ID-scoped; arbitrary URLs are rejected.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const SHA="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const DOMAIN="daspallab202391";
const BUCKET="geomacro-step3-shadow-private";
const WORKERS=Object.freeze([
 {name:"geomacro-step3-shadow",old:"48680b70-c41c-4af9-9e70-497213471dbb",
  candidate:"565118e5-781f-4a3a-ad73-d304d4876e8a",r2:true},
 {name:"geomacro-step3-shadow-legacy",old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  candidate:"214742c7-bc20-4ff8-bbed-cc3b41604aff",r2:false}
]);
const FILE="artifacts/release/step3-shadow-canonical-candidate-http-acceptance.json";
const fail=s=>{throw Error("STEP3_SHADOW_CANDIDATE_HTTP_"+s)};
const validSha=s=>/^[a-f0-9]{40}$/u.test(s??"");
export function assertCandidateScope(e,hold=true){
 if(!hold||e.GITHUB_ACTIONS!=="true"||
   e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
   e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   e.GITHUB_REF!=="refs/heads/main"||!validSha(e.GITHUB_SHA)||
   e.SHADOW_CANDIDATE_HTTP_APPROVAL!=="VERIFY_TWO_CANONICAL_SHADOW_CANDIDATES_READ_ONLY"||
   e.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
   (e.CLOUDFLARE_API_TOKEN??"").length<20||
   e.D1_DATABASE_ID!==PROD||
   e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
   e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!==BUCKET||
   e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==
     WORKERS[0].name+"."+DOMAIN+".workers.dev"||
   e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==
     WORKERS[1].name+"."+DOMAIN+".workers.dev")
  fail("EXACT_MAIN_SHADOW_IDENTITY_OR_OWNER_APPROVAL_NOT_VERIFIED");
 return true;
}
async function provider(e,path,fetchImpl){
 const paths=new Set(["/d1/database/"+PROD,"/d1/database/"+SHADOW]);
 for(const w of WORKERS){
  const base="/workers/scripts/"+w.name;
  paths.add(base+"/deployments");
  paths.add(base+"/subdomain");
  paths.add(base+"/versions/"+w.candidate);
  paths.add("/workers/workers/"+w.name+"/versions/"+w.candidate);
 }
 if(!paths.has(path))fail("PROVIDER_PATH_OUTSIDE_READONLY_SCOPE");
 let r;
 try{
  r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
   ACCOUNT+path,{method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN},
    signal:AbortSignal.timeout(16000)});
 }catch{fail("PROVIDER_NETWORK_UNAVAILABLE")}
 if(!r||r.redirected||r.status!==200)fail("PROVIDER_HTTP_"+(r?.status??0));
 let j;try{j=await r.json()}catch{fail("PROVIDER_JSON_INVALID")}
 if(j?.success!==true||j.result==null)fail("PROVIDER_RESULT_INVALID");
 return j.result;
}
export function pinnedVersionHost(urls,w){
 if(!WORKERS.some(x=>x.name===w?.name&&x.candidate===w.candidate))
  fail("HOST_WORKER_OR_VERSION_NOT_PINNED");
 if(!Array.isArray(urls))return {ok:false,reason:"PROVIDER_VERSION_URLS_ABSENT"};
 if(urls.length>8)return {ok:false,reason:"PROVIDER_VERSION_URL_COUNT_UNBOUNDED"};
 const valid=[];
 const re=new RegExp("^[a-f0-9]{8}-"+w.name+"\\."+DOMAIN+"\\.workers\\.dev$","u");
 for(const item of urls){
  if(typeof item!=="string")continue;
  let u;try{u=new URL(item)}catch{continue}
  if(u.protocol!=="https:"||u.username||u.password||u.port||
     u.pathname!=="/"||u.search||u.hash||!re.test(u.hostname))
    continue;
  valid.push(u.hostname);
 }
 if(valid.length!==1)return {ok:false,reason:valid.length===0?
   "NO_PROVIDER_PINNED_VERSION_HOST":"MULTIPLE_PROVIDER_PINNED_VERSION_HOSTS",
   provider_url_count:urls.length};
 // Never output the host to logs/receipt; return only to the in-memory probe.
 return {ok:true,host:valid[0],provider_url_count:urls.length};
}
function ensureCandidateBindings(resources,w){
 const b=resources?.bindings;
 if(!Array.isArray(b)||b.length===0)fail("CANDIDATE_BINDINGS_MISSING");
 const db=b.filter(x=>x.name==="DB"&&x.type==="d1");
 if(db.length!==1||String(db[0].database_id).toLowerCase()!==SHADOW||
  b.some(x=>x.type==="d1"&&String(x.database_id).toLowerCase()===PROD))
  fail("CANDIDATE_D1_NOT_ISOLATED");
 if(b.filter(x=>x.name==="CONTROL_PLANE_TOKEN"&&x.type==="secret_text").length!==1)
  fail("CANDIDATE_ADMIN_TOKEN_BINDING_MISSING");
 if(w.r2&&b.filter(x=>x.name==="PHASE2H_PRIVATE_R2"&&
  x.type==="r2_bucket"&&x.bucket_name===BUCKET).length!==1)
  fail("CANDIDATE_SHADOW_R2_NOT_BOUND");
 const source=b.filter(x=>x.name==="GEOMACRO_SOURCE_SHA"&&
  x.type==="plain_text"&&x.text===SHA);
 if(source.length!==1)fail("CANDIDATE_SOURCE_SHA_NOT_PINNED");
 return true;
}
export async function publicProbe(host,w,kind,{fetchImpl=fetch,validBearer=""}={}){
 if(!WORKERS.some(x=>x.name===w?.name&&x.candidate===w.candidate)||
   typeof host!=="string"||
   !new RegExp("^[a-f0-9]{8}-"+w.name+"\\."+DOMAIN+
       "\\.workers\\.dev$","u").test(host))
   fail("PUBLIC_HTTP_HOST_NOT_PINNED");
 if(!["retired_public","invalid_admin","authenticated_invalid_query"].includes(kind))
   fail("PUBLIC_HTTP_PROBE_NOT_ALLOWLISTED");
 if(kind==="authenticated_invalid_query"&&!/^[a-f0-9]{64}$/u.test(validBearer))
   return {verified:false,reason:"SHADOW_BEARER_SECRET_UNAVAILABLE_OR_INVALID"};
 const path=kind==="retired_public"?"/v1/public/intelligence-publications":
  "/v1/internal/p0b/status?deep=invalid";
 const h={Accept:"application/json",Authorization:kind==="authenticated_invalid_query"?
   "Bearer "+validBearer:"Bearer invalid"};
 let response;
 try{response=await fetchImpl("https://"+host+path,{method:"GET",
   redirect:"error",cache:"no-store",headers:h,signal:AbortSignal.timeout(16000)})}
 catch{return {verified:false,reason:"HTTPS_NETWORK_UNAVAILABLE"}}
 if(!response||response.redirected)
   return {verified:false,reason:"UNEXPECTED_REDIRECT"};
 const ct=String(response.headers?.get("content-type")??"").toLowerCase();
 const out={http_status:response.status,json_content_type:ct.includes("application/json"),
   cloudflare_mitigated:response.headers?.get("cf-mitigated")==="challenge",
   verified:false};
 if(!out.json_content_type||out.cloudflare_mitigated)
  return {...out,reason:"NON_JSON_OR_CLOUDFLARE_INTERCEPTION"};
 const n=Number(response.headers?.get("content-length")??0);
 if(!Number.isFinite(n)||n>4096)return {...out,reason:"JSON_RESPONSE_TOO_LARGE"};
 let text="";
 try{text=await response.text()}catch{return {...out,reason:"JSON_BODY_UNAVAILABLE"}}
 if(text.length>4096)return {...out,reason:"JSON_BODY_TOO_LARGE"};
 let obj;try{obj=JSON.parse(text)}catch{return {...out,reason:"JSON_BODY_INVALID"}}
 const expected=kind==="retired_public"?{http:404,error:"NOT_FOUND"}:
   kind==="invalid_admin"?{http:401,error:"UNAUTHORIZED"}:
   {http:400,error:"P0B_STATUS_QUERY_INVALID"};
 out.verified=response.status===expected.http&&
   obj?.ok===false&&obj?.error===expected.error;
 out.error_category=out.verified?expected.error:"UNEXPECTED_JSON";
 return out;
}
export async function verifyCandidateHttp({env=process.env,fetchImpl=fetch,
 holdPresent=existsSync("config/d1-hotspot-v2-canary.hold"),
 headCheck=()=>"",}={}){
 const report={schema:"geomacro.step3.shadow-canonical-candidate-http.v1",
  status:"HOLD",code:"NOT_STARTED",main_sha:env.GITHUB_SHA??null,
  candidate_source_sha:SHA,scope:"TWO_IMMUTABLE_ISOLATED_SHADOW_VERSIONS",
  read_only:true,production_worker_changed:false,production_d1_mutated:false,
  shadow_d1_mutated:false,shadow_traffic_changed:false,
  b2_or_r2_written:false,canary_hold_removed:false,payments_authorized:false,
  workers:[]};
 try{
  assertCandidateScope(env,holdPresent);
  if(headCheck()!==env.GITHUB_SHA)fail("MAIN_SHA_MOVED");
  const [prod,shadow]=await Promise.all([
   provider(env,"/d1/database/"+PROD,fetchImpl),
   provider(env,"/d1/database/"+SHADOW,fetchImpl)
  ]);
  if(prod.uuid?.toLowerCase()!==PROD||prod.name!=="geomacro-control-plane"||
     shadow.uuid?.toLowerCase()!==SHADOW||
     shadow.name!=="geomacro-d1-publisher-shadow")
   fail("PROVIDER_D1_IDENTITIES_MISMATCH");
  for(const w of WORKERS){
   const root="/workers/scripts/"+w.name;
   const [deploy,domain,scriptV,version]=await Promise.all([
    provider(env,root+"/deployments",fetchImpl),
    provider(env,root+"/subdomain",fetchImpl),
    provider(env,root+"/versions/"+w.candidate,fetchImpl),
    provider(env,"/workers/workers/"+w.name+"/versions/"+w.candidate,fetchImpl)
   ]);
   const active=deploy.deployments?.[0]?.versions;
   if(!Array.isArray(active)||active.length!==1||
     active[0].version_id!==w.old||Number(active[0].percentage)!==100)
    fail("SHADOW_PREVIOUS_100_PERCENT_DEPLOYMENT_NOT_INTACT");
   if(domain.enabled!==true||domain.previews_enabled!==true)
    fail("SHADOW_ROUTE_OR_VERSION_URL_DISABLED");
   if(scriptV.id!==w.candidate||version.id!==w.candidate)
    fail("CANDIDATE_IMMUTABLE_VERSION_ID_DIVERGED");
   ensureCandidateBindings(scriptV.resources,w);
   const pinned=pinnedVersionHost(version.urls,w);
   const row={script:w.name,immutable_version_id:w.candidate,
    previous_deployed_version_id:w.old,
    candidate_source_sha_pinned:true,
    shadow_d1_binding_verified:true,previous_deployment_100pct_unchanged:true,
    version_main_module:/^[A-Za-z0-9_./-]{1,120}$/u.test(version.main_module??"")?
      version.main_module:"UNVERIFIED",
    version_url_status:pinned.ok?"PROVIDER_PINNED_HOST_AVAILABLE":pinned.reason,
    version_url_count:pinned.provider_url_count??null,
    probes:[]};
   report.workers.push(row);
   if(!pinned.ok){row.status="HOLD_VERSION_URL_UNAVAILABLE";continue}
   const probes=[
    ["retired_public","GET_PUBLIC_RETIRED"],
    ["invalid_admin","GET_INVALID_BEARER"],
    ["authenticated_invalid_query","GET_AUTHORIZED_INVALID_QUERY"]
   ];
   for(const [kind,label] of probes){
    const p=await publicProbe(pinned.host,w,kind,{fetchImpl,
      validBearer:String(env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??"")});
    row.probes.push({name:label,...p});
   }
   row.status=row.probes.length===3&&row.probes.every(x=>x.verified)?
    "PASS_IMMUTABLE_CANDIDATE_HTTP_NO_TRAFFIC":"HOLD_HTTP_CONTRACT";
  }
  report.status=report.workers.length===2&&report.workers.every(x=>
   x.status==="PASS_IMMUTABLE_CANDIDATE_HTTP_NO_TRAFFIC")?
   "PASS_CANDIDATES_HTTP_VERIFIED_NOT_PROMOTED":"HOLD";
  report.code=report.status.startsWith("PASS")?
   "TWO_CANONICAL_IMMUTABLE_HTTP_CONTRACTS_PASS_NO_TRAFFIC":
   "CANDIDATE_VERSION_URL_OR_HTTP_CONTRACT_NOT_VERIFIED";
 }catch(e){
  const m=String(e?.message??"");
  report.code=/^STEP3_SHADOW_CANDIDATE_HTTP_[A-Z0-9_]+$/u.test(m)?
   m:"STEP3_SHADOW_CANDIDATE_HTTP_UNCLASSIFIED_HOLD";
 }
 report.completed_at=new Date().toISOString();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync(FILE,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const {execFileSync}=await import("node:child_process");
 const r=await verifyCandidateHttp({headCheck:()=>execFileSync("git",
  ["ls-remote","https://github.com/blocknine0/geomacro.git","refs/heads/main"],
  {encoding:"utf8"}).trim().split(/\s/u)[0]});
 if(r.status!=="PASS_CANDIDATES_HTTP_VERIFIED_NOT_PROMOTED")process.exitCode=3;
}
