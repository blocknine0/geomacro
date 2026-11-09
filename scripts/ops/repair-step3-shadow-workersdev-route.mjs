#!/usr/bin/env node
/** Owner-approved recovery of ONLY two existing Shadow workers.dev script routes.
 * Does not deploy scripts, touch production Worker/D1, alter signer, or release HOLD.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const DOMAIN="daspallab202391";
const HOSTS=Object.freeze([
 {script:"geomacro-step3-shadow",host:"geomacro-step3-shadow."+DOMAIN+".workers.dev",r2:true},
 {script:"geomacro-step3-shadow-legacy",host:"geomacro-step3-shadow-legacy."+DOMAIN+".workers.dev",r2:false},
]);
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const OUT="artifacts/release/step3-shadow-workersdev-route-repair.json";
const fail=x=>{throw Error("STEP3_SHADOW_ROUTE_"+x)};
export function assertScope(e,hold=true){
 if(!hold||e.GITHUB_ACTIONS!=="true"||e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
 e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 e.GITHUB_REF!=="refs/heads/main"||!SHA.test(e.GITHUB_SHA??"")||
 e.SHADOW_ROUTE_APPROVAL!=="ENABLE_ISOLATED_SHADOW_WORKERS_DEV_ONLY"||
 e.CLOUDFLARE_ACCOUNT_ID!=="fddd57d28199bad07a768445e7237693"||
 (e.CLOUDFLARE_API_TOKEN??"").length<20||e.D1_DATABASE_ID!==PROD||
 e.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
 e.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
 e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==HOSTS[0].host||
 e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==HOSTS[1].host||
 e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!=="geomacro-step3-shadow-private")
 fail("OWNER_APPROVAL_OR_EXACT_ISOLATION_MISSING");
 return true;
}
async function provider(e,path,{method="GET",payload=null,fetchImpl=fetch}={}){
 let res;
 try{res=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
  e.CLOUDFLARE_ACCOUNT_ID+path,{method,redirect:"error",cache:"no-store",
  headers:{"Authorization":"Bearer "+e.CLOUDFLARE_API_TOKEN,
    ...(payload?{"Content-Type":"application/json"}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{}),
  signal:AbortSignal.timeout(12000)});}
 catch{fail("PROVIDER_NETWORK_UNAVAILABLE")}
 if(!res||res.redirected||res.status!==200)
  fail("PROVIDER_HTTP_"+(Number(res?.status)||0));
 let v;try{v=await res.json()}catch{fail("PROVIDER_JSON_INVALID")}
 if(v?.success!==true||v.result==null)fail("PROVIDER_RESULT_INVALID");
 return v.result;
}
function assertSettings(e,w,settings,versions){
 const b=settings?.bindings;
 if(!Array.isArray(b)||b.filter(x=>x.type==="d1"&&x.name==="DB"&&
  x.database_id?.toLowerCase()===SHADOW).length!==1||
 b.some(x=>x.type==="d1"&&x.database_id?.toLowerCase()===PROD)||
 b.filter(x=>x.name==="CONTROL_PLANE_TOKEN"&&x.type==="secret_text").length!==1||
 w.r2&&b.filter(x=>x.type==="r2_bucket"&&x.name==="PHASE2H_PRIVATE_R2"&&
  x.bucket_name===e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET).length!==1)
 fail("SHADOW_BINDING_OR_ADMIN_SECRET_MISSING");
 const deployed=versions?.deployments?.[0]?.versions;
 if(!Array.isArray(deployed)||deployed.length!==1||
 Number(deployed[0]?.percentage)!==100||!UUID.test(deployed[0].version_id??""))
 fail("SHADOW_DEPLOYMENT_NOT_PINNED_100");
 return deployed[0].version_id;
}
export async function readShadowProbe(host,{fetchImpl=fetch}={}){
 if(!HOSTS.some(h=>h.host===host))fail("PROBE_HOST_NOT_ALLOWLISTED");
 let res;
 try{res=await fetchImpl("https://"+host+"/v1/internal/p0b/status?deep=invalid",{
  method:"GET",redirect:"error",cache:"no-store",headers:{"User-Agent":"GeoMacro-Step3-Shadow-Route-Audit/1.0"},
  signal:AbortSignal.timeout(12000)})}
 catch{fail("SHADOW_NETWORK_UNAVAILABLE")}
 if(!res||res.redirected)fail("SHADOW_PROBE_REDIRECT");
 const status=Number(res.status);
 if(!String(res.headers?.get("content-type")??"").toLowerCase().includes("application/json"))
  fail("SHADOW_PROBE_HTTP_"+status+"_NON_JSON");
 let v;try{v=await res.json()}catch{fail("SHADOW_PROBE_HTTP_"+status+"_INVALID_JSON")}
 // No bearer is sent: 401 must be returned by the deployed Worker itself.
 if(status!==401||v?.ok!==false||v.error!=="UNAUTHORIZED")
  fail("SHADOW_ADMIN_AUTH_BOUNDARY_UNVERIFIED_HTTP_"+status);
 return true;
}
export async function repairShadowRoutes({env=process.env,fetchImpl=fetch,hold=existsSync("config/d1-hotspot-v2-canary.hold")}={}){
 const receipt={schema:"geomacro.step3.shadow-workersdev-route-repair.v1",
  status:"HOLD",code:"NOT_STARTED",main_sha:env.GITHUB_SHA??null,
  shadow_only:true,production_worker_changed:false,production_d1_mutated:false,
  canary_hold_removed:false,payments_authorized:false,workers:[]};
 try{
  assertScope(env,hold);
  const acc=await provider(env,"/workers/subdomain",{fetchImpl});
  if(acc.subdomain!==DOMAIN)fail("ACCOUNT_WORKERSDEV_DOMAIN_MISMATCH");
  const [p,s]=await Promise.all([
   provider(env,"/d1/database/"+PROD,{fetchImpl}),
   provider(env,"/d1/database/"+SHADOW,{fetchImpl})
  ]);
  if(p.uuid?.toLowerCase()!==PROD||p.name!=="geomacro-control-plane"||
     s.uuid?.toLowerCase()!==SHADOW||s.name!=="geomacro-d1-publisher-shadow")
   fail("D1_PROVIDER_IDENTITY_MISMATCH");
  // Complete preflight for BOTH Workers before ANY route update.
  const readiness=[];
  for(const w of HOSTS){
    const base="/workers/scripts/"+w.script;
    const [settings,versions,domain]=await Promise.all([
     provider(env,base+"/settings",{fetchImpl}),
     provider(env,base+"/deployments",{fetchImpl}),
     provider(env,base+"/subdomain",{fetchImpl})
    ]);
    const version=assertSettings(env,w,settings,versions);
    if(typeof domain.enabled!=="boolean"||
       typeof domain.previews_enabled!=="boolean"||domain.previews_enabled)
      fail("SHADOW_SCRIPT_ROUTE_STATE_UNVERIFIED_OR_PREVIEW_ENABLED");
    readiness.push({...w,version,initially_enabled:domain.enabled});
  }
  for(const w of readiness){
    const base="/workers/scripts/"+w.script+"/subdomain";
    if(!w.initially_enabled){
      const changed=await provider(env,base,{
        method:"POST",payload:{enabled:true,previews_enabled:false},fetchImpl});
      if(changed.enabled!==true||changed.previews_enabled!==false)
        fail("SHADOW_ROUTE_ENABLE_ACK_INVALID");
    }
    const verified=await provider(env,base,{fetchImpl});
    if(verified.enabled!==true||verified.previews_enabled!==false)
      fail("SHADOW_ROUTE_PROVIDER_READBACK_FAILED");
    await readShadowProbe(w.host,{fetchImpl});
    receipt.workers.push({
      script:w.script,initially_enabled:w.initially_enabled,
      changed:!w.initially_enabled,workersdev_route_live:true,
      expected_admin_auth_401_verified:true,version:w.version,
      shadow_binding_verified:true
    });
  }
  receipt.status="PASS";receipt.code="BOTH_SHADOW_WORKERSDEV_ROUTES_VERIFIED";
 }catch(err){
  const message=String(err?.message??"");
  receipt.code=/^STEP3_SHADOW_ROUTE_[A-Z0-9_]+$/u.test(message)
   ?message:"STEP3_SHADOW_ROUTE_UNKNOWN_HOLD";
 }finally{
  receipt.completed_at=new Date().toISOString();
  mkdirSync("artifacts/release",{recursive:true,mode:0o700});
  writeFileSync(OUT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
 }
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const receipt=await repairShadowRoutes();
 if(receipt.status!=="PASS")process.exitCode=3;
}
