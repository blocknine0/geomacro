import {fileURLToPath} from "node:url";
import {prepareGriSignedReadyCadenceHint,assertGriDispatchTarget} from
  "../lib/gri-signed-ready-cadence-hint.mjs";

const TARGET=assertGriDispatchTarget("gri-v12-supabase-free-reviewed-current.yml");
const REPO="blocknine0/geomacro";
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
     !["schedule","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)||
     !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
     env.GITHUB_SHA!==env.EXPECTED_CANONICAL_MAIN_SHA||
     typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<20)
    throw Error("GRI_SIGNED_READY_PROTECTED_RUN_REQUIRED");
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
    status:"DISPATCHED_REQUIRES_INDEPENDENT_SIGNED_GRI_PROOF",
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
  }catch{
    // Never emit unsigned candidate keys, reviewer content, secrets, or
    // raw API errors. GitHub job correctly FAILS for transport/auth trouble.
    console.error("GRI_SIGNED_READY_BACKSTOP_NOT_DISPATCHED");
    process.exitCode=2;
  }
}
