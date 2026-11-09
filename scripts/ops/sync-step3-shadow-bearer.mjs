#!/usr/bin/env node
/** Owner-approved, shadow-only CONTROL_PLANE_TOKEN alignment and live auth proof.
 * No production Worker, D1 SQL, payments, B2, R2, canary traffic or HOLD mutation.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ACCOUNT=/^[a-f0-9]{32}$/u;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const TOKEN=/^[a-f0-9]{64}$/u;
const SCRIPTS=Object.freeze([
  {name:"geomacro-step3-shadow",host:"geomacro-step3-shadow.daspallab202391.workers.dev",r2:true},
  {name:"geomacro-step3-shadow-legacy",host:"geomacro-step3-shadow-legacy.daspallab202391.workers.dev",r2:false},
]);
const RECEIPT="artifacts/release/step3-shadow-bearer-sync.json";
const fail=code=>{throw Error("STEP3_BEARER_"+code)};
export function assertShadowSyncScope(e,holdPresent=true){
  if(!holdPresent||e.GITHUB_ACTIONS!=="true"||
    e.GITHUB_EVENT_NAME!=="workflow_dispatch"||
    e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    e.GITHUB_REF!=="refs/heads/main"||!SHA.test(e.GITHUB_SHA??"")||
    e.SHADOW_SYNC_APPROVAL!=="SYNC_SHADOW_BEARERS_ONLY"||
    e.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
    !ACCOUNT.test(e.CLOUDFLARE_ACCOUNT_ID??"")||
    !UUID.test(e.D1_DATABASE_ID??"")||
    !UUID.test(e.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    e.D1_DATABASE_ID===e.GEOMACRO_D1_SHADOW_DATABASE_ID||
    !TOKEN.test(e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??"")||
    (e.CLOUDFLARE_API_TOKEN??"").length<20||
    e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==SCRIPTS[0].host||
    e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==SCRIPTS[1].host||
    e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET!=="geomacro-step3-shadow-private")
    fail("EXACT_MAIN_ISOLATED_SCOPE_UNVERIFIED");
  return true;
}
async function provider(e,path,{method="GET",body,fetchImpl=fetch}={}){
  let response;
  try{
    response=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
      e.CLOUDFLARE_ACCOUNT_ID+path,{
      method,redirect:"error",cache:"no-store",
      headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN,
        ...(body?{"Content-Type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(12000)
    });
  }catch{fail("PROVIDER_UNREACHABLE")}
  if(!response||response.redirected||response.status!==200)
    fail("PROVIDER_HTTP_"+(Number(response?.status)||0));
  let data;
  try{data=await response.json()}catch{fail("PROVIDER_JSON_INVALID")}
  if(data?.success!==true||data.result==null)fail("PROVIDER_RESULT_UNVERIFIED");
  return data.result;
}
async function verifyIsolation(e,worker,fetchImpl){
  const production=await provider(e,"/d1/database/"+e.D1_DATABASE_ID,{fetchImpl});
  const shadow=await provider(e,"/d1/database/"+e.GEOMACRO_D1_SHADOW_DATABASE_ID,{fetchImpl});
  if(production.uuid?.toLowerCase()!==e.D1_DATABASE_ID.toLowerCase()||
     production.name!=="geomacro-control-plane"||
     shadow.uuid?.toLowerCase()!==e.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()||
     shadow.name!=="geomacro-d1-publisher-shadow")
    fail("PRODUCTION_SHADOW_DB_IDENTITY_DIVERGED");
  const base="/workers/scripts/"+worker.name;
  const settings=await provider(e,base+"/settings",{fetchImpl});
  const bindings=settings.bindings;
  if(!Array.isArray(bindings)||
    bindings.filter(b=>b.type==="d1"&&b.name==="DB"&&
     b.database_id?.toLowerCase()===e.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()).length!==1||
    bindings.some(b=>b.type==="d1"&&b.database_id?.toLowerCase()===e.D1_DATABASE_ID.toLowerCase())||
    worker.r2&&bindings.filter(b=>b.type==="r2_bucket"&&
      b.name==="PHASE2H_PRIVATE_R2"&&
      b.bucket_name===e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET).length!==1)
    fail("SHADOW_BINDING_PARITY_UNVERIFIED");
  const deployments=await provider(e,base+"/deployments",{fetchImpl});
  const active=deployments.deployments?.[0];
  if(!Array.isArray(active?.versions)||active.versions.length!==1||
    Number(active.versions[0].percentage)!==100||!UUID.test(active.versions[0].version_id??""))
    fail("SHADOW_DEPLOYMENT_NOT_SINGLE_100");
  return active.versions[0].version_id;
}
export async function classifyAuthProbe({host,token,fetchImpl=fetch}){
  if(!SCRIPTS.some(s=>s.host===host)||!TOKEN.test(token??""))
    fail("PROBE_SCOPE_INVALID");
  let response;
  try{
    // The query is deliberately INVALID. HTTP 400 with this exact code
    // demonstrates the root-admin auth passed, without performing a D1 read.
    response=await fetchImpl("https://"+host+"/v1/internal/p0b/status?deep=invalid",{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Authorization:"Bearer "+token,"Cache-Control":"no-store"},
      signal:AbortSignal.timeout(12000)
    });
  }catch{fail("SHADOW_AUTH_PROBE_UNREACHABLE")}
  if(!response||response.redirected)fail("SHADOW_AUTH_PROBE_REDIRECT");
  let data;
  try{data=await response.json()}catch{fail("SHADOW_AUTH_PROBE_JSON_INVALID")}
  if(response.status===400&&data?.error==="P0B_STATUS_QUERY_INVALID"&&data.ok===false)
    return "AUTHENTICATED";
  if(response.status===401&&data?.error==="UNAUTHORIZED"&&data.ok===false)
    return "MISMATCH";
  if(response.status===503&&data?.error==="CONTROL_PLANE_AUTH_UNCONFIGURED"&&data.ok===false)
    return "MISMATCH";
  fail("SHADOW_AUTH_PROBE_UNEXPECTED_HTTP_"+response.status);
}
export async function syncShadowBearer({env=process.env,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),holdPresent=existsSync("config/d1-hotspot-v2-canary.hold")}={}){
  const receipt={
    schema:"geomacro.step3.shadow-bearer-sync.v1",status:"HOLD",
    code:"NOT_STARTED",reviewed_main_sha:env.GITHUB_SHA??null,
    shadow_only:true,production_worker_changed:false,production_d1_mutated:false,
    hold_removed:false,payments_authorized:false,shadow_workers:[]
  };
  try{
    assertShadowSyncScope(env,holdPresent);
    for(const worker of SCRIPTS){
      const before=await verifyIsolation(env,worker,fetchImpl);
      const original=await classifyAuthProbe({
        host:worker.host,token:env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl
      });
      if(original==="MISMATCH"){
        const updated=await provider(env,"/workers/scripts/"+worker.name+"/secrets",{
          method:"PUT",body:{name:"CONTROL_PLANE_TOKEN",
            text:env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,type:"secret_text"},fetchImpl
        });
        if(updated.name!=="CONTROL_PLANE_TOKEN"||updated.type!=="secret_text")
          fail("PROVIDER_SECRET_ACK_INVALID");
      }
      let status="MISMATCH";
      for(let attempt=0;attempt<4;attempt++){
        status=await classifyAuthProbe({
          host:worker.host,token:env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,fetchImpl
        });
        if(status==="AUTHENTICATED")break;
        if(attempt<3)await sleep(1000);
      }
      if(status!=="AUTHENTICATED")fail("POST_SYNC_AUTH_NOT_VERIFIED");
      const after=await verifyIsolation(env,worker,fetchImpl);
      receipt.shadow_workers.push({
        script:worker.name,authenticated:true,
        changed_secret:original==="MISMATCH",
        previous_version:before,current_version:after,
        shadow_db_and_r2_bindings_verified:true
      });
    }
    receipt.status="PASS";receipt.code="SHADOW_BOTH_BEARERS_AUTHENTICATED";
  }catch(error){
    const code=String(error?.message??"");
    receipt.code=/^STEP3_BEARER_[A-Z0-9_]+$/u.test(code)
      ?code:"STEP3_BEARER_UNCLASSIFIED_HOLD";
  }finally{
    receipt.completed_at=new Date().toISOString();
    mkdirSync("artifacts/release",{recursive:true,mode:0o700});
    writeFileSync(RECEIPT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(receipt));
  }
  return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await syncShadowBearer();
  if(result.status!=="PASS")process.exitCode=3;
}
