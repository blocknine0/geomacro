import {fileURLToPath} from "node:url";
import {prepareMachineIntelligenceSignedReadyHint,
  assertMachineIntelligencePublisherTarget} from
  "../lib/machine-intelligence-signed-ready-hint.mjs";
import {decideGriSignedPublisherRetry} from "./dispatch-gri-signed-ready-cadence.mjs";

// Reuse the already tested fail-closed once-only retry policy; this step
// checks GitHub metadata ONLY, not private bytes, B2, D1, signatures or money.
const REPO="blocknine0/geomacro";
const TARGET=assertMachineIntelligencePublisherTarget("intelligence-machine-current.yml");
const RECEIPT="geomacro.machine-intelligence-signed-ready-backstop.v1";
const zero=Object.freeze({published:false,signed_input_verified:false,
  b2_gets:0,d1_writes:0,supabase_writes:0,payments:0});
export async function requestMachineIntelligenceSignedReady({
  env=process.env,now=new Date(),fetchImpl=fetch,
}={}){
  const ready=prepareMachineIntelligenceSignedReadyHint({
    inputSha:env.MACHINE_INTELLIGENCE_READY_INPUT_SHA256,
    approvedAt:env.MACHINE_INTELLIGENCE_READY_APPROVED_AT,
    now,
  });
  // Without real independent externally approved pins: ZERO network calls.
  if(!ready.eligible)return {schema:RECEIPT,
    status:"SKIPPED_NO_CURRENT_EXTERNALLY_APPROVED_DUAL_SIGNED_INPUT",
    reason:ready.reason,scheduled:false,...zero};
  if(env.GITHUB_REPOSITORY!==REPO ||
     env.GITHUB_REF!=="refs/heads/main" ||
     !(["schedule","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)||
       (env.GITHUB_EVENT_NAME==="workflow_run"&&
        env.MACHINE_SOURCE_WORKFLOW_VERIFIED==="1"))||
     !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"") ||
     env.GITHUB_SHA!==env.EXPECTED_CANONICAL_MAIN_SHA ||
     typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<20)
    throw Error("MACHINE_SIGNED_READY_PROTECTED_MAIN_REQUIRED");

  const listUrl="https://api.github.com/repos/"+REPO+
    "/actions/workflows/"+TARGET+"/runs?per_page=20";
  let res;
  try{
    res=await fetchImpl(listUrl,{method:"GET",redirect:"error",
      headers:{authorization:"Bearer "+env.GITHUB_TOKEN,
        accept:"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "user-agent":"Geomacro-Machine-Intelligence-Signed-Ready-Backstop/1.0"},
      signal:AbortSignal.timeout(15000)});
  }catch{throw Error("MACHINE_SIGNED_READY_RUN_LOOKUP_FAILED")}
  if(res?.status!==200)throw Error("MACHINE_SIGNED_READY_RUN_LOOKUP_FAILED");
  let runs;
  try{
    const data=await res.json();
    if(!Array.isArray(data?.workflow_runs)||data.workflow_runs.length>20)
      throw Error("MACHINE_SIGNED_READY_BAD_RUNS");
    runs=data.workflow_runs;
  }catch{throw Error("MACHINE_SIGNED_READY_RUN_LOOKUP_FAILED")}
  const retry=decideGriSignedPublisherRetry({
    runs,headSha:env.GITHUB_SHA,
    approvedAt:env.MACHINE_INTELLIGENCE_READY_APPROVED_AT,now,
  });
  if(!retry.dispatch)return {schema:RECEIPT,
    status:"MACHINE_PUBLISHER_DEDUPED_OR_NOT_RETRYABLE",
    reason:retry.status,scheduled:false,...zero};
  // This is only a guarded workflow *request*. The protected publisher
  // rechecks separately signed Facts/Rights, source-native clocks, commercial
  // permission, exact immutable B2 bytes and D1 publish/readback.
  const url="https://api.github.com/repos/"+REPO+
    "/actions/workflows/"+TARGET+"/dispatches";
  let dispatch;
  try{
    dispatch=await fetchImpl(url,{method:"POST",redirect:"error",
      headers:{authorization:"Bearer "+env.GITHUB_TOKEN,
        accept:"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "content-type":"application/json",
        "user-agent":"Geomacro-Machine-Intelligence-Signed-Ready-Backstop/1.0"},
      signal:AbortSignal.timeout(15000),
      body:JSON.stringify({ref:"main",inputs:ready.inputs})});
  }catch{throw Error("MACHINE_SIGNED_READY_DISPATCH_TRANSPORT_FAILED")}
  if(dispatch?.status!==204)throw Error("MACHINE_SIGNED_READY_DISPATCH_REJECTED");
  return {schema:RECEIPT,scheduled:true,
    status:retry.status==="SIGNED_GRI_PUBLISHER_RETRY_ONCE_AFTER_FAILURE"?
      "DISPATCHED_SINGLE_RETRY_MUST_VERIFY_REAL_DUAL_SIGNATURES":
      "DISPATCHED_MUST_VERIFY_REAL_DUAL_SIGNATURES",
    reason:"PIN_HINT_ONLY_B2_AND_SIGNATURES_UNVERIFIED",...zero};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    console.log(JSON.stringify(await requestMachineIntelligenceSignedReady()));
  }catch{
    console.error("MACHINE_INTELLIGENCE_SIGNED_READY_BACKSTOP_FAILED_CLOSED");
    process.exitCode=2;
  }
}
