import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {assertVerifiedCurrentGlobalRiskD1Parent} from "../lib/risk-indices-verified-d1-parent.mjs";

const REPO="blocknine0/geomacro";
const CONTROL="https://geomacro-control-plane.daspallab202391.workers.dev";
const MAIN="https://api.github.com/repos/"+REPO+"/git/ref/heads/main";
const TARGET="risk-indices-verified-d1-parent.yml";
const SHA=/^[a-f0-9]{40}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const EMPTY=(status,reason)=>Object.freeze({
  schema:"geomacro.risk-indices-verified-parent-repair-backstop.v1",
  status,reason,eligible:false,dispatch_requested:false,
  parent_scored_gri_verified:false,source_readback_requests:0,
  b2_requests:0,d1_writes:0,supabase_writes:0,payments:0,
});

async function safeJson(url,fetchImpl){
  let res;
  try{res=await fetchImpl(url,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{accept:"application/json","cache-control":"no-cache"},
    signal:AbortSignal.timeout(12_000),
  })}catch{return {ok:false,status:0,value:null};}
  if(res.redirected||!(res.status===200))return {ok:false,status:res.status,value:null};
  const type=res.headers?.get?.("content-type")??"";
  if(type&&!/application\/json/u.test(type))return {ok:false,status:res.status,value:null};
  try{
    const raw=await res.text();
    if(raw.length>2*1024*1024)return {ok:false,status:res.status,value:null};
    return {ok:true,status:200,value:JSON.parse(raw)};
  }catch{return {ok:false,status:res.status,value:null};}
}

function matchesVerifiedParent(child,parent,nowMs){
  if(!child||child.ok!==true||child.product!=="risk-indices"||
     child.schema!=="geomacro.public-risk-indices-live.v1"||
     child.proof_schema!=="geomacro.public-risk-indices-live-proof.v1"||
     child.verification_mode!=="direct-b2-readback"||
     child.b2_object_key!=="geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz"||
     !HASH.test(child.b2_sha256??"")||!HASH.test(child.payload_sha256??"")||
     child.full_b2_readback_verified!==true||
     child.current_b2_readback_verified!==true||
     child.exact_gzip_restore_verified!==true||
     child.source_as_of!==parent.sourceAsOf||
     !Number.isFinite(Date.parse(child.expires_at??""))||
     Date.parse(child.expires_at)<=nowMs||
     typeof child.payload_json!=="string"||child.payload_json.length>768*1024||
     createHash("sha256").update(child.payload_json).digest("hex")!==child.payload_sha256)
    return false;
  try{
    const value=JSON.parse(child.payload_json);
    return value.schema===child.schema &&
      value.data?.parentMethodologyVersion==="gri-v1.2.0" &&
      value.data?.snapshotAsOf===parent.sourceAsOf &&
      value.parent_global_risk_b2_sha256===parent.parentB2Sha256 &&
      value.parent_global_risk_payload_sha256===parent.parentPayloadSha256;
  }catch{return false;}
}

export function classifyRiskIndicesRepair({griSnapshot,indicesSnapshot,now=Date.now()}={}){
  if(!Number.isFinite(now))return EMPTY("SKIPPED","INVALID_CLOCK");
  let parent;
  try{parent=assertVerifiedCurrentGlobalRiskD1Parent(griSnapshot,now)}
  catch{return EMPTY("SKIPPED_NO_CURRENT_SIGNED_GRI","VERIFIED_GRI_PARENT_UNAVAILABLE");}
  if(matchesVerifiedParent(indicesSnapshot,parent,now)){
    return Object.freeze({...EMPTY("CURRENT_INDICES_ALREADY_MATCH_PARENT","NO_REPAIR_REQUIRED"),
      parent_scored_gri_verified:true,source_readback_requests:2});
  }
  return Object.freeze({
    ...EMPTY("REPAIR_REQUIRES_PROTECTED_PUBLISHER","VERIFIED_PARENT_AVAILABLE_INDICES_MISSING_OR_STALE"),
    eligible:true,parent_scored_gri_verified:true,source_readback_requests:2,
  });
}

/**
 * The cron and workflow_run triggers can race the same already signed GRI
 * parent. Inspect ONLY authenticated GitHub run metadata, never B2 or source
 * bytes. A failed attempt may retry once after 8 minutes, only while the
 * original signed parent is STILL current. Never repeat active/success jobs.
 */
export function decideVerifiedIndicesPublisherRetry({
  runs,headSha,parentSourceAsOf,now,
}={}){
  if(!Array.isArray(runs)||runs.length>20||!SHA.test(headSha??"")||
     !Number.isFinite(Date.parse(parentSourceAsOf??""))||
     !(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("INDICES_REPAIR_RUN_METADATA_INVALID");
  const since=Date.parse(parentSourceAsOf);
  if(since>now.getTime()||now.getTime()-since>90*60_000)
    throw Error("INDICES_REPAIR_VERIFIED_PARENT_TIME_INVALID");
  const matching=runs.filter(run=>
    run?.head_sha===headSha&&run.head_branch==="main"&&
    ["workflow_dispatch","workflow_run"].includes(run.event)&&
    typeof run.created_at==="string"&&
    Number.isFinite(Date.parse(run.created_at))&&
    Date.parse(run.created_at)>=since&&
    Date.parse(run.created_at)<=now.getTime()+5*60_000);
  if(matching.length===0)
    return Object.freeze({dispatch:true,status:"FIRST_VERIFIED_PARENT_REPAIR_ATTEMPT"});
  if(matching.some(run=>!run.status||
     ["queued","in_progress","waiting","requested","pending"].includes(run.status)||
     run.status!=="completed"))
    return Object.freeze({dispatch:false,status:"VERIFIED_PARENT_REPAIR_IN_PROGRESS_OR_UNKNOWN"});
  if(matching.some(run=>run.conclusion==="success"))
    return Object.freeze({dispatch:false,status:"VERIFIED_PARENT_REPAIR_ALREADY_SUCCEEDED"});
  if(matching.some(run=>!["failure","timed_out","cancelled"].includes(run.conclusion)))
    return Object.freeze({dispatch:false,status:"VERIFIED_PARENT_REPAIR_RESULT_NOT_RETRYABLE"});
  if(matching.length>=2)
    return Object.freeze({dispatch:false,status:"VERIFIED_PARENT_REPAIR_RETRY_LIMIT_REACHED"});
  if(now.getTime()-Date.parse(matching[0].created_at)<8*60_000)
    return Object.freeze({dispatch:false,status:"VERIFIED_PARENT_REPAIR_COOLDOWN"});
  return Object.freeze({dispatch:true,status:"VERIFIED_PARENT_REPAIR_SINGLE_RETRY"});
}

export async function runRiskIndicesVerifiedParentBackstop({
  env=process.env,fetchImpl=fetch,now=new Date(),
}={}){
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=="refs/heads/main"||
     !["schedule","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)||
     !SHA.test(env.GITHUB_SHA??"")||
     env.GITHUB_SHA!==env.EXPECTED_CANONICAL_MAIN_SHA)
    throw Error("INDICES_REPAIR_PROTECTED_CANONICAL_MAIN_REQUIRED");
  if(!Number.isFinite(now.getTime()))throw Error("INDICES_REPAIR_CLOCK_INVALID");
  // Backend recovery follows canonical code, independently of Lovable publish.
  // The protected publisher rechecks remote main before B2 GET or D1 write.
  // Website SHA parity remains a separate launch acceptance requirement.
  const main=await safeJson(MAIN,fetchImpl);
  if(!main.ok||main.value?.ref!=="refs/heads/main"||
     main.value.object?.type!=="commit"||
     main.value.object.sha!==env.GITHUB_SHA)
    return EMPTY("SKIPPED_CANONICAL_MAIN_NOT_CURRENT","EXACT_GITHUB_MAIN_SHA_REQUIRED");
  const gri=await safeJson(CONTROL+"/v1/public/hot-snapshot/global-risk",fetchImpl);
  if(!gri.ok)
    return Object.freeze({...EMPTY("SKIPPED_NO_CURRENT_SIGNED_GRI","PUBLIC_GRI_NOT_AVAILABLE"),
      source_readback_requests:1});
  const parent=classifyRiskIndicesRepair({griSnapshot:gri.value,indicesSnapshot:null,now:now.getTime()});
  if(!parent.eligible)
    return Object.freeze({...parent,source_readback_requests:1});
  const indices=await safeJson(CONTROL+"/v1/public/hot-snapshot/risk-indices",fetchImpl);
  const decision=classifyRiskIndicesRepair({
    griSnapshot:gri.value,indicesSnapshot:indices.ok?indices.value:null,now:now.getTime(),
  });
  if(!decision.eligible)return decision;
  if(typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<20)
    throw Error("INDICES_REPAIR_GITHUB_ACTIONS_DISPATCH_TOKEN_REQUIRED");
  // GET canonical main+verified parent+child first, THEN check dedupe metadata.
  // This public-health read never grants authorization to score a GRI.
  const recentUrl="https://api.github.com/repos/"+REPO+
    "/actions/workflows/"+TARGET+"/runs?per_page=20";
  let recentResponse;
  try{
    recentResponse=await fetchImpl(recentUrl,{
      method:"GET",redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{
        authorization:"Bearer "+env.GITHUB_TOKEN,
        accept:"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "user-agent":"Geomacro-Verified-Indices-Backstop/1.0",
      },
    });
  }catch{throw Error("INDICES_REPAIR_RUN_LOOKUP_FAILED");}
  if(recentResponse?.status!==200||recentResponse.redirected)
    throw Error("INDICES_REPAIR_RUN_LOOKUP_FAILED");
  let recentRuns;
  try{
    const data=await recentResponse.json();
    if(!Array.isArray(data?.workflow_runs)||data.workflow_runs.length>20)
      throw Error("INDICES_REPAIR_RUNS_INVALID");
    recentRuns=data.workflow_runs;
  }catch{throw Error("INDICES_REPAIR_RUN_LOOKUP_FAILED");}
  const retry=decideVerifiedIndicesPublisherRetry({
    runs:recentRuns,headSha:env.GITHUB_SHA,
    parentSourceAsOf:gri.value.source_as_of,now,
  });
  if(!retry.dispatch)return Object.freeze({
    ...decision,status:retry.status,eligible:false,
    dispatch_requested:false,
    reason:"VERIFIED_GRI_PARENT_REPAIR_DEDUPED_NO_ADDITIONAL_B2",
  });
  let response;
  try{
    response=await fetchImpl("https://api.github.com/repos/"+REPO+
      "/actions/workflows/"+TARGET+"/dispatches",{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{
        authorization:"Bearer "+env.GITHUB_TOKEN,
        accept:"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "content-type":"application/json",
        "user-agent":"Geomacro-Verified-Indices-Backstop/1.0",
      },
      body:JSON.stringify({ref:"main"}),
    });
  }catch{throw Error("INDICES_REPAIR_DISPATCH_TRANSPORT_FAILED");}
  if(response?.status!==204||response?.redirected)
    throw Error("INDICES_REPAIR_PROTECTED_DISPATCH_REJECTED");
  return Object.freeze({
    ...decision,status:retry.status==="VERIFIED_PARENT_REPAIR_SINGLE_RETRY"
      ?"PROTECTED_INDICES_REPAIR_SINGLE_RETRY_DISPATCHED"
      :"PROTECTED_INDICES_REPAIR_DISPATCHED",
    reason:"DOWNSTREAM_RECHECKS_LIVE_GRI_B2_D1_AND_SHA",
    dispatch_requested:true,source_readback_requests:2,
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const receipt=await runRiskIndicesVerifiedParentBackstop();
    // Never expose raw GRI/index JSON, original publisher data, values,
    // HTTP credentials, source identities or verified score amounts.
    console.log(JSON.stringify(receipt));
  }catch{
    console.error("INDICES_VERIFIED_GRI_BACKSTOP_REJECTED");
    process.exitCode=2;
  }
}
