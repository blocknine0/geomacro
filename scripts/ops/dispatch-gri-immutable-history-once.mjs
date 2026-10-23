#!/usr/bin/env node
/**
 * One-time protected-main wakeup for the EXISTING governed B2 immutable GRI
 * history workflow. No B2 operation, signing, new score, D1 write or funds.
 * Only a real, recent Phase-2 D1/quota preflight may enqueue. Never wake on
 * workflow_run completion of the target (prevents ping-pong).
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const SHA=/^[a-f0-9]{40}$/u;
const REPO="blocknine0/geomacro";
const PATH="artifacts/phase2-readiness/readiness.json";
const API="https://api.github.com/repos/"+REPO;
const fail=code=>{throw Error("GRI_IMMUTABLE_AUTO_WAKE_"+code)};
export function decideOneShotGriHistoryWakeup({env={},receipt,now=Date.now()}={}){
  if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!==REPO||
     env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_EVENT_NAME!=="push"||
     !SHA.test(env.GITHUB_SHA??"")||
     !Number.isFinite(now))
    return {eligible:false,reason:"NOT_PROTECTED_MAIN_PUSH"};
  if(receipt?.schema!=="geomacro.phase2-gri-recovery-readiness.v1"||
     !Number.isFinite(Date.parse(String(receipt.checked_at??"")))||
     Date.parse(receipt.checked_at)>now+5000||
     now-Date.parse(receipt.checked_at)>180000||
     receipt.phase2_inputs_preflight_complete!==true||
     receipt.historical_b2_readback_needs_governed_verification!==true||
     receipt.immutable_historical_b2_readback_now_verified!==false||
     receipt.quota_headroom_preflight_verified!==true||
     receipt.quota_allows_bounded_immutable_history_attempt!==true||
     !Number.isSafeInteger(receipt.remaining_reserved_get)||
     receipt.remaining_reserved_get<3||
     !Number.isSafeInteger(receipt.remaining_reserved_total)||
     receipt.remaining_reserved_total<4||
     receipt.next_safe_action!=="RUN_EXISTING_GRI_PINNED_VERSION_RECOVERY"||
     receipt.current_signed_publication_verified!==false||
     receipt.x402_real_money_authorized!==false||
     receipt.b2_requests!==0||receipt.b2_puts!==0||
     receipt.d1_writes!==0||receipt.payments!==0)
    return {eligible:false,reason:"PINNED_D1_OR_QUOTA_PROOF_NOT_READY"};
  return {eligible:true,reason:"GOVERNED_IMMUTABLE_HISTORY_RECHECK_ADMITTED"};
}
export async function runOneShotGriHistoryWakeup({env=process.env,
   fetcher=fetch,now=Date.now(),receipt}={}){
  if(!receipt){
    let input;
    try{input=readFileSync(PATH);if(input.length>20000)fail("RECEIPT_OVERSIZE");
      receipt=JSON.parse(input.toString("utf8"));
    }catch{fail("SIGNED_READINESS_RECEIPT_MISSING_OR_INVALID")}
  }
  const admission=decideOneShotGriHistoryWakeup({env,receipt,now});
  if(!admission.eligible)return {
    schema:"geomacro.gri-immutable-b2-one-shot-wakeup.v1",
    status:"SKIPPED",reason:admission.reason,
    current_signed_products_verified:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  };
  if(typeof env.GH_TOKEN!=="string"||env.GH_TOKEN.length<20)
    fail("GITHUB_ACTIONS_TOKEN_MISSING");
  const headers={Authorization:"Bearer "+env.GH_TOKEN,
     Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  const opts={headers,redirect:"error",signal:AbortSignal.timeout(15000)};
  // Exact SHA freshness: a superseded run cannot launch an old workflow.
  let ref;
  try{
    const r=await fetcher(API+"/git/ref/heads/main",opts);
    if(r.status!==200)fail("MAIN_SHA_READ_UNAVAILABLE");
    ref=await r.json();
  }catch{fail("MAIN_SHA_READ_UNAVAILABLE")}
  if(ref?.ref!=="refs/heads/main"||ref?.object?.sha!==env.GITHUB_SHA)
    return {
      schema:"geomacro.gri-immutable-b2-one-shot-wakeup.v1",
      status:"SKIPPED",reason:"CANONICAL_MAIN_SUPERSEDED",
      current_signed_products_verified:false,
      b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
    };
  let res;
  try{
    res=await fetcher(API+"/actions/workflows/gri-pinned-version-recovery.yml/dispatches",{
      ...opts,method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({ref:"main"}),
    });
  }catch{fail("GITHUB_DISPATCH_TRANSPORT_UNAVAILABLE")}
  if(res.status!==204)fail("GITHUB_DISPATCH_REJECTED");
  await res.body?.cancel().catch(()=>{});
  return {
    schema:"geomacro.gri-immutable-b2-one-shot-wakeup.v1",
    status:"DISPATCH_ACCEPTED_NOT_B2_READBACK",
    reason:"GOVERNED_B2_WORKFLOW_QUEUED",
    current_signed_products_verified:false,
    source_clock_changed:false,
    reviewer_signature_supplied:false,
    historical_original_bytes_verified_by_this_job:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(import.meta.url)&&
   resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runOneShotGriHistoryWakeup().then(x=>{
    console.log(JSON.stringify(x));
    if(process.env.GITHUB_STEP_SUMMARY)
      import("node:fs").then(({appendFileSync})=>
        appendFileSync(process.env.GITHUB_STEP_SUMMARY,
         "\\nGRI immutable history wakeup: "+x.status+
         " (this does NOT verify B2 or sign current GRI)\\n"));
  }).catch(e=>{
    const code=e instanceof Error&&/^GRI_IMMUTABLE_AUTO_WAKE_[A-Z0-9_]+$/.test(e.message)?
      e.message:"GRI_IMMUTABLE_AUTO_WAKE_REFUSED";
    console.error(code);process.exitCode=2;
  });
}
