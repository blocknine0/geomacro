import {fileURLToPath} from "node:url";
import {appendFileSync} from "node:fs";
import {prepareGriSignedReadyCadenceHint,assertGriDispatchTarget,
  explainGriSignedInputBlockers,safeGriBlockerJobSummary} from
  "../lib/gri-signed-ready-cadence-hint.mjs";

const TARGET=assertGriDispatchTarget("gri-v12-supabase-free-reviewed-current.yml");
const REPO="blocknine0/geomacro";
// GitHub's successful dispatch (HTTP 204) is NOT a successful signed GRI
// publication. A failed first publisher job previously suppressed ALL
// redelivery for the same approval timestamp, stranding authentic inputs.
// Retry a failed/cancelled/timed-out publisher ONCE, only after a bounded
// cooldown and while the original externally approved SHA hint is fresh.
// Unknown run state, an active job, completed success, or 2 failed attempts
// suppress retries. This does not relax any downstream source/rights guards.
export function decideGriSignedPublisherRetry({runs,headSha,approvedAt,now}={}){
  if(!Array.isArray(runs)||!/^[a-f0-9]{40}$/u.test(headSha??"")||
     !Number.isFinite(Date.parse(approvedAt))||
     !(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("GRI_SIGNED_READY_RUN_METADATA_INVALID");
  const approvalMs=Date.parse(approvedAt);
  // The protected workflow runs on main. A newer main commit is NOT a new
  // approval or retry budget: dedupe the approval window across main SHAs.
  // Suppression is conservative; this metadata never authorizes publication.
  const matching=runs.filter(run=>
    /^[a-f0-9]{40}$/u.test(run?.head_sha??"")&&run.head_branch==="main"&&
    ["workflow_dispatch","repository_dispatch"].includes(run.event)&&
    typeof run.created_at==="string"&&
    Number.isFinite(Date.parse(run.created_at))&&
    Date.parse(run.created_at)>=approvalMs);
  if(matching.length===0)return {dispatch:true,status:"FIRST_APPROVED_SIGNED_PUBLISHER_ATTEMPT"};
  const active=new Set(["queued","in_progress","waiting","requested","pending"]);
  // Treat missing or novel status as active/unknown, never assume it failed.
  if(matching.some(run=>!run.status||active.has(run.status)||
     (run.status!=="completed")))return {
    dispatch:false,status:"SIGNED_GRI_PUBLISHER_ALREADY_RUNNING_OR_UNKNOWN",
  };
  if(matching.some(run=>run.conclusion==="success"))return {
    dispatch:false,status:"SIGNED_GRI_PUBLISHER_SUCCEEDED_NO_REPEAT",
  };
  if(matching.some(run=>!["failure","cancelled","timed_out"].includes(
    run.conclusion)))return {
    dispatch:false,status:"SIGNED_GRI_PUBLISHER_RESULT_NOT_RETRYABLE",
  };
  if(matching.length>=2)return {
    dispatch:false,status:"SIGNED_GRI_PUBLISHER_RETRY_LIMIT_REACHED",
  };
  const lastAt=Math.max(...matching.map(run=>Date.parse(run.created_at)));
  if(now.getTime()-lastAt < 8*60_000)return {
    dispatch:false,status:"SIGNED_GRI_PUBLISHER_FAILED_COOLDOWN",
  };
  return {dispatch:true,status:"SIGNED_GRI_PUBLISHER_RETRY_ONCE_AFTER_FAILURE"};
}

export async function requestGriSignedReadyCadence({
  env=process.env,now=new Date(),fetchImpl=fetch,
}={}){
  // Pure zero-credential short circuit: when no real reviewed B2 input is
  // announced, never read B2/D1 or dispatch a publication attempt.
  const ready=prepareGriSignedReadyCadenceHint({
    reviewedSha:env.GRI_READY_REVIEWED_SHA256,
    certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,
    readyAt:env.GRI_READY_APPROVED_AT,
    now,
  });
  if(!ready.eligible)return {
    schema:"geomacro.gri-signed-ready-backstop.v1",
    status:"SKIPPED_NO_CURRENT_EXTERNALLY_REVIEWED_INPUT",
    reason:ready.reason,scheduled:false,published:false,
    b2_gets:0,d1_writes:0,supabase_writes:0,payments:0,
  };
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=="refs/heads/main"||
     !(["schedule","workflow_dispatch","push"].includes(env.GITHUB_EVENT_NAME)||
       (env.GITHUB_EVENT_NAME==="workflow_run"&&
        env.GRI_SOURCE_WORKFLOW_VERIFIED==="1"))||
     !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
     env.GITHUB_SHA!==env.EXPECTED_CANONICAL_MAIN_SHA||
     typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<20)
    throw Error("GRI_SIGNED_READY_PROTECTED_RUN_REQUIRED");
  // Conservative deduplication across the existing 13/43 backstop AND the
  // new completed Auto Ingest News continuation. A metadata-only GitHub read
  // never accesses B2 or creates signed input. Any error fails closed.
  const listUrl="https://api.github.com/repos/"+REPO+
    "/actions/workflows/"+TARGET+"/runs?per_page=20";
  let listResponse;
  try{
    listResponse=await fetchImpl(listUrl,{
      method:"GET",redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{
        authorization:"Bearer "+env.GITHUB_TOKEN,
        accept:"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "user-agent":"Geomacro-GRI-Signed-Ready-Backstop/1.0",
      },
    });
  }catch{throw Error("GRI_SIGNED_READY_RECENT_RUN_LOOKUP_FAILED")}
  if(listResponse?.status!==200)throw Error("GRI_SIGNED_READY_RECENT_RUN_LOOKUP_FAILED");
  let runs;
  try{
    const parsed=await listResponse.json();
    if(!Array.isArray(parsed?.workflow_runs)||parsed.workflow_runs.length>20)
      throw Error("GRI_SIGNED_READY_RUNS_INVALID");
    runs=parsed.workflow_runs;
  }catch{throw Error("GRI_SIGNED_READY_RECENT_RUN_LOOKUP_FAILED")}
  const retry=decideGriSignedPublisherRetry({
    runs,headSha:env.GITHUB_SHA,approvedAt:env.GRI_READY_APPROVED_AT,now,
  });
  if(!retry.dispatch)return {
    schema:"geomacro.gri-signed-ready-backstop.v1",
    status:retry.status,reason:"CANONICAL_REVIEWED_GRI_PUBLISHER_DEDUPED",
    scheduled:false,published:false,
    reviewed_input_verified:false,gri_score_recomputed:false,
    b2_gets:0,d1_writes:0,supabase_writes:0,payments:0,
  };
  // GitHub only accepts the four hash-pinned B2 pointers. The downstream
  // workflow independently checks exact reviewed signatures, legally scoped
  // original content, country certificates, source clocks, B2 history, canonical
  // v1.2 numeric score, B2/D1 restore and website SHA before any promotion.
  const api="https://api.github.com/repos/"+REPO+
    "/actions/workflows/"+TARGET+"/dispatches";
  let res;
  try{
    res=await fetchImpl(api,{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{
        authorization:"Bearer "+env.GITHUB_TOKEN,
        accept:"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "content-type":"application/json",
        "user-agent":"Geomacro-GRI-Signed-Ready-Backstop/1.0",
      },
      body:JSON.stringify({ref:"main",inputs:ready.inputs}),
    });
  }catch{throw Error("GRI_SIGNED_READY_DISPATCH_TRANSPORT_FAILED")}
  if(res.status!==204)
    throw Error("GRI_SIGNED_READY_DISPATCH_REJECTED");
  return {
    schema:"geomacro.gri-signed-ready-backstop.v1",
    status:retry.status==="SIGNED_GRI_PUBLISHER_RETRY_ONCE_AFTER_FAILURE"
      ?"DISPATCHED_SINGLE_BOUNDED_RETRY_REQUIRES_SIGNED_GRI_PROOF"
      :"DISPATCHED_REQUIRES_INDEPENDENT_SIGNED_GRI_PROOF",
    reason:ready.reason,
    scheduled:true,published:false,
    reviewed_input_verified:false,
    gri_score_recomputed:false,
    b2_gets:0,d1_writes:0,supabase_writes:0,payments:0,
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const result=await requestGriSignedReadyCadence();
    console.log(JSON.stringify(result));
    // Even a successful metadata-only Actions run MUST say explicitly
    // whether this run actually published a signed numerical index.
    const report=explainGriSignedInputBlockers({
      reviewedSha:process.env.GRI_READY_REVIEWED_SHA256,
      certificatesSha:process.env.GRI_READY_CERTIFICATES_SHA256,
      readyAt:process.env.GRI_READY_APPROVED_AT,
    });
    if(process.env.GITHUB_STEP_SUMMARY){
      try{appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        safeGriBlockerJobSummary(report),"utf8");}
      catch{console.error("GRI_SIGNED_RECOVERY_SUMMARY_UNAVAILABLE");}
    }
    if(!report.externally_approved_fresh_hint_valid)
      console.log(JSON.stringify({schema:report.schema,
        current_numerical_score_verified:false,
        missing_requirements:report.missing_requirements,
        reason:report.admission_reason,
        b2_requests:0,d1_writes:0,payments:0}));
  }catch{
    // Never emit unsigned candidate keys, reviewer content, secrets, or
    // raw API errors. GitHub job correctly FAILS for transport/auth trouble.
    console.error("GRI_SIGNED_READY_BACKSTOP_NOT_DISPATCHED");
    process.exitCode=2;
  }
}
